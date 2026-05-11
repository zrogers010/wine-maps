import { AppShell } from './components/AppShell'
import { BurgundyPage } from './components/BurgundyPage'
import './App.css'

const bordeauxPaths = new Set(['/bordeaux', '/burdeux', '/bourdeux'])
const burgundyPaths = new Set(['/burgundy', '/burgandy', '/bourgogne'])

function App() {
  const pathname = normalizePath(window.location.pathname)

  if (bordeauxPaths.has(pathname)) {
    if (pathname !== '/bordeaux') {
      window.history.replaceState(null, '', '/bordeaux')
    }

    return <AppShell />
  }

  if (burgundyPaths.has(pathname)) {
    if (pathname !== '/burgundy') {
      window.history.replaceState(null, '', '/burgundy')
    }

    return <BurgundyPage />
  }

  if (pathname === '/') {
    return <RegionIndexPage />
  }

  return <NotFoundPage />
}

function RegionIndexPage() {
  return (
    <main className="region-index-page">
      <section className="region-index-card">
        <span className="region-index-kicker">CruTerrain</span>
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
          <div className="region-link-disabled">
            <strong>Champagne</strong>
            <span>Great follow-up: Montagne de Reims, Vallée de la Marne, Côte des Blancs.</span>
          </div>
        </div>
      </section>
    </main>
  )
}

function NotFoundPage() {
  return (
    <main className="region-index-page">
      <section className="region-index-card">
        <span className="region-index-kicker">CruTerrain</span>
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
