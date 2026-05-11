import { useEffect, useRef, useState } from 'react'
import { area, pointOnFeature } from '@turf/turf'
import maplibregl, {
  type ExpressionSpecification,
  type FilterSpecification,
  type GeoJSONSourceSpecification,
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
} from 'maplibre-gl'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import appellationData from '../data/france/burgundy/appellations.json'
import { getFeatureCollectionBounds } from '../utils/geo'
import { createAtlasMapStyle } from '../utils/mapStyles'

interface BurgundyAppellationMetadata {
  id: string
  name: string
  country: string
  region: string
  subregion: string
  bank: string
  aocType: string
  primaryStyle: string
  dominantGrapes: string[]
  importantGrapes: string[]
  terroir: {
    keySoils: string[]
    climate: string[]
    learningPoint: string
  }
  tastingProfile: {
    fruit: string[]
    nonFruit: string[]
    structure: string[]
    ageingPotential: string
  }
  examNotes: string[]
}

interface HoveredBurgundyRegion {
  id: string
  commune?: string
  insee?: string
}

const appellations = appellationData as BurgundyAppellationMetadata[]
const burgundySourceId = 'burgundy-appellations'
const burgundyLabelSourceId = 'burgundy-labels'
const burgundyFillLayerId = 'burgundy-fill'
const burgundyHoverLayerId = 'burgundy-hover'
const burgundyLineLayerId = 'burgundy-lines'
const burgundyLabelLayerId = 'burgundy-labels'

const burgundyColors: Record<string, string> = {
  'petit-chablis': '#c7d98b',
  chablis: '#8fc7d8',
  'chablis-grand-cru': '#4b9bb8',
  'gevrey-chambertin': '#b84f6f',
  'morey-saint-denis': '#c7637f',
  'chambolle-musigny': '#d7839a',
  vougeot: '#b66bd8',
  'vosne-romanee': '#8f5cc7',
  'nuits-saint-georges': '#7b4aa6',
  'aloxe-corton': '#d97757',
  beaune: '#e0a653',
  pommard: '#c84c4c',
  volnay: '#e47d9a',
  meursault: '#e7c75f',
  'puligny-montrachet': '#d9df70',
  'chassagne-montrachet': '#c8b85f',
}

const legendGroups = [
  {
    title: 'Burgundy / Chablis',
    ids: ['petit-chablis', 'chablis', 'chablis-grand-cru'],
  },
  {
    title: 'Burgundy / Côte de Nuits',
    ids: [
      'gevrey-chambertin',
      'morey-saint-denis',
      'chambolle-musigny',
      'vougeot',
      'vosne-romanee',
      'nuits-saint-georges',
    ],
  },
  {
    title: 'Burgundy / Côte de Beaune',
    ids: [
      'aloxe-corton',
      'beaune',
      'pommard',
      'volnay',
      'meursault',
      'puligny-montrachet',
      'chassagne-montrachet',
    ],
  },
]

