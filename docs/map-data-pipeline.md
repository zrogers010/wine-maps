# Map Data Pipeline: PMTiles for Mobile Delivery

## Approach

SommelierMaps uses **PMTiles** (Protomaps vector tiles) to deliver map data efficiently to mobile devices. PMTiles enables ~3-second load times on 4G networks while preserving all interactive features (hover, labels, legend).

**Architecture:**
- **Detail tiles** (zoom 11-15): Full parcel geometry with all properties
- **Hull tiles** (zoom 7-11): Dissolved appellation boundaries  
- **Metadata JSON** (~10-50 KB): Centroids, bbox, and label properties only
- **Versioned paths**: Tiles stored under `tiles/<timestamp>/` for safe immutable caching
- **Manifest**: `current/manifest.json` (fetched with `no-cache`) points to current version

**Note**: Bordeaux has processed data but no PMTiles page yet (uses old MapView). Excluded from default build; add `--regions burgundy,champagne,alsace,bordeaux` to include it.

## Performance Targets

| Metric | Target |
|--------|--------|
| Initial load (4G) | ~3s |
| Region tile budget | 5 MB (configurable) |
| Hover latency | <50ms |

## Build & Deploy Commands

### Prerequisites

```bash
# macOS
brew install tippecanoe pmtiles

# Linux (Ubuntu/Debian)
sudo apt-get install tippecanoe
# pmtiles: Download from https://github.com/protomaps/go-pmtiles/releases
```

### Build Tiles (on Mac with raw data)

```bash
# From project root
npm run tiles:build

# Or with custom budgets
node scripts/build-tiles.mjs --size-budget-mb 6 --metadata-budget-kb 500

# Include Bordeaux (not included by default)
node scripts/build-tiles.mjs --regions burgundy,champagne,alsace,bordeaux

# Output: tiles/<timestamp>/ and tiles/current/manifest.json
```

**Per-region input configuration** (in `scripts/build-tiles.mjs`):
- **Burgundy**: `burgundy-display-exclusive-2026.geojson` (detail), `burgundy-display-hulls-2026.geojson` (hull)
- **Champagne**: `champagne-opendatawine-display-2026.geojson` (detail), `champagne-opendatawine-hulls-2026.geojson` (hull) — uses opendatawine version per ChampagnePage.tsx
- **Alsace**: `alsace-display-2026.geojson` (detail), `alsace-display-hulls-2026.geojson` (hull)
- **Bordeaux**: `bordeaux-display-exclusive-2026.geojson` (detail), `bordeaux-display-cadillac-dissolve-trial-2026.geojson` (hull) — excluded by default until PMTiles page exists

The script **fails closed**:
- Exits non-zero if any configured region's input is missing (prints expected path)
- Exits non-zero if zero regions are built
- Exits non-zero if any region exceeds size budget
- **Exits non-zero if features are dropped at max zoom** (prints `ids: input=N z15=M` per region)
- No silent "skipping" — all failures are hard errors

**Build process**:
1. Converts GeoJSON to GeoJSONSeq (newline-delimited)
2. Copies `feature.id` to `properties.id`, strips top-level `id` (avoids tippecanoe warnings)
3. **Filters degenerate polygons** from input before tiling:
   - Removes polygon parts with fewer than 3 distinct vertices
   - Removes polygon parts with area < 10 m² (configurable via `--min-area-m2`)
   - Logs every removed sliver with ID and area
   - **Fails if filtering would remove the only geometry for a named feature** (prevents silent climat disappearance)
   - Excluded slivers don't count in the `input=N` side of the `ids:` comparison
4. Runs tippecanoe to create mbtiles (detail and hull separately)
5. **Decodes detail tiles at max zoom (15)** using `tippecanoe-decode` to verify no features dropped
6. Converts mbtiles to pmtiles using `pmtiles convert`
7. Generates lightweight metadata JSON with centroids and bboxes (Node + turf)
8. Validates size budgets and writes manifest

Degenerate polygons (slivers) come from subtraction operations in `scripts/build-exclusive-burgundy-display.mjs` and similar upstream scripts. These scripts now **filter slivers at the source** after subtraction to prevent them from reaching the PMTiles build. The build-time filter serves as a safety net.

### Run Smoke Test

```bash
# Self-contained: starts dev server and Chrome automatically
npm run smoke:tiles
```

The smoke test **fails closed**:
- Tests exactly 3 expected regions: burgundy, champagne, alsace
- Exits non-zero if any expected region is missing from manifest
- Exits non-zero if any region is skipped or has no test cases
- Exits non-zero if zero regions are tested
- Only prints "SKIPPED (no data)" and exits 0 when `tiles/current/manifest.json` is entirely absent (CI case)
- Never prints "passed" when regions are skipped

Per-region assertions:
- Map loads and `window.__wineMap` exists
- Test feature found in rendered tiles (uses `gevrey-chambertin` for Burgundy, or largest bbox)
- Hover card appears with correct feature name
- Legend hover zoom works (Burgundy only)
- No console errors about tiles/manifest
- Screenshot saved to `tiles/.smoke-screenshots/<region>.png`

