import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Loaded eagerly and first so app styles keep overriding .maplibregl-map
// even though the map components are lazy chunks.
import 'maplibre-gl/dist/maplibre-gl.css'
import './index.css'
import App from './App.tsx'
import { initializeAnalytics } from './utils/analytics'

initializeAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
