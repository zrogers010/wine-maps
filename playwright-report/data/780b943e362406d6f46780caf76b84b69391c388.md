# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: hover-verify.spec.ts >> verify hover interaction
- Location: tests/hover-verify.spec.ts:3:1

# Error details

```
Error: expect(received).not.toEqual(expected) // deep equality

Expected: not "Bordeaux AOC MapHover the map or legend to explore an appellation"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic:
    - navigation "Wine region navigation" [ref=e2]:
      - link "SommelierMaps" [ref=e3] [cursor=pointer]:
        - /url: /
      - generic [ref=e4]:
        - link "Bordeaux" [ref=e5] [cursor=pointer]:
          - /url: /bordeaux
        - link "Burgundy" [ref=e6] [cursor=pointer]:
          - /url: /burgundy
        - link "Champagne" [ref=e7] [cursor=pointer]:
          - /url: /champagne
        - link "Alsace" [ref=e8] [cursor=pointer]:
          - /url: /alsace
    - generic [ref=e9]:
      - generic [ref=e10]:
        - region "Map" [ref=e11]
        - generic:
          - generic:
            - button "Frame the whole region" [ref=e13] [cursor=pointer]
            - generic [ref=e20]:
              - button "Zoom in" [ref=e21] [cursor=pointer]
              - button "Zoom out" [ref=e23] [cursor=pointer]
          - group [ref=e25]:
            - generic "Toggle attribution" [ref=e26] [cursor=pointer]
            - generic [ref=e27]: © OpenStreetMap contributors, OpenFreeMap
      - generic [aria-hidden]:
        - generic: Loading the Bordeaux map…
      - complementary:
        - generic: Bordeaux AOC Map
        - strong: Hover the map or legend to explore an appellation
      - generic [ref=e28]: ⓘ INAO/data.gouv.fr AOC viticole parcel delimitation extract. Online data are informational; official plans remain with town halls or INAO.
      - complementary "Bordeaux appellation legend" [ref=e29]:
        - generic [ref=e30]:
          - heading "Médoc" [level=2] [ref=e31] [cursor=pointer]
          - generic [ref=e32]:
            - generic [ref=e33]: Médoc
            - generic [ref=e36]: Haut-Médoc
            - generic [ref=e39]: Saint-Estèphe
            - generic [ref=e42]: Pauillac
            - generic [ref=e45]: Saint-Julien
            - generic [ref=e48]: Margaux
            - generic [ref=e51]: Moulis-en-Médoc
            - generic [ref=e54]: Listrac-Médoc
        - generic [ref=e57]:
          - heading "Entre-Deux-Mers" [level=2] [ref=e58] [cursor=pointer]
          - generic [ref=e59]:
            - generic [ref=e60]: Entre-deux-Mers
            - generic [ref=e63]: Entre-deux-Mers Haut-Benauge
            - generic [ref=e66]: Cadillac Côtes de Bordeaux
            - generic [ref=e69]: Côtes de Bordeaux Cadillac
            - generic [ref=e72]: Loupiac
            - generic [ref=e75]: Sainte-Croix-du-Mont
            - generic [ref=e78]: Premières Côtes de Bordeaux
            - generic [ref=e81]: Côtes de Bordeaux-Saint-Macaire
            - generic [ref=e84]: Graves de Vayres
        - generic [ref=e87]:
          - heading "Right Bank" [level=2] [ref=e88] [cursor=pointer]
          - generic [ref=e89]:
            - generic [ref=e90]: Saint-Émilion
            - generic [ref=e93]: Pomerol
            - generic [ref=e96]: Lalande-de-Pomerol
            - generic [ref=e99]: Fronsac
            - generic [ref=e102]: Canon Fronsac
            - generic [ref=e105]: Montagne-Saint-Émilion
            - generic [ref=e108]: Lussac-Saint-Émilion
            - generic [ref=e111]: Puisseguin-Saint-Émilion
            - generic [ref=e114]: Saint-Georges-Saint-Émilion
        - generic [ref=e117]:
          - heading "Graves & Sauternes" [level=2] [ref=e118] [cursor=pointer]
          - generic [ref=e119]:
            - generic [ref=e120]: Pessac-Léognan
            - generic [ref=e123]: Graves
            - generic [ref=e126]: Sauternes
            - generic [ref=e129]: Barsac
            - generic [ref=e132]: Cérons
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | 
  3  | test('verify hover interaction', async ({ page }) => {
  4  |   await page.goto('/bordeaux')
  5  |   await page.waitForSelector('.maplibregl-canvas', { timeout: 15000 })
  6  |   await page.waitForTimeout(8000)
  7  |   
  8  |   // Check initial state
  9  |   const initialCard = await page.locator('.hover-region-card').textContent()
  10 |   console.log('Initial card:', initialCard)
  11 |   
  12 |   const canvas = await page.locator('.maplibregl-canvas')
  13 |   const box = await canvas.boundingBox()
  14 |   
  15 |   if (box) {
  16 |     // Move to Pauillac area
  17 |     const x = box.x + box.width * 0.38
  18 |     const y = box.y + box.height * 0.35
  19 |     console.log(`Moving mouse to ${x}, ${y}`)
  20 |     await page.mouse.move(x, y, { steps: 10 })
  21 |     await page.waitForTimeout(1000)
  22 |     
  23 |     const hoveredCard = await page.locator('.hover-region-card').textContent()
  24 |     console.log('Hovered card:', hoveredCard)
  25 |     
  26 |     await page.screenshot({ 
  27 |       path: 'screenshots/hover-verified.png',
  28 |       fullPage: false 
  29 |     })
  30 |     
  31 |     // Verify hover card changed
> 32 |     expect(hoveredCard).not.toEqual(initialCard)
     |                             ^ Error: expect(received).not.toEqual(expected) // deep equality
  33 |   }
  34 | })
  35 | 
```