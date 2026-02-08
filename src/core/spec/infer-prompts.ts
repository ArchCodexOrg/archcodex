/**
 * @arch archcodex.core.domain.llm
 *
 * Prompt building, response parsing, and YAML merging for LLM spec enrichment.
 */
import type { EnrichmentRequest, EnrichedSections } from './inferrer.types.js';

// Re-export for consumers
export type { EnrichedSections, EnrichmentRequest, CodeContext } from './inferrer.types.js';

/**
 * Build an LLM prompt that generates goal, intent, examples, and invariants from code.
 */
export function buildEnrichmentPrompt(request: EnrichmentRequest): string {
  const lines: string[] = [
    'TASK: Generate behavioral specification sections for a TypeScript function.',
    '',
    'You are analyzing an implementation to generate spec sections:',
    '- goal: High-level purpose (1 sentence)',
    '- intent: What the function does operationally (1 sentence)',
    '- successExamples: Concrete test cases with given/then',
    '- errorExamples: Error cases with given/then (use detected error codes)',
    '- invariants: Behavioral rules that always hold',
    '',
  ];

  // Include function code
  lines.push('IMPLEMENTATION:');
  lines.push(`File: ${request.filePath}`);
  lines.push(`Export: ${request.exportName}`);
  lines.push('```typescript');
  lines.push(request.content);
  lines.push('```');
  lines.push('');

  // Include imported type definitions
  if (request.context.importedTypes.length > 0) {
    lines.push('IMPORTED TYPE DEFINITIONS:');
    for (const type of request.context.importedTypes) {
      lines.push(`// From ${type.filePath}`);
      lines.push(type.definition);
      lines.push('');
    }
  }

  // Include structural skeleton
  lines.push('STRUCTURAL SKELETON (inputs, outputs, effects already detected):');
  lines.push(request.skeleton.yaml);
  lines.push('');

  // Include error codes if detected
  if (request.skeleton.detectedPatterns.errorCodes.length > 0) {
    lines.push(`DETECTED ERROR CODES: ${request.skeleton.detectedPatterns.errorCodes.join(', ')}`);
    lines.push('Create errorExamples for each error code.');
    lines.push('');
  }

  // Output format instructions
  lines.push('OUTPUT FORMAT: Return ONLY valid JSON with this exact structure:');
  lines.push('{');
  lines.push('  "goal": "one sentence describing the high-level goal",');
  lines.push('  "intent": "one sentence describing what this function does",');
  lines.push('  "successExamples": [');
  lines.push('    { "name": "descriptive name", "given": { "paramName": "concreteValue" }, "then": { "result.fieldName": "expectedValue" } }');
  lines.push('  ],');
  lines.push('  "errorExamples": [');
  lines.push('    { "name": "error case name", "given": { "paramName": "invalidValue" }, "then": { "errorCode": "ERROR_CODE" } }');
  lines.push('  ],');
  lines.push('  "invariants": ["behavioral rule that always holds"]');
  lines.push('}');
  lines.push('');
  lines.push('RULES:');
  lines.push('- Use concrete values in examples (not placeholders)');
  lines.push('- Match error codes to detected ones above');
  lines.push('- Write testable invariants (avoid vague statements)');
  lines.push('- goal and intent should be different: goal is "why", intent is "what"');
  lines.push('- Return ONLY the JSON, no markdown code blocks, no explanations');

  return lines.join('\n');
}

/**
 * Parse LLM JSON response into structured enriched sections.
 */
export function parseEnrichmentResponse(response: string): EnrichedSections {
  const fallback: EnrichedSections = {
    goal: 'TODO: Could not parse LLM response — describe the high-level goal',
    intent: 'TODO: Could not parse LLM response — describe what this function does',
    successExamples: [],
    errorExamples: [],
    invariants: ['TODO: Define invariants manually'],
  };

  if (!response || response.trim().length === 0) {
    return fallback;
  }

  // Strip markdown code blocks
  let cleaned = response.trim();
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(cleaned);

    return {
      goal: typeof parsed.goal === 'string' && parsed.goal.length > 0
        ? parsed.goal
        : fallback.goal,
      intent: typeof parsed.intent === 'string' && parsed.intent.length > 0
        ? parsed.intent
        : fallback.intent,
      successExamples: Array.isArray(parsed.successExamples)
        ? parsed.successExamples
        : [],
      errorExamples: Array.isArray(parsed.errorExamples)
        ? parsed.errorExamples
        : [],
      invariants: Array.isArray(parsed.invariants)
        ? parsed.invariants.filter((i: unknown): i is string => typeof i === 'string')
        : [],
    };
  } catch { /* YAML parse error */
    return fallback;
  }
}

