/**
 * @arch archcodex.test.fixture
 *
 * Tag parser implementation fixture for spec verification.
 */

export function parseTags(
  text: string,
  options: { lowercase?: boolean; maxTags?: number } = {}
): { tags: string[]; count: number; error?: string } {
  const { lowercase = true, maxTags = 10 } = options;

  if (!text) {
    return { tags: [], count: 0, error: 'EMPTY_INPUT' };
  }

  const matches = text.match(/#(\w+)/g) || [];
  let tags = matches.map(m => m.slice(1)); // Remove # prefix

  if (lowercase) {
    tags = tags.map(t => t.toLowerCase());
  }

  if (tags.length > maxTags) {
    tags = tags.slice(0, maxTags);
  }

  return { tags, count: tags.length };
}
