# PortAda Ingestion — Docker Stack

Full containerized pipeline for ingesting, cleaning, and disambiguating historical maritime records from the PortAda project. Built on Spark + Delta Lake, orchestrated by Dagster, served via FastAPI, and visualized through a React/Bun frontend.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        docker-compose                           │
│                                                                 │
│  ┌──────────┐    ┌────────────────────────┐    ┌─────────────┐ │
│  │ frontend │    │  dagster_webserver     │    │   monitor   │ │
│  │ :5173    │    │  :3000                 │    │  (watchdog) │ │
│  └────┬─────┘    └───────────┬────────────┘    └──────┬──────┘ │
│       │                      │                        │        │
│  ┌────▼─────────────────────▼────────────────────────▼──────┐  │
│  │                    internal_net (bridge)                  │  │
│  └────┬─────────────────────┬────────────────────────┬──────┘  │
│       │                     │                        │         │
│  ┌────▼─────┐    ┌──────────▼─────────┐    ┌────────▼──────┐  │
│  │   api    │    │  dagster_daemon     │    │     redis     │  │
│  │  :8000   │    │  (job executor)     │    │    :6379      │  │
│  └────┬─────┘    └──────────┬─────────┘    └───────────────┘  │
│       │                     │                                  │
│  ┌────▼─────────────────────▼──────────────────────────────┐  │
│  │              Delta Lake  (./delta_lake volume)           │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Services

| Service | Image | Port | Role |
|---|---|---|---|
| `frontend` | nginx:alpine (built with bun) | `5173` | React UI — ingestion status, similarity results |
| `api` | python:3.12-slim + Spark | `8000` | FastAPI — REST endpoints, similarity generation |
| `dagster_webserver` | apache/spark:3.5.3 | `3000` | Dagster UI — pipeline control |
| `dagster_daemon` | apache/spark:3.5.3 | — | Background job runner |
| `monitor` | python:3.12-slim | — | Watchdog — detects new files in `ingestion_zone/` and triggers Dagster jobs |
| `redis` | redis:7-alpine | `6379` | File status tracking (processing / error / done) |

---

## Prerequisites

