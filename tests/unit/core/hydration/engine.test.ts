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

    it('should not include content for untagged file when includeContent is false', async () => {
      vi.mocked(readFile).mockResolvedValue('const x = 1;');
      vi.mocked(parseArchTags).mockReturnValue({
        archTag: null,
        overrides: [],
        intents: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { includeContent: false });

      expect(result.header).toContain('NO ARCHITECTURE DEFINED');
      expect(result.content).toBeUndefined();
      expect(result.output).toBe(result.header);
    });

    it('should include version in header when defined', async () => {
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
          version: '2.1.0',
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts');

      expect(result.header).toContain('VERSION: 2.1.0');
    });

    it('should include migration guide in deprecation warning', async () => {
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
          deprecated_from: '1.0.0',
          migration_guide: 'arch://guides/migrate-v2',
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts');

      expect(result.header).toContain('DEPRECATED');
      expect(result.header).toContain('1.0.0');
      expect(result.header).toContain('Migration guide: arch://guides/migrate-v2');
    });

    it('should include deprecation without migration guide', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
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
          deprecated_from: '1.5.0',
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts');

      expect(result.header).toContain('DEPRECATED');
      expect(result.header).not.toContain('Migration guide');
    });

    it('should not show inheritance for single-item chain', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
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

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { format: 'verbose' });

      expect(result.header).not.toContain('INHERITANCE');
    });

    it('should not show mixins when appliedMixins is empty', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
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

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { format: 'verbose' });

      expect(result.header).not.toContain('MIXINS');
    });

    it('should group constraints by severity showing errors and warnings', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
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
          constraints: [
            { rule: 'forbid_import', value: ['axios'], severity: 'error', source: 'test.arch' },
            { rule: 'max_file_lines', value: 300, severity: 'warning', source: 'test.arch' },
          ],
          hints: [],
          pointers: [],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts');

      expect(result.header).toContain('[MUST] Errors');
      expect(result.header).toContain('[SHOULD] Warnings');
    });

    it('should show only errors when no warnings exist', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
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
          constraints: [
            { rule: 'forbid_import', value: ['axios'], severity: 'error', source: 'test.arch' },
          ],
          hints: [],
          pointers: [],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts');

      expect(result.header).toContain('[MUST] Errors');
      expect(result.header).not.toContain('[SHOULD] Warnings');
    });

    it('should show constraint why and source in verbose format', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
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
          constraints: [
            {
              rule: 'forbid_import',
              value: ['axios'],
              severity: 'error',
              source: 'base.node',
              why: 'Use native fetch instead',
            },
          ],
          hints: [],
          pointers: [],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { format: 'verbose' });

      expect(result.header).toContain('Use native fetch instead');
      expect(result.header).toContain('from: base.node');
    });

    it('should not show source when source equals rule', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
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
          constraints: [
            {
              rule: 'forbid_import',
              value: ['axios'],
              severity: 'error',
              source: 'forbid_import',
            },
          ],
          hints: [],
          pointers: [],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { format: 'verbose' });

      expect(result.header).not.toContain('(from:');
    });

    it('should include override expiry when present', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
      vi.mocked(parseArchTags).mockReturnValue({
        archTag: { archId: 'test.arch', inlineMixins: [] },
        overrides: [
          { rule: 'forbid_import', value: 'axios', reason: 'Legacy', expires: '2025-12-31' },
        ],
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

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts');

      expect(result.header).toContain('Expires: 2025-12-31');
    });

    it('should include hint example when present in verbose format', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
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
          hints: [
            { text: 'Use DI pattern', example: 'arch://examples/di' },
          ],
          pointers: [],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts');

      expect(result.header).toContain('Use DI pattern');
      expect(result.header).toContain('Example: arch://examples/di');
    });

    it('should not show pointers in terse format', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
      vi.mocked(parseArchTags).mockReturnValue({
        archTag: { archId: 'test.arch', inlineMixins: [] },
        overrides: [],
        intents: [],
      });
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          archId: 'test.arch',
          inheritanceChain: ['base', 'test.arch'],
          appliedMixins: ['tested'],
          constraints: [],
          hints: [],
          pointers: [
            { label: 'API Docs', uri: 'arch://docs/api' },
          ],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { format: 'terse' });

      expect(result.header).not.toContain('DOCUMENTATION');
      // Also should not show inheritance and mixins in terse format
      expect(result.header).not.toContain('INHERITANCE');
      expect(result.header).not.toContain('MIXINS');
    });

    it('should apply truncation when header exceeds token limit', async () => {
      // Create a very large architecture to exceed token limit
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
      vi.mocked(parseArchTags).mockReturnValue({
        archTag: { archId: 'test.arch', inlineMixins: [] },
        overrides: [],
        intents: [],
      });

      const manyHints = Array.from({ length: 50 }, (_, i) => ({
        text: `This is a very long hint number ${i} that adds many tokens to the output for testing truncation behavior`,
        example: `code://example/${i}/very/long/path/to/add/more/tokens`,
      }));

      const manyPointers = Array.from({ length: 20 }, (_, i) => ({
        label: `Documentation Section ${i} with a very long label`,
        uri: `arch://docs/section/${i}/subsection/detail`,
      }));

      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          archId: 'test.arch',
          description: 'A test architecture with very long description that adds tokens',
          inheritanceChain: ['base', 'middle', 'test.arch'],
          appliedMixins: ['tested', 'srp', 'documented'],
          constraints: [
            { rule: 'forbid_import', value: ['axios'], severity: 'error', source: 'test.arch' },
          ],
          hints: manyHints,
          pointers: manyPointers,
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      // Set a very low token limit to trigger truncation
      const result = await engine.hydrateFile('/test/file.ts', { tokenLimit: 50 });

      expect(result.truncated).toBe(true);
      expect(result.truncationDetails).toBeDefined();
      expect(result.truncationDetails!.originalTokens).toBeGreaterThan(50);
    });

    it('should truncate pointers first then hints during truncation', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
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
          constraints: [
            { rule: 'forbid_import', value: ['a'], severity: 'error', source: 's' },
          ],
          hints: Array.from({ length: 20 }, (_, i) => ({
            text: `Hint ${i} with a lot of detail text to fill up tokens in the output`,
          })),
          pointers: Array.from({ length: 10 }, (_, i) => ({
            label: `Pointer ${i}`,
            uri: `arch://docs/${i}`,
          })),
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { tokenLimit: 100 });

      expect(result.truncated).toBe(true);
      if (result.truncationDetails) {
        expect(result.truncationDetails.pointersTruncated).toBe(true);
      }
    });

    it('should generate AI header with code_pattern', async () => {
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
          code_pattern: 'export class MyService {\n  constructor() {}\n}',
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { format: 'ai' });

      expect(result.header).toContain('PATTERN:');
      expect(result.header).toContain('export class MyService');
    });

    it('should generate AI header with deprecation info', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
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
          deprecated_from: '2.0.0',
          migration_guide: 'arch://migrate/v3',
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { format: 'ai' });

      expect(result.header).toContain('DEPRECATED since 2.0.0');
      expect(result.header).toContain('Migration: arch://migrate/v3');
    });

    it('should generate AI header with BOUNDARIES section', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
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
          constraints: [
            { rule: 'forbid_import', value: ['axios'], severity: 'error', source: 'test.arch' },
          ],
          hints: [],
          pointers: [],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', {
        format: 'ai',
        boundaries: {
          layer: 'core',
          canImport: ['utils'],
          cannotImport: ['cli'],
          importedByCount: 5,
        },
      });

      expect(result.header).toContain('BOUNDARIES:');
      expect(result.header).toContain('layer: core');
      expect(result.header).toContain('CAN import from: [utils]');
      expect(result.header).toContain('CANNOT import from: [cli]');
      expect(result.header).toContain('imported_by: 5 file(s)');
      expect(result.header).toContain('Forbidden: [axios]');
    });

    it('should generate AI header with overrides section', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
      vi.mocked(parseArchTags).mockReturnValue({
        archTag: { archId: 'test.arch', inlineMixins: [] },
        overrides: [
          { rule: 'forbid_import', value: 'axios', reason: 'Legacy migration' },
        ],
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

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { format: 'ai' });

      expect(result.header).toContain('OVERRIDES:');
      expect(result.header).toContain('forbid_import:axios');
      expect(result.header).toContain('Legacy migration');
    });

    it('should generate AI header with override without reason', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
      vi.mocked(parseArchTags).mockReturnValue({
        archTag: { archId: 'test.arch', inlineMixins: [] },
        overrides: [
          { rule: 'forbid_import', value: 'axios' },
        ],
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

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { format: 'ai' });

      expect(result.header).toContain('OVERRIDES:');
      expect(result.header).toContain('no reason');
    });

    it('should generate AI header with INTENTS section', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
      vi.mocked(parseArchTags).mockReturnValue({
        archTag: { archId: 'test.arch', inlineMixins: [] },
        overrides: [],
        intents: [{ name: 'stateless' }],
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

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { format: 'ai' });

      expect(result.header).toContain('INTENTS:');
      expect(result.header).toContain('@intent:stateless');
    });

    it('should generate AI header with expected and suggested intents', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
      vi.mocked(parseArchTags).mockReturnValue({
        archTag: { archId: 'test.arch', inlineMixins: [] },
        overrides: [],
        intents: [{ name: 'stateless' }],
      });
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          archId: 'test.arch',
          inheritanceChain: ['test.arch'],
          appliedMixins: [],
          constraints: [],
          hints: [],
          pointers: [],
          expected_intents: ['stateless', 'pure'],
          suggested_intents: [{ name: 'cacheable', when: 'When function is pure and idempotent' }],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { format: 'ai' });

      expect(result.header).toContain('INTENT OPTIONS:');
      // 'stateless' is declared, so should show check mark
      expect(result.header).toMatch(/✓.*@intent:stateless/);
      // 'pure' is expected but not declared, should show MISSING
      expect(result.header).toMatch(/MISSING.*@intent:pure/);
      // 'cacheable' is suggested and not declared, should show with guidance
      expect(result.header).toContain('@intent:cacheable');
      expect(result.header).toContain('When: When function is pure and idempotent');
    });

    it('should not show suggested intent if already declared', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
      vi.mocked(parseArchTags).mockReturnValue({
        archTag: { archId: 'test.arch', inlineMixins: [] },
        overrides: [],
        intents: [{ name: 'cacheable' }],
      });
      vi.mocked(resolveArchitecture).mockReturnValue({
        architecture: {
          archId: 'test.arch',
          inheritanceChain: ['test.arch'],
          appliedMixins: [],
          constraints: [],
          hints: [],
          pointers: [],
          suggested_intents: [{ name: 'cacheable', when: 'When pure' }],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { format: 'ai' });

      // Since cacheable is already declared, it should not appear in INTENT OPTIONS
      expect(result.header).not.toContain('When: When pure');
    });

    it('should generate AI header with SEE section for pointers', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
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
          pointers: [
            { label: 'API Reference', uri: 'arch://docs/api' },
            { label: 'Examples', uri: 'arch://docs/examples' },
            { label: 'Should be truncated', uri: 'arch://docs/extra' },
          ],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { format: 'ai' });

      expect(result.header).toContain('SEE:');
      expect(result.header).toContain('arch://docs/api');
      expect(result.header).toContain('arch://docs/examples');
      // Only max 2 pointers in AI format
      expect(result.header).not.toContain('arch://docs/extra');
    });

    it('should generate AI header with pointer without label', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
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
          pointers: [
            { uri: 'arch://docs/api' },
          ],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { format: 'ai' });

      expect(result.header).toContain('SEE:');
      expect(result.header).toContain('(reference)');
    });

    it('should show constraint intent in AI MUST section', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
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
          constraints: [
            {
              rule: 'require_import',
              value: ['zod'],
              severity: 'error',
              source: 'test.arch',
              intent: 'Ensure all schemas use Zod for validation',
            },
          ],
          hints: [],
          pointers: [],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { format: 'ai' });

      expect(result.header).toContain('Intent: Ensure all schemas use Zod for validation');
    });

    it('should show constraint usage map in AI MUST section', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
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
          constraints: [
            {
              rule: 'require_import',
              value: ['logger'],
              severity: 'error',
              source: 'test.arch',
              usage: { 'in handlers': 'logger.info()', 'in services': 'logger.debug()' },
            },
          ],
          hints: [],
          pointers: [],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { format: 'ai' });

      expect(result.header).toContain('in handlers');
      expect(result.header).toContain('logger.info()');
    });

    it('should show constraint why when no usage map or intent', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
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
          constraints: [
            {
              rule: 'require_import',
              value: ['logger'],
              severity: 'error',
              source: 'test.arch',
              why: 'Structured logging is required',
            },
          ],
          hints: [],
          pointers: [],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { format: 'ai' });

      expect(result.header).toContain('Structured logging is required');
    });

    it('should show valid examples and codeExample in AI MUST section', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
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
          constraints: [
            {
              rule: 'require_import',
              value: ['zod'],
              severity: 'error',
              source: 'test.arch',
              examples: ['import { z } from "zod"'],
              codeExample: 'const schema = z.object({ name: z.string() })',
            },
          ],
          hints: [],
          pointers: [],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { format: 'ai' });

      expect(result.header).toContain('Valid: import { z } from "zod"');
      expect(result.header).toContain('Example: const schema = z.object');
    });

    it('should show counterexamples and alternative in AI NEVER section', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
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
          constraints: [
            {
              rule: 'forbid_import',
              value: ['axios'],
              severity: 'error',
              source: 'test.arch',
              alternative: 'use native fetch',
              counterexamples: ['import axios from "axios"'],
            },
          ],
          hints: [],
          pointers: [],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { format: 'ai' });

      expect(result.header).toContain('Use: use native fetch');
      expect(result.header).toContain('Avoid: import axios from "axios"');
    });

    it('should show constraint why when no alternative in AI NEVER section', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
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
          constraints: [
            {
              rule: 'forbid_import',
              value: ['moment'],
              severity: 'error',
              source: 'test.arch',
              why: 'Moment.js is deprecated and heavy',
            },
          ],
          hints: [],
          pointers: [],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { format: 'ai' });

      expect(result.header).toContain("Moment.js is deprecated and heavy");
    });

    it('should show forbidden intent in AI NEVER section', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
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
          constraints: [
            {
              rule: 'forbid_import',
              value: ['axios'],
              severity: 'error',
              source: 'test.arch',
              intent: 'Prevent external HTTP dependencies',
            },
          ],
          hints: [],
          pointers: [],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { format: 'ai' });

      expect(result.header).toContain('Intent: Prevent external HTTP dependencies');
    });

    it('should find pattern suggestion from patternRegistry in AI format', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
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
          constraints: [
            {
              rule: 'forbid_import',
              value: ['console'],
              severity: 'error',
              source: 'test.arch',
            },
          ],
          hints: [],
          pointers: [],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', {
        format: 'ai',
        patternRegistry: {
          patterns: {
            logger: {
              canonical: 'src/utils/logger.ts',
              exports: ['logger'],
              keywords: ['console', 'log'],
              usage: 'Use structured logger',
            },
          },
        },
      });

      expect(result.header).toContain('Use: src/utils/logger.ts (logger)');
    });

    it('should format various constraint rules in AI readable format', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */');
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
          constraints: [
            { rule: 'require_call', value: 'validate()', severity: 'error', source: 's' },
            { rule: 'require_decorator', value: '@Injectable', severity: 'error', source: 's' },
            { rule: 'must_extend', value: 'BaseService', severity: 'error', source: 's' },
            { rule: 'implements', value: 'IService', severity: 'error', source: 's' },
            { rule: 'max_file_lines', value: 300, severity: 'error', source: 's' },
            { rule: 'max_public_methods', value: 5, severity: 'error', source: 's' },
            { rule: 'forbid_call', value: 'unsafeOp()', severity: 'error', source: 's' },
            { rule: 'forbid_decorator', value: '@Deprecated', severity: 'error', source: 's' },
            { rule: 'forbid_mutation', value: 'state', severity: 'error', source: 's' },
          ],
          hints: [],
          pointers: [],
        },
        conflicts: [],
      });

      const engine = new HydrationEngine(mockConfig, mockRegistry);
      const result = await engine.hydrateFile('/test/file.ts', { format: 'ai' });

      expect(result.header).toContain('Call: validate()');
      expect(result.header).toContain('Decorator: @Injectable');
      expect(result.header).toContain('Extend: BaseService');
      expect(result.header).toContain('Implement: IService');
      expect(result.header).toContain('Max lines: 300');
      expect(result.header).toContain('Max methods: 5');
      expect(result.header).toContain('Call: unsafeOp()');
    });
  });
});

