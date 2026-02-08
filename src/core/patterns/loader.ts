/**
 * @arch archcodex.core.domain
 *
 * Pattern registry loader - loads and validates .arch/patterns.yaml.
 */
import * as path from 'node:path';
import * as yaml from 'yaml';
import { fileExists, readFile } from '../../utils/file-system.js';
import { PatternRegistrySchema } from './schema.js';
import type { PatternRegistry, Pattern, PatternMatch } from './types.js';

const DEFAULT_PATTERNS_PATH = '.arch/patterns.yaml';

/**
 * Load the pattern registry from the .arch directory.
 * Returns an empty registry if the file doesn't exist.
 */
export async function loadPatternRegistry(
  projectRoot: string,
  patternsPath?: string
): Promise<PatternRegistry> {
  const fullPath = path.resolve(
    projectRoot,
    patternsPath ?? DEFAULT_PATTERNS_PATH
  );

  // Pattern file is optional
  if (!(await fileExists(fullPath))) {
    return { patterns: {} };
  }

  try {
    const content = await readFile(fullPath);
    const parsed = yaml.parse(content);
    const validated = PatternRegistrySchema.parse(parsed);
    return validated;
  } catch { /* file not found or invalid YAML */
    // If patterns.yaml is invalid, return empty registry rather than crashing
    return { patterns: {} };
  }
}

/**
 * Find patterns that match a given import or code snippet.
 */
export function findMatchingPatterns(
  registry: PatternRegistry,
  content: string,
  options: { minConfidence?: number } = {}
): PatternMatch[] {
  const minConfidence = options.minConfidence ?? 0.3;
  const matches: PatternMatch[] = [];
  const lowerContent = content.toLowerCase();

  for (const [name, pattern] of Object.entries(registry.patterns)) {
    const keywords = pattern.keywords ?? [];
    if (keywords.length === 0) continue;

    const matchedKeywords = keywords.filter((keyword) =>
      lowerContent.includes(keyword.toLowerCase())
    );

    if (matchedKeywords.length === 0) continue;

    // Simple confidence: ratio of matched keywords to total
    const confidence = matchedKeywords.length / keywords.length;

    if (confidence >= minConfidence) {
      matches.push({
        name,
        pattern,
        confidence,
        matchedKeywords,
      });
    }
  }

  // Sort by confidence (highest first)
  return matches.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Check if a module/import might be duplicating a pattern.
 */
export function checkForPatternDuplication(
  registry: PatternRegistry,
  importPath: string,
  exportedSymbols: string[]
): PatternMatch | null {
  const lowerImport = importPath.toLowerCase();
  const lowerSymbols = exportedSymbols.map((s) => s.toLowerCase());

  for (const [name, pattern] of Object.entries(registry.patterns)) {
    const keywords = pattern.keywords ?? [];
    const exports = pattern.exports ?? [];

    // Check if import path matches pattern keywords
    const pathMatch = keywords.some((keyword) =>
      lowerImport.includes(keyword.toLowerCase())
    );

    // Check if exported symbols overlap with pattern exports
    const symbolMatch = exports.some((exp) =>
      lowerSymbols.includes(exp.toLowerCase())
    );

    // Check if we're importing something other than the canonical source
    const isNotCanonical = !importPath.includes(pattern.canonical);

    if ((pathMatch || symbolMatch) && isNotCanonical) {
      const matchedKeywords = keywords.filter(
        (keyword) =>
          lowerImport.includes(keyword.toLowerCase()) ||
          lowerSymbols.some((s) => s.includes(keyword.toLowerCase()))
      );

      return {
        name,
        pattern,
        confidence: keywords.length > 0 ? matchedKeywords.length / keywords.length : 0,
        matchedKeywords,
      };
    }
  }

  return null;
}

/**
 * Get a pattern by name.
 */
export function getPattern(
  registry: PatternRegistry,
  name: string
): Pattern | undefined {
  return registry.patterns[name];
}

/**
 * Context for relevance filtering - what the file actually uses.
 */
export interface RelevanceContext {
  imports: string[];        // Imported module paths
  exports: string[];        // Exported symbol names from this file
  content: string;          // File content for symbol checking
}

/**
 * Filter patterns to only those relevant to file's actual content.
 * This reduces noise by checking if the file actually uses anything
 * related to the pattern, rather than just keyword matching.
 *
 * Relevance criteria:
 * 1. File imports from pattern's canonical source
 * 2. File content mentions pattern's exports (uses them)
 * 3. File exports similar symbols (creates similar functionality)
 */
export function filterByRelevance(
  matches: PatternMatch[],
  context: RelevanceContext
): PatternMatch[] {
  return matches.filter(match => {
    const pattern = match.pattern;
    const canonicalBase = getBaseName(pattern.canonical);

    // Check 1: Does file import from pattern's canonical source?
    const importsCanonical = context.imports.some(imp => {
      const impBase = getBaseName(imp);
      return pattern.canonical.includes(imp) ||
             imp.includes(canonicalBase) ||
             impBase === canonicalBase;
    });
    if (importsCanonical) {
      (match as PatternMatch & { relevanceReason?: string }).relevanceReason =
        'File imports from canonical source';
      return true;
    }

    // Check 2: Does file content mention any of pattern's exports?
    const patternExports = pattern.exports ?? [];
    const mentionsExport = patternExports.some(exp =>
      context.content.includes(exp)
    );
    if (mentionsExport) {
      (match as PatternMatch & { relevanceReason?: string }).relevanceReason =
        'File uses pattern exports';
      return true;
    }

    // Check 3: Does file export something with similar name to pattern exports?
    const exportsSimilar = context.exports.some(fileExp =>
      patternExports.some(patternExp => {
        const fileExpLower = fileExp.toLowerCase();
        const patternExpLower = patternExp.toLowerCase();
        return fileExpLower.includes(patternExpLower) ||
               patternExpLower.includes(fileExpLower);
      })
    );
    if (exportsSimilar) {
      (match as PatternMatch & { relevanceReason?: string }).relevanceReason =
        'File exports similar symbols';
      return true;
    }

    // Not relevant to this file
    return false;
  });
}

/**
 * Get base name from a path (last segment without extension).
 */
function getBaseName(filePath: string): string {
  const segments = filePath.split('/');
  let name = segments[segments.length - 1];
  // Remove extension
  name = name.replace(/\.(js|ts|tsx|jsx|mjs|cjs)$/, '');
  // Handle index files
  if (name === 'index' && segments.length > 1) {
    name = segments[segments.length - 2];
  }
  return name;
}
