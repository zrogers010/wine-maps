import { lazy, Suspense, useEffect, useState, useRef } from 'react'
import { Link } from './components/Link'
import { findRegionByPath, regions, type RegionConfig } from './regions'
import { navigate, usePathname } from './router'
import { getCanonicalRedirect, parseRoute } from './utils/routes'
import type { AppellationId } from './types/wine'
import { trackRegionView, trackPageView } from './utils/analytics'
import { getEmailCaptureProvider } from './services/emailCapture'
import { EmailSignupCard } from './components/EmailSignupCard'
import type { ComponentType, ReactNode } from 'react'
import './App.css'

type RegionComponentType = ComponentType<{ initialSelectedId?: AppellationId }>

// Each region (and MapLibre/turf) is its own chunk, so the home page and the
// first map route only download and evaluate what they render.
const regionComponents: Record<string, RegionComponentType> = {
  bordeaux: lazy(() => import('./components/AppShell').then((m) => ({ default: m.AppShell as RegionComponentType }))),
  burgundy: lazy(() => import('./components/BurgundyPage').then((m) => ({ default: m.BurgundyPage as RegionComponentType }))),
  champagne: lazy(() => import('./components/ChampagnePage').then((m) => ({ default: m.ChampagnePage as RegionComponentType }))),
  alsace: lazy(() => import('./components/AlsacePage').then((m) => ({ default: m.AlsacePage as RegionComponentType }))),
}

function App() {
  const rawPathname = usePathname()
  const pathname = normalizePath(rawPathname)
  
  // Parse route to check for region/appellation paths
  const route = parseRoute(pathname)
  const region = route?.region || findRegionByPath(pathname)
  const appellationId = route?.appellationId || null
  
  const lastTrackedRegionRef = useRef<string | null>(null)
  const lastTrackedPathRef = useRef<string | null>(null)
  const emailProvider = getEmailCaptureProvider()
  // Regions stay mounted after their first visit, so switching back is
  // instant and each map keeps its camera, hover, and loaded data.
  const [visitedRegionIds, setVisitedRegionIds] = useState<string[]>([])

  if (region && !visitedRegionIds.includes(region.id)) {
    // Adjusting state during render (per React docs) so the newly visited
    // region mounts in the same pass.
    setVisitedRegionIds([...visitedRegionIds, region.id])
  }

  useEffect(() => {
    // Check for canonical redirects (aliases)
    const canonicalPath = getCanonicalRedirect(pathname)
    if (canonicalPath) {
      navigate(canonicalPath + window.location.search + window.location.hash, { replace: true })
      return
    }

    // Normalize trailing slashes
    if (rawPathname !== pathname) {
      navigate(pathname + window.location.search + window.location.hash, { replace: true })
    }
  }, [pathname, rawPathname])

  useEffect(() => {
    if (pathname !== lastTrackedPathRef.current) {
      lastTrackedPathRef.current = pathname
      const title = region
        ? `${region.name} Wine Region Map | SommelierMaps`
        : pathname === '/'
          ? 'Wine Region Maps | SommelierMaps'
          : 'SommelierMaps'
      trackPageView(pathname, title)
    }

    if (region && region.id !== lastTrackedRegionRef.current) {
      lastTrackedRegionRef.current = region.id
      trackRegionView(region.id)
    } else if (!region) {
      lastTrackedRegionRef.current = null
    }
  }, [region, pathname])

  const visitedRegions = regions.filter((candidate) =>
    visitedRegionIds.includes(candidate.id),
  )

  return (
    <AppFrame activePath={region?.path ?? pathname}>
      {visitedRegions.map((candidate) => {
        const RegionComponent = regionComponents[candidate.id]
        const isActive = candidate.id === region?.id
        const selectedId: AppellationId | undefined = 
          isActive && appellationId ? (appellationId as AppellationId) : undefined

        return (
          <div key={candidate.id} hidden={!isActive}>
            <Suspense fallback={<div className="region-loading" aria-busy="true" />}>
              <RegionComponent initialSelectedId={selectedId} />
            </Suspense>
          </div>
        )
      })}
      {!region && pathname === '/' ? <RegionIndexPage /> : null}
      {!region && pathname !== '/' ? <NotFoundPage /> : null}
      {region && emailProvider ? (
        <EmailSignupCard
          key={region.id}
          regionName={region.name}
          regionSlug={region.id}
          provider={emailProvider}
        />
      ) : null}
    </AppFrame>
  )
}

