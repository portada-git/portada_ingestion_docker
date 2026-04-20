#!/bin/bash

echo "=== Testing PortAda API ==="
echo ""

# Health check
echo "1. Health Check:"
curl -s http://localhost:8000/api/v1/health | jq .
echo ""

# Get publications
echo "2. Get Publications:"
curl -s http://localhost:8000/api/v1/queries/publications | jq .
echo ""

# Get known entities
echo "3. Get Known Entities:"
curl -s http://localhost:8000/api/v1/queries/entities | jq .
echo ""

# Get missing dates (example with DB publication)
echo "4. Get Missing Dates (DB, 2023-01-01 to 2023-01-31):"
curl -s "http://localhost:8000/api/v1/queries/gaps?publication=db&start_date=2023-01-01&end_date=2023-01-31" | jq .
echo ""

# Get duplicates metadata
echo "5. Get Duplicates Metadata:"
curl -s http://localhost:8000/api/v1/audit/duplicates/metadata | jq .
echo ""

# Get storage audit
echo "6. Get Storage Audit:"
curl -s http://localhost:8000/api/v1/audit/storage | jq .
echo ""

# Get process audit
echo "7. Get Process Audit:"
curl -s http://localhost:8000/api/v1/audit/process | jq .
echo ""

echo "=== Tests Complete ==="
