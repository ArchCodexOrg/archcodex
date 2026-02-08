/**
 * @arch archcodex.test.unit
 *
 * Tests for prompt-builder module.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UnifiedContext, UnifiedModuleContext } from '../../../../src/core/unified-context/types.js';

// Mock the synthesizer
vi.mock('../../../../src/core/unified-context/synthesizer.js', () => ({
  synthesizeUnifiedContext: vi.fn(),
}));

import { synthesizeUnifiedContext } from '../../../../src/core/unified-context/synthesizer.js';
import {
  buildPrompt,
  buildMultiModulePrompt,
  getCompactContext,
  formatCompactContext,
} from '../../../../src/core/unified-context/prompt-builder.js';

const mockSynthesizeUnifiedContext = vi.mocked(synthesizeUnifiedContext);

// Sample module context for testing
const createMockModuleContext = (overrides: Partial<UnifiedModuleContext> = {}): UnifiedModuleContext => ({
  modulePath: 'src/core/db/',
  fileCount: 9,
  lineCount: 1500,
  entityCount: 3,
  files: {
    defines: [
      { path: 'types.ts', archId: 'archcodex.core.types', role: 'defines', roleReason: 'type definitions', breaks: 5 },
      { path: 'schema.ts', archId: 'archcodex.core.types', role: 'defines', roleReason: 'schema definitions', breaks: 3 },
    ],
    implements: [
      { path: 'manager.ts', archId: 'archcodex.core.engine', role: 'implements', roleReason: 'core logic', breaks: 2 },
      { path: 'repository.ts', archId: 'archcodex.core.engine', role: 'implements', roleReason: 'data access', breaks: 1 },
    ],
    orchestrates: [
      { path: 'scanner.ts', archId: 'archcodex.core.engine', role: 'orchestrates', roleReason: 'coordinates', breaks: 0 },
    ],
  },
  boundaries: {
    layer: 'core',
    canImport: ['utils', 'validators'],
    cannotImport: ['cli', 'mcp', 'llm'],
  },
  entities: [],
  consumers: [
    { path: 'src/cli/commands/db.ts', archId: 'archcodex.cli.command' },
    { path: 'src/mcp/handlers/db.ts', archId: 'archcodex.cli.mcp.handler' },
  ],
  archcodex: {
    architecture: 'archcodex.core.engine',
    forbid: ['commander', 'chalk', 'ora'],
    patterns: ['console' + '.log', 'explicit any'], // Split to avoid archcodex pattern detection
    require: undefined,
    hints: ['Core modules should be framework-agnostic', '[DIP] Import interfaces, not implementations'],
  },
  requestedSections: ['boundaries', 'constraints', 'modification-order'],
  ...overrides,
});

describe('Prompt Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('formatCompactContext', () => {
    it('should format module context in compact form', () => {
      const context = createMockModuleContext();
      const result = formatCompactContext(context);

      expect(result).toContain('## Context: src/core/db/');
      // Multiple arch tags in mock data, so shows the tag list format
      expect(result).toContain('@arch tags in this module:');
      expect(result).toContain('archcodex.core.types');
      expect(result).toContain('archcodex.core.engine');
    });

    it('should include layer boundaries', () => {
      const context = createMockModuleContext();
      const result = formatCompactContext(context);

      expect(result).toContain('Layer: core');
      expect(result).toContain('CAN import from: [utils, validators]');
      expect(result).toContain('CANNOT import from: [cli, mcp, llm]');
    });

    it('should include forbid and patterns combined', () => {
      const context = createMockModuleContext();
      const result = formatCompactContext(context);

      expect(result).toContain('Forbidden');
      expect(result).toContain('commander');
      expect(result).toContain('chalk');
      expect(result).toContain('console' + '.log');
    });

    it('should include modification order', () => {
      const context = createMockModuleContext();
      const result = formatCompactContext(context);

      expect(result).toContain('Modification order');
      expect(result).toContain('types.ts');
      expect(result).toContain('→');
    });

    it('should include consumer count when present', () => {
      const context = createMockModuleContext();
      const result = formatCompactContext(context);

      expect(result).toContain('Impact: 2 files depend on this module');
    });

    it('should include first hint', () => {
      const context = createMockModuleContext();
      const result = formatCompactContext(context);

      expect(result).toContain('Hint: Core modules should be framework-agnostic');
    });

    it('should handle missing boundaries gracefully', () => {
      const context = createMockModuleContext({ boundaries: undefined });
      const result = formatCompactContext(context);

      expect(result).not.toContain('Layer:');
      // Still shows arch tags from files
      expect(result).toContain('@arch tags in this module:');
    });

    it('should handle empty files gracefully', () => {
      const context = createMockModuleContext({
        files: { defines: [], implements: [], orchestrates: [] },
      });
      const result = formatCompactContext(context);

      expect(result).not.toContain('Modification order');
    });

    it('should handle missing forbid and patterns', () => {
      const context = createMockModuleContext({
        archcodex: {
          architecture: 'archcodex.core.engine',
          forbid: undefined,
          patterns: undefined,
          hints: undefined,
        },
      });
      const result = formatCompactContext(context);

      expect(result).not.toContain('Forbidden');
      expect(result).not.toContain('Hint:');
    });

    it('should include require constraints when present', () => {
      const context = createMockModuleContext({
        archcodex: {
          ...createMockModuleContext().archcodex,
          require: ['commander', '@arch tag'],
        },
      });
      const result = formatCompactContext(context);

      expect(result).toContain('Required (must import from these):');
      expect(result).toContain('commander, @arch tag');
    });

    it('should handle no consumers', () => {
      const context = createMockModuleContext({ consumers: [] });
      const result = formatCompactContext(context);

      expect(result).not.toContain('Impact:');
    });
  });

  describe('buildPrompt', () => {
    it('should return null when no context found', async () => {
      mockSynthesizeUnifiedContext.mockResolvedValue(null);

      const result = await buildPrompt('/project', 'src/nonexistent/', {
        task: 'Do something',
      });

      expect(result).toBeNull();
    });

    it('should return null when module context is missing', async () => {
      mockSynthesizeUnifiedContext.mockResolvedValue({
        query: { type: 'module', target: 'src/test/' },
        module: undefined,
      } as UnifiedContext);

      const result = await buildPrompt('/project', 'src/test/', {
        task: 'Do something',
      });

      expect(result).toBeNull();
    });

    it('should build prompt with context for sonnet (default)', async () => {
      const mockContext = createMockModuleContext();
      mockSynthesizeUnifiedContext.mockResolvedValue({
        query: { type: 'module', target: 'src/core/db/' },
        module: mockContext,
      });

      const result = await buildPrompt('/project', 'src/core/db/', {
        task: 'Add getById method',
      });

      expect(result).not.toBeNull();
      expect(result!.prompt).toContain('## Context:');
      expect(result!.prompt).toContain('## Task');
      expect(result!.prompt).toContain('Add getById method');
      expect(result!.prompt).not.toContain('REQUIRED'); // Sonnet uses softer language
    });

    it('should build prompt with explicit MUST language for haiku', async () => {
      const mockContext = createMockModuleContext();
      mockSynthesizeUnifiedContext.mockResolvedValue({
        query: { type: 'module', target: 'src/core/db/' },
        module: mockContext,
      });

      const result = await buildPrompt('/project', 'src/core/db/', {
        model: 'haiku',
        task: 'Add getById method',
      });

      expect(result).not.toBeNull();
      expect(result!.prompt).toContain('## Task (REQUIRED)');
      expect(result!.prompt).toContain('## Requirements (MUST follow)');
      expect(result!.prompt).toContain('DO NOT import from "CANNOT import" layers');
    });

    it('should include additional requirements', async () => {
      const mockContext = createMockModuleContext();
      mockSynthesizeUnifiedContext.mockResolvedValue({
        query: { type: 'module', target: 'src/core/db/' },
        module: mockContext,
      });

      const result = await buildPrompt('/project', 'src/core/db/', {
        model: 'haiku',
        task: 'Add method',
        requirements: ['Must return Promise', 'Add JSDoc'],
      });

      expect(result!.prompt).toContain('Must return Promise');
      expect(result!.prompt).toContain('Add JSDoc');
    });

    it('should include validation reminder by default', async () => {
      const mockContext = createMockModuleContext();
      mockSynthesizeUnifiedContext.mockResolvedValue({
        query: { type: 'module', target: 'src/core/db/' },
        module: mockContext,
      });

      const result = await buildPrompt('/project', 'src/core/db/', {
        task: 'Add method',
      });

      expect(result!.prompt).toContain('validated against architectural constraints');
    });

    it('should omit validation reminder when disabled', async () => {
      const mockContext = createMockModuleContext();
      mockSynthesizeUnifiedContext.mockResolvedValue({
        query: { type: 'module', target: 'src/core/db/' },
        module: mockContext,
      });

      const result = await buildPrompt('/project', 'src/core/db/', {
        task: 'Add method',
        includeValidation: false,
      });

      // Should not contain validation reminder (but may contain "violations" in context)
      expect(result!.prompt).not.toContain('validated against architectural constraints');
      expect(result!.prompt).not.toContain('violations will be checked');
    });

    it('should add preview instruction in preview mode', async () => {
      const mockContext = createMockModuleContext();
      mockSynthesizeUnifiedContext.mockResolvedValue({
        query: { type: 'module', target: 'src/core/db/' },
        module: mockContext,
      });

      const result = await buildPrompt('/project', 'src/core/db/', {
        task: 'Add method',
        outputMode: 'preview',
      });

      expect(result!.prompt).toContain('Do NOT write code to the filesystem');
    });

    it('should return correct metadata', async () => {
      const mockContext = createMockModuleContext();
      mockSynthesizeUnifiedContext.mockResolvedValue({
        query: { type: 'module', target: 'src/core/db/' },
        module: mockContext,
      });

      const result = await buildPrompt('/project', 'src/core/db/', {
        task: 'Add method',
      });

      expect(result!.modulePath).toBe('src/core/db/');
      expect(result!.archTag).toBe('archcodex.core.engine');
      expect(result!.contextTokens).toBeGreaterThan(0);
    });

    it('should call synthesizer with correct options', async () => {
      mockSynthesizeUnifiedContext.mockResolvedValue(null);

      await buildPrompt('/project', 'src/core/db/', { task: 'test' });

      expect(mockSynthesizeUnifiedContext).toHaveBeenCalledWith('/project', {
        module: 'src/core/db/',
        confirm: true,
        sections: ['boundaries', 'constraints', 'modification-order'],
      });
    });
  });

  describe('buildMultiModulePrompt', () => {
    it('should return null when no contexts found', async () => {
      mockSynthesizeUnifiedContext.mockResolvedValue(null);

      const result = await buildMultiModulePrompt('/project', ['src/a/', 'src/b/'], {
        task: 'Refactor',
      });

      expect(result).toBeNull();
    });

    it('should combine multiple module contexts', async () => {
      const mockContext1 = createMockModuleContext({ modulePath: 'src/core/' });
      const mockContext2 = createMockModuleContext({
        modulePath: 'src/cli/',
        archcodex: { architecture: 'archcodex.cli.command' },
        boundaries: { layer: 'cli', canImport: ['core', 'utils'], cannotImport: ['mcp'] },
      });

      mockSynthesizeUnifiedContext
        .mockResolvedValueOnce({
          query: { type: 'module', target: 'src/core/' },
          module: mockContext1,
        })
        .mockResolvedValueOnce({
          query: { type: 'module', target: 'src/cli/' },
          module: mockContext2,
        });

      const result = await buildMultiModulePrompt('/project', ['src/core/', 'src/cli/'], {
        task: 'Refactor shared code',
      });

      expect(result).not.toBeNull();
      expect(result!.prompt).toContain('src/core/');
      expect(result!.prompt).toContain('src/cli/');
      expect(result!.prompt).toContain('---'); // Separator between contexts
    });

    it('should skip modules that fail to load', async () => {
      const mockContext = createMockModuleContext();
      mockSynthesizeUnifiedContext
        .mockResolvedValueOnce({
          query: { type: 'module', target: 'src/core/' },
          module: mockContext,
        })
        .mockResolvedValueOnce(null);

      const result = await buildMultiModulePrompt('/project', ['src/core/', 'src/bad/'], {
        task: 'Refactor',
      });

      expect(result).not.toBeNull();
      expect(result!.prompt).toContain('src/core/');
      expect(result!.modulePath).toBe('src/core/, src/bad/');
    });

    it('should aggregate token counts', async () => {
      const mockContext1 = createMockModuleContext({ modulePath: 'src/a/' });
      const mockContext2 = createMockModuleContext({ modulePath: 'src/b/' });

      mockSynthesizeUnifiedContext
        .mockResolvedValueOnce({
          query: { type: 'module', target: 'src/a/' },
          module: mockContext1,
        })
        .mockResolvedValueOnce({
          query: { type: 'module', target: 'src/b/' },
          module: mockContext2,
        });

      const result = await buildMultiModulePrompt('/project', ['src/a/', 'src/b/'], {
        task: 'Refactor',
      });

      // Token count should be roughly double a single module
      expect(result!.contextTokens).toBeGreaterThan(100);
    });

    it('should combine arch tags', async () => {
      const mockContext1 = createMockModuleContext({
        modulePath: 'src/core/',
        archcodex: { architecture: 'archcodex.core.engine' },
      });
      const mockContext2 = createMockModuleContext({
        modulePath: 'src/cli/',
        archcodex: { architecture: 'archcodex.cli.command' },
      });

      mockSynthesizeUnifiedContext
        .mockResolvedValueOnce({
          query: { type: 'module', target: 'src/core/' },
          module: mockContext1,
        })
        .mockResolvedValueOnce({
          query: { type: 'module', target: 'src/cli/' },
          module: mockContext2,
        });

      const result = await buildMultiModulePrompt('/project', ['src/core/', 'src/cli/'], {
        task: 'Refactor',
      });

      expect(result!.archTag).toContain('archcodex.core.engine');
      expect(result!.archTag).toContain('archcodex.cli.command');
    });
  });

  describe('getCompactContext', () => {
    it('should return null when no context found', async () => {
      mockSynthesizeUnifiedContext.mockResolvedValue(null);

      const result = await getCompactContext('/project', 'src/bad/');

      expect(result).toBeNull();
    });

    it('should return just the compact context string', async () => {
      const mockContext = createMockModuleContext();
      mockSynthesizeUnifiedContext.mockResolvedValue({
        query: { type: 'module', target: 'src/core/db/' },
        module: mockContext,
      });

      const result = await getCompactContext('/project', 'src/core/db/');

      expect(result).not.toBeNull();
      expect(result).toContain('## Context:');
      expect(result).toContain('@arch tags in this module:');
      expect(result).not.toContain('## Task'); // No task section
    });
  });

  describe('model-specific formatting', () => {
    const setupMock = () => {
      const mockContext = createMockModuleContext();
      mockSynthesizeUnifiedContext.mockResolvedValue({
        query: { type: 'module', target: 'src/core/db/' },
        module: mockContext,
      });
    };

    it('should use explicit language for haiku', async () => {
      setupMock();

      const result = await buildPrompt('/project', 'src/core/db/', {
        model: 'haiku',
        task: 'Add method',
      });

      expect(result!.prompt).toContain('REQUIRED');
      expect(result!.prompt).toContain('MUST follow');
      expect(result!.prompt).toContain('DO NOT');
    });

    it('should use softer language for opus', async () => {
      setupMock();

      const result = await buildPrompt('/project', 'src/core/db/', {
        model: 'opus',
        task: 'Add method',
      });

      expect(result!.prompt).not.toContain('REQUIRED');
      expect(result!.prompt).not.toContain('MUST follow');
      expect(result!.prompt).toContain('## Task');
    });

    it('should use softer language for sonnet', async () => {
      setupMock();

      const result = await buildPrompt('/project', 'src/core/db/', {
        model: 'sonnet',
        task: 'Add method',
      });

      expect(result!.prompt).not.toContain('REQUIRED');
      expect(result!.prompt).toContain('## Task');
    });

    it('should default to sonnet behavior', async () => {
      setupMock();

      const result = await buildPrompt('/project', 'src/core/db/', {
        task: 'Add method',
      });

      expect(result!.prompt).not.toContain('REQUIRED');
    });

    it('should use different validation message for haiku', async () => {
      setupMock();

      const result = await buildPrompt('/project', 'src/core/db/', {
        model: 'haiku',
        task: 'Add method',
      });

      expect(result!.prompt).toContain('violations will be checked automatically');
    });

    it('should use different validation message for opus/sonnet', async () => {
      setupMock();

      const result = await buildPrompt('/project', 'src/core/db/', {
        model: 'opus',
        task: 'Add method',
      });

      expect(result!.prompt).toContain('validated against architectural constraints');
    });
  });

  describe('requirements handling', () => {
    const setupMock = () => {
      const mockContext = createMockModuleContext();
      mockSynthesizeUnifiedContext.mockResolvedValue({
        query: { type: 'module', target: 'src/core/db/' },
        module: mockContext,
      });
    };

    it('should number requirements for haiku starting at 4', async () => {
      setupMock();

      const result = await buildPrompt('/project', 'src/core/db/', {
        model: 'haiku',
        task: 'Add method',
        requirements: ['First req', 'Second req'],
      });

      expect(result!.prompt).toContain('4. First req');
      expect(result!.prompt).toContain('5. Second req');
    });

    it('should use bullet points for opus requirements', async () => {
      setupMock();

      const result = await buildPrompt('/project', 'src/core/db/', {
        model: 'opus',
        task: 'Add method',
        requirements: ['First req', 'Second req'],
      });

      expect(result!.prompt).toContain('Additional requirements:');
      expect(result!.prompt).toContain('- First req');
      expect(result!.prompt).toContain('- Second req');
    });

    it('should not add requirements section when empty', async () => {
      setupMock();

      const result = await buildPrompt('/project', 'src/core/db/', {
        model: 'opus',
        task: 'Add method',
        requirements: [],
      });

      expect(result!.prompt).not.toContain('Additional requirements:');
    });
  });
});
