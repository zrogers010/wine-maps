import { useEffect, useRef, useState } from 'react'
import { area, booleanPointInPolygon, point, pointOnFeature } from '@turf/turf'
import maplibregl, {
  type FilterSpecification,
  type GeoJSONSourceSpecification,
  type Map,
  type MapLayerMouseEvent,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import chateauData from '../data/chateaux.json'
import type {
  AppellationId,
  AppellationMetadata,
  ChateauPoint,
  ExperienceMode,
  LayerState,
} from '../types/wine'
import {
  createHydrologyPlaceholder,
  createVineyardParcelPlaceholders,
  getFeatureCollectionBounds,
} from '../utils/geo'
import {
  appellationFillColorExpression,
  createAtlasMapStyle,
} from '../utils/mapStyles'
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from 'geojson'

interface MapViewProps {
  appellations: AppellationMetadata[]
  filteredAppellationIds: AppellationId[]
  legendHoveredId: AppellationId | null
  layers: LayerState
  mode: ExperienceMode
  selectedId: AppellationId | null
  onSelectAppellation: (id: AppellationId) => void
}

const appellationSourceId = 'appellations'
const labelSourceId = 'appellation-label-points'
const chateauSourceId = 'chateaux'
const fillLayerId = 'appellation-fill'
const hoverAppellationShadeLayerId = 'hover-appellation-shade'
const hoverCommuneShadeLayerId = 'hover-commune-shade'
const communeBorderLayerId = 'commune-border'
const outlineLayerId = 'appellation-outline'
const labelLayerId = 'appellation-labels'
const chateauCircleLayerId = 'chateau-circles'
const chateauLabelLayerId = 'chateau-labels'
const vineyardLayerId = 'vineyards-fill'
const hydrologyLayerId = 'hydrology-line'
type SourceFeatureId = string | number
const chateaux = chateauData as ChateauPoint[]

interface HoveredRegion {
  id: AppellationId
  commune?: string
  insee?: string
}

type ChateauWithCommune = ChateauPoint & {
  commune?: string
  insee?: string
}

export function MapView({
  appellations,
  filteredAppellationIds,
  legendHoveredId,
  layers,
  mode,
  onSelectAppellation,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)
  const hoveredFeatureIdRef = useRef<SourceFeatureId | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [hoveredRegion, setHoveredRegion] = useState<HoveredRegion | null>(null)
  const [chateauxWithCommune, setChateauxWithCommune] = useState<ChateauWithCommune[]>(chateaux)
  const activeRegion = hoveredRegion ?? (legendHoveredId ? { id: legendHoveredId } : null)

  const hoveredAppellation = activeRegion
    ? appellations.find((appellation) => appellation.id === activeRegion.id)
    : null
  const hoveredChateaux = activeRegion
    ? getVisibleChateaux(chateauxWithCommune, activeRegion, hoveredRegion !== null)
    : []

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return
    }

    let cancelled = false

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: createAtlasMapStyle(),
      center: [-0.76, 45.18],
      zoom: 9.4,
      minZoom: 7.6,
      maxZoom: 13.5,
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: 'CruTerrain dev data' }),
      'bottom-right',
    )

    map.on('load', async () => {
      const medocGeoJson = await loadMedocGeoJson()

      if (cancelled) {
        return
      }

      setChateauxWithCommune(attachCommuneToChateaux(chateaux, medocGeoJson))

      map.addSource(appellationSourceId, {
        type: 'geojson',
        data: medocGeoJson,
      } satisfies GeoJSONSourceSpecification)

      map.addSource('vineyards-placeholder', {
        type: 'geojson',
        data: createVineyardParcelPlaceholders(),
      })

      map.addSource('hydrology-placeholder', {
        type: 'geojson',
        data: createHydrologyPlaceholder(),
      })

      map.addSource(labelSourceId, {
        type: 'geojson',
        data: createLabelPoints(appellations, medocGeoJson),
      })

      map.addSource(chateauSourceId, {
        type: 'geojson',
        data: createChateauPoints(),
      })

      map.addLayer({
        id: hydrologyLayerId,
        type: 'line',
        source: 'hydrology-placeholder',
        paint: {
          'line-color': '#5ca8c8',
          'line-opacity': 0.55,
          'line-width': 2.2,
          'line-blur': 0.2,
        },
      })

      map.addLayer({
        id: vineyardLayerId,
        type: 'fill',
        source: 'vineyards-placeholder',
        paint: {
          'fill-color': '#d8a55a',
          'fill-opacity': 0.16,
          'fill-outline-color': '#b37b2d',
        },
      })

      map.addLayer({
        id: fillLayerId,
        type: 'fill',
        source: appellationSourceId,
        paint: {
          'fill-color': appellationFillColorExpression(false),
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            11,
            [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              0.7,
              ['boolean', ['feature-state', 'hover'], false],
              0.8,
              ['match', ['get', 'id'], ['medoc', 'haut-medoc'], 0.36, 0.64],
            ],
            13.5,
            [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              0.56,
              ['boolean', ['feature-state', 'hover'], false],
              0.62,
              ['match', ['get', 'id'], ['medoc', 'haut-medoc'], 0.28, 0.48],
            ],
          ],
        },
      })

      map.addLayer({
        id: hoverAppellationShadeLayerId,
        type: 'fill',
        source: appellationSourceId,
        filter: filterNone(),
        paint: {
          'fill-color': '#1c0f12',
          'fill-opacity': 0.1,
        },
      })

      map.addLayer({
        id: hoverCommuneShadeLayerId,
        type: 'fill',
        source: appellationSourceId,
        filter: filterNone(),
        paint: {
          'fill-color': '#1c0f12',
          'fill-opacity': 0.2,
        },
      })

      map.addLayer({
        id: communeBorderLayerId,
        type: 'line',
        source: appellationSourceId,
        paint: {
          'line-color': 'rgba(68, 48, 36, 0.64)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.45, 11, 0.85],
          'line-opacity': 0.34,
        },
      })

      map.addLayer({
        id: outlineLayerId,
        type: 'line',
        source: appellationSourceId,
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            '#261318',
            ['boolean', ['feature-state', 'hover'], false],
            '#261318',
            'rgba(255, 255, 255, 0.32)',
          ],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            3,
            ['boolean', ['feature-state', 'hover'], false],
            2.4,
            0.35,
          ],
          'line-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            0.95,
            ['boolean', ['feature-state', 'hover'], false],
            0.9,
            0.36,
          ],
        },
      })

      map.addLayer({
        id: labelLayerId,
        type: 'symbol',
        source: labelSourceId,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11.5, 11, 16],
          'text-letter-spacing': 0.02,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': '#23171a',
          'text-halo-color': 'rgba(255, 250, 236, 0.92)',
          'text-halo-width': 2.4,
          'text-opacity': 0.95,
        },
      })

      map.addLayer({
        id: chateauCircleLayerId,
        type: 'circle',
        source: chateauSourceId,
        paint: {
          'circle-color': '#241915',
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 1.8, 11, 3.2],
          'circle-stroke-color': '#fff6df',
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 11, 1.3],
          'circle-opacity': 0.92,
        },
      })

      map.addLayer({
        id: chateauLabelLayerId,
        type: 'symbol',
        source: chateauSourceId,
        minzoom: 10,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 12, 12],
          'text-offset': [0, 1.05],
          'text-anchor': 'top',
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#241915',
          'text-halo-color': 'rgba(255, 250, 236, 0.94)',
          'text-halo-width': 1.8,
          'text-opacity': 0.95,
        },
      })

      map.moveLayer(labelLayerId)

      map.on('mousemove', fillLayerId, handleMouseMove)
      map.on('mouseleave', fillLayerId, handleMouseLeave)
      map.on('click', fillLayerId, handleClick)

      map.fitBounds(getFeatureCollectionBounds(medocGeoJson), {
        padding: { top: 90, right: 70, bottom: 80, left: 70 },
        duration: 900,
      })

      setIsReady(true)
    })

    mapRef.current = map

    function handleMouseMove(event: MapLayerMouseEvent) {
      const feature = pickHoverFeature(event.features)
      const id = getFeatureId(feature?.properties)
      const sourceFeatureId = getSourceFeatureId(feature)

      if (!id || sourceFeatureId === null) {
        return
      }

      map.getCanvas().style.cursor = 'pointer'

      if (
        hoveredFeatureIdRef.current !== null &&
        hoveredFeatureIdRef.current !== sourceFeatureId
      ) {
        setFeatureHover(map, hoveredFeatureIdRef.current, false)
      }

      hoveredFeatureIdRef.current = sourceFeatureId
      setFeatureHover(map, sourceFeatureId, true)
      setHoveredRegion(getHoveredRegion(feature?.properties, id))
    }

    function handleMouseLeave() {
      map.getCanvas().style.cursor = ''

      if (hoveredFeatureIdRef.current !== null) {
        setFeatureHover(map, hoveredFeatureIdRef.current, false)
        hoveredFeatureIdRef.current = null
      }

      setHoveredRegion(null)
    }

    function handleClick(event: MapLayerMouseEvent) {
      const id = getFeatureId(event.features?.[0]?.properties)

      if (id) {
        onSelectAppellation(id)
      }
    }

    return () => {
      cancelled = true
      map.remove()
      mapRef.current = null
    }
  }, [appellations, onSelectAppellation])

  useEffect(() => {
    const map = mapRef.current

    if (!map || !isReady) {
      return
    }

    setLayerVisibility(map, 'osm-raster', layers.roadsBasemap)
    setLayerVisibility(map, fillLayerId, layers.aocBoundaries)
    setLayerVisibility(map, hoverAppellationShadeLayerId, layers.aocBoundaries)
    setLayerVisibility(map, hoverCommuneShadeLayerId, layers.aocBoundaries)
    setLayerVisibility(map, communeBorderLayerId, layers.aocBoundaries)
    setLayerVisibility(map, outlineLayerId, layers.aocBoundaries)
    setLayerVisibility(map, vineyardLayerId, layers.vineyardParcels)
    setLayerVisibility(map, hydrologyLayerId, layers.rivers)
    setLayerVisibility(map, labelLayerId, layers.studyLabels || mode === 'Study')
    setLayerVisibility(map, chateauCircleLayerId, true)
    setLayerVisibility(map, chateauLabelLayerId, true)
    map.setPaintProperty(
      fillLayerId,
      'fill-color',
      appellationFillColorExpression(layers.grapeEmphasis),
    )
  }, [isReady, layers, mode])

  useEffect(() => {
    const map = mapRef.current

    if (!map || !isReady) {
      return
    }

    const filter: FilterSpecification =
      filteredAppellationIds.length > 0
        ? ['in', ['get', 'id'], ['literal', filteredAppellationIds]]
        : ['==', ['get', 'id'], '__none__']

    map.setFilter(fillLayerId, filter)
    map.setFilter(
      hoverAppellationShadeLayerId,
      hoveredRegion
        ? ['==', ['get', 'id'], hoveredRegion.id]
        : legendHoveredId
          ? ['==', ['get', 'id'], legendHoveredId]
          : filterNone(),
    )
    map.setFilter(
      hoverCommuneShadeLayerId,
      hoveredRegion ? communeShadeFilter(hoveredRegion) : filterNone(),
    )
    map.setFilter(communeBorderLayerId, filter)
    map.setFilter(outlineLayerId, filter)
    map.setFilter(labelLayerId, filter)
  }, [filteredAppellationIds, hoveredRegion, isReady, legendHoveredId])

  return (
    <>
      <div className="map-container" ref={containerRef} />
      <HoverRegionCard
        appellation={hoveredAppellation}
        chateaux={hoveredChateaux}
        region={activeRegion}
      />
    </>
  )
}

