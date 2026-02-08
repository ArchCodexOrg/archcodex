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
  PromptProvider: vi.fn(function() {
    return {
    formatVerificationPrompt: vi.fn().mockReturnValue('Verification prompt output'),
    isAvailable: vi.fn().mockReturnValue(true),
  };
  }),
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

describe('verifyFile - hint pattern coverage', () => {
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
    vi.mocked(parseArchTags).mockReturnValue({
      archTag: { archId: 'test.arch', inlineMixins: [] },
      overrides: [],
      intents: [],
    });
  });

  // Helper to set up hints and capture the verification request
  function setupWithHints(hintTexts: string[]) {
    vi.mocked(resolveArchitecture).mockReturnValue({
      architecture: {
        archId: 'test.arch',
        inheritanceChain: ['test.arch'],
        appliedMixins: [],
        constraints: [],
        hints: hintTexts.map(text => ({ text })),
        pointers: [],
      },
      conflicts: [],
    });

    const mockVerify = vi.fn().mockResolvedValue({
      passed: true,
      provider: 'test',
      results: hintTexts.map(hint => ({ hint, passed: true, confidence: 0.9, reasoning: 'OK' })),
    });
    vi.mocked(getAvailableProvider).mockReturnValue({
      isAvailable: () => true,
      verify: mockVerify,
      generateKeywords: vi.fn(),
    });

    return mockVerify;
  }

  it('should generate question for "redact X before logging" pattern', async () => {
    const mockVerify = setupWithHints(['redact passwords before logging']);
    await verifyFile('/test/file.ts', mockRegistry);

    const request = mockVerify.mock.calls[0][0];
    expect(request.checks[0].question).toContain('redact');
    expect(request.checks[0].question).toContain('passwords');
  });

  it('should generate question for "use X pattern" pattern', async () => {
    const mockVerify = setupWithHints(['use factory pattern for services']);
    await verifyFile('/test/file.ts', mockRegistry);

    const request = mockVerify.mock.calls[0][0];
    expect(request.checks[0].question).toContain('factory');
    expect(request.checks[0].question).toContain('pattern');
  });

  it('should generate question for "must do X" pattern (without not)', async () => {
    const mockVerify = setupWithHints(['must validate all input']);
    await verifyFile('/test/file.ts', mockRegistry);

    const request = mockVerify.mock.calls[0][0];
    expect(request.checks[0].question).toContain('validate all input');
    expect(request.checks[0].question).not.toContain('avoid');
  });

  it('should generate question for "must not X" pattern (with not)', async () => {
    const mockVerify = setupWithHints(['must not use global state']);
    await verifyFile('/test/file.ts', mockRegistry);

    const request = mockVerify.mock.calls[0][0];
    expect(request.checks[0].question).toContain('avoid');
    expect(request.checks[0].question).toContain('use global state');
  });

  it('should generate question for "prefer X over Y" pattern', async () => {
    const mockVerify = setupWithHints(['prefer composition over inheritance']);
    await verifyFile('/test/file.ts', mockRegistry);

    const request = mockVerify.mock.calls[0][0];
    expect(request.checks[0].question).toContain('composition');
    expect(request.checks[0].question).toContain('inheritance');
  });

  it('should generate question for "avoid X" pattern', async () => {
    const mockVerify = setupWithHints(['avoid mutable state']);
    await verifyFile('/test/file.ts', mockRegistry);

    const request = mockVerify.mock.calls[0][0];
    expect(request.checks[0].question).toContain('avoid');
    expect(request.checks[0].question).toContain('mutable state');
  });

  it('should generate question for "always X" pattern', async () => {
    const mockVerify = setupWithHints(['always use const declarations']);
    await verifyFile('/test/file.ts', mockRegistry);

    const request = mockVerify.mock.calls[0][0];
    expect(request.checks[0].question).toContain('always');
    expect(request.checks[0].question).toContain('use const declarations');
  });

  it('should generate question for "never X" pattern', async () => {
    const mockVerify = setupWithHints(['never use any type']);
    await verifyFile('/test/file.ts', mockRegistry);

    const request = mockVerify.mock.calls[0][0];
    expect(request.checks[0].question).toContain('avoid');
    expect(request.checks[0].question).toContain('use any type');
  });

  it('should generate default question for non-matching hint', async () => {
    const mockVerify = setupWithHints(['Keep functions pure and simple']);
    await verifyFile('/test/file.ts', mockRegistry);

    const request = mockVerify.mock.calls[0][0];
    expect(request.checks[0].question).toContain('comply with the following hint');
    expect(request.checks[0].question).toContain('Keep functions pure and simple');
  });

  it('should handle multiple hints with different patterns', async () => {
    const mockVerify = setupWithHints([
      'always validate input',
      'never use eval',
      'Keep it simple',
    ]);
    await verifyFile('/test/file.ts', mockRegistry);

    const request = mockVerify.mock.calls[0][0];
    expect(request.checks).toHaveLength(3);
    expect(request.checks[0].question).toContain('always');
    expect(request.checks[1].question).toContain('avoid');
    expect(request.checks[2].question).toContain('comply with the following hint');
  });
});

describe('verifyFiles - edge cases', () => {
  let mockRegistry: Registry;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRegistry = {
      nodes: { base: { description: 'Base' } },
      mixins: {},
    };
  });

  it('should return empty array for empty file list', async () => {
    const results = await verifyFiles([], mockRegistry);
    expect(results).toHaveLength(0);
  });

  it('should continue processing after first file error', async () => {
    vi.mocked(readFile)
      .mockRejectedValueOnce(new Error('File not found'))
      .mockResolvedValueOnce('/**\n * @arch test.arch\n */\nconst x = 1;');
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

    const results = await verifyFiles(['/test/missing.ts', '/test/exists.ts'], mockRegistry);

    expect(results).toHaveLength(2);
    expect(results[0].staticPassed).toBe(false);
    expect(results[1].staticPassed).toBe(true);
  });
});

describe('formatVerificationResult', () => {
  it('should format result with no archId', () => {
    const result = {
      filePath: '/test/file.ts',
      archId: null,
      staticPassed: false,
    };

    const formatted = formatVerificationResult(result);

    expect(formatted).toContain('/test/file.ts');
    expect(formatted).toContain('none');
  });

  it('should format verification error', () => {
    const result = {
      filePath: '/test/file.ts',
      archId: 'test.arch',
      staticPassed: true,
      llmVerification: {
        passed: false,
        provider: 'openai',
        error: 'API rate limit exceeded',
        results: [],
      },
    };

    const formatted = formatVerificationResult(result);

    expect(formatted).toContain('Error: API rate limit exceeded');
  });

  it('should include token usage when present', () => {
    const result = {
      filePath: '/test/file.ts',
      archId: 'test.arch',
      staticPassed: true,
      llmVerification: {
        passed: true,
        provider: 'openai',
        results: [{ hint: 'Keep pure', passed: true, confidence: 0.95, reasoning: 'OK' }],
        tokenUsage: { input: 150, output: 50, total: 200 },
      },
    };

    const formatted = formatVerificationResult(result);

    expect(formatted).toContain('Tokens: 200');
    expect(formatted).toContain('150 in');
    expect(formatted).toContain('50 out');
  });

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
