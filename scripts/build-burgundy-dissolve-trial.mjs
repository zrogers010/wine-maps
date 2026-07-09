import fs from 'node:fs/promises'
import path from 'node:path'
import {
  area,
  bbox,
  booleanIntersects,
  concave,
  coordAll,
  convex,
  difference,
  featureCollection,
  point,
} from '@turf/turf'

const sourcePath = 'public/data/france/burgundy/burgundy-display-exclusive-2026.geojson'
const outputPath = 'public/data/france/burgundy/burgundy-display-hulls-2026.geojson'
const concaveMaxEdgeKilometers = 1.8
const concaveMaxEdgeKilometersById = new Map([
  ['chablis', 2.6],
  ['nuits-saint-georges', 2.6],
])
const convexHullIds = new Set(['chablis', 'nuits-saint-georges'])

const targetIds = [
  'petit-chablis',
  'chablis',
  'chablis-grand-cru',
  'gevrey-chambertin',
  'morey-saint-denis',
  'chambolle-musigny',
  'vougeot',
  'vosne-romanee',
  'nuits-saint-georges',
  'aloxe-corton',
  'beaune',
  'pommard',
  'volnay',
  'meursault',
  'puligny-montrachet',
  'chassagne-montrachet',
]

const priorityById = new Map([
  ['petit-chablis', 1],
  ['chablis', 2],
  ['chablis-grand-cru', 4],
  ['gevrey-chambertin', 3],
  ['morey-saint-denis', 3],
  ['chambolle-musigny', 3],
  ['vougeot', 3],
  ['vosne-romanee', 3],
  ['nuits-saint-georges', 3],
  ['aloxe-corton', 3],
  ['beaune', 3],
  ['pommard', 3],
  ['volnay', 3],
  ['meursault', 3],
  ['puligny-montrachet', 3],
  ['chassagne-montrachet', 3],
])

const source = JSON.parse(await fs.readFile(sourcePath, 'utf-8'))
const trialFeatures = []

for (const targetId of targetIds) {
  const targetFeatures = source.features.filter(
    (feature) => feature.properties?.id === targetId,
  )

  if (targetFeatures.length === 0) {
    throw new Error(`No features found for ${targetId}`)
  }

  const maxEdge =
    concaveMaxEdgeKilometersById.get(targetId) ?? concaveMaxEdgeKilometers
  const displayGeometryFeature = convexHullIds.has(targetId)
    ? buildConvexHull(targetFeatures)
    : buildConcaveHull(targetFeatures, maxEdge)

  if (!displayGeometryFeature) {
    throw new Error(`Could not create display geometry for ${targetId}`)
  }

  trialFeatures.push({
    ...displayGeometryFeature,
    id: targetId,
    properties: {
      ...targetFeatures[0].properties,
      id: targetId,
      displayStatus:
        'Trial display feature: Burgundy AOC features replaced by one filled concave outer hull for low-zoom display.',
      concaveMaxEdgeKilometers: maxEdge,
      hullStrategy: convexHullIds.has(targetId) ? 'convex' : 'concave',
      hullPointCount: coordAll(displayGeometryFeature).length,
      sourceFeatureCount: targetFeatures.length,
    },
    geometry: closeRings(removeInteriorRings(displayGeometryFeature.geometry)),
  })
}

let overlapCutCount = 0
let overlapFallbackCount = 0
const displayHullFeatures = removeOverlaps(trialFeatures)

const collection = {
  type: 'FeatureCollection',
  metadata: {
    ...source.metadata,
    name: 'Burgundy display with low-zoom outer hulls',
    source: sourcePath,
    note:
      'Trial layer. Selected AOCs are replaced by filled, non-overlapping concave outer hulls for low-zoom display.',
    hullTargetIds: targetIds,
    concaveMaxEdgeKilometers,
    concaveMaxEdgeKilometersById: [...concaveMaxEdgeKilometersById.entries()],
    convexHullIds: [...convexHullIds],
    overlapCutCount,
    overlapFallbackCount,
  },
  features: displayHullFeatures,
}

await fs.mkdir(path.dirname(outputPath), { recursive: true })
await fs.writeFile(outputPath, `${JSON.stringify(collection)}\n`)

console.log(`Wrote ${collection.features.length} features to ${path.resolve(outputPath)}`)
console.log(`Built ${trialFeatures.length} filled concave hulls using maxEdge=${concaveMaxEdgeKilometers}km`)
console.log(`Cut overlaps from ${overlapCutCount} hull features`)
console.log(`Kept ${overlapFallbackCount} hulls uncut after full-overlap fallback`)

function buildConcaveHull(features, maxEdge) {
  const hullPoints = featureCollection(
    features.flatMap((feature) => coordAll(feature).map((coordinate) => point(coordinate))),
  )

  return concave(hullPoints, {
    maxEdge,
    units: 'kilometers',
  }) ?? convex(hullPoints)
}

function buildConvexHull(features) {
  const hullPoints = featureCollection(
    features.flatMap((feature) => coordAll(feature).map((coordinate) => point(coordinate))),
  )

  return convex(hullPoints)
}

function removeOverlaps(features) {
  const acceptedFeatures = []
  const candidates = features
    .map((feature) => ({
      ...feature,
      bbox: bbox(feature),
      displayArea: area(feature),
      displayPriority: priorityById.get(feature.properties?.id) ?? 0,
    }))
    .sort((left, right) => {
      if (right.displayPriority !== left.displayPriority) {
        return right.displayPriority - left.displayPriority
      }

      return left.displayArea - right.displayArea
    })

  for (const candidate of candidates) {
    let current = stripRuntimeFields(candidate)

    for (const accepted of acceptedFeatures) {
      if (!bboxesIntersect(bbox(current), accepted.bbox)) {
        continue
      }

      if (!booleanIntersects(current, accepted)) {
        continue
      }

      const cut = difference(featureCollection([current, accepted]))

      if (!cut) {
        overlapFallbackCount += 1
        current = stripRuntimeFields(candidate)
        break
      }

      overlapCutCount += 1
      current = {
        ...cut,
        id: candidate.id,
        geometry: closeRings(cut.geometry),
        properties: {
          ...candidate.properties,
          overlapStatus:
            'Low-zoom hull overlap removed; higher-priority or smaller same-priority hull kept the shared area.',
        },
      }
    }

    if (!current) {
      continue
    }

    acceptedFeatures.push({
      ...current,
      bbox: bbox(current),
    })
  }

  return acceptedFeatures.map(stripRuntimeFields)
}

function stripRuntimeFields(feature) {
  const {
    bbox: _bbox,
    displayArea: _displayArea,
    displayPriority: _displayPriority,
    ...rest
  } = feature
  return rest
}

function bboxesIntersect(left, right) {
  return (
    left[0] <= right[2] &&
    left[2] >= right[0] &&
    left[1] <= right[3] &&
    left[3] >= right[1]
  )
}

function removeInteriorRings(geometry) {
  if (geometry.type === 'Polygon') {
    return {
      ...geometry,
      coordinates: [geometry.coordinates[0]],
    }
  }

  if (geometry.type === 'MultiPolygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon) => [polygon[0]]),
    }
  }

  return geometry
}

function closeRings(geometry) {
  if (geometry.type === 'Polygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map(closeRing),
    }
  }

  if (geometry.type === 'MultiPolygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon) => polygon.map(closeRing)),
    }
  }

  return geometry
}

function closeRing(ring) {
  const first = ring[0]
  const last = ring[ring.length - 1]

  if (!first || !last || (first[0] === last[0] && first[1] === last[1])) {
    return ring
  }

  return [...ring, first]
}
