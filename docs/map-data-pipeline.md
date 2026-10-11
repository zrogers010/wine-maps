# Map Data Pipeline: PMTiles for Mobile Delivery

## Approach

SommelierMaps uses **PMTiles** (Protomaps vector tiles) to deliver map data efficiently to mobile devices. PMTiles enables ~3-second load times on 4G networks while preserving all interactive features (hover, labels, legend).

**Architecture:**
- **Detail tiles** (zoom 11-14): Full parcel geometry with all properties
- **Hull tiles** (zoom 7-11): Dissolved appellation boundaries  
- **Metadata JSON** (~10-50 KB): Lightweight GeoJSON for bounds and labels
- **Versioned paths**: Tiles stored under `tiles/<timestamp>/` for safe immutable caching
- **Manifest**: `current/manifest.json` (fetched with `no-cache`) points to current version

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
brew install tippecanoe pmtiles jq

# Linux
# tippecanoe: Build from https://github.com/felt/tippecanoe
# pmtiles: Download from https://github.com/protomaps/go-pmtiles/releases
# jq: sudo apt-get install jq
```

### Build Tiles (on Mac with raw data)

```bash
# From project root
npm run tiles:build

# Or with custom budget
./scripts/build-tiles.sh --size-budget-mb 6

# Output: tiles/<timestamp>/ and tiles/current/manifest.json
```

The script validates that each region stays under the size budget (default 5 MB) and fails with suggestions if exceeded.

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
2. All properties (`id`, `name`, `commune`, `insee`, `cruLevel`, `climat`) are kept by default
3. MapLibre `promoteId: { [region]: 'id' }` uses `properties.id` as `feature.id` for feature-state
4. `map.setFeatureState({ source, sourceLayer, id }, { hover: true })` highlights features

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
- Increase simplification: `-r1.5` → `-r2.5`
- Reduce max zoom: `-z14` → `-z13`
- Drop more features: add `--drop-rate=1.5`

Edit `scripts/build-tiles.sh` and adjust tippecanoe parameters.

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
