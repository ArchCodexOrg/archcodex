/**
 * @arch archcodex.core.domain
 * @intent:spec-infrastructure
 *
 * Placeholder catalog and suggestion utilities for SpecCodex.
 * Lists all supported placeholders and provides typo/similarity suggestions.
 */

/**
 * Known placeholder names for suggestion matching.
 */
export const KNOWN_PLACEHOLDERS = [
  'authenticated', 'no_access', 'admin_user',
  'string', 'url', 'number', 'array', 'now', 'uuid',
  'created', 'exists', 'defined', 'undefined', 'empty',
  'contains', 'lt', 'gt', 'lte', 'gte', 'between',
  'matches', 'type', 'length',
  'hasItem', 'hasProperties', 'oneOf',
  'all', 'and', 'any', 'or', 'not',
  'random', 'ref',
];

/**
 * Find similar placeholder names using simple string matching.
 * Returns up to 3 suggestions sorted by relevance.
 */
export function findSimilarPlaceholders(input: string): string[] {
  // Extract the base name from the input (remove @ prefix and any parameters)
  const baseName = input.replace(/^@/, '').replace(/\(.*\)$/, '').toLowerCase();

  if (!baseName) return [];

  const scored: Array<{ name: string; score: number }> = [];

  for (const known of KNOWN_PLACEHOLDERS) {
    const knownLower = known.toLowerCase();
    let score = 0;

    // Exact match (shouldn't happen, but handle it)
    if (knownLower === baseName) {
      score = 100;
    }
    // Check for common typos/variations first (high priority)
    else if (
      // not_exists, no_exist, notexist -> exists, undefined
      (baseName.includes('exist') && (known === 'exists' || known === 'undefined')) ||
      // undef -> undefined
      (baseName.includes('undef') && known === 'undefined') ||
      // null, isnull -> exists, undefined
      (baseName.includes('null') && (known === 'exists' || known === 'undefined')) ||
      // def -> defined
      (baseName.includes('def') && known === 'defined') ||
      // contain -> contains
      (baseName.includes('contain') && known === 'contains') ||
      // match -> matches
      (baseName.includes('match') && known === 'matches') ||
      // has -> hasItem, hasProperties
      (baseName.includes('has') && (known === 'hasItem' || known === 'hasProperties'))
    ) {
      score = 85;
    }
    // Starts with same prefix
    else if (knownLower.startsWith(baseName) || baseName.startsWith(knownLower)) {
      score = 80;
    }
    // Contains the input (but not short matches like "not" in "not_exists")
    else if (
      (knownLower.includes(baseName) && baseName.length >= 4) ||
      (baseName.includes(knownLower) && knownLower.length >= 4)
    ) {
      score = 60;
    }
    // Levenshtein-like: check character overlap
    else {
      const overlap = countCommonChars(baseName, knownLower);
      if (overlap >= Math.min(baseName.length, knownLower.length) * 0.5) {
        score = 30 + overlap * 5;
      }
    }

    if (score > 0) {
      scored.push({ name: `@${known}`, score });
    }
  }

  // Sort by score descending, take top 3
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(s => s.name);
}

/**
 * Count common characters between two strings.
 */
function countCommonChars(a: string, b: string): number {
  const aChars = new Set(a.split(''));
  let count = 0;
  for (const char of b) {
    if (aChars.has(char)) count++;
  }
  return count;
}

/**
 * List all supported placeholders with descriptions.
 */
