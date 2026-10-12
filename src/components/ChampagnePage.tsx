import appellationData from '../data/france/champagne/appellations.json'
import {
  StudyRegionMapPage,
  type StudyRegionMetadata,
} from './StudyRegionMapPage'

const appellations = appellationData as StudyRegionMetadata[]

const champagneColors: Record<string, string> = {
  // Distinct muted tones for each appellation
  champagne: '#d4c4a8',
  'coteaux-champenois': '#b89485',
  'rose-des-riceys': '#a87876',
}

const legendGroups = [
  {
    title: 'Appellations',
    ids: ['champagne', 'coteaux-champenois', 'rose-des-riceys'],
  },
]

export function ChampagnePage({ initialSelectedId }: { initialSelectedId?: string } = {}) {
  return (
    <StudyRegionMapPage
      initialSelectedId={initialSelectedId}
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
