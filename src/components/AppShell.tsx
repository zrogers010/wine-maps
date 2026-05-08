import { useCallback, useState } from 'react'
import appellationData from '../data/appellations.json'
import type {
  AppellationId,
  AppellationMetadata,
  ExperienceMode,
  LayerState,
} from '../types/wine'
import { APPELLATION_COLORS } from '../utils/mapStyles'
import { MapView } from './MapView'

const appellations = appellationData as AppellationMetadata[]

const defaultLayers: LayerState = {
  aocBoundaries: true,
  vineyardParcels: false,
  roadsBasemap: true,
  rivers: false,
  grapeEmphasis: false,
  studyLabels: true,
}

export function AppShell() {
  const [selectedId, setSelectedId] = useState<AppellationId | null>(null)
  const [legendHoveredId, setLegendHoveredId] = useState<AppellationId | null>(null)
  const layers = defaultLayers
  const mode: ExperienceMode = 'Explore'
  const filteredIds = appellations.map((appellation) => appellation.id)

  const handleSelectAppellation = useCallback((id: AppellationId) => {
    setSelectedId(id)
  }, [])

  return (
    <div className="map-only-shell">
      <MapView
        appellations={appellations}
        filteredAppellationIds={filteredIds}
        layers={layers}
        mode={mode}
        selectedId={selectedId}
        legendHoveredId={legendHoveredId}
        onSelectAppellation={handleSelectAppellation}
      />
      <div className="map-source-badge">
        INAO/data.gouv.fr AOC viticole parcel delimitation extract. Online data
        are informational; official plans remain with town halls or INAO.
      </div>
      <aside className="region-legend" aria-label="Médoc appellation legend">
        <h2>Bordeaux / Médoc</h2>
        <div className="region-legend-list">
          {appellations.map((appellation) => (
            <div
              className="region-legend-row"
              key={appellation.id}
              onMouseEnter={() => setLegendHoveredId(appellation.id)}
              onMouseLeave={() => setLegendHoveredId(null)}
            >
              <span
                className="region-legend-swatch"
                style={{ backgroundColor: APPELLATION_COLORS[appellation.id] }}
              />
              <span>{appellation.name}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
