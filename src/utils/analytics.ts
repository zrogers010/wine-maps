interface RegionViewEvent {
  event: 'region_view'
  region_slug: string
}

interface AppellationSelectEvent {
  event: 'appellation_select'
  region_slug: string
  appellation_slug: string
}

interface StudyModeToggleEvent {
  event: 'study_mode_toggle'
  mode: string
}

interface EmailCaptureEvent {
  event: 'email_capture'
  region_slug: string
  source: string
}

interface PageViewEvent {
  event: 'page_view'
  page_path: string
  page_location: string
  page_title: string
}

type AnalyticsEvent =
  | RegionViewEvent
  | AppellationSelectEvent
  | StudyModeToggleEvent
  | EmailCaptureEvent
  | PageViewEvent

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

let isInitialized = false
let isEnabled = false

/**
 * Initialize GA4 tracking if VITE_GA4_ID is set.
 * Call this once during app startup.
 */
export function initializeAnalytics() {
  const measurementId = import.meta.env.VITE_GA4_ID

  if (!measurementId || typeof measurementId !== 'string') {
    isEnabled = false
    if (import.meta.env.DEV) {
      console.log('[Analytics] GA4 disabled: VITE_GA4_ID not set')
    }
    return
  }

  if (isInitialized) {
    return
  }

  isInitialized = true
  isEnabled = true

  // Initialize dataLayer
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer?.push(arguments)
  }

  window.gtag('js', new Date())
  window.gtag('config', measurementId, {
    send_page_view: false, // We'll track region views manually
  })

  // Load GA4 script
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
  document.head.appendChild(script)

  if (import.meta.env.DEV) {
    console.log('[Analytics] GA4 initialized:', measurementId)
  }
}

/**
 * Track an analytics event.
 * No-op if GA4 is not enabled.
 */
export function track(event: AnalyticsEvent) {
  if (!isEnabled) {
    if (import.meta.env.DEV) {
      console.log('[Analytics] Track (disabled):', event)
    }
    return
  }

  if (!window.gtag) {
    return
  }

  const { event: eventName, ...params } = event
  window.gtag('event', eventName, params)

  if (import.meta.env.DEV) {
    console.log('[Analytics] Track:', event)
  }
}

/**
 * Track a region view event.
 */
export function trackRegionView(regionSlug: string) {
  track({ event: 'region_view', region_slug: regionSlug })
}

/**
 * Track an appellation selection event.
 */
export function trackAppellationSelect(regionSlug: string, appellationSlug: string) {
  track({ event: 'appellation_select', region_slug: regionSlug, appellation_slug: appellationSlug })
}

/**
 * Track a study mode toggle event.
 */
export function trackStudyModeToggle(mode: string) {
  track({ event: 'study_mode_toggle', mode })
}

/**
 * Track an email capture event.
 */
export function trackEmailCapture(regionSlug: string, source: string) {
  track({ event: 'email_capture', region_slug: regionSlug, source })
}

/**
 * Track a page view event.
 */
export function trackPageView(pagePath: string, pageTitle: string) {
  track({
    event: 'page_view',
    page_path: pagePath,
    page_location: window.location.href,
    page_title: pageTitle,
  })
}
