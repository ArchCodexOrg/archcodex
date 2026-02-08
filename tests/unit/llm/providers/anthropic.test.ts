/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicProvider } from '../../../../src/llm/providers/anthropic.js';
import type { VerificationRequest, ReindexRequest } from '../../../../src/llm/types.js';

describe('AnthropicProvider', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create provider with config', () => {
      const provider = new AnthropicProvider({
        provider: 'anthropic',
        apiKey: 'test-key',
        model: 'claude-3-haiku-20240307',
      });
      expect(provider.name).toBe('anthropic');
    });

    it('should use default model when not provided', () => {
      const provider = new AnthropicProvider({
        apiKey: 'test-key',
      });
      expect(provider.name).toBe('anthropic');
      expect(provider.isAvailable()).toBe(true);
    });

    it('should use default config when no args provided', () => {
      const provider = new AnthropicProvider();
      expect(provider.name).toBe('anthropic');
    });

    it('should respect custom temperature of 0', () => {
      // temperature ?? 0 means explicit 0 should be preserved
      const provider = new AnthropicProvider({
        apiKey: 'test-key',
        temperature: 0,
      });
      expect(provider.isAvailable()).toBe(true);
    });

    it('should use custom baseUrl when provided', () => {
      const provider = new AnthropicProvider({
        apiKey: 'test-key',
        baseUrl: 'https://custom.api.com',
      });
      expect(provider.isAvailable()).toBe(true);
    });

    it('should use custom maxTokens when provided', () => {
      const provider = new AnthropicProvider({
        apiKey: 'test-key',
        maxTokens: 2000,
      });
      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe('isAvailable', () => {
    it('should return false without API key', () => {
      const provider = new AnthropicProvider({
        provider: 'anthropic',
      });
      expect(provider.isAvailable()).toBe(false);
    });

    it('should return true with API key', () => {
      const provider = new AnthropicProvider({
        provider: 'anthropic',
        apiKey: 'test-key',
      });
      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe('verify', () => {
    it('should return error when not available', async () => {
      const provider = new AnthropicProvider({
        provider: 'anthropic',
      });
      const request: VerificationRequest = {
        filePath: '/test/file.ts',
        archId: 'test.arch',
        content: 'test content',
        checks: [{ hint: 'test hint', question: 'Does it work?' }],
      };

      const result = await provider.verify(request);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('ANTHROPIC_API_KEY');
    });

    it('should call API and return parsed verification results on success', async () => {
      const provider = new AnthropicProvider({
        apiKey: 'test-key',
      });

      fetchSpy.mockResolvedValueOnce(new Response(
        JSON.stringify({
          content: [
            {
              type: 'text',
              text: JSON.stringify([
                { hint: 'test hint', passed: true, confidence: 'high', reasoning: 'Looks good' },
              ]),
            },
          ],
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
        { status: 200 },
      ));

      const request: VerificationRequest = {
        filePath: '/test/file.ts',
        archId: 'test.arch',
        content: 'test content',
        checks: [{ hint: 'test hint', question: 'Does it work?' }],
      };

      const result = await provider.verify(request);
      expect(result.error).toBeUndefined();
      expect(result.results).toHaveLength(1);
      expect(result.results[0].passed).toBe(true);
      expect(result.tokenUsage).toEqual({ input: 100, output: 50, total: 150 });
    });

    it('should handle API error response (non-ok status)', async () => {
      const provider = new AnthropicProvider({
        apiKey: 'test-key',
      });

      fetchSpy.mockResolvedValueOnce(new Response(
        'Unauthorized',
        { status: 401 },
      ));

      const request: VerificationRequest = {
        filePath: '/test/file.ts',
        archId: 'test.arch',
        content: 'test content',
        checks: [{ hint: 'test hint', question: 'Does it work?' }],
      };

      const result = await provider.verify(request);
      expect(result.error).toContain('Anthropic API error: 401');
    });

    it('should truncate long error text to 200 chars', async () => {
      const provider = new AnthropicProvider({
        apiKey: 'test-key',
      });

      const longError = 'x'.repeat(300);
      fetchSpy.mockResolvedValueOnce(new Response(
        longError,
        { status: 500 },
      ));

      const request: VerificationRequest = {
        filePath: '/test/file.ts',
        archId: 'test.arch',
        content: 'test content',
        checks: [{ hint: 'test hint', question: 'Does it work?' }],
      };

      const result = await provider.verify(request);
      expect(result.error).toContain('...');
      // The sanitized error should be 200 chars + '...'
      expect(result.error).toContain('Anthropic API error: 500');
    });

    it('should not truncate short error text', async () => {
      const provider = new AnthropicProvider({
        apiKey: 'test-key',
      });

      fetchSpy.mockResolvedValueOnce(new Response(
        'Short error',
        { status: 400 },
      ));

      const request: VerificationRequest = {
        filePath: '/test/file.ts',
        archId: 'test.arch',
        content: 'test content',
        checks: [{ hint: 'test hint', question: 'Does it work?' }],
      };

      const result = await provider.verify(request);
      expect(result.error).toContain('Short error');
      expect(result.error).not.toContain('...');
    });

    it('should handle invalid response structure (content not array)', async () => {
      const provider = new AnthropicProvider({
        apiKey: 'test-key',
      });

      fetchSpy.mockResolvedValueOnce(new Response(
        JSON.stringify({ content: 'not an array' }),
        { status: 200 },
      ));

      const request: VerificationRequest = {
        filePath: '/test/file.ts',
        archId: 'test.arch',
        content: 'test content',
        checks: [{ hint: 'test hint', question: 'Does it work?' }],
      };

      const result = await provider.verify(request);
      expect(result.error).toContain('Invalid response structure');
    });

    it('should handle response with no text content block', async () => {
      const provider = new AnthropicProvider({
        apiKey: 'test-key',
      });

      fetchSpy.mockResolvedValueOnce(new Response(
        JSON.stringify({
          content: [{ type: 'image', text: 'something' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
        { status: 200 },
      ));

      const request: VerificationRequest = {
        filePath: '/test/file.ts',
        archId: 'test.arch',
        content: 'test content',
        checks: [{ hint: 'test hint', question: 'Does it work?' }],
      };

      // Empty text content should lead to failed parse results
      const result = await provider.verify(request);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].passed).toBe(false);
    });

    it('should handle response with no usage data', async () => {
      const provider = new AnthropicProvider({
        apiKey: 'test-key',
      });

      fetchSpy.mockResolvedValueOnce(new Response(
        JSON.stringify({
          content: [
            {
              type: 'text',
              text: JSON.stringify([
                { hint: 'test hint', passed: true, confidence: 'high', reasoning: 'OK' },
              ]),
            },
          ],
        }),
        { status: 200 },
      ));

      const request: VerificationRequest = {
        filePath: '/test/file.ts',
        archId: 'test.arch',
        content: 'test content',
        checks: [{ hint: 'test hint', question: 'Does it work?' }],
      };

      const result = await provider.verify(request);
      expect(result.tokenUsage).toBeUndefined();
      expect(result.results[0].passed).toBe(true);
    });

    it('should handle usage with missing token fields (defaults to 0)', async () => {
      const provider = new AnthropicProvider({
        apiKey: 'test-key',
      });

      fetchSpy.mockResolvedValueOnce(new Response(
        JSON.stringify({
          content: [
            {
              type: 'text',
              text: JSON.stringify([
                { hint: 'test hint', passed: true, confidence: 'high', reasoning: 'OK' },
              ]),
            },
          ],
          usage: {},
        }),
        { status: 200 },
      ));

      const request: VerificationRequest = {
        filePath: '/test/file.ts',
        archId: 'test.arch',
        content: 'test content',
        checks: [{ hint: 'test hint', question: 'Does it work?' }],
      };

      const result = await provider.verify(request);
      expect(result.tokenUsage).toEqual({ input: 0, output: 0, total: 0 });
    });

    it('should handle fetch throwing an error (network failure)', async () => {
      const provider = new AnthropicProvider({
        apiKey: 'test-key',
      });

      fetchSpy.mockRejectedValueOnce(new Error('Network timeout'));

      const request: VerificationRequest = {
        filePath: '/test/file.ts',
        archId: 'test.arch',
        content: 'test content',
        checks: [{ hint: 'test hint', question: 'Does it work?' }],
      };

      const result = await provider.verify(request);
      expect(result.error).toContain('Network timeout');
      expect(result.results).toEqual([]);
    });
  });

  describe('generateKeywords', () => {
    it('should return error when not available', async () => {
      const provider = new AnthropicProvider({
        provider: 'anthropic',
      });
      const request: ReindexRequest = {
        archId: 'test.arch',
        description: 'Test architecture',
      };

      const result = await provider.generateKeywords(request);
      expect(result.keywords).toEqual([]);
    });

    it('should call API and return parsed keywords on success', async () => {
      const provider = new AnthropicProvider({
        apiKey: 'test-key',
      });

      fetchSpy.mockResolvedValueOnce(new Response(
        JSON.stringify({
          content: [
            {
              type: 'text',
              text: '["service", "payment", "transaction"]',
            },
          ],
          usage: { input_tokens: 50, output_tokens: 20 },
        }),
        { status: 200 },
      ));

      const request: ReindexRequest = {
        archId: 'test.arch',
        description: 'Test architecture',
        hints: ['Use services'],
        constraints: ['No global state'],
      };

      const result = await provider.generateKeywords(request);
      expect(result.keywords).toEqual(['service', 'payment', 'transaction']);
      expect(result.tokenUsage).toEqual({ input: 50, output: 20, total: 70 });
    });

    it('should return empty keywords on API failure', async () => {
      const provider = new AnthropicProvider({
        apiKey: 'test-key',
      });

      fetchSpy.mockRejectedValueOnce(new Error('API down'));

      const request: ReindexRequest = {
        archId: 'test.arch',
        description: 'Test architecture',
      };

      const result = await provider.generateKeywords(request);
      expect(result.keywords).toEqual([]);
    });

    it('should return empty keywords on non-ok response', async () => {
      const provider = new AnthropicProvider({
        apiKey: 'test-key',
      });

      fetchSpy.mockResolvedValueOnce(new Response(
        'Rate limited',
        { status: 429 },
      ));

      const request: ReindexRequest = {
        archId: 'test.arch',
        description: 'Test architecture',
      };

      const result = await provider.generateKeywords(request);
      expect(result.keywords).toEqual([]);
    });
  });

  describe('callAPI integration', () => {
    it('should send correct headers including anthropic-version', async () => {
      const provider = new AnthropicProvider({
        apiKey: 'my-api-key',
        baseUrl: 'https://custom.anthropic.com',
        model: 'claude-3-sonnet',
        maxTokens: 500,
      });

      fetchSpy.mockResolvedValueOnce(new Response(
        JSON.stringify({
          content: [{ type: 'text', text: '["keyword"]' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
        { status: 200 },
      ));

      await provider.generateKeywords({
        archId: 'test.arch',
        description: 'Test',
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://custom.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'x-api-key': 'my-api-key',
            'anthropic-version': '2023-06-01',
          }),
        }),
      );

      const callArgs = fetchSpy.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.model).toBe('claude-3-sonnet');
      expect(body.max_tokens).toBe(500);
    });

    it('should use custom maxTokens parameter when provided to callAPI', async () => {
      const provider = new AnthropicProvider({
        apiKey: 'test-key',
        maxTokens: 500,
      });

      fetchSpy.mockResolvedValueOnce(new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'response' }],
        }),
        { status: 200 },
      ));

      // learn() calls callAPI with maxTokens=4000
      await provider.learn({
        skeletonYaml: 'test: yaml',
      });

      const callArgs = fetchSpy.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.max_tokens).toBe(4000);
    });
  });
});
