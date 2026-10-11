import { Protocol } from 'pmtiles'
import type maplibregl from 'maplibre-gl'

let protocolRegistered = false
let manifestPromise: Promise<TileManifest> | null = null

interface TileManifest {
  version: string
  tiles: Record<string, {
    detail: { file: string; sizeBytes: number; sizeMB: string }
    hull: { file: string; sizeBytes: number; sizeMB: string }
    metadata: { file: string; sizeBytes: number; sizeKB: string }
    totalSizeBytes: number
    totalSizeMB: string
  }>
}

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
 * Get the base URL for map data assets (tiles root, not including 'current').
 * Defaults to serving locally from /tiles in development.
 * In production, set VITE_DATA_BASE_URL to your CDN tiles root (e.g. https://cdn.example.com/tiles).
 */
export function getDataBaseUrl(): string {
  return import.meta.env.VITE_DATA_BASE_URL ?? '/tiles'
}

/**
 * Load the tile manifest from current/manifest.json.
 * Cached per page load.
 */
async function loadManifest(): Promise<TileManifest> {
  if (manifestPromise) {
    return manifestPromise
  }

  manifestPromise = (async () => {
    const base = getDataBaseUrl()
    const response = await fetch(`${base}/current/manifest.json`, {
      cache: 'no-cache',
    })

    if (!response.ok) {
      throw new Error(
        `Failed to load tile manifest. Status: ${response.status}. ` +
        `Ensure you've run the data build script: npm run tiles:build`,
      )
    }

    return await response.json() as TileManifest
  })()

  return manifestPromise
}

/**
 * Get the PMTiles URL for a region's detail or hull tiles.
 * Resolves the versioned path from the manifest.
 */
export async function getPMTilesUrl(region: string, type: 'detail' | 'hull'): Promise<string> {
  const manifest = await loadManifest()
  const base = getDataBaseUrl()
  
  const regionData = manifest.tiles[region]
  if (!regionData) {
    throw new Error(`Region "${region}" not found in manifest`)
  }

  const file = regionData[type].file
  return `pmtiles://${base}/${manifest.version}/${file}`
}

/**
 * Create a vector tile source spec for a region's PMTiles.
 * The source-layer name matches tippecanoe's -l parameter (the region name).
 */
export function createPMTilesSource(
  region: string,
  type: 'detail' | 'hull',
): maplibregl.VectorSourceSpecification {
  return {
    type: 'vector',
    url: `pmtiles://__PLACEHOLDER__/${region}-${type}.pmtiles`,
    promoteId: { [region]: 'id' },
  }
}

/**
 * Get the source-layer name for a region.
 * This must match the -l parameter passed to tippecanoe in build-tiles.sh.
 */
export function getSourceLayer(region: string): string {
  return region
}

/**
 * Load the metadata GeoJSON for a region (for bounds and labels).
 * Resolves the versioned path from the manifest.
 */
export async function loadRegionMetadata(region: string): Promise<any> {
  const manifest = await loadManifest()
  const base = getDataBaseUrl()
  
  const regionData = manifest.tiles[region]
  if (!regionData) {
    throw new Error(`Region "${region}" not found in manifest`)
  }

  const file = regionData.metadata.file
  const response = await fetch(`${base}/${manifest.version}/${file}`)
  
  if (!response.ok) {
    throw new Error(
      `Failed to load region metadata for ${region}. ` +
      `Ensure you've run the data build script: npm run tiles:build`,
    )
  }
  
  return await response.json()
}

/**
 * Initialize PMTiles sources with actual URLs from the manifest.
 * Call this after adding the source to the map to update its URL.
 */
export async function initializePMTilesSource(
  map: maplibregl.Map,
  sourceId: string,
  region: string,
  type: 'detail' | 'hull',
): Promise<void> {
  const url = await getPMTilesUrl(region, type)
  const source = map.getSource(sourceId) as any
  
  if (source && source.setUrl) {
    source.setUrl(url)
  }
}

/**
 * Check if PMTiles data is available.
 * Returns true if we can load the manifest, false otherwise.
 */
export async function checkDataAvailability(): Promise<boolean> {
  try {
    await loadManifest()
    return true
  } catch {
    return false
  }
}

