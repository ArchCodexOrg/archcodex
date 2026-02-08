/**
 * @arch archcodex.test.fixture
 *
 * Phone validator implementation fixture for spec verification.
 */

export function validatePhone(
  phone: string,
  options: { country?: string; strict?: boolean } = {}
): { valid: boolean; error?: string; normalized?: string } {
  if (!phone) {
    return { valid: false, error: 'EMPTY_INPUT' };
  }

  // Remove common formatting characters
  const digits = phone.replace(/[\s\-\(\)\+]/g, '');

  if (digits.length < 7) {
    return { valid: false, error: 'TOO_SHORT' };
  }

  // Check for invalid characters (only digits after stripping formatting)
  if (!/^\d+$/.test(digits)) {
    return { valid: false, error: 'INVALID_CHARS' };
  }

  // Normalize to just digits
  const normalized = digits.replace(/^1/, ''); // Remove US country code if present

  return { valid: true, normalized };
}
