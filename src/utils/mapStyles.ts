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
    'medoc',
    APPELLATION_COLORS.medoc,
    'haut-medoc',
    APPELLATION_COLORS['haut-medoc'],
    'saint-estephe',
    APPELLATION_COLORS['saint-estephe'],
    'pauillac',
    APPELLATION_COLORS.pauillac,
    'saint-julien',
    APPELLATION_COLORS['saint-julien'],
    'margaux',
    APPELLATION_COLORS.margaux,
    'moulis-en-medoc',
    APPELLATION_COLORS['moulis-en-medoc'],
    'listrac-medoc',
    APPELLATION_COLORS['listrac-medoc'],
    '#8c6f4f',
  ] as unknown as ExpressionSpecification
}
