/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the LLM verifier module.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyFile, verifyFiles, formatVerificationResult } from '../../../src/llm/verifier.js';
import type { Registry } from '../../../src/core/registry/schema.js';

// Mock dependencies
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('../../../src/core/arch-tag/parser.js', () => ({
  parseArchTags: vi.fn(),
}));

vi.mock('../../../src/core/registry/resolver.js', () => ({
  resolveArchitecture: vi.fn(),
}));

vi.mock('../../../src/llm/providers/index.js', () => ({
  createProviderFromSettings: vi.fn(),
  getAvailableProvider: vi.fn(),
}));

vi.mock('../../../src/llm/providers/prompt.js', () => ({
  PromptProvider: vi.fn().mockImplementation(() => ({
    formatVerificationPrompt: vi.fn().mockReturnValue('Verification prompt output'),
    isAvailable: vi.fn().mockReturnValue(true),
  })),
}));

import { readFile } from 'fs/promises';
import { parseArchTags } from '../../../src/core/arch-tag/parser.js';
import { resolveArchitecture } from '../../../src/core/registry/resolver.js';
import { getAvailableProvider } from '../../../src/llm/providers/index.js';

describe('Verifier', () => {
  it('should export verifyFile function', () => {
    expect(typeof verifyFile).toBe('function');
  });

  it('should export verifyFiles function', () => {
    expect(typeof verifyFiles).toBe('function');
  });

  it('should export formatVerificationResult function', () => {
    expect(typeof formatVerificationResult).toBe('function');
  });
});

describe('verifyFile', () => {
  let mockRegistry: Registry;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRegistry = {
      nodes: {
        base: { description: 'Base' },
        'test.arch': { description: 'Test', inherits: 'base' },
      },
      mixins: {},
    };

    vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */\nconst x = 1;');
  });

  it('should return null archId when no @arch tag found', async () => {
    vi.mocked(parseArchTags).mockReturnValue({
      archTag: null,
      overrides: [],
      intents: [],
    });

    const result = await verifyFile('/test/file.ts', mockRegistry);

    expect(result.archId).toBeNull();
    expect(result.staticPassed).toBe(false);
  });

  it('should return success when file has no hints', async () => {
    vi.mocked(parseArchTags).mockReturnValue({
      archTag: { archId: 'test.arch', inlineMixins: [] },
      overrides: [],
      intents: [],
    });
    vi.mocked(resolveArchitecture).mockReturnValue({
      architecture: {
        archId: 'test.arch',
        inheritanceChain: ['test.arch'],
        appliedMixins: [],
        constraints: [],
        hints: [],
        pointers: [],
      },
      conflicts: [],
    });

    const result = await verifyFile('/test/file.ts', mockRegistry);

    expect(result.archId).toBe('test.arch');
    expect(result.staticPassed).toBe(true);
    expect(result.llmVerification).toBeUndefined();
  });

  it('should output prompt when outputPrompt option is true', async () => {
    vi.mocked(parseArchTags).mockReturnValue({
      archTag: { archId: 'test.arch', inlineMixins: [] },
      overrides: [],
      intents: [],
    });
    vi.mocked(resolveArchitecture).mockReturnValue({
      architecture: {
        archId: 'test.arch',
        inheritanceChain: ['test.arch'],
        appliedMixins: [],
        constraints: [],
        hints: [{ text: 'Keep functions pure' }],
        pointers: [],
      },
      conflicts: [],
    });

    const result = await verifyFile('/test/file.ts', mockRegistry, { outputPrompt: true });

    expect(result.promptOutput).toBe('Verification prompt output');
  });

  it('should output prompt when provider is prompt', async () => {
    vi.mocked(parseArchTags).mockReturnValue({
      archTag: { archId: 'test.arch', inlineMixins: [] },
      overrides: [],
      intents: [],
    });
    vi.mocked(resolveArchitecture).mockReturnValue({
      architecture: {
        archId: 'test.arch',
        inheritanceChain: ['test.arch'],
        appliedMixins: [],
        constraints: [],
        hints: [{ text: 'Keep functions pure' }],
        pointers: [],
      },
      conflicts: [],
    });

    const result = await verifyFile('/test/file.ts', mockRegistry, { provider: 'prompt' });

    expect(result.promptOutput).toBe('Verification prompt output');
  });

  it('should fall back to prompt when no provider is available', async () => {
    vi.mocked(parseArchTags).mockReturnValue({
      archTag: { archId: 'test.arch', inlineMixins: [] },
      overrides: [],
      intents: [],
    });
    vi.mocked(resolveArchitecture).mockReturnValue({
      architecture: {
        archId: 'test.arch',
        inheritanceChain: ['test.arch'],
        appliedMixins: [],
        constraints: [],
        hints: [{ text: 'Keep functions pure' }],
        pointers: [],
      },
      conflicts: [],
    });
    vi.mocked(getAvailableProvider).mockReturnValue({
      isAvailable: () => false,
      verify: vi.fn(),
      generateKeywords: vi.fn(),
    });

    const result = await verifyFile('/test/file.ts', mockRegistry);

    expect(result.promptOutput).toBe('Verification prompt output');
  });

  it('should use LLM provider when available', async () => {
    vi.mocked(parseArchTags).mockReturnValue({
      archTag: { archId: 'test.arch', inlineMixins: [] },
      overrides: [],
      intents: [],
    });
    vi.mocked(resolveArchitecture).mockReturnValue({
      architecture: {
        archId: 'test.arch',
        inheritanceChain: ['test.arch'],
        appliedMixins: [],
        constraints: [],
        hints: [{ text: 'Keep functions pure' }],
        pointers: [],
      },
      conflicts: [],
    });

    const mockVerify = vi.fn().mockResolvedValue({
      passed: true,
      results: [{ hint: 'Keep functions pure', status: 'passed' }],
    });
    vi.mocked(getAvailableProvider).mockReturnValue({
      isAvailable: () => true,
      verify: mockVerify,
      generateKeywords: vi.fn(),
    });

    const result = await verifyFile('/test/file.ts', mockRegistry);

    expect(result.llmVerification).toBeDefined();
    expect(result.llmVerification?.passed).toBe(true);
  });
});

