/**
 * @arch archcodex.core.domain
 * @intent:spec-infrastructure
 *
 * Pure value generators for SpecCodex placeholders.
 * These generate deterministic or random test values.
 */

/**
 * Generate a string of specified length.
 */
export function generateString(length: number, mode: 'deterministic' | 'random'): string {
  if (length === 0) return '';

  if (mode === 'deterministic') {
    // Deterministic: repeating pattern
    const pattern = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    while (result.length < length) {
      result += pattern;
    }
    return result.slice(0, length);
  } else {
    // Random: random characters
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }
}

/**
 * Generate a URL of approximately specified length.
 */
export function generateUrl(targetLength: number, mode: 'deterministic' | 'random'): string {
  const base = 'https://example.com/';
  const remaining = Math.max(0, targetLength - base.length);

  if (remaining === 0) return base;

  const path = generateString(remaining, mode);
  return base + path;
}

/**
 * Generate a number between min and max (inclusive).
 */
export function generateNumber(min: number, max: number, mode: 'deterministic' | 'random'): number {
  if (mode === 'deterministic') {
    // Deterministic: return midpoint (rounded if integers)
    const mid = (min + max) / 2;
    // If both min and max are integers, return an integer
    if (Number.isInteger(min) && Number.isInteger(max)) {
      return Math.round(mid);
    }
    return mid;
  } else {
    // Random: random number in range
    const value = min + Math.random() * (max - min);
    // If both min and max are integers, return an integer
    if (Number.isInteger(min) && Number.isInteger(max)) {
      return Math.floor(value);
    }
    return value;
  }
}

/**
 * Generate a UUID v4.
 */
export function generateUUID(): string {
  // Generate random bytes
  const hex = '0123456789abcdef';
  let uuid = '';

  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += '-';
    } else if (i === 14) {
      uuid += '4'; // Version 4
    } else if (i === 19) {
      uuid += hex[Math.floor(Math.random() * 4) + 8]; // Variant bits
    } else {
      uuid += hex[Math.floor(Math.random() * 16)];
    }
  }

  return uuid;
}

/**
 * Parse an object template string into a JavaScript object.
 * Handles JSON5-like syntax with unquoted keys and single quotes.
 */
export function parseObjectTemplate(str: string): Record<string, unknown> {
  // Convert JSON5-like syntax to valid JSON
  let jsonStr = str
    // Add quotes around unquoted keys
    .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
    // Convert single-quoted strings to double-quoted (but preserve @placeholders)
    .replace(/'(@[^']+)'/g, '"$1"')
    .replace(/'([^']*)'/g, '"$1"');

  try {
    return JSON.parse(jsonStr);
  } catch { /* quote conversion failed, try original */
    // Fallback: try as-is
    return JSON.parse(str);
  }
}

/**
 * Parse an array template string into a JavaScript array.
 */
export function parseArrayTemplate(str: string): unknown[] {
  // Similar to parseObjectTemplate but for arrays
  let jsonStr = str
    .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
    .replace(/'(@[^']+)'/g, '"$1"')
    .replace(/'([^']*)'/g, '"$1"');

  try {
    return JSON.parse(jsonStr);
  } catch { /* quote conversion failed, try original */
    return JSON.parse(str);
  }
}
