/**
 * Static prerendering script for SEO
 * Generates HTML files for all routes at build time
 * Runs after `vite build` without requiring GeoJSON data
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '../dist')
const indexHtmlPath = path.join(distDir, 'index.html')

const SITE_URL = 'https://sommeliermaps.com'
const DEFAULT_OG_IMAGE = '/images/og-default.png'

// Region configurations (must match src/regions.ts)
const regions = [
  {
    id: 'bordeaux',
    path: '/bordeaux',
    name: 'Bordeaux',
    country: 'France',
    hook: 'Left bank vs right bank at parcel level — Médoc communes, Saint-Émilion satellites, Graves, and the sweet wine country of Sauternes.',
  },
  {
    id: 'burgundy',
    path: '/burgundy',
    name: 'Burgundy',
    country: 'France',
    hook: 'Village, Premier Cru climats, and all 32 Grands Crus of the Côte d\u2019Or — from Chablis down to Chassagne-Montrachet.',
  },
  {
    id: 'champagne',
    path: '/champagne',
    name: 'Champagne',
    country: 'France',
    hook: 'The full AOC across Montagne de Reims, Vallée de la Marne, Côte des Blancs, and the Aube.',
  },
  {
    id: 'alsace',
    path: '/alsace',
    name: 'Alsace',
    country: 'France',
    hook: 'Alsace and Crémant d\u2019Alsace AOCs with all 51 Grand Cru sites along the Vosges foothills.',
  },
]

async function loadAppellations(regionId) {
  try {
    const appellationPath = path.resolve(
      __dirname,
      `../src/data/france/${regionId}/appellations.json`,
    )
    const data = fs.readFileSync(appellationPath, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    console.warn(`⚠️  No appellations.json for ${regionId}`)
    return []
  }
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (m) => map[m] || m)
}

function generateMetaTags(title, description, canonical, ogImage, ogImageAlt) {
  return `    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${canonical}" />
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeHtml(ogImageAlt)}" />
    
    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image" />
    <meta property="twitter:url" content="${canonical}" />
    <meta property="twitter:title" content="${escapeHtml(title)}" />
    <meta property="twitter:description" content="${escapeHtml(description)}" />
    <meta property="twitter:image" content="${ogImage}" />
    <meta property="twitter:image:alt" content="${escapeHtml(ogImageAlt)}" />`
}

function countWords(text) {
  return text.trim().split(/\s+/).length
}

function generateAppellationSummary(appellation, region) {
  const parts = []

  const name = appellation.name
  const subregion = appellation.subregion || region.name
  const style = appellation.primaryStyle || 'wine'
  const grapes =
    appellation.dominantGrapes && appellation.dominantGrapes.length > 0
      ? appellation.dominantGrapes.join(', ')
      : ''

  const article = /^[aeiou]/i.test(style) ? 'an' : 'a'
  parts.push(
    `${name} is ${article} ${style.toLowerCase()} appellation in ${subregion}, ${region.name}.`,
  )

  if (grapes) {
    parts.push(`The dominant grapes are ${grapes}.`)
  }

  if (appellation.terroir) {
    if (appellation.terroir.keySoils && appellation.terroir.keySoils.length > 0) {
      parts.push(`The key soils are ${appellation.terroir.keySoils.join(', ')}.`)
    }
    if (appellation.terroir.climate && appellation.terroir.climate.length > 0) {
      parts.push(
        `The climate is characterized by ${appellation.terroir.climate.slice(0, 3).join(', ')}.`,
      )
    }
    if (appellation.terroir.learningPoint) {
      parts.push(appellation.terroir.learningPoint)
    }
  }

  if (appellation.tastingProfile) {
    const fruits = appellation.tastingProfile.fruit || []
    const nonFruits = appellation.tastingProfile.nonFruit || []

    if (fruits.length > 0) {
      parts.push(`Fruit characteristics include ${fruits.slice(0, 4).join(', ')}.`)
    }

    if (nonFruits.length > 0) {
      parts.push(`Other aromas and flavors include ${nonFruits.slice(0, 4).join(', ')}.`)
    }

    if (
      appellation.tastingProfile.structure &&
      appellation.tastingProfile.structure.length > 0
    ) {
      parts.push(
        `Wines typically show ${appellation.tastingProfile.structure.slice(0, 3).join(', ')}.`,
      )
    }

    if (appellation.tastingProfile.ageingPotential) {
      parts.push(`Ageing potential is ${appellation.tastingProfile.ageingPotential}.`)
    }
  }

  if (appellation.examNotes && appellation.examNotes.length > 0) {
    // Add up to 2 exam notes
    appellation.examNotes.slice(0, 2).forEach((note) => {
      parts.push(note)
    })
  }

  return parts.join(' ')
}

function createHtmlWithMetadata(baseHtml, metaTags, h1, summary) {
  // Replace the existing title and description with the full metadata
  let html = baseHtml.replace(
    /<title>.*?<\/title>\s*<meta name="description"[^>]*>/,
    metaTags
  )

  // Inject visible SEO content into the body (before root div)
  // This content remains visible to users - Google sees what users see
  // Styled as an unobtrusive intro that complements the map UI
  const seoContent = `
    <!-- Prerendered SEO content (visible intro/context) -->
    <div id="prerendered-seo" class="seo-intro">
      <div class="seo-intro-content">
        <h1>${escapeHtml(h1)}</h1>
        <p>${escapeHtml(summary)}</p>
      </div>
    </div>`

  html = html.replace('<div id="root">', seoContent + '\n    <div id="root">')

  return html
}

function writeRoute(route) {
  const routePath = route.path === '/' ? '/index.html' : `${route.path}/index.html`
  const filePath = path.join(distDir, routePath)
  const dir = path.dirname(filePath)

  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, route.html, 'utf-8')
}

async function generateRoutes() {
  const baseHtml = fs.readFileSync(indexHtmlPath, 'utf-8')
  const routes = []
  const thinContentEntries = []

  // Home page
  const homeTitle = 'SommelierMaps - Interactive Wine Region Maps for WSET Study'
  const homeDescription =
    'Interactive wine region maps for WSET Level 2 and Level 3 students. Explore appellation boundaries from INAO data for Bordeaux, Burgundy, Champagne, and Alsace.'
  const homeSummary = `SommelierMaps provides interactive study maps of the world's most important wine regions, built specifically for WSET Level 2 and Level 3 students. Explore appellation boundaries from INAO data, hover any parcel to study the hierarchy, grapes, soils, and exam cues behind it. Learn the geography that matters for your wine exams.`

  const homeHtml = createHtmlWithMetadata(
    baseHtml,
    generateMetaTags(
      homeTitle,
      homeDescription,
      SITE_URL,
      `${SITE_URL}${DEFAULT_OG_IMAGE}`,
      'SommelierMaps - Interactive Wine Region Maps for WSET Study'
    ),
    'Interactive Wine Region Maps for WSET Study',
    homeSummary,
  )
  routes.push({ path: '/', html: homeHtml })

  // Region pages and appellations
  for (const region of regions) {
    // Region page
    const regionTitle = `${region.name} Wine Map - Appellation Study Guide | SommelierMaps`
    const regionDescription = `Interactive ${region.name} wine region map with appellation boundaries from INAO data. ${region.hook} For WSET Level 2 & 3 study.`
    const regionSummary = `Study the ${region.name} wine region with an interactive map showing appellations from INAO boundary data. ${region.hook} This map is designed for WSET students preparing for Level 2 and Level 3 exams.`

    const regionHtml = createHtmlWithMetadata(
      baseHtml,
      generateMetaTags(
        regionTitle,
        regionDescription,
        `${SITE_URL}${region.path}`,
        `${SITE_URL}${DEFAULT_OG_IMAGE}`,
        `${region.name} Wine Region Map`
      ),
      `${region.name} Wine Region`,
      regionSummary,
    )
    routes.push({ path: region.path, html: regionHtml })

    // Appellation pages
    const appellations = await loadAppellations(region.id)
    for (const appellation of appellations) {
      const grapes = appellation.dominantGrapes?.join(', ') || ''
      const style = appellation.primaryStyle || 'wine'
      const subregion = appellation.subregion || region.name

      const appellationTitle = `${appellation.name} - ${region.name} Wine Appellation Study Guide | SommelierMaps`
      const appellationDescription = `${appellation.name} appellation in ${subregion}, ${region.name}. Study guide with grapes, terroir, and exam notes for WSET.`
      const appellationSummary = generateAppellationSummary(appellation, region)
      const wordCount = countWords(appellationSummary)

      const appellationHtml = createHtmlWithMetadata(
        baseHtml,
        generateMetaTags(
          appellationTitle,
          appellationDescription,
          `${SITE_URL}${region.path}/${appellation.id}`,
          `${SITE_URL}${DEFAULT_OG_IMAGE}`,
          `${appellation.name} - ${region.name} Wine Appellation`
        ),
        appellation.name,
        appellationSummary,
      )

      routes.push({
        path: `${region.path}/${appellation.id}`,
        html: appellationHtml,
      })

      if (wordCount < 150) {
        thinContentEntries.push(`${region.path}/${appellation.id} (${wordCount} words)`)
      }
    }
  }

  if (thinContentEntries.length > 0) {
    console.log('\n⚠️  Thin content entries (< 150 words):')
    thinContentEntries.forEach((entry) => console.log(`  - ${entry}`))
    console.log(`\nTotal: ${thinContentEntries.length} entries need more content\n`)
  }

  return routes
}

async function generateSitemap(routes) {
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(
    (route) => `  <url>
    <loc>https://sommeliermaps.com${route.path === '/' ? '' : route.path}</loc>
    <changefreq>monthly</changefreq>
    <priority>${route.path === '/' ? '1.0' : route.path.split('/').length === 2 ? '0.8' : '0.6'}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>`

  fs.writeFileSync(path.join(distDir, 'sitemap.xml'), sitemap, 'utf-8')
  console.log('✅ Generated sitemap.xml')
}

async function generateRobotsTxt() {
  const robotsTxt = `# https://www.robotstxt.org/robotstxt.html
User-agent: *
Allow: /

Sitemap: https://sommeliermaps.com/sitemap.xml
`

  fs.writeFileSync(path.join(distDir, 'robots.txt'), robotsTxt, 'utf-8')
  console.log('✅ Generated robots.txt')
}

async function main() {
  console.log('🚀 Starting prerender...')

  if (!fs.existsSync(distDir)) {
    throw new Error('dist/ directory not found. Run `npm run build` first.')
  }

  if (!fs.existsSync(indexHtmlPath)) {
    throw new Error('dist/index.html not found. Build may have failed.')
  }

  const routes = await generateRoutes()

  console.log(`📝 Generating ${routes.length} routes...`)

  for (const route of routes) {
    writeRoute(route)
  }

  await generateSitemap(routes)
  await generateRobotsTxt()

  console.log(`\n✅ Prerender complete! Generated ${routes.length} pages.`)
  console.log('\n📋 Sample routes:')
  routes.slice(0, 10).forEach((r) => console.log(`  - ${r.path}`))
  if (routes.length > 10) {
    console.log(`  ... and ${routes.length - 10} more`)
  }
}

main().catch((error) => {
  console.error('❌ Prerender failed:', error)
  process.exit(1)
})
