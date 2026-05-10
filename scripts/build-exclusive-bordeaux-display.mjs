import fs from 'node:fs/promises'
import path from 'node:path'
import { bbox, booleanIntersects, flatten } from '@turf/turf'

const sourcePath = 'public/data/bordeaux-inao-aoc-2026.geojson'
const outputPath = 'public/data/bordeaux-display-exclusive-2026.geojson'

const priorityById = new Map([
  ['medoc', 1],
  ['haut-medoc', 2],
  ['saint-estephe', 3],
  ['pauillac', 3],
  ['saint-julien', 3],
  ['margaux', 3],
  ['moulis-en-medoc', 3],
  ['listrac-medoc', 3],
  ['entre-deux-mers', 1],
  ['premieres-cotes-de-bordeaux', 2],
  ['cotes-de-bordeaux-cadillac', 2],
  ['cotes-de-bordeaux-saint-macaire', 2],
  ['graves-de-vayres', 2],
  ['entre-deux-mers-haut-benauge', 3],
  ['cadillac', 3],
  ['loupiac', 3],
  ['sainte-croix-du-mont', 3],
  ['saint-emilion', 2],
  ['pomerol', 3],
  ['lalande-de-pomerol', 3],
  ['fronsac', 2],
  ['canon-fronsac', 3],
  ['montagne-saint-emilion', 3],
  ['lussac-saint-emilion', 3],
  ['puisseguin-saint-emilion', 3],
  ['saint-georges-saint-emilion', 3],
  ['graves', 2],
  ['graves-superieures', 1],
  ['pessac-leognan', 3],
  ['sauternes', 2],
  ['barsac', 3],
  ['cerons', 2],
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
        'Exclusive cartographic display feature: lower-priority district AOC features are hidden when they overlap higher-priority AOCs.',
      sourceFeatureId: feature.id,
    },
  })
}

const collection = {
  type: 'FeatureCollection',
  metadata: {
    name: 'Bordeaux exclusive display AOC layer',
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
