/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { PromptProvider } from '../../../../src/llm/providers/prompt.js';
import type { VerificationRequest, ReindexRequest } from '../../../../src/llm/types.js';

describe('PromptProvider', () => {
  describe('constructor', () => {
    it('should create provider', () => {
      const provider = new PromptProvider();
      expect(provider.name).toBe('prompt');
    });
  });

  describe('isAvailable', () => {
    it('should always return true', () => {
      const provider = new PromptProvider();
      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe('verify', () => {
    it('should generate verification prompts', async () => {
      const provider = new PromptProvider();
      const request: VerificationRequest = {
        filePath: '/test/file.ts',
        archId: 'test.arch',
        content: 'test content',
        checks: [
          { hint: 'Follow SRP', question: 'Does the code follow Single Responsibility?' },
        ],
      };

      const result = await provider.verify(request);
      expect(result.provider).toBe('prompt');
      expect(result.results).toHaveLength(1);
      expect(result.results[0].reasoning).toBeDefined();
    });
  });

  describe('generateKeywords', () => {
    it('should generate keyword prompts', async () => {
      const provider = new PromptProvider();
      const request: ReindexRequest = {
        archId: 'test.arch',
        description: 'Test architecture for services',
        hints: ['Use dependency injection'],
      };

      const result = await provider.generateKeywords(request);
      expect(result.archId).toBe('test.arch');
      expect(result.keywords).toBeDefined();
    });
  });
});