async function loadMedocGeoJson(): Promise<FeatureCollection> {
  const response = await fetch('/data/medoc-display-exclusive-2026.geojson')

  if (!response.ok) {
    throw new Error(`Failed to load Médoc display GeoJSON: ${response.status}`)
  }

  return (await response.json()) as FeatureCollection
}

const approximateCenters: Record<AppellationId, [number, number]> = {
  medoc: [-0.84, 45.43],
  'haut-medoc': [-0.76, 45.1],
  'saint-estephe': [-0.76, 45.27],
  pauillac: [-0.73, 45.19],
  'saint-julien': [-0.71, 45.1],
  margaux: [-0.69, 45.0],
  'moulis-en-medoc': [-0.88, 45.07],
  'listrac-medoc': [-0.91, 45.14],
}

function createLabelPoints(
  appellations: AppellationMetadata[],
  medocGeoJson: FeatureCollection,
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: appellations.map((appellation) => {
      const anchor = getAppellationLabelAnchor(appellation.id, medocGeoJson)

      return {
        type: 'Feature',
        id: appellation.id,
        properties: {
          id: appellation.id,
          name: appellation.name,
        },
        geometry: {
          type: 'Point',
          coordinates: anchor,
        },
      }
    }),
  }
}

function getAppellationLabelAnchor(
  id: AppellationId,
  medocGeoJson: FeatureCollection,
): [number, number] {
  if (curatedLabelCenters[id]) {
    return curatedLabelCenters[id]
  }

  const largestFeature = medocGeoJson.features
    .filter((feature) => feature.properties?.id === id)
    .reduce<Feature<Geometry> | null>((largest, feature) => {
      if (!largest) {
        return feature as Feature<Geometry>
      }

      return area(feature) > area(largest) ? (feature as Feature<Geometry>) : largest
    }, null)

  if (!largestFeature) {
    return approximateCenters[id]
  }

  const point = pointOnFeature(largestFeature)
  return point.geometry.coordinates as [number, number]
}

