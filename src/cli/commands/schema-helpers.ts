/**
 * @arch archcodex.cli.data
 * @intent:cli-output
 *
 * Helper functions for the schema command output formatting.
 */
import { loadRegistry } from '../../core/registry/loader.js';
import {
  CONSTRAINT_RULES,
  ARCH_FIELDS,
  CONSTRAINT_FIELDS,
  CONDITIONS,
} from '../../mcp/schema-data.js';
import {
  ARCHITECTURE_EXAMPLES,
  CONSTRAINT_EXAMPLES,
  RECIPE_EXAMPLES,
  ARCHITECTURE_TEMPLATE,
  EXAMPLE_CATEGORIES,
  getExample,
} from '../../mcp/schema-examples.js';

/**
 * Output minimal format (default for agents).
 */
export async function outputMinimal(): Promise<void> {
  console.log('\x1b[36mRULES:\x1b[0m ' + CONSTRAINT_RULES.map(r => r.rule).join(', '));
  console.log('');
  console.log('\x1b[90mQuery specific: schema <rule|field|condition>\x1b[0m');
  console.log('\x1b[90mComprehensive:  schema --all\x1b[0m');
  console.log('\x1b[90mExamples:       schema --examples\x1b[0m');
  console.log('\x1b[90mRecipes:        schema --recipe <name>\x1b[0m');
  console.log('\x1b[90mAI format:      schema --format ai\x1b[0m');
}

/**
 * Output AI format (ultra-minimal, copy-paste ready).
 */
export async function outputAiFormat(): Promise<void> {
  const sections: string[] = [];

  // Rules as one-liners
  sections.push('# RULES (use: schema <rule> --format ai)');
  sections.push(CONSTRAINT_RULES.map(r => `${r.rule}: ${r.param}`).join('\n'));

  // Essential fields
  sections.push('\n# CONSTRAINT TEMPLATE');
  sections.push(`- rule: <rule>
  value: <value>
  severity: error|warning
  why: "reason"
  applies_when: "regex"  # optional: only if pattern matches
  unless: [import:X, @intent:X]  # optional: exceptions
  # LLM context fields:
  intent: "description"   # human-readable intent
  examples: [valid1]      # valid examples
  counterexamples: [bad1] # invalid examples
  codeExample: "code"`);

  // Structured naming pattern
  sections.push('\n# STRUCTURED NAMING (instead of regex)');
  sections.push(`- rule: naming_pattern
  naming:
    case: PascalCase  # PascalCase|camelCase|snake_case|UPPER_CASE|kebab-case
    suffix: Service   # optional
    extension: .ts    # optional
  examples: [PaymentService.ts]`);

  // Also valid (context-dependent alternatives)
  sections.push('\n# CONTEXT-DEPENDENT ALTERNATIVES (use sparingly)');
  sections.push(`  also_valid:              # for performance/architecture constraints
    - pattern: "Alternative approach"
      when: "Context where this is appropriate"
      codeExample: "optional code"`);

  // Architecture template
  sections.push('\n# ARCHITECTURE TEMPLATE');
  sections.push(`arch.name:
  rationale: "when to use"
  inherits: parent
  mixins: [mixin1]
  constraints: []`);

  console.log(sections.join('\n'));
}

/**
 * Output JSON format.
 */
export async function outputJson(options: Record<string, boolean | string>, projectRoot: string): Promise<void> {
  const output: Record<string, unknown> = {};
  const showAll = options.all || (!options.rules && !options.fields && !options.conditions && !options.mixins && !options.architectures);

  if (showAll || options.rules) output.rules = CONSTRAINT_RULES;
  if (showAll || options.fields) {
    output.architectureFields = ARCH_FIELDS;
    output.constraintFields = CONSTRAINT_FIELDS;
  }
  if (showAll || options.conditions) output.conditions = CONDITIONS;

  if (options.mixins || options.architectures || showAll) {
    try {
      const registry = await loadRegistry(projectRoot);
      if (showAll || options.mixins) output.mixins = Object.keys(registry.mixins);
      if (showAll || options.architectures) output.architectures = Object.keys(registry.nodes);
    } catch { /* registry not available, return empty arrays */
      if (showAll || options.mixins) output.mixins = [];
      if (showAll || options.architectures) output.architectures = [];
    }
  }

  console.log(JSON.stringify(output, null, 2));
}

