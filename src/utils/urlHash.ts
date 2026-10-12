import type { Map as MapLibreMap } from 'maplibre-gl'

export interface HashCamera {
  center: [number, number]
  zoom: number
}

/**
 * Parses a `#zoom/lat/lng` URL hash (the shareable camera deep-link format)
 * into a camera position, or null when absent or malformed.
 */
export function readCameraFromHash(): HashCamera | null {
  const hash = window.location.hash.replace(/^#/, '')

  if (!hash) {
    return null
  }

  const parts = hash.split('/').map(Number)

  if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) {
    return null
  }

  const [zoom, lat, lng] = parts

  if (zoom < 0 || zoom > 24 || Math.abs(lat) > 85 || Math.abs(lng) > 180) {
    return null
  }

  return { center: [lng, lat], zoom }
}

/**
 * Keeps the URL hash in sync with the map camera so views are shareable.
 * Only writes while `routePath` is the active route, so kept-alive background
 * maps never clobber the visible region's URL.
 */
export function attachCameraHashSync(map: MapLibreMap, routePath: string) {
  map.on('moveend', () => {
    if (window.location.pathname !== routePath) {
      return
    }

    const center = map.getCenter()
    const zoom = map.getZoom()
    const hash = `#${zoom.toFixed(2)}/${center.lat.toFixed(4)}/${center.lng.toFixed(4)}`

    window.history.replaceState(null, '', `${routePath}${hash}`)
  })
}