function AppFrame({
  activePath,
  children,
}: {
  activePath: string
  children: ReactNode
}) {
  return (
    <>
      <nav className="region-top-nav" aria-label="Wine region navigation">
        <Link className="region-top-nav-brand" href="/">
          SommelierMaps
        </Link>
        <div className="region-top-nav-links">
          {regions.map((region) => (
            <Link
              key={region.id}
              className={activePath === region.path ? 'is-active' : undefined}
              href={region.path}
            >
              {region.name}
            </Link>
          ))}
        </div>
      </nav>
      {children}
    </>
  )
}

function RegionIndexPage() {
  const countries = [...new Set(regions.map((region) => region.country))]

  return (
    <main className="region-index-page">
      <section className="region-index-hero">
        <span className="region-index-kicker">SommelierMaps</span>
        <h1>Interactive Wine Region Maps for WSET Study</h1>
        <p className="hero-lead">
          Master wine geography with interactive maps of the world's most important
          wine regions. Built specifically for WSET Level 2 and Level 3 students.
        </p>
      </section>

      {countries.map((country) => (
        <section className="region-index-country" key={country}>
          <h2>{country}</h2>
          <div className="region-card-grid">
            {regions
              .filter((region) => region.country === country)
              .map((region) => (
                <RegionCard key={region.id} region={region} />
              ))}
          </div>
        </section>
      ))}

      <section className="wset-explainer">
        <h2>Why SommelierMaps?</h2>
        <p>
          WSET exams test your knowledge of wine geography, appellations, and terroir.
          SommelierMaps provides interactive study tools that bring these concepts to
          life. Each map uses INAO boundary data to show you exactly where appellations
          are located, what makes them unique, and how they relate to neighboring
          regions.
        </p>
        <p>
          Whether you're studying Left Bank vs Right Bank in Bordeaux, memorizing
          Burgundy's Grand Cru climats, or learning the geography of Champagne's
          sub-regions, our maps help you visualize and remember the key details for
          your WSET Level 2 or Level 3 exam.
        </p>
      </section>

      <section className="inao-attribution">
        <p>
          <small>
            Map boundary data from INAO (Institut national de l'origine et de la
            qualité). Boundaries are informational and not official survey-grade data.
          </small>
        </p>
      </section>
    </main>
  )
}

// Thumbnails are static, build-generated SVGs (public/thumbnails, see
// scripts/generate-region-svgs.mjs). They are fetched from our own origin and
// inlined so they inherit page styling; nothing user-controlled reaches them.
const thumbnailCache = new Map<string, Promise<string>>()

function loadThumbnail(regionId: string) {
  let pending = thumbnailCache.get(regionId)
  if (!pending) {
    pending = fetch(`/thumbnails/${regionId}.svg`)
      .then((response) => (response.ok ? response.text() : ''))
      .then((text) => (text.trimStart().startsWith('<svg') ? text : ''))
      .catch(() => '')
    thumbnailCache.set(regionId, pending)
  }
  return pending
}

function RegionCard({ region }: { region: RegionConfig }) {
  const [regionSVG, setRegionSVG] = useState('')

  useEffect(() => {
    let cancelled = false
    void loadThumbnail(region.id).then((svg) => {
      if (!cancelled) setRegionSVG(svg)
    })
    return () => {
      cancelled = true
    }
  }, [region.id])

  return (
    <Link className="region-card" href={region.path}>
      <span className="region-card-media" dangerouslySetInnerHTML={{ __html: regionSVG }} />
      <span className="region-card-body">
        <strong>{region.name}</strong>
        <span>{region.hook}</span>
      </span>
    </Link>
  )
}

function NotFoundPage() {
  return (
    <main className="region-index-page">
      <section className="region-index-hero">
        <span className="region-index-kicker">SommelierMaps</span>
        <h1>Region Not Found</h1>
        <p>This wine-region map is not available yet.</p>
        <Link className="region-home-link" href="/">
          Browse all regions
        </Link>
      </section>
    </main>
  )
}

function normalizePath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, '')
  return normalized || '/'
}

export default App
