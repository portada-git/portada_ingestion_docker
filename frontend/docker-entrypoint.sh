#!/bin/sh

# Replace env vars in JavaScript files
echo "Injecting runtime environment variables..."

# Default value if not set
API_BASE_URL=${VITE_API_BASE_URL:-"http://localhost:8000/api/v1"}

echo "API_BASE_URL: $API_BASE_URL"

# Find all JavaScript files and replace the placeholder
find /usr/share/nginx/html -type f -name "*.js" -exec sed -i "s|__VITE_API_BASE_URL__|$API_BASE_URL|g" {} \;

echo "Environment variables injected successfully"

# Start nginx
exec nginx -g 'daemon off;'
