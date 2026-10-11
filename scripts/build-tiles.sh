#!/bin/bash
set -e

# PMTiles tile builder for wine regions
# Converts GeoJSON to PMTiles vector tiles with tippecanoe
# Usage: ./scripts/build-tiles.sh [--size-budget-mb MB] [--metadata-budget-kb KB]

# Parse arguments
SIZE_BUDGET_MB=5
METADATA_BUDGET_KB=300

while [[ $# -gt 0 ]]; do
  case $1 in
    --size-budget-mb)
      SIZE_BUDGET_MB="$2"
      shift 2
      ;;
    --metadata-budget-kb)
      METADATA_BUDGET_KB="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "==> Building PMTiles for wine regions"
echo "Region budget: ${SIZE_BUDGET_MB} MB"
echo "Metadata budget: ${METADATA_BUDGET_KB} KB"
echo ""

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_ROOT/src/data"
OUTPUT_BASE="$PROJECT_ROOT/tiles"
VERSION=$(date -u +"%Y%m%d-%H%M%S")
OUTPUT_DIR="$OUTPUT_BASE/$VERSION"
TEMP_DIR="$OUTPUT_BASE/.tmp-$$"
MANIFEST_FILE="$OUTPUT_DIR/manifest.json"

# Create output directories
mkdir -p "$OUTPUT_DIR"
mkdir -p "$TEMP_DIR"

# Size budget in bytes
SIZE_BUDGET_BYTES=$((SIZE_BUDGET_MB * 1024 * 1024))
METADATA_BUDGET_BYTES=$((METADATA_BUDGET_KB * 1024))

