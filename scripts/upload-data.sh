#!/usr/bin/env bash
set -euo pipefail

# Upload runtime GeoJSON data to S3
# Usage: DATA_BUCKET=my-bucket-name ./scripts/upload-data.sh

if [ -z "${DATA_BUCKET:-}" ]; then
  echo "ERROR: DATA_BUCKET environment variable is required"
  echo "Usage: DATA_BUCKET=my-bucket-name ./scripts/upload-data.sh"
  exit 1
fi

if [ ! -d "public/data" ]; then
  echo "ERROR: public/data directory not found"
  echo "Run data build scripts first to generate the GeoJSON files"
  exit 1
fi

echo "📤 Uploading runtime GeoJSON data to S3..."
echo "   Source: public/data/"
echo "   Destination: s3://${DATA_BUCKET}/public-data/"

# Upload all GeoJSON files
aws s3 sync public/data/ "s3://${DATA_BUCKET}/public-data/" \
  --exclude "*" \
  --include "france/**/*.geojson" \
  --content-type "application/geo+json" \
  --cache-control "public, max-age=31536000, immutable" \
  --no-progress

echo ""
echo "✅ Upload complete"
echo ""
echo "📋 Uploaded files:"
aws s3 ls "s3://${DATA_BUCKET}/public-data/france/" --recursive --human-readable | grep "\.geojson$"
