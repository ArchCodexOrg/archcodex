/**
 * @arch archcodex.test.fixture
 *
 * Calculator implementation fixture for spec verification.
 */

export function add(args: { a: number; b: number }): number {
  if (typeof args.a !== 'number' || typeof args.b !== 'number') {
    return { valid: false, error: 'INVALID_INPUT' } as any;
  }
  return args.a + args.b;
}
