import { AlsacePage } from './components/AlsacePage'
import { AppShell } from './components/AppShell'
import { BurgundyPage } from './components/BurgundyPage'
import { ChampagnePage } from './components/ChampagnePage'
import type { ReactNode } from 'react'
import './App.css'

const bordeauxPaths = new Set(['/bordeaux', '/burdeux', '/bourdeux'])
const burgundyPaths = new Set(['/burgundy', '/burgandy', '/bourgogne'])
const champagnePaths = new Set(['/champagne', '/champage'])
const alsacePaths = new Set(['/alsace'])

function App() {
  const pathname = normalizePath(window.location.pathname)
  const activePath = bordeauxPaths.has(pathname)
    ? '/bordeaux'
    : burgundyPaths.has(pathname)
      ? '/burgundy'
      : champagnePaths.has(pathname)
        ? '/champagne'
        : alsacePaths.has(pathname)
          ? '/alsace'
          : pathname

  if (bordeauxPaths.has(pathname)) {
    if (pathname !== '/bordeaux') {
      window.history.replaceState(null, '', '/bordeaux')
    }

    return (
      <AppFrame activePath={activePath}>
        <AppShell />
      </AppFrame>
    )
  }

  if (burgundyPaths.has(pathname)) {
    if (pathname !== '/burgundy') {
      window.history.replaceState(null, '', '/burgundy')
    }

    return (
      <AppFrame activePath={activePath}>
        <BurgundyPage />
      </AppFrame>
    )
  }

  if (champagnePaths.has(pathname)) {
    if (pathname !== '/champagne') {
      window.history.replaceState(null, '', '/champagne')
    }

    return (
      <AppFrame activePath={activePath}>
        <ChampagnePage />
      </AppFrame>
    )
  }

  if (alsacePaths.has(pathname)) {
    return (
      <AppFrame activePath={activePath}>
        <AlsacePage />
      </AppFrame>
    )
  }

  if (pathname === '/') {
    return (
      <AppFrame activePath={activePath}>
        <RegionIndexPage />
      </AppFrame>
    )
  }

  return (
    <AppFrame activePath={activePath}>
      <NotFoundPage />
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
        <a className="region-top-nav-brand" href="/">
          SommelierMaps
        </a>
        <div className="region-top-nav-links">
          <a
            className={activePath === '/bordeaux' ? 'is-active' : undefined}
            href="/bordeaux"
          >
            Bordeaux
          </a>
          <a
            className={activePath === '/burgundy' ? 'is-active' : undefined}
            href="/burgundy"
          >
            Burgundy
          </a>
          <a
            className={activePath === '/champagne' ? 'is-active' : undefined}
            href="/champagne"
          >
            Champagne
          </a>
          <a
            className={activePath === '/alsace' ? 'is-active' : undefined}
            href="/alsace"
          >
            Alsace
          </a>
        </div>
      </nav>
      {children}
    </>
  )
}

function RegionIndexPage() {
  return (
    <main className="region-index-page">
      <section className="region-index-card">
        <span className="region-index-kicker">SommelierMaps</span>
        <h1>Wine Region Maps</h1>
        <p>
          Explore each wine region on its own focused map. Start with Bordeaux,
          then expand country by country.
        </p>
        <div className="region-link-list">
          <a href="/bordeaux">
            <strong>Bordeaux</strong>
            <span>Live map: Médoc, Right Bank, Entre-Deux-Mers, Graves, Sauternes.</span>
          </a>
          <a href="/burgundy">
            <strong>Burgundy</strong>
            <span>New map: Chablis, Côte de Nuits, and Côte de Beaune.</span>
          </a>
          <a href="/champagne">
            <strong>Champagne</strong>
            <span>Study map: Montagne de Reims, Marne Valley, Côte des Blancs, and Aube.</span>
          </a>
          <a href="/alsace">
            <strong>Alsace</strong>
            <span>New map: Alsace regional AOC, Crémant d&apos;Alsace, and Grand Cru sites.</span>
          </a>
        </div>
      </section>
    </main>
  )
}

function NotFoundPage() {
  return (
    <main className="region-index-page">
      <section className="region-index-card">
        <span className="region-index-kicker">SommelierMaps</span>
        <h1>Region Not Found</h1>
        <p>This wine-region map is not available yet.</p>
        <a className="region-home-link" href="/bordeaux">Open Bordeaux</a>
      </section>
    </main>
  )
}

function normalizePath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, '')
  return normalized || '/'
}

export default App
