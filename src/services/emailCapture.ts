/**
 * Email capture submission data.
 */
export interface EmailCaptureSubmission {
  email: string
  region: string
  appellation?: string
  source: string
}

/**
 * Result of an email capture attempt.
 */
export interface EmailCaptureResult {
  success: boolean
  error?: string
}

/**
 * Email capture provider interface.
 * Implement this to integrate with an ESP (e.g., Mailchimp, ConvertKit, etc.).
 */
export interface EmailCaptureProvider {
  subscribe(submission: EmailCaptureSubmission): Promise<EmailCaptureResult>
}

/**
 * Stub email capture provider for development and testing.
 * Logs to console and always returns success.
 * Should ONLY be used when explicitly opted in via VITE_EMAIL_PROVIDER=stub.
 */
export class StubEmailCaptureProvider implements EmailCaptureProvider {
  async subscribe(submission: EmailCaptureSubmission): Promise<EmailCaptureResult> {
    console.log('[EmailCapture] Stub subscription:', submission)

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 800))

    return { success: true }
  }
}

/**
 * Get the configured email capture provider.
 * Returns null when no ESP is configured to prevent discarding real signups.
 * 
 * To integrate a real ESP:
 * 1. Implement EmailCaptureProvider interface
 * 2. Set VITE_EMAIL_PROVIDER and any required API keys in environment
 * 3. Add provider case in this function
 */
export function getEmailCaptureProvider(): EmailCaptureProvider | null {
  const provider = import.meta.env.VITE_EMAIL_PROVIDER

  if (!provider) {
    return null
  }

  if (provider === 'stub') {
    return new StubEmailCaptureProvider()
  }

  // Add real provider implementations here:
  // if (provider === 'mailchimp') {
  //   return new MailchimpProvider(import.meta.env.VITE_MAILCHIMP_API_KEY)
  // }

  console.warn(`[EmailCapture] Unknown provider: ${provider}`)
  return null
}
