/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect, vi } from 'vitest';
import { AnthropicProvider } from '../../../../src/llm/providers/anthropic.js';
import type { VerificationRequest, ReindexRequest } from '../../../../src/llm/types.js';

describe('AnthropicProvider', () => {
  describe('constructor', () => {
    it('should create provider with config', () => {
      const provider = new AnthropicProvider({
        provider: 'anthropic',
        apiKey: 'test-key',
        model: 'claude-3-haiku-20240307',
      });
      expect(provider.name).toBe('anthropic');
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
  });
});
