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

export const regions: RegionConfig[] = [
  {
    id: 'bordeaux',
    path: '/bordeaux',
    aliases: ['/burdeux', '/bourdeux'],
    name: 'Bordeaux',
    country: 'France',
    hook: 'Left bank vs right bank at parcel level — Médoc communes, Saint-Émilion satellites, Graves, and the sweet wine country of Sauternes.',
    thumbnail: '/images/home/bordeaux.jpg',
  },
  {
    id: 'burgundy',
    path: '/burgundy',
    aliases: ['/burgandy', '/bourgogne'],
    name: 'Burgundy',
    country: 'France',
    hook: 'Village, Premier Cru climats, and all 32 Grands Crus of the Côte d\u2019Or — from Chablis down to Chassagne-Montrachet.',
    thumbnail: '/images/home/burgundy.jpg',
  },
  {
    id: 'champagne',
    path: '/champagne',
    aliases: ['/champage'],
    name: 'Champagne',
    country: 'France',
    hook: 'The full AOC across Montagne de Reims, Vallée de la Marne, Côte des Blancs, and the Aube.',
    thumbnail: '/images/home/champagne.jpg',
  },
  {
    id: 'alsace',
    path: '/alsace',
    aliases: [],
    name: 'Alsace',
    country: 'France',
    hook: 'Alsace and Crémant d\u2019Alsace AOCs with all 51 Grand Cru sites along the Vosges foothills.',
    thumbnail: '/images/home/alsace.jpg',
  },
]

export function findRegionByPath(pathname: string): RegionConfig | undefined {
  return regions.find(
    (region) => region.path === pathname || region.aliases.includes(pathname),
  )
}
