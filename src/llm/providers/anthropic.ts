/**
 * @arch archcodex.core.domain.llm
 *
 * Anthropic provider for LLM-based verification and reindexing.
 * Extends BaseLLMProvider with Anthropic-specific API handling.
 */
import type { LLMConfig } from '../types.js';
import { BaseLLMProvider, type APIResponse } from './base.js';

/**
 * Anthropic API provider for verification and keyword generation.
 */
export class AnthropicProvider extends BaseLLMProvider {
  readonly name = 'anthropic' as const;

  constructor(config: Partial<LLMConfig> = {}) {
    super({
      provider: 'anthropic',
      model: config.model || 'claude-3-haiku-20240307',
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
      baseUrl: config.baseUrl || 'https://api.anthropic.com',
      maxTokens: config.maxTokens || 1000,
      temperature: config.temperature ?? 0,
    });
  }

  isAvailable(): boolean {
    return !!this.config.apiKey;
  }

  protected getUnavailableError(): string {
    return 'Anthropic API key not configured. Set ANTHROPIC_API_KEY environment variable.';
  }

  protected async callAPI(prompt: string, maxTokens?: number): Promise<APIResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(`${this.config.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: maxTokens ?? this.config.maxTokens,
          messages: [{ role: 'user', content: prompt }],
          system: this.getSystemPrompt(),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        const sanitizedError = errorText.length > 200
          ? errorText.substring(0, 200) + '...'
          : errorText;
        throw new Error(`Anthropic API error: ${response.status} - ${sanitizedError}`);
      }

      const data = await response.json() as {
        content?: Array<{ type?: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      if (!Array.isArray(data.content)) {
        throw new Error('Invalid response structure from Anthropic API');
      }

      const textContent = data.content.find(c => c.type === 'text');
      const content = textContent?.text ?? '';

      return {
        content,
        usage: data.usage ? {
          input: data.usage.input_tokens ?? 0,
          output: data.usage.output_tokens ?? 0,
          total: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
        } : undefined,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
