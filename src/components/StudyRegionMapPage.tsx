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
import {
  flyToBounds,
  LEGEND_PREVIEW_PADDING,
  OVERVIEW_PADDING,
  OverviewControl,
} from '../utils/camera'
import { getFeatureCollectionBounds } from '../utils/geo'
import { createAtlasMapStyle } from '../utils/mapStyles'

type SourceFeatureId = string | number

export interface StudyRegionMetadata {
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
  notableProducers?: string[]
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
}

interface LegendGroup {
  title: string
  ids: string[]
}

interface HoveredRegion {
  id: string
  commune?: string
  insee?: string
}

interface StudyRegionMapPageProps {
  appellations: StudyRegionMetadata[]
  colors: Record<string, string>
  detailDataPath: string
  emptyCardTitle: string
  hullDataPath: string
  legendAriaLabel: string
  legendGroups: LegendGroup[]
  legendFitMaxZoomById?: Record<string, number>
  labelMinZoom?: number
  sharedGeometryIds?: Record<string, string>
  sourceBadge: string
}

const zoomTransitionStart = 9.8
const detailedHoverStart = 10.5
const zoomTransitionEnd = 10.8

export function StudyRegionMapPage({
  appellations,
  colors,
  detailDataPath,
  emptyCardTitle,
  hullDataPath,
  legendAriaLabel,
  legendFitMaxZoomById = {},
  legendGroups,
  labelMinZoom = 0,
  sharedGeometryIds = {},
  sourceBadge,
}: StudyRegionMapPageProps) {
  const sourcePrefix = emptyCardTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const detailSourceId = `${sourcePrefix}-detail`
  const hullSourceId = `${sourcePrefix}-hulls`
  const labelSourceId = `${sourcePrefix}-labels`
  const hullLayerId = `${sourcePrefix}-hull-fill`
  const hullShadeLayerId = `${sourcePrefix}-hull-shade`
  const hullBorderLayerId = `${sourcePrefix}-hull-border`
  const detailFillLayerId = `${sourcePrefix}-fill`
  const appellationShadeLayerId = `${sourcePrefix}-appellation-shade`
  const communeShadeLayerId = `${sourcePrefix}-commune-shade`
  const communeLineLayerId = `${sourcePrefix}-commune-lines`
  const lineLayerId = `${sourcePrefix}-lines`
  const labelLayerId = `${sourcePrefix}-labels`

  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const overviewBoundsRef = useRef<[[number, number], [number, number]] | null>(null)
  const hullGeoJsonRef = useRef<FeatureCollection | null>(null)
  const hoveredFeatureIdRef = useRef<SourceFeatureId | null>(null)
  const hoveredRegionKeyRef = useRef<string | null>(null)
  const hoverLeaveTimeoutRef = useRef<number | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [hoveredRegion, setHoveredRegion] = useState<HoveredRegion | null>(null)
  const [legendHoveredId, setLegendHoveredId] = useState<string | null>(null)
  const [subregionHoveredIds, setSubregionHoveredIds] = useState<string[] | null>(null)

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
      center: [4.25, 48.85],
      zoom: 8,
      minZoom: 6.5,
      maxZoom: 14,
      attributionControl: false,
      fadeDuration: 180,
    })

    // Gentler wheel steps make trackpad/mouse zooming feel fluid instead of jumpy.
    map.scrollZoom.setWheelZoomRate(1 / 700)
    map.scrollZoom.setZoomRate(1 / 140)

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left')
    map.addControl(
      new OverviewControl(() => {
        const bounds = overviewBoundsRef.current
        if (bounds) {
          flyToBounds(map, bounds, { padding: OVERVIEW_PADDING })
        }
      }),
      'bottom-left',
    )
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: 'SommelierMaps dev data',
      }),
      'bottom-right',
    )

    map.on('load', async () => {
      const [detailGeoJson, hullGeoJson] = await Promise.all([
        loadGeoJson(detailDataPath),
        loadGeoJson(hullDataPath),
      ])

      if (cancelled) {
        return
      }

      hullGeoJsonRef.current = hullGeoJson

      map.addSource(detailSourceId, {
        type: 'geojson',
        data: detailGeoJson,
      } satisfies GeoJSONSourceSpecification)

      map.addSource(hullSourceId, {
        type: 'geojson',
        data: hullGeoJson,
      } satisfies GeoJSONSourceSpecification)

      map.addSource(labelSourceId, {
        type: 'geojson',
        data: createLabelPoints(hullGeoJson, appellations),
      } satisfies GeoJSONSourceSpecification)

      map.addLayer({
        id: hullLayerId,
        type: 'fill',
        source: hullSourceId,
        paint: {
          'fill-color': fillColorExpression(colors),
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            zoomTransitionStart,
            0.72,
            zoomTransitionEnd,
            0,
          ],
        },
      })

      map.addLayer({
        id: hullShadeLayerId,
        type: 'fill',
        source: hullSourceId,
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
        id: hullBorderLayerId,
        type: 'line',
        source: hullSourceId,
        paint: {
          'line-color': 'rgba(96, 65, 45, 0.52)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.65, 11, 1.15],
          'line-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            zoomTransitionStart,
            0.54,
            zoomTransitionEnd,
            0,
          ],
        },
      })

      map.addLayer({
        id: detailFillLayerId,
        type: 'fill',
        source: detailSourceId,
        paint: {
          'fill-color': fillColorExpression(colors),
          // Fade in across the same span the hulls fade out for one smooth crossfade.
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            zoomTransitionStart,
            0,
            zoomTransitionEnd,
            ['case', ['boolean', ['feature-state', 'hover'], false], 0.86, 0.68],
            13.5,
            ['case', ['boolean', ['feature-state', 'hover'], false], 0.66, 0.52],
          ],
        },
      })

      map.addLayer({
        id: appellationShadeLayerId,
        type: 'fill',
        source: detailSourceId,
        filter: filterNone(),
        paint: {
          'fill-color': '#1c0f12',
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            zoomTransitionStart,
            0,
            zoomTransitionEnd,
            0.08,
          ],
        },
      })

      map.addLayer({
        id: communeShadeLayerId,
        type: 'fill',
        source: detailSourceId,
        filter: filterNone(),
        paint: {
          'fill-color': '#1c0f12',
          'fill-opacity': 0.2,
        },
      })

      map.addLayer({
        id: communeLineLayerId,
        type: 'line',
        source: detailSourceId,
        paint: {
          'line-color': 'rgba(68, 48, 36, 0.64)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.45, 11, 0.85],
          'line-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            zoomTransitionStart,
            0,
            zoomTransitionEnd,
            0.34,
          ],
        },
      })

      map.addLayer({
        id: lineLayerId,
        type: 'line',
        source: detailSourceId,
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            '#261318',
            'rgba(255, 255, 255, 0.32)',
          ],
          'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2.4, 0.35],
          'line-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            zoomTransitionStart,
            0,
            zoomTransitionEnd,
            ['case', ['boolean', ['feature-state', 'hover'], false], 0.9, 0.36],
          ],
        },
      })

      map.addLayer({
        id: labelLayerId,
        type: 'symbol',
        source: labelSourceId,
        minzoom: labelMinZoom,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 7, 9, 10.5, 12.5],
          'text-letter-spacing': 0.02,
          'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right'],
          'text-radial-offset': 0.25,
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        },
        paint: {
          'text-color': '#2d211d',
          'text-halo-color': 'rgba(255, 250, 236, 0.96)',
          'text-halo-width': 2.4,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.74, 9, 0.9, 11, 0.97],
        },
      })

      map.moveLayer(labelLayerId)
      map.moveLayer(hullLayerId, labelLayerId)
      map.moveLayer(hullShadeLayerId, labelLayerId)
      map.moveLayer(hullBorderLayerId, labelLayerId)

      map.on('mousemove', hullLayerId, handleHullMouseMove)
      map.on('mouseleave', hullLayerId, handleMouseLeave)
      map.on('mousemove', detailFillLayerId, handleMouseMove)
      map.on('mouseleave', detailFillLayerId, handleDetailMouseLeave)

      const overviewBounds = getFeatureCollectionBounds(detailGeoJson)
      overviewBoundsRef.current = overviewBounds
      map.fitBounds(overviewBounds, {
        padding: OVERVIEW_PADDING,
        duration: 1100,
        essential: true,
      })

      setIsReady(true)
    })

    mapRef.current = map

    return () => {
      cancelled = true
      if (hoverLeaveTimeoutRef.current !== null) {
        window.clearTimeout(hoverLeaveTimeoutRef.current)
      }
      clearHoverState()
      map.remove()
      mapRef.current = null
    }

    function handleHullMouseMove(event: MapLayerMouseEvent) {
      const feature = event.features?.[0]
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
        setFeatureHover(map, detailSourceId, hoveredFeatureIdRef.current, false)
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
      const feature = event.features?.[0]
      const id = getFeatureId(feature?.properties)
      const sourceFeatureId = getSourceFeatureId(feature)

      if (!id || sourceFeatureId === null || !isDetailedZoomActive(map)) {
        return
      }

      if (hoverLeaveTimeoutRef.current !== null) {
        window.clearTimeout(hoverLeaveTimeoutRef.current)
        hoverLeaveTimeoutRef.current = null
      }

      map.getCanvas().style.cursor = 'pointer'

      if (hoveredFeatureIdRef.current !== sourceFeatureId) {
        if (hoveredFeatureIdRef.current !== null) {
          setFeatureHover(map, detailSourceId, hoveredFeatureIdRef.current, false)
        }

        hoveredFeatureIdRef.current = sourceFeatureId
        setFeatureHover(map, detailSourceId, sourceFeatureId, true)
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

    function clearHoverState() {
      if (hoveredFeatureIdRef.current !== null) {
        setFeatureHover(map, detailSourceId, hoveredFeatureIdRef.current, false)
        hoveredFeatureIdRef.current = null
      }

      hoveredRegionKeyRef.current = null
      setHoveredRegion(null)
    }
  }, [
    appellations,
    colors,
    detailDataPath,
    detailFillLayerId,
    detailSourceId,
    emptyCardTitle,
    hullDataPath,
    hullLayerId,
    hullSourceId,
    hullShadeLayerId,
    hullBorderLayerId,
    appellationShadeLayerId,
    communeShadeLayerId,
    communeLineLayerId,
    lineLayerId,
    labelLayerId,
    labelMinZoom,
    labelSourceId,
  ])

  useEffect(() => {
    const map = mapRef.current

    if (!map || !isReady) {
      return
    }

    map.setFilter(
      hullShadeLayerId,
      lowZoomHullShadeFilter(hoveredRegion, legendHoveredId, sharedGeometryIds),
    )
    map.setFilter(
      appellationShadeLayerId,
      hoveredRegion
        ? ['==', ['get', 'id'], displayGeometryId(hoveredRegion.id, sharedGeometryIds)]
        : legendHoveredId
          ? ['==', ['get', 'id'], displayGeometryId(legendHoveredId, sharedGeometryIds)]
          : filterNone(),
    )
    map.setFilter(
      communeShadeLayerId,
      hoveredRegion ? communeShadeFilter(hoveredRegion) : filterNone(),
    )
  }, [
    appellationShadeLayerId,
    communeShadeLayerId,
    hoveredRegion,
    hullShadeLayerId,
    isReady,
    legendHoveredId,
    sharedGeometryIds,
  ])

  useEffect(() => {
    const map = mapRef.current
    const hullGeoJson = hullGeoJsonRef.current

    if (!map || !isReady || !hullGeoJson || !subregionHoveredIds?.length) {
      return
    }

    const displayIds = subregionHoveredIds.map((id) => displayGeometryId(id, sharedGeometryIds))
    const features = hullGeoJson.features.filter(
      (feature) =>
        typeof feature.properties?.id === 'string' &&
        displayIds.includes(feature.properties.id),
    )

    if (features.length === 0) {
      return
    }

    flyToBounds(
      map,
      getFeatureCollectionBounds({
        type: 'FeatureCollection',
        features,
      }),
      {
        padding: LEGEND_PREVIEW_PADDING,
        maxZoom: maxZoomForIds(subregionHoveredIds, legendFitMaxZoomById, sharedGeometryIds, 10.15),
        speed: 1.4,
      },
    )
  }, [isReady, legendFitMaxZoomById, sharedGeometryIds, subregionHoveredIds])

  useEffect(() => {
    const map = mapRef.current
    const hullGeoJson = hullGeoJsonRef.current

    if (!map || !isReady || !hullGeoJson || !legendHoveredId) {
      return
    }

    const displayId = displayGeometryId(legendHoveredId, sharedGeometryIds)
    const features = hullGeoJson.features.filter(
      (candidate) => candidate.properties?.id === displayId,
    )

    if (features.length === 0) {
      return
    }

    flyToBounds(
      map,
      getFeatureCollectionBounds({
        type: 'FeatureCollection',
        features,
      }),
      {
        padding: LEGEND_PREVIEW_PADDING,
        maxZoom: maxZoomForIds([legendHoveredId], legendFitMaxZoomById, sharedGeometryIds, 11.8),
        speed: 1.5,
      },
    )
  }, [isReady, legendFitMaxZoomById, legendHoveredId, sharedGeometryIds])

  return (
    <div className="map-only-shell">
      <div className="map-container" ref={containerRef} />
      <StudyHoverCard
        appellation={activeAppellation}
        emptyCardTitle={emptyCardTitle}
        region={activeRegion}
      />
      <div className="map-source-badge">{sourceBadge}</div>
      <aside className="region-legend" aria-label={legendAriaLabel}>
        {legendGroups.map((group) => (
          <section className="region-legend-group" key={group.title}>
            <h2
              onMouseEnter={() => setSubregionHoveredIds(group.ids)}
              onMouseLeave={() => setSubregionHoveredIds(null)}
            >
              {group.title}
            </h2>
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
                      style={{ backgroundColor: colors[appellation.id] }}
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

function StudyHoverCard({
  appellation,
  emptyCardTitle,
  region,
}: {
  appellation: StudyRegionMetadata | null | undefined
  emptyCardTitle: string
  region: HoveredRegion | null
}) {
  if (!appellation || !region) {
    return (
      <aside className="hover-region-card is-empty">
        <span className="hover-card-kicker">{emptyCardTitle}</span>
        <strong>Hover the map or legend to explore an appellation</strong>
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
      <ul className="hierarchy-list">
        <li>
          <span>Country</span>
          <strong>{appellation.country}</strong>
        </li>
        <li>
          <span>Region</span>
          <strong>{appellation.region}</strong>
        </li>
        <li>
          <span>Subregion</span>
          <strong>{appellation.subregion}</strong>
        </li>
        <li>
          <span>Appellation / AOC</span>
          <strong>{appellation.name}</strong>
        </li>
      </ul>
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
        {studyCuesForAppellation(appellation).map((cue) => (
          <div className="study-cue-row" key={cue.label}>
            <strong>{cue.label}</strong>
            <span className="study-cue-details">
              <span>
                <b>Visual:</b> {cue.visual}
              </span>
              <span>
                <b>Taste:</b> {cue.tasting}
              </span>
            </span>
          </div>
        ))}
      </div>
      <p>{appellation.terroir.learningPoint}</p>
      {appellation.notableProducers && appellation.notableProducers.length > 0 ? (
        <section className="chateau-section">
          <h3>Notable producers</h3>
          <ul className="chateau-list">
            {appellation.notableProducers.map((producer) => (
              <li key={producer}>
                <strong>{producer}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
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

function createLabelPoints(
  geoJson: FeatureCollection,
  appellations: StudyRegionMetadata[],
): FeatureCollection {
  const largestFeatureById = new Map<string, Feature<Geometry>>()

  for (const feature of geoJson.features) {
    const id = getFeatureId(feature.properties) ?? String(feature.id)
    const largestFeature = largestFeatureById.get(id)

    if (!largestFeature || getFeatureArea(feature) > getFeatureArea(largestFeature)) {
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
          name: appellations.find((appellation) => appellation.id === id)?.name ?? id,
        },
        geometry: {
          type: 'Point',
          coordinates: pointOnFeature(feature as Feature<Geometry>).geometry.coordinates,
        },
      })),
  }
}

function fillColorExpression(colors: Record<string, string>): ExpressionSpecification {
  return [
    'match',
    ['get', 'id'],
    ...Object.entries(colors).flatMap(([id, color]) => [id, color]),
    '#8c6f4f',
  ] as unknown as ExpressionSpecification
}

function getFeatureArea(feature: Feature<Geometry>) {
  return area(feature)
}

function setFeatureHover(
  map: MapLibreMap,
  source: string,
  id: SourceFeatureId,
  isHovered: boolean,
) {
  map.setFeatureState({ source, id }, { hover: isHovered })
}

function getHoveredRegion(properties: unknown, id: string): HoveredRegion {
  return {
    id,
    commune: getStringProperty(properties, 'commune'),
    insee: getStringProperty(properties, 'insee'),
  }
}

function hoveredRegionKey(region: HoveredRegion) {
  return [region.id, region.insee ?? '', region.commune ?? ''].join('|')
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

  return filterNone()
}

function lowZoomHullShadeFilter(
  region: HoveredRegion | null,
  legendHoveredId: string | null,
  sharedGeometryIds: Record<string, string>,
): FilterSpecification {
  const activeId = region?.id ?? legendHoveredId
  return activeId
    ? ['==', ['get', 'id'], displayGeometryId(activeId, sharedGeometryIds)]
    : filterNone()
}

function displayGeometryId(id: string, sharedGeometryIds: Record<string, string>) {
  return sharedGeometryIds[id] ?? id
}

function maxZoomForIds(
  ids: string[],
  maxZoomById: Record<string, number>,
  sharedGeometryIds: Record<string, string>,
  fallback: number,
) {
  const values = ids
    .flatMap((id) => [id, displayGeometryId(id, sharedGeometryIds)])
    .map((id) => maxZoomById[id])
    .filter((value): value is number => typeof value === 'number')

  return values.length > 0 ? Math.min(...values) : fallback
}

function isLowZoomHullActive(map: MapLibreMap) {
  return map.getZoom() < detailedHoverStart
}

function isDetailedZoomActive(map: MapLibreMap) {
  return map.getZoom() >= detailedHoverStart
}

function getFeatureId(properties: unknown) {
  if (!properties || typeof properties !== 'object' || !('id' in properties)) {
    return null
  }

  const id = (properties as { id?: unknown }).id
  return typeof id === 'string' ? id : null
}

function getSourceFeatureId(feature: { id?: unknown } | undefined) {
  if (feature?.id === undefined) {
    return null
  }

  return typeof feature.id === 'string' || typeof feature.id === 'number'
    ? feature.id
    : null
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

interface StudyCue {
  label: string
  visual: string
  tasting: string
}

function studyCuesForAppellation(appellation: StudyRegionMetadata): StudyCue[] {
  const grapeCues = [...new Set([...appellation.dominantGrapes, ...appellation.importantGrapes])]
    .slice(0, 3)
    .map((grape) => grapeStudyCue(grape, appellation))

  return [...grapeCues, wineStyleStudyCue(appellation)]
}

function grapeStudyCue(grape: string, appellation: StudyRegionMetadata): StudyCue {
  const normalized = grape.toLowerCase()

  if (normalized.includes('chardonnay')) {
    return {
      label: grape,
      visual: 'pale lemon to medium gold',
      tasting: cueTasting(appellation),
    }
  }

  if (normalized.includes('pinot noir')) {
    return {
      label: grape,
      visual: 'pale gold in blanc de noirs; salmon-pink for rosé',
      tasting: cueTasting(appellation),
    }
  }

  if (normalized.includes('meunier')) {
    return {
      label: grape,
      visual: 'pale lemon to gold; rosé possible in blends',
      tasting: cueTasting(appellation),
    }
  }

  return {
    label: grape,
    visual: 'variety-dependent color and intensity cue',
    tasting: cueTasting(appellation),
  }
}

function wineStyleStudyCue(appellation: StudyRegionMetadata): StudyCue {
  return {
    label: 'Champagne method',
    visual: 'persistent bubbles, pale lemon to gold; rosé varies salmon to pink',
    tasting: cueTasting(appellation),
  }
}

function cueTasting(appellation: StudyRegionMetadata) {
  return [
    ...appellation.tastingProfile.fruit.slice(0, 2),
    ...appellation.tastingProfile.nonFruit.slice(0, 2),
    ...appellation.tastingProfile.structure.slice(0, 1),
  ].join(', ')
}