const curatedLabelCenters: Partial<Record<AppellationId, [number, number]>> = {
  medoc: [-0.83, 45.38],
  'haut-medoc': [-0.66, 44.94],
  'saint-estephe': [-0.772, 45.263],
  pauillac: [-0.748, 45.185],
  'saint-julien': [-0.735, 45.145],
  margaux: [-0.665, 45.025],
  'moulis-en-medoc': [-0.777, 45.045],
  'listrac-medoc': [-0.795, 45.095],
}

function createChateauPoints(): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: chateaux.map((chateau) => ({
      type: 'Feature',
      id: chateau.id,
      properties: {
        id: chateau.id,
        name: chateau.name,
        appellationId: chateau.appellationId,
        classificationNote: chateau.classificationNote,
        dataStatus:
          'Approximate château point for map orientation; not estate parcel or vineyard boundary data.',
      },
      geometry: {
        type: 'Point',
        coordinates: chateau.coordinates,
      },
    })),
  }
}

function getFeatureId(
  properties: Record<string, unknown> | null | undefined,
): AppellationId | null {
  return typeof properties?.id === 'string'
    ? (properties.id as AppellationId)
    : null
}

function pickHoverFeature(
  features: MapLayerMouseEvent['features'],
): NonNullable<MapLayerMouseEvent['features']>[number] | undefined {
  return features
    ?.slice()
    .sort(
      (left, right) =>
        appellationHoverPriority(getFeatureId(right.properties)) -
        appellationHoverPriority(getFeatureId(left.properties)),
    )[0]
}

