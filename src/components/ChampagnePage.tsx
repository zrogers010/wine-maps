import appellationData from '../data/france/champagne/appellations.json'
import {
  StudyRegionMapPage,
  type StudyRegionMetadata,
} from './StudyRegionMapPage'

const appellations = appellationData as StudyRegionMetadata[]

const champagneColors: Record<string, string> = {
  champagne: '#f2c94c',
  'coteaux-champenois': '#e8a857',
  'rose-des-riceys': '#d85f73',
}

const legendGroups = [
  {
    title: 'Champagne / AOC',
    ids: ['champagne', 'coteaux-champenois', 'rose-des-riceys'],
  },
]

export function ChampagnePage() {
  return (
    <StudyRegionMapPage
      appellations={appellations}
      colors={champagneColors}
      detailDataPath="/data/france/champagne/champagne-opendatawine-display-2026.geojson"
      emptyCardTitle="Champagne AOC Map"
      hullDataPath="/data/france/champagne/champagne-opendatawine-hulls-2026.geojson"
      legendAriaLabel="Champagne appellation legend"
      legendGroups={legendGroups}
      sharedGeometryIds={{ 'coteaux-champenois': 'champagne' }}
      sourceBadge="OpenDataWine access to INAO Champagne AOC delimitation geometry. Online data are informational; official plans remain with town halls or INAO."
    />
  )
}
