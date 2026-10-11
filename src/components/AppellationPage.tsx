import { useEffect, useState } from 'react'
import type { RegionConfig } from '../regions'

interface AppellationData {
  id: string
  name: string
  region: string
  subregion?: string
  primaryStyle?: string
  dominantGrapes?: string[]
  importantGrapes?: string[]
  terroir?: {
    keySoils?: string[]
    climate?: string[]
    learningPoint?: string
  }
  tastingProfile?: {
    fruit?: string[]
    nonFruit?: string[]
    structure?: string[]
    ageingPotential?: string
  }
  examNotes?: string[]
  neighborComparisons?: Record<string, string>
}

interface AppellationPageProps {
  region: RegionConfig
  appellationId: string
}

export function AppellationPage({ region, appellationId }: AppellationPageProps) {
  const [appellation, setAppellation] = useState<AppellationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadAppellation() {
      try {
        setLoading(true)
        setError(null)

        // Dynamic import of appellation data
        const data = await import(
          `../data/france/${region.id}/appellations.json`
        )

        if (cancelled) return

        const found = data.default.find((a: AppellationData) => a.id === appellationId)

        if (!found) {
          setError(`Appellation "${appellationId}" not found in ${region.name}`)
          setAppellation(null)
        } else {
          setAppellation(found)
        }
      } catch (err) {
        if (cancelled) return
        console.error('Failed to load appellation:', err)
        setError(`Failed to load appellation data for ${region.name}`)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadAppellation()

    return () => {
      cancelled = true
    }
  }, [region.id, appellationId])

  if (loading) {
    return (
      <main className="appellation-page">
        <div className="appellation-loading">
          <p>Loading appellation data...</p>
        </div>
      </main>
    )
  }

  if (error || !appellation) {
    return (
      <main className="appellation-page">
        <div className="appellation-error">
          <h1>Appellation Not Found</h1>
          <p>{error || 'This appellation does not exist.'}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="appellation-page">
      <div className="appellation-content">
        <div className="appellation-header">
          <span className="appellation-breadcrumb">
            {region.name} › {appellation.subregion || region.name}
          </span>
          <h1>{appellation.name}</h1>
          {appellation.primaryStyle && (
            <p className="appellation-style">{appellation.primaryStyle}</p>
          )}
        </div>

        {appellation.dominantGrapes && appellation.dominantGrapes.length > 0 && (
          <section className="appellation-section">
            <h2>Grapes</h2>
            <div className="grape-list">
              <p>
                <strong>Dominant:</strong> {appellation.dominantGrapes.join(', ')}
              </p>
              {appellation.importantGrapes && appellation.importantGrapes.length > 0 && (
                <p>
                  <strong>Important:</strong> {appellation.importantGrapes.join(', ')}
                </p>
              )}
            </div>
          </section>
        )}

        {appellation.terroir && (
          <section className="appellation-section">
            <h2>Terroir</h2>
            {appellation.terroir.keySoils && appellation.terroir.keySoils.length > 0 && (
              <p>
                <strong>Soils:</strong> {appellation.terroir.keySoils.join(', ')}
              </p>
            )}
            {appellation.terroir.climate && appellation.terroir.climate.length > 0 && (
              <p>
                <strong>Climate:</strong> {appellation.terroir.climate.join(', ')}
              </p>
            )}
            {appellation.terroir.learningPoint && (
              <p className="learning-point">{appellation.terroir.learningPoint}</p>
            )}
          </section>
        )}

        {appellation.tastingProfile && (
          <section className="appellation-section">
            <h2>Tasting Profile</h2>
            {appellation.tastingProfile.fruit &&
              appellation.tastingProfile.fruit.length > 0 && (
                <p>
                  <strong>Fruit:</strong> {appellation.tastingProfile.fruit.join(', ')}
                </p>
              )}
            {appellation.tastingProfile.nonFruit &&
              appellation.tastingProfile.nonFruit.length > 0 && (
                <p>
                  <strong>Non-fruit:</strong>{' '}
                  {appellation.tastingProfile.nonFruit.join(', ')}
                </p>
              )}
            {appellation.tastingProfile.structure &&
              appellation.tastingProfile.structure.length > 0 && (
                <p>
                  <strong>Structure:</strong>{' '}
                  {appellation.tastingProfile.structure.join(', ')}
                </p>
              )}
            {appellation.tastingProfile.ageingPotential && (
              <p>
                <strong>Ageing Potential:</strong>{' '}
                {appellation.tastingProfile.ageingPotential}
              </p>
            )}
          </section>
        )}

        {appellation.examNotes && appellation.examNotes.length > 0 && (
          <section className="appellation-section">
            <h2>Exam Notes</h2>
            <ul>
              {appellation.examNotes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </section>
        )}

        <div className="appellation-attribution">
          <p>
            <small>
              Source data from INAO (Institut national de l'origine et de la qualité).
              Boundaries are informational and not official survey-grade data.
            </small>
          </p>
        </div>
      </div>
    </main>
  )
}
