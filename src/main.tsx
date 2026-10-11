import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Hide prerendered SEO content once React mounts
const prerenderedSeo = document.getElementById('prerendered-seo')
if (prerenderedSeo) {
  prerenderedSeo.style.display = 'none'
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
