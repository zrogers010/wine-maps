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
 * Stub email capture provider for development.
 * Logs to console in dev mode and always returns success.
 * Replace this with a real provider implementation when ready.
 */
export class StubEmailCaptureProvider implements EmailCaptureProvider {
  async subscribe(submission: EmailCaptureSubmission): Promise<EmailCaptureResult> {
    if (import.meta.env.DEV) {
      console.log('[EmailCapture] Stub subscription:', submission)
    }

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 800))

    return { success: true }
  }
}

/**
 * Get the configured email capture provider.
 * Currently returns the stub provider.
 * 
 * To integrate a real ESP:
 * 1. Implement EmailCaptureProvider interface
 * 2. Add environment variables for API keys
 * 3. Update this function to return the real provider based on env config
 */
export function getEmailCaptureProvider(): EmailCaptureProvider {
  // TODO: Replace with real provider based on environment config
  // Example:
  // if (import.meta.env.VITE_EMAIL_PROVIDER === 'mailchimp') {
  //   return new MailchimpProvider(import.meta.env.VITE_MAILCHIMP_API_KEY)
  // }
  
  return new StubEmailCaptureProvider()
}
