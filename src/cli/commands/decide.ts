/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 */
import { Command } from 'commander';
import chalk from 'chalk';
import * as readline from 'node:readline';
import {
  loadDecisionTree,
  startNavigation,
  getCurrentNode,
  answerQuestion,
  isDecisionResult,
  type DecisionTree,
  type TreeNavigationState,
  type DecisionResult,
} from '../../core/discovery/index.js';
import { logger as log } from '../../utils/logger.js';

/**
 * Create the decide command.
 */
export function createDecideCommand(): Command {
  return new Command('decide')
    .description('Interactive decision tree to find the right architecture')
    .option('--json', 'Output final result as JSON')
    .option('--show-tree', 'Show the full decision tree structure')
    .action(async (options: DecideOptions) => {
      try {
        await runDecide(options);
      } catch (error) {
        log.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

interface DecideOptions {
  json?: boolean;
  showTree?: boolean;
}

async function runDecide(options: DecideOptions): Promise<void> {
  const projectRoot = process.cwd();

  // Load decision tree
  const tree = await loadDecisionTree(projectRoot);

  if (!tree) {
    log.warn('No decision tree found. Create .arch/decision-tree.yaml to enable this feature.');
    console.log();
    console.log(chalk.dim('Example decision-tree.yaml:'));
    console.log();
    console.log(chalk.dim(`  version: "1.0"
  description: "Architecture selection guide"
  start: q1
  nodes:
    q1:
      type: question
      text: "Is this a CLI command handler?"
      yes: r_cli
      no: q2
    q2:
      type: question
      text: "Is this core business logic?"
      yes: r_core
      no: r_util
    r_cli:
      type: result
      arch_id: myproject.cli.command
      why: "CLI commands follow the command pattern"
    r_core:
      type: result
      arch_id: myproject.core.domain
      why: "Core domain logic requires tests"
    r_util:
      type: result
      arch_id: myproject.util
      why: "Utility functions should be pure"`));
    return;
  }

  // Show tree structure mode
  if (options.showTree) {
    printTreeStructure(tree);
    return;
  }

  // Interactive mode
  const result = await runInteractiveDecision(tree);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Print result with path
  console.log();
  console.log(chalk.bold.green('Decision Path:'));
  console.log();

  for (let i = 0; i < result.path.length; i++) {
    const step = result.path[i];
    const prefix = i === result.path.length - 1 ? '└─' : '├─';
    const answerColor = step.answer === 'yes' ? chalk.green : chalk.red;
    console.log(`  ${prefix} ${chalk.dim(step.question)}`);
    console.log(`  ${i === result.path.length - 1 ? '  ' : '│ '}  → ${answerColor(step.answer.toUpperCase())}`);
  }

  console.log();
  console.log(chalk.bold('Recommended Architecture:'));
  console.log();
  console.log(`  ${chalk.cyan.bold(result.archId)}`);
  if (result.why) {
    console.log(`  ${chalk.dim(result.why)}`);
  }
  console.log();
  console.log(chalk.dim(`Use: archcodex scaffold ${result.archId} --name <ClassName>`));
}

async function runInteractiveDecision(tree: DecisionTree): Promise<DecisionResult> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };

  console.log();
  console.log(chalk.bold('Architecture Decision Tree'));
  if (tree.description) {
    console.log(chalk.dim(tree.description));
  }
  console.log();
  console.log(chalk.dim('Answer yes (y) or no (n) to each question. Press Ctrl+C to cancel.'));
  console.log();

  let state: TreeNavigationState = startNavigation(tree);

  try {
    while (true) {
      const node = getCurrentNode(tree, state);

      if (!node || node.type !== 'question') {
        throw new Error('Invalid tree state: expected question node');
      }

      // Display question
      const questionNum = state.path.length + 1;
      console.log(chalk.bold(`Q${questionNum}: ${node.text}`));
      if (node.examples) {
        console.log(chalk.dim(`    Examples: ${node.examples}`));
      }

      // Get answer
      let answer: 'yes' | 'no' | null = null;
      while (!answer) {
        const input = await askQuestion(chalk.cyan('    [y/n]: '));
        const normalized = input.trim().toLowerCase();

        if (normalized === 'y' || normalized === 'yes') {
          answer = 'yes';
        } else if (normalized === 'n' || normalized === 'no') {
          answer = 'no';
        } else {
          console.log(chalk.yellow('    Please enter y or n'));
        }
      }

      console.log();

      // Process answer
      const nextState = answerQuestion(tree, state, answer);

      if (isDecisionResult(nextState)) {
        rl.close();
        return nextState;
      }

      state = nextState;
    }
  } finally {
    rl.close();
  }
}

function printTreeStructure(tree: DecisionTree): void {
  console.log();
  console.log(chalk.bold('Decision Tree Structure'));
  if (tree.description) {
    console.log(chalk.dim(tree.description));
  }
  console.log();

  const visited = new Set<string>();

  function printNode(nodeId: string, indent: string, isLast: boolean): void {
    if (visited.has(nodeId)) {
      console.log(`${indent}${isLast ? '└─' : '├─'} ${chalk.dim(`[→ ${nodeId}]`)}`);
      return;
    }
    visited.add(nodeId);

    const node = tree.nodes[nodeId];
    if (!node) {
      console.log(`${indent}${isLast ? '└─' : '├─'} ${chalk.red(`[missing: ${nodeId}]`)}`);
      return;
    }

    const prefix = isLast ? '└─' : '├─';
    const childIndent = indent + (isLast ? '   ' : '│  ');

    if (node.type === 'result') {
      console.log(`${indent}${prefix} ${chalk.green('→')} ${chalk.cyan.bold(node.arch_id)}`);
      if (node.why) {
        console.log(`${childIndent}${chalk.dim(node.why)}`);
      }
    } else {
      console.log(`${indent}${prefix} ${chalk.yellow('?')} ${node.text}`);
      if (node.examples) {
        console.log(`${childIndent}${chalk.dim(`(${node.examples})`)}`);
      }

      // Print branches
      printNode(node.yes, childIndent, false);
      printNode(node.no, childIndent, true);
    }
  }

  printNode(tree.start, '', true);
  console.log();
}
