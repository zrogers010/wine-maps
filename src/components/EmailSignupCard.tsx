import { useState, type FormEvent } from 'react'
import { trackEmailCapture } from '../utils/analytics'
import { getEmailCaptureProvider } from '../services/emailCapture'

const DISMISSAL_KEY = 'sommeliermaps-email-signup-dismissed'
const DISMISSAL_DURATION_DAYS = 30

interface EmailSignupCardProps {
  regionName: string
  regionSlug: string
}

function checkDismissed(): boolean {
  const dismissedUntil = localStorage.getItem(DISMISSAL_KEY)
  if (dismissedUntil) {
    const dismissedDate = new Date(dismissedUntil)
    if (dismissedDate > new Date()) {
      return true
    }
  }
  return false
}

export function EmailSignupCard({ regionName, regionSlug }: EmailSignupCardProps) {
  const [isDismissed, setIsDismissed] = useState(checkDismissed)
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')

  const handleDismiss = () => {
    const dismissUntil = new Date()
    dismissUntil.setDate(dismissUntil.getDate() + DISMISSAL_DURATION_DAYS)
    localStorage.setItem(DISMISSAL_KEY, dismissUntil.toISOString())
    setIsDismissed(true)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    
    if (!email || !isValidEmail(email)) {
      setSubmitStatus('error')
      setErrorMessage('Please enter a valid email address')
      return
    }

    setIsSubmitting(true)
    setSubmitStatus('idle')
    setErrorMessage('')

    try {
      const provider = getEmailCaptureProvider()
      const result = await provider.subscribe({
        email,
        region: regionSlug,
        source: 'region-map-card',
      })

      if (result.success) {
        setSubmitStatus('success')
        trackEmailCapture(regionSlug, 'region-map-card')
        // Auto-dismiss after success
        setTimeout(() => {
          handleDismiss()
        }, 3000)
      } else {
        setSubmitStatus('error')
        setErrorMessage(result.error || 'Something went wrong. Please try again.')
      }
    } catch (error) {
      setSubmitStatus('error')
      setErrorMessage('Network error. Please check your connection and try again.')
      console.error('Email capture error:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isDismissed) {
    return null
  }

  if (submitStatus === 'success') {
    return (
      <aside className="email-signup-card success" role="status" aria-live="polite">
        <button
          className="email-signup-close"
          type="button"
          onClick={handleDismiss}
          aria-label="Close"
        >
          ×
        </button>
        <div className="email-signup-content">
          <h3>✓ You're on the list!</h3>
          <p>Check your email for your free {regionName} study resources.</p>
        </div>
      </aside>
    )
  }

  return (
    <aside className="email-signup-card" role="complementary" aria-label="Email signup">
      <button
        className="email-signup-close"
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss signup form"
      >
        ×
      </button>
      <form className="email-signup-content" onSubmit={handleSubmit}>
        <div className="email-signup-header">
          <h3>Free {regionName} Study Pack</h3>
          <p>Printable map + flashcards for WSET prep</p>
        </div>
        <div className="email-signup-form-group">
          <label htmlFor="email-signup-input" className="visually-hidden">
            Email address
          </label>
          <input
            id="email-signup-input"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSubmitting}
            required
            aria-required="true"
            aria-invalid={submitStatus === 'error'}
            aria-describedby={submitStatus === 'error' ? 'email-signup-error' : undefined}
          />
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Sending...' : 'Get Free Pack'}
          </button>
        </div>
        {submitStatus === 'error' && errorMessage && (
          <div
            id="email-signup-error"
            className="email-signup-error"
            role="alert"
            aria-live="assertive"
          >
            {errorMessage}
          </div>
        )}
      </form>
    </aside>
  )
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}
