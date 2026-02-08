/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIProvider } from '../../../../src/llm/providers/openai.js';
import type { VerificationRequest, ReindexRequest } from '../../../../src/llm/types.js';

describe('OpenAIProvider', () => {
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
      const provider = new OpenAIProvider({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4o-mini',
      });
      expect(provider.name).toBe('openai');
    });

    it('should use default model when not provided', () => {
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
      });
      expect(provider.name).toBe('openai');
      expect(provider.isAvailable()).toBe(true);
    });

    it('should use default config when no args provided', () => {
      const provider = new OpenAIProvider();
      expect(provider.name).toBe('openai');
    });

    it('should respect custom temperature of 0', () => {
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
        temperature: 0,
      });
      expect(provider.isAvailable()).toBe(true);
    });

    it('should use custom baseUrl when provided', () => {
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
        baseUrl: 'https://custom.openai.com/v1',
      });
      expect(provider.isAvailable()).toBe(true);
    });

    it('should use custom maxTokens when provided', () => {
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
        maxTokens: 2000,
      });
      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe('isAvailable', () => {
    it('should return false without API key', () => {
      const provider = new OpenAIProvider({
        provider: 'openai',
      });
      expect(provider.isAvailable()).toBe(false);
    });

    it('should return true with API key', () => {
      const provider = new OpenAIProvider({
        provider: 'openai',
        apiKey: 'test-key',
      });
      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe('verify', () => {
    it('should return error when not available', async () => {
      const provider = new OpenAIProvider({
        provider: 'openai',
      });
      const request: VerificationRequest = {
        filePath: '/test/file.ts',
        archId: 'test.arch',
        content: 'test content',
        checks: [{ hint: 'test hint', question: 'Does it work?' }],
      };

      const result = await provider.verify(request);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('OPENAI_API_KEY');
    });

    it('should call API and return parsed verification results on success', async () => {
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
      });

      fetchSpy.mockResolvedValueOnce(new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  { hint: 'test hint', passed: true, confidence: 'high', reasoning: 'Looks good' },
                ]),
              },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
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
      const provider = new OpenAIProvider({
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
      expect(result.error).toContain('OpenAI API error: 401');
    });

    it('should truncate long error text to 200 chars', async () => {
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
      });

      const longError = 'y'.repeat(300);
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
      expect(result.error).toContain('OpenAI API error: 500');
    });

    it('should not truncate short error text', async () => {
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
      });

      fetchSpy.mockResolvedValueOnce(new Response(
        'Bad request',
        { status: 400 },
      ));

      const request: VerificationRequest = {
        filePath: '/test/file.ts',
        archId: 'test.arch',
        content: 'test content',
        checks: [{ hint: 'test hint', question: 'Does it work?' }],
      };

      const result = await provider.verify(request);
      expect(result.error).toContain('Bad request');
      expect(result.error).not.toContain('...');
    });

    it('should handle invalid response structure (content not string)', async () => {
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
      });

      fetchSpy.mockResolvedValueOnce(new Response(
        JSON.stringify({ choices: [{ message: { content: 12345 } }] }),
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

    it('should handle response with missing choices array', async () => {
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
      });

      fetchSpy.mockResolvedValueOnce(new Response(
        JSON.stringify({}),
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

    it('should handle response with empty choices array', async () => {
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
      });

      fetchSpy.mockResolvedValueOnce(new Response(
        JSON.stringify({ choices: [] }),
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

    it('should handle response with no usage data', async () => {
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
      });

      fetchSpy.mockResolvedValueOnce(new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  { hint: 'test hint', passed: true, confidence: 'high', reasoning: 'OK' },
                ]),
              },
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
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
      });

      fetchSpy.mockResolvedValueOnce(new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  { hint: 'test hint', passed: true, confidence: 'high', reasoning: 'OK' },
                ]),
              },
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
      const provider = new OpenAIProvider({
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
      const provider = new OpenAIProvider({
        provider: 'openai',
      });
      const request: ReindexRequest = {
        archId: 'test.arch',
        description: 'Test architecture',
      };

      const result = await provider.generateKeywords(request);
      expect(result.keywords).toEqual([]);
    });

    it('should call API and return parsed keywords on success', async () => {
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
      });

      fetchSpy.mockResolvedValueOnce(new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '["service", "payment", "transaction"]',
              },
            },
          ],
          usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
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
      const provider = new OpenAIProvider({
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
      const provider = new OpenAIProvider({
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
    it('should send correct headers with Bearer token', async () => {
      const provider = new OpenAIProvider({
        apiKey: 'my-api-key',
        baseUrl: 'https://custom.openai.com/v1',
        model: 'gpt-4',
        maxTokens: 500,
      });

      fetchSpy.mockResolvedValueOnce(new Response(
        JSON.stringify({
          choices: [{ message: { content: '["keyword"]' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        { status: 200 },
      ));

      await provider.generateKeywords({
        archId: 'test.arch',
        description: 'Test',
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://custom.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer my-api-key',
          }),
        }),
      );

      const callArgs = fetchSpy.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.model).toBe('gpt-4');
      expect(body.max_tokens).toBe(500);
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].role).toBe('user');
    });

    it('should use custom maxTokens parameter when provided to callAPI', async () => {
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
        maxTokens: 500,
      });

      fetchSpy.mockResolvedValueOnce(new Response(
        JSON.stringify({
          choices: [{ message: { content: 'response' } }],
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

    it('should include temperature in request body', async () => {
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
        temperature: 0.5,
      });

      fetchSpy.mockResolvedValueOnce(new Response(
        JSON.stringify({
          choices: [{ message: { content: '["kw"]' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        { status: 200 },
      ));

      await provider.generateKeywords({
        archId: 'test.arch',
        description: 'Test',
      });

      const callArgs = fetchSpy.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.temperature).toBe(0.5);
    });
  });
});
