/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Progressive disclosure help system.
 * - `help` shows topics
 * - `help <topic>` shows commands in topic with examples
 * - `help --full` shows all commands grouped
 */
import { Command } from 'commander';
import chalk from 'chalk';

/** Topic definitions with commands and examples */
const TOPICS: Record<string, {
  description: string;
  tip?: string;
  commands: Array<{
    name: string;
    summary: string;
    example?: string;
  }>;
  seeAlso?: string[];
}> = {
  creating: {
    description: 'Starting new files with the right architecture',
    tip: 'discover → scaffold → check',
    commands: [
      { name: 'discover', summary: 'Find architecture for a concept', example: 'discover "payment service"' },
      { name: 'scaffold', summary: 'Generate file from template', example: 'scaffold domain.service --name PaymentService' },
      { name: 'infer', summary: 'Suggest architecture for existing files', example: 'infer src/utils/helper.ts' },
      { name: 'decide', summary: 'Interactive decision tree', example: 'decide --start' },
      { name: 'tag', summary: 'Add @arch tag to file', example: 'tag src/file.ts domain.service' },
    ],
    seeAlso: ['validating', 'understanding'],
  },
  validating: {
    description: 'Checking code against architectural constraints',
    tip: 'validate-plan → [write code] → check',
    commands: [
      { name: 'check', summary: 'Validate constraints (post-edit)', example: 'check src/services/*.ts' },
      { name: 'validate-plan', summary: 'Pre-flight check before writing code', example: 'validate-plan --stdin' },
      { name: 'verify', summary: 'LLM behavioral verification', example: 'verify src/payment/processor.ts' },
      { name: 'intents', summary: 'Validate intent usage & list definitions', example: 'intents --validate' },
      { name: 'test-pattern', summary: 'Test regex before committing', example: 'test-pattern "console\\.log" "src/**/*.ts"' },
      { name: 'watch', summary: 'Re-validate on file changes', example: 'watch "src/**/*.ts"' },
    ],
    seeAlso: ['understanding', 'refactoring'],
  },
  understanding: {
    description: 'Learning what constraints apply and why',
    tip: 'session-context (broad) or plan-context (scoped) → read (per-file)',
    commands: [
      { name: 'session-context', summary: 'Prime context (call at session start)', example: 'session-context --with-patterns' },
      { name: 'plan-context', summary: 'Scoped context for a directory/task', example: 'plan-context src/core/health/' },
      { name: 'read', summary: 'Read one file with constraints', example: 'read src/service.ts --format ai' },
      { name: 'why', summary: 'Explain constraint origins', example: 'why src/service.ts forbid_import:axios' },
      { name: 'neighborhood', summary: 'Show import boundaries', example: 'neighborhood src/core/engine.ts' },
      { name: 'impact', summary: 'Show dependents before refactoring', example: 'impact src/core/engine.ts --depth 3' },
      { name: 'resolve', summary: 'Show flattened architecture', example: 'resolve domain.service' },
      { name: 'schema', summary: 'Available rules, mixins, examples', example: 'schema --examples' },
    ],
    seeAlso: ['creating', 'validating'],
  },
  refactoring: {
    description: 'Changing architectures and previewing impact',
    tip: 'impact → plan-context → validate-plan → [refactor] → check',
    commands: [
      { name: 'impact', summary: 'Show blast radius of changes', example: 'impact src/core/engine.ts' },
      { name: 'migrate', summary: 'Change file architecture', example: 'migrate src/old.ts --to domain.service' },
      { name: 'diff', summary: 'Show changes between versions', example: 'diff HEAD~1' },
      { name: 'diff-arch', summary: 'Compare two architectures', example: 'diff-arch util domain.service' },
      { name: 'simulate', summary: 'Preview migration impact', example: 'simulate src/file.ts --to domain.engine' },
    ],
    seeAlso: ['validating', 'health'],
  },
  health: {
    description: 'Monitoring architecture quality and maintenance',
    commands: [
      { name: 'health', summary: 'Architecture health dashboard (use --no-layers if slow)', example: 'health --json' },
      { name: 'audit', summary: 'Review all overrides', example: 'audit --suggest-intents' },
      { name: 'promote', summary: 'Promote overrides to intents', example: 'promote forbid_pattern:console --intent cli-output' },
      { name: 'garden', summary: 'Analyze patterns & index quality', example: 'garden' },
      { name: 'graph', summary: 'Visualize architecture hierarchy', example: 'graph --format mermaid' },
      { name: 'types', summary: 'Find duplicate/similar types', example: 'types src/models' },
      { name: 'similarity', summary: 'Find duplicate code blocks', example: 'similarity blocks --threshold 80' },
    ],
    seeAlso: ['setup', 'refactoring'],
  },
  setup: {
    description: 'Project initialization and configuration',
    commands: [
      { name: 'init', summary: 'Initialize .arch folder', example: 'init' },
      { name: 'bootstrap', summary: 'Auto-tag existing files', example: 'bootstrap --dry-run' },
      { name: 'sync-index', summary: 'Update discovery index', example: 'sync-index' },
      { name: 'reindex', summary: 'Regenerate keywords with LLM', example: 'reindex domain.service' },
      { name: 'migrate-registry', summary: 'Split registry into modules', example: 'migrate-registry' },
    ],
    seeAlso: ['creating', 'health'],
  },
};

