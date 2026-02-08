/**
 * Test fixture: function that uses types imported from ./types
 */
import type { UserResult, UserInput } from './types.js';

export function processUser(input: UserInput): UserResult {
  return {
    valid: true,
    errors: [],
    userId: `user_${input.name}`,
  };
}