- Docker + Docker Compose v2
- On Linux: Docker daemon DNS configured (see [DNS fix](#dns-issues-on-linux) below)

---

## Quick Start

```bash
# 1. Clone and enter the project
git clone <repo-url>
cd portada_ingestion_docker

# 2. Start all services
docker compose up -d

# 3. Access the interfaces
open http://localhost:5173       # Frontend
open http://localhost:8000/docs  # API (Swagger)
open http://localhost:3000       # Dagster UI
```

---

## Volumes & Persistent Data

| Host path | Container path | Purpose |
|---|---|---|
| `./delta_lake` | `/app/delta_lake` | Delta Lake tables (raw, clean, entities) |
| `./ingestion_zone` | `/app/ingestion` | Drop zone — files placed here trigger ingestion |
| `./data_layer_config` | `/app/config` | Runtime config (Delta, similarity, schema, mapping) |
| `./dades_persistents` | `/opt/dagster/dagster_home` | Dagster run history and schedules |

---

## Ingestion Flow

1. Drop a JSON file into `ingestion_zone/ship_entries/`, `ingestion_zone/entity/`, or `ingestion_zone/reviewed_entries/`
2. The `monitor` service detects the file and submits a Dagster job via GraphQL
3. Dagster reads the file, runs the ingestion asset, writes to Delta Lake, updates Redis status
4. The `api` exposes the ingested data via REST endpoints

---

## Configuration Files (`data_layer_config/`)

| File | Purpose |
|---|---|
| `delta_data_layer_config.json` | Spark + Delta Lake connection config |
| `config_similarity.json` | Algorithms and entity config for `portada-s-index` |
| `schema.json` | Cleaning schema for `BoatFactCleaning` |
| `mapping_to_clean_chars.json` | Character normalization mapping |

---

## Running the Disambiguation Script

The script `portada_backend/scripts/generate_similarity_with_datalayer.py` reads raw entries from Delta Lake, runs multi-algorithm similarity scoring via `portada-s-index`, and writes results to JSON. The API and frontend consume that JSON.

### Step-by-step

```bash
# 1. Make sure the api container is running
docker compose up -d api

# 2. Copy config files into the container (only needed once, or after config changes)
docker cp data_layer_config/delta_data_layer_config.json \
  portada_ingestion_docker-api-1:/app/config/delta_data_layer_config.json

docker cp data_layer_config/config_similarity.json \
  portada_ingestion_docker-api-1:/app/config/config_similarity.json

docker cp data_layer_config/schema.json \
  portada_ingestion_docker-api-1:/app/config/schema.json

docker cp data_layer_config/mapping_to_clean_chars.json \
  portada_ingestion_docker-api-1:/app/config/mapping_to_clean_chars.json

# 3. Copy the script into the container
docker cp portada_backend/scripts/generate_similarity_with_datalayer.py \
  portada_ingestion_docker-api-1:/tmp/generate_similarity_with_datalayer.py

# 4. Run the full disambiguation (all entities)
docker exec -it portada_ingestion_docker-api-1 python \
  /tmp/generate_similarity_with_datalayer.py \
  --output-dir /app/similarity_results \
  --output-file similarity_results_datalayer.json
```

Results are written to `/app/similarity_results/similarity_results_datalayer.json` inside the container, which is the path the API reads. They are also visible in the frontend at `http://localhost:5173/similarity-results`.

### Run only specific entities

```bash
docker exec -it portada_ingestion_docker-api-1 python \
  /tmp/generate_similarity_with_datalayer.py \
  --output-dir /app/similarity_results \
  --output-file similarity_results_datalayer.json \
  --entities port flag ship_type
```

Available entities: `port`, `ship_type`, `flag`, `ship_tons`, `travel_duration`, `master_role`, `comodity`, `unit`

### Script arguments

| Argument | Default | Description |
|---|---|---|
| `--data-layer-config` | `/app/config/delta_data_layer_config.json` | Delta Lake + Spark config |
| `--similarity-config` | `/app/config/config_similarity.json` | Similarity algorithm config |
| `--schema` | `/app/config/schema.json` | Cleaning schema |
| `--mapping` | `/app/config/mapping_to_clean_chars.json` | Char normalization mapping |
| `--output-dir` | `/tmp/similarity_results` | Output directory |
| `--output-file` | `similarity_results_datalayer.json` | Output filename |
| `--known-entities` | `/app/known_entities.json` | Fallback known entities JSON |
| `--entities` | all 8 entities | Space-separated list to restrict processing |

### What the script does internally

1. Initializes `BoatFactCleaning` (py-portada-data-layer) and starts a Spark session
2. Reads all raw entries from Delta Lake with `force_all=True` (bypasses stale state parquet)
3. Runs the cleaning pipeline in memory (no writes to Delta)
4. For each entity: reads known canonical voices from Delta (falls back to `known_entities.json`), extracts citations from the cleaned entries, runs `SimilarityService.evaluate()` with all configured algorithms
5. Writes a single aggregated JSON with results per entity

---

## Giving More Memory to a Container

Spark is memory-hungry. If the disambiguation script crashes with OOM or Spark errors, increase the memory limit for the `api` service in `docker-compose.yml`:

```yaml
services:
  api:
    build:
      context: .
      dockerfile: portada_backend/Dockerfile
    deploy:
      resources:
        limits:
          memory: 8g        # hard cap — container is killed if exceeded
        reservations:
          memory: 4g        # soft guarantee — scheduler won't place it on a node with less
```

You can also tune Spark's own memory settings via environment variables in the same service:

```yaml
    environment:
      - PYSPARK_SUBMIT_ARGS=--driver-memory 4g --executor-memory 4g ...
```

Apply changes with:

```bash
docker compose up -d --force-recreate api
```

> On Linux, Docker uses the host's cgroups directly — there is no intermediate VM, so the limits are enforced by the kernel. On Windows/macOS, Docker Desktop has a global memory cap set in its settings (Resources → Memory) that takes precedence over per-container limits.

---

## Useful Commands

```bash
# Follow logs of all services
docker compose logs -f

# Follow logs of a specific service
docker compose logs -f api

# Open a shell inside the api container
docker exec -it portada_ingestion_docker-api-1 bash

# Rebuild a single service without cache
docker compose build --no-cache api
docker compose up -d api

# Rebuild everything
docker compose down
docker compose build --no-cache
docker compose up -d

# Check Redis file statuses
docker exec -it portada_ingestion_docker-redis-1 redis-cli -n 2 keys "*"
```

---

## DNS Issues on Linux

Docker on Linux does not inherit DNS from the host automatically when `systemd-resolved` is in use (the host DNS lives at `127.0.0.53`, which is a loopback address containers cannot reach). This makes `apt-get update` fail during image builds.

Fix: configure explicit DNS resolvers in the Docker daemon.

```bash
sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
  "dns": ["8.8.8.8", "8.8.4.4"]
}
EOF

sudo systemctl restart docker
```

Then rebuild:

```bash
docker compose build --no-cache
docker compose up -d
```

---

## Frontend Not Loading (UFW + Docker on Linux)

If the frontend container is running but `http://localhost:5173` hangs, `ufw-docker` is likely blocking traffic to Docker bridge networks.

```bash
# Allow the published port
sudo ufw allow 5173/tcp

# Allow routing to the Docker internal network
sudo ufw route allow proto tcp from any to 172.18.0.0/16 port 80

sudo ufw reload
```

---

## Project Structure

```
portada_ingestion_docker/
├── docker-compose.yml          # Main stack definition
├── data_layer_config/          # Runtime config files (mounted into containers)
├── delta_lake/                 # Delta Lake storage (persisted on host)
├── ingestion_zone/             # Drop zone for new files
│   ├── ship_entries/
│   ├── entity/
│   └── reviewed_entries/
├── portada_backend/            # FastAPI service
│   ├── Dockerfile
│   ├── app/                    # FastAPI routes and logic
│   ├── scripts/
│   │   └── generate_similarity_with_datalayer.py
│   └── similarity_results/     # Output of disambiguation script
├── dagster/                    # Dagster definitions and assets
│   ├── Dockerfile
│   ├── definitions.py
│   └── workspace.yaml
├── monitor/                    # File watchdog service
│   ├── Dockerfile
│   └── main_monitor_up.py
├── frontend/                   # React + Vite + Bun frontend
│   ├── Dockerfile
│   ├── nginx.conf
│   └── src/
├── portada-s-index/            # Similarity library (portada-s-index)
└── dades_persistents/          # Dagster persistent state
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/queries/gaps` | Missing date ranges in the dataset |
| `GET` | `/api/v1/queries/entries/count` | Total entry count |
| `GET` | `/api/v1/queries/entities` | Entity catalog |
| `GET` | `/api/v1/queries/publications` | Publication list |
| `GET` | `/api/v1/audit/duplicates/metadata` | Duplicate metadata summary |
| `GET` | `/api/v1/audit/duplicates/records/{log_id}` | Duplicate record detail |
| `GET` | `/api/v1/audit/storage` | Storage audit |
| `GET` | `/api/v1/audit/process` | Process audit |

Full interactive docs: `http://localhost:8000/docs`