/**
 * Output comprehensive format (--all).
 */
export async function outputComprehensive(projectRoot: string): Promise<void> {
  // Rules
  console.log('\n\x1b[1m\x1b[36mCONSTRAINT RULES\x1b[0m');
  console.log('─'.repeat(70));
  for (const r of CONSTRAINT_RULES) {
    console.log(`  \x1b[33m${r.rule}\x1b[0m (${r.param})`);
    console.log(`    ${r.desc}`);
    console.log(`    Example: ${r.example}`);
  }

  // Fields
  console.log('\n\x1b[1m\x1b[36mARCHITECTURE FIELDS\x1b[0m');
  console.log('─'.repeat(70));
  for (const f of ARCH_FIELDS) {
    const req = f.required ? '\x1b[31m*\x1b[0m' : ' ';
    console.log(`  ${req} \x1b[33m${f.field}\x1b[0m - ${f.desc}`);
  }

  console.log('\n\x1b[1m\x1b[36mCONSTRAINT FIELDS\x1b[0m');
  console.log('─'.repeat(70));
  for (const f of CONSTRAINT_FIELDS) {
    const req = f.required ? '\x1b[31m*\x1b[0m' : ' ';
    console.log(`  ${req} \x1b[33m${f.field}\x1b[0m - ${f.desc}`);
  }

  // Conditions
  console.log('\n\x1b[1m\x1b[36mCONDITIONS (for "when" clauses)\x1b[0m');
  console.log('─'.repeat(70));
  console.log('  \x1b[32mPositive (applies when condition IS met):\x1b[0m');
  for (const c of CONDITIONS.filter(c => !c.condition.startsWith('not_'))) {
    console.log(`    \x1b[33m${c.condition}\x1b[0m - ${c.desc} (e.g., "${c.example}")`);
  }
  console.log('  \x1b[32mNegated (applies when condition is NOT met):\x1b[0m');
  for (const c of CONDITIONS.filter(c => c.condition.startsWith('not_'))) {
    console.log(`    \x1b[33m${c.condition}\x1b[0m - ${c.desc} (e.g., "${c.example}")`);
  }

  // Registry
  try {
    const registry = await loadRegistry(projectRoot);

    console.log('\n\x1b[1m\x1b[36mAVAILABLE MIXINS\x1b[0m');
    console.log('─'.repeat(70));
    const mixinKeys = Object.keys(registry.mixins);
    if (mixinKeys.length === 0) {
      console.log('  (no mixins defined in registry)');
    } else {
      for (const key of mixinKeys) {
        const mixin = registry.mixins[key];
        const desc = mixin.description || '';
        const constraintCount = mixin.constraints?.length || 0;
        const hintCount = mixin.hints?.length || 0;
        const inlineMode = mixin.inline || 'allowed';

        // Show inline mode indicator
        const inlineIndicator = inlineMode === 'only' ? ' \x1b[35m[inline-only]\x1b[0m'
          : inlineMode === 'forbidden' ? ' \x1b[31m[registry-only]\x1b[0m'
          : '';

        console.log(`  \x1b[33m${key}\x1b[0m${inlineIndicator} - ${desc}`);

        // Show rationale first line if different from description
        if (mixin.rationale) {
          const rationaleFirstLine = mixin.rationale.split('\n')[0].trim();
          if (rationaleFirstLine !== desc) {
            console.log(`    \x1b[90m${rationaleFirstLine}\x1b[0m`);
          }
        }

        // Show constraints summary
        if (constraintCount > 0) {
          const constraintRules = mixin.constraints!.map((c: { rule: string }) => c.rule).join(', ');
          console.log(`    \x1b[36mConstraints:\x1b[0m ${constraintRules}`);
        }

        // Show hints count
        if (hintCount > 0) {
          console.log(`    \x1b[36mHints:\x1b[0m ${hintCount} guidance item${hintCount > 1 ? 's' : ''}`);
        }
        console.log('');
      }
    }

    console.log('\n\x1b[1m\x1b[36mAVAILABLE ARCHITECTURES\x1b[0m');
    console.log('─'.repeat(70));
    const archKeys = Object.keys(registry.nodes).sort();
    for (const key of archKeys) {
      const arch = registry.nodes[key];
      const desc = arch.description || '';
      const parent = arch.inherits ? ` (inherits: ${arch.inherits})` : '';
      console.log(`  \x1b[33m${key}\x1b[0m${parent}`);
      if (desc) console.log(`    ${desc.substring(0, 65)}`);
    }
  } catch { /* registry not available */
    console.log('\n\x1b[33m(Could not load registry - run from project root)\x1b[0m');
  }

  console.log('');
}

