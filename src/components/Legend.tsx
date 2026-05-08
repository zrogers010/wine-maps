import { scaleOrdinal } from 'd3'
import type { AppellationMetadata } from '../types/wine'
import { APPELLATION_COLORS, GRAPE_COLORS } from '../utils/mapStyles'

interface LegendProps {
  appellations: AppellationMetadata[]
  grapeEmphasis: boolean
}

export function Legend({ appellations, grapeEmphasis }: LegendProps) {
  const items = grapeEmphasis
    ? Object.entries(GRAPE_COLORS).filter(([grape]) =>
        appellations.some((item) => item.dominantGrapes.includes(grape)),
      )
    : appellations.map((item) => [item.name, APPELLATION_COLORS[item.id]])

  const colorScale = scaleOrdinal<string, string>()
    .domain(items.map(([label]) => label))
    .range(items.map(([, color]) => color))

  return (
    <div className="legend-card">
      <div className="section-heading">
        <p className="eyebrow">Legend</p>
        <h2>{grapeEmphasis ? 'Dominant grape focus' : 'Appellation color'}</h2>
      </div>
      <div className="legend-list">
        {items.map(([label]) => (
          <div className="legend-row" key={label}>
            <span
              className="legend-swatch"
              style={{ background: colorScale(label) }}
            />
            <span>{label}</span>
          </div>
        ))}
      </div>
      {grapeEmphasis ? (
        <p className="legend-note">
          Grape emphasis is study shorthand for common blend leadership, not a
          claim that wines are varietal or single-grape.
        </p>
      ) : null}
    </div>
  )
}
