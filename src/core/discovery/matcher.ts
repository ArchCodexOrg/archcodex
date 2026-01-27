/**
 * @arch archcodex.core.domain
 */
import type { Index, IndexEntry } from './schema.js';
import type { ConceptRegistry } from './concepts.js';

/**
 * Result of a discovery match.
 */
export interface MatchResult {
  entry: IndexEntry;
  score: number;
  matchedKeywords: string[];
  /** If matched via concept, the concept name */
  matchedConcept?: string;
}

/**
 * Options for discovery matching.
 */
export interface MatchOptions {
  /** Maximum number of results to return */
  limit?: number;
  /** Minimum score threshold (0-1) */
  minScore?: number;
  /** Concept registry for semantic matching (optional) */
  concepts?: ConceptRegistry;
}

/** Common stop words to ignore in queries */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'for', 'to', 'of', 'in', 'on', 'at', 'by', 'with',
  'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'can', 'that', 'this', 'these', 'those',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'it', 'its',
]);

/**
 * Tokenize a query string into normalized keywords.
 * Filters out stop words and very short words.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

/**
 * Calculate similarity between two strings.
 * Returns high score only for exact matches or clear substring relationships.
 */
function wordSimilarity(queryWord: string, keyword: string): number {
  // Exact match - highest score
  if (queryWord === keyword) return 1.0;

  // Query word is contained in a multi-word keyword (e.g., "utility" in "utility function")
  const keywordWords = keyword.split(/\s+/);
  if (keywordWords.includes(queryWord)) return 0.95;

  // Keyword contains query word as substring (e.g., "serial" in "serializing")
  if (keyword.includes(queryWord) && queryWord.length >= 4) return 0.85;

  // Query word contains keyword (e.g., "serializing" contains "serial")
  if (queryWord.includes(keyword) && keyword.length >= 4) return 0.8;

  // Stem matching - common programming suffixes
  const stems = [
    ['ing', ''], ['tion', 't'], ['er', 'e'], ['ed', 'e'],
    ['ize', ''], ['izing', ''], ['ization', ''],
  ];
  for (const [suffix, replacement] of stems) {
    const queryStem = queryWord.endsWith(suffix) ? queryWord.slice(0, -suffix.length) + replacement : queryWord;
    const keywordStem = keyword.endsWith(suffix) ? keyword.slice(0, -suffix.length) + replacement : keyword;
    if (queryStem === keywordStem && queryStem.length >= 4) return 0.9;
  }

  // No good match - return 0 (don't give partial credit for unrelated words)
  return 0;
}

/**
 * Match a query against index entries.
 * First tries concept matching (semantic), then falls back to keyword matching.
 */
export function matchQuery(
  index: Index,
  query: string,
  options: MatchOptions = {}
): MatchResult[] {
  const { limit = 5, minScore = 0.2, concepts } = options;

  // Step 1: Try concept matching first (semantic understanding)
  if (concepts) {
    const conceptResults = matchQueryByConcepts(index, query, concepts, limit);
    if (conceptResults.length > 0) {
      // Found concept matches - return them (potentially combined with keyword results)
      const keywordResults = matchQueryByKeywords(index, query, { limit, minScore });

      // Merge: concept matches first, then keyword matches not already included
      const seen = new Set<string>();
      const merged: MatchResult[] = [];

      for (const r of conceptResults) {
        seen.add(r.entry.arch_id);
        merged.push(r);
      }

      for (const r of keywordResults) {
        if (!seen.has(r.entry.arch_id)) {
          seen.add(r.entry.arch_id);
          merged.push(r);
        }
      }

      return merged.slice(0, limit);
    }
  }

  // Step 2: Fall back to keyword matching
  return matchQueryByKeywords(index, query, { limit, minScore });
}

/**
 * Match query using concept mapping (semantic matching).
 */
