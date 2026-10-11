/**
 * SEO metadata generation for regions and appellations
 */

interface AppellationData {
  id: string
  name: string
  region: string
  subregion?: string
  primaryStyle?: string
  dominantGrapes?: string[]
  tastingProfile?: {
    fruit?: string[]
    nonFruit?: string[]
    structure?: string[]
  }
  terroir?: {
    keySoils?: string[]
    climate?: string[]
    learningPoint?: string
  }
  examNotes?: string[]
}

interface RegionConfig {
  id: string
  name: string
  country: string
  hook: string
}

interface PageMetadata {
  title: string
  description: string
  canonical: string
  ogTitle: string
  ogDescription: string
  ogImage: string
  h1: string
  summary: string
  thinContent?: boolean
}

const SITE_URL = 'https://sommeliermaps.com'
const DEFAULT_OG_IMAGE = '/images/og-default.png'

export function getHomePageMetadata(): PageMetadata {
  return {
    title: 'SommelierMaps - Interactive Wine Region Maps for WSET Study',
    description:
      'Master wine geography with interactive maps of Bordeaux, Burgundy, Champagne, and Alsace. Official INAO appellation boundaries for WSET Level 2 and Level 3 students.',
    canonical: SITE_URL,
    ogTitle: 'SommelierMaps - Interactive Wine Region Maps for WSET Study',
    ogDescription:
      'Master wine geography with interactive maps of Bordeaux, Burgundy, Champagne, and Alsace. Official INAO appellation boundaries for WSET Level 2 and Level 3 students.',
    ogImage: `${SITE_URL}${DEFAULT_OG_IMAGE}`,
    h1: 'Wine Region Maps',
    summary: `SommelierMaps provides interactive study maps of the world's most important wine regions, built specifically for WSET Level 2 and Level 3 students. Explore official appellation boundaries from INAO data, hover any parcel to study the hierarchy, grapes, soils, and exam cues behind it. Learn the geography that matters for your wine exams.`,
  }
}

export function getRegionPageMetadata(region: RegionConfig): PageMetadata {
  const title = `${region.name} Wine Map - Appellations & Study Guide | SommelierMaps`
  const description = `Interactive ${region.name} wine region map with official INAO appellation boundaries. ${region.hook} Perfect for WSET Level 2 & 3 study.`

  return {
    title,
    description,
    canonical: `${SITE_URL}${region.id}`,
    ogTitle: `${region.name} Wine Region Map`,
    ogDescription: description,
    ogImage: `${SITE_URL}/images/og-${region.id}.png`,
    h1: `${region.name} Wine Region`,
    summary: `Study the ${region.name} wine region with an interactive map showing all official appellations. ${region.hook} This map uses official INAO boundary data and is designed specifically for WSET students preparing for Level 2 and Level 3 exams.`,
  }
}

export function getAppellationPageMetadata(
  appellation: AppellationData,
  region: RegionConfig,
): PageMetadata {
  const title = `${appellation.name} AOC - ${region.name} Wine Study Guide | SommelierMaps`

  // Generate description from structured data
  const grapes = appellation.dominantGrapes?.join(', ') || ''
  const style = appellation.primaryStyle || 'wine'
  const subregion = appellation.subregion || region.name

  const description = `${appellation.name} appellation in ${subregion}, ${region.name}. ${style} from ${grapes}. Official boundaries, tasting notes, and exam study guide for WSET.`

  // Generate summary from available data
  const summary = generateAppellationSummary(appellation, region)
  const thinContent = summary.length < 150

  return {
    title,
    description,
    canonical: `${SITE_URL}/${region.id}/${appellation.id}`,
    ogTitle: `${appellation.name} - ${region.name}`,
    ogDescription: description,
    ogImage: `${SITE_URL}/images/og-${region.id}.png`,
    h1: appellation.name,
    summary,
    thinContent,
  }
}

function generateAppellationSummary(
  appellation: AppellationData,
  region: RegionConfig,
): string {
  const parts: string[] = []

  // Opening
  const name = appellation.name
  const subregion = appellation.subregion || region.name
  const style = appellation.primaryStyle || 'wine'
  const grapes =
    appellation.dominantGrapes && appellation.dominantGrapes.length > 0
      ? appellation.dominantGrapes.join(', ')
      : ''

  parts.push(
    `${name} is ${getArticle(style)} ${style.toLowerCase()} appellation in ${subregion}, ${region.name}.`,
  )

  if (grapes) {
    parts.push(`The dominant grapes are ${grapes}.`)
  }

  // Terroir
  if (appellation.terroir) {
    if (appellation.terroir.keySoils && appellation.terroir.keySoils.length > 0) {
      parts.push(`The terroir features ${appellation.terroir.keySoils.join(', ')} soils.`)
    }
    if (appellation.terroir.learningPoint) {
      parts.push(appellation.terroir.learningPoint)
    }
  }

  // Tasting profile
  if (appellation.tastingProfile) {
    const fruits = appellation.tastingProfile.fruit || []
    const nonFruits = appellation.tastingProfile.nonFruit || []

    if (fruits.length > 0 || nonFruits.length > 0) {
      const flavorNotes = [...fruits.slice(0, 3), ...nonFruits.slice(0, 2)]
      parts.push(`Typical tasting notes include ${flavorNotes.join(', ')}.`)
    }

    if (
      appellation.tastingProfile.structure &&
      appellation.tastingProfile.structure.length > 0
    ) {
      parts.push(
        `Wines typically show ${appellation.tastingProfile.structure.slice(0, 2).join(', ')}.`,
      )
    }
  }

  // Exam notes
  if (appellation.examNotes && appellation.examNotes.length > 0) {
    parts.push(appellation.examNotes[0])
  }

  return parts.join(' ')
}

function getArticle(word: string): string {
  const vowels = ['a', 'e', 'i', 'o', 'u']
  return vowels.includes(word[0]?.toLowerCase()) ? 'an' : 'a'
}

export function generateMetaTags(metadata: PageMetadata): string {
  return `    <title>${escapeHtml(metadata.title)}</title>
    <meta name="description" content="${escapeHtml(metadata.description)}" />
    <link rel="canonical" href="${metadata.canonical}" />
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${metadata.canonical}" />
    <meta property="og:title" content="${escapeHtml(metadata.ogTitle)}" />
    <meta property="og:description" content="${escapeHtml(metadata.ogDescription)}" />
    <meta property="og:image" content="${metadata.ogImage}" />
    
    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image" />
    <meta property="twitter:url" content="${metadata.canonical}" />
    <meta property="twitter:title" content="${escapeHtml(metadata.ogTitle)}" />
    <meta property="twitter:description" content="${escapeHtml(metadata.ogDescription)}" />
    <meta property="twitter:image" content="${metadata.ogImage}" />`
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (m) => map[m] || m)
}
