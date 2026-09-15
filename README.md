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

## Running Similarity Results in Spark/Delta

The current scalable flow writes similarity results into Delta Lake, not a monolithic JSON file. The frontend/API read the Delta tables with pagination.

Physical output path is resolved from `data_layer_config/delta_data_layer_config.json`:

```text
<base_path>/<project_data_name>/similarity_results
```

With the default config this is:

```text
./delta_lake/portada_project/similarity_results
```

### Quick path

```bash
# 1. Make sure the api container is rebuilt and running
docker compose build api
docker compose up -d api

# 2. Run one entity first for a safe validation
docker compose exec api python /app/scripts/generate_similarity_delta_results.py \
  --entities ship_type

# 3. Check generated Delta runs
curl http://localhost:8001/api/v1/similarity/runs

# 4. Query paginated results
curl "http://localhost:8001/api/v1/similarity/results?entity=ship_type&limit=50"
```

### Run all entities

```bash
docker compose exec api python /app/scripts/generate_similarity_delta_results.py
```

Available entities: `port`, `ship_type`, `flag`, `ship_tons`, `travel_duration`, `master_role`, `comodity`, `unit`.

### RAM logging while the script runs

The Delta script logs memory usage while it runs. This matters because PySpark uses both Python and JVM processes.

By default, memory is logged every 30 seconds:

```text
[memory] periodic: process_tree_rss=2.4 GiB container_usage=3.1 GiB
```

| Metric | Meaning |
|---|---|
| `process_tree_rss` | RSS of the Python process plus child processes, including Spark/JVM |
| `container_usage` | Total memory reported by Docker/cgroup for the container |

Change the interval:

```bash
docker compose exec api python /app/scripts/generate_similarity_delta_results.py \
  --entities ship_type \
  --memory-log-interval-seconds 10
```

Disable periodic memory logs:

```bash
docker compose exec api python /app/scripts/generate_similarity_delta_results.py \
  --entities ship_type \
  --memory-log-interval-seconds 0
```

### Script arguments

| Argument | Default | Description |
|---|---|---|
| `--data-layer-config` | `/app/config/delta_data_layer_config.json` | Delta Lake + Spark config |
| `--similarity-config` | `/app/config/config_similarity.json` | Similarity algorithm config |
| `--schema` | `/app/config/schema.json` | Cleaning schema |
| `--mapping` | `/app/config/mapping_to_clean_chars.json` | Char normalization mapping |
| `--known-entities` | `/app/known_entities.json` | Fallback known entities JSON |
| `--entities` | all 8 entities | Space-separated list to restrict processing |
| `--results-dir-name` | `similarity_results` | Folder under `<base_path>/<project_data_name>` |
| `--memory-log-interval-seconds` | `30` | RAM log interval; `0` disables periodic logs |

### What the Delta script does internally

1. Initializes `BoatFactCleaning` and starts Spark.
2. Reads all raw entries from Delta Lake.
3. Runs the cleaning pipeline before extracting citations.
4. For each entity, reads known voices from the existing data-layer source; it does **not** duplicate them into a `similarity_known_voices` table.
5. Runs all configured algorithms except `semantic_model`.
6. Writes Delta tables under `similarity_results`:
   - `similarity_runs`
   - `similarity_terms`
   - `similarity_entity_summaries`
   - `similarity_results`
   - `similarity_algorithm_scores`

### API endpoints for Delta similarity results

```bash
# Execution history
curl http://localhost:8001/api/v1/similarity/runs
curl http://localhost:8001/api/v1/similarity/runs/latest

# Paginated results
curl "http://localhost:8001/api/v1/similarity/results?entity=ship_type&limit=50"

# Entity-specific paginated results
curl "http://localhost:8001/api/v1/similarity/results/ship_type?limit=50"
```

Pagination uses `next_cursor` from the response:

```bash
curl "http://localhost:8001/api/v1/similarity/results?entity=ship_type&limit=50&cursor=<next_cursor>"
```

### Legacy JSON generator

The old JSON flow still exists for fallback/debugging:

```bash
docker compose exec api python /app/scripts/generate_similarity_with_datalayer.py \
  --output-dir /app/similarity_results \
  --output-file similarity_results_datalayer.json
```

For scale testing and frontend usage, prefer the Delta script above.

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
