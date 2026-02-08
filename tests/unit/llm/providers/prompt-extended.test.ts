/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Extended tests for PromptProvider - targeting uncovered methods and branches.
 */
import { describe, it, expect, vi } from 'vitest';
import { PromptProvider } from '../../../../src/llm/providers/prompt.js';
import type { VerificationRequest, ReindexRequest, LLMLearnRequest, PromptOutput } from '../../../../src/llm/types.js';

vi.mock('../../../../src/llm/learn-prompts.js', () => ({
  buildLearnInstructions: vi.fn().mockReturnValue('Learn instructions'),
  formatLearnPromptForDisplay: vi.fn().mockReturnValue('Formatted learn prompt'),
}));

describe('PromptProvider - extended coverage', () => {
  describe('verify with output callback', () => {
    it('calls output callback with verification output', async () => {
      const callback = vi.fn();
      const provider = new PromptProvider(callback);
      const request: VerificationRequest = {
        filePath: '/test/file.ts',
        archId: 'test.arch',
        content: 'const x = 1;',
        checks: [
          { hint: 'Follow SRP', question: 'Is it SRP?', context: 'Has multiple functions' },
          { hint: 'No any type', question: 'Uses any type?' },
        ],
      };

      await provider.verify(request);

      expect(callback).toHaveBeenCalledOnce();
      const output: PromptOutput = callback.mock.calls[0][0];
      expect(output.type).toBe('verification');
      expect(output.filePath).toBe('/test/file.ts');
      expect(output.archId).toBe('test.arch');
      expect(output.prompts).toHaveLength(2);
      expect(output.instructions).toBeDefined();
    });

    it('returns placeholder results for all checks', async () => {
      const provider = new PromptProvider();
      const request: VerificationRequest = {
        filePath: '/test/file.ts',
        archId: 'test.arch',
        content: 'code',
        checks: [
          { hint: 'Hint 1', question: 'Q1' },
          { hint: 'Hint 2', question: 'Q2' },
          { hint: 'Hint 3', question: 'Q3' },
        ],
      };

      const result = await provider.verify(request);

      expect(result.results).toHaveLength(3);
      expect(result.results[0].hint).toBe('Hint 1');
      expect(result.results[0].passed).toBe(true);
      expect(result.results[0].confidence).toBe('low');
      expect(result.results[0].reasoning).toBe('Awaiting external verification');
    });

    it('includes context in prompts when provided', async () => {
      const callback = vi.fn();
      const provider = new PromptProvider(callback);
      const request: VerificationRequest = {
        filePath: '/test.ts',
        archId: 'test',
        content: 'code',
        checks: [
          { hint: 'SRP', question: 'Is SRP?', context: 'File has 3 classes' },
        ],
      };

      await provider.verify(request);

      const output: PromptOutput = callback.mock.calls[0][0];
      expect(output.prompts[0]).toContain('Context');
      expect(output.prompts[0]).toContain('File has 3 classes');
    });
  });

  describe('generateKeywords with output callback', () => {
    it('calls output callback with reindex output', async () => {
      const callback = vi.fn();
      const provider = new PromptProvider(callback);
      const request: ReindexRequest = {
        archId: 'test.service',
        description: 'A service architecture',
      };

      await provider.generateKeywords(request);

      expect(callback).toHaveBeenCalledOnce();
      const output: PromptOutput = callback.mock.calls[0][0];
      expect(output.type).toBe('reindex');
      expect(output.archId).toBe('test.service');
      expect(output.prompts).toHaveLength(1);
      expect(output.instructions).toContain('5-10 keywords');
    });

    it('returns empty keywords array', async () => {
      const provider = new PromptProvider();
      const request: ReindexRequest = {
        archId: 'test.arch',
        description: 'Test',
      };

      const result = await provider.generateKeywords(request);

      expect(result.archId).toBe('test.arch');
      expect(result.keywords).toEqual([]);
    });
  });

  describe('learn', () => {
    it('calls output callback with learn output', async () => {
      const callback = vi.fn();
      const provider = new PromptProvider(callback);
      const request: LLMLearnRequest = {
        projectRoot: '/test',
        files: ['src/a.ts', 'src/b.ts'],
        skeletonYaml: 'skeleton:\n  nodes: {}',
        hasExistingRegistry: false,
      };

      await provider.learn(request);

      expect(callback).toHaveBeenCalledOnce();
      const output: PromptOutput = callback.mock.calls[0][0];
      expect(output.type).toBe('learn');
      expect(output.prompts[0]).toBe('skeleton:\n  nodes: {}');
    });

    it('returns placeholder response', async () => {
      const provider = new PromptProvider();
      const request: LLMLearnRequest = {
        projectRoot: '/test',
        files: [],
        skeletonYaml: 'yaml',
        hasExistingRegistry: false,
      };

      const result = await provider.learn(request);

      expect(result.registryYaml).toBe('');
      expect(result.explanation).toBe('Awaiting external generation');
      expect(result.suggestions).toEqual([]);
      expect(result.confidence).toBe(0);
    });
  });

  describe('generate', () => {
    it('throws error - not supported', async () => {
      const provider = new PromptProvider();

      await expect(provider.generate('prompt')).rejects.toThrow(
        'PromptProvider cannot generate text directly'
      );
    });
  });

  describe('formatLearnPrompt', () => {
    it('delegates to formatLearnPromptForDisplay', () => {
      const provider = new PromptProvider();
      const request: LLMLearnRequest = {
        projectRoot: '/test',
        files: [],
        skeletonYaml: 'yaml',
        hasExistingRegistry: false,
      };

      const result = provider.formatLearnPrompt(request);

      expect(result).toBe('Formatted learn prompt');
    });
  });

  describe('formatVerificationPrompt', () => {
    it('formats a complete verification prompt', () => {
      const provider = new PromptProvider();
      const request: VerificationRequest = {
        filePath: '/src/test.ts',
        archId: 'core.engine',
        content: 'function doSomething() { return 42; }',
        checks: [
          { hint: 'Pure functions', question: 'Are functions pure?', context: 'No side effects expected' },
          { hint: 'No any', question: 'Uses any?' },
        ],
      };

      const result = provider.formatVerificationPrompt(request);

      expect(result).toContain('ARCHCODEX VERIFICATION REQUEST');
      expect(result).toContain('File: /src/test.ts');
      expect(result).toContain('Architecture: core.engine');
      expect(result).toContain('function doSomething()');
      expect(result).toContain('VERIFICATION CHECKS');
      expect(result).toContain('1. **Pure functions**');
      expect(result).toContain('Question: Are functions pure?');
      expect(result).toContain('Context: No side effects expected');
      expect(result).toContain('2. **No any**');
      expect(result).toContain('INSTRUCTIONS');
      expect(result).toContain('PASS');
      expect(result).toContain('FAIL');
      expect(result).toContain('UNSURE');
    });
  });

  describe('formatReindexPrompt', () => {
    it('formats a complete reindex prompt', () => {
      const provider = new PromptProvider();
      const request: ReindexRequest = {
        archId: 'archcodex.core.engine',
        description: 'Application layer orchestrators',
        hints: ['Use composition', 'Keep focused API'],
        constraints: ['forbid: commander', 'max methods: 10'],
      };

      const result = provider.formatReindexPrompt(request);

      expect(result).toContain('ARCHCODEX REINDEX REQUEST');
      expect(result).toContain('Architecture: archcodex.core.engine');
      expect(result).toContain('Description: Application layer orchestrators');
      expect(result).toContain('Hints:');
      expect(result).toContain('  - Use composition');
      expect(result).toContain('  - Keep focused API');
      expect(result).toContain('Constraints:');
      expect(result).toContain('  - forbid: commander');
      expect(result).toContain('Generate 5-10 keywords');
    });

    it('omits hints section when no hints', () => {
      const provider = new PromptProvider();
      const request: ReindexRequest = {
        archId: 'test.arch',
        description: 'Test',
      };

      const result = provider.formatReindexPrompt(request);

      expect(result).not.toContain('Hints:');
    });

    it('omits constraints section when no constraints', () => {
      const provider = new PromptProvider();
      const request: ReindexRequest = {
        archId: 'test.arch',
        description: 'Test',
        hints: ['Hint'],
      };

      const result = provider.formatReindexPrompt(request);

      expect(result).not.toContain('Constraints:');
    });
  });
});
