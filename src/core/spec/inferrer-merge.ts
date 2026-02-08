/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Spec inferrer merge — handles updating existing specs with changes from implementation.
 * Preserves hand-written goal, intent, examples, and invariants during merge.
 */
import { inferSpec } from './inferrer.js';
import { loadSpecRegistry } from './loader.js';
import { resolveSpec } from './resolver.js';
import type { SpecNode } from './schema.js';
import type {
  InferResult,
  InferUpdateOptions,
  InferUpdateResult,
  MergeReport,
} from './inferrer.types.js';

/**
 * Input shape for inferSpecUpdate.
 */
interface InferSpecUpdateInput {
  specId: string;
  implementationPath: string;
  options?: InferUpdateOptions;
}

/**
 * Update existing spec with changes detected from implementation.
 */
export async function inferSpecUpdate(input: InferSpecUpdateInput): Promise<InferUpdateResult> {
  const { specId, implementationPath, options } = input;
  const projectRoot = options?.projectRoot ?? process.cwd();

  // Load existing spec
  const registry = await loadSpecRegistry(projectRoot);
  if (!registry || Object.keys(registry.nodes).length === 0) {
    return makeUpdateErrorResult('SPEC_NOT_FOUND', `Spec registry not found in ${projectRoot}`);
  }

  const resolved = resolveSpec(registry, specId);
  if (!resolved.valid || !resolved.spec) {
    return makeUpdateErrorResult('SPEC_NOT_FOUND', `Spec '${specId}' not found in registry`);
  }

  const node = resolved.spec.node;

  // Infer fresh from implementation
  const inferred = inferSpec({ implementationPath, options: { projectRoot } });
  if (!inferred.valid) {
    return makeUpdateErrorResult('INFERENCE_FAILED', inferred.errors.map(e => e.message).join('; '));
  }

  // Compare and merge
  const mergeReport = buildMergeReport(node, inferred);

  // Generate updated YAML preserving hand-written sections
  const yaml = mergeSpecYaml(node, inferred, mergeReport);

  return {
    valid: true,
    yaml,
    mergeReport,
    errors: [],
  };
}

// ---------------------------------------------------------------------------
// Internal: Merge / Update
// ---------------------------------------------------------------------------

/**
 * Build a merge report comparing existing spec with fresh inference.
 */
function buildMergeReport(
  existing: SpecNode,
  inferred: InferResult,
): MergeReport {
  const existingInputs = existing.inputs ? Object.keys(existing.inputs) : [];
  const existingOutputs = existing.outputs ? Object.keys(existing.outputs) : [];

  // Parse inferred inputs/outputs from YAML (simple extraction)
  const inferredInputs = extractFieldNames(inferred.yaml, 'inputs');
  const inferredOutputs = extractFieldNames(inferred.yaml, 'outputs');

  const addedInputs = inferredInputs.filter(n => !existingInputs.includes(n));
  const removedInputs = existingInputs.filter(n => !inferredInputs.includes(n));
  const addedOutputs = inferredOutputs.filter(n => !existingOutputs.includes(n));
  const removedOutputs = existingOutputs.filter(n => !inferredOutputs.includes(n));

  // Only list sections that actually exist in the existing spec
  const preservedSections: string[] = [];
  if (existing.goal) preservedSections.push('goal');
  if (existing.intent) preservedSections.push('intent');
  if (existing.examples) preservedSections.push('examples');
  if (existing.invariants && existing.invariants.length > 0) preservedSections.push('invariants');

  return {
    addedInputs,
    removedInputs,
    addedOutputs,
    removedOutputs,
    preservedSections,
  };
}

/**
 * Extract field names from a section of YAML.
 */
function extractFieldNames(yaml: string, section: string): string[] {
  const names: string[] = [];
  const sectionMatch = yaml.match(new RegExp(`^  ${section}:\\s*$([\\s\\S]*?)(?=^  \\w|^$)`, 'm'));
  if (!sectionMatch) return names;

  const fieldMatches = sectionMatch[1].matchAll(/^\s{4}(\w+):/gm);
  for (const match of fieldMatches) {
    names.push(match[1]);
  }
  return names;
}

/**
 * Merge existing spec YAML with inferred changes, preserving hand-written sections.
 */