/**
 * Output specific sections.
 */
export async function outputSections(options: Record<string, boolean | string>, projectRoot: string): Promise<void> {
  if (options.rules) {
    console.log('\n\x1b[1m\x1b[36mCONSTRAINT RULES\x1b[0m');
    console.log('─'.repeat(70));
    for (const r of CONSTRAINT_RULES) {
      console.log(`  \x1b[33m${r.rule}\x1b[0m (${r.param})`);
      console.log(`    ${r.desc}`);
      console.log(`    Example: ${r.example}`);
    }
  }

  if (options.fields) {
    console.log('\n\x1b[1m\x1b[36mARCHITECTURE FIELDS\x1b[0m');
    console.log('─'.repeat(70));
    for (const f of ARCH_FIELDS) {
      const req = f.required ? '\x1b[31m*\x1b[0m' : ' ';
      console.log(`  ${req} \x1b[33m${f.field}\x1b[0m - ${f.desc}`);
    }

    console.log('\n\x1b[1m\x1b[36mCONSTRAINT FIELDS\x1b[0m');
    console.log('─'.repeat(70));
    for (const f of CONSTRAINT_FIELDS) {
      const req = f.required ? '\x1b[31m*\x1b[0m' : ' ';
      console.log(`  ${req} \x1b[33m${f.field}\x1b[0m - ${f.desc}`);
    }
  }

  if (options.conditions) {
    console.log('\n\x1b[1m\x1b[36mCONDITIONS (for "when" clauses)\x1b[0m');
    console.log('─'.repeat(70));
    console.log('  \x1b[32mPositive:\x1b[0m');
    for (const c of CONDITIONS.filter(c => !c.condition.startsWith('not_'))) {
      console.log(`    \x1b[33m${c.condition}\x1b[0m - ${c.desc} (e.g., "${c.example}")`);
    }
    console.log('  \x1b[32mNegated:\x1b[0m');
    for (const c of CONDITIONS.filter(c => c.condition.startsWith('not_'))) {
      console.log(`    \x1b[33m${c.condition}\x1b[0m - ${c.desc} (e.g., "${c.example}")`);
    }
  }

  if (options.mixins || options.architectures) {
    try {
      const registry = await loadRegistry(projectRoot);

      if (options.mixins) {
        console.log('\n\x1b[1m\x1b[36mAVAILABLE MIXINS\x1b[0m');
        console.log('─'.repeat(70));
        for (const key of Object.keys(registry.mixins)) {
          const mixin = registry.mixins[key];
          const desc = mixin.description || '';
          const constraintCount = mixin.constraints?.length || 0;
          const hintCount = mixin.hints?.length || 0;
          const inlineMode = mixin.inline || 'allowed';

          // Show inline mode indicator
          const inlineIndicator = inlineMode === 'only' ? ' \x1b[35m[inline-only]\x1b[0m'
            : inlineMode === 'forbidden' ? ' \x1b[31m[registry-only]\x1b[0m'
            : '';

          console.log(`  \x1b[33m${key}\x1b[0m${inlineIndicator} - ${desc}`);

          // Show rationale if different from description
          if (mixin.rationale) {
            const rationaleFirstLine = mixin.rationale.split('\n')[0].trim();
            if (rationaleFirstLine !== desc) {
              console.log(`    \x1b[90m${rationaleFirstLine}\x1b[0m`);
            }
          }

          // Show constraints summary
          if (constraintCount > 0) {
            const constraintRules = mixin.constraints!.map((c: { rule: string }) => c.rule).join(', ');
            console.log(`    \x1b[36mConstraints:\x1b[0m ${constraintRules}`);
          }

          // Show hints count
          if (hintCount > 0) {
            console.log(`    \x1b[36mHints:\x1b[0m ${hintCount} guidance item${hintCount > 1 ? 's' : ''}`);
          }
          console.log('');
        }
      }

      if (options.architectures) {
        console.log('\n\x1b[1m\x1b[36mAVAILABLE ARCHITECTURES\x1b[0m');
        console.log('─'.repeat(70));
        for (const key of Object.keys(registry.nodes).sort()) {
          const arch = registry.nodes[key];
          const parent = arch.inherits ? ` (inherits: ${arch.inherits})` : '';
          const constraintCount = arch.constraints?.length || 0;
          const mixinCount = arch.mixins?.length || 0;
          const hintCount = arch.hints?.length || 0;

          console.log(`  \x1b[33m${key}\x1b[0m${parent}`);
          if (arch.description) {
            console.log(`    ${arch.description}`);
          }

          // Show summary line
          const parts: string[] = [];
          if (constraintCount > 0) parts.push(`${constraintCount} constraint${constraintCount > 1 ? 's' : ''}`);
          if (mixinCount > 0) parts.push(`mixins: ${arch.mixins!.join(', ')}`);
          if (hintCount > 0) parts.push(`${hintCount} hint${hintCount > 1 ? 's' : ''}`);
          if (parts.length > 0) {
            console.log(`    \x1b[90m${parts.join(' | ')}\x1b[0m`);
          }
          console.log('');
        }
      }
    } catch { /* registry not available */
      console.log('\n\x1b[33m(Could not load registry)\x1b[0m');
    }
  }

  console.log('');
}