# Start manifest
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
  METADATA_OUTPUT="$OUTPUT_DIR/${REGION}-metadata.json"
  
  # Copy feature.id to properties.id and strip top-level id to avoid tippecanoe warnings
  TEMP_DETAIL_WITH_PROP_ID="$TEMP_DIR/${REGION}-detail-with-prop-id.geojson"
  jq '.features |= map(
    .properties.id = (.id // .properties.id) |
    del(.id)
  )' "$DETAIL_FILE" > "$TEMP_DETAIL_WITH_PROP_ID"
  
  TEMP_HULL_WITH_PROP_ID="$TEMP_DIR/${REGION}-hull-with-prop-id.geojson"
  jq '.features |= map(
    .properties.id = (.id // .properties.id) |
    del(.id)
  )' "$HULL_FILE" > "$TEMP_HULL_WITH_PROP_ID"
  
  # Convert detail GeoJSON to GeoJSONSeq for tippecanoe
  jq -c '.features[]' "$TEMP_DETAIL_WITH_PROP_ID" > "$TEMP_DIR/${REGION}-detail.geojsonl"
  
  # Count input features
  DETAIL_INPUT_COUNT=$(wc -l < "$TEMP_DIR/${REGION}-detail.geojsonl" | tr -d ' ')
  
  # Build detail tiles with tippecanoe
  # IMPORTANT: -l sets the source-layer name, must match getSourceLayer() in src/utils/pmtiles.ts
  # Feature IDs via promoteId in MapLibre; properties kept by default
  # maxzoom 15 for high-fidelity parcel/climat boundaries
  # -r1 prevents feature dropping at intermediate zooms
  # --coalesce-densest-as-needed preserves features while managing tile size
  # --detect-shared-borders and --no-simplification-of-shared-nodes keep boundaries accurate
  tippecanoe \
    -o "$DETAIL_OUTPUT" \
    -z15 -Z11 \
    -r1 \
    -l "$REGION" \
    --coalesce-densest-as-needed \
    --detect-shared-borders \
    --no-simplification-of-shared-nodes \
    -P \
    "$TEMP_DIR/${REGION}-detail.geojsonl" 2>&1 | grep -v "^For layer" || true
  
  DETAIL_SIZE=$(stat -f%z "$DETAIL_OUTPUT" 2>/dev/null || stat -c%s "$DETAIL_OUTPUT")
  DETAIL_SIZE_MB=$(echo "scale=2; $DETAIL_SIZE / 1024 / 1024" | bc)
  
  echo "  ✓ detail.pmtiles: ${DETAIL_SIZE_MB} MB (input: $DETAIL_INPUT_COUNT features)"
  
  # Build hull tiles (dissolved appellations for overview)
  jq -c '.features[]' "$TEMP_HULL_WITH_PROP_ID" > "$TEMP_DIR/${REGION}-hull.geojsonl"
  
  # IMPORTANT: -l sets the source-layer name, must match getSourceLayer() in src/utils/pmtiles.ts
  # Feature IDs via promoteId in MapLibre; properties kept by default
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
  
  # Create lightweight metadata JSON: only bboxes and label points
  # Structure: { type: "FeatureCollection", bbox: [w,s,e,n], features: [{ properties, labelPoint, bbox }] }
  echo "  Building metadata..."
  node -e "
    const fs = require('fs');
    const turf = require('@turf/turf');
    const hull = JSON.parse(fs.readFileSync('$TEMP_HULL_WITH_PROP_ID', 'utf8'));
    
    // Compute overall bbox
    const overallBbox = turf.bbox(hull);
    
    // Group by id and process each feature
    const byId = new Map();
    for (const feature of hull.features) {
      const id = feature.properties.id;
      if (!id) continue;
      
      const existing = byId.get(id);
      const area = turf.area(feature);
      
      if (!existing || area > existing.area) {
        byId.set(id, { feature, area });
      }
    }
    
    // Create metadata features with bbox and labelPoint
    const features = Array.from(byId.values()).map(({ feature }) => {
      const id = feature.properties.id;
      const name = feature.properties.name || id;
      const centroid = turf.centroid(feature);
      const featureBbox = turf.bbox(feature);
      
      // Extract properties that label/legend code might need
      const metadata = {
        type: 'Feature',
        properties: {
          id,
          name,
          // Include other properties if they exist (commune, insee, cruLevel, etc)
          ...(feature.properties.commune ? { commune: feature.properties.commune } : {}),
          ...(feature.properties.insee ? { insee: feature.properties.insee } : {}),
          ...(feature.properties.cruLevel ? { cruLevel: feature.properties.cruLevel } : {}),
          ...(feature.properties.climat ? { climat: feature.properties.climat } : {}),
        },
        labelPoint: centroid.geometry.coordinates,
        bbox: featureBbox,
        geometry: centroid.geometry
      };
      
      return metadata;
    });
    
    const metadata = {
      type: 'FeatureCollection',
      bbox: overallBbox,
      features
    };
    
    fs.writeFileSync('$METADATA_OUTPUT', JSON.stringify(metadata, null, 2));
    console.log('  ✓ Metadata generated with', features.length, 'features');
  " || {
    echo "  ❌ ERROR: Node.js metadata extraction failed"
    echo "     Ensure node and @turf/turf are available"
    exit 1
  }
  
  METADATA_SIZE=$(stat -f%z "$METADATA_OUTPUT" 2>/dev/null || stat -c%s "$METADATA_OUTPUT")
  METADATA_SIZE_KB=$(echo "scale=1; $METADATA_SIZE / 1024" | bc)
  
  echo "  ✓ metadata.json: ${METADATA_SIZE_KB} KB"
  
  # Check metadata budget
  if [ $METADATA_SIZE -gt $METADATA_BUDGET_BYTES ]; then
    echo "  ⚠️  METADATA OVER BUDGET: ${METADATA_SIZE_KB} KB > ${METADATA_BUDGET_KB} KB"
    ANY_OVER_BUDGET=true
  fi
  
  # Verify no features were dropped at max zoom
  echo "  Checking feature completeness..."
  
  # Get input IDs
  jq -r '.features[].properties.id' "$TEMP_DETAIL_WITH_PROP_ID" | sort -u > "$TEMP_DIR/${REGION}-input-ids.txt"
  INPUT_ID_COUNT=$(wc -l < "$TEMP_DIR/${REGION}-input-ids.txt" | tr -d ' ')
  
  # Get output IDs from max zoom tiles
  # Use tippecanoe-decode to extract features at z15
  if command -v tippecanoe-decode &> /dev/null; then
    tippecanoe-decode "$DETAIL_OUTPUT" 15 2>/dev/null | \
      jq -r 'select(.properties.id != null) | .properties.id' | \
      sort -u > "$TEMP_DIR/${REGION}-output-ids.txt" 2>/dev/null || echo "" > "$TEMP_DIR/${REGION}-output-ids.txt"
    
    OUTPUT_ID_COUNT=$(wc -l < "$TEMP_DIR/${REGION}-output-ids.txt" | tr -d ' ')
    
    if [ "$OUTPUT_ID_COUNT" -gt 0 ]; then
      echo "  → Features: input $INPUT_ID_COUNT, at z15: $OUTPUT_ID_COUNT"
      
      if [ "$OUTPUT_ID_COUNT" -lt "$INPUT_ID_COUNT" ]; then
        MISSING_COUNT=$((INPUT_ID_COUNT - OUTPUT_ID_COUNT))
        echo "  ⚠️  FEATURES DROPPED: $MISSING_COUNT features missing at max zoom"
        
        # Show which IDs were dropped
        comm -23 "$TEMP_DIR/${REGION}-input-ids.txt" "$TEMP_DIR/${REGION}-output-ids.txt" | head -5 | while read id; do
          echo "     Missing: $id"
        done
        
        ANY_OVER_BUDGET=true
      fi
    else
      echo "  → Features: input $INPUT_ID_COUNT (output verification skipped)"
    fi
  else
    echo "  → Features: input $INPUT_ID_COUNT (tippecanoe-decode not available for verification)"
  fi
  
  # Total size includes tiles + metadata
  TOTAL_SIZE=$((DETAIL_SIZE + HULL_SIZE + METADATA_SIZE))
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
  echo "❌ ERROR: One or more regions exceeded budget"
  echo ""
  echo "To fix:"
  echo "  - For tile size: increase simplification (-r1 → -r1.5) or reduce max zoom (-z15 → -z14)"
  echo "  - For metadata: check for geometry leaks or large property values"
  echo ""
  exit 1
fi

echo "✅ All regions within budget"
