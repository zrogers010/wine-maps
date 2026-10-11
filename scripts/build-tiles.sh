#!/usr/bin/env bash
#
# build-tiles.sh
#
# Converts region GeoJSON to PMTiles for efficient mobile delivery.
# Requires tippecanoe, pmtiles CLI, and jq.
#
# Usage:
#   ./scripts/build-tiles.sh [--size-budget-mb SIZE]
#
# Options:
#   --size-budget-mb SIZE    Max MB per region (default: 5)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="$PROJECT_ROOT/public/data"
OUTPUT_BASE="$PROJECT_ROOT/tiles"
SIZE_BUDGET_MB=5

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --size-budget-mb)
      SIZE_BUDGET_MB="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

SIZE_BUDGET_BYTES=$((SIZE_BUDGET_MB * 1024 * 1024))

echo "==> Building PMTiles for wine regions"
echo "    Size budget: ${SIZE_BUDGET_MB} MB per region"
echo ""

# Check dependencies
for cmd in tippecanoe pmtiles jq; do
  if ! command -v $cmd &> /dev/null; then
    echo "ERROR: $cmd not found. Install it first:"
    echo ""
    echo "  macOS:   brew install tippecanoe pmtiles jq"
    echo "  Linux:"
    echo "    - tippecanoe: Build from https://github.com/felt/tippecanoe"
    echo "    - pmtiles: Download from https://github.com/protomaps/go-pmtiles/releases"
    echo "    - jq: sudo apt-get install jq"
    echo ""
    exit 1
  fi
done

# Create version hash from current timestamp
VERSION=$(date -u +%Y%m%d-%H%M%S)
OUTPUT_DIR="$OUTPUT_BASE/$VERSION"
TEMP_DIR="$OUTPUT_DIR/tmp"

mkdir -p "$OUTPUT_DIR" "$TEMP_DIR"

MANIFEST_FILE="$OUTPUT_DIR/manifest.json"
echo "{" > "$MANIFEST_FILE"
echo "  \"version\": \"$VERSION\"," >> "$MANIFEST_FILE"
echo "  \"tiles\": {" >> "$MANIFEST_FILE"

FIRST_REGION=true
ANY_OVER_BUDGET=false