export function BurgundyPage() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [hoveredRegion, setHoveredRegion] = useState<HoveredBurgundyRegion | null>(null)
  const [legendHoveredId, setLegendHoveredId] = useState<string | null>(null)

  const activeRegion = hoveredRegion ?? (legendHoveredId ? { id: legendHoveredId } : null)
  const activeAppellation = activeRegion
    ? appellations.find((appellation) => appellation.id === activeRegion.id)
    : null

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return
    }

    let cancelled = false
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: createAtlasMapStyle(),
      center: [4.8, 47.2],
      zoom: 8.4,
      minZoom: 6.8,
      maxZoom: 14,
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: 'CruTerrain dev data' }),
      'bottom-right',
    )

    map.on('load', async () => {
      const burgundyGeoJson = await loadGeoJson(
        '/data/france/burgundy/burgundy-display-exclusive-2026.geojson',
      )

      if (cancelled) {
        return
      }

      map.addSource(burgundySourceId, {
        type: 'geojson',
        data: burgundyGeoJson,
      } satisfies GeoJSONSourceSpecification)

      map.addSource(burgundyLabelSourceId, {
        type: 'geojson',
        data: createLabelPoints(burgundyGeoJson),
      } satisfies GeoJSONSourceSpecification)

      map.addLayer({
        id: burgundyFillLayerId,
        type: 'fill',
        source: burgundySourceId,
        paint: {
          'fill-color': burgundyFillColorExpression(),
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.66, 13.5, 0.48],
        },
      })

      map.addLayer({
        id: burgundyHoverLayerId,
        type: 'fill',
        source: burgundySourceId,
        filter: filterNone(),
        paint: {
          'fill-color': '#1c0f12',
          'fill-opacity': 0.16,
        },
      })

      map.addLayer({
        id: burgundyLineLayerId,
        type: 'line',
        source: burgundySourceId,
        paint: {
          'line-color': 'rgba(255, 253, 247, 0.86)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.7, 12, 1.15],
          'line-opacity': 0.78,
        },
      })

      map.addLayer({
        id: burgundyLabelLayerId,
        type: 'symbol',
        source: burgundyLabelSourceId,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 7, 9.5, 11, 12.5],
          'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right'],
          'text-radial-offset': 0.25,
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        },
        paint: {
          'text-color': '#23171a',
          'text-halo-color': 'rgba(255, 250, 236, 0.92)',
          'text-halo-width': 2.2,
          'text-opacity': 0.95,
        },
      })

      map.on('mousemove', burgundyFillLayerId, handleMouseMove)
      map.on('mouseleave', burgundyFillLayerId, handleMouseLeave)

      map.fitBounds(getFeatureCollectionBounds(burgundyGeoJson), {
        padding: { top: 90, right: 70, bottom: 80, left: 70 },
        duration: 900,
      })

      setIsReady(true)
    })

    mapRef.current = map

    return () => {
      cancelled = true
      map.remove()
      mapRef.current = null
    }

    function handleMouseMove(event: MapLayerMouseEvent) {
      const feature = event.features?.[0]
      const id = getFeatureId(feature?.properties)

      if (!id) {
        return
      }

      map.getCanvas().style.cursor = 'pointer'
      setHoveredRegion({
        id,
        commune: getStringProperty(feature?.properties, 'commune'),
        insee: getStringProperty(feature?.properties, 'insee'),
      })
    }

    function handleMouseLeave() {
      map.getCanvas().style.cursor = ''
      setHoveredRegion(null)
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current

    if (!map || !isReady) {
      return
    }

    const activeId = hoveredRegion?.id ?? legendHoveredId
    map.setFilter(
      burgundyHoverLayerId,
      activeId ? ['==', ['get', 'id'], activeId] : filterNone(),
    )
  }, [hoveredRegion, isReady, legendHoveredId])

  return (
    <div className="map-only-shell">
      <div className="map-container" ref={containerRef} />
      <BurgundyHoverCard appellation={activeAppellation} region={activeRegion} />
      <div className="map-source-badge">
        INAO/data.gouv.fr AOC viticole parcel delimitation extract. Online data
        are informational; official plans remain with town halls or INAO.
      </div>
      <aside className="region-legend" aria-label="Burgundy appellation legend">
        {legendGroups.map((group) => (
          <section className="region-legend-group" key={group.title}>
            <h2>{group.title}</h2>
            <div className="region-legend-list">
              {group.ids.map((id) => {
                const appellation = appellations.find((candidate) => candidate.id === id)

                if (!appellation) {
                  return null
                }

                return (
                  <div
                    className="region-legend-row"
                    key={appellation.id}
                    onMouseEnter={() => setLegendHoveredId(appellation.id)}
                    onMouseLeave={() => setLegendHoveredId(null)}
                  >
                    <span
                      className="region-legend-swatch"
                      style={{ backgroundColor: burgundyColors[appellation.id] }}
                    />
                    <span>{appellation.name}</span>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </aside>
    </div>
  )
}

function BurgundyHoverCard({
  appellation,
  region,
}: {
  appellation: BurgundyAppellationMetadata | null | undefined
  region: HoveredBurgundyRegion | null
}) {
  if (!appellation || !region) {
    return (
      <aside className="hover-region-card is-empty">
        <span className="hover-card-kicker">Burgundy AOC Map</span>
        <strong>Hover an appellation</strong>
        <p>Move over a Burgundy AOC feature to see study cues.</p>
      </aside>
    )
  }

  return (
    <aside className="hover-region-card">
      <span className="hover-card-kicker">
        {appellation.region} / {appellation.subregion}
      </span>
      <h2>{appellation.name}</h2>
      {region.commune ? (
        <div className="hover-card-commune">
          {region.commune}
          {region.insee ? <span>{region.insee}</span> : null}
        </div>
      ) : null}
      <div className="hover-card-meta">
        <span>{appellation.aocType}</span>
        <span>{appellation.primaryStyle}</span>
      </div>
      <dl>
        <div>
          <dt>Dominant grape focus</dt>
          <dd>{appellation.dominantGrapes.join(', ')}</dd>
        </div>
        <div>
          <dt>Soil characteristics</dt>
          <dd>{appellation.terroir.keySoils.join(', ')}</dd>
        </div>
      </dl>
      <div className="study-cues-compact" aria-label="Typical exam cues">
        <h3>Varietals</h3>
        {appellation.dominantGrapes.slice(0, 2).map((grape) => (
          <div className="study-cue-row" key={grape}>
            <strong>{grape}</strong>
            <span className="study-cue-details">
              <span>
                <b>Visual:</b> {visualCueForGrape(grape)}
              </span>
              <span>
                <b>Taste:</b> {tastingCueForGrape(grape, appellation)}
              </span>
            </span>
          </div>
        ))}
      </div>
      <p>{appellation.terroir.learningPoint}</p>
    </aside>
  )
}

async function loadGeoJson(path: string): Promise<FeatureCollection> {
  const response = await fetch(path)

  if (!response.ok) {
    throw new Error(`Failed to load GeoJSON ${path}: ${response.status}`)
  }

  return (await response.json()) as FeatureCollection
}

function createLabelPoints(geoJson: FeatureCollection): FeatureCollection {
  const largestFeatureById = new Map<string, Feature<Geometry>>()

  for (const feature of geoJson.features) {
    const id = getFeatureId(feature.properties)

    if (!id) {
      continue
    }

    const largestFeature = largestFeatureById.get(id)
    if (!largestFeature || area(feature) > area(largestFeature)) {
      largestFeatureById.set(id, feature as Feature<Geometry>)
    }
  }

  return {
    type: 'FeatureCollection',
    features: [...largestFeatureById.entries()].map(([id, feature]) => ({
      type: 'Feature',
      id,
      properties: {
        id,
        name: getMetadataName(id),
      },
      geometry: {
        type: 'Point',
        coordinates: pointOnFeature(feature).geometry.coordinates,
      },
    })),
  }
}

function burgundyFillColorExpression(): ExpressionSpecification {
  return [
    'match',
    ['get', 'id'],
    ...Object.entries(burgundyColors).flatMap(([id, color]) => [id, color]),
    '#8c6f4f',
  ] as unknown as ExpressionSpecification
}

function getMetadataName(id: string) {
  return appellations.find((appellation) => appellation.id === id)?.name ?? id
}

function getFeatureId(properties: unknown) {
  if (!properties || typeof properties !== 'object' || !('id' in properties)) {
    return null
  }

  const id = (properties as { id?: unknown }).id
  return typeof id === 'string' ? id : null
}

function getStringProperty(properties: unknown, key: string) {
  if (!properties || typeof properties !== 'object' || !(key in properties)) {
    return undefined
  }

  const value = (properties as Record<string, unknown>)[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function filterNone(): FilterSpecification {
  return ['==', ['get', 'id'], '__none__']
}

function visualCueForGrape(grape: string) {
  return grape === 'Chardonnay'
    ? 'pale lemon to medium gold'
    : 'pale ruby to medium ruby, garnet with age'
}

function tastingCueForGrape(grape: string, appellation: BurgundyAppellationMetadata) {
  if (grape === 'Chardonnay') {
    return [
      ...appellation.tastingProfile.fruit.slice(0, 2),
      ...appellation.tastingProfile.nonFruit.slice(0, 2),
      ...appellation.tastingProfile.structure.slice(0, 1),
    ].join(', ')
  }

  return [
    ...appellation.tastingProfile.fruit.slice(0, 2),
    ...appellation.tastingProfile.nonFruit.slice(0, 2),
    ...appellation.tastingProfile.structure.slice(0, 1),
  ].join(', ')
}
