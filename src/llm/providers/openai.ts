/**
 * @arch archcodex.core.domain.llm
 *
 * OpenAI provider for LLM-based verification and reindexing.
 * Extends BaseLLMProvider with OpenAI-specific API handling.
 */
import type { LLMConfig } from '../types.js';
import { BaseLLMProvider, type APIResponse } from './base.js';

/**
 * OpenAI API provider for verification and keyword generation.
 */
export class OpenAIProvider extends BaseLLMProvider {
  readonly name = 'openai' as const;

  constructor(config: Partial<LLMConfig> = {}) {
    super({
      provider: 'openai',
      model: config.model || 'gpt-4o-mini',
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      baseUrl: config.baseUrl || 'https://api.openai.com/v1',
      maxTokens: config.maxTokens || 1000,
      temperature: config.temperature ?? 0,
    });
  }

  isAvailable(): boolean {
    return !!this.config.apiKey;
  }

  protected getUnavailableError(): string {
    return 'OpenAI API key not configured. Set OPENAI_API_KEY environment variable.';
  }

  protected async callAPI(prompt: string, maxTokens?: number): Promise<APIResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: this.getSystemPrompt() },
            { role: 'user', content: prompt },
          ],
          max_tokens: maxTokens ?? this.config.maxTokens,
          temperature: this.config.temperature,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        const sanitizedError = errorText.length > 200
          ? errorText.substring(0, 200) + '...'
          : errorText;
        throw new Error(`OpenAI API error: ${response.status} - ${sanitizedError}`);
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };

      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error('Invalid response structure from OpenAI API');
      }

      return {
        content,
        usage: data.usage ? {
          input: data.usage.prompt_tokens ?? 0,
          output: data.usage.completion_tokens ?? 0,
          total: data.usage.total_tokens ?? 0,
        } : undefined,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