# Build tiles for each region
for REGION in burgundy champagne bordeaux alsace; do
  echo "Processing $REGION..."
  
  REGION_DIR="$DATA_DIR/france/$REGION"
  
  # Find detail and hull GeoJSON files
  DETAIL_FILE=$(find "$REGION_DIR" -name "*-display-*.geojson" -o -name "*-exclusive-*.geojson" 2>/dev/null | head -1 || echo "")
  HULL_FILE=$(find "$REGION_DIR" -name "*-hulls-*.geojson" -o -name "*-dissolve-*.geojson" 2>/dev/null | head -1 || echo "")
  
  if [ -z "$DETAIL_FILE" ]; then
    echo "  ⚠ No detail file found for $REGION, skipping"
    continue
  fi
  
  if [ -z "$HULL_FILE" ]; then
    echo "  ⚠ No hull file found for $REGION, using detail only"
    HULL_FILE="$DETAIL_FILE"
  fi
  
  DETAIL_OUTPUT="$OUTPUT_DIR/${REGION}-detail.pmtiles"
  HULL_OUTPUT="$OUTPUT_DIR/${REGION}-hull.pmtiles"
  
  # Convert detail GeoJSON to GeoJSONSeq for tippecanoe
  jq -c '.features[]' "$DETAIL_FILE" > "$TEMP_DIR/${REGION}-detail.geojsonl"
  
  # Build detail tiles with tippecanoe
  # IMPORTANT: -l sets the source-layer name, must match getSourceLayer() in src/utils/pmtiles.ts
  # Feature IDs are handled by promoteId in MapLibre; all properties kept by default
  tippecanoe \
    -o "$DETAIL_OUTPUT" \
    -z14 -Z11 \
    -r1 \
    -l "$REGION" \
    --drop-densest-as-needed \
    -P \
    "$TEMP_DIR/${REGION}-detail.geojsonl" 2>&1 | grep -v "^For layer" || true
  
  DETAIL_SIZE=$(stat -f%z "$DETAIL_OUTPUT" 2>/dev/null || stat -c%s "$DETAIL_OUTPUT")
  DETAIL_SIZE_MB=$(echo "scale=2; $DETAIL_SIZE / 1024 / 1024" | bc)
  
  echo "  ✓ detail.pmtiles: ${DETAIL_SIZE_MB} MB"
  
  # Build hull tiles (dissolved appellations for overview)
  jq -c '.features[]' "$HULL_FILE" > "$TEMP_DIR/${REGION}-hull.geojsonl"
  
  # IMPORTANT: -l sets the source-layer name, must match getSourceLayer() in src/utils/pmtiles.ts
  # Feature IDs are handled by promoteId in MapLibre; all properties kept by default
  tippecanoe \
    -o "$HULL_OUTPUT" \
    -z11 -Z7 \
    -r2 \
    -l "$REGION" \
    --drop-densest-as-needed \
    -P \
    "$TEMP_DIR/${REGION}-hull.geojsonl" 2>&1 | grep -v "^For layer" || true
  
  HULL_SIZE=$(stat -f%z "$HULL_OUTPUT" 2>/dev/null || stat -c%s "$HULL_OUTPUT")
  HULL_SIZE_MB=$(echo "scale=2; $HULL_SIZE / 1024 / 1024" | bc)
  
  echo "  ✓ hull.pmtiles: ${HULL_SIZE_MB} MB"
  
  # Create lightweight metadata GeoJSON for bounds and labels
  METADATA_OUTPUT="$OUTPUT_DIR/${REGION}-metadata.json"
  jq '{
    type: "FeatureCollection",
    features: [.features[] | {
      type: "Feature",
      id: .id,
      properties: {
        id: .properties.id,
        name: .properties.name
      },
      geometry: .geometry
    }]
  }' "$HULL_FILE" > "$METADATA_OUTPUT"
  
  METADATA_SIZE=$(stat -f%z "$METADATA_OUTPUT" 2>/dev/null || stat -c%s "$METADATA_OUTPUT")
  METADATA_SIZE_KB=$(echo "scale=1; $METADATA_SIZE / 1024" | bc)
  
  echo "  ✓ metadata.json: ${METADATA_SIZE_KB} KB"
  
  TOTAL_SIZE=$((DETAIL_SIZE + HULL_SIZE))
  TOTAL_SIZE_MB=$(echo "scale=2; $TOTAL_SIZE / 1024 / 1024" | bc)
  
  echo "  → Total: ${TOTAL_SIZE_MB} MB"
  
  # Check budget
  if [ $TOTAL_SIZE -gt $SIZE_BUDGET_BYTES ]; then
    echo "  ⚠️  OVER BUDGET: ${TOTAL_SIZE_MB} MB > ${SIZE_BUDGET_MB} MB"
    ANY_OVER_BUDGET=true
  fi
  
  echo ""
  
  # Add to manifest
  if [ "$FIRST_REGION" = true ]; then
    FIRST_REGION=false
  else
    echo "," >> "$MANIFEST_FILE"
  fi
  
  echo "    \"$REGION\": {" >> "$MANIFEST_FILE"
  echo "      \"detail\": {" >> "$MANIFEST_FILE"
  echo "        \"file\": \"${REGION}-detail.pmtiles\"," >> "$MANIFEST_FILE"
  echo "        \"sizeBytes\": $DETAIL_SIZE," >> "$MANIFEST_FILE"
  echo "        \"sizeMB\": \"$DETAIL_SIZE_MB\"" >> "$MANIFEST_FILE"
  echo "      }," >> "$MANIFEST_FILE"
  echo "      \"hull\": {" >> "$MANIFEST_FILE"
  echo "        \"file\": \"${REGION}-hull.pmtiles\"," >> "$MANIFEST_FILE"
  echo "        \"sizeBytes\": $HULL_SIZE," >> "$MANIFEST_FILE"
  echo "        \"sizeMB\": \"$HULL_SIZE_MB\"" >> "$MANIFEST_FILE"
  echo "      }," >> "$MANIFEST_FILE"
  echo "      \"metadata\": {" >> "$MANIFEST_FILE"
  echo "        \"file\": \"${REGION}-metadata.json\"," >> "$MANIFEST_FILE"
  echo "        \"sizeBytes\": $METADATA_SIZE," >> "$MANIFEST_FILE"
  echo "        \"sizeKB\": \"$METADATA_SIZE_KB\"" >> "$MANIFEST_FILE"
  echo "      }," >> "$MANIFEST_FILE"
  echo "      \"totalSizeBytes\": $TOTAL_SIZE," >> "$MANIFEST_FILE"
  echo "      \"totalSizeMB\": \"$TOTAL_SIZE_MB\"" >> "$MANIFEST_FILE"
  echo -n "    }" >> "$MANIFEST_FILE"
done

echo "" >> "$MANIFEST_FILE"
echo "  }" >> "$MANIFEST_FILE"
echo "}" >> "$MANIFEST_FILE"

# Clean up temp files
rm -rf "$TEMP_DIR"

# Copy manifest to current/ as a real file (not symlink) for dev server
mkdir -p "$OUTPUT_BASE/current"
cp "$MANIFEST_FILE" "$OUTPUT_BASE/current/manifest.json"

echo "==> Build complete!"
echo ""
echo "Output: $OUTPUT_DIR"
echo "Manifest: $MANIFEST_FILE"
echo "Current: $OUTPUT_BASE/current/manifest.json"
echo ""

if [ "$ANY_OVER_BUDGET" = true ]; then
  echo "❌ ERROR: One or more regions exceeded ${SIZE_BUDGET_MB} MB budget"
  echo ""
  echo "To fix:"
  echo "  - Increase simplification: -r1.5 → -r2.5"
  echo "  - Reduce max zoom: -z14 → -z13"
  echo "  - Drop more features: --drop-rate=1.5"
  echo ""
  exit 1
fi

echo "✅ All regions within ${SIZE_BUDGET_MB} MB budget"

