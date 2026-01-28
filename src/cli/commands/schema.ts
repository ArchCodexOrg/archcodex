/**
 * @arch archcodex.cli.command +documented
 * @intent:cli-output
 */
import { Command } from 'commander';
import { loadRegistry } from '../../core/registry/loader.js';
import {
  CONSTRAINT_RULES,
  ARCH_FIELDS,
  CONSTRAINT_FIELDS,
  CONDITIONS,
} from '../../mcp/schema-data.js';
import {
  RECIPE_EXAMPLES,
  ARCHITECTURE_TEMPLATE,
  getRuleSemantics,
} from '../../mcp/schema-examples.js';
import {
  outputMinimal,
  outputAiFormat,
  outputJson,
  outputComprehensive,
  outputSections,
  outputExamples,
} from './schema-helpers.js';

/**
 * Create the schema command.
 *
 * Optimized for coding agents:
 * - Default: minimal output (just rule names)
 * - Query specific rule: `schema forbid_pattern`
 * - --all: comprehensive documentation
 * - --format ai: ultra-minimal, copy-paste ready
 */
export function createSchemaCommand(): Command {
  return new Command('schema')
    .description('Show registry schema (optimized for agents)')
    .argument('[query]', 'Query specific rule, field, or condition (e.g., "forbid_pattern")')
    .option('--all', 'Show comprehensive documentation')
    .option('--rules', 'Show constraint rules')
    .option('--fields', 'Show architecture/constraint fields')
    .option('--conditions', 'Show when conditions')
    .option('--mixins', 'Show available mixins from registry')
    .option('--architectures', 'Show available architectures from registry')
    .option('--examples [category]', 'Show examples (architecture, constraint, recipe, or all)')
    .option('--recipe <name>', 'Show recipe for common pattern')
    .option('--template', 'Show scaffold-able architecture template')
    .option('--format <format>', 'Output format: human (default), ai, json', 'human')
    .action(async (query: string | undefined, options) => {
      const projectRoot = process.cwd();

      // Handle specific query (most common agent use case)
      if (query) {
        await handleQuery(query, options.format, projectRoot);
        return;
      }

      // Handle --template (scaffold-able architecture)
      if (options.template) {
        outputTemplate(options.format);
        return;
      }

      // Handle --recipe (common patterns)
      if (options.recipe) {
        outputRecipe(options.recipe, options.format);
        return;
      }

      // Handle --examples
      if (options.examples !== undefined) {
        outputExamples(options.examples, options.format);
        return;
      }

      // Handle JSON format
      if (options.format === 'json') {
        await outputJson(options, projectRoot);
        return;
      }

      // Handle AI format (ultra-minimal)
      if (options.format === 'ai') {
        await outputAiFormat();
        return;
      }

      // Handle --all (comprehensive)
      if (options.all) {
        await outputComprehensive(projectRoot);
        return;
      }

      // Handle specific sections
      if (options.rules || options.fields || options.conditions || options.mixins || options.architectures) {
        await outputSections(options, projectRoot);
        return;
      }

      // Default: minimal output for agents
      await outputMinimal();
    });
}

/**
 * Handle query for specific rule/field/condition.
 */
