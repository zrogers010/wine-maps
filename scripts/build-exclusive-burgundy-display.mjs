import fs from 'node:fs/promises'
import path from 'node:path'
import {
  area,
  bbox,
  booleanIntersects,
  difference,
  featureCollection,
  flatten,
  polygon,
} from '@turf/turf'

const MIN_AREA_M2 = 10  // Minimum area for valid polygons (m²)
const sourcePath = 'public/data/france/burgundy/burgundy-inao-aoc-2026.geojson'
const outputPath = 'public/data/france/burgundy/burgundy-display-exclusive-2026.geojson'

const grandCruIds = [
  'chambertin',
  'chambertin-clos-de-beze',
  'chapelle-chambertin',
  'charmes-chambertin',
  'griotte-chambertin',
  'latricieres-chambertin',
  'mazis-chambertin',
  'mazoyeres-chambertin',
  'ruchottes-chambertin',
  'clos-de-la-roche',
  'clos-saint-denis',
  'clos-des-lambrays',
  'clos-de-tart',
  'bonnes-mares',
  'musigny',
  'clos-de-vougeot',
  'echezeaux',
  'grands-echezeaux',
  'romanee-conti',
  'la-tache',
  'richebourg',
  'la-romanee',
  'la-grande-rue',
  'romanee-saint-vivant',
  'corton',
  'corton-charlemagne',
  'charlemagne',
  'montrachet',
  'chevalier-montrachet',
  'batard-montrachet',
  'bienvenues-batard-montrachet',
  'criots-batard-montrachet',
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
  // Côte d'Or Grand Cru AOCs win overlaps against village eligibility areas.
  ...grandCruIds.map((id) => [id, 5]),
])

const source = JSON.parse(await fs.readFile(sourcePath, 'utf-8'))
const flattenedFeatures = flatten(source).features.map((feature, index) => ({
  ...feature,
  id: `${feature.properties?.id ?? 'aoc'}-${index}`,
  sourceFeatureId: feature.id ?? `${feature.properties?.id ?? 'aoc'}-${index}`,
  bbox: bbox(feature),
  displayArea: area(feature),
  displayPriority: priorityById.get(feature.properties?.id) ?? 0,
}))
let overlapCutCount = 0
let overlapFallbackCount = 0
let sliverCount = 0
const outputFeatures = removeOverlaps(flattenedFeatures)

const collection = {
  type: 'FeatureCollection',
  metadata: {
    name: 'Burgundy exclusive display AOC layer',
    source: sourcePath,
    note:
      'Generated from INAO AOC production-area features for map display. It cuts overlapping legal eligibility layers so transparent fills do not stack within an appellation.',
    priority: [...priorityById.entries()],
    overlapCutCount,
    overlapFallbackCount,
  },
  features: outputFeatures,
}

await fs.mkdir(path.dirname(outputPath), { recursive: true })
await fs.writeFile(outputPath, `${JSON.stringify(collection)}\n`)

console.log(`Wrote ${outputFeatures.length} exclusive display features to ${path.resolve(outputPath)}`)
console.log(`Cut overlaps from ${overlapCutCount} detailed features`)
console.log(`Kept ${overlapFallbackCount} features uncut after full-overlap fallback`)
console.log(`Removed ${sliverCount} degenerate polygon parts < ${MIN_AREA_M2} m²`)

function removeOverlaps(features) {
  const acceptedFeatures = []
  const candidates = [...features].sort((left, right) => {
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
        current = null
        break
      }

      overlapCutCount += 1
      current = {
        ...cut,
        id: candidate.id,
        properties: {
          ...candidate.properties,
          overlapStatus:
            'Detailed display overlap removed; earlier accepted Burgundy feature kept the shared area.',
        },
      }
    }

    if (!current) {
      continue
    }

    const outputFeature = {
      ...current,
      id: candidate.id,
      geometry: filterDegenerateRings(closeRings(current.geometry)),
      properties: {
        ...current.properties,
        displayStatus:
          'Exclusive cartographic display feature: overlapping Burgundy AOC eligibility layers are cut to prevent color stacking.',
        sourceFeatureId: candidate.sourceFeatureId,
      },
    }

    acceptedFeatures.push({
      ...outputFeature,
      bbox: bbox(outputFeature),
    })
  }

  return acceptedFeatures.map(stripRuntimeFields)
}

function stripRuntimeFields(feature) {
  const {
    bbox: _bbox,
    displayArea: _displayArea,
    displayPriority: _displayPriority,
    sourceFeatureId: _sourceFeatureId,
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

/**
 * Filter degenerate polygon rings (< MIN_AREA_M2 or < 3 distinct vertices)
 * from Polygon and MultiPolygon geometries after subtraction operations
 */
function filterDegenerateRings(geometry) {
  if (geometry.type === 'Polygon') {
    const validRings = []
    for (const ring of geometry.coordinates) {
      // Check distinct vertices
      const uniqueCoords = new Set(ring.map(c => `${c[0]},${c[1]}`))
      if (uniqueCoords.size < 3) {
        sliverCount++
        continue
      }
      
      // Check area
      const ringPoly = polygon([ring])
      const areaM2 = area(ringPoly)
      
      if (areaM2 < MIN_AREA_M2) {
        sliverCount++
        continue
      }
      
      validRings.push(ring)
    }
    
    return validRings.length > 0 ? { ...geometry, coordinates: validRings } : null
  }

  if (geometry.type === 'MultiPolygon') {
    const validPolygons = []
    for (const polygonCoords of geometry.coordinates) {
      const validRings = []
      for (const ring of polygonCoords) {
        const uniqueCoords = new Set(ring.map(c => `${c[0]},${c[1]}`))
        if (uniqueCoords.size < 3) {
          sliverCount++
          continue
        }
        
        const ringPoly = polygon([ring])
        const areaM2 = area(ringPoly)
        
        if (areaM2 < MIN_AREA_M2) {
          sliverCount++
          continue
        }
        
        validRings.push(ring)
      }
      
      if (validRings.length > 0) {
        validPolygons.push(validRings)
      }
    }
    
    return validPolygons.length > 0 ? { ...geometry, coordinates: validPolygons } : null
  }

  return geometry
}
