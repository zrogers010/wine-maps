import fs from 'node:fs/promises'
import path from 'node:path'
import { booleanIntersects, flatten } from '@turf/turf'

const sourcePath = 'public/data/medoc-inao-aoc-2026.geojson'
const outputPath = 'public/data/medoc-display-exclusive-2026.geojson'

const priorityById = new Map([
  ['medoc', 1],
  ['haut-medoc', 2],
  ['saint-estephe', 3],
  ['pauillac', 3],
  ['saint-julien', 3],
  ['margaux', 3],
  ['moulis-en-medoc', 3],
  ['listrac-medoc', 3],
])

const source = JSON.parse(await fs.readFile(sourcePath, 'utf-8'))
const flattenedFeatures = flatten(source).features.map((feature, index) => ({
  ...feature,
  id: feature.id ?? `${feature.properties?.id ?? 'aoc'}-${index}`,
}))
const outputFeatures = []

for (const feature of flattenedFeatures) {
  const priority = priorityById.get(feature.properties?.id) ?? 0
  const isCoveredByHigherPriority = flattenedFeatures.some((candidate) => {
    const candidatePriority = priorityById.get(candidate.properties?.id) ?? 0

    return candidatePriority > priority && booleanIntersects(feature, candidate)
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
        'Exclusive cartographic display feature: lower-priority district AOC features are hidden when they overlap higher-priority commune AOCs.',
      sourceFeatureId: feature.id,
    },
  })
}

const collection = {
  type: 'FeatureCollection',
  metadata: {
    name: 'Médoc exclusive display AOC layer',
    source: sourcePath,
    note:
      'Generated from INAO AOC production-area features for map display. It resolves overlapping legal eligibility layers by displaying commune AOCs over broader district AOCs.',
    priority: [...priorityById.entries()],
  },
  features: outputFeatures,
}

await fs.mkdir(path.dirname(outputPath), { recursive: true })
await fs.writeFile(outputPath, `${JSON.stringify(collection)}\n`)

console.log(`Wrote ${outputFeatures.length} exclusive display features to ${path.resolve(outputPath)}`)
