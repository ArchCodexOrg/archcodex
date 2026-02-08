/**
 * @arch archcodex.test.fixture
 *
 * Fixture: plain exported function for inferrer tests.
 */

export function formatDate(date: Date, locale?: string): string {
  return date.toLocaleDateString(locale ?? 'en-US');
}
