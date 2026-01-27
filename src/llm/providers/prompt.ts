/**
 * @arch archcodex.core.domain.llm
 *
 * Prompt provider - outputs verification prompts for external agents.
 * This allows Claude Code or other LLM agents to self-verify code.
 */

import type {
  ILLMProvider,
  VerificationRequest,
  VerificationResponse,
  ReindexRequest,
  ReindexResponse,
  CheckResult,
  PromptOutput,
  LLMLearnRequest,
  LLMLearnResponse,
} from '../types.js';
import {
  buildLearnInstructions,
  formatLearnPromptForDisplay,
} from '../learn-prompts.js';

/**
 * Generates prompts for external verification instead of calling an API.
 * The prompts are output to stdout for an agent like Claude Code to process.
 */
export class PromptProvider implements ILLMProvider {
  readonly name = 'prompt' as const;

  private outputCallback?: (output: PromptOutput) => void;

  constructor(outputCallback?: (output: PromptOutput) => void) {
    this.outputCallback = outputCallback;
  }

  isAvailable(): boolean {
    return true; // Always available - no API needed
  }

  async verify(request: VerificationRequest): Promise<VerificationResponse> {
    const prompts = request.checks.map((check, i) => {
      return [
        `## Check ${i + 1}: ${check.hint}`,
        '',
        `**Question:** ${check.question}`,
        check.context ? `**Context:** ${check.context}` : '',
        '',
        'Analyze the code and respond with:',
        '- PASS: if the code complies with this hint',
        '- FAIL: if the code violates this hint',
        '- UNSURE: if you cannot determine compliance',
        '',
        'Include your reasoning.',
      ].filter(Boolean).join('\n');
    });

    const output: PromptOutput = {
      type: 'verification',
      filePath: request.filePath,
      archId: request.archId,
      prompts,
      instructions: this.buildVerificationInstructions(request),
    };

    if (this.outputCallback) {
      this.outputCallback(output);
    }

    // Return placeholder results - actual verification is done externally
    const results: CheckResult[] = request.checks.map(check => ({
      hint: check.hint,
      passed: true, // Placeholder - agent determines this
      confidence: 'low' as const,
      reasoning: 'Awaiting external verification',
    }));

    return {
      filePath: request.filePath,
      archId: request.archId,
      provider: 'prompt',
      results,
    };
  }

  async generateKeywords(request: ReindexRequest): Promise<ReindexResponse> {
    const prompt = this.buildReindexPrompt(request);

    const output: PromptOutput = {
      type: 'reindex',
      archId: request.archId,
      prompts: [prompt],
      instructions: [
        'Generate 5-10 keywords that developers might use when searching for this architecture.',
        'Keywords should be:',
        '- Common terms developers would think of',
        '- Related to the functionality described',
        '- Single words or short phrases',
        '',
        'Output as a JSON array: ["keyword1", "keyword2", ...]',
      ].join('\n'),
    };

    if (this.outputCallback) {
      this.outputCallback(output);
    }

    // Return empty - actual keywords generated externally
    return {
      archId: request.archId,
      keywords: [],
    };
  }

  async learn(request: LLMLearnRequest): Promise<LLMLearnResponse> {
    const output: PromptOutput = {
      type: 'learn',
      prompts: [request.skeletonYaml],
      instructions: buildLearnInstructions(request),
    };

    if (this.outputCallback) {
      this.outputCallback(output);
    }

    // Return placeholder - actual registry is generated externally
    return {
      registryYaml: '',
      explanation: 'Awaiting external generation',
      suggestions: [],
      confidence: 0,
    };
  }

  async generate(_prompt: string): Promise<string> {
    throw new Error('PromptProvider cannot generate text directly. Use OpenAI or Anthropic provider.');
  }

  /**
   * Format the learn prompt for output.
   */
  formatLearnPrompt(request: LLMLearnRequest): string {
    return formatLearnPromptForDisplay(request);
  }

  /**
   * Format the complete verification prompt for output.
   */
  formatVerificationPrompt(request: VerificationRequest): string {
    const lines: string[] = [
      '═'.repeat(70),
      'ARCHCODEX VERIFICATION REQUEST',
      '═'.repeat(70),
      '',
      `File: ${request.filePath}`,
      `Architecture: ${request.archId}`,
      '',
      '─'.repeat(70),
      'CODE TO VERIFY:',
      '─'.repeat(70),
      '',
      request.content,
      '',
      '─'.repeat(70),
      'VERIFICATION CHECKS:',
      '─'.repeat(70),
      '',
    ];

    request.checks.forEach((check, i) => {
      lines.push(`${i + 1}. **${check.hint}**`);
      lines.push(`   Question: ${check.question}`);
      if (check.context) {
        lines.push(`   Context: ${check.context}`);
      }
      lines.push('');
    });

    lines.push('─'.repeat(70));
    lines.push('INSTRUCTIONS:');
    lines.push('─'.repeat(70));
    lines.push('');
    lines.push('For each check above, analyze the code and determine:');
    lines.push('');
    lines.push('- PASS: Code complies with the hint');
    lines.push('- FAIL: Code violates the hint');
    lines.push('- UNSURE: Cannot determine from static analysis');
    lines.push('');
    lines.push('Provide your reasoning for each determination.');
    lines.push('');
    lines.push('═'.repeat(70));

    return lines.join('\n');
  }

  /**
   * Format the reindex prompt for output.
   */
  formatReindexPrompt(request: ReindexRequest): string {
    const lines: string[] = [
      '═'.repeat(70),
      'ARCHCODEX REINDEX REQUEST',
      '═'.repeat(70),
      '',
      `Architecture: ${request.archId}`,
      `Description: ${request.description}`,
      '',
    ];

    if (request.hints && request.hints.length > 0) {
      lines.push('Hints:');
      request.hints.forEach(h => lines.push(`  - ${h}`));
      lines.push('');
    }

    if (request.constraints && request.constraints.length > 0) {
      lines.push('Constraints:');
      request.constraints.forEach(c => lines.push(`  - ${c}`));
      lines.push('');
    }

    lines.push('─'.repeat(70));
    lines.push('INSTRUCTIONS:');
    lines.push('─'.repeat(70));
    lines.push('');
    lines.push('Generate 5-10 keywords that developers might search for when');
    lines.push('looking to create a file with this architecture.');
    lines.push('');
    lines.push('Output as JSON: ["keyword1", "keyword2", ...]');
    lines.push('');
    lines.push('═'.repeat(70));

    return lines.join('\n');
  }

  private buildVerificationInstructions(request: VerificationRequest): string {
    return [
      `Verify the code in ${request.filePath} against the architectural hints.`,
      `Architecture: ${request.archId}`,
      '',
      'For each hint, determine if the code complies.',
      'Consider both explicit violations and missing implementations.',
    ].join('\n');
  }

  private buildReindexPrompt(request: ReindexRequest): string {
    const parts = [
      `Architecture ID: ${request.archId}`,
      `Description: ${request.description}`,
    ];

    if (request.hints?.length) {
      parts.push(`Hints: ${request.hints.join(', ')}`);
    }

    if (request.constraints?.length) {
      parts.push(`Constraints: ${request.constraints.join(', ')}`);
    }

    return parts.join('\n');
  }
}
