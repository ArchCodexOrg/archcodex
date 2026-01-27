/**
 * @arch archcodex.core.types
 *
 * LLM provider types and interfaces for verification and reindexing.
 * Designed to be provider-agnostic (OpenAI, Anthropic, or external agents).
 */

/**
 * Supported LLM providers.
 * - openai: OpenAI API (GPT-4, etc.)
 * - anthropic: Anthropic API (Claude)
 * - prompt: Output prompts for external verification (e.g., Claude Code)
 */
export type LLMProvider = 'openai' | 'anthropic' | 'prompt';

/**
 * Configuration for LLM providers.
 */
export interface LLMConfig {
  provider: LLMProvider;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Default configurations per provider.
 */
export const DEFAULT_CONFIGS: Record<LLMProvider, Partial<LLMConfig>> = {
  openai: {
    model: 'gpt-4o-mini',
    maxTokens: 1000,
    temperature: 0,
  },
  anthropic: {
    model: 'claude-3-haiku-20240307',
    maxTokens: 1000,
    temperature: 0,
  },
  prompt: {
    // No API config needed - outputs prompts for external verification
  },
};

/**
 * A single verification check for a hint.
 */
export interface VerificationCheck {
  hint: string;
  question: string;
  context?: string;
  /** Optional URI to an example (arch:// or code://) */
  example?: string;
}

/**
 * Request for verification.
 */
export interface VerificationRequest {
  filePath: string;
  archId: string;
  content: string;
  checks: VerificationCheck[];
}

/**
 * Result of a single verification check.
 */
export interface CheckResult {
  hint: string;
  passed: boolean;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  suggestions?: string[];
}

/**
 * Complete verification response.
 */
export interface VerificationResponse {
  filePath: string;
  archId: string;
  provider: LLMProvider;
  results: CheckResult[];
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };
  error?: string;
}

/**
 * Request for keyword generation (reindex).
 */
export interface ReindexRequest {
  archId: string;
  description: string;
  hints?: string[];
  constraints?: string[];
}

/**
 * Response from keyword generation.
 */
export interface ReindexResponse {
  archId: string;
  keywords: string[];
  suggestedDescription?: string;
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };
}

/**
 * Abstract interface for LLM providers.
 * Implementations must handle verification and reindexing.
 */
export interface ILLMProvider {
  readonly name: LLMProvider;

  /**
   * Verify code against behavioral hints.
   */
  verify(request: VerificationRequest): Promise<VerificationResponse>;

  /**
   * Generate keywords for an architecture.
   */
  generateKeywords(request: ReindexRequest): Promise<ReindexResponse>;

  /**
   * Learn architecture from project skeleton.
   */
  learn(request: LLMLearnRequest): Promise<LLMLearnResponse>;

  /**
   * Generic text generation for arbitrary prompts.
   */
  generate(prompt: string): Promise<string>;

  /**
   * Check if the provider is available (API key set, etc.)
   */
  isAvailable(): boolean;
}

/**
 * Prompt output for external verification (used by 'prompt' provider).
 * This is what Claude Code or other agents will see and respond to.
 */
export interface PromptOutput {
  type: 'verification' | 'reindex' | 'learn';
  filePath?: string;
  archId?: string;
  prompts: string[];
  instructions: string;
}

/**
 * Request for architecture learning from project skeleton.
 */
export interface LLMLearnRequest {
  /** Project skeleton as formatted YAML string */
  skeletonYaml: string;
  /** Additional context or hints from user */
  userHints?: string;
  /** Existing registry content (for incremental learning) */
  existingRegistry?: string;
}

/**
 * Response from architecture learning.
 */
export interface LLMLearnResponse {
  /** Generated registry YAML content */
  registryYaml: string;
  /** LLM's explanation of the architecture */
  explanation: string;
  /** Suggested next steps */
  suggestions: string[];
  /** Confidence level (0-1) */
  confidence: number;
  /** Token usage if available */
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };
  /** Error message if failed */
  error?: string;
}
