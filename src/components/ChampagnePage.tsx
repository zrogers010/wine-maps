import appellationData from '../data/france/champagne/appellations.json'
import {
  StudyRegionMapPage,
  type StudyRegionMetadata,
} from './StudyRegionMapPage'

const appellations = appellationData as StudyRegionMetadata[]

const champagneColors: Record<string, string> = {
  // Muted champagne family - more distinct tones for each appellation
  champagne: '#e8d7b8',
  'coteaux-champenois': '#c9a882',
  'rose-des-riceys': '#b8857a',
}

const legendGroups = [
  {
    title: 'Appellations',
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
      regionName="Champagne"
      routePath="/champagne"
      sharedGeometryIds={{ 'coteaux-champenois': 'champagne' }}
      sourceBadge="OpenDataWine access to INAO Champagne AOC delimitation geometry. Online data are informational; official plans remain with town halls or INAO."
    />
  )
}
