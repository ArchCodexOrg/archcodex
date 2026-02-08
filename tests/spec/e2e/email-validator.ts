/**
 * @arch archcodex.test.fixture
 *
 * Email validator implementation fixture for spec verification.
 * Implements spec.test.validateEmail
 */

export interface ValidateEmailOptions {
  allowSubdomains?: boolean;
  maxLength?: number;
}

export interface ValidateEmailResult {
  valid: boolean;
  error?: string;
}

export function validateEmail(
  email: string,
  options: ValidateEmailOptions = {}
): ValidateEmailResult {
  const { maxLength = 254 } = options;

  // Check for empty or too long
  if (!email || email.length > maxLength) {
    return { valid: false, error: "INVALID_LENGTH" };
  }

  // Check for @ symbol
  if (!email.includes("@")) {
    return { valid: false, error: "MISSING_AT" };
  }

  const [local, domain] = email.split("@");

  // Check for domain
  if (!domain || domain.length === 0) {
    return { valid: false, error: "MISSING_DOMAIN" };
  }

  // Check for whitespace
  if (/\s/.test(email)) {
    return { valid: false, error: "INVALID_CHARS" };
  }

  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: "INVALID_FORMAT" };
  }

  return { valid: true };
}
