import maplibregl from 'maplibre-gl'
import appellationData from '../data/france/champagne/appellations.json'
import { registerPMTilesProtocol } from '../utils/pmtiles'
import {
  StudyRegionMapPage,
  type StudyRegionMetadata,
} from './StudyRegionMapPage'

const appellations = appellationData as StudyRegionMetadata[]

// Register PMTiles protocol once at module load
registerPMTilesProtocol(maplibregl)

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
      detailDataPath="pmtiles://champagne-detail"
      emptyCardTitle="Champagne AOC Map"
      hullDataPath="pmtiles://champagne-hull"
      legendAriaLabel="Champagne appellation legend"
      legendGroups={legendGroups}
      regionName="Champagne"
      regionId="champagne"
      routePath="/champagne"
      sharedGeometryIds={{ 'coteaux-champenois': 'champagne' }}
      sourceBadge="OpenDataWine access to INAO Champagne AOC delimitation geometry. Online data are informational; official plans remain with town halls or INAO."
    />
  )
}
