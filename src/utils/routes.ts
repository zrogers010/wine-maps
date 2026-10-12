/**
 * Route utilities for region and appellation paths
 */

import { regions, type RegionConfig } from '../regions'

export interface AppellationRoute {
  region: RegionConfig
  appellationId: string
}

/**
 * Parse a pathname into region and optional appellation
 * Examples:
 *   /bordeaux -> { region, appellationId: null }
 *   /bordeaux/pauillac -> { region, appellationId: 'pauillac' }
 */
export function parseRoute(
  pathname: string,
): { region: RegionConfig; appellationId: string | null } | null {
  // Normalize path
  const normalized = pathname.replace(/\/+$/, '') || '/'

  if (normalized === '/') {
    return null
  }

  const parts = normalized.split('/').filter(Boolean)

  if (parts.length === 0) {
    return null
  }

  // Try to find region
  const regionPath = `/${parts[0]}`
  const region = regions.find(
    (r: RegionConfig) => r.path === regionPath || r.aliases.includes(regionPath),
  )

  if (!region) {
    return null
  }

  // Check if there's an appellation path
  const appellationId = parts[1] || null

  return { region, appellationId }
}

/**
 * Build a canonical path for region + optional appellation
 */
export function buildPath(regionId: string, appellationId?: string): string {
  const region = regions.find((r: RegionConfig) => r.id === regionId)
  if (!region) {
    return '/'
  }

  if (appellationId) {
    return `${region.path}/${appellationId}`
  }

  return region.path
}

/**
 * Check if a path should redirect to a canonical path
 */
export function getCanonicalRedirect(pathname: string): string | null {
  const route = parseRoute(pathname)

  if (!route) {
    return null
  }

  // If region has an alias match, redirect to canonical path
  const normalized = pathname.replace(/\/+$/, '') || '/'
  const parts = normalized.split('/').filter(Boolean)
  const regionPath = `/${parts[0]}`

  if (route.region.aliases.includes(regionPath)) {
    const canonical = buildPath(route.region.id, route.appellationId || undefined)
    return canonical
  }

  return null
}
