/**
 * @arch archcodex.test
 * @intent:cli-output
 *
 * Tests for the doc command handlers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(''),
}));

// Mock file-system utilities
vi.mock('../../../../src/utils/file-system.js', () => ({
  fileExists: vi.fn().mockResolvedValue(false),
}));

// Mock registry loader
vi.mock('../../../../src/core/registry/index.js', () => ({
  loadRegistry: vi.fn().mockResolvedValue({
    nodes: {
      'test.arch': {
        description: 'Test architecture',
        constraints: [],
      },
    },
    mixins: {},
  }),
  resolveArchitecture: vi.fn().mockReturnValue({
    architecture: {
      archId: 'test.arch',
      description: 'Test architecture',
      constraints: [],
      hints: [],
    },
  }),
}));

// Mock docs generator
vi.mock('../../../../src/core/docs/index.js', () => ({
  generateAdr: vi.fn().mockReturnValue({
    valid: true,
    markdown: '# Test ADR',
    sections: [],
    errors: [],
  }),
  generateAllAdrs: vi.fn().mockReturnValue({
    valid: true,
    files: [{ name: 'test.md', archId: 'test.arch', content: '# Test' }],
    index: '# Index',
    errors: [],
  }),
  createTemplateEngine: vi.fn().mockReturnValue({
    listTemplates: vi.fn().mockResolvedValue([
      { name: 'adr', source: 'default' },
    ]),
  }),
  getDefaultTemplates: vi.fn().mockReturnValue({
    adr: '# Default ADR Template',
  }),
}));

// Mock spec loader
vi.mock('../../../../src/core/spec/loader.js', () => ({
  loadSpecRegistry: vi.fn().mockResolvedValue({ nodes: {}, mixins: {} }),
  listSpecIds: vi.fn().mockReturnValue([]),
  getSpecsDir: vi.fn().mockReturnValue('/test/.arch/specs'),
  specRegistryExists: vi.fn().mockResolvedValue(false),
}));

// Mock registry loader path functions
vi.mock('../../../../src/core/registry/loader.js', () => ({
  getRegistryDirPath: vi.fn().mockReturnValue('/test/.arch/registry'),
}));

// Mock chokidar
vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
    }),
  },
}));

describe('doc-handlers', () => {
  const originalCwd = process.cwd;
  const originalExit = process.exit;

  beforeEach(() => {
    process.cwd = vi.fn().mockReturnValue('/test/project');
    process.exit = vi.fn() as never;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.cwd = originalCwd;
    process.exit = originalExit;
  });

  describe('runDocAdr', () => {
    it('generates ADR for single architecture with --output', async () => {
      const { runDocAdr } = await import('../../../../src/cli/commands/doc-handlers.js');
      const { writeFile } = await import('fs/promises');

      await runDocAdr('test.arch', { output: '/test/out/test.md' });

      expect(writeFile).toHaveBeenCalledWith('/test/out/test.md', '# Test ADR');
    });

    it('generates all ADRs with --all flag', async () => {
      const { runDocAdr } = await import('../../../../src/cli/commands/doc-handlers.js');
      const { mkdir, writeFile } = await import('fs/promises');

      await runDocAdr(undefined, { all: true, output: '/test/out' });

      expect(mkdir).toHaveBeenCalledWith('/test/out', { recursive: true });
      expect(writeFile).toHaveBeenCalled();
    });

    it('outputs JSON with --json flag', async () => {
      const { runDocAdr } = await import('../../../../src/cli/commands/doc-handlers.js');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runDocAdr('test.arch', { json: true });

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0]?.[0];
      expect(output).toContain('test.arch');
      consoleSpy.mockRestore();
    });
  });

  describe('runDocTemplates', () => {
    it('lists available templates', async () => {
      const { runDocTemplates } = await import('../../../../src/cli/commands/doc-handlers.js');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runDocTemplates({ list: true });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('outputs JSON with --json flag', async () => {
      const { runDocTemplates } = await import('../../../../src/cli/commands/doc-handlers.js');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runDocTemplates({ list: true, json: true });

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0]?.[0];
      expect(output).toContain('templates');
      consoleSpy.mockRestore();
    });
  });

  describe('runDocVerify', () => {
    it('returns error when directory not found', async () => {
      const { fileExists } = await import('../../../../src/utils/file-system.js');
      vi.mocked(fileExists).mockResolvedValue(false);

      const { runDocVerify } = await import('../../../../src/cli/commands/doc-handlers.js');

      const result = await runDocVerify('adr', { output: '/nonexistent' });

      expect(result).toBe(1);
    });
  });

  describe('regenerateDocs', () => {
    it('regenerates ADR documentation', async () => {
      const { regenerateDocs } = await import('../../../../src/cli/commands/doc-handlers.js');
      const { mkdir, writeFile } = await import('fs/promises');

      const result = await regenerateDocs('/test/project', 'adr', '/test/out');

      expect(mkdir).toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalled();
      expect(result.adrCount).toBeGreaterThan(0);
    });
  });
});
