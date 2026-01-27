/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * LLM-based concept generation for semantic discovery.
 */
import * as path from 'node:path';
import { loadConcepts, validateConcepts, type ConceptRegistry, type ConceptValidationResult } from './concepts.js';
import { writeFile } from '../../utils/file-system.js';
import { stringifyYaml, parseYaml } from '../../utils/yaml.js';
import type { Registry } from '../registry/schema.js';
import type { ILLMProvider } from '../../llm/types.js';

export interface ConceptGenerationResult {
  success: boolean;
  conceptCount: number;
  coverage: number;
  coveredArchs: number;
  totalArchs: number;
  validation?: ConceptValidationResult;
  error?: string;
}

/**
 * Generate or update concepts.yaml using LLM.
 * Returns result without console output (caller handles display).
 */
export async function generateConcepts(
  projectRoot: string,
  registry: Registry,
  provider: ILLMProvider
): Promise<ConceptGenerationResult> {
  // Load existing concepts for merging
  const existingConcepts = await loadConcepts(projectRoot);

  // Build a summary of architectures for the LLM
  const archSummaries: string[] = [];
  for (const [archId, def] of Object.entries(registry.nodes)) {
    const arch = def as { description?: string; rationale?: string };
    archSummaries.push(`- ${archId}: ${arch.description || 'No description'}`);
  }

  const prompt = buildConceptPrompt(archSummaries, existingConcepts);

  try {
    const response = await provider.generate(prompt);

    // Extract YAML from response
    const yamlMatch = response.match(/```yaml\n([\s\S]*?)```/);
    if (!yamlMatch) {
      return { success: false, conceptCount: 0, coverage: 0, coveredArchs: 0, totalArchs: 0, error: 'Invalid YAML response' };
    }

    const conceptsYaml = yamlMatch[1];
    const newConcepts = parseYaml(conceptsYaml) as ConceptRegistry;

    // Validate the generated concepts
    const validArchIds = new Set(Object.keys(registry.nodes));
    const validation = validateConcepts(newConcepts, validArchIds);

    // Write concepts.yaml
    const conceptsPath = path.join(projectRoot, '.arch', 'concepts.yaml');
    const header = `# Auto-generated concepts for semantic discovery
# Maps natural language phrases to architectures
# Edit manually to add domain-specific aliases
# Regenerate with: archcodex garden --llm --concepts

`;
    await writeFile(conceptsPath, header + stringifyYaml(newConcepts));

    const conceptCount = Object.keys(newConcepts.concepts || {}).length;

    // Calculate coverage
    const coveredArchs = new Set<string>();
    for (const concept of Object.values(newConcepts.concepts || {})) {
      for (const archId of concept.architectures) {
        coveredArchs.add(archId);
      }
    }
    const totalArchs = Object.keys(registry.nodes).length;
    const coverage = Math.round((coveredArchs.size / totalArchs) * 100);

    return {
      success: true,
      conceptCount,
      coverage,
      coveredArchs: coveredArchs.size,
      totalArchs,
      validation,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, conceptCount: 0, coverage: 0, coveredArchs: 0, totalArchs: 0, error: errorMsg };
  }
}

/**
 * Build the LLM prompt for concept generation.
 */
function buildConceptPrompt(
  archSummaries: string[],
  existingConcepts: ConceptRegistry | null
): string {
  return `You are creating a semantic concept map for architecture discovery in a codebase.

## Context
When developers (or AI coding agents) need to create a new file, they search with natural language like:
- "I need to add a type guard"
- "where do API clients go"
- "business logic for payments"

Your task: Map these natural searches to the right architectures.

## Available Architectures
${archSummaries.join('\n')}

## What Makes Good Concepts

**Good aliases** are phrases developers actually type:
- "type guard" ✓ (common term)
- "runtime type check" ✓ (alternative phrasing)
- "zod schema" ✓ (specific tool)
- "TypeGuardValidatorPattern" ✗ (no one searches this)

**Good concepts** group by developer intent, not technical taxonomy:
- "validation" (groups: schemas, type guards, input checkers)
- "data_access" (groups: repositories, DAOs, database code)
- "api_handler" (groups: controllers, routes, endpoints)

**Coverage matters**: Every architecture should appear in at least one concept.

## Think About These Search Scenarios
1. Junior dev: "where does business logic go"
2. Senior dev: "repository pattern implementation"
3. AI agent: "http endpoint handler"
4. Refactoring: "domain service"

${existingConcepts ? `## Existing Concepts (preserve and enhance)
${stringifyYaml(existingConcepts)}

Keep existing concepts but:
- Add any missing architectures to appropriate concepts
- Add new concepts for architectures that don't fit existing ones
- Enhance aliases if you see gaps` : '## Starting Fresh\nCreate concepts that cover all architectures.'}

## Output Format
Return ONLY valid YAML (no explanation):
\`\`\`yaml
concepts:
  concept_name:
    description: "One sentence: what this concept represents"
    aliases:
      - "2-3 word phrase"
      - "alternative phrasing"
      - "common abbreviation"
      - "tool-specific term"
    architectures:
      - exact.arch.id
\`\`\`

Generate 5-15 concepts with 4-8 aliases each. Prioritize coverage over perfection.`;
}