function appellationHoverPriority(id: AppellationId | null) {
  switch (id) {
    case 'saint-estephe':
    case 'pauillac':
    case 'saint-julien':
    case 'margaux':
    case 'moulis-en-medoc':
    case 'listrac-medoc':
      return 3
    case 'haut-medoc':
      return 2
    case 'medoc':
      return 1
    default:
      return 0
  }
}

function getSourceFeatureId(
  feature: { id?: string | number } | undefined,
): SourceFeatureId | null {
  return typeof feature?.id === 'string' || typeof feature?.id === 'number'
    ? feature.id
    : null
}

function getHoveredRegion(
  properties: Record<string, unknown> | null | undefined,
  id: AppellationId,
): HoveredRegion {
  return {
    id,
    commune:
      typeof properties?.commune === 'string' ? properties.commune : undefined,
    insee: typeof properties?.insee === 'string' ? properties.insee : undefined,
  }
}

function attachCommuneToChateaux(
  chateauPoints: ChateauPoint[],
  medocGeoJson: FeatureCollection,
): ChateauWithCommune[] {
  return chateauPoints.map((chateau) => {
    const chateauPoint = point(chateau.coordinates)
    const containingFeature = medocGeoJson.features.find((feature) => {
      return (
        feature.properties?.id === chateau.appellationId &&
        isPolygonFeature(feature) &&
        booleanPointInPolygon(chateauPoint, feature)
      )
    })

    return {
      ...chateau,
      commune:
        typeof containingFeature?.properties?.commune === 'string'
          ? containingFeature.properties.commune
          : undefined,
      insee:
        typeof containingFeature?.properties?.insee === 'string'
          ? containingFeature.properties.insee
          : undefined,
    }
  })
}

