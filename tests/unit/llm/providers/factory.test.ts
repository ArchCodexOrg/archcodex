/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import {
  createProvider,
  createProviderFromSettings,
  getAvailableProvider,
  listProviders,
} from '../../../../src/llm/providers/factory.js';

describe('LLM Provider Factory', () => {
  describe('createProvider', () => {
    it('should create OpenAI provider', () => {
      const provider = createProvider('openai');
      expect(provider).toBeDefined();
    });

    it('should create Anthropic provider', () => {
      const provider = createProvider('anthropic');
      expect(provider).toBeDefined();
    });

    it('should create Prompt provider', () => {
      const provider = createProvider('prompt');
      expect(provider).toBeDefined();
      expect(provider.isAvailable()).toBe(true);
    });

    it('should throw for unknown provider', () => {
      expect(() => createProvider('unknown' as any)).toThrow('Unknown LLM provider');
    });
  });

  describe('createProviderFromSettings', () => {
    it('should create provider without settings', () => {
      const provider = createProviderFromSettings('prompt');
      expect(provider).toBeDefined();
      expect(provider.isAvailable()).toBe(true);
    });

    it('should create provider with settings', () => {
      const provider = createProviderFromSettings('openai', {
        providers: {
          openai: {
            model: 'gpt-4',
          },
        },
      });
      expect(provider).toBeDefined();
    });
  });

  describe('getAvailableProvider', () => {
    it('should return prompt provider when no API keys configured', () => {
      const provider = getAvailableProvider();
      expect(provider).toBeDefined();
      expect(provider.isAvailable()).toBe(true);
    });

    it('should try preferred provider first', () => {
      const provider = getAvailableProvider('prompt');
      expect(provider).toBeDefined();
      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe('listProviders', () => {
    it('should list all providers', () => {
      const providers = listProviders();
      expect(providers).toHaveLength(3);
      expect(providers.map(p => p.name)).toContain('openai');
      expect(providers.map(p => p.name)).toContain('anthropic');
      expect(providers.map(p => p.name)).toContain('prompt');
    });

    it('should show prompt provider as always available', () => {
      const providers = listProviders();
      const promptProvider = providers.find(p => p.name === 'prompt');
      expect(promptProvider?.available).toBe(true);
    });

    it('should include model info for API providers', () => {
      const providers = listProviders();
      const openaiProvider = providers.find(p => p.name === 'openai');
      expect(openaiProvider?.model).toBeDefined();
      expect(openaiProvider?.baseUrl).toBeDefined();
    });
  });
});