/**
 * Merge LLM-enriched sections back into the structural spec skeleton YAML.
 */
export function mergeEnrichedSections(
  skeletonYaml: string,
  enriched: EnrichedSections,
): string {
  let result = skeletonYaml;

  // Replace goal
  if (!enriched.goal.startsWith('TODO')) {
    result = result.replace(
      /goal: "TODO:[^"]*"/,
      `goal: "${escapeYaml(enriched.goal)}"`,
    );
  }

  // Replace intent
  if (!enriched.intent.startsWith('TODO')) {
    result = result.replace(
      /intent: "TODO:[^"]*"/,
      `intent: "${escapeYaml(enriched.intent)}"`,
    );
  }

  // Replace invariants section
  if (enriched.invariants.length > 0 && !enriched.invariants.every(i => i.startsWith('TODO'))) {
    const invariantLines = enriched.invariants
      .map(i => `    - "${escapeYaml(i)}"`)
      .join('\n');
    result = result.replace(
      / {2}invariants:\n(?: {4}- "TODO:[^"]*"\n?)+/,
      `  invariants:\n${invariantLines}\n`,
    );
  }

  // Replace examples section
  if (enriched.successExamples.length > 0 || enriched.errorExamples.length > 0) {
    const examplesYaml = buildExamplesYaml(enriched);
    const examplesMarker = '  # === EXAMPLES ===';
    const markerIdx = result.indexOf(examplesMarker);
    if (markerIdx !== -1) {
      // Examples is always the last section — replace from marker to end
      const beforeMarker = result.slice(0, markerIdx);
      result = beforeMarker + examplesMarker + '\n' + examplesYaml + '\n';
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build YAML for the examples section from enriched data.
 */
function buildExamplesYaml(enriched: EnrichedSections): string {
  const lines: string[] = [];
  lines.push('  examples:');

  if (enriched.successExamples.length > 0) {
    lines.push('    success:');
    for (const ex of enriched.successExamples) {
      lines.push(`      - name: "${escapeYaml(ex.name)}"`);
      const givenEntries = Object.entries(ex.given || {});
      if (givenEntries.length === 0) {
        lines.push('        given: {}');
      } else {
        lines.push('        given:');
        for (const [key, value] of givenEntries) {
          lines.push(`          ${key}: ${formatYamlValue(value)}`);
        }
      }
      const thenEntries = Object.entries(ex.then || {});
      if (thenEntries.length === 0) {
        lines.push('        then: {}');
      } else {
        lines.push('        then:');
        for (const [key, value] of thenEntries) {
          lines.push(`          ${key}: ${formatYamlValue(value)}`);
        }
      }
    }
  }

  if (enriched.errorExamples.length > 0) {
    lines.push('    errors:');
    for (const ex of enriched.errorExamples) {
      lines.push(`      - name: "${escapeYaml(ex.name)}"`);
      const givenEntries = Object.entries(ex.given || {});
      if (givenEntries.length === 0) {
        lines.push('        given: {}');
      } else {
        lines.push('        given:');
        for (const [key, value] of givenEntries) {
          lines.push(`          ${key}: ${formatYamlValue(value)}`);
        }
      }
      lines.push('        then:');
      for (const [key, value] of Object.entries(ex.then || {})) {
        lines.push(`          ${key}: ${formatYamlValue(value)}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Escape a string for use inside a YAML double-quoted scalar.
 */
function escapeYaml(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

/**
 * Format a value for YAML output.
 */
function formatYamlValue(value: unknown): string {
  if (typeof value === 'string') return `"${escapeYaml(value)}"`;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return JSON.stringify(value);
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    if (entries.length <= 3 && entries.every(([, v]) => typeof v !== 'object')) {
      const parts = entries.map(([k, v]) => `${k}: ${formatYamlValue(v)}`);
      return `{ ${parts.join(', ')} }`;
    }
    return JSON.stringify(value);
  }
  return String(value);
}