/**
 * Output examples by category.
 */
export function outputExamples(category: string | boolean, format: string): void {
  if (category === true || category === '') {
    listExampleCategories(format);
    return;
  }

  if (category === 'all') {
    outputAllExamples(format);
    return;
  }

  const lowerCategory = (category as string).toLowerCase();

  if (lowerCategory === 'architecture' || lowerCategory === 'architectures') {
    outputArchitectureExamples(format);
    return;
  }

  if (lowerCategory === 'constraint' || lowerCategory === 'constraints') {
    outputConstraintExamples(format);
    return;
  }

  if (lowerCategory === 'recipe' || lowerCategory === 'recipes') {
    outputRecipeList(format);
    return;
  }

  let example = getExample('architectures', category as string);
  if (example) {
    outputSingleExample(category as string, example, format);
    return;
  }
  example = getExample('constraints', category as string);
  if (example) {
    outputSingleExample(category as string, example, format);
    return;
  }
  example = getExample('recipes', category as string);
  if (example) {
    outputSingleExample(category as string, example, format);
    return;
  }

  console.log(`\x1b[33mNo examples found for "${category}"\x1b[0m`);
  listExampleCategories('human');
}

function listExampleCategories(format: string): void {
  if (format === 'json') {
    console.log(JSON.stringify(EXAMPLE_CATEGORIES, null, 2));
    return;
  }

  console.log('\n\x1b[1mAvailable Example Categories\x1b[0m\n');
  for (const [category, info] of Object.entries(EXAMPLE_CATEGORIES)) {
    console.log(`\x1b[36m${category}\x1b[0m - ${info.description}`);
    console.log(`  Usage: schema --examples ${category}`);
    console.log(`  Items: ${info.items.join(', ')}\n`);
  }
  console.log('Show all: schema --examples all');
}

