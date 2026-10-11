# Map Data Pipeline: PMTiles for Mobile-Optimized Delivery

## Overview

SommelierMaps uses **PMTiles** (Protomaps Tiles) to deliver vector map data efficiently to mobile devices. This approach reduces initial load time from potentially minutes to ~3 seconds on 4G networks while preserving all interactive features including hover, labels, and legend interactions.

## Architecture

### Data Flow

```
Raw INAO data (862 MB)
         ↓
   Extract scripts (existing)
         ↓
  GeoJSON files (95 MB total, gitignored)
         ↓
   build-tiles.sh (new)
         ↓
  PMTiles + metadata (gitignored)
         ↓
    Upload to S3/CDN
         ↓
  Browser loads tiles on demand
```

### File Types

1. **PMTiles (Vector Tiles)**
   - `{region}-detail.pmtiles`: Parcel-level detail (zoom 11-14)
   - `{region}-hull.pmtiles`: Dissolved appellation boundaries (zoom 7-11)
   - Optimized, indexed, range-requestable
   - Served with `Cache-Control: public,max-age=31536000,immutable`

2. **Metadata JSON (Small GeoJSON)**
   - `{region}-metadata.json`: Simplified hulls for bounds and labels (~10-50 KB each)
   - Loaded once at map init for bounds calculation and label placement
   - Served with `Cache-Control: public,max-age=300`

3. **Manifest**
   - `manifest.json`: Build timestamp and file sizes
   - Served with `Cache-Control: public,max-age=300`

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Initial load (4G) | ~3s | First contentful paint + tiles |
| Detail tile size | 2-5 MB | Per region, zoom 11-14 |
| Hull tile size | 200-800 KB | Per region, zoom 7-11 |
| Metadata size | 10-50 KB | Per region |
| Hover latency | <50ms | Feature-state via stable IDs |

## Build Process

### Prerequisites

Install tippecanoe and pmtiles CLI tools:

```bash
# macOS
brew install tippecanoe pmtiles

# Linux (tippecanoe from source)
git clone https://github.com/felt/tippecanoe.git
cd tippecanoe
make -j
sudo make install

# Linux (pmtiles binary)
wget https://github.com/protomaps/go-pmtiles/releases/latest/download/pmtiles_linux_x86_64
chmod +x pmtiles_linux_x86_64
sudo mv pmtiles_linux_x86_64 /usr/local/bin/pmtiles
```

Also ensure `jq` is installed for JSON manipulation:

```bash
# macOS
brew install jq

# Linux
sudo apt-get install jq
```

### Running the Build

**On your local Mac with the raw data:**

```bash
# From the project root
npm run tiles:build

# Or directly:
./scripts/build-tiles.sh
```

The script will:
1. Find all region GeoJSON files in `public/data/france/`
2. Convert detail files to PMTiles (zoom 11-14)
3. Convert hull files to PMTiles (zoom 7-11)
4. Generate lightweight metadata JSON for each region
5. Write `tiles/manifest.json` with build info and sizes

**Expected output** (assuming raw data processed):

```
tiles/
├── manifest.json              (~1 KB)
├── burgundy-detail.pmtiles    (~3.2 MB)
├── burgundy-hull.pmtiles      (~450 KB)
├── burgundy-metadata.json     (~28 KB)
├── champagne-detail.pmtiles   (~2.8 MB)
├── champagne-hull.pmtiles     (~380 KB)
├── champagne-metadata.json    (~18 KB)
├── bordeaux-detail.pmtiles    (~4.1 MB)
├── bordeaux-hull.pmtiles      (~620 KB)
├── bordeaux-metadata.json     (~42 KB)
├── alsace-detail.pmtiles      (~1.9 MB)
├── alsace-hull.pmtiles        (~290 KB)
└── alsace-metadata.json       (~15 KB)

Total: ~14 MB (vs. ~95 MB raw GeoJSON)
```

### Tippecanoe Parameters

The build script uses these optimizations:

- **Detail tiles** (`-z14 -Z11`): Only rendered at high zoom where parcels are visible
- **Hull tiles** (`-z11 -Z7`): Overview appellations at medium zoom
- **Simplification** (`-r1.5` / `-r2`): Reduces vertex count while preserving shape
- **Property preservation** (`-pk`): Keeps all properties for hover (id, commune, insee, climat, etc.)
- **Feature ID mapping** (`--use-attribute-for-id=id`): Uses the `id` property as feature ID for feature-state hover
- **Drop densest** (`--drop-densest-as-needed`): Intelligently drops features at lower zooms

## Deployment

### Upload to S3

Replace `YOUR-BUCKET` with your actual S3 bucket name:

