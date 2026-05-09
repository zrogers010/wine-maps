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
const lowZoomHullSourceId = 'low-zoom-hulls'
const labelSourceId = 'appellation-label-points'
const chateauSourceId = 'chateaux'
const lowZoomHullLayerId = 'low-zoom-hull-fill'
const lowZoomHullShadeLayerId = 'low-zoom-hull-shade'
const lowZoomHullBorderLayerId = 'low-zoom-hull-border'
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
const zoomTransitionStart = 10.00
const zoomTransitionEnd = 11.8
const detailedHoverStart = 11
const lowZoomHullIds: AppellationId[] = [
  'medoc',
  'haut-medoc',
  'saint-estephe',
  'pauillac',
  'saint-julien',
  'margaux',
  'moulis-en-medoc',
  'listrac-medoc',
  'entre-deux-mers',
  'entre-deux-mers-haut-benauge',
  'cadillac',
  'cotes-de-bordeaux-cadillac',
  'loupiac',
  'sainte-croix-du-mont',
  'premieres-cotes-de-bordeaux',
  'cotes-de-bordeaux-saint-macaire',
  'graves-de-vayres',
]

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
  const hoveredRegionKeyRef = useRef<string | null>(null)
  const hoverLeaveTimeoutRef = useRef<number | null>(null)
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
      const [bordeauxGeoJson, lowZoomHullGeoJson] = await Promise.all([
        loadBordeauxGeoJson('/data/bordeaux-display-exclusive-2026.geojson'),
        loadBordeauxGeoJson('/data/bordeaux-display-cadillac-dissolve-trial-2026.geojson'),
      ])

      if (cancelled) {
        return
      }

      setChateauxWithCommune(attachCommuneToChateaux(chateaux, bordeauxGeoJson))

      map.addSource(appellationSourceId, {
        type: 'geojson',
        data: bordeauxGeoJson,
      } satisfies GeoJSONSourceSpecification)

      map.addSource(lowZoomHullSourceId, {
        type: 'geojson',
        data: {
          ...lowZoomHullGeoJson,
          features: lowZoomHullGeoJson.features.filter(
            (feature) => typeof feature.properties?.id === 'string' &&
              lowZoomHullIds.includes(feature.properties.id as AppellationId),
          ),
        },
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
        data: createLabelPoints(appellations, bordeauxGeoJson),
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
        id: lowZoomHullLayerId,
        type: 'fill',
        source: lowZoomHullSourceId,
        paint: {
          'fill-color': appellationFillColorExpression(false),
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            zoomTransitionStart,
            0.64,
            zoomTransitionEnd,
            0,
          ],
        },
      })

      map.addLayer({
        id: lowZoomHullShadeLayerId,
        type: 'fill',
        source: lowZoomHullSourceId,
        filter: filterNone(),
        paint: {
          'fill-color': '#1c0f12',
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            zoomTransitionStart,
            0.14,
            zoomTransitionEnd,
            0,
          ],
        },
      })

      map.addLayer({
        id: lowZoomHullBorderLayerId,
        type: 'line',
        source: lowZoomHullSourceId,
        paint: {
          'line-color': 'rgba(255, 253, 247, 0.92)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 11, 1.25],
          'line-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            zoomTransitionStart,
            0.62,
            zoomTransitionEnd,
            0,
          ],
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
            zoomTransitionStart,
            [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              0.7,
              ['boolean', ['feature-state', 'hover'], false],
              0.8,
              ['in', ['get', 'id'], ['literal', lowZoomHullIds]],
              0,
              [
                'match',
                ['get', 'id'],
                ['medoc', 'haut-medoc', 'entre-deux-mers'],
                0.36,
                0.64,
              ],
            ],
            zoomTransitionEnd,
            [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              0.7,
              ['boolean', ['feature-state', 'hover'], false],
              0.8,
              [
                'match',
                ['get', 'id'],
                ['medoc', 'haut-medoc', 'entre-deux-mers'],
                0.36,
                0.64,
              ],
            ],
            13.5,
            [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              0.56,
              ['boolean', ['feature-state', 'hover'], false],
              0.62,
              [
                'match',
                ['get', 'id'],
                ['medoc', 'haut-medoc', 'entre-deux-mers'],
                0.28,
                0.48,
              ],
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
          'fill-opacity': [
            'case',
            ['in', ['get', 'id'], ['literal', lowZoomHullIds]],
            [
              'interpolate',
              ['linear'],
              ['zoom'],
              zoomTransitionStart,
              0,
              zoomTransitionEnd,
              0.1,
            ],
            0.1,
          ],
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
          'line-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            zoomTransitionStart,
            ['case', ['in', ['get', 'id'], ['literal', lowZoomHullIds]], 0, 0.34],
            zoomTransitionEnd,
            0.34,
          ],
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
            'interpolate',
            ['linear'],
            ['zoom'],
            zoomTransitionStart,
            [
              'case',
              ['in', ['get', 'id'], ['literal', lowZoomHullIds]],
              0,
              ['boolean', ['feature-state', 'selected'], false],
              0.95,
              ['boolean', ['feature-state', 'hover'], false],
              0.9,
              0.36,
            ],
            zoomTransitionEnd,
            [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              0.95,
              ['boolean', ['feature-state', 'hover'], false],
              0.9,
              0.36,
            ],
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
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 9.5, 11, 13.5],
          'text-letter-spacing': 0.02,
          'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right'],
          'text-radial-offset': 0.25,
          'text-allow-overlap': false,
          'text-ignore-placement': false,
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
      map.moveLayer(lowZoomHullLayerId, labelLayerId)
      map.moveLayer(lowZoomHullShadeLayerId, labelLayerId)
      map.moveLayer(lowZoomHullBorderLayerId, labelLayerId)

      map.on('mousemove', lowZoomHullLayerId, handleHullMouseMove)
      map.on('mouseleave', lowZoomHullLayerId, handleMouseLeave)
      map.on('click', lowZoomHullLayerId, handleClick)
      map.on('mousemove', fillLayerId, handleMouseMove)
      map.on('mouseleave', fillLayerId, handleDetailMouseLeave)
      map.on('click', fillLayerId, handleClick)

      map.fitBounds(getFeatureCollectionBounds(bordeauxGeoJson), {
        padding: { top: 90, right: 70, bottom: 80, left: 70 },
        duration: 900,
      })

      setIsReady(true)
    })

    mapRef.current = map

    function handleHullMouseMove(event: MapLayerMouseEvent) {
      const feature = pickHoverFeature(event.features)
      const id = getFeatureId(feature?.properties)

      if (!id || !isLowZoomHullActive(map)) {
        return
      }

      if (hoverLeaveTimeoutRef.current !== null) {
        window.clearTimeout(hoverLeaveTimeoutRef.current)
        hoverLeaveTimeoutRef.current = null
      }

      map.getCanvas().style.cursor = 'pointer'

      if (hoveredFeatureIdRef.current !== null) {
        setFeatureHover(map, hoveredFeatureIdRef.current, false)
        hoveredFeatureIdRef.current = null
      }

      const nextRegion = { id }
      const nextRegionKey = hoveredRegionKey(nextRegion)

      if (hoveredRegionKeyRef.current !== nextRegionKey) {
        hoveredRegionKeyRef.current = nextRegionKey
        setHoveredRegion(nextRegion)
      }
    }

    function handleMouseMove(event: MapLayerMouseEvent) {
      const feature = pickHoverFeature(event.features)
      const id = getFeatureId(feature?.properties)
      const sourceFeatureId = getSourceFeatureId(feature)

      if (!id || sourceFeatureId === null) {
        return
      }

      if (lowZoomHullIds.includes(id) && !isDetailedZoomActive(map)) {
        return
      }

      if (hoverLeaveTimeoutRef.current !== null) {
        window.clearTimeout(hoverLeaveTimeoutRef.current)
        hoverLeaveTimeoutRef.current = null
      }

      map.getCanvas().style.cursor = 'pointer'

      if (hoveredFeatureIdRef.current !== sourceFeatureId) {
        if (hoveredFeatureIdRef.current !== null) {
          setFeatureHover(map, hoveredFeatureIdRef.current, false)
        }

        hoveredFeatureIdRef.current = sourceFeatureId
        setFeatureHover(map, sourceFeatureId, true)
      }
      const nextRegion = getHoveredRegion(feature?.properties, id)
      const nextRegionKey = hoveredRegionKey(nextRegion)

      if (hoveredRegionKeyRef.current !== nextRegionKey) {
        hoveredRegionKeyRef.current = nextRegionKey
        setHoveredRegion(nextRegion)
      }
    }

    function handleMouseLeave() {
      map.getCanvas().style.cursor = ''

      if (hoverLeaveTimeoutRef.current !== null) {
        window.clearTimeout(hoverLeaveTimeoutRef.current)
      }

      hoverLeaveTimeoutRef.current = window.setTimeout(() => {
        clearHoverState()
        hoverLeaveTimeoutRef.current = null
      }, 90)
    }

    function handleDetailMouseLeave() {
      if (isLowZoomHullActive(map)) {
        return
      }

      handleMouseLeave()
    }

    function handleClick(event: MapLayerMouseEvent) {
      const id = getFeatureId(event.features?.[0]?.properties)

      if (id) {
        onSelectAppellation(id)
      }
    }

    return () => {
      cancelled = true
      if (hoverLeaveTimeoutRef.current !== null) {
        window.clearTimeout(hoverLeaveTimeoutRef.current)
        hoverLeaveTimeoutRef.current = null
      }
      clearHoverState()
      map.remove()
      mapRef.current = null
    }

    function clearHoverState() {
      if (hoveredFeatureIdRef.current !== null) {
        setFeatureHover(map, hoveredFeatureIdRef.current, false)
        hoveredFeatureIdRef.current = null
      }

      hoveredRegionKeyRef.current = null
      setHoveredRegion(null)
    }
  }, [appellations, onSelectAppellation])

  useEffect(() => {
    const map = mapRef.current

    if (!map || !isReady) {
      return
    }

    setLayerVisibility(map, 'osm-raster', layers.roadsBasemap)
    setLayerVisibility(map, lowZoomHullLayerId, layers.aocBoundaries)
    setLayerVisibility(map, lowZoomHullShadeLayerId, layers.aocBoundaries)
    setLayerVisibility(map, lowZoomHullBorderLayerId, layers.aocBoundaries)
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
      lowZoomHullLayerId,
      'fill-color',
      appellationFillColorExpression(layers.grapeEmphasis),
    )
    map.setPaintProperty(
      lowZoomHullShadeLayerId,
      'fill-color',
      '#1c0f12',
    )
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
      lowZoomHullLayerId,
      lowZoomHullIds.some((id) => filteredAppellationIds.includes(id))
        ? [
            'in',
            ['get', 'id'],
            ['literal', lowZoomHullIds.filter((id) => filteredAppellationIds.includes(id))],
          ]
        : filterNone(),
    )
    map.setFilter(
      lowZoomHullShadeLayerId,
      lowZoomHullShadeFilter(hoveredRegion, legendHoveredId, filteredAppellationIds),
    )
    map.setFilter(
      lowZoomHullBorderLayerId,
      lowZoomHullIds.some((id) => filteredAppellationIds.includes(id))
        ? [
            'in',
            ['get', 'id'],
            ['literal', lowZoomHullIds.filter((id) => filteredAppellationIds.includes(id))],
          ]
        : filterNone(),
    )
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

