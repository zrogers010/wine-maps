declare module '*.geojson' {
  import type { FeatureCollection } from 'geojson'

  const value: FeatureCollection
  export default value
}

declare module '*.geojson?raw' {
  const value: string
  export default value
}
