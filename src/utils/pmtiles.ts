import { Protocol } from 'pmtiles'
import type maplibregl from 'maplibre-gl'

let protocolRegistered = false

/**
 * Register the PMTiles protocol with MapLibre GL.
 * Must be called before creating any map instances that use pmtiles:// sources.
 */
export function registerPMTilesProtocol(maplibregl: typeof import('maplibre-gl')) {
  if (protocolRegistered) {
    return
  }

  const protocol = new Protocol()
  maplibregl.addProtocol('pmtiles', protocol.tile)
  protocolRegistered = true
}

/**
 * Get the base URL for map data assets.
 * Defaults to serving locally from /tiles/ in development.
 * In production, set VITE_DATA_BASE_URL to your CDN/S3 URL.
 */
export function getDataBaseUrl(): string {
  return import.meta.env.VITE_DATA_BASE_URL ?? '/tiles'
}

/**
 * Get the PMTiles URL for a region's detail or hull tiles.
 */
export function getPMTilesUrl(region: string, type: 'detail' | 'hull'): string {
  const base = getDataBaseUrl()
  return `pmtiles://${base}/${region}-${type}.pmtiles`
}

/**
 * Create a vector tile source spec for a region's PMTiles.
 * The 'id' property is promoted to feature.id for feature-state hover.
 */
export function createPMTilesSource(
  region: string,
  type: 'detail' | 'hull',
): maplibregl.VectorSourceSpecification {
  return {
    type: 'vector',
    url: getPMTilesUrl(region, type),
    promoteId: { [region]: 'id' },
  }
}

/**
 * Load the metadata GeoJSON for a region (for bounds and labels).
 * This is a small, simplified GeoJSON file.
 */
export async function loadRegionMetadata(region: string): Promise<any> {
  const base = getDataBaseUrl()
  const response = await fetch(`${base}/${region}-metadata.json`)
  
  if (!response.ok) {
    throw new Error(
      `Failed to load region metadata for ${region}. ` +
      `Ensure you've run the data build script: npm run tiles:build`,
    )
  }
  
  return await response.json()
}

/**
 * Check if PMTiles data is available.
 * Returns true if we can load the manifest, false otherwise.
 */
export async function checkDataAvailability(): Promise<boolean> {
  try {
    const base = getDataBaseUrl()
    const response = await fetch(`${base}/manifest.json`)
    return response.ok
  } catch {
    return false
  }
}

