import { bbox } from '@turf/turf'
import type { FeatureCollection, Geometry } from 'geojson'

export function getFeatureCollectionBounds(featureCollection: FeatureCollection) {
  const [minLng, minLat, maxLng, maxLat] = bbox(featureCollection)
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ] as [[number, number], [number, number]]
}

export function createVineyardParcelPlaceholders(): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      parcel('pauillac-parcel-1', [
        [-0.735, 45.205],
        [-0.703, 45.212],
        [-0.698, 45.195],
        [-0.728, 45.188],
        [-0.735, 45.205],
      ]),
      parcel('pauillac-parcel-2', [
        [-0.785, 45.181],
        [-0.752, 45.189],
        [-0.747, 45.171],
        [-0.778, 45.164],
        [-0.785, 45.181],
      ]),
      parcel('saint-julien-parcel-1', [
        [-0.735, 45.112],
        [-0.697, 45.119],
        [-0.692, 45.101],
        [-0.728, 45.095],
        [-0.735, 45.112],
      ]),
      parcel('margaux-parcel-1', [
        [-0.735, 45.028],
        [-0.688, 45.037],
        [-0.682, 45.018],
        [-0.726, 45.009],
        [-0.735, 45.028],
      ]),
      parcel('saint-estephe-parcel-1', [
        [-0.806, 45.281],
        [-0.754, 45.292],
        [-0.747, 45.272],
        [-0.797, 45.263],
        [-0.806, 45.281],
      ]),
      parcel('moulis-parcel-1', [
        [-0.910, 45.074],
        [-0.858, 45.084],
        [-0.853, 45.064],
        [-0.902, 45.055],
        [-0.910, 45.074],
      ]),
    ],
  }
}

export function createHydrologyPlaceholder(): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'gironde-placeholder',
        properties: {
          name: 'Gironde estuary context',
          placeholder: true,
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [-0.60, 44.90],
            [-0.57, 45.02],
            [-0.59, 45.14],
            [-0.62, 45.25],
            [-0.65, 45.38],
            [-0.68, 45.58],
          ],
        },
      },
    ],
  }
}

function parcel(id: string, coordinates: number[][]) {
  return {
    type: 'Feature' as const,
    id,
    properties: {
      id,
      placeholder: true,
      dataStatus: 'Dev vineyard texture placeholder, not parcel data',
    },
    geometry: {
      type: 'Polygon' as const,
      coordinates: [coordinates],
    } satisfies Geometry,
  }
}
