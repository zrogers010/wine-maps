import { useEffect, useState, useRef } from 'react'
import { AlsacePage } from './components/AlsacePage'
import { AppShell } from './components/AppShell'
import { BurgundyPage } from './components/BurgundyPage'
import { ChampagnePage } from './components/ChampagnePage'
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

const regionComponents: Record<string, ComponentType<{ initialSelectedId?: AppellationId }>> = {
  bordeaux: AppShell,
  burgundy: BurgundyPage as ComponentType<{ initialSelectedId?: AppellationId }>,
  champagne: ChampagnePage as ComponentType<{ initialSelectedId?: AppellationId }>,
  alsace: AlsacePage as ComponentType<{ initialSelectedId?: AppellationId }>,
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
      navigate(canonicalPath + window.location.hash, { replace: true })
      return
    }

    // Normalize trailing slashes
    if (rawPathname !== pathname) {
      navigate(pathname + window.location.hash, { replace: true })
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
            <RegionComponent initialSelectedId={selectedId} />
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

function RegionCard({ region }: { region: RegionConfig }) {
  const regionSVGs: Record<string, React.ReactElement> = {
    bordeaux: (
      <svg viewBox="0 0 120 180" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M60,10 L80,25 L90,45 L95,70 L100,95 L105,120 L100,145 L90,165 L70,175 L50,170 L30,160 L20,140 L15,115 L18,90 L25,65 L35,40 L45,20 Z"
          fill="#8b2e3f"
          opacity="0.85"
        />
      </svg>
    ),
    burgundy: (
      <svg viewBox="0 0 80 200" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M40,10 L55,20 L60,35 L62,55 L60,75 L58,95 L56,115 L54,135 L50,155 L45,175 L38,190 L30,185 L25,170 L22,150 L20,130 L22,110 L24,90 L26,70 L30,50 L35,30 Z"
          fill="#7a5c68"
          opacity="0.85"
        />
      </svg>
    ),
    champagne: (
      <svg viewBox="0 0 140 120" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M20,40 L35,25 L55,20 L75,22 L95,28 L110,38 L120,52 L118,68 L108,82 L92,92 L75,98 L55,100 L38,95 L25,85 L18,70 L16,55 Z"
          fill="#a89080"
          opacity="0.85"
        />
      </svg>
    ),
    alsace: (
      <svg viewBox="0 0 60 220" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M30,10 L42,15 L48,25 L50,40 L48,60 L46,80 L44,100 L42,120 L40,140 L38,160 L36,180 L32,200 L28,210 L22,205 L18,190 L16,170 L18,150 L20,130 L22,110 L24,90 L26,70 L28,50 L30,30 Z"
          fill="#b5a08e"
          opacity="0.85"
        />
      </svg>
    ),
  }

  const regionSVG = regionSVGs[region.id] || (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="35" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3" />
      <path
        d="M30,50 Q35,35 50,35 T70,50 Q65,65 50,65 T30,50"
        fill="currentColor"
        opacity="0.2"
      />
      <text x="50" y="55" textAnchor="middle" fontSize="12" fill="currentColor" opacity="0.4">
        {region.name.slice(0, 3).toUpperCase()}
      </text>
    </svg>
  )

  return (
    <Link className="region-card" href={region.path}>
      <span className="region-card-media">{regionSVG}</span>
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
