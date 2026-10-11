import { useEffect, useState } from 'react'
import { AlsacePage } from './components/AlsacePage'
import { AppShell } from './components/AppShell'
import { BurgundyPage } from './components/BurgundyPage'
import { ChampagnePage } from './components/ChampagnePage'
import { Link } from './components/Link'
import { findRegionByPath, regions, type RegionConfig } from './regions'
import { navigate, usePathname } from './router'
import { trackRegionView } from './utils/analytics'
import type { ComponentType, ReactNode } from 'react'
import './App.css'

const regionComponents: Record<string, ComponentType> = {
  bordeaux: AppShell,
  burgundy: BurgundyPage,
  champagne: ChampagnePage,
  alsace: AlsacePage,
}

function App() {
  const rawPathname = usePathname()
  const pathname = normalizePath(rawPathname)
  const region = findRegionByPath(pathname)
  // Regions stay mounted after their first visit, so switching back is
  // instant and each map keeps its camera, hover, and loaded data.
  const [visitedRegionIds, setVisitedRegionIds] = useState<string[]>([])

  if (region && !visitedRegionIds.includes(region.id)) {
    // Adjusting state during render (per React docs) so the newly visited
    // region mounts in the same pass.
    setVisitedRegionIds([...visitedRegionIds, region.id])
  }

  useEffect(() => {
    if (rawPathname !== pathname || (region && pathname !== region.path)) {
      navigate((region?.path ?? pathname) + window.location.hash, { replace: true })
    }
  }, [pathname, rawPathname, region])

  useEffect(() => {
    if (region) {
      trackRegionView(region.id)
    }
  }, [region])

  const visitedRegions = regions.filter((candidate) =>
    visitedRegionIds.includes(candidate.id),
  )

  return (
    <AppFrame activePath={region?.path ?? pathname}>
      {visitedRegions.map((candidate) => {
        const RegionComponent = regionComponents[candidate.id]
        const isActive = candidate.id === region?.id

        return (
          <div key={candidate.id} hidden={!isActive}>
            <RegionComponent />
          </div>
        )
      })}
      {!region && pathname === '/' ? <RegionIndexPage /> : null}
      {!region && pathname !== '/' ? <NotFoundPage /> : null}
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
        <h1>Wine Region Maps</h1>
        <p>
          Official appellation boundaries, rendered beautifully. Hover any
          parcel to study the hierarchy, grapes, soils, and exam cues behind
          it.
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
    </main>
  )
}

function RegionCard({ region }: { region: RegionConfig }) {
  return (
    <Link className="region-card" href={region.path}>
      <span className="region-card-media">
        <img alt={`${region.name} appellation map`} loading="lazy" src={region.thumbnail} />
      </span>
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
