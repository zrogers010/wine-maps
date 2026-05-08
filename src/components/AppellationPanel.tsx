import type { AppellationMetadata, StudyLevel } from '../types/wine'

interface AppellationPanelProps {
  appellation: AppellationMetadata | null
  studyLevel: StudyLevel
}

export function AppellationPanel({
  appellation,
  studyLevel,
}: AppellationPanelProps) {
  if (!appellation) {
    return (
      <div className="detail-card empty-state">
        <p className="eyebrow">Study card</p>
        <h2>Select an appellation</h2>
        <p>
          Hover the map to preview a boundary, then click a Médoc appellation to
          open terroir, grape, tasting, and exam notes.
        </p>
        <div className="accuracy-box">
          <strong>Accuracy stance</strong>
          <span>
            The app distinguishes official AOC rules, common producer practice,
            tasting shorthand, and classification context.
          </span>
        </div>
      </div>
    )
  }

  return (
    <article className="detail-card">
      <p className="eyebrow">
        {appellation.region} / {appellation.subregion}
      </p>
      <div className="detail-title-row">
        <div>
          <h2>{appellation.name}</h2>
          <p>
            {appellation.bank} · {appellation.aocType}
          </p>
        </div>
        <span className="style-pill">{appellation.primaryStyle}</span>
      </div>

      <section className="panel-section">
        <h3>Grape & Style</h3>
        <KeyValue label="Dominant grape focus" value={appellation.dominantGrapes.join(', ')} />
        <KeyValue label="Important grapes" value={appellation.importantGrapes.join(', ')} />
        <p className="note">{appellation.commonPracticeNote}</p>
      </section>

      <section className="panel-section">
        <h3>Terroir Logic</h3>
        <div className="tag-list">
          {appellation.terroir.keySoils.map((soil) => (
            <span key={soil}>{soil}</span>
          ))}
        </div>
        <p>{appellation.terroir.learningPoint}</p>
      </section>

      <section className="panel-section">
        <h3>Tasting Profile</h3>
        <KeyValue label="Fruit" value={appellation.tastingProfile.fruit.join(', ')} />
        <KeyValue
          label="Non-fruit"
          value={appellation.tastingProfile.nonFruit.join(', ')}
        />
        <KeyValue
          label="Structure"
          value={appellation.tastingProfile.structure.join(', ')}
        />
        <KeyValue
          label="Ageing"
          value={appellation.tastingProfile.ageingPotential}
        />
      </section>

      {studyLevel === 'Advanced' ? (
        <>
          <section className="panel-section">
            <h3>Official vs Common Practice</h3>
            <p className="note">{appellation.authorizedGrapesNote}</p>
            <p>{appellation.officialRulesNote}</p>
          </section>

          <section className="panel-section">
            <h3>Exam Notes</h3>
            <ul className="study-list">
              {appellation.examNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>

          {appellation.classificationContext ? (
            <section className="panel-section">
              <h3>Classification Context</h3>
              <p>{appellation.classificationContext}</p>
            </section>
          ) : null}

          <section className="panel-section">
            <h3>Neighbor Comparisons</h3>
            <div className="comparison-list">
              {Object.entries(appellation.neighborComparisons).map(
                ([neighborId, comparison]) => (
                  <p key={neighborId}>
                    <strong>{labelFromId(neighborId)}</strong>
                    {comparison}
                  </p>
                ),
              )}
            </div>
          </section>
        </>
      ) : (
        <p className="study-hint">
          Switch study level to Advanced for exam notes, official-rule caveats,
          and neighbor comparisons.
        </p>
      )}
    </article>
  )
}

interface KeyValueProps {
  label: string
  value: string
}

function KeyValue({ label, value }: KeyValueProps) {
  return (
    <div className="key-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function labelFromId(id: string) {
  return id
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
