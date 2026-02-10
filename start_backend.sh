#!/bin/bash

echo "=== Building and Starting PortAda Backend ==="
echo ""

# Build and start only backend services
docker compose up --build -d redis api

echo ""
echo "Waiting for services to start..."
sleep 5

echo ""
echo "=== Services Status ==="
docker compose ps

echo ""
echo "=== API Logs ==="
docker compose logs api --tail=50

echo ""
echo "=== Backend Ready ==="
echo "API: http://localhost:8000"
echo "Docs: http://localhost:8000/docs"
echo ""
echo "Run './portada_backend/test_api.sh' to test endpoints"
