/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the HydrationEngine class.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HydrationEngine } from '../../../../src/core/hydration/engine.js';
import type { Config } from '../../../../src/core/config/schema.js';
import type { Registry } from '../../../../src/core/registry/schema.js';

// Mock dependencies
vi.mock('../../../../src/utils/file-system.js', () => ({
  readFile: vi.fn(),
}));

vi.mock('../../../../src/core/arch-tag/parser.js', () => ({
  parseArchTags: vi.fn(),
}));

vi.mock('../../../../src/core/registry/resolver.js', () => ({
  resolveArchitecture: vi.fn(),
}));

import { readFile } from '../../../../src/utils/file-system.js';
import { parseArchTags } from '../../../../src/core/arch-tag/parser.js';
import { resolveArchitecture } from '../../../../src/core/registry/resolver.js';

describe('HydrationEngine', () => {
  let mockConfig: Config;
  let mockRegistry: Registry;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      validation: {},
    } as Config;

    mockRegistry = {
      nodes: {
        base: { description: 'Base' },
        'test.arch': { description: 'Test Architecture', inherits: 'base' },
      },
      mixins: {},
    };
  });

  describe('constructor', () => {
    it('should create a HydrationEngine instance', () => {
      const engine = new HydrationEngine(mockConfig, mockRegistry);
      expect(engine).toBeDefined();
    });
  });

  describe('hydrateFile', () => {
    it('should return untagged result when file has no @arch tag', async () => {
      vi.mocked(readFile).mockResolvedValue('const x = 1;');
      vi.mocked(parseArchTags).mockReturnValue({
        archTag: null,
        overrides: [],
        intents: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts');

      expect(result.header).toContain('NO ARCHITECTURE DEFINED');
      expect(result.truncated).toBe(false);
    });

    it('should hydrate file with @arch tag', async () => {
      const fileContent = '/**\n * @arch test.arch\n */\nconst x = 1;';
      vi.mocked(readFile).mockResolvedValue(fileContent);
      vi.mocked(parseArchTags).mockReturnValue({
        archTag: { archId: 'test.arch', inlineMixins: [] },
        overrides: [],
        intents: [],
      });
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          archId: 'test.arch',
          description: 'Test Architecture',
          inheritanceChain: ['base', 'test.arch'],
          appliedMixins: [],
          constraints: [],
          hints: [],
          pointers: [],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts');

      expect(result.header).toContain('test.arch');
      expect(result.content).toBe(fileContent);
    });

    it('should include inheritance chain in verbose format', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
      vi.mocked(parseArchTags).mockReturnValue({
        archTag: { archId: 'test.arch', inlineMixins: [] },
        overrides: [],
        intents: [],
      });
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          archId: 'test.arch',
          description: 'Test Architecture',
          inheritanceChain: ['base', 'test.arch'],
          appliedMixins: ['tested', 'srp'],
          constraints: [],
          hints: [],
          pointers: [],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { format: 'verbose' });

      expect(result.header).toContain('INHERITANCE');
      expect(result.header).toContain('base → test.arch');
      expect(result.header).toContain('MIXINS');
    });

    it('should include constraints in header', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
      vi.mocked(parseArchTags).mockReturnValue({
        archTag: { archId: 'test.arch', inlineMixins: [] },
        overrides: [],
        intents: [],
      });
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          archId: 'test.arch',
          description: 'Test Architecture',
          inheritanceChain: ['test.arch'],
          appliedMixins: [],
          constraints: [
            {
              rule: 'forbid_import',
              value: ['axios'],
              severity: 'error',
              source: 'test.arch',
              why: 'Use built-in fetch',
            },
          ],
          hints: [],
          pointers: [],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts');

      expect(result.header).toContain('CONSTRAINTS');
      expect(result.header).toContain('forbid_import');
      expect(result.header).toContain('axios');
    });

    it('should include active overrides', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n * @override forbid_import:axios\n * @reason Legacy code\n */');
      vi.mocked(parseArchTags).mockReturnValue({
        archTag: { archId: 'test.arch', inlineMixins: [] },
        overrides: [
          { rule: 'forbid_import', value: 'axios', reason: 'Legacy code', expires: '2025-12-31' },
        ],
        intents: [],
      });
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          archId: 'test.arch',
          description: 'Test Architecture',
          inheritanceChain: ['test.arch'],
          appliedMixins: [],
          constraints: [],
          hints: [],
          pointers: [],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts');

      expect(result.header).toContain('ACTIVE OVERRIDES');
      expect(result.header).toContain('forbid_import:axios');
      expect(result.header).toContain('Legacy code');
    });

    it('should include intents', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n * @intent:cli-output\n */');
      vi.mocked(parseArchTags).mockReturnValue({
        archTag: { archId: 'test.arch', inlineMixins: [] },
        overrides: [],
        intents: [{ name: 'cli-output' }],
      });
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          archId: 'test.arch',
          description: 'Test Architecture',
          inheritanceChain: ['test.arch'],
          appliedMixins: [],
          constraints: [],
          hints: [],
          pointers: [],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts');

      expect(result.header).toContain('INTENTS');
      expect(result.header).toContain('@intent:cli-output');
    });

    it('should include hints in header', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
      vi.mocked(parseArchTags).mockReturnValue({
        archTag: { archId: 'test.arch', inlineMixins: [] },
        overrides: [],
        intents: [],
      });
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          archId: 'test.arch',
          description: 'Test Architecture',
          inheritanceChain: ['test.arch'],
          appliedMixins: [],
          constraints: [],
          hints: [
            { text: 'Keep functions pure' },
            { text: 'Use dependency injection', example: 'arch://examples/di' },
          ],
          pointers: [],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts');

      expect(result.header).toContain('HINTS');
      expect(result.header).toContain('Keep functions pure');
    });

    it('should not include content when includeContent is false', async () => {
      const fileContent = '/**\n * @arch test.arch\n */\nconst x = 1;';
      vi.mocked(readFile).mockResolvedValue(fileContent);
      vi.mocked(parseArchTags).mockReturnValue({
        archTag: { archId: 'test.arch', inlineMixins: [] },
        overrides: [],
        intents: [],
      });
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          archId: 'test.arch',
          description: 'Test Architecture',
          inheritanceChain: ['test.arch'],
          appliedMixins: [],
          constraints: [],
          hints: [],
          pointers: [],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { includeContent: false });

      expect(result.content).toBeUndefined();
      expect(result.output).toBe(result.header);
    });

    it('should generate AI format header', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
      vi.mocked(parseArchTags).mockReturnValue({
        archTag: { archId: 'test.arch', inlineMixins: [] },
        overrides: [],
        intents: [],
      });
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          archId: 'test.arch',
          description: 'Test Architecture',
          inheritanceChain: ['test.arch'],
          appliedMixins: [],
          constraints: [
            { rule: 'forbid_import', value: ['axios'], severity: 'error', source: 'test.arch' },
            { rule: 'require_test_file', value: ['*.test.ts'], severity: 'error', source: 'test.arch' },
          ],
          hints: [{ text: 'Keep it simple' }],
          pointers: [],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { format: 'ai' });

      expect(result.header).toContain('ARCH: test.arch');
      expect(result.header).toContain('NEVER:');
      expect(result.header).toContain('MUST:');
    });

    it('should show deprecation warning when architecture is deprecated', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
      vi.mocked(parseArchTags).mockReturnValue({
        archTag: { archId: 'test.arch', inlineMixins: [] },
        overrides: [],
        intents: [],
      });
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          archId: 'test.arch',
          description: 'Test Architecture',
          inheritanceChain: ['test.arch'],
          appliedMixins: [],
          constraints: [],
          hints: [],
          pointers: [],
          deprecated_from: '1.2.0',
          migration_guide: 'arch://migration/test-arch',
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts');

      expect(result.header).toContain('DEPRECATED');
      expect(result.header).toContain('1.2.0');
    });

    it('should include contract in header when defined', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
      vi.mocked(parseArchTags).mockReturnValue({
        archTag: { archId: 'test.arch', inlineMixins: [] },
        overrides: [],
        intents: [],
      });
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          archId: 'test.arch',
          description: 'Test Architecture',
          inheritanceChain: ['test.arch'],
          appliedMixins: [],
          constraints: [],
          hints: [],
          pointers: [],
          contract: 'Must return valid JSON',
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts');

      expect(result.header).toContain('CONTRACT');
      expect(result.header).toContain('Must return valid JSON');
    });

    it('should include pointers in verbose format', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
      vi.mocked(parseArchTags).mockReturnValue({
        archTag: { archId: 'test.arch', inlineMixins: [] },
        overrides: [],
        intents: [],
      });
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          archId: 'test.arch',
          description: 'Test Architecture',
          inheritanceChain: ['test.arch'],
          appliedMixins: [],
          constraints: [],
          hints: [],
          pointers: [
            { label: 'API Docs', uri: 'arch://docs/api' },
          ],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { format: 'verbose' });

      expect(result.header).toContain('DOCUMENTATION');
      expect(result.header).toContain('API Docs');
      expect(result.header).toContain('arch://docs/api');
    });

    it('should calculate token count', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */\nconst x = 1;');
      vi.mocked(parseArchTags).mockReturnValue({
        archTag: { archId: 'test.arch', inlineMixins: [] },
        overrides: [],
        intents: [],
      });
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          archId: 'test.arch',
          description: 'Test Architecture',
          inheritanceChain: ['test.arch'],
          appliedMixins: [],
          constraints: [],
          hints: [],
          pointers: [],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts');

      expect(result.tokenCount).toBeGreaterThan(0);
    });
  });
});
