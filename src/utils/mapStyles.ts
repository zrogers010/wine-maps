import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl'

export const APPELLATION_COLORS: Record<string, string> = {
  // Left Bank - Médoc: gravel tones (muted earth browns and taupes)
  medoc: '#9d8b7a',
  'haut-medoc': '#b5a08f',
  'saint-estephe': '#8a7568',
  pauillac: '#7a6456',
  'saint-julien': '#9c8775',
  margaux: '#b89f8d',
  'moulis-en-medoc': '#c4ac99',
  'listrac-medoc': '#a6917f',
  
  // Entre-Deux-Mers: soft greens
  'entre-deux-mers': '#b5c4a7',
  'entre-deux-mers-haut-benauge': '#a3b697',
  
  // Sweet whites: warm golds
  cadillac: '#d4b88a',
  'cotes-de-bordeaux-cadillac': '#ccb082',
  loupiac: '#e8c896',
  'sainte-croix-du-mont': '#f0d5a3',
  'premieres-cotes-de-bordeaux': '#ddc092',
  'cotes-de-bordeaux-saint-macaire': '#c9b785',
  'graves-de-vayres': '#b3aa92',
  
  // Right Bank: plum and berry tones
  'saint-emilion': '#a8748e',
  pomerol: '#8d6982',
  'lalande-de-pomerol': '#9d7a91',
  fronsac: '#b5829e',
  'canon-fronsac': '#9e6d89',
  'montagne-saint-emilion': '#b88ba0',
  'lussac-saint-emilion': '#c59aad',
  'puisseguin-saint-emilion': '#a77d93',
  'saint-georges-saint-emilion': '#b0869c',
  
  // Graves region: earthy browns
  'pessac-leognan': '#9a7d6d',
  graves: '#b08d7a',
  'graves-superieures': '#c4a085',
  
  // Sauternes/Barsac: rich golds
  sauternes: '#ddb876',
  barsac: '#e8c688',
  cerons: '#d5b47d',
}

export const GRAPE_COLORS: Record<string, string> = {
  'Cabernet Sauvignon': '#9f1239',
  Merlot: '#7f1d1d',
  'Cabernet Franc': '#b45309',
  'Petit Verdot': '#4c1d95',
}

export function createAtlasMapStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      'openmaptiles': {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
        attribution: '© OpenStreetMap contributors, OpenFreeMap',
      },
    },
    layers: [
      {
        id: 'atlas-background',
        type: 'background',
        paint: {
          'background-color': '#f1e5cf',
        },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        paint: {
          'fill-color': '#b8a890',
          'fill-opacity': 0.7,
        },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'waterway',
        minzoom: 8,
        filter: ['==', ['get', 'class'], 'river'],
        paint: {
          'line-color': '#a89880',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 12, 3],
          'line-opacity': 0.6,
        },
      },
      {
        id: 'landcover',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        maxzoom: 12,
        paint: {
          'fill-color': '#e8ddc8',
          'fill-opacity': 0.25,
        },
      },
      {
        id: 'landuse',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landuse',
        maxzoom: 12,
        paint: {
          'fill-color': '#ebe0cd',
          'fill-opacity': 0.15,
        },
      },
      {
        id: 'place-labels',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        minzoom: 8,
        filter: ['in', ['get', 'class'], ['literal', ['town', 'village', 'city']]],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8,
            ['case', ['==', ['get', 'class'], 'city'], 11, 9],
            12,
            ['case', ['==', ['get', 'class'], 'city'], 14, 11],
          ],
          'text-anchor': 'center',
          'text-offset': [0, 0.3],
          'text-max-width': 8,
        },
        paint: {
          'text-color': '#6d5d50',
          'text-halo-color': 'rgba(241, 229, 207, 0.95)',
          'text-halo-width': 1.8,
          'text-opacity': 0.75,
        },
      },
    ],
  }
}

export function appellationFillColorExpression(
  grapeEmphasis: boolean,
): ExpressionSpecification {
  if (grapeEmphasis) {
    return [
      'match',
      ['get', 'dominantGrape'],
      'Cabernet Sauvignon',
      GRAPE_COLORS['Cabernet Sauvignon'],
      'Merlot',
      GRAPE_COLORS.Merlot,
      '#8c6f4f',
    ] as unknown as ExpressionSpecification
  }

  return [
    'match',
    ['get', 'id'],
    ...Object.entries(APPELLATION_COLORS).flatMap(([id, color]) => [id, color]),
    '#8c6f4f',
  ] as unknown as ExpressionSpecification
}
