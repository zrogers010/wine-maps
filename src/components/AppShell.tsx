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

const regionLegendGroups: Array<{ title: string; ids: AppellationId[] }> = [
  {
    title: 'Bordeaux / Médoc',
    ids: [
      'medoc',
      'haut-medoc',
      'saint-estephe',
      'pauillac',
      'saint-julien',
      'margaux',
      'moulis-en-medoc',
      'listrac-medoc',
    ],
  },
  {
    title: 'Bordeaux / Entre-Deux-Mers',
    ids: [
      'entre-deux-mers',
      'entre-deux-mers-haut-benauge',
      'cadillac',
      'cotes-de-bordeaux-cadillac',
      'loupiac',
      'sainte-croix-du-mont',
      'premieres-cotes-de-bordeaux',
      'cotes-de-bordeaux-saint-macaire',
      'graves-de-vayres',
    ],
  },
]

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
      <aside className="region-legend" aria-label="Bordeaux appellation legend">
        {regionLegendGroups.map((group) => (
          <section className="region-legend-group" key={group.title}>
            <h2>{group.title}</h2>
            <div className="region-legend-list">
              {group.ids.map((id) => {
                const appellation = appellations.find((candidate) => candidate.id === id)

                if (!appellation) {
                  return null
                }

                return (
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
                )
              })}
            </div>
          </section>
        ))}
      </aside>
    </div>
  )
}
