/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { OpenAIProvider } from '../../../../src/llm/providers/openai.js';
import type { VerificationRequest, ReindexRequest } from '../../../../src/llm/types.js';

describe('OpenAIProvider', () => {
  describe('constructor', () => {
    it('should create provider with config', () => {
      const provider = new OpenAIProvider({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4o-mini',
      });
      expect(provider.name).toBe('openai');
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
  });
});
