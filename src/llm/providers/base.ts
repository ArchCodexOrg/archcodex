/**
 * @arch archcodex.core.domain.llm
 *
 * Base class for LLM providers with shared implementation.
 * Providers only need to implement callAPI() and provider-specific config.
 */
import type {
  ILLMProvider,
  LLMConfig,
  VerificationRequest,
  VerificationResponse,
  ReindexRequest,
  ReindexResponse,
  CheckResult,
  LLMLearnRequest,
  LLMLearnResponse,
} from '../types.js';
import { buildLearnPrompt, parseLearnResponse } from '../learn-prompts.js';

/**
 * API response from provider.
 */
export interface APIResponse {
  content: string;
  usage?: { input: number; output: number; total: number };
}

/**
 * Base class for LLM providers.
 * Subclasses must implement callAPI() for provider-specific API calls.
 */
export abstract class BaseLLMProvider implements ILLMProvider {
  abstract readonly name: 'openai' | 'anthropic' | 'prompt';

  protected config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  abstract isAvailable(): boolean;

  /**
   * Make API call to the LLM provider.
   * Subclasses implement provider-specific request/response handling.
   */
  protected abstract callAPI(prompt: string, maxTokens?: number): Promise<APIResponse>;

  /**
   * Get the error message when provider is not available.
   */
  protected abstract getUnavailableError(): string;

  async verify(request: VerificationRequest): Promise<VerificationResponse> {
    if (!this.isAvailable()) {
      return {
        filePath: request.filePath,
        archId: request.archId,
        provider: this.name,
        results: [],
        error: this.getUnavailableError(),
      };
    }

    try {
      const prompt = this.buildVerificationPrompt(request);
      const response = await this.callAPI(prompt);
      const results = this.parseVerificationResponse(response.content, request.checks);

      return {
        filePath: request.filePath,
        archId: request.archId,
        provider: this.name,
        results,
        tokenUsage: response.usage,
      };
    } catch (error) {
      return {
        filePath: request.filePath,
        archId: request.archId,
        provider: this.name,
        results: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async generateKeywords(request: ReindexRequest): Promise<ReindexResponse> {
    if (!this.isAvailable()) {
      return { archId: request.archId, keywords: [] };
    }

    try {
      const prompt = this.buildReindexPrompt(request);
      const response = await this.callAPI(prompt);
      const keywords = this.parseKeywordsResponse(response.content);

      return {
        archId: request.archId,
        keywords,
        tokenUsage: response.usage,
      };
    } catch {
      return { archId: request.archId, keywords: [] };
    }
  }

  async learn(request: LLMLearnRequest): Promise<LLMLearnResponse> {
    if (!this.isAvailable()) {
      return {
        registryYaml: '',
        explanation: '',
        suggestions: [],
        confidence: 0,
        error: this.getUnavailableError(),
      };
    }

    try {
      const prompt = buildLearnPrompt(request);
      const response = await this.callAPI(prompt, 4000);
      const parsed = parseLearnResponse(response.content, this.name);

      return { ...parsed, tokenUsage: response.usage };
    } catch (error) {
      return {
        registryYaml: '',
        explanation: '',
        suggestions: [],
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async generate(prompt: string): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error(this.getUnavailableError());
    }

    const response = await this.callAPI(prompt, 4000);
    return response.content;
  }

  protected buildVerificationPrompt(request: VerificationRequest): string {
    const checks = request.checks
      .map((c, i) => `${i + 1}. "${c.hint}"\n   Question: ${c.question}`)
      .join('\n\n');

    return `TASK: Verify code compliance with architectural hints.

FILE: ${request.filePath}
ARCHITECTURE: ${request.archId}

CODE:
${request.content}

HINTS TO VERIFY:
${checks}

INSTRUCTIONS:
For each hint, analyze the code and determine compliance:
- "passed": true if code follows the hint, false if it violates
- "confidence": "high" (clear evidence), "medium" (likely but not certain), "low" (uncertain)
- "reasoning": 1-2 sentences explaining your determination

OUTPUT FORMAT (JSON array, one object per hint in order):
[
  {"hint": "exact hint text", "passed": true, "confidence": "high", "reasoning": "explanation"},
  {"hint": "exact hint text", "passed": false, "confidence": "medium", "reasoning": "explanation"}
]

Return ONLY the JSON array.`;
  }

  protected buildReindexPrompt(request: ReindexRequest): string {
    return `TASK: Generate discovery keywords for an architecture definition.

PURPOSE: These keywords help developers find the right architecture when creating new files.
When a developer searches "payment service", keywords like ["service", "payment", "transaction"] should match.

ARCHITECTURE:
- ID: ${request.archId}
- Description: ${request.description}
${request.hints?.length ? `- Hints: ${request.hints.join('; ')}` : ''}
${request.constraints?.length ? `- Constraints: ${request.constraints.join('; ')}` : ''}

KEYWORD GUIDELINES:
✓ Good: Common terms developers would search ("service", "controller", "validator")
✓ Good: Domain concepts from the description ("payment", "user", "auth")
✓ Good: Pattern names ("repository", "factory", "handler")
✗ Bad: Generic words ("code", "file", "function")
✗ Bad: ArchCodex-specific terms ("constraint", "mixin", "arch")
✗ Bad: Single letters or abbreviations without context

OUTPUT: JSON array of 5-10 keywords
["keyword1", "keyword2", "keyword3", ...]

Return ONLY the JSON array.`;
  }

  protected parseVerificationResponse(
    content: string,
    checks: VerificationRequest['checks']
  ): CheckResult[] {
    try {
      const cleaned = this.stripMarkdownCodeBlocks(content);
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);

      if (!jsonMatch) {
        return this.createFailedResults(checks, 'Failed to parse LLM response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        hint?: string;
        passed?: boolean;
        confidence?: string;
        reasoning?: string;
      }>;

      return checks.map((check, i) => ({
        hint: check.hint,
        passed: parsed[i]?.passed ?? false,
        confidence: (parsed[i]?.confidence as 'high' | 'medium' | 'low') || 'low',
        reasoning: parsed[i]?.reasoning || 'No reasoning provided',
      }));
    } catch {
      return this.createFailedResults(checks, 'Failed to parse LLM response');
    }
  }

  protected parseKeywordsResponse(content: string): string[] {
    try {
      const cleaned = this.stripMarkdownCodeBlocks(content);
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed.filter((k): k is string => typeof k === 'string');
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Strip markdown code blocks from LLM response.
   */
  protected stripMarkdownCodeBlocks(content: string): string {
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    return codeBlockMatch ? codeBlockMatch[1] : content;
  }

  /**
   * Create failed results for all checks.
   */
  private createFailedResults(
    checks: VerificationRequest['checks'],
    reasoning: string
  ): CheckResult[] {
    return checks.map(check => ({
      hint: check.hint,
      passed: false,
      confidence: 'low' as const,
      reasoning,
    }));
  }

  /**
   * Get the system prompt for the LLM.
   */
  protected getSystemPrompt(): string {
    return `You are an expert code analyzer for ArchCodex, a tool that enforces architectural constraints on codebases.

Your role:
- Analyze code for compliance with architectural rules and behavioral hints
- Generate precise, actionable outputs
- Be conservative: when uncertain, say so rather than guessing

Output rules:
- Return ONLY valid JSON as specified in the user prompt
- No markdown code blocks, no explanations outside the JSON
- Use the exact field names specified`;
  }
}
