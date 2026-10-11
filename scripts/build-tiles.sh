#!/usr/bin/env bash
#
# build-tiles.sh
#
# Converts region GeoJSON to PMTiles for efficient mobile delivery.
# Requires tippecanoe and pmtiles CLI tools.
#
# Usage:
#   ./scripts/build-tiles.sh
#
# Output:
#   tiles/               - Generated PMTiles and manifest (gitignored)
#   tiles/manifest.json  - Tile metadata and checksums
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="$PROJECT_ROOT/public/data"
OUTPUT_DIR="$PROJECT_ROOT/tiles"
TEMP_DIR="$OUTPUT_DIR/tmp"

mkdir -p "$OUTPUT_DIR" "$TEMP_DIR"

echo "==> Building PMTiles for wine regions"
echo ""

# Check dependencies
if ! command -v tippecanoe &> /dev/null; then
  echo "ERROR: tippecanoe not found. Install it first:"
  echo ""
  echo "  macOS:   brew install tippecanoe"
  echo "  Linux:   Build from source: https://github.com/felt/tippecanoe"
  echo ""
  exit 1
fi

if ! command -v pmtiles &> /dev/null; then
  echo "ERROR: pmtiles CLI not found. Install it first:"
  echo ""
  echo "  macOS:   brew install pmtiles"
  echo "  Linux:   Download from https://github.com/protomaps/go-pmtiles/releases"
  echo ""
  exit 1
fi

MANIFEST_FILE="$OUTPUT_DIR/manifest.json"
echo "{" > "$MANIFEST_FILE"
echo '  "version": "'$(date -u +%Y%m%d-%H%M%S)'",' >> "$MANIFEST_FILE"
echo '  "tiles": {' >> "$MANIFEST_FILE"

FIRST_REGION=true