function matchQueryByConcepts(
  index: Index,
  query: string,
  concepts: ConceptRegistry,
  limit: number
): MatchResult[] {
  const lowerQuery = query.toLowerCase();
  const results: MatchResult[] = [];

  // Find matching concepts
  for (const [conceptName, concept] of Object.entries(concepts.concepts)) {
    const matchedAliases: string[] = [];

    for (const alias of concept.aliases) {
      if (lowerQuery.includes(alias.toLowerCase())) {
        matchedAliases.push(alias);
      }
    }

    if (matchedAliases.length > 0) {
      // Find index entries for these architectures
      for (const archId of concept.architectures) {
        const entry = index.entries.find(e => e.arch_id === archId);
        if (entry) {
          // High score for concept matches (semantic understanding)
          const score = 0.9 + (matchedAliases.length / concept.aliases.length) * 0.1;
          results.push({
            entry,
            score,
            matchedKeywords: matchedAliases,
            matchedConcept: conceptName,
          });
        }
      }
    }
  }

  // Dedupe by arch_id (keep highest score)
  const byArchId = new Map<string, MatchResult>();
  for (const r of results) {
    const existing = byArchId.get(r.entry.arch_id);
    if (!existing || r.score > existing.score) {
      byArchId.set(r.entry.arch_id, r);
    }
  }

  return Array.from(byArchId.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Match query using keyword matching (traditional).
 */
function matchQueryByKeywords(
  index: Index,
  query: string,
  options: { limit: number; minScore: number }
): MatchResult[] {
  const { limit, minScore } = options;
  const queryTokens = tokenize(query);

  if (queryTokens.length === 0) {
    return [];
  }

  const results: MatchResult[] = [];

  for (const entry of index.entries) {
    const entryKeywords = entry.keywords.map((k) => k.toLowerCase());
    // Also tokenize description for matching
    const descriptionTokens = entry.description ? tokenize(entry.description) : [];

    let totalScore = 0;
    const matchedKeywords: string[] = [];
    let keywordMatchCount = 0;

    for (const queryToken of queryTokens) {
      let bestMatch = 0;
      let bestKeyword = '';

      // Match against keywords (higher weight)
      for (const keyword of entryKeywords) {
        const similarity = wordSimilarity(queryToken, keyword);
        if (similarity > bestMatch) {
          bestMatch = similarity;
          bestKeyword = keyword;
        }
      }

      // Match against description (lower weight)
      if (bestMatch < 0.7) {
        for (const descWord of descriptionTokens) {
          const similarity = wordSimilarity(queryToken, descWord) * 0.6; // 60% weight for description matches
          if (similarity > bestMatch) {
            bestMatch = similarity;
            bestKeyword = descWord + ' (desc)';
          }
        }
      }

      // Match against arch_id parts (e.g., "utility" in "base.utility")
      if (bestMatch < 0.7) {
        const archParts = entry.arch_id.toLowerCase().split('.');
        for (const part of archParts) {
          const similarity = wordSimilarity(queryToken, part) * 0.8; // 80% weight for arch_id matches
          if (similarity > bestMatch) {
            bestMatch = similarity;
            bestKeyword = part + ' (arch)';
          }
        }
      }

      if (bestMatch > 0.5) { // Increased threshold - only count good matches
        totalScore += bestMatch;
        keywordMatchCount++;
        if (bestKeyword && !matchedKeywords.includes(bestKeyword)) {
          matchedKeywords.push(bestKeyword);
        }
      }
    }

    // Require at least one good match
    if (keywordMatchCount === 0) continue;

    // Calculate score: average match quality + bonus for multiple matches
    const avgMatchQuality = totalScore / queryTokens.length;
    const coverageBonus = Math.min(0.2, (keywordMatchCount / queryTokens.length) * 0.3);
    const normalizedScore = avgMatchQuality + coverageBonus;

    if (normalizedScore >= minScore) {
      results.push({
        entry,
        score: normalizedScore,
        matchedKeywords,
      });
    }
  }

  // Sort by score (descending) and limit results
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Get all entries from an index.
 */
export function getAllEntries(index: Index): IndexEntry[] {
  return [...index.entries];
}

/**
 * Find entry by arch ID.
 */
export function findByArchId(index: Index, archId: string): IndexEntry | undefined {
  return index.entries.find((e) => e.arch_id === archId);
}