function mergeSpecYaml(
  existing: SpecNode,
  inferred: InferResult,
  report: MergeReport,
): string {
  // Start with inferred YAML as base
  let yaml = inferred.yaml;

  // Preserve existing goal
  if (existing.goal) {
    yaml = yaml.replace(
      /goal: "TODO: [^"]*"/,
      `goal: "${escapeYamlString(existing.goal)}"`,
    );
  }

  // Preserve existing intent
  if (existing.intent) {
    yaml = yaml.replace(
      /intent: "TODO: [^"]*"/,
      `intent: "${escapeYamlString(existing.intent)}"`,
    );
  }

  // Preserve existing invariants
  if (existing.invariants && existing.invariants.length > 0) {
    const invariantsYaml = serializeInvariants(existing.invariants);
    yaml = yaml.replace(
      / {2}# === INVARIANTS ===\n {2}invariants:\n {4}- "TODO: Define invariants"/,
      `  # === INVARIANTS ===\n  invariants:\n${invariantsYaml}`,
    );
  }

  // Preserve existing examples
  if (existing.examples) {
    const examplesYaml = serializeExamples(existing.examples);
    // Replace the entire examples block (from marker to end of file or next section)
    yaml = yaml.replace(
      / {2}# === EXAMPLES ===\n {2}examples:[\s\S]*$/,
      `  # === EXAMPLES ===\n  examples:\n${examplesYaml}\n`,
    );
  }

  // Add merge annotations for new inputs
  if (report.addedInputs.length > 0) {
    for (const name of report.addedInputs) {
      yaml = yaml.replace(
        new RegExp(`(    ${name}:)`),
        `$1  # NEW: detected from implementation`,
      );
    }
  }

  // Add comments for removed inputs
  if (report.removedInputs.length > 0) {
    const removedSection = report.removedInputs
      .map(n => `    # REMOVED: ${n} (no longer in implementation)`)
      .join('\n');
    yaml = yaml.replace(
      /^( {2}inputs:)$/m,
      `$1\n${removedSection}`,
    );
  }

  return yaml;
}

// ---------------------------------------------------------------------------
// Internal: YAML serialization helpers
// ---------------------------------------------------------------------------

/**
 * Escape a string for YAML double-quoted scalar.
 */
function escapeYamlString(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

/**
 * Serialize invariants array back to YAML lines.
 */
function serializeInvariants(invariants: unknown[]): string {
  return invariants.map(inv => {
    if (typeof inv === 'string') {
      return `    - "${escapeYamlString(inv)}"`;
    }
    // Object invariant with condition/message
    const obj = inv as Record<string, unknown>;
    const parts = Object.entries(obj)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join(', ');
    return `    - { ${parts} }`;
  }).join('\n');
}

/**
 * Serialize examples object back to YAML lines.
 */
function serializeExamples(examples: {
  success?: unknown[];
  errors?: unknown[];
  warnings?: unknown[];
  boundaries?: unknown[];
}): string {
  const lines: string[] = [];

  for (const category of ['success', 'errors', 'warnings', 'boundaries'] as const) {
    const items = examples[category];
    if (!items || items.length === 0) continue;

    lines.push(`    ${category}:`);
    for (const item of items) {
      const ex = item as Record<string, unknown>;
      lines.push(`      - name: "${escapeYamlString(String(ex.name ?? 'unnamed'))}"`);
      if (ex.given !== undefined) {
        if (typeof ex.given === 'object' && ex.given !== null && Object.keys(ex.given).length === 0) {
          lines.push('        given: {}');
        } else {
          lines.push('        given:');
          serializeObject(ex.given as Record<string, unknown>, lines, 10);
        }
      }
      if (ex.then !== undefined) {
        lines.push('        then:');
        serializeObject(ex.then as Record<string, unknown>, lines, 10);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Serialize a simple object to indented YAML lines.
 */
function serializeObject(obj: Record<string, unknown>, lines: string[], indent: number): void {
  const pad = ' '.repeat(indent);
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      lines.push(`${pad}${key}: "${escapeYamlString(value)}"`);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      lines.push(`${pad}${key}: ${value}`);
    } else if (value === null || value === undefined) {
      lines.push(`${pad}${key}: null`);
    } else if (Array.isArray(value)) {
      lines.push(`${pad}${key}: ${JSON.stringify(value)}`);
    } else {
      lines.push(`${pad}${key}:`);
      serializeObject(value as Record<string, unknown>, lines, indent + 2);
    }
  }
}

// ---------------------------------------------------------------------------
// Internal: Error helpers
// ---------------------------------------------------------------------------

function makeUpdateErrorResult(code: string, message: string): InferUpdateResult {
  return {
    valid: false,
    yaml: '',
    mergeReport: {
      addedInputs: [],
      removedInputs: [],
      addedOutputs: [],
      removedOutputs: [],
      preservedSections: [],
    },
    errors: [{ code, message }],
  };
}