/** Essential commands shown in default help */
const ESSENTIALS = [
  { name: 'session-context', summary: 'Prime context at session start (call first)' },
  { name: 'plan-context <dir>', summary: 'Scoped context for multi-file planning' },
  { name: 'check <files>', summary: 'Validate constraints after edits' },
  { name: 'discover "concept"', summary: 'Find architecture for new files' },
  { name: 'read <file> --format ai', summary: 'Read one file with constraints' },
];

export function createHelpCommand(): Command {
  const cmd = new Command('help')
    .description('Show help by topic')
    .argument('[topic]', 'Topic to show help for')
    .option('--full', 'Show all commands grouped by topic')
    .action((topic: string | undefined, options: { full?: boolean }) => {
      if (options.full) {
        showFullHelp();
      } else if (topic) {
        showTopicHelp(topic);
      } else {
        showTopicList();
      }
    });

  return cmd;
}

/** Show list of available topics */
function showTopicList(): void {
  const lines: string[] = [
    '',
    chalk.bold('ArchCodex Help Topics'),
    '',
  ];

  for (const [name, topic] of Object.entries(TOPICS)) {
    lines.push(`  ${chalk.yellow(name.padEnd(14))} ${topic.description}`);
  }

  lines.push('');
  lines.push(chalk.dim('Usage:'));
  lines.push(`  ${chalk.cyan('archcodex help <topic>')}     Show commands for a topic`);
  lines.push(`  ${chalk.cyan('archcodex help --full')}      Show all commands grouped`);
  lines.push(`  ${chalk.cyan('archcodex --help')}           Quick reference (essentials)`);
  lines.push('');

  console.log(lines.join('\n'));
}

/** Show help for a specific topic */
function showTopicHelp(topicName: string): void {
  const topic = TOPICS[topicName.toLowerCase()];

  if (!topic) {
    const available = Object.keys(TOPICS).join(', ');
    console.error(chalk.red(`Unknown topic: ${topicName}`));
    console.error(`Available topics: ${available}`);
    process.exit(1);
  }

  const lines: string[] = [
    '',
    chalk.bold(topicName.charAt(0).toUpperCase() + topicName.slice(1)),
    chalk.dim(topic.description),
  ];

  if (topic.tip) {
    lines.push(chalk.cyan(`  Workflow: ${topic.tip}`));
  }

  lines.push('');

  for (const cmd of topic.commands) {
    lines.push(`  ${chalk.yellow(cmd.name.padEnd(18))} ${cmd.summary}`);
    if (cmd.example) {
      lines.push(`    ${chalk.dim('→')} archcodex ${chalk.cyan(cmd.example)}`);
    }
  }

  if (topic.seeAlso && topic.seeAlso.length > 0) {
    lines.push('');
    lines.push(chalk.dim(`See also: ${topic.seeAlso.map(t => `help ${t}`).join(', ')}`));
  }

  lines.push('');

  console.log(lines.join('\n'));
}

/** Show all commands grouped by topic */
function showFullHelp(): void {
  const lines: string[] = [
    '',
    chalk.bold('ArchCodex - All Commands'),
    '',
  ];

  for (const [name, topic] of Object.entries(TOPICS)) {
    lines.push(chalk.cyan(`${name} - ${topic.description}`));
    for (const cmd of topic.commands) {
      lines.push(`  ${chalk.yellow(cmd.name.padEnd(18))} ${cmd.summary}`);
    }
    lines.push('');
  }

  lines.push(chalk.dim('Other commands: action, feature, fetch, learn, essentials'));
  lines.push('');
  lines.push(chalk.dim('Run \'archcodex <command> --help\' for command-specific options'));
  lines.push('');

  console.log(lines.join('\n'));
}

/** Generate essentials help text (used by main program --help override) */
export function getEssentialsHelp(version: string): string {
  const lines: string[] = [
    '',
    `${chalk.bold('ArchCodex')} v${version} - Architectural Compiler for LLM Agents`,
    '',
    chalk.cyan('Essential commands:'),
  ];

  for (const cmd of ESSENTIALS) {
    lines.push(`  ${chalk.yellow(cmd.name.padEnd(26))} ${cmd.summary}`);
  }

  lines.push('');
  lines.push(chalk.dim('More help:'));
  lines.push(`  ${chalk.cyan('archcodex help')}             List all topics`);
  lines.push(`  ${chalk.cyan('archcodex help <topic>')}     Detailed help (topics: ${Object.keys(TOPICS).join(', ')})`);
  lines.push(`  ${chalk.cyan('archcodex help --full')}      All commands grouped`);
  lines.push('');

  return lines.join('\n');
}
