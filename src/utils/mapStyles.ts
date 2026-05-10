import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl'

export const APPELLATION_COLORS: Record<string, string> = {
  medoc: '#65b84a',
  'haut-medoc': '#b7d96b',
  'saint-estephe': '#16b989',
  pauillac: '#1c7ed6',
  'saint-julien': '#18b7d8',
  margaux: '#2fca72',
  'moulis-en-medoc': '#f2b84b',
  'listrac-medoc': '#e46f55',
  'entre-deux-mers': '#f7d95b',
  'entre-deux-mers-haut-benauge': '#f0a53a',
  cadillac: '#c17bdc',
  'cotes-de-bordeaux-cadillac': '#a56bd6',
  loupiac: '#ff9f43',
  'sainte-croix-du-mont': '#ffcf5c',
  'premieres-cotes-de-bordeaux': '#e879b7',
  'cotes-de-bordeaux-saint-macaire': '#c9b458',
  'graves-de-vayres': '#7cc7e8',
  'saint-emilion': '#d14f7a',
  pomerol: '#9d4edd',
  'lalande-de-pomerol': '#b565d9',
  fronsac: '#c44569',
  'canon-fronsac': '#e15f41',
  'montagne-saint-emilion': '#f08a5d',
  'lussac-saint-emilion': '#f6a04d',
  'puisseguin-saint-emilion': '#cf6a87',
  'saint-georges-saint-emilion': '#e66767',
  'pessac-leognan': '#8d6e63',
  graves: '#b08d57',
  'graves-superieures': '#d4a64f',
  sauternes: '#f2c94c',
  barsac: '#f6d365',
  cerons: '#d7b55a',
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
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      'osm-raster': {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png',
          'https://b.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png',
          'https://c.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors © CARTO',
      },
    },
    layers: [
      {
        id: 'atlas-background',
        type: 'background',
        paint: {
          'background-color': '#ead9bd',
        },
      },
      {
        id: 'osm-raster',
        type: 'raster',
        source: 'osm-raster',
        paint: {
          'raster-opacity': 0.92,
          'raster-saturation': -0.28,
          'raster-contrast': -0.16,
          'raster-brightness-min': 0.1,
          'raster-brightness-max': 0.98,
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