describe('hydration helpers', () => {
  describe('extractForbiddenConstraints', () => {
    it('should extract forbid_ prefixed constraints', async () => {
      const { extractForbiddenConstraints } = await import(
        '../../../../src/core/hydration/helpers.js'
      );

      const constraints = [
        { rule: 'forbid_import', value: ['axios'], severity: 'error' as const, source: 's' },
        { rule: 'require_import', value: ['zod'], severity: 'error' as const, source: 's' },
        { rule: 'max_file_lines', value: 300, severity: 'error' as const, source: 's' },
        { rule: 'max_public_methods', value: 5, severity: 'error' as const, source: 's' },
      ];

      const result = extractForbiddenConstraints(constraints);
      expect(result.length).toBe(3); // forbid_import + max_file_lines + max_public_methods
    });
  });

  describe('extractRequiredConstraints', () => {
    it('should extract require_ prefixed and must_extend and implements constraints', async () => {
      const { extractRequiredConstraints } = await import(
        '../../../../src/core/hydration/helpers.js'
      );

      const constraints = [
        { rule: 'require_import', value: ['zod'], severity: 'error' as const, source: 's' },
        { rule: 'must_extend', value: 'Base', severity: 'error' as const, source: 's' },
        { rule: 'implements', value: 'IFoo', severity: 'error' as const, source: 's' },
        { rule: 'forbid_import', value: ['x'], severity: 'error' as const, source: 's' },
      ];

      const result = extractRequiredConstraints(constraints);
      expect(result.length).toBe(3); // require_import + must_extend + implements
    });
  });

  describe('formatConstraintValue', () => {
    it('should join array values with comma', async () => {
      const { formatConstraintValue } = await import(
        '../../../../src/core/hydration/helpers.js'
      );

      expect(formatConstraintValue(['a', 'b', 'c'])).toBe('a, b, c');
    });

    it('should convert non-array values to string', async () => {
      const { formatConstraintValue } = await import(
        '../../../../src/core/hydration/helpers.js'
      );

      expect(formatConstraintValue(42)).toBe('42');
      expect(formatConstraintValue('hello')).toBe('hello');
    });
  });

  describe('estimateTokens', () => {
    it('should estimate roughly 4 chars per token', async () => {
      const { estimateTokens } = await import('../../../../src/core/hydration/helpers.js');

      expect(estimateTokens('12345678')).toBe(2); // 8 / 4 = 2
      expect(estimateTokens('1234')).toBe(1); // 4 / 4 = 1
      expect(estimateTokens('12345')).toBe(2); // ceil(5/4) = 2
    });

    it('should return 0 for empty string', async () => {
      const { estimateTokens } = await import('../../../../src/core/hydration/helpers.js');

      expect(estimateTokens('')).toBe(0);
    });
  });

  describe('selectSharpHints', () => {
    it('should prioritize specific hints over generic SOLID prefixed hints', async () => {
      const { selectSharpHints } = await import('../../../../src/core/hydration/helpers.js');

      const hints = [
        { text: '[SRP] Single responsibility' },
        { text: '[DRY] Dont repeat yourself' },
        { text: 'Keep functions pure' },
        { text: 'Use dependency injection' },
      ];

      // With max=2, should return only the 2 specific hints
      const result = selectSharpHints(hints, 2);
      expect(result.length).toBe(2);
      expect(result[0].text).toBe('Keep functions pure');
      expect(result[1].text).toBe('Use dependency injection');
    });

    it('should backfill generics when specific count is less than max', async () => {
      const { selectSharpHints } = await import('../../../../src/core/hydration/helpers.js');

      const hints = [
        { text: '[SRP] Single responsibility' },
        { text: '[DRY] Dont repeat yourself' },
        { text: 'Keep functions pure' },
        { text: 'Use dependency injection' },
      ];

      // With max=5, should return 2 specific + 2 generic = 4
      const result = selectSharpHints(hints, 5);
      expect(result.length).toBe(4);
      // Specific hints come first
      expect(result[0].text).toBe('Keep functions pure');
      expect(result[1].text).toBe('Use dependency injection');
    });

    it('should backfill with generic hints when not enough specific hints', async () => {
      const { selectSharpHints } = await import('../../../../src/core/hydration/helpers.js');

      const hints = [
        { text: '[SRP] Single responsibility' },
        { text: '[DIP] Dependency inversion' },
        { text: 'Keep it simple' },
      ];

      const result = selectSharpHints(hints, 3);
      // 1 specific + 2 generic backfill = 3
      expect(result.length).toBe(3);
      expect(result[0].text).toBe('Keep it simple');
    });

    it('should respect max limit', async () => {
      const { selectSharpHints } = await import('../../../../src/core/hydration/helpers.js');

      const hints = Array.from({ length: 10 }, (_, i) => ({
        text: `Specific hint ${i}`,
      }));

      const result = selectSharpHints(hints, 3);
      expect(result.length).toBe(3);
    });

    it('should handle empty hints array', async () => {
      const { selectSharpHints } = await import('../../../../src/core/hydration/helpers.js');

      const result = selectSharpHints([], 5);
      expect(result).toEqual([]);
    });

    it('should handle all generic hints', async () => {
      const { selectSharpHints } = await import('../../../../src/core/hydration/helpers.js');

      const hints = [
        { text: '[SRP] Single responsibility' },
        { text: '[OCP] Open closed' },
        { text: '[LSP] Liskov substitution' },
      ];

      const result = selectSharpHints(hints, 5);
      // All are generic, specific is empty, backfill from remaining up to max
      expect(result.length).toBe(3);
    });
  });

  describe('findPatternSuggestion', () => {
    it('should return null when no patternRegistry provided', async () => {
      const { findPatternSuggestion } = await import(
        '../../../../src/core/hydration/helpers.js'
      );

      const constraint = {
        rule: 'forbid_import',
        value: ['axios'],
        severity: 'error' as const,
        source: 'test',
      };

      expect(findPatternSuggestion(constraint)).toBeNull();
    });

    it('should return null for non-forbid_import constraint', async () => {
      const { findPatternSuggestion } = await import(
        '../../../../src/core/hydration/helpers.js'
      );

      const constraint = {
        rule: 'require_import',
        value: ['zod'],
        severity: 'error' as const,
        source: 'test',
      };

      expect(findPatternSuggestion(constraint, { patterns: {} })).toBeNull();
    });

    it('should find pattern suggestion when keyword matches forbidden value', async () => {
      const { findPatternSuggestion } = await import(
        '../../../../src/core/hydration/helpers.js'
      );

      const constraint = {
        rule: 'forbid_import',
        value: ['console'],
        severity: 'error' as const,
        source: 'test',
      };

      const registry = {
        patterns: {
          logger: {
            canonical: 'src/utils/logger.ts',
            exports: ['logger'],
            keywords: ['console', 'log'],
          },
        },
      };

      const result = findPatternSuggestion(constraint, registry);
      expect(result).not.toBeNull();
      expect(result!.file).toBe('src/utils/logger.ts');
      expect(result!.export).toBe('logger');
    });

    it('should return default export when pattern has no exports', async () => {
      const { findPatternSuggestion } = await import(
        '../../../../src/core/hydration/helpers.js'
      );

      const constraint = {
        rule: 'forbid_import',
        value: ['console'],
        severity: 'error' as const,
        source: 'test',
      };

      const registry = {
        patterns: {
          logger: {
            canonical: 'src/utils/logger.ts',
            keywords: ['console'],
          },
        },
      };

      const result = findPatternSuggestion(constraint, registry);
      expect(result).not.toBeNull();
      expect(result!.export).toBe('default');
    });

    it('should handle non-string constraint values gracefully', async () => {
      const { findPatternSuggestion } = await import(
        '../../../../src/core/hydration/helpers.js'
      );

      const constraint = {
        rule: 'forbid_import',
        value: 300, // numeric value for forbid_import (edge case)
        severity: 'error' as const,
        source: 'test',
      };

      const registry = {
        patterns: {
          logger: {
            canonical: 'src/utils/logger.ts',
            keywords: ['console'],
          },
        },
      };

      // Should handle gracefully without crashing
      const result = findPatternSuggestion(constraint, registry);
      expect(result).toBeNull();
    });

    it('should handle single string value (not array)', async () => {
      const { findPatternSuggestion } = await import(
        '../../../../src/core/hydration/helpers.js'
      );

      const constraint = {
        rule: 'forbid_import',
        value: 'console',
        severity: 'error' as const,
        source: 'test',
      };

      const registry = {
        patterns: {
          logger: {
            canonical: 'src/utils/logger.ts',
            exports: ['logger'],
            keywords: ['console'],
          },
        },
      };

      const result = findPatternSuggestion(constraint, registry);
      expect(result).not.toBeNull();
      expect(result!.file).toBe('src/utils/logger.ts');
    });
  });

  describe('groupConstraintsBySeverity', () => {
    it('should group error and warning constraints correctly', async () => {
      const { groupConstraintsBySeverity } = await import(
        '../../../../src/core/hydration/helpers.js'
      );

      const constraints = [
        { rule: 'forbid_import', value: ['a'], severity: 'error' as const, source: 's' },
        { rule: 'forbid_import', value: ['b'], severity: 'warning' as const, source: 's' },
        { rule: 'forbid_import', value: ['c'], severity: 'error' as const, source: 's' },
      ];

      const result = groupConstraintsBySeverity(constraints);
      expect(result.error.length).toBe(2);
      expect(result.warning.length).toBe(1);
    });

    it('should return empty arrays when no constraints', async () => {
      const { groupConstraintsBySeverity } = await import(
        '../../../../src/core/hydration/helpers.js'
      );

      const result = groupConstraintsBySeverity([]);
      expect(result.error).toEqual([]);
      expect(result.warning).toEqual([]);
    });
  });
});
