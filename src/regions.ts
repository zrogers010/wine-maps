import regionsData from './data/regions.json'

export interface RegionConfig {
  id: string
  path: string
  /** Misspellings and alternate names that redirect to the canonical path. */
  aliases: string[]
  name: string
  country: string
  /** One-line hook shown on the home page card. */
  hook: string
  thumbnail: string
}

export const regions: RegionConfig[] = regionsData as RegionConfig[]

export function findRegionByPath(pathname: string): RegionConfig | undefined {
  return regions.find(
    (region) => region.path === pathname || region.aliases.includes(pathname),
  )
}