# Build tiles for each region
for REGION in burgundy champagne bordeaux alsace; do
  echo "Processing $REGION..."
  
  REGION_DIR="$DATA_DIR/france/$REGION"
  
  # Find detail and hull GeoJSON files
  DETAIL_FILE=$(find "$REGION_DIR" -name "*-display-*.geojson" -o -name "*-exclusive-*.geojson" 2>/dev/null | head -1 || echo "")
  HULL_FILE=$(find "$REGION_DIR" -name "*-hulls-*.geojson" -o -name "*-dissolve-*.geojson" 2>/dev/null | head -1 || echo "")
  
  if [ -z "$DETAIL_FILE" ]; then
    echo "  Warning: No detail file found for $REGION, skipping"
    continue
  fi
  
  if [ -z "$HULL_FILE" ]; then
    echo "  Warning: No hull file found for $REGION, using detail only"
    HULL_FILE="$DETAIL_FILE"
  fi
  
  DETAIL_OUTPUT="$OUTPUT_DIR/${REGION}-detail.pmtiles"
  HULL_OUTPUT="$OUTPUT_DIR/${REGION}-hull.pmtiles"
  
  # Convert detail GeoJSON to GeoJSONSeq for tippecanoe
  jq -c '.features[]' "$DETAIL_FILE" > "$TEMP_DIR/${REGION}-detail.geojsonl"
  
  # Build detail tiles with tippecanoe
  # Key parameters:
  #   -z14: Max zoom 14 (parcel-level detail)
  #   -Z11: Min zoom 11 (only show at high zoom)
  #   -r1.5: Simplification tolerance
  #   -pk: Keep all properties (we need id, commune, insee, climat, cruLevel, etc. for hover)
  #   -l: Layer name
  #   --use-attribute-for-id=id: Use the 'id' property as feature ID for feature-state
  #   --drop-densest-as-needed: Intelligently drop features at lower zooms
  
  tippecanoe \
    -o "$DETAIL_OUTPUT" \
    -z14 -Z11 \
    -r1.5 \
    -pk \
    -l "$REGION" \
    --use-attribute-for-id=id \
    --drop-densest-as-needed \
    -P \
    "$TEMP_DIR/${REGION}-detail.geojsonl"
  
  DETAIL_SIZE=$(stat -f%z "$DETAIL_OUTPUT" 2>/dev/null || stat -c%s "$DETAIL_OUTPUT")
  DETAIL_SIZE_MB=$(echo "scale=2; $DETAIL_SIZE / 1024 / 1024" | bc)
  
  echo "  ✓ Built ${REGION}-detail.pmtiles (${DETAIL_SIZE_MB} MB)"
  
  # Build hull tiles (dissolved appellations for overview)
  jq -c '.features[]' "$HULL_FILE" > "$TEMP_DIR/${REGION}-hull.geojsonl"
  
  tippecanoe \
    -o "$HULL_OUTPUT" \
    -z11 -Z7 \
    -r2 \
    -pk \
    -l "$REGION" \
    --use-attribute-for-id=id \
    --drop-densest-as-needed \
    -P \
    "$TEMP_DIR/${REGION}-hull.geojsonl"
  
  HULL_SIZE=$(stat -f%z "$HULL_OUTPUT" 2>/dev/null || stat -c%s "$HULL_OUTPUT")
  HULL_SIZE_MB=$(echo "scale=2; $HULL_SIZE / 1024 / 1024" | bc)
  
  echo "  ✓ Built ${REGION}-hull.pmtiles (${HULL_SIZE_MB} MB)"
  
  # Create lightweight metadata GeoJSON for bounds and labels
  # This is a simplified version with just hulls and key properties
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
  
  echo "  ✓ Built ${REGION}-metadata.json (${METADATA_SIZE_KB} KB)"
  
  TOTAL_SIZE=$((DETAIL_SIZE + HULL_SIZE))
  TOTAL_SIZE_MB=$(echo "scale=2; $TOTAL_SIZE / 1024 / 1024" | bc)
  
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
  echo "        \"sizeMB\": $DETAIL_SIZE_MB" >> "$MANIFEST_FILE"
  echo "      }," >> "$MANIFEST_FILE"
  echo "      \"hull\": {" >> "$MANIFEST_FILE"
  echo "        \"file\": \"${REGION}-hull.pmtiles\"," >> "$MANIFEST_FILE"
  echo "        \"sizeBytes\": $HULL_SIZE," >> "$MANIFEST_FILE"
  echo "        \"sizeMB\": $HULL_SIZE_MB" >> "$MANIFEST_FILE"
  echo "      }," >> "$MANIFEST_FILE"
  echo "      \"metadata\": {" >> "$MANIFEST_FILE"
  echo "        \"file\": \"${REGION}-metadata.json\"," >> "$MANIFEST_FILE"
  echo "        \"sizeBytes\": $METADATA_SIZE," >> "$MANIFEST_FILE"
  echo "        \"sizeKB\": $METADATA_SIZE_KB" >> "$MANIFEST_FILE"
  echo "      }," >> "$MANIFEST_FILE"
  echo "      \"totalSizeBytes\": $TOTAL_SIZE," >> "$MANIFEST_FILE"
  echo "      \"totalSizeMB\": $TOTAL_SIZE_MB" >> "$MANIFEST_FILE"
  echo -n "    }" >> "$MANIFEST_FILE"
done

echo "" >> "$MANIFEST_FILE"
echo "  }" >> "$MANIFEST_FILE"
echo "}" >> "$MANIFEST_FILE"

# Clean up temp files
rm -rf "$TEMP_DIR"

echo ""
echo "==> Build complete!"
echo ""
echo "Output: $OUTPUT_DIR"
echo "Manifest: $MANIFEST_FILE"
echo ""
echo "To deploy to S3:"
echo ""
echo "  aws s3 sync tiles/ s3://YOUR-BUCKET/tiles/ \\"
echo "    --exclude 'manifest.json' \\"
echo "    --cache-control 'public,max-age=31536000,immutable'"
echo ""
echo "  aws s3 cp tiles/manifest.json s3://YOUR-BUCKET/tiles/manifest.json \\"
echo "    --cache-control 'public,max-age=300'"
echo ""
echo "Then set VITE_DATA_BASE_URL=https://YOUR-CDN/tiles"
