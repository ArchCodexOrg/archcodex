/** @arch archcodex.test @intent:cli-output */
/**
 * Scenario runner for LLM evaluation.
 * Runs a single scenario with configurable model, context, and prompt style.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import { synthesizeUnifiedContext } from '../../../src/core/unified-context/synthesizer.js';
import { formatUnifiedContext } from '../../../src/core/unified-context/formatter.js';
import type {
  RunConfig,
  RawResult,
  Scenario,
  CodeBlock,
  TokenUsage,
  Violation,
} from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', 'config', 'scenarios.yaml');
const PROJECT_ROOT = '/Users/stefanvanegmond/development/ArchCodex';

interface ScenariosConfig {
  settings: {
    runsPerScenario: number;
    projectRoot: string;
  };
  models: Record<string, { apiName: string; maxTokens: number }>;
  scenarios: Array<{
    id: string;
    difficulty: string;
    task: string;
    module: string;
    prompts: { detailed: string; oneliner: string };
    expected: {
      filesModified: string[];
      modificationOrder: string[];
      mustPass: boolean;
      rubric: string[];
      consumers?: string[];
    };
  }>;
}

/**
 * Load scenarios from YAML config.
 */
export function loadScenarios(): ScenariosConfig {
  const content = readFileSync(CONFIG_PATH, 'utf-8');
  return parseYaml(content) as ScenariosConfig;
}

/**
 * Load a prompt file.
 */
export function loadPrompt(promptPath: string): string {
  const fullPath = join(__dirname, '..', promptPath);
  return readFileSync(fullPath, 'utf-8').trim();
}

/**
 * Get architectural context for a module.
 */
export async function getModuleContext(modulePath: string): Promise<string> {
  const context = await synthesizeUnifiedContext(PROJECT_ROOT, {
    module: modulePath,
    confirm: true, // Bypass interactive mode
  });

  if (!context) {
    throw new Error(`Failed to get context for module: ${modulePath}`);
  }

  return formatUnifiedContext(context, { format: 'compact' });
}

/**
 * Call Anthropic API.
 */
async function callAnthropic(
  model: string,
  prompt: string,
  maxTokens: number
): Promise<{ content: string; usage: TokenUsage }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
        system: `You are an expert software engineer. When asked to modify code, provide complete, working code in markdown code blocks. Include the filename as a comment at the top of each code block. Follow the architectural constraints and patterns described in any context provided.`,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errorText.slice(0, 200)}`);
    }

    const data = await response.json() as {
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const textContent = data.content?.find(c => c.type === 'text');
    const content = textContent?.text ?? '';

    return {
      content,
      usage: {
        input: data.usage?.input_tokens ?? 0,
        output: data.usage?.output_tokens ?? 0,
        total: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      },
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Extract code blocks from markdown response.
 */
export function extractCodeBlocks(response: string): CodeBlock[] {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const blocks: CodeBlock[] = [];

  let match;
  while ((match = codeBlockRegex.exec(response)) !== null) {
    const language = match[1] || 'text';
    const content = match[2].trim();

    // Try to extract filename from first line comment
    let filename: string | undefined;
    const firstLine = content.split('\n')[0];
    const filenameMatch = firstLine.match(/^\/\/\s*(.+\.(ts|js|tsx|jsx))/) ||
                          firstLine.match(/^#\s*(.+\.(py|sh|yaml|yml))/);
    if (filenameMatch) {
      filename = filenameMatch[1];
    }

    blocks.push({ language, filename, content });
  }

  return blocks;
}

/**
 * Run archcodex check on code blocks.
 * Returns violations found.
 */
export async function runArchcodexCheck(_codeBlocks: CodeBlock[]): Promise<Violation[]> {
  // For initial implementation, return empty violations.
  // Full implementation would:
  // 1. Write code blocks to temp files
  // 2. Invoke archcodex check programmatically
  // 3. Parse violations from result
  //
  // This keeps the framework functional for manual review
  // while allowing automated validation to be added later.
  return [];
}

/**
 * Run a single scenario.
 */
export async function runScenario(config: RunConfig): Promise<RawResult> {
  const startTime = Date.now();
  const { scenario, model, withContext, promptStyle, runNumber } = config;

  // Load the prompt
  const promptPath = promptStyle === 'detailed'
    ? scenario.prompts.detailed
    : scenario.prompts.oneliner;
  const taskPrompt = loadPrompt(promptPath);

  // Build full prompt
  let fullPrompt: string;
  let contextProvided: string | undefined;

  if (withContext) {
    contextProvided = await getModuleContext(scenario.module);
    fullPrompt = `Here is the architectural context for the module you'll be working with:\n\n${contextProvided}\n\n---\n\nTask: ${taskPrompt}`;
  } else {
    fullPrompt = taskPrompt;
  }

  // Get model config
  const scenariosConfig = loadScenarios();
  const modelConfig = scenariosConfig.models[model];
  if (!modelConfig) {
    throw new Error(`Unknown model: ${model}`);
  }

  // Call API
  const { content, usage } = await callAnthropic(
    modelConfig.apiName,
    fullPrompt,
    modelConfig.maxTokens
  );

  // Extract code blocks
  const codeBlocks = extractCodeBlocks(content);

  // Run validation
  const violations = await runArchcodexCheck(codeBlocks);

  const durationMs = Date.now() - startTime;

  return {
    id: `${scenario.id}-${model}-${withContext ? 'ctx' : 'noctx'}-${promptStyle}-${runNumber}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    scenarioId: scenario.id,
    model,
    withContext,
    promptStyle,
    runNumber,
    responseText: content,
    codeBlocks,
    tokens: usage,
    durationMs,
    violations,
    contextProvided,
  };
}

/**
 * Get a scenario by ID.
 */
export function getScenario(scenarioId: string): Scenario | undefined {
  const config = loadScenarios();
  const raw = config.scenarios.find(s => s.id === scenarioId);
  if (!raw) return undefined;

  return {
    id: raw.id,
    difficulty: raw.difficulty as 'easy' | 'medium' | 'hard',
    task: raw.task,
    module: raw.module,
    prompts: raw.prompts,
    expected: raw.expected,
  };
}

/**
 * Get all scenarios.
 */
export function getAllScenarios(): Scenario[] {
  const config = loadScenarios();
  return config.scenarios.map(raw => ({
    id: raw.id,
    difficulty: raw.difficulty as 'easy' | 'medium' | 'hard',
    task: raw.task,
    module: raw.module,
    prompts: raw.prompts,
    expected: raw.expected,
  }));
}
