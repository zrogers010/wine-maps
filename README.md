# SommelierMaps

SommelierMaps is currently a map-first Bordeaux AOC/AOP prototype. The app is kept
deliberately simple for now: a white basemap with detailed AOC viticole
boundaries, labels, and separate region legends.

> Important: the current detailed boundary layer is an extract from the INAO
> parcel-delimitation dataset on data.gouv.fr. INAO states the online data are
> informational; the official parcel delimitations remain the plans deposited in
> town halls or available from INAO services.

## MVP Scope

- React, TypeScript, and Vite frontend.
- MapLibre GL JS map rendering with local GeoJSON and JSON metadata.
- Bordeaux region groups currently on the same map:
  - Médoc / Left Bank: Médoc, Haut-Médoc, Saint-Estèphe, Pauillac,
    Saint-Julien, Margaux, Moulis-en-Médoc, and Listrac-Médoc.
  - Entre-Deux-Mers: Entre-deux-Mers, Entre-deux-Mers Haut-Benauge,
    Cadillac, Côtes de Bordeaux Cadillac, Loupiac, Sainte-Croix-du-Mont,
    Premières Côtes de Bordeaux, Côtes de Bordeaux-Saint-Macaire, and Graves
    de Vayres.
- Full-screen white map using a light land/sea basemap.
- Detailed INAO/data.gouv.fr AOC viticole boundary extract for the eight Médoc
  appellations.
- Hover and click interactions for appellation boundaries.

The current Médoc look and interaction pattern is the locked template for future
regions. See `docs/REGION_TEMPLATE.md`.

## Data Sources To Replace Placeholders

Primary detailed boundary source:

- `src/data/france/bordeaux/bordeaux-inao-aoc-2026.geojson` is generated from
  [Délimitation Parcellaire des AOC Viticoles de l'INAO](https://www.data.gouv.fr/datasets/delimitation-parcellaire-des-aoc-viticoles-de-linao/),
  resource `2026-05-05-delim-parcellaire-aoc-shp.zip`.
- `public/data/france/bordeaux/bordeaux-display-exclusive-2026.geojson` is the runtime display
  layer loaded by MapLibre, so the large boundary file is not bundled into
  JavaScript.
- The national SHP is Lambert-93 (`EPSG:2154`); the app extract is transformed
  to WGS84 (`EPSG:4326`) for MapLibre.
- Run `npm run data:extract-bordeaux` after downloading/extracting the
  source ZIP into `data/raw/inao-aoc-viticoles-2026-05-05/`.

Other useful data sources:

1. INAO / data.gouv.fr AOC-AOP boundary data for appellation boundaries.
2. INAO "Délimitation Parcellaire des AOC Viticoles" SHP/GeoJSON where
   available.
3. OpenStreetMap `landuse=vineyard` polygons for vineyard-ground texture.
4. OpenStreetMap or vector basemap layers for roads, rivers, towns, and terrain
   context.

The old placeholder file is still kept only as a development fallback:

- `src/data/france/bordeaux/medoc-placeholder.geojson`
- `src/data/france/bordeaux/appellations.json`

## Accuracy Model

Study content should continue to distinguish:

- Official AOC rules.
- Common real-world producer practice.
- Typical tasting profile.
- Exam or WSET-style shorthand.
- Terroir explanation.
- Classification and producer context.

For example, Pauillac should be described as commonly Cabernet
Sauvignon-dominant, not as "100% Cabernet Sauvignon."

## Local Development

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

## Project Structure

```text
src/
  components/
    MapView.tsx
  data/
    france/
      bordeaux/
        appellations.json
        chateaux.json
        bordeaux-inao-aoc-2026.geojson
        medoc-inao-aoc-2026.geojson
        medoc-placeholder.geojson
  docs/
    REGION_TEMPLATE.md
  scripts/
    build-exclusive-bordeaux-display.mjs
    build-exclusive-medoc-display.mjs
    extract-inao-bordeaux.mjs
    extract-inao-medoc.mjs
  types/
    wine.ts
  utils/
    geo.ts
    mapStyles.ts
```

## Next Steps

- Refine the basemap to show only desired land/sea/settlement context.
- Add verified vineyard parcel or OSM vineyard polygon texture only when needed.
- Add compare mode for side-by-side appellation study.
- Add blind-tasting mode with clue cards and likely-appellation reasoning.
- Add source citations per metadata field before publishing study content.
