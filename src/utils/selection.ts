import type {
  ExpressionSpecification,
  FilterSpecification,
  LngLatBoundsLike,
  LngLatLike,
  Map as MapLibreMap,
  PaddingOptions,
  PointLike,
} from 'maplibre-gl'
import type { FeatureCollection, Position } from 'geojson'

/** Viewport width below which the detail card becomes a bottom sheet. */
export const MOBILE_BREAKPOINT = 769
const SHEET_MARGIN = 32
const SELECTED_COLOR = '#8f1d3f'

export function isMobileViewport() {
  return window.innerWidth < MOBILE_BREAKPOINT
}

/** Expose the map for the acceptance harness only when `?test` is in the URL. */
export function exposeMapForTests(map: MapLibreMap) {
  if (new URLSearchParams(window.location.search).has('test')) {
    ;(window as unknown as { __wineMap?: MapLibreMap }).__wineMap = map
  }
}

/**
 * Adds a persistent "selected appellation" outline (light halo + wine-red line)
 * on top of every other layer of `sourceId`.
 */
export function addSelectedOutlineLayers(
  map: MapLibreMap,
  sourceId: string,
  prefix: string,
  opacity: ExpressionSpecification | number = 1,
) {
  const none: FilterSpecification = ['==', ['get', 'id'], '__none__']
  map.addLayer({
    id: `${prefix}-selection-halo`,
    type: 'line',
    source: sourceId,
    filter: none,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': 'rgba(255, 251, 242, 0.9)',
      'line-width': ['interpolate', ['linear'], ['zoom'], 7, 3.5, 12, 7],
      'line-blur': 0.6,
      'line-opacity': opacity,
    },
  })
  map.addLayer({
    id: `${prefix}-selected-outline`,
    type: 'line',
    source: sourceId,
    filter: none,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': SELECTED_COLOR,
      'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1.8, 12, 3.4],
      'line-opacity': opacity,
    },
  })
}

export function setSelectedOutline(map: MapLibreMap, prefix: string, id: string | null) {
  const filter: FilterSpecification = ['==', ['get', 'id'], id ?? '__none__']
  for (const layerId of [`${prefix}-selection-halo`, `${prefix}-selected-outline`]) {
    if (map.getLayer(layerId)) {
      map.setFilter(layerId, filter)
    }
  }
}

/** Bounds of every feature whose `properties.id` is in `ids` (a feature may be split into many parcels). */
export function boundsForIds(
  collections: Array<FeatureCollection | null | undefined>,
  ids: string[],
): [[number, number], [number, number]] | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const visit = (coords: unknown): void => {
    if (typeof (coords as Position)[0] === 'number') {
      const [x, y] = coords as Position
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      return
    }
    for (const child of coords as unknown[]) visit(child)
  }
  for (const collection of collections) {
    if (!collection) continue
    for (const feature of collection.features) {
      const id = feature.properties?.id
      if (typeof id === 'string' && ids.includes(id) && feature.geometry && 'coordinates' in feature.geometry) {
        visit(feature.geometry.coordinates)
      }
    }
    if (minX !== Infinity) break // prefer the first (most detailed) collection that has the feature
  }
  return minX === Infinity ? null : [[minX, minY], [maxX, maxY]]
}

/** Topmost appellation id rendered at `point`, checking `layerIds` (any order; MapLibre returns topmost first). */
export function pickAppellationAt(map: MapLibreMap, point: PointLike, layerIds: string[]) {
  const layers = layerIds.filter((id) => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none')
  if (layers.length === 0) return null
  for (const feature of map.queryRenderedFeatures(point, { layers })) {
    const id = feature.properties?.id
    if (typeof id === 'string' && id.length > 0) return id
  }
  return null
}

function visibleElementRect(selector: string) {
  for (const element of document.querySelectorAll<HTMLElement>(selector)) {
    const rect = element.getBoundingClientRect()
    if (element.offsetParent !== null && rect.width > 0 && rect.height > 0) return rect
  }
  return null
}

/** Top edge (viewport px) of the open mobile bottom sheet, or null. */
export function measureSheetTop() {
  const close = visibleElementRect('.mobile-close-button')
  if (!close) return null
  const button = [...document.querySelectorAll<HTMLElement>('.mobile-close-button')].find((b) => b.offsetParent !== null)
  const sheet = button?.closest<HTMLElement>('.hover-region-card')
  return sheet ? sheet.getBoundingClientRect().top : null
}

/** Padding that keeps a framed feature clear of the desktop panel/legend or the mobile sheet. */
export function selectionPadding(map: MapLibreMap): PaddingOptions {
  const canvas = map.getCanvas().getBoundingClientRect()
  if (isMobileViewport()) {
    const sheetTop = measureSheetTop() ?? canvas.top + canvas.height * 0.55
    return { top: 64, left: 28, right: 28, bottom: Math.max(48, canvas.bottom - sheetTop + 28) }
  }
  const panel = visibleElementRect('.hover-region-card')
  const legend = visibleElementRect('.region-legend')
  return {
    top: 72,
    bottom: 56,
    left: Math.max(56, (panel ? panel.right - canvas.left : 380) + 40),
    right: Math.max(56, legend ? canvas.right - legend.left + 40 : 56),
  }
}

/** Frame a feature's bounds with a real fitBounds, leaving room for overlays. */
export function fitSelection(map: MapLibreMap, bounds: LngLatBoundsLike, animate = true) {
  map.fitBounds(bounds, {
    padding: selectionPadding(map),
    maxZoom: 13,
    duration: animate ? 900 : 0,
    essential: true,
  })
}

/**
 * Mobile only: once the sheet has settled, pan (never zoom) by the minimum
 * needed so `lngLat` sits at least SHEET_MARGIN px above the sheet's top edge.
 */
export function keepAboveSheet(map: MapLibreMap, lngLat: LngLatLike) {
  if (!isMobileViewport()) return () => {}
  let cancelled = false
  let last: number | null = null
  let stableFrames = 0
  const started = performance.now()
  const tick = () => {
    if (cancelled) return
    const top = measureSheetTop()
    if (top !== null && last !== null && Math.abs(top - last) < 0.5) stableFrames += 1
    else stableFrames = 0
    last = top
    if (top === null || stableFrames < 3) {
      if (performance.now() - started < 1500) requestAnimationFrame(tick)
      return
    }
    const canvas = map.getCanvas().getBoundingClientRect()
    const point = map.project(lngLat)
    const limit = top - canvas.top - SHEET_MARGIN
    if (point.y > limit) {
      map.panBy([0, point.y - limit], { duration: 350, essential: true })
    }
  }
  requestAnimationFrame(tick)
  return () => {
    cancelled = true
  }
}