describe('verifyFiles', () => {
  let mockRegistry: Registry;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRegistry = {
      nodes: {
        base: { description: 'Base' },
        'test.arch': { description: 'Test', inherits: 'base' },
      },
      mixins: {},
    };

    vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */\nconst x = 1;');
  });

  it('should verify multiple files', async () => {
    vi.mocked(parseArchTags).mockReturnValue({
      archTag: { archId: 'test.arch', inlineMixins: [] },
      overrides: [],
      intents: [],
    });
    vi.mocked(resolveArchitecture).mockReturnValue({
      architecture: {
        archId: 'test.arch',
        inheritanceChain: ['test.arch'],
        appliedMixins: [],
        constraints: [],
        hints: [],
        pointers: [],
      },
      conflicts: [],
    });

    const results = await verifyFiles(['/test/a.ts', '/test/b.ts'], mockRegistry);

    expect(results).toHaveLength(2);
    expect(results[0].staticPassed).toBe(true);
    expect(results[1].staticPassed).toBe(true);
  });

  it('should handle errors for individual files', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('File not found'));

    const results = await verifyFiles(['/test/missing.ts'], mockRegistry);

    expect(results).toHaveLength(1);
    expect(results[0].staticPassed).toBe(false);
  });
});

describe('formatVerificationResult', () => {
  it('should format successful verification result', () => {
    const result = {
      filePath: '/test/file.ts',
      archId: 'test.arch',
      staticPassed: true,
      llmVerification: {
        passed: true,
        provider: 'openai',
        results: [{ hint: 'Keep pure', passed: true, confidence: 0.95, reasoning: 'All functions are pure' }],
      },
    };

    const formatted = formatVerificationResult(result);

    expect(formatted).toContain('test.arch');
    expect(formatted).toContain('[PASS]');
    expect(formatted).toContain('Keep pure');
  });

  it('should format failed verification result', () => {
    const result = {
      filePath: '/test/file.ts',
      archId: 'test.arch',
      staticPassed: true,
      llmVerification: {
        passed: false,
        provider: 'openai',
        results: [{ hint: 'Keep pure', passed: false, confidence: 0.8, reasoning: 'Function has side effects' }],
      },
    };

    const formatted = formatVerificationResult(result);

    expect(formatted).toContain('[FAIL]');
    expect(formatted).toContain('Function has side effects');
  });

  it('should handle prompt output', () => {
    const result = {
      filePath: '/test/file.ts',
      archId: 'test.arch',
      staticPassed: true,
      promptOutput: 'This is the prompt',
    };

    const formatted = formatVerificationResult(result);

    expect(formatted).toContain('This is the prompt');
  });
});