async function handleQuery(query: string, format: string, projectRoot: string): Promise<void> {
  const lowerQuery = query.toLowerCase();

  // Search in rules
  const rule = CONSTRAINT_RULES.find(r => r.rule.toLowerCase() === lowerQuery);
  if (rule) {
    const semantics = getRuleSemantics(rule.rule);
    if (format === 'json') {
      const output = semantics ? { ...rule, semantics } : rule;
      console.log(JSON.stringify(output, null, 2));
    } else if (format === 'ai') {
      // Ultra-minimal: just the YAML template
      console.log(`- rule: ${rule.rule}`);
      if (rule.rule === 'naming_pattern') {
        // Show structured alternative for naming_pattern
        console.log(`  naming:`);
        console.log(`    case: PascalCase  # PascalCase|camelCase|snake_case|UPPER_CASE|kebab-case`);
        console.log(`    suffix: Service   # optional`);
        console.log(`    extension: .ts    # optional`);
        console.log(`  examples: [PaymentService.ts]`);
      } else {
        console.log(`  value: ${rule.example}`);
      }
      console.log(`  severity: error`);
      console.log(`  why: ""`);
      // Compact semantics for AI
      if (semantics) {
        console.log(`# Flags: ${semantics.regexFlags}`);
        console.log(`# Scope: ${semantics.matching}`);
        if (semantics.tips.length > 0) {
          console.log(`# Tips: ${semantics.tips.join('; ')}`);
        }
      }
    } else {
      console.log(`\n\x1b[1m${rule.rule}\x1b[0m (${rule.param})`);
      console.log(`  ${rule.desc}`);

      // Show structured alternative for naming_pattern
      if (rule.rule === 'naming_pattern') {
        console.log(`\n\x1b[36mStructured (LLM-friendly):\x1b[0m`);
        console.log(`  - rule: naming_pattern`);
        console.log(`    naming:`);
        console.log(`      case: PascalCase    # PascalCase|camelCase|snake_case|UPPER_CASE|kebab-case`);
        console.log(`      prefix: ""          # optional prefix (e.g., "I" for interfaces)`);
        console.log(`      suffix: Service     # optional suffix`);
        console.log(`      extension: .ts      # optional file extension`);
        console.log(`    examples: [PaymentService.ts, UserService.ts]`);
        console.log(`    counterexamples: [paymentService.ts]`);
        console.log(`    severity: error`);
        console.log(`    why: "Service files must be PascalCase"`);
        console.log(`\n\x1b[36mRegex (traditional):\x1b[0m`);
      } else {
        console.log(`\n\x1b[36mExample:\x1b[0m`);
      }
      console.log(`  - rule: ${rule.rule}`);
      console.log(`    value: ${rule.example}`);
      console.log(`    severity: error`);
      console.log(`    why: "explanation here"`);

      // Show related constraint fields
      const relatedFields = getRelatedFields(rule.rule);
      if (relatedFields.length > 0) {
        console.log(`\n\x1b[36mOptional fields:\x1b[0m`);
        for (const f of relatedFields) {
          console.log(`    ${f.field}: ${f.desc}`);
        }
      }

      // Show regex semantics if available
      if (semantics) {
        console.log(`\n\x1b[1mRegex Semantics:\x1b[0m`);
        console.log(`  Flags: ${semantics.regexFlags}`);
        console.log(`  Scope: ${semantics.matching}`);

        if (semantics.matches.length > 0) {
          const exPattern = semantics.matches[0].pattern;
          console.log(`\n  Example pattern: ${exPattern}`);
          console.log(`\n  \x1b[32m\u2713 MATCHES:\x1b[0m`);
          for (const m of semantics.matches) {
            const note = m.note ? `  \x1b[90m(${m.note})\x1b[0m` : '';
            console.log(`    ${m.input}${note}`);
          }
        }

        if (semantics.nonMatches.length > 0) {
          console.log(`\n  \x1b[31m\u2717 DOES NOT MATCH:\x1b[0m`);
          for (const m of semantics.nonMatches) {
            console.log(`    ${m.input}`);
          }
        }

        if (semantics.tips.length > 0) {
          console.log(`\n  \x1b[36mTips:\x1b[0m`);
          for (const tip of semantics.tips) {
            console.log(`    - ${tip}`);
          }
        }
      }
      console.log('');
    }
    return;
  }

  // Search in fields
  const archField = ARCH_FIELDS.find(f => f.field.toLowerCase() === lowerQuery);
  const constraintField = CONSTRAINT_FIELDS.find(f => f.field.toLowerCase() === lowerQuery);
  const field = archField || constraintField;
  if (field) {
    if (format === 'json') {
      console.log(JSON.stringify(field, null, 2));
    } else if (format === 'ai') {
      console.log(`${field.field}: # ${field.desc}`);
    } else {
      const type = archField ? 'Architecture field' : 'Constraint field';
      const req = field.required ? ' (required)' : '';
      console.log(`\n\x1b[1m${field.field}\x1b[0m - ${type}${req}`);
      console.log(`  ${field.desc}`);
      console.log('');
    }
    return;
  }

  // Search in conditions
  const condition = CONDITIONS.find(c => c.condition.toLowerCase() === lowerQuery);
  if (condition) {
    if (format === 'json') {
      console.log(JSON.stringify(condition, null, 2));
    } else if (format === 'ai') {
      console.log(`when:`);
      console.log(`  ${condition.condition}: "${condition.example}"`);
    } else {
      console.log(`\n\x1b[1m${condition.condition}\x1b[0m - Condition`);
      console.log(`  ${condition.desc}`);
      console.log(`\n\x1b[36mExample:\x1b[0m`);
      console.log(`  when:`);
      console.log(`    ${condition.condition}: "${condition.example}"`);
      console.log('');
    }
    return;
  }

  // Search in registry (mixins/architectures)
  try {
    const registry = await loadRegistry(projectRoot);

    // Check mixins
    if (registry.mixins[query]) {
      const mixin = registry.mixins[query];
      const inlineMode = mixin.inline || 'allowed';
      if (format === 'json') {
        console.log(JSON.stringify({ name: query, ...mixin }, null, 2));
      } else if (format === 'ai') {
        // Show inline mode in AI format
        if (inlineMode === 'only') {
          console.log(`# +${query}  # inline-only`);
        } else if (inlineMode === 'forbidden') {
          console.log(`mixins: [${query}]  # registry-only`);
        } else {
          console.log(`mixins: [${query}]  # or +${query}`);
        }
        if (mixin.constraints?.length) {
          console.log(`# Adds: ${mixin.constraints.map((c: { rule: string }) => c.rule).join(', ')}`);
        }
      } else {
        // Show inline mode indicator
        const inlineIndicator = inlineMode === 'only' ? ' \x1b[35m[inline-only]\x1b[0m'
          : inlineMode === 'forbidden' ? ' \x1b[31m[registry-only]\x1b[0m'
          : '';
        console.log(`\n\x1b[1m${query}\x1b[0m${inlineIndicator} - Mixin`);
        console.log(`  ${mixin.description || ''}`);

        // Show inline mode explanation
        if (inlineMode === 'only') {
          console.log(`\n\x1b[35mInline mode:\x1b[0m only (must use @arch archId +${query})`);
        } else if (inlineMode === 'forbidden') {
          console.log(`\n\x1b[31mInline mode:\x1b[0m forbidden (must use in registry mixins:[])`);
        }

        // Show full rationale
        if (mixin.rationale) {
          console.log(`\n\x1b[36mRationale:\x1b[0m`);
          for (const line of mixin.rationale.split('\n')) {
            if (line.trim()) console.log(`  ${line.trim()}`);
          }
        }

        // Show constraints with details
        if (mixin.constraints?.length) {
          console.log(`\n\x1b[36mConstraints:\x1b[0m`);
          for (const c of mixin.constraints) {
            const severity = c.severity || 'error';
            const value = typeof c.value === 'object' ? JSON.stringify(c.value) : c.value;
            console.log(`  - ${c.rule}: ${value} (${severity})`);
            if (c.why) console.log(`    \x1b[90m${c.why}\x1b[0m`);
          }
        }

        // Show hints
        if (mixin.hints?.length) {
          console.log(`\n\x1b[36mHints:\x1b[0m`);
          for (const h of mixin.hints) {
            const text = typeof h === 'string' ? h : h.text;
            console.log(`  - ${text}`);
            if (typeof h === 'object' && h.example) {
              console.log(`    \x1b[90mExample: ${h.example}\x1b[0m`);
            }
          }
        }

        // Show usage example based on inline mode
        console.log(`\n\x1b[36mUsage:\x1b[0m`);
        if (inlineMode === 'only') {
          console.log(`  /**`);
          console.log(`   * @arch arch.name +${query}`);
          console.log(`   */`);
        } else if (inlineMode === 'forbidden') {
          console.log(`  arch.name:`);
          console.log(`    mixins: [${query}]`);
        } else {
          console.log(`  # In registry:`);
          console.log(`  arch.name:`);
          console.log(`    mixins: [${query}]`);
          console.log(`  # Or inline:`);
          console.log(`  /**`);
          console.log(`   * @arch arch.name +${query}`);
          console.log(`   */`);
        }
        console.log('');
      }
      return;
    }

    // Check architectures
    if (registry.nodes[query]) {
      const arch = registry.nodes[query];
      if (format === 'json') {
        console.log(JSON.stringify({ id: query, ...arch }, null, 2));
      } else if (format === 'ai') {
        console.log(`@arch ${query}`);
        if (arch.inherits) console.log(`# inherits: ${arch.inherits}`);
        if (arch.mixins?.length) console.log(`# mixins: ${arch.mixins.join(', ')}`);
        if (arch.constraints?.length) {
          console.log(`# constraints: ${arch.constraints.map((c: { rule: string }) => c.rule).join(', ')}`);
        }
      } else {
        console.log(`\n\x1b[1m${query}\x1b[0m - Architecture`);
        if (arch.inherits) console.log(`  inherits: ${arch.inherits}`);
        console.log(`  ${arch.description || ''}`);

        // Show full rationale
        if (arch.rationale) {
          console.log(`\n\x1b[36mRationale:\x1b[0m`);
          for (const line of arch.rationale.split('\n')) {
            if (line.trim()) console.log(`  ${line.trim()}`);
          }
        }

        // Show mixins
        if (arch.mixins?.length) {
          console.log(`\n\x1b[36mMixins:\x1b[0m ${arch.mixins.join(', ')}`);
        }

        // Show constraints with details
        if (arch.constraints?.length) {
          console.log(`\n\x1b[36mConstraints:\x1b[0m`);
          for (const c of arch.constraints) {
            const severity = c.severity || 'error';
            const value = typeof c.value === 'object' ? JSON.stringify(c.value) : c.value;
            console.log(`  - ${c.rule}: ${value} (${severity})`);
            if (c.why) console.log(`    \x1b[90m${c.why}\x1b[0m`);
          }
        }

        // Show hints
        if (arch.hints?.length) {
          console.log(`\n\x1b[36mHints:\x1b[0m`);
          for (const h of arch.hints) {
            const text = typeof h === 'string' ? h : h.text;
            console.log(`  - ${text}`);
            if (typeof h === 'object' && h.example) {
              console.log(`    \x1b[90mExample: ${h.example}\x1b[0m`);
            }
          }
        }

        // Show reference implementations
        if (arch.reference_implementations?.length) {
          console.log(`\n\x1b[36mReference implementations:\x1b[0m`);
          for (const ref of arch.reference_implementations) {
            console.log(`  - ${ref}`);
          }
        }

        // Show file pattern and default path
        if (arch.file_pattern || arch.default_path) {
          console.log(`\n\x1b[36mFile conventions:\x1b[0m`);
          if (arch.file_pattern) console.log(`  Pattern: ${arch.file_pattern}`);
          if (arch.default_path) console.log(`  Path: ${arch.default_path}`);
        }

        // Show usage example
        console.log(`\n\x1b[36mUsage:\x1b[0m`);
        console.log(`  /**`);
        console.log(`   * @arch ${query}`);
        console.log(`   */`);
        console.log('');
      }
      return;
    }
  } catch {
    // Registry not available
  }

  // Not found - suggest similar
  console.log(`\x1b[33mNo match for "${query}"\x1b[0m`);
  console.log(`\nTry: schema --rules | schema --fields | schema --conditions`);
}

