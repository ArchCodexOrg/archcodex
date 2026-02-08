/**
 * @arch archcodex.test.fixture
 *
 * Function signature test fixture for spec verification.
 */

// Direct positional parameters
export function directParams(a: string, b: number): string {
  return a + b;
}

// Destructured object parameter
export function destructuredParams({ name, age }: { name: string; age: number }): string {
  return `${name} is ${age}`;
}

// Async function
export async function asyncFunction(input: string): Promise<string> {
  return input.toUpperCase();
}

// Sync function returning error object
export function syncWithError(value: number): { valid: boolean; error?: string } {
  if (value < 0) return { valid: false, error: 'NEGATIVE' };
  return { valid: true };
}
