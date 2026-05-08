import type { ExperienceMode } from '../types/wine'

interface StudyModeToggleProps {
  mode: ExperienceMode
  onModeChange: (mode: ExperienceMode) => void
}

const activeModes: ExperienceMode[] = ['Explore', 'Study']
const futureModes: ExperienceMode[] = ['Blind Tasting', 'Compare']

export function StudyModeToggle({ mode, onModeChange }: StudyModeToggleProps) {
  return (
    <div className="mode-toggle" aria-label="Atlas mode">
      {activeModes.map((modeOption) => (
        <button
          className={mode === modeOption ? 'active' : ''}
          key={modeOption}
          type="button"
          onClick={() => onModeChange(modeOption)}
        >
          {modeOption}
        </button>
      ))}
      {futureModes.map((modeOption) => (
        <button disabled key={modeOption} title="Planned after the MVP" type="button">
          {modeOption}
        </button>
      ))}
    </div>
  )
}
