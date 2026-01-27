/**
 * @arch archcodex.core.domain
 *
 * Deterministic keyword extraction from architecture definitions.
 * No LLM required - extracts keywords from metadata.
 */
import type { ArchitectureNode, Hint } from '../registry/schema.js';

/**
 * Common English stop words to filter out.
 */
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'has',
  'are', 'was', 'were', 'been', 'being', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'not',
  'but', 'nor', 'yet', 'also', 'just', 'only', 'even', 'more',
  'most', 'other', 'some', 'any', 'all', 'each', 'every', 'both',
  'few', 'many', 'much', 'such', 'what', 'which', 'who', 'whom',
  'whose', 'when', 'where', 'why', 'how', 'than', 'then', 'now',
  'here', 'there', 'very', 'too', 'out', 'into', 'over', 'under',
  'above', 'below', 'between', 'through', 'during', 'before', 'after',
  'about', 'against', 'within', 'without', 'upon', 'while', 'unless',
  'until', 'because', 'although', 'though', 'since', 'whether', 'use',
  'used', 'using', 'uses', 'file', 'files', 'like', 'etc', 'able',
  // Contraction fragments and common pronouns
  'don', 'doesn', 'didn', 'isn', 'aren', 'wasn', 'weren', 'won',
  'couldn', 'shouldn', 'wouldn', 'hasn', 'haven', 'hadn',
  'its', 'itself', 'these', 'those', 'them', 'they', 'their', 'theirs',
]);

/**
 * Tokenize text into lowercase words, filtering punctuation.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/**
 * Extract the text content from a hint.
 */
function getHintText(hint: Hint): string {
  if (typeof hint === 'string') {
    return hint;
  }
  return hint.text;
}

/**
 * Extract keywords from an architecture definition.
 *
 * Sources of keywords:
 * 1. Architecture ID segments (e.g., "archcodex.core.engine" -> ["archcodex", "core", "engine"])
 * 2. Description and rationale text
 * 3. Hint text
 * 4. Mixin names
 * 5. Constraint values (for forbid_import, require_import, etc.)
 */
export function extractKeywords(archId: string, node: ArchitectureNode): string[] {
  const words = new Set<string>();

  // 1. Split arch ID into segments
  archId.split('.').forEach((seg) => {
    if (seg.length > 2 && !STOP_WORDS.has(seg.toLowerCase())) {
      words.add(seg.toLowerCase());
    }
  });

  // 2. Extract from description and rationale
  const textSources = [
    node.description ?? '',
    node.rationale ?? '',
  ].join(' ');

  tokenize(textSources).forEach((w) => {
    if (!STOP_WORDS.has(w)) {
      words.add(w);
    }
  });

  // 3. Extract from hints
  if (node.hints) {
    for (const hint of node.hints) {
      tokenize(getHintText(hint)).forEach((w) => {
        if (!STOP_WORDS.has(w)) {
          words.add(w);
        }
      });
    }
  }

  // 4. Include mixin names
  if (node.mixins) {
    node.mixins.forEach((m) => {
      if (m.length > 2 && !STOP_WORDS.has(m.toLowerCase())) {
        words.add(m.toLowerCase());
      }
    });
  }

  // 5. Extract from constraint values (only simple string values)
  if (node.constraints) {
    for (const constraint of node.constraints) {
      const values = Array.isArray(constraint.value)
        ? constraint.value
        : [constraint.value];

      for (const val of values) {
        // Skip non-string values (objects, numbers, booleans, etc.)
        if (typeof val !== 'string') continue;
        const strVal = val.toLowerCase();
        // Skip regex patterns (contain backslashes, pipes with parens, or bracket groups)
        if (/[\\|[\]{}()]/.test(strVal)) continue;
        // Only add meaningful string values (not numbers, short strings)
        if (strVal.length > 2 && !STOP_WORDS.has(strVal) && !/^\d+$/.test(strVal)) {
          words.add(strVal);
        }
      }
    }
  }

  // Convert to sorted array for deterministic output
  return [...words].sort();
}

/**
 * Extract keywords for all architectures in a registry.
 * Returns a map of arch ID to keywords array.
 */
export function extractAllKeywords(
  nodes: Record<string, ArchitectureNode>
): Map<string, string[]> {
  const result = new Map<string, string[]>();

  for (const [archId, node] of Object.entries(nodes)) {
    result.set(archId, extractKeywords(archId, node));
  }

  return result;
}
