import type {
  AppellationMetadata,
  ExperienceMode,
  FilterState,
  LayerKey,
  LayerState,
  StudyLevel,
} from '../types/wine'

interface LayerControlsProps {
  appellations: AppellationMetadata[]
  filters: FilterState
  layers: LayerState
  mode: ExperienceMode
  visibleCount: number
  onFiltersChange: (filters: FilterState) => void
  onLayerToggle: (layer: LayerKey) => void
  onModeChange: (mode: ExperienceMode) => void
}

const layerLabels: Array<{ key: LayerKey; label: string; hint: string }> = [
  {
    key: 'aocBoundaries',
    label: 'AOC boundaries',
    hint: 'Placeholder polygons for the eight MVP appellations.',
  },
  {
    key: 'vineyardParcels',
    label: 'Vineyard parcels',
    hint: 'Dev texture only until INAO/OSM vineyard polygons are added.',
  },
  {
    key: 'roadsBasemap',
    label: 'Roads / basemap',
    hint: 'OpenStreetMap raster context.',
  },
  {
    key: 'rivers',
    label: 'Rivers',
    hint: 'Gironde context placeholder.',
  },
  {
    key: 'grapeEmphasis',
    label: 'Grape emphasis',
    hint: 'Colors by dominant grape shorthand, not official blend rules.',
  },
  {
    key: 'studyLabels',
    label: 'Study labels',
    hint: 'Appellation labels for review mode.',
  },
]

export function LayerControls({
  appellations,
  filters,
  layers,
  mode,
  visibleCount,
  onFiltersChange,
  onLayerToggle,
  onModeChange,
}: LayerControlsProps) {
  const grapes = uniqueOptions(appellations.flatMap((item) => item.dominantGrapes))
  const styles = uniqueOptions(appellations.map((item) => item.primaryStyle))
  const banks = uniqueOptions(appellations.map((item) => item.bank))
  const subregions = uniqueOptions(appellations.map((item) => item.subregion))

  return (
    <div className="control-card">
      <div className="section-heading">
        <p className="eyebrow">Map controls</p>
        <h2>Layers & filters</h2>
      </div>

      <div className="control-group">
        <p className="control-label">Mode</p>
        <div className="segmented-control">
          {(['Explore', 'Study'] as ExperienceMode[]).map((modeOption) => (
            <button
              className={mode === modeOption ? 'active' : ''}
              key={modeOption}
              type="button"
              onClick={() => onModeChange(modeOption)}
            >
              {modeOption}
            </button>
          ))}
        </div>
      </div>

      <div className="control-group layer-list">
        <p className="control-label">Layers</p>
        {layerLabels.map((layer) => (
          <label className="check-row" key={layer.key}>
            <input
              checked={layers[layer.key]}
              type="checkbox"
              onChange={() => onLayerToggle(layer.key)}
            />
            <span>
              <strong>{layer.label}</strong>
              <small>{layer.hint}</small>
            </span>
          </label>
        ))}
      </div>

      <div className="control-group">
        <p className="control-label">Filters</p>
        <SelectControl
          label="Dominant grape"
          value={filters.dominantGrape}
          options={['All grapes', ...grapes]}
          onChange={(dominantGrape) =>
            onFiltersChange({ ...filters, dominantGrape })
          }
        />
        <SelectControl
          label="Wine style"
          value={filters.wineStyle}
          options={['All styles', ...styles]}
          onChange={(wineStyle) => onFiltersChange({ ...filters, wineStyle })}
        />
        <SelectControl
          label="Bank"
          value={filters.bank}
          options={['All banks', ...banks]}
          onChange={(bank) => onFiltersChange({ ...filters, bank })}
        />
        <SelectControl
          label="Subregion"
          value={filters.subregion}
          options={['All subregions', ...subregions]}
          onChange={(subregion) => onFiltersChange({ ...filters, subregion })}
        />
        <SelectControl
          label="Study level"
          value={filters.studyLevel}
          options={['Curious', 'Advanced']}
          onChange={(studyLevel) =>
            onFiltersChange({ ...filters, studyLevel: studyLevel as StudyLevel })
          }
        />
      </div>

      <p className="visible-count">
        Showing <strong>{visibleCount}</strong> of {appellations.length}{' '}
        appellations.
      </p>
    </div>
  )
}

interface SelectControlProps {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}

function SelectControl({ label, value, options, onChange }: SelectControlProps) {
  return (
    <label className="select-control">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

function uniqueOptions(values: string[]) {
  return Array.from(new Set(values)).sort((left, right) =>
    left.localeCompare(right),
  )
}
