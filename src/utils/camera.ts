import type {
  IControl,
  LngLatBoundsLike,
  Map as MapLibreMap,
  PaddingOptions,
} from 'maplibre-gl'

interface FlyToBoundsOptions {
  padding?: number | PaddingOptions
  maxZoom?: number
  /** Higher is faster. MapLibre default is 1.2. */
  speed?: number
}

/**
 * Camera padding used when a legend hover previews an appellation, leaving
 * room for the left info card and right legend overlays.
 */
export const LEGEND_PREVIEW_PADDING: PaddingOptions = {
  top: 104,
  right: 300,
  bottom: 84,
  left: 372,
}

/** Camera padding for the full-region overview framing. */
export const OVERVIEW_PADDING: PaddingOptions = {
  top: 90,
  right: 70,
  bottom: 80,
  left: 70,
}

/**
 * Smooth alternative to `fitBounds`: resolves the target camera for the
 * bounds, then flies there along a gentle zoom arc. Short hops stay quick
 * while long jumps get a graceful zoom-out / zoom-in curve.
 */
export function flyToBounds(
  map: MapLibreMap,
  bounds: LngLatBoundsLike,
  options: FlyToBoundsOptions = {},
) {
  // Note: maxZoom must be omitted (not undefined) — MapLibre's option merge
  // would otherwise override its internal default with undefined and produce
  // a NaN camera. Padding is cloned because MapLibre can mutate the object.
  const padding =
    typeof options.padding === 'object' ? { ...options.padding } : options.padding
  const camera = map.cameraForBounds(bounds, {
    ...(padding !== undefined ? { padding } : {}),
    ...(options.maxZoom !== undefined ? { maxZoom: options.maxZoom } : {}),
  })

  if (!camera) {
    return
  }

  map.flyTo({
    ...camera,
    speed: options.speed ?? 1.15,
    curve: 1.32,
    essential: true,
  })
}

const OVERVIEW_ICON = `
<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M8 3H5a2 2 0 0 0-2 2v3" />
  <path d="M16 3h3a2 2 0 0 1 2 2v3" />
  <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
  <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
  <circle cx="12" cy="12" r="2.4" />
</svg>`

/**
 * Map control with a single "frame the whole region" button, so users can
 * always recover the overview after zooming or legend-driven previews.
 */
export class OverviewControl implements IControl {
  private container: HTMLDivElement | null = null
  private readonly onActivate: () => void

  constructor(onActivate: () => void) {
    this.onActivate = onActivate
  }

  onAdd(): HTMLElement {
    const container = document.createElement('div')
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group'

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'overview-control-button'
    button.title = 'Frame the whole region'
    button.setAttribute('aria-label', 'Frame the whole region')
    button.innerHTML = OVERVIEW_ICON
    button.addEventListener('click', this.onActivate)

    container.appendChild(button)
    this.container = container
    return container
  }

  onRemove(): void {
    this.container?.remove()
    this.container = null
  }
}
