/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Prompt command - builds optimized prompts with pre-baked architectural context.
 *
 * Usage:
 *   archcodex prompt -m src/core/db/ -t "Add getById method"
 *   archcodex prompt -m src/utils/ -t "Create debounce utility" --model haiku
 *   archcodex prompt -m src/core/,src/cli/ -t "Refactor shared code" --multi
 *   archcodex prompt -t "Add caching to the database" --discover
 */
import { Command } from 'commander';
import * as readline from 'readline';
import {
  buildPrompt,
  buildMultiModulePrompt,
  getCompactContext,
  type PromptModel,
  type PromptScope,
} from '../../core/unified-context/prompt-builder.js';
import {
  analyzeTaskEnhanced,
  formatEnhancedAnalysis,
  refineWithAnswers,
  recordSelection,
} from '../../core/unified-context/discovery/index.js';
import { formatQuestions } from '../../core/unified-context/discovery/questions.js';
import { synthesizeUnifiedEntityContext } from '../../core/unified-context/synthesizer.js';
import { logger as log } from '../../utils/logger.js';

/**
 * Create the prompt command.
 */
export function createPromptCommand(): Command {
  return new Command('prompt')
    .description('Build optimized prompts with pre-baked architectural context for LLM subagents')
    .option('-m, --module <path>', 'Module path(s) - comma-separated for multi-module')
    .requiredOption('-t, --task <description>', 'Task description for the prompt')
    .option('--model <model>', 'Target model: haiku, opus, sonnet (default: sonnet)', 'sonnet')
    .option('-r, --requirements <reqs>', 'Additional requirements (comma-separated)')
    .option('--preview', 'Add instruction for preview mode (show code, do not write)')
    .option('--no-validation', 'Omit validation reminder')
    .option('--context-only', 'Output just the compact context block (for manual prompt building)')
    .option('--json', 'Output as JSON with metadata')
    .option('--discover', 'Auto-discover relevant modules from task description (requires confirmation)')
    .option('--interactive', 'Ask clarifying questions to refine discovery results')
    .option('--learn', 'Record selection for future ranking improvements (default: true)')
    .addHelpText('after', `
Examples:
  # Build prompt for a single module
  archcodex prompt -m src/core/db/ -t "Add getById method"

  # Target Haiku with explicit MUST instructions
  archcodex prompt -m src/utils/ -t "Create debounce utility" --model haiku

  # Multi-module refactoring
  archcodex prompt -m src/core/,src/cli/ -t "Refactor shared types"

  # Preview mode (subagent shows code but doesn't write)
  archcodex prompt -m src/core/db/ -t "Add caching" --preview

  # Add custom requirements
  archcodex prompt -m src/utils/ -t "Add retry" -r "Must be generic,Add JSDoc"

  # Get just the context block for manual prompt building
  archcodex prompt -m src/core/db/ -t "unused" --context-only

  # JSON output for programmatic use
  archcodex prompt -m src/core/ -t "Add feature" --json

  # Auto-discover modules from task description
  archcodex prompt -t "Add caching to the database" --discover
  archcodex prompt -t "Refactor entity handling" --discover --model haiku

  # Interactive mode with clarifying questions
  archcodex prompt -t "Add duplicate for orders" --discover --interactive

  # Disable learning (don't record selection)
  archcodex prompt -t "Add feature" --discover --no-learn

Model differences:
  haiku   - Uses explicit "MUST" and "REQUIRED" language
  opus    - Uses softer hints and explanations
  sonnet  - Same as opus (default)

Output includes:
  - @arch tag for the module
  - Layer boundaries (can/cannot import)
  - Forbidden imports and patterns
  - Modification order (types → impl → orchestrators)
  - Task with model-appropriate instructions
`)
    .action(async (options: PromptOptions) => {
      try {
        await runPrompt(options);
      } catch (error) {
        log.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

interface PromptOptions {
  module?: string;
  task: string;
  model: string;
  requirements?: string;
  preview?: boolean;
  validation: boolean;
  contextOnly?: boolean;
  json?: boolean;
  discover?: boolean;
  interactive?: boolean;
  learn?: boolean;
}

/**
 * Check if --model was explicitly provided in command line args.
 */
function wasModelExplicitlyProvided(): boolean {
  return process.argv.some(arg => arg === '--model' || arg.startsWith('--model='));
}

/**
 * Prompt user for confirmation with readline.
 */
async function askConfirmation(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function runPrompt(options: PromptOptions): Promise<void> {
  const projectRoot = process.cwd();
  const modelExplicit = wasModelExplicitlyProvided();
  let selectedScope: PromptScope | undefined;
  let includeEntityContext = false;
  let detectedEntities: string[] = [];

  // Handle discovery mode
  if (options.discover) {
    // Include model question in interactive mode when --model not explicitly set
    const includeModelQuestion = options.interactive === true && !modelExplicit;

    let analysis = await analyzeTaskEnhanced(projectRoot, options.task, {
      useFeedback: options.learn !== false,
      generateQuestions: options.interactive === true,
      includeModelQuestion,
    });

    // Interactive mode: ask clarifying questions FIRST to refine module suggestions
    if (options.interactive && analysis.clarifyingQuestions.length > 0) {
      console.log('\nTask Analysis:');
      console.log(`  Action: ${analysis.actionType}`);
      console.log(`  Keywords: ${analysis.keywords.join(', ') || '(none)'}`);
      if (analysis.entities.length > 0) {
        console.log(`  Entities: ${analysis.entities.join(', ')}`);
      }
      console.log('');
      console.log('Clarifying questions to improve module discovery:');
      console.log(formatQuestions(analysis.clarifyingQuestions));
      console.log('\nAnswer with letters in order (x to skip), e.g., "c,b,d,a" or press Enter to skip all:');

      const clarifyAnswer = await askConfirmation('> ');

      if (clarifyAnswer && clarifyAnswer !== 'q' && clarifyAnswer !== 'quit') {
        const refined = refineWithAnswers(analysis, clarifyAnswer);
        analysis = refined.analysis;

        // Use selected model if user answered the model question
        if (refined.selectedModel) {
          options.model = refined.selectedModel;
          log.info(`Target model: ${refined.selectedModel}`);
        }

        // Use selected scope if user answered the scope question
        if (refined.selectedScope) {
          selectedScope = refined.selectedScope;
          log.info(`Scope: ${refined.selectedScope}`);
        }

        // Store entity context preference
        if (refined.includeEntityContext !== undefined) {
          includeEntityContext = refined.includeEntityContext;
          if (includeEntityContext) {
            log.info('Including entity schemas in prompt');
          }
        }
      }
    }

    // Store detected entities for later use
    detectedEntities = analysis.entities;

    // Now show the (refined) module suggestions
    console.log('\n' + formatEnhancedAnalysis(analysis) + '\n');

    if (analysis.suggestions.length === 0) {
      log.error('No modules found. Try specifying -m directly.');
      process.exit(1);
    }

    // Show numbered options for selection
    console.log('Select modules to include (comma-separated numbers, or "a" for all, "q" to quit):');

    const answer = await askConfirmation('> ');

    if (answer === 'q' || answer === 'quit') {
      log.info('Cancelled.');
      process.exit(0);
    }

    let selectedPaths: string[];
    if (answer === 'a' || answer === 'all') {
      selectedPaths = analysis.suggestions.slice(0, 5).map(s => s.path);
    } else {
      const indices = answer.split(',').map(s => parseInt(s.trim(), 10) - 1);
      selectedPaths = indices
        .filter(i => i >= 0 && i < analysis.suggestions.length)
        .map(i => analysis.suggestions[i].path);
    }

    if (selectedPaths.length === 0) {
      log.error('No valid selection. Exiting.');
      process.exit(1);
    }

    // Record selection for learning (if enabled)
    if (options.learn !== false) {
      const shownModules = analysis.suggestions.map(s => s.path);
      recordSelection(projectRoot, options.task, analysis.keywords, selectedPaths, shownModules);
    }

    log.info(`Selected: ${selectedPaths.join(', ')}`);
    options.module = selectedPaths.join(',');
  }

  // Validate module is provided
  if (!options.module) {
    log.error('Module path is required. Use -m <path> or --discover to find modules.');
    process.exit(1);
  }

  const modulePaths = options.module.split(',').map(m => m.trim());
  const requirements = options.requirements
    ? options.requirements.split(',').map(r => r.trim())
    : [];

  // Validate model
  const validModels = ['haiku', 'opus', 'sonnet'];
  if (!validModels.includes(options.model)) {
    log.error(`Invalid model: ${options.model}. Use: ${validModels.join(', ')}`);
    process.exit(1);
  }

  const model = options.model as PromptModel;

  // Context-only mode
  if (options.contextOnly) {
    const context = await getCompactContext(projectRoot, modulePaths[0]);
    if (!context) {
      log.error(`No module found at "${modulePaths[0]}"`);
      process.exit(1);
    }
    console.log(context);
    return;
  }

  // Build prompt
  const result = modulePaths.length > 1
    ? await buildMultiModulePrompt(projectRoot, modulePaths, {
        model,
        task: options.task,
        requirements,
        includeValidation: options.validation,
        outputMode: options.preview ? 'preview' : 'execute',
        scope: selectedScope,
      })
    : await buildPrompt(projectRoot, modulePaths[0], {
        model,
        task: options.task,
        requirements,
        includeValidation: options.validation,
        outputMode: options.preview ? 'preview' : 'execute',
        scope: selectedScope,
      });

  if (!result) {
    log.error(`No module found at "${options.module}"`);
    log.info('Tips:');
    log.info('  - Check the path is correct (e.g., "src/core/db/" not "src/core/db")');
    log.info('  - Ensure the module has files with @arch tags');
    log.info('  - Try "archcodex map" for an overview of available modules');
    process.exit(1);
  }

  // Fetch and append entity context if requested
  let entityContextSection = '';
  if (includeEntityContext && detectedEntities.length > 0) {
    const entityLines: string[] = ['', '---', '', '## Entity Schemas', ''];
    for (const entityName of detectedEntities.slice(0, 3)) { // Limit to 3 entities
      const entityCtx = await synthesizeUnifiedEntityContext(projectRoot, entityName);
      if (entityCtx) {
        entityLines.push(`### ${entityCtx.name}`);
        entityLines.push(`Fields: ${entityCtx.fields.join(', ')}`);
        if (entityCtx.relationships.length > 0) {
          entityLines.push(`Relationships: ${entityCtx.relationships.join(', ')}`);
        }
        if (entityCtx.behaviors.length > 0) {
          entityLines.push(`Behaviors: ${entityCtx.behaviors.join(', ')}`);
        }
        if (entityCtx.operations.length > 0) {
          entityLines.push(`Existing ops: ${entityCtx.operations.slice(0, 5).join(', ')}${entityCtx.operations.length > 5 ? '...' : ''}`);
        }
        entityLines.push('');
      }
    }
    if (entityLines.length > 5) { // Only add if we found at least one entity
      entityContextSection = entityLines.join('\n');
    }
  }

  // Combine prompt with entity context
  const fullPrompt = result.prompt + entityContextSection;

  // Output
  if (options.json) {
    console.log(JSON.stringify({
      prompt: fullPrompt,
      metadata: {
        modulePath: result.modulePath,
        archTag: result.archTag,
        contextTokens: result.contextTokens,
        model,
        task: options.task,
        entities: includeEntityContext ? detectedEntities : undefined,
      },
    }, null, 2));
  } else {
    console.log(fullPrompt);
    log.info(`Module: ${result.modulePath}`);
    log.info(`Arch: ${result.archTag}`);
    log.info(`Context tokens: ~${result.contextTokens}`);
    log.info(`Target model: ${model}`);
    if (entityContextSection) {
      log.info(`Entities: ${detectedEntities.join(', ')}`);
    }
  }
}
