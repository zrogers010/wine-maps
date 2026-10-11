# Map Data Pipeline: PMTiles for Mobile Delivery

## Approach

SommelierMaps uses **PMTiles** (Protomaps vector tiles) to deliver map data efficiently to mobile devices. PMTiles enables ~3-second load times on 4G networks while preserving all interactive features (hover, labels, legend).

**Architecture:**
- **Detail tiles** (zoom 11-14): Full parcel geometry with all properties
- **Hull tiles** (zoom 7-11): Dissolved appellation boundaries  
- **Metadata JSON** (~10-50 KB): Lightweight GeoJSON for bounds and labels
- **Versioned paths**: Tiles stored under `tiles/<timestamp>/` for safe immutable caching
- **Manifest**: `manifest.json` (short TTL) points to current version

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

# Output: tiles/<timestamp>/ and tiles/current symlink
```

The script validates that each region stays under the size budget (default 5 MB) and fails with suggestions if exceeded.

### Deploy to S3

```bash
# Replace YOUR-BUCKET with actual bucket name
# Get the version from tiles/current symlink
VERSION=$(readlink tiles/current)

# Upload versioned tiles with immutable cache headers
aws s3 sync tiles/$VERSION/ s3://YOUR-BUCKET/tiles/$VERSION/ \
  --exclude 'manifest.json' \
  --cache-control 'public,max-age=31536000,immutable'

# Upload manifest to 'current' path with short TTL
aws s3 cp tiles/$VERSION/manifest.json s3://YOUR-BUCKET/tiles/current/manifest.json \
  --cache-control 'public,max-age=300'

# Upload app dist to same bucket (single CloudFront origin, no CORS)
aws s3 sync dist/ s3://YOUR-BUCKET/ \
  --exclude '*.map' \
  --cache-control 'public,max-age=31536000,immutable'

# Upload index.html with short TTL
aws s3 cp dist/index.html s3://YOUR-BUCKET/index.html \
  --cache-control 'public,max-age=300' \
  --content-type 'text/html'
```

### Configure Production Build

```bash
# Set CDN URL pointing to 'current' path
echo "VITE_DATA_BASE_URL=https://YOUR-CDN/tiles/current" > .env.production
npm run build
```

## How Hover Works with Vector Tiles

PMTiles uses **feature-state** for hover via stable feature IDs:

1. `tippecanoe --use-attribute-for-id=id` promotes `id` property to `feature.id`
2. MapLibre `promoteId: { [regionId]: 'id' }` ensures stable IDs
3. `map.setFeatureState({ source, sourceLayer, id }, { hover: true })` highlights features
4. All properties preserved (`-pk` flag): `id`, `commune`, `insee`, `climat`, `cruLevel`, etc.

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
2. Verify tiles exist: `ls -lh tiles/current/*.pmtiles`
3. In dev: ensure Vite serves `/tiles/current` (it should automatically)
4. In prod: verify `VITE_DATA_BASE_URL` points to CDN with `/tiles/current` path
5. Check browser network tab for 404s

### Hover not working
1. Check browser console for errors
2. Verify feature IDs exist in tiles: inspect a feature in MapLibre inspector
3. Ensure `promoteId` is set in source config
4. Check properties include `id`, `commune`, `insee`, etc.

### Stale tiles after rebuild
The versioning system prevents this: new builds create new versioned directories, and the manifest always points to the latest version. Clients will pick up new tiles after the manifest TTL expires (5 minutes).