async function loadBordeauxGeoJson(path: string): Promise<FeatureCollection> {
  const response = await fetch(path)

  if (!response.ok) {
    throw new Error(`Failed to load Bordeaux display GeoJSON ${path}: ${response.status}`)
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
  'entre-deux-mers': [-0.12, 44.8],
  'entre-deux-mers-haut-benauge': [-0.18, 44.68],
  cadillac: [-0.32, 44.64],
  'cotes-de-bordeaux-cadillac': [-0.28, 44.7],
  loupiac: [-0.29, 44.63],
  'sainte-croix-du-mont': [-0.28, 44.6],
  'premieres-cotes-de-bordeaux': [-0.33, 44.72],
  'cotes-de-bordeaux-saint-macaire': [-0.23, 44.56],
  'graves-de-vayres': [-0.32, 44.9],
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
  medoc: [-0.924, 45.356],
  'haut-medoc': [-0.66, 44.94],
  'saint-estephe': [-0.772, 45.263],
  pauillac: [-0.748, 45.185],
  'saint-julien': [-0.735, 45.145],
  margaux: [-0.665, 45.025],
  'moulis-en-medoc': [-0.777, 45.045],
  'listrac-medoc': [-0.795, 45.095],
  'entre-deux-mers': [-0.14, 44.81],
  'entre-deux-mers-haut-benauge': [-0.21, 44.69],
  cadillac: [-0.32, 44.64],
  'cotes-de-bordeaux-cadillac': [-0.27, 44.72],
  loupiac: [-0.3, 44.63],
  'sainte-croix-du-mont': [-0.28, 44.6],
  'premieres-cotes-de-bordeaux': [-0.46, 44.83],
  'cotes-de-bordeaux-saint-macaire': [-0.172, 44.605],
  'graves-de-vayres': [-0.33, 44.9],
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
    case 'entre-deux-mers-haut-benauge':
    case 'cadillac':
    case 'loupiac':
    case 'sainte-croix-du-mont':
      return 3
    case 'haut-medoc':
    case 'premieres-cotes-de-bordeaux':
    case 'cotes-de-bordeaux-cadillac':
    case 'cotes-de-bordeaux-saint-macaire':
    case 'graves-de-vayres':
      return 2
    case 'medoc':
    case 'entre-deux-mers':
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

function hoveredRegionKey(region: HoveredRegion) {
  return [region.id, region.insee ?? region.commune ?? ''].join(':')
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

  if (lowZoomHullIds.includes(region.id)) {
    return filterNone()
  }

  return ['==', ['get', 'id'], region.id]
}

function lowZoomHullShadeFilter(
  region: HoveredRegion | null,
  legendHoveredId: AppellationId | null,
  filteredAppellationIds: AppellationId[],
): FilterSpecification {
  const activeId = region?.id ?? legendHoveredId

  if (!activeId || !lowZoomHullIds.includes(activeId)) {
    return filterNone()
  }

  if (!filteredAppellationIds.includes(activeId)) {
    return filterNone()
  }

  return ['==', ['get', 'id'], activeId]
}

function isLowZoomHullActive(map: Map) {
  return map.getZoom() < detailedHoverStart
}

function isDetailedZoomActive(map: Map) {
  return map.getZoom() >= detailedHoverStart
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
