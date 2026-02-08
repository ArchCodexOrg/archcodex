/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Help subcommand for spec - progressive disclosure help system.
 */
import type { Command } from 'commander';
import chalk from 'chalk';

/** Help topics for progressive disclosure */
const HELP_TOPICS: Record<string, {
  description: string;
  tip?: string;
  commands: Array<{ name: string; summary: string; example?: string }>;
  seeAlso?: string[];
}> = {
  setup: {
    description: 'Initialize and configure SpecCodex',
    tip: 'init → schema → write first spec',
    commands: [
      { name: 'init', summary: 'Initialize SpecCodex with base specs and mixins', example: 'spec init' },
      { name: 'init --minimal', summary: 'Initialize without example file', example: 'spec init --minimal' },
      { name: 'init --force', summary: 'Reinitialize (overwrite existing)', example: 'spec init --force' },
    ],
    seeAlso: ['writing', 'discovering'],
  },
  writing: {
    description: 'Writing and validating spec files',
    tip: 'schema → write spec → check',
    commands: [
      { name: 'schema', summary: 'Show spec field reference (types: enum, void, etc.)', example: 'spec schema --examples' },
      { name: 'schema --filter inputs', summary: 'Show input/output types', example: 'spec schema --filter inputs' },
      { name: 'check', summary: 'Validate spec files', example: 'spec check path/to/spec.yaml' },
    ],
    seeAlso: ['generating', 'discovering', 'signatures'],
  },
  generating: {
    description: 'Generating tests from specs',
    tip: 'resolve → generate → verify',
    commands: [
      { name: 'generate', summary: 'Generate tests from spec', example: 'spec generate spec.product.create --type unit' },
      { name: 'generate --type unit', summary: 'Generate unit tests from examples' },
      { name: 'generate --type property', summary: 'Generate property tests from invariants' },
      { name: 'generate --type integration', summary: 'Generate integration tests from effects' },
      { name: 'generate --dry-run', summary: 'Preview without writing files' },
    ],
    seeAlso: ['verifying', 'writing', 'signatures'],
  },
  signatures: {
    description: 'Function signature extraction for test wiring',
    tip: 'implementation: path#export → auto-detect callPattern (direct/destructured)',
    commands: [
      { name: 'schema --filter inputs', summary: 'Show input/output types (enum, void, etc.)', example: 'spec schema --filter inputs' },
      { name: 'placeholder --list', summary: 'List @ placeholders for test data', example: 'spec placeholder --list' },
      { name: 'verify <specId>', summary: 'Verify implementation matches spec signature', example: 'spec verify spec.product.create' },
    ],
    seeAlso: ['writing', 'generating', 'placeholders'],
  },
  verifying: {
    description: 'Verifying implementations match specs',
    tip: 'drift → verify → fix',
    commands: [
      { name: 'verify', summary: 'Verify implementation matches spec', example: 'spec verify spec.product.create' },
      { name: 'drift', summary: 'Find unwired specs (specs without implementations)', example: 'spec drift' },
      { name: 'drift --full', summary: 'Full drift report (unwired + undocumented + signatures)', example: 'spec drift --full' },
      { name: 'drift --undocumented', summary: 'Find implementations without specs', example: 'spec drift --undocumented' },
      { name: 'drift --pattern', summary: 'Filter drift check by pattern', example: 'spec drift --pattern "spec.product.*"' },
    ],
    seeAlso: ['generating', 'discovering'],
  },
  inferring: {
    description: 'Generating specs from existing code',
    tip: 'implementation → infer → review → update',
    commands: [
      { name: 'infer <impl>', summary: 'Generate spec from implementation code', example: 'spec infer src/utils/helpers.ts#formatDate' },
      { name: 'infer --output <path>', summary: 'Write inferred spec to file', example: 'spec infer src/helpers.ts#fn --output .arch/specs/my-spec.yaml' },
      { name: 'infer --enrich', summary: 'Use LLM to generate goal, intent, examples', example: 'spec infer src/helpers.ts#fn --enrich' },
      { name: 'infer --provider <name>', summary: 'Choose LLM provider (openai, anthropic, prompt)', example: 'spec infer src/helpers.ts#fn --enrich --provider prompt' },
      { name: 'infer --update <specId>', summary: 'Update existing spec from implementation changes', example: 'spec infer src/helpers.ts#fn --update spec.utils.formatDate' },
      { name: 'infer --inherits <base>', summary: 'Override auto-detected base spec', example: 'spec infer src/helpers.ts#fn --inherits spec.action' },
      { name: 'infer --dry-run', summary: 'Preview without writing', example: 'spec infer src/helpers.ts#fn --dry-run' },
    ],
    seeAlso: ['writing', 'verifying'],
  },
  discovering: {
    description: 'Finding and understanding specs',
    tip: 'list → resolve → read examples',
    commands: [
      { name: 'list', summary: 'List all specs', example: 'spec list' },
      { name: 'discover', summary: 'Find specs by intent', example: 'spec discover "save a url"' },
      { name: 'resolve', summary: 'Show fully resolved spec', example: 'spec resolve spec.product.create' },
    ],
    seeAlso: ['writing', 'verifying', 'documentation'],
  },
  documentation: {
    description: 'Generating Markdown documentation from specs',
    tip: 'resolve → doc → output to file/directory',
    commands: [
      { name: 'doc', summary: 'Generate docs from spec', example: 'spec doc spec.product.create' },
      { name: 'doc --type api', summary: 'Generate API reference only', example: 'spec doc spec.product.create --type api' },
      { name: 'doc --type examples', summary: 'Generate usage examples only', example: 'spec doc spec.product.create --type examples' },
      { name: 'doc --type errors', summary: 'Generate error catalog only', example: 'spec doc spec.product.create --type errors' },
      { name: 'doc --all', summary: 'Generate docs for all specs', example: 'spec doc --all -o docs/api/' },
      { name: 'doc --dry-run', summary: 'Preview without writing', example: 'spec doc spec.product.create --dry-run' },
    ],
    seeAlso: ['writing', 'discovering'],
  },
  placeholders: {
    description: 'Using @ placeholders in spec examples',
    tip: 'Use placeholders for test data and assertions',
    commands: [
      { name: 'placeholder --list', summary: 'List all supported placeholders', example: 'spec placeholder --list' },
      { name: 'placeholder <value>', summary: 'Expand a placeholder', example: 'spec placeholder "@string(100)"' },
      { name: 'schema --filter placeholders', summary: 'Show placeholder examples in YAML', example: 'spec schema --filter placeholders' },
    ],
    seeAlso: ['writing', 'generating', 'fixtures'],
  },
  fixtures: {
    description: 'Managing test fixtures for reusable test data',
    tip: 'Define fixtures → reference with @name → generate tests',
    commands: [
      { name: 'fixture --list', summary: 'List all available fixtures', example: 'spec fixture --list' },
      { name: 'fixture <name>', summary: 'Show details for a fixture', example: 'spec fixture authenticated' },
      { name: 'fixture --template', summary: 'Show fixtures file template', example: 'spec fixture --template' },
    ],
    seeAlso: ['placeholders', 'writing', 'generating'],
  },
  analyzing: {
    description: 'Running spec analysis and deep code checks',
    tip: 'configure patterns → analyze → analyze --deep',
    commands: [
      { name: 'analyze', summary: 'Run schema-inferred analysis on specs', example: 'analyze' },
      { name: 'analyze --deep', summary: 'Deep analysis with spec-to-code checks (SEC-10..14)', example: 'analyze --deep' },
      { name: 'analyze -c security', summary: 'Filter by category', example: 'analyze -c security' },
      { name: 'analyze -s error', summary: 'Show only errors', example: 'analyze -s error' },
    ],
    seeAlso: ['verifying', 'writing'],
  },
  mixins: {
    description: 'Reusable spec behaviors composed into specs',
    tip: 'Define in _mixins.yaml → use: mixins: [name1, name2]',
    commands: [
      { name: 'list --mixins', summary: 'List all specs and mixins', example: 'spec list --mixins' },
      { name: 'resolve <specId>', summary: 'See expanded spec with mixins applied', example: 'spec resolve spec.product.create' },
      { name: 'check', summary: 'Validate mixins are defined', example: 'spec check .arch/specs/_mixins.yaml' },
    ],
    seeAlso: ['writing', 'discovering'],
  },
  invariants: {
    description: 'Writing invariant rules with strict DSL',
    tip: 'description (optional) + condition (required DSL expression)',
    commands: [
      { name: 'schema --filter invariants', summary: 'Show invariant DSL syntax', example: 'spec schema --filter invariants' },
      { name: 'generate --type property', summary: 'Generate property tests from invariants', example: 'spec generate spec.id --type property' },
      { name: 'resolve <specId>', summary: 'See resolved invariants', example: 'spec resolve spec.product.create' },
    ],
    seeAlso: ['writing', 'generating', 'placeholders'],
  },
};