### Deploy to Production

```bash
# 1. Set CDN URL and build app
echo "VITE_DATA_BASE_URL=https://YOUR-CDN/tiles" > .env.production
npm run build

# 2. Get the tile version
VERSION=$(jq -r '.version' tiles/current/manifest.json)

# 3. Upload versioned tiles (immutable)
aws s3 sync tiles/$VERSION/ s3://YOUR-BUCKET/tiles/$VERSION/ \
  --cache-control 'public,max-age=31536000,immutable'

# 4. Upload current manifest (short TTL, no-cache preferred)
aws s3 cp tiles/current/manifest.json s3://YOUR-BUCKET/tiles/current/manifest.json \
  --cache-control 'no-cache' \
  --content-type 'application/json'

# 5. Upload app assets (immutable)
aws s3 sync dist/assets/ s3://YOUR-BUCKET/assets/ \
  --cache-control 'public,max-age=31536000,immutable'

# 6. Upload index.html (short TTL)
aws s3 cp dist/index.html s3://YOUR-BUCKET/index.html \
  --cache-control 'public,max-age=60' \
  --content-type 'text/html'

# 7. Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id YOUR-DISTRIBUTION-ID \
  --paths "/index.html" "/tiles/current/manifest.json"
```

## How Hover Works with Vector Tiles

PMTiles uses **feature-state** for hover via stable feature IDs:

1. `tippecanoe -l <region>` sets source-layer name (must match `getSourceLayer()` helper)
2. Build script copies `feature.id` → `properties.id` before tippecanoe (avoids non-numeric ID warnings)
3. All properties (`id`, `name`, `commune`, `insee`, `cruLevel`, `climat`) are kept by default
4. MapLibre `promoteId: { [region]: 'id' }` uses `properties.id` as `feature.id` for feature-state
5. `map.setFeatureState({ source, sourceLayer, id }, { hover: true })` highlights features

**Note**: IDs are **strings** (kebab-case like 'gevrey-chambertin'), not integers. The `promoteId` approach handles both string and integer IDs correctly.

## Manifest JSON Format

The build script generates `tiles/current/manifest.json` with version and file metadata.

**Example structure (file sizes shown are illustrative, not measured):**

```json
{
  "version": "20261011-160345",
  "tiles": {
    "burgundy": {
      "detail": {
        "file": "burgundy-detail.pmtiles",
        "sizeBytes": 3355443,
        "sizeMB": "3.20"
      },
      "hull": {
        "file": "burgundy-hull.pmtiles",
        "sizeBytes": 471040,
        "sizeMB": "0.45"
      },
      "metadata": {
        "file": "burgundy-metadata.json",
        "sizeBytes": 28672,
        "sizeKB": "28.0"
      },
      "totalSizeBytes": 3826483,
      "totalSizeMB": "3.65"
    }
  }
}
```

The app fetches `${VITE_DATA_BASE_URL}/current/manifest.json` once per page load and resolves tile URLs as `${VITE_DATA_BASE_URL}/${version}/${file}`.

## Troubleshooting

### Build fails: "tippecanoe not found"
Install tippecanoe (see Prerequisites).

### Build fails: "OVER BUDGET"
The script reports which region exceeded the limit and suggests fixes:
- Increase simplification: `-r1` → `-r1.5`
- Reduce max zoom: `-z15` → `-z14`

Edit `scripts/build-tiles.mjs` and adjust tippecanoe parameters.

### Build fails: "FEATURES DROPPED"
Tippecanoe dropped features at max zoom (usually sub-pixel slivers):
- Check the printed `ids: input=N z15=M` line to see how many were dropped
- Script lists up to 5 missing feature IDs
- To fix: increase simplification (`-r1` → `-r2`) or use `--drop-smallest-as-needed`
- Or clean input data to remove tiny slivers before build

### Map shows "data not available"
1. Check `tiles/current/manifest.json` exists
2. Verify tiles exist: `ls -lh tiles/<version>/*.pmtiles`
3. In dev: Vite should serve `/tiles/` directory automatically
4. In prod: verify `VITE_DATA_BASE_URL` is set correctly (should point to tiles root, e.g. `https://cdn/tiles`)
5. Check browser network tab for 404s on manifest or tile files

### Hover not working
1. Check browser console for errors
2. Verify source-layer name matches: check tippecanoe `-l` parameter in `build-tiles.sh` vs `getSourceLayer()` in code
3. Verify feature IDs exist in tiles: inspect a feature in MapLibre inspector
4. Ensure `promoteId` is set correctly in source config
5. Check properties include `id`, `commune`, `insee`, etc.

### 404 on tile files in production
The app fetches `${VITE_DATA_BASE_URL}/current/manifest.json` to get the version, then loads tiles from `${VITE_DATA_BASE_URL}/<version>/<region>-{detail|hull}.pmtiles`. Ensure:
- `VITE_DATA_BASE_URL` points to tiles root (not including `/current`)
- Both versioned tiles AND `current/manifest.json` are uploaded to S3
- Manifest has correct `version` field matching the uploaded directory name
