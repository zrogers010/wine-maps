/**
 * Parchment veil shown while a region map loads its style and boundary data,
 * then faded out. Kept mounted so the fade-out transition can play.
 */
export function MapLoadingVeil({
  isReady,
  regionName,
}: {
  isReady: boolean
  regionName: string
}) {
  return (
    <div
      aria-hidden={isReady}
      className={`map-loading-veil${isReady ? ' is-hidden' : ''}`}
    >
      <span className="map-loading-spinner" />
      <span>Loading the {regionName} map…</span>
    </div>
  )
}
