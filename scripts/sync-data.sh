#!/usr/bin/env bash
set -euo pipefail

# Sync runtime GeoJSON data from S3 before deployment
# Usage: DATA_BUCKET=my-bucket-name ./scripts/sync-data.sh

if [ -z "${DATA_BUCKET:-}" ]; then
  echo "ERROR: DATA_BUCKET environment variable is required"
  echo "Usage: DATA_BUCKET=my-bucket-name ./scripts/sync-data.sh"
  exit 1
fi

echo "🔄 Syncing runtime GeoJSON data from S3..."
echo "   Source: s3://${DATA_BUCKET}/public-data/"
echo "   Destination: public/data/"

# Sync all files from S3
aws s3 sync "s3://${DATA_BUCKET}/public-data/" public/data/ \
  --exclude "*" \
  --include "france/**/*.geojson" \
  --no-progress

echo "✅ Sync complete"
echo ""
echo "🔍 Verifying required runtime files..."

# List of 8 files the app fetches at runtime (from MapView, BurgundyPage, ChampagnePage, AlsacePage)
REQUIRED_FILES=(
  "public/data/france/bordeaux/bordeaux-display-exclusive-2026.geojson"
  "public/data/france/bordeaux/bordeaux-display-cadillac-dissolve-trial-2026.geojson"
  "public/data/france/burgundy/burgundy-display-exclusive-2026.geojson"
  "public/data/france/burgundy/burgundy-display-hulls-2026.geojson"
  "public/data/france/champagne/champagne-opendatawine-display-2026.geojson"
  "public/data/france/champagne/champagne-opendatawine-hulls-2026.geojson"
  "public/data/france/alsace/alsace-display-2026.geojson"
  "public/data/france/alsace/alsace-display-hulls-2026.geojson"
)

MISSING_FILES=()

for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    MISSING_FILES+=("$file")
    echo "   ✗ Missing: $file"
  else
    SIZE=$(du -h "$file" | cut -f1)
    echo "   ✓ Found: $file ($SIZE)"
  fi
done

if [ ${#MISSING_FILES[@]} -gt 0 ]; then
  echo ""
  echo "❌ ERROR: ${#MISSING_FILES[@]} required file(s) missing"
  echo ""
  echo "The app will fail at runtime without these files."
  echo "Verify that all required files are present in s3://${DATA_BUCKET}/public-data/"
  exit 1
fi

echo ""
echo "✅ All 8 required runtime files present"
echo "   Ready for Docker build and deployment"