export function listPlaceholders(): Array<{ placeholder: string; description: string; example: string }> {
  return [
    // Built-in fixtures
    { placeholder: '@authenticated', description: 'Valid authenticated user context (built-in fixture)', example: '@authenticated' },
    { placeholder: '@no_access', description: 'User without permissions (built-in fixture)', example: '@no_access' },
    { placeholder: '@admin_user', description: 'Admin user with full permissions (built-in fixture)', example: '@admin_user' },
    { placeholder: '@fixtureName', description: 'Project-defined fixture from .arch/specs/_fixtures.yaml', example: '@validTaskEntry' },

    // Value generators
    { placeholder: '@string(N)', description: 'String of length N', example: '@string(100)' },
    { placeholder: '@url(N)', description: 'Valid URL of approximately length N', example: '@url(2048)' },
    { placeholder: '@number(min, max)', description: 'Random number between min and max (inclusive)', example: '@number(1, 100)' },
    { placeholder: '@array(N, template)', description: 'Array of N items with template expanded recursively', example: "@array(3, { id: '@uuid', name: '@string(10)' })" },
    { placeholder: '@now', description: 'Current timestamp', example: '@now' },
    { placeholder: '@now(+/-Nd/h/m/s)', description: 'Timestamp with offset', example: '@now(-1d)' },
    { placeholder: '@uuid', description: 'Generate a UUID v4', example: '@uuid' },

    // Basic assertions
    { placeholder: '@created', description: 'Assert successful creation', example: '@created' },
    { placeholder: '@exists', description: 'Assert non-null value', example: '@exists' },
    { placeholder: '@defined', description: 'Assert value is defined', example: '@defined' },
    { placeholder: '@undefined', description: 'Assert value is undefined', example: '@undefined' },
    { placeholder: '@empty', description: 'Assert array/string/object is empty', example: '@empty' },
    { placeholder: "@contains('x')", description: 'Assert string/array contains x', example: "@contains('error')" },
    { placeholder: '@lt(N)', description: 'Assert less than N', example: '@lt(500)' },
    { placeholder: '@gt(N)', description: 'Assert greater than N', example: '@gt(0)' },
    { placeholder: '@lte(N)', description: 'Assert less than or equal to N', example: '@lte(100)' },
    { placeholder: '@gte(N)', description: 'Assert greater than or equal to N', example: '@gte(1)' },
    { placeholder: '@between(min, max)', description: 'Assert value is between min and max (inclusive)', example: '@between(1, 100)' },
    { placeholder: "@matches('regex')", description: 'Assert matches regex', example: "@matches('^[a-z]+$')" },
    { placeholder: "@type('name')", description: 'Assert value is of specified type', example: "@type('array')" },
    { placeholder: '@length(N)', description: 'Assert array/string has length N', example: '@length(5)' },

    // Object/array assertions
    { placeholder: '@hasItem({...})', description: 'Assert array contains object matching properties', example: "@hasItem({ name: 'intent' })" },
    { placeholder: "@hasItem('x')", description: 'Assert array contains string x', example: "@hasItem('valid url')" },
    { placeholder: '@hasItem(N)', description: 'Assert array contains number N', example: '@hasItem(42)' },
    { placeholder: '@hasProperties({...})', description: 'Assert object has matching properties (use for non-array objects)', example: "@hasProperties({ q: 'hello' })" },
    { placeholder: '@oneOf([...])', description: 'Assert value is one of the specified values (supports single quotes)', example: "@oneOf(['active', 'pending'])" },
    { placeholder: '@all(...)', description: 'Assert all nested assertions pass', example: "@all(@gt(0), @lt(100))" },
    { placeholder: '@and(...)', description: 'Alias for @all - combine multiple assertions', example: "@and(@hasItem({a:1}), @hasItem({b:2}))" },
    { placeholder: '@any(...)', description: 'Assert any of the nested assertions pass', example: "@any(@gt(100), @lt(0))" },
    { placeholder: '@or(...)', description: 'Alias for @any', example: "@or(@contains('a'), @contains('b'))" },
    { placeholder: '@not(...)', description: 'Negate an assertion', example: "@not(@contains('error'))" },

    // JSONPath support
    { placeholder: 'path[*]', description: 'Wildcard - assert for all items in array', example: "result.items[*].status: 'valid'" },
    { placeholder: 'path[N]', description: 'Index - assert for specific array item', example: "result.items[0].name: 'first'" },

    // Modifiers
    { placeholder: '@random(@placeholder)', description: 'Force random mode for nested placeholder (non-deterministic)', example: '@random(@string(10))' },

    // Cross-field references
    { placeholder: '@ref(field.path)', description: 'Reference another field value (generates equality check)', example: '@ref(input.name)' },
  ];
}