```bash
# Upload PMTiles with long-lived cache (immutable, content-addressed)
aws s3 sync tiles/ s3://YOUR-BUCKET/tiles/ \
  --exclude 'manifest.json' \
  --exclude '*.json' \
  --cache-control 'public,max-age=31536000,immutable' \
  --content-type 'application/vnd.pmtiles'

# Upload metadata JSON with short TTL
aws s3 sync tiles/ s3://YOUR-BUCKET/tiles/ \
  --exclude '*.pmtiles' \
  --exclude 'manifest.json' \
  --cache-control 'public,max-age=300' \
  --content-type 'application/json'

# Upload manifest with short TTL
aws s3 cp tiles/manifest.json s3://YOUR-BUCKET/tiles/manifest.json \
  --cache-control 'public,max-age=300' \
  --content-type 'application/json'
```

### CloudFront / CDN Setup

1. Create a CloudFront distribution pointing to the S3 bucket
2. Set custom error page: 404 → 200 (pass through, app handles missing data gracefully)
3. Configure origin request policy to forward `Range` headers (required for PMTiles)
4. Note the CloudFront URL (e.g. `https://d1234567890.cloudfront.net`)

### Configure the App

Set the `VITE_DATA_BASE_URL` environment variable to point to your CDN:

```bash
# Development (local tiles)
npm run dev
# Uses /tiles by default

# Production build
VITE_DATA_BASE_URL=https://d1234567890.cloudfront.net/tiles npm run build

# Or set in .env.production:
echo "VITE_DATA_BASE_URL=https://d1234567890.cloudfront.net/tiles" > .env.production
npm run build
```

## Development Workflow

### Local Development

1. Build tiles once:
   ```bash
   npm run tiles:build
   ```

2. Start dev server:
   ```bash
   npm run dev
   ```
   The app will load tiles from `/tiles` (served by Vite from the `tiles/` directory).

3. If tiles are missing, the app will show:
   > "Map data not available. Run `npm run tiles:build` to generate tiles."

### Adding a New Region

1. Add region extraction and display scripts (existing pattern)
2. Run extraction to populate `public/data/france/{region}/`
3. Run `npm run tiles:build` to generate PMTiles
4. Create a page component with `regionId="{region}"` prop
5. Deploy tiles to S3/CDN

## How Hover Still Works with Vector Tiles

PMTiles uses **feature-state** for hover, which requires stable feature IDs:

1. **tippecanoe** is called with `--use-attribute-for-id=id`
   - This promotes the `id` property to `feature.id`

2. **MapLibre** receives `promoteId: { [regionId]: 'id' }` in the source config
   - This ensures `feature.id` is set even if tippecanoe didn't preserve it

3. **Hover interactions** call `map.setFeatureState({ source, sourceLayer, id }, { hover: true })`
   - Layer styles check `['feature-state', 'hover']` to highlight hovered features

4. **Properties** are preserved (`-pk` flag)
   - Hover card still displays: `id`, `commune`, `insee`, `climat`, `cruLevel`, etc.

## Troubleshooting

### Build fails: "tippecanoe not found"
Install tippecanoe (see Prerequisites above).

### Build fails: "No detail file found for {region}"
Ensure the region's GeoJSON files exist in `public/data/france/{region}/` after running extraction scripts.

### Map shows "data not available" in browser
1. Check `tiles/manifest.json` exists
2. Check `tiles/{region}-detail.pmtiles` exists
3. Inspect network tab: ensure tiles are loading from `/tiles` (dev) or CDN (prod)
4. Verify `VITE_DATA_BASE_URL` is set correctly for production

### Hover not working
1. Check browser console for errors
2. Verify feature IDs are present: open MapLibre inspector, select a feature, check `id` field
3. Ensure `promoteId` is set correctly in source config
4. Check that properties include `id`, `commune`, `insee`, etc.

### Tiles too large
1. Increase `-r` simplification (current: 1.5 for detail, 2 for hull)
2. Reduce `-z` max zoom (current: 14)
3. Use `--drop-fraction-as-needed` in tippecanoe for aggressive thinning
4. Consider per-region zoom limits (`maxzoom` in source config)

## Alternatives Considered

### Per-Region Split GeoJSON + Brotli
- **Pros**: Simpler build, no new tools
- **Cons**: Still loads entire region at once (~2-8 MB compressed), slower initial render

### MBTiles
- **Pros**: Established standard
- **Cons**: Requires server-side tile extraction, not range-requestable from static hosting

### GeoJSON streaming
- **Pros**: Progressive loading
- **Cons**: Complex client-side assembly, no native MapLibre support

**Verdict**: PMTiles is the best fit for static hosting + mobile performance + full interactivity.

## References

- [PMTiles Specification](https://github.com/protomaps/PMTiles)
- [Tippecanoe](https://github.com/felt/tippecanoe)
- [MapLibre GL JS Feature State](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/#setfeaturestate)
- [INAO AOC Data](https://www.data.gouv.fr/fr/datasets/delimitation-parcellaire-des-aoc-viticoles-de-linao/)
