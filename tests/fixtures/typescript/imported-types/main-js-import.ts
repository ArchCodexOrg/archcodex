/**
 * Test fixture: function that imports types using .js extension
 */
import type { UserResult } from './types.js';

export function getUser(): UserResult {
  return { valid: true, errors: [], userId: 'test' };
}