/** Essential commands for default help */
const ESSENTIALS = [
  { name: 'spec list', summary: 'List all specs in registry' },
  { name: 'spec resolve <specId>', summary: 'Show fully resolved spec' },
  { name: 'spec generate <spec> --type unit', summary: 'Generate unit tests' },
  { name: 'spec doc <specId>', summary: 'Generate Markdown documentation' },
  { name: 'spec verify <specId>', summary: 'Verify implementation matches' },
  { name: 'spec infer <impl>', summary: 'Generate spec from code' },
  { name: 'spec drift', summary: 'Find spec-implementation gaps' },
];

/**
 * Register the help subcommand on the spec command.
 */
export function registerHelpCommand(spec: Command): void {
  spec
    .command('help')
    .description('Show SpecCodex help by topic')
    .argument('[topic]', 'Topic to show help for (writing, generating, verifying, discovering)')
    .option('--full', 'Show all commands grouped by topic')
    .action((topic: string | undefined, options: { full?: boolean }) => {
      if (options.full) {
        // Show all commands grouped
        console.log('');
        console.log(chalk.bold('SpecCodex - All Commands'));
        console.log('');
        for (const [name, t] of Object.entries(HELP_TOPICS)) {
          console.log(chalk.cyan(`${name} - ${t.description}`));
          for (const cmd of t.commands) {
            console.log(`  ${chalk.yellow(cmd.name.padEnd(28))} ${cmd.summary}`);
          }
          console.log('');
        }
        console.log(chalk.dim('Run \'archcodex spec <command> --help\' for command options'));
      } else if (topic) {
        // Show specific topic
        const t = HELP_TOPICS[topic.toLowerCase()];
        if (!t) {
          console.error(chalk.red(`Unknown topic: ${topic}`));
          console.error(`Available topics: ${Object.keys(HELP_TOPICS).join(', ')}`);
          process.exit(1);
        }
        console.log('');
        console.log(chalk.bold(topic.charAt(0).toUpperCase() + topic.slice(1)));
        console.log(chalk.dim(t.description));
        if (t.tip) console.log(chalk.cyan(`  Workflow: ${t.tip}`));
        console.log('');
        for (const cmd of t.commands) {
          console.log(`  ${chalk.yellow(cmd.name.padEnd(28))} ${cmd.summary}`);
          if (cmd.example) console.log(`    ${chalk.dim('→')} archcodex ${chalk.cyan(cmd.example)}`);
        }
        if (t.seeAlso?.length) {
          console.log('');
          console.log(chalk.dim(`See also: ${t.seeAlso.map(s => `help ${s}`).join(', ')}`));
        }
        console.log('');
      } else {
        // Show topic list
        console.log('');
        console.log(chalk.bold('SpecCodex Help Topics'));
        console.log('');
        for (const [name, t] of Object.entries(HELP_TOPICS)) {
          console.log(`  ${chalk.yellow(name.padEnd(14))} ${t.description}`);
        }
        console.log('');
        console.log(chalk.dim('Usage:'));
        console.log(`  ${chalk.cyan('archcodex spec help <topic>')}     Show commands for a topic`);
        console.log(`  ${chalk.cyan('archcodex spec help --full')}      Show all commands grouped`);
        console.log('');
        console.log(chalk.dim('Essential commands:'));
        for (const cmd of ESSENTIALS) {
          console.log(`  ${chalk.yellow(cmd.name.padEnd(36))} ${cmd.summary}`);
        }
        console.log('');
      }
    });
}