function isPolygonFeature(
  feature: Feature,
): feature is Feature<Polygon | MultiPolygon> {
  return (
    feature.geometry.type === 'Polygon' ||
    feature.geometry.type === 'MultiPolygon'
  )
}

function getVisibleChateaux(
  chateauPoints: ChateauWithCommune[],
  region: HoveredRegion,
  isMapHover: boolean,
) {
  const appellationChateaux = chateauPoints.filter(
    (chateau) => chateau.appellationId === region.id,
  )

  if (!isMapHover) {
    return appellationChateaux
  }

  if (region.insee) {
    return appellationChateaux.filter((chateau) => chateau.insee === region.insee)
  }

  if (region.commune) {
    return appellationChateaux.filter(
      (chateau) => chateau.commune === region.commune,
    )
  }

  return []
}

function communeShadeFilter(region: HoveredRegion): FilterSpecification {
  if (region.insee) {
    return [
      'all',
      ['==', ['get', 'id'], region.id],
      ['==', ['get', 'insee'], region.insee],
    ]
  }

  if (region.commune) {
    return [
      'all',
      ['==', ['get', 'id'], region.id],
      ['==', ['get', 'commune'], region.commune],
    ]
  }

  return ['==', ['get', 'id'], region.id]
}

interface HoverRegionCardProps {
  appellation: AppellationMetadata | null | undefined
  chateaux: ChateauPoint[]
  region: HoveredRegion | null
}

function HoverRegionCard({
  appellation,
  chateaux: notableChateaux,
  region,
}: HoverRegionCardProps) {
  if (!appellation || !region) {
    return (
      <aside className="hover-region-card is-empty">
        <span className="hover-card-kicker">Médoc AOC Map</span>
        <strong>Hover a boundary</strong>
        <p>
          Move over an AOC/AOP production-area feature to see the geography
          hierarchy and notable château points.
        </p>
      </aside>
    )
  }

  return (
    <aside className="hover-region-card">
      <span className="hover-card-kicker">
        {appellation.region} / {appellation.subregion}
      </span>
      <h2>{appellation.name}</h2>
      <div className="hover-card-meta">
        <span>{appellation.aocType}</span>
        <span>{appellation.primaryStyle}</span>
      </div>
      <section className="hierarchy-section">
        <h3>Geography hierarchy</h3>
        <ol className="hierarchy-list">
          <HierarchyItem
            label="Appellation / AOC"
            value={`${appellation.name} AOC`}
          />
          <HierarchyItem
            label="Commune in source data"
            value={
              region.commune
                ? `${region.commune}${region.insee ? ` (${region.insee})` : ''}`
                : 'Not provided for this feature'
            }
          />
        </ol>
      </section>
      <dl>
        <div>
          <dt>Dominant grape focus</dt>
          <dd>{appellation.dominantGrapes.join(', ')}</dd>
        </div>
        <div>
          <dt>Key soils</dt>
          <dd>{appellation.terroir.keySoils.join(', ')}</dd>
        </div>
      </dl>
      <p>{appellation.terroir.learningPoint}</p>
      {notableChateaux.length > 0 ? (
        <section className="chateau-section">
          <h3>Notable châteaux</h3>
          <ul className="chateau-list">
            {notableChateaux.map((chateau) => (
              <li key={chateau.id}>
                <strong>{chateau.name}</strong>
                <span>{chateau.classificationNote}</span>
              </li>
            ))}
          </ul>
          <p className="chateau-note">
            Points are approximate château locations for orientation, not estate
            boundaries or vineyard-block data.
          </p>
        </section>
      ) : null}
    </aside>
  )
}

interface HierarchyItemProps {
  label: string
  value: string
  muted?: boolean
}

function HierarchyItem({
  label,
  muted = false,
  value,
}: HierarchyItemProps) {
  return (
    <li className={muted ? 'is-muted' : ''}>
      <span>{label}</span>
      <strong>{value}</strong>
    </li>
  )
}

function setFeatureHover(map: Map, id: SourceFeatureId, hover: boolean) {
  map.setFeatureState({ source: appellationSourceId, id }, { hover })
}

function setLayerVisibility(map: Map, layerId: string, visible: boolean) {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
  }
}

function filterNone(): FilterSpecification {
  return ['==', ['get', 'id'], '__none__']
}
