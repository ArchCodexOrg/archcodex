/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * LLM-based verification engine for behavioral hints.
 * Complements static analysis with LLM understanding.
 */

import { readFile } from 'fs/promises';
import type {
  VerificationRequest,
  VerificationResponse,
  VerificationCheck,
} from './types.js';
import { createProviderFromSettings, getAvailableProvider } from './providers/index.js';
import { PromptProvider } from './providers/prompt.js';
import type { LLMProvider } from './types.js';
import { resolveArchitecture } from '../core/registry/resolver.js';
import { parseArchTags } from '../core/arch-tag/parser.js';
import type { Registry } from '../core/registry/schema.js';
import type { ResolvedHint } from '../core/registry/types.js';
import type { LLMSettings } from '../core/config/schema.js';
import type { ArchConfig } from '../utils/archconfig.js';

export interface VerifyOptions {
  provider?: LLMProvider;
  outputPrompt?: boolean;
  llmSettings?: LLMSettings;
  archConfig?: ArchConfig;
}

export interface VerifyResult {
  filePath: string;
  archId: string | null;
  staticPassed: boolean;
  llmVerification?: VerificationResponse;
  promptOutput?: string;
}

/**
 * Verify a file using both static analysis and LLM verification.
 */
export async function verifyFile(
  filePath: string,
  registry: Registry,
  options: VerifyOptions = {}
): Promise<VerifyResult> {
  // Read file content
  const content = await readFile(filePath, 'utf-8');

  // Parse @arch tag
  const parsed = parseArchTags(content);
  if (!parsed.archTag) {
    return {
      filePath,
      archId: null,
      staticPassed: false,
    };
  }

  const archId = parsed.archTag.archId;

  // Resolve architecture to get hints (including inline mixins)
  const resolved = resolveArchitecture(registry, archId, {
    inlineMixins: parsed.archTag.inlineMixins,
  });
  const hints = resolved.architecture.hints || [];

  if (hints.length === 0) {
    return {
      filePath,
      archId,
      staticPassed: true,
      // No hints to verify
    };
  }

  // Build verification checks from hints
  const checks = buildChecksFromHints(hints);

  const request: VerificationRequest = {
    filePath,
    archId,
    content,
    checks,
  };

  // Handle prompt mode specially
  if (options.outputPrompt || options.provider === 'prompt') {
    const promptProvider = new PromptProvider();
    const promptOutput = promptProvider.formatVerificationPrompt(request);

    return {
      filePath,
      archId,
      staticPassed: true,
      promptOutput,
    };
  }

  // Get LLM provider and verify
  const provider = options.provider
    ? createProviderFromSettings(options.provider, options.llmSettings, options.archConfig)
    : getAvailableProvider(undefined, options.llmSettings, options.archConfig);

  if (!provider.isAvailable()) {
    // Fall back to prompt mode
    const promptProvider = new PromptProvider();
    const promptOutput = promptProvider.formatVerificationPrompt(request);

    return {
      filePath,
      archId,
      staticPassed: true,
      promptOutput,
    };
  }

  const llmVerification = await provider.verify(request);

  return {
    filePath,
    archId,
    staticPassed: true,
    llmVerification,
  };
}

/**
 * Verify multiple files.
 */
export async function verifyFiles(
  filePaths: string[],
  registry: Registry,
  options: VerifyOptions = {}
): Promise<VerifyResult[]> {
  const results: VerifyResult[] = [];

  for (const filePath of filePaths) {
    try {
      const result = await verifyFile(filePath, registry, options);
      results.push(result);
    } catch {
      results.push({
        filePath,
        archId: null,
        staticPassed: false,
      });
    }
  }

  return results;
}

/**
 * Convert hints to verification checks.
 */
function buildChecksFromHints(hints: ResolvedHint[]): VerificationCheck[] {
  return hints.map(hint => ({
    hint: hint.text,
    question: generateQuestionFromHint(hint.text),
    example: hint.example,
  }));
}

/**
 * Generate a verification question from a hint.
 */
function generateQuestionFromHint(hint: string): string {
  // Common hint patterns and their questions
  const patterns: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
    [
      /redact\s+(.+?)\s*(before|when|during)\s+logging/i,
      (m) => `Does the code properly redact ${m[1]} before any logging operations?`,
    ],
    [
      /use\s+(.+?)\s+(pattern|for)/i,
      (m) => `Does the code use the ${m[1]} pattern as recommended?`,
    ],
    [
      /must\s+(not\s+)?(.+)/i,
      (m) => m[1]
        ? `Does the code avoid ${m[2]}?`
        : `Does the code ${m[2]}?`,
    ],
    [
      /prefer\s+(.+?)\s+over\s+(.+)/i,
      (m) => `Does the code prefer ${m[1]} over ${m[2]}?`,
    ],
    [
      /avoid\s+(.+)/i,
      (m) => `Does the code avoid ${m[1]}?`,
    ],
    [
      /always\s+(.+)/i,
      (m) => `Does the code always ${m[1]}?`,
    ],
    [
      /never\s+(.+)/i,
      (m) => `Does the code properly avoid ${m[1]}?`,
    ],
  ];

  for (const [pattern, generator] of patterns) {
    const match = hint.match(pattern);
    if (match) {
      return generator(match);
    }
  }

  // Default question format
  return `Does the code comply with the following hint: "${hint}"?`;
}

/**
 * Format verification results for display.
 */
export function formatVerificationResult(result: VerifyResult): string {
  const lines: string[] = [];

  lines.push(`File: ${result.filePath}`);
  lines.push(`Architecture: ${result.archId || 'none'}`);
  lines.push('');

  if (result.promptOutput) {
    lines.push(result.promptOutput);
    return lines.join('\n');
  }

  if (result.llmVerification) {
    const v = result.llmVerification;

    if (v.error) {
      lines.push(`Error: ${v.error}`);
      return lines.join('\n');
    }

    lines.push(`Provider: ${v.provider}`);
    lines.push('');

    for (const check of v.results) {
      const status = check.passed ? 'PASS' : 'FAIL';
      const icon = check.passed ? '\u2713' : '\u2717';
      lines.push(`${icon} [${status}] ${check.hint}`);
      lines.push(`  Confidence: ${check.confidence}`);
      lines.push(`  Reasoning: ${check.reasoning}`);
      lines.push('');
    }

    if (v.tokenUsage) {
      lines.push(`Tokens: ${v.tokenUsage.total} (${v.tokenUsage.input} in / ${v.tokenUsage.output} out)`);
    }
  }

  return lines.join('\n');
}
