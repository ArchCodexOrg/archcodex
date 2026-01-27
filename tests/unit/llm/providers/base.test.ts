/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { BaseLLMProvider, type APIResponse } from '../../../../src/llm/providers/base.js';
import type { LLMConfig, VerificationRequest, ReindexRequest, LLMLearnRequest } from '../../../../src/llm/types.js';

/**
 * Concrete implementation for testing abstract base class.
 */
class TestProvider extends BaseLLMProvider {
  readonly name = 'openai' as const;
  private mockAvailable = false;
  private mockResponse: APIResponse = { content: '[]' };

  constructor(config: LLMConfig, mockAvailable = false) {
    super(config);
    this.mockAvailable = mockAvailable;
  }

  isAvailable(): boolean {
    return this.mockAvailable;
  }

  protected getUnavailableError(): string {
    return 'Test provider not available';
  }

  protected async callAPI(_prompt: string, _maxTokens?: number): Promise<APIResponse> {
    return this.mockResponse;
  }

  setMockResponse(response: APIResponse): void {
    this.mockResponse = response;
  }
}

describe('BaseLLMProvider', () => {
  const defaultConfig: LLMConfig = {
    provider: 'openai',
    model: 'test-model',
    apiKey: 'test-key',
    maxTokens: 1000,
    temperature: 0,
  };

  describe('verify', () => {
    it('should return error when not available', async () => {
      const provider = new TestProvider(defaultConfig, false);
      const request: VerificationRequest = {
        filePath: '/test/file.ts',
        archId: 'test.arch',
        content: 'test content',
        checks: [{ hint: 'test hint', question: 'Does it work?' }],
      };

      const result = await provider.verify(request);
      expect(result.error).toBe('Test provider not available');
      expect(result.results).toEqual([]);
    });

    it('should parse verification response correctly', async () => {
      const provider = new TestProvider(defaultConfig, true);
      provider.setMockResponse({
        content: '[{"hint":"test hint","passed":true,"confidence":"high","reasoning":"Test passed"}]',
      });

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
      expect(result.results[0].confidence).toBe('high');
    });

    it('should handle malformed JSON response', async () => {
      const provider = new TestProvider(defaultConfig, true);
      provider.setMockResponse({ content: 'invalid json' });

      const request: VerificationRequest = {
        filePath: '/test/file.ts',
        archId: 'test.arch',
        content: 'test content',
        checks: [{ hint: 'test hint', question: 'Does it work?' }],
      };

      const result = await provider.verify(request);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].passed).toBe(false);
      expect(result.results[0].reasoning).toContain('Failed to parse');
    });
  });

  describe('generateKeywords', () => {
    it('should return empty array when not available', async () => {
      const provider = new TestProvider(defaultConfig, false);
      const request: ReindexRequest = {
        archId: 'test.arch',
        description: 'Test architecture',
      };

      const result = await provider.generateKeywords(request);
      expect(result.keywords).toEqual([]);
    });

    it('should parse keywords response correctly', async () => {
      const provider = new TestProvider(defaultConfig, true);
      provider.setMockResponse({ content: '["keyword1", "keyword2", "keyword3"]' });

      const request: ReindexRequest = {
        archId: 'test.arch',
        description: 'Test architecture',
      };

      const result = await provider.generateKeywords(request);
      expect(result.keywords).toEqual(['keyword1', 'keyword2', 'keyword3']);
    });
  });

  describe('learn', () => {
    it('should return error when not available', async () => {
      const provider = new TestProvider(defaultConfig, false);
      const request: LLMLearnRequest = {
        projectName: 'test-project',
        files: [],
        existingArchitectures: [],
      };

      const result = await provider.learn(request);
      expect(result.error).toBe('Test provider not available');
      expect(result.registryYaml).toBe('');
    });
  });

  describe('stripMarkdownCodeBlocks', () => {
    it('should strip markdown code blocks from response', async () => {
      const provider = new TestProvider(defaultConfig, true);
      provider.setMockResponse({
        content: '```json\n["keyword1", "keyword2"]\n```',
      });

      const request: ReindexRequest = {
        archId: 'test.arch',
        description: 'Test architecture',
      };

      const result = await provider.generateKeywords(request);
      expect(result.keywords).toEqual(['keyword1', 'keyword2']);
    });
  });
});
