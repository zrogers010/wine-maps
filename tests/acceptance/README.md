# SommelierMaps visual acceptance test

One self-contained Playwright script that checks what a user actually *sees*, not just DOM state.
Exits `0` when all checks pass, `1` on any failure, `2` on bad usage.

## Run
```bash
cd /workspace/sm-acceptance
npm install                 # only dependency: playwright
# app: npm run build && npx vite preview --port 4173   (runtime GeoJSON must be in public/data)
node acceptance.mjs http://localhost:4173 [--out ./acceptance-shots] [--only a,b,c,d,e,f,g,h]
```
Browser: Playwright's bundled Chromium if installed (`npx playwright install chromium`), otherwise
system Chrome at `$CHROME_PATH` or `/usr/bin/google-chrome`. Runs headless with SwiftShader WebGL.

Outputs: screenshots + `results.json` in `--out` (default `./acceptance-shots`).

## Test hook contract (important, check f)
The app must expose the MapLibre instance as `window.__wineMap` **only** when the URL has `?test=1`
(e.g. `if (new URLSearchParams(location.search).has('test')) window.__wineMap = map`).
- Check **f** loads `/bordeaux` *without* the flag and requires `typeof window.__wineMap === 'undefined'`.
- All other map checks load pages *with* `?test=1` and fail with "test hook" if the map isn't exposed.
  (A dev build that always exposes it will pass a–e/g/h but fail f, by design.)

## Checks
| id | condition |
|---|---|
| a | Desktop `/bordeaux`: click a rendered Pauillac point, move mouse away. A line layer matching `/(hover|select).*outline/` must have `pauillac` in its filter or rendered features, AND ≥25% of sampled Pauillac boundary vertices must have a pixel within RGB distance 70 of that layer's `line-color` (fallback `#a01845`) in a 5×5 window. |
| b | `/bordeaux/pauillac/` on desktop 1440×900 and mobile 390×844: `map.getZoom() >= 10` and Pauillac's bbox (from the GeoJSON) projects fully inside the canvas. |
| c | Mobile, each region: tap the lowest rendered appellation point in 40–85% of screen height; after easing, its re-projected point must be > 8 px above the sheet's top edge. |
| d | Mobile: `×` (`.mobile-close-button`) closes the sheet on each region page and on the `/bordeaux/pauillac/` deep link. |
| e | No `pageerror` or `console.error` on any page visited (includes "There is no tile manager…"). |
| f | `window.__wineMap` undefined without `?test=1`. |
| g | Line features from water/hydro layers rendered over the Médoc bbox must all have `class === 'river'`, checked both initially and after selecting Pauillac (custom GeoJSON lines without a class fail). |
| h | Home `.region-card-media` thumbnails: > 15% of pixels differ (RGB dist > 28) from the dominant background color, per card. |

Selectors, region routes, GeoJSON path and thresholds are constants at the top of `acceptance.mjs`.

## Known result on PR #6 head bb5ae91 (expected FAIL, 5/21 pass)
f exposed in prod · a filter stays `__none__`, 0/714 outline pixels · g `hydrology-line` "Gironde estuary context" (no class) appears after selection · b zoom 8.48 desktop / 7.6 mobile · d × doesn't close on deep link · c map never eases (features at y≈580–670 under sheet top 464) on all 4 regions · h coverage 1.3–8.7% · e "no tile manager with ID 'appellations'". Passing: d on 4 region pages, g initial.
The pixel sampler was self-tested: forcing the outline filter to pauillac yields 712/714 hits (PASS).