/**
 * Get constraint fields related to a specific rule.
 */
function getRelatedFields(rule: string): typeof CONSTRAINT_FIELDS {
  const ruleFields: Record<string, string[]> = {
    'require_try_catch': ['around'],
    'require_call_before': ['before'],
    'require_pattern': ['pattern', 'intent', 'codeExample', 'examples'],
    'forbid_pattern': ['pattern', 'applies_when', 'unless', 'intent', 'counterexamples', 'also_valid'],
    'require_one_of': ['pattern'],
    'max_file_lines': ['exclude_comments'],
    'require_import': ['match'],
    'require_coverage': ['source_type', 'source_pattern', 'extract_values', 'in_files', 'target_pattern', 'in_target_files', 'transform'],
    'naming_pattern': ['naming', 'examples', 'counterexamples'],
  };

  // Common fields for all rules
  const common = ['severity', 'why', 'when', 'applies_when', 'unless', 'alternative', 'category'];
  const specific = ruleFields[rule] || [];
  const allFields = [...new Set([...common, ...specific])];

  return CONSTRAINT_FIELDS.filter(f =>
    allFields.includes(f.field) && f.field !== 'rule' && f.field !== 'value'
  );
}

/**
 * Output scaffold-able architecture template.
 */
function outputTemplate(format: string): void {
  if (format === 'json') {
    console.log(JSON.stringify({ template: ARCHITECTURE_TEMPLATE }, null, 2));
    return;
  }

  if (format === 'ai') {
    // Ultra-minimal: just the YAML
    console.log(ARCHITECTURE_TEMPLATE);
    return;
  }

  // Human format with explanation
  console.log('\n\x1b[1mArchitecture Template\x1b[0m');
  console.log('\x1b[90mCopy and customize this template for new architectures:\x1b[0m\n');
  console.log(ARCHITECTURE_TEMPLATE);
  console.log('\n\x1b[36mPlaceholders:\x1b[0m');
  console.log('  ${name} - Component name (e.g., user)');
  console.log('  ${Name} - PascalCase name (e.g., User)');
  console.log('  ${PascalName} - PascalCase name (e.g., User)');
  console.log('  ${kebab-name} - kebab-case name (e.g., user)');
  console.log('');
}

