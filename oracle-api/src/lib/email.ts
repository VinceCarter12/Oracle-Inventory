const ALLOWED_DOMAIN = 'oraclepetroleum.net';

// TODO (deployment): Remove 'gmail.com' from ALLOWED_TEST_DOMAINS before going live.
// This is only here for local testing so OTP and onboarding emails can be sent
// to a real inbox without a verified corporate domain.
const ALLOWED_TEST_DOMAINS = ['gmail.com'];

/**
 * Validates that an email belongs to the corporate domain (or a test domain in dev).
 * Returns an error string if invalid, null if valid.
 */
export function validateCorporateEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return 'Email is required.';
  if (!trimmed.includes('@')) return 'Invalid email format.';
  const domain = trimmed.split('@')[1];
  if (domain !== ALLOWED_DOMAIN && !ALLOWED_TEST_DOMAINS.includes(domain)) {
    return `Only @${ALLOWED_DOMAIN} email addresses are allowed.`;
  }
  return null;
}

/** Normalise email: trim + lowercase */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}