function outputAllExamples(format: string): void {
  if (format === 'json') {
    console.log(JSON.stringify({
      architectures: ARCHITECTURE_EXAMPLES,
      constraints: CONSTRAINT_EXAMPLES,
      recipes: RECIPE_EXAMPLES,
      template: ARCHITECTURE_TEMPLATE,
    }, null, 2));
    return;
  }

  outputArchitectureExamples(format);
  outputConstraintExamples(format);
  outputRecipeList(format);
}

function extractTitle(yaml: string): string {
  const firstLine = yaml.split('\n')[0];
  return firstLine.replace(/^#\s*/, '').replace(/Example$/, '').trim();
}

function outputArchitectureExamples(format: string): void {
  if (format === 'json') {
    console.log(JSON.stringify(ARCHITECTURE_EXAMPLES, null, 2));
    return;
  }

  console.log('\n\x1b[1m═══ Architecture Examples ═══\x1b[0m\n');
  for (const [name, yaml] of Object.entries(ARCHITECTURE_EXAMPLES)) {
    const title = extractTitle(yaml);
    if (format === 'ai') {
      console.log(`# === ${name} ===`);
      console.log(yaml);
    } else {
      console.log(`\x1b[36m▸ ${title}\x1b[0m (${name})`);
      console.log(`  schema --examples ${name}\n`);
      console.log(yaml);
    }
  }
}

function outputConstraintExamples(format: string): void {
  if (format === 'json') {
    console.log(JSON.stringify(CONSTRAINT_EXAMPLES, null, 2));
    return;
  }

  console.log('\n\x1b[1m═══ Constraint Examples ═══\x1b[0m\n');
  for (const [name, yaml] of Object.entries(CONSTRAINT_EXAMPLES)) {
    const title = extractTitle(yaml);
    if (format === 'ai') {
      console.log(`# === ${name} ===`);
      console.log(yaml);
    } else {
      console.log(`\x1b[36m▸ ${title}\x1b[0m (${name})`);
      console.log(`  schema --examples ${name}\n`);
      console.log(yaml);
    }
  }
}

function outputRecipeList(format: string): void {
  if (format === 'json') {
    console.log(JSON.stringify(RECIPE_EXAMPLES, null, 2));
    return;
  }

  console.log('\n\x1b[1m═══ Recipe Examples ═══\x1b[0m\n');
  for (const [name, yaml] of Object.entries(RECIPE_EXAMPLES)) {
    const firstLine = yaml.split('\n')[0];
    const title = firstLine.replace(/^#\s*Recipe:\s*/, '');
    if (format === 'ai') {
      console.log(`# === ${name} ===`);
      console.log(yaml);
    } else {
      console.log(`\x1b[36m▸ ${title}\x1b[0m`);
      console.log(`  schema --recipe ${name}\n`);
    }
  }
}

function outputSingleExample(name: string, yaml: string, format: string): void {
  if (format === 'json') {
    console.log(JSON.stringify({ name, yaml }, null, 2));
    return;
  }

  const title = extractTitle(yaml);

  if (format === 'ai') {
    console.log(`# ${name}`);
    console.log(yaml);
    return;
  }

  console.log(`\n\x1b[1m${title}\x1b[0m`);
  console.log(`\x1b[90m(${name})\x1b[0m\n`);
  console.log(yaml);
}
