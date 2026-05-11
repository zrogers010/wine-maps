import fs from 'node:fs/promises'
import path from 'node:path'
import { bbox, booleanIntersects, flatten } from '@turf/turf'

const sourcePath = 'public/data/france/burgundy/burgundy-inao-aoc-2026.geojson'
const outputPath = 'public/data/france/burgundy/burgundy-display-exclusive-2026.geojson'

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
const flattenedFeatures = flatten(source).features.map((feature, index) => ({
  ...feature,
  id: feature.id ?? `${feature.properties?.id ?? 'aoc'}-${index}`,
  bbox: bbox(feature),
}))
const outputFeatures = []

for (const feature of flattenedFeatures) {
  const priority = priorityById.get(feature.properties?.id) ?? 0
  const isCoveredByHigherPriority = flattenedFeatures.some((candidate) => {
    const candidatePriority = priorityById.get(candidate.properties?.id) ?? 0

    return (
      candidatePriority > priority &&
      bboxesIntersect(feature.bbox, candidate.bbox) &&
      booleanIntersects(feature, candidate)
    )
  })

  if (isCoveredByHigherPriority) {
    continue
  }

  outputFeatures.push({
    ...feature,
    id: feature.id,
    properties: {
      ...feature.properties,
      displayStatus:
        'Exclusive cartographic display feature: lower-priority Burgundy AOC features are hidden when they overlap higher-priority AOCs.',
      sourceFeatureId: feature.id,
    },
  })
}

const collection = {
  type: 'FeatureCollection',
  metadata: {
    name: 'Burgundy exclusive display AOC layer',
    source: sourcePath,
    note:
      'Generated from INAO AOC production-area features for map display. It resolves overlapping legal eligibility layers by displaying more specific AOCs over broader AOCs.',
    priority: [...priorityById.entries()],
  },
  features: outputFeatures,
}

await fs.mkdir(path.dirname(outputPath), { recursive: true })
await fs.writeFile(outputPath, `${JSON.stringify(collection)}\n`)

console.log(`Wrote ${outputFeatures.length} exclusive display features to ${path.resolve(outputPath)}`)

function bboxesIntersect(left, right) {
  return (
    left[0] <= right[2] &&
    left[2] >= right[0] &&
    left[1] <= right[3] &&
    left[3] >= right[1]
  )
}
