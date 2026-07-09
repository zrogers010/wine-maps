import proj4 from 'proj4'

proj4.defs(
  'EPSG:2154',
  '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +units=m +no_defs',
)

const wfsEndpoint = 'https://data.geopf.fr/wfs/ows'
const apiCartoEndpoint = 'https://apicarto.ign.fr/api/aoc/appellation-viticole'
const champagneGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [3.3, 48.55],
      [5.05, 48.55],
      [5.05, 49.55],
      [3.3, 49.55],
      [3.3, 48.55],
    ],
  ],
}

const probeBoxes = {
  bordeauxControl: [-0.95, 44.4, -0.05, 45.45],
  burgundyControl: [3.6, 46.7, 5.2, 48.2],
  champagneMain: [3.3, 48.55, 5.05, 49.55],
  champagneAube: [4.0, 47.7, 5.0, 48.4],
}

console.log('Probing official AOC viticole access for Champagne...')
console.log(`WFS endpoint: ${wfsEndpoint}`)

for (const [name, bbox4326] of Object.entries(probeBoxes)) {
  const result = await queryWfsBbox(name, bbox4326)
  console.log(
    [
      `WFS ${name}:`,
      `${result.numberReturned} returned`,
      `${result.numberMatched} matched`,
      result.denoms.length > 0 ? `sample=${result.denoms.join(' | ')}` : 'sample=none',
    ].join(' '),
  )
}

const apiKey = process.env.IGN_API_KEY

if (!apiKey) {
  console.log('API Carto skipped: set IGN_API_KEY to probe POST /api/aoc/appellation-viticole.')
} else {
  const result = await queryApiCarto(apiKey)
  console.log(
    [
      'API Carto Champagne:',
      `${result.numberReturned} returned`,
      result.denoms.length > 0 ? `sample=${result.denoms.join(' | ')}` : 'sample=none',
    ].join(' '),
  )
}

async function queryWfsBbox(name, bbox4326) {
  const bbox2154 = bboxToLambert93(bbox4326)
  const params = new URLSearchParams({
    SERVICE: 'WFS',
    VERSION: '2.0.0',
    REQUEST: 'GetFeature',
    TYPENAMES: 'AOC-VITICOLES:aire_parcellaire',
    OUTPUTFORMAT: 'application/json',
    COUNT: '10',
    BBOX: `${bbox2154.join(',')},urn:ogc:def:crs:EPSG::2154`,
  })
  const response = await fetch(`${wfsEndpoint}?${params.toString()}`)

  if (!response.ok) {
    throw new Error(`WFS ${name} failed: ${response.status} ${response.statusText}`)
  }

  const collection = await response.json()
  return {
    numberReturned: collection.numberReturned ?? collection.features?.length ?? 0,
    numberMatched: collection.numberMatched ?? collection.totalFeatures ?? 0,
    denoms: sampleDenoms(collection),
  }
}

async function queryApiCarto(apiKey) {
  const params = new URLSearchParams({
    geom: JSON.stringify(champagneGeometry),
    source: 'prd',
    apikey: apiKey,
  })
  const response = await fetch(`${apiCartoEndpoint}?${params.toString()}`, {
    method: 'POST',
  })
  const text = await response.text()

  if (!response.ok) {
    throw new Error(`API Carto failed: ${response.status} ${response.statusText}\n${text}`)
  }

  const collection = JSON.parse(text)
  return {
    numberReturned: Array.isArray(collection)
      ? collection.reduce((sum, item) => sum + (item.features?.length ?? 0), 0)
      : collection.features?.length ?? 0,
    denoms: sampleDenoms(collection),
  }
}

function bboxToLambert93([minLng, minLat, maxLng, maxLat]) {
  const corners = [
    [minLng, minLat],
    [minLng, maxLat],
    [maxLng, minLat],
    [maxLng, maxLat],
  ].map((coordinate) => proj4('EPSG:4326', 'EPSG:2154', coordinate))

  return [
    Math.floor(Math.min(...corners.map(([x]) => x))),
    Math.floor(Math.min(...corners.map(([, y]) => y))),
    Math.ceil(Math.max(...corners.map(([x]) => x))),
    Math.ceil(Math.max(...corners.map(([, y]) => y))),
  ]
}

function sampleDenoms(collection) {
  const features = Array.isArray(collection)
    ? collection.flatMap((item) => item.features ?? [])
    : collection.features ?? []

  return [
    ...new Set(
      features
        .map((feature) => feature.properties?.denom ?? feature.properties?.appellation)
        .filter(Boolean),
    ),
  ].slice(0, 5)
}
