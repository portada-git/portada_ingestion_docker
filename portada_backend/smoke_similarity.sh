#!/bin/bash

# Configuration
API_URL="http://localhost:8000/api/v1/similarity"

echo "🚀 Starting Similarity Service Smoke Test..."

# 1. Get Entities
echo -e "\n1. Fetching available entities..."
curl -s "$API_URL/entities" | jq .

# 2. Get Config
echo -e "\n2. Fetching current algorithm configuration..."
curl -s "$API_URL/config" | jq .

# 3. Get Status (initial)
echo -e "\n3. Checking service status..."
curl -s "$API_URL/status" | jq .

# 4. Run Similarity (example for FLAG)
# Note: This might fail if no data is present in Delta Lake, but we want to see the error/response.
echo -e "\n4. Running similarity for 'FLAG' entity (dry run)..."
curl -s -X POST "$API_URL/run" \
     -H "Content-Type: application/json" \
     -d '{
       "entity": "FLAG",
       "citation_field": "FLAG_CITATION",
       "known_entity": "FLAG_NAME",
       "use_clean_entries": true,
       "force_refit": false
     }' | jq .

echo -e "\n✅ Smoke test request sequence completed."