/**
 * Output a specific recipe.
 */
function outputRecipe(name: string, format: string): void {
  const recipe = RECIPE_EXAMPLES[name as keyof typeof RECIPE_EXAMPLES];

  if (!recipe) {
    console.log(`\x1b[33mNo recipe found for "${name}"\x1b[0m`);
    console.log('\nAvailable recipes:');
    for (const key of Object.keys(RECIPE_EXAMPLES)) {
      // Extract title from first comment line
      const firstLine = RECIPE_EXAMPLES[key as keyof typeof RECIPE_EXAMPLES].split('\n')[0];
      const title = firstLine.replace(/^#\s*Recipe:\s*/, '').replace(/^#\s*/, '');
      console.log(`  ${key} - ${title}`);
    }
    return;
  }

  if (format === 'json') {
    console.log(JSON.stringify({ name, yaml: recipe }, null, 2));
    return;
  }

  if (format === 'ai') {
    // Ultra-minimal: just the YAML
    console.log(recipe);
    return;
  }

  // Human format - extract title from comment
  const lines = recipe.split('\n');
  const titleLine = lines.find(l => l.startsWith('# Recipe:'));
  const title = titleLine?.replace(/^#\s*Recipe:\s*/, '') || name;

  console.log(`\n\x1b[1m${title}\x1b[0m`);
  console.log(`\x1b[90mUsage: schema --recipe ${name}\x1b[0m\n`);
  console.log(recipe);
  console.log('');
}


