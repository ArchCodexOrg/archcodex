/**
 * @arch archcodex.core.domain
 *
 * Concept mapping loader for semantic discovery.
 * Maps natural language phrases to architectures.
 */
import { z } from 'zod';
import { resolve } from 'node:path';
import { readFile, fileExists } from '../../utils/file-system.js';
import { parseYaml } from '../../utils/yaml.js';

const DEFAULT_CONCEPTS_PATH = '.arch/concepts.yaml';

/**
 * Schema for a single concept definition.
 */
const ConceptSchema = z.object({
  description: z.string().optional(),
  aliases: z.array(z.string()),
  architectures: z.array(z.string()),
});

/**
 * Schema for the entire concepts registry.
 */
const ConceptRegistrySchema = z.object({
  concepts: z.record(z.string(), ConceptSchema),
});

export type Concept = z.infer<typeof ConceptSchema>;
export type ConceptRegistry = z.infer<typeof ConceptRegistrySchema>;

/**
 * Typed iteration over concept entries.
 * Workaround for Zod 4's z.record() not flowing types through Object.entries().
 */
export function conceptEntries(
  registry: ConceptRegistry
): Array<[string, Concept]> {
  return Object.entries(registry.concepts) as Array<[string, Concept]>;
}

/**
 * Typed iteration over concept values.
 * Workaround for Zod 4's z.record() not flowing types through Object.values().
 */
export function conceptValues(registry: ConceptRegistry): Concept[] {
  return Object.values(registry.concepts) as Concept[];
}

/**
 * Load the concept registry from the .arch directory.
 * Returns null if the file doesn't exist (concepts are optional).
 */
export async function loadConcepts(
  projectRoot: string,
  conceptsPath?: string
): Promise<ConceptRegistry | null> {
  const fullPath = resolve(
    projectRoot,
    conceptsPath ?? DEFAULT_CONCEPTS_PATH
  );

  // Concepts file is optional
  if (!(await fileExists(fullPath))) {
    return null;
  }

  try {
    const content = await readFile(fullPath);
    const parsed = parseYaml(content);
    return ConceptRegistrySchema.parse(parsed);
  } catch {
    // If concepts.yaml is invalid, return null rather than crashing
    return null;
  }
}

/**
 * Match a query against concepts and return matching architecture IDs.
 * Returns architectures sorted by match quality (most aliases matched first).
 */
export function matchConcepts(
  query: string,
  concepts: ConceptRegistry
): ConceptMatch[] {
  const lowerQuery = query.toLowerCase();
  const matches: ConceptMatch[] = [];

  for (const [name, concept] of conceptEntries(concepts)) {
    const matchedAliases: string[] = [];

    for (const alias of concept.aliases) {
      if (lowerQuery.includes(alias.toLowerCase())) {
        matchedAliases.push(alias);
      }
    }

    if (matchedAliases.length > 0) {
      matches.push({
        conceptName: name,
        matchedAliases,
        architectures: concept.architectures,
        confidence: matchedAliases.length / concept.aliases.length,
      });
    }
  }

  // Sort by confidence (most aliases matched = highest confidence)
  return matches.sort((a, b) => b.confidence - a.confidence);
}

export interface ConceptMatch {
  conceptName: string;
  matchedAliases: string[];
  architectures: string[];
  confidence: number;
}

/**
 * Get unique architecture IDs from concept matches.
 * Returns deduplicated list preserving order (highest confidence first).
 */
export function getArchitecturesFromMatches(matches: ConceptMatch[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const match of matches) {
    for (const archId of match.architectures) {
      if (!seen.has(archId)) {
        seen.add(archId);
        result.push(archId);
      }
    }
  }

  return result;
}

/**
 * Result of validating concepts against registry.
 */
export interface ConceptValidationResult {
  valid: boolean;
  invalidReferences: Array<{
    conceptName: string;
    archId: string;
  }>;
  orphanedConcepts: string[];
  missingConcepts: string[];
}

/**
 * Validate that all architecture IDs in concepts.yaml exist in the registry.
 */
export function validateConcepts(
  concepts: ConceptRegistry,
  validArchIds: Set<string>
): ConceptValidationResult {
  const invalidReferences: Array<{ conceptName: string; archId: string }> = [];
  const orphanedConcepts: string[] = [];

  for (const [name, concept] of conceptEntries(concepts)) {
    let hasValidArch = false;

    for (const archId of concept.architectures) {
      if (validArchIds.has(archId)) {
        hasValidArch = true;
      } else {
        invalidReferences.push({ conceptName: name, archId });
      }
    }

    if (!hasValidArch) {
      orphanedConcepts.push(name);
    }
  }

  return {
    valid: invalidReferences.length === 0,
    invalidReferences,
    orphanedConcepts,
    missingConcepts: [], // Could be filled by analyzing registry for gaps
  };
}
