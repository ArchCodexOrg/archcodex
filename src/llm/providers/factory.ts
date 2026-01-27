/**
 * @arch archcodex.core.domain
 *
 * LLM provider factory - creates and resolves provider instances.
 */
import type { ILLMProvider, LLMProvider, LLMConfig } from '../types.js';
import type { LLMSettings, LLMProviderConfig } from '../../core/config/schema.js';
import type { ArchConfig } from '../../utils/archconfig.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { PromptProvider } from './prompt.js';

/**
 * Convert config file settings to LLMConfig format.
 * Resolves API key from: config > archconfig > environment variable
 */
function toProviderConfig(
  providerConfig: LLMProviderConfig | undefined,
  provider: LLMProvider,
  archConfig?: ArchConfig
): Partial<LLMConfig> {
  if (!providerConfig) return { provider };

  // Resolve API key: config.yaml > .archconfig > env var
  let apiKey = providerConfig.api_key;
  if (!apiKey && archConfig) {
    const configKey = `${provider}_api_key`;
    apiKey = archConfig[configKey];
  }

  return {
    provider,
    model: providerConfig.model,
    apiKey,
    baseUrl: providerConfig.base_url,
    maxTokens: providerConfig.max_tokens,
    temperature: providerConfig.temperature,
  };
}

/**
 * Create an LLM provider instance.
 */
export function createProvider(
  provider: LLMProvider,
  config: Partial<LLMConfig> = {}
): ILLMProvider {
  switch (provider) {
    case 'openai':
      return new OpenAIProvider(config);
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'prompt':
      return new PromptProvider();
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

/**
 * Create an LLM provider from config file settings.
 * @param provider - The provider type
 * @param settings - LLM settings from config.yaml
 * @param archConfig - Credentials from .archconfig
 */
export function createProviderFromSettings(
  provider: LLMProvider,
  settings?: LLMSettings,
  archConfig?: ArchConfig
): ILLMProvider {
  if (!settings) {
    return createProvider(provider);
  }

  const providerConfig = settings.providers?.[provider as 'openai' | 'anthropic'];
  const config = toProviderConfig(providerConfig, provider, archConfig);

  return createProvider(provider, config);
}

/**
 * Get the first available provider (has API key configured).
 * Falls back to 'prompt' if no API providers are available.
 * @param preferred - Preferred provider to try first
 * @param settings - LLM settings from config.yaml
 * @param archConfig - Credentials from .archconfig
 */
export function getAvailableProvider(
  preferred?: LLMProvider,
  settings?: LLMSettings,
  archConfig?: ArchConfig
): ILLMProvider {
  if (preferred) {
    const provider = createProviderFromSettings(preferred, settings, archConfig);
    if (provider.isAvailable()) {
      return provider;
    }
  }

  // Try OpenAI first
  const openai = createProviderFromSettings('openai', settings, archConfig);
  if (openai.isAvailable()) {
    return openai;
  }

  // Try Anthropic
  const anthropic = createProviderFromSettings('anthropic', settings, archConfig);
  if (anthropic.isAvailable()) {
    return anthropic;
  }

  // Fall back to prompt mode
  return new PromptProvider();
}

/**
 * List all available providers with their configuration.
 * @param settings - LLM settings from config.yaml
 * @param archConfig - Credentials from .archconfig
 */
export function listProviders(
  settings?: LLMSettings,
  archConfig?: ArchConfig
): Array<{
  name: LLMProvider;
  available: boolean;
  model?: string;
  baseUrl?: string;
}> {
  const openaiConfig = settings?.providers?.openai;
  const anthropicConfig = settings?.providers?.anthropic;

  const openai = createProviderFromSettings('openai', settings, archConfig);
  const anthropic = createProviderFromSettings('anthropic', settings, archConfig);

  return [
    {
      name: 'openai',
      available: openai.isAvailable(),
      model: openaiConfig?.model || 'gpt-4o-mini',
      baseUrl: openaiConfig?.base_url || 'https://api.openai.com/v1',
    },
    {
      name: 'anthropic',
      available: anthropic.isAvailable(),
      model: anthropicConfig?.model || 'claude-3-haiku-20240307',
      baseUrl: anthropicConfig?.base_url || 'https://api.anthropic.com',
    },
    { name: 'prompt', available: true },
  ];
}
