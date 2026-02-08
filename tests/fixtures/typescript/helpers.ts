/**
 * @arch archcodex.test.fixture
 *
 * Fixture: generic helper function for inferrer tests.
 */

export function doStuff(input: string): { result: string } {
  return { result: input.toUpperCase() };
}
