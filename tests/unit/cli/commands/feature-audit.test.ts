/**
 * @arch archcodex.test.unit
 *
 * Tests for feature-audit CLI command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFeatureAuditCommand } from '../../../../src/cli/commands/feature-audit.js';
import type { FeatureAuditResult } from '../../../../src/core/audit/index.js';

// Mock chalk with pass-through
vi.mock('chalk', () => ({
  default: {
    bold: Object.assign((s: string) => s, {
      green: (s: string) => s,
      cyan: (s: string) => s,
    }),
    green: (s: string) => s,
    yellow: (s: string) => s,
    red: (s: string) => s,
    cyan: (s: string) => s,
    dim: (s: string) => s,
    blue: (s: string) => s,
  },
}));

let mockAuditResult: FeatureAuditResult;

// Mock the audit module
vi.mock('../../../../src/core/audit/index.js', () => ({
  featureAudit: vi.fn().mockImplementation(async () => mockAuditResult),
}));

vi.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Feature Audit Command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let processCwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditResult = {
      status: 'complete',
      layers: {
        backend: {
          status: 'pass',
          checks: [
            { name: 'mutation', status: 'found', implementationStatus: 'implemented', file: 'src/mutations/test.ts' },
          ],
        },
        frontend: {
          status: 'pass',
          checks: [
            { name: 'hook', status: 'found', implementationStatus: 'implemented', file: 'src/hooks/useTest.ts' },
          ],
        },
        ui: {
          status: 'pass',
          componentGroup: 'test-cards',
          checks: [
            { component: 'TestCard', status: 'wired', implementationStatus: 'implemented' },
          ],
        },
      },
      remediation: [],
      summary: 'All layers complete',
    } as unknown as FeatureAuditResult;

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    processCwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createFeatureAuditCommand', () => {
    it('creates command with correct name', () => {
      const command = createFeatureAuditCommand();
      expect(command.name()).toBe('feature-audit');
    });

    it('has mutation option', () => {
      const command = createFeatureAuditCommand();
      const mutationOpt = command.options.find(o => o.long === '--mutation');
      expect(mutationOpt).toBeDefined();
    });

    it('has entity option', () => {
      const command = createFeatureAuditCommand();
      const entityOpt = command.options.find(o => o.long === '--entity');
      expect(entityOpt).toBeDefined();
    });

    it('has json output option', () => {
      const command = createFeatureAuditCommand();
      const jsonOpt = command.options.find(o => o.long === '--json');
      expect(jsonOpt).toBeDefined();
    });

    it('has verbose option', () => {
      const command = createFeatureAuditCommand();
      const verboseOpt = command.options.find(o => o.long === '--verbose');
      expect(verboseOpt).toBeDefined();
    });
  });

  describe('runFeatureAudit - no options', () => {
    it('should show usage help when no mutation or entity provided', async () => {
      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('Feature Audit'))).toBe(true);
      expect(calls.some(c => c.includes('Usage:'))).toBe(true);
    });

    it('should show examples when no options provided', async () => {
      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('Examples:'))).toBe(true);
    });

    it('should show option descriptions when no options provided', async () => {
      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('Options:'))).toBe(true);
    });
  });

  describe('runFeatureAudit - with mutation', () => {
    it('should call featureAudit with mutation option', async () => {
      const { featureAudit } = await import('../../../../src/core/audit/index.js');

      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'duplicateEntry']);

      expect(featureAudit).toHaveBeenCalledWith(expect.objectContaining({
        mutation: 'duplicateEntry',
        projectRoot: '/test/project',
      }));
    });

    it('should call featureAudit with entity option', async () => {
      const { featureAudit } = await import('../../../../src/core/audit/index.js');

      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--entity', 'products']);

      expect(featureAudit).toHaveBeenCalledWith(expect.objectContaining({
        entity: 'products',
        projectRoot: '/test/project',
      }));
    });

    it('should call featureAudit with both mutation and entity', async () => {
      const { featureAudit } = await import('../../../../src/core/audit/index.js');

      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'duplicateEntry', '--entity', 'products']);

      expect(featureAudit).toHaveBeenCalledWith(expect.objectContaining({
        mutation: 'duplicateEntry',
        entity: 'products',
      }));
    });

    it('should pass verbose flag to featureAudit', async () => {
      const { featureAudit } = await import('../../../../src/core/audit/index.js');

      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'test', '--verbose']);

      expect(featureAudit).toHaveBeenCalledWith(expect.objectContaining({
        verbose: true,
      }));
    });
  });

  describe('runFeatureAudit - JSON output', () => {
    it('should output JSON when --json is provided', async () => {
      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'test', '--json']);

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try { JSON.parse(c[0]); return true; } catch { return false; }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);
    });
  });

  describe('printAuditReport - complete status', () => {
    it('should show green check for complete status', async () => {
      mockAuditResult.status = 'complete';

      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('COMPLETE'))).toBe(true);
    });
  });

  describe('printAuditReport - incomplete status', () => {
    it('should show warning for incomplete status', async () => {
      mockAuditResult.status = 'incomplete';

      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('INCOMPLETE'))).toBe(true);
    });
  });

  describe('printAuditReport - missing status', () => {
    it('should show error for missing status', async () => {
      mockAuditResult.status = 'missing' as FeatureAuditResult['status'];

      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('MISSING'))).toBe(true);
    });
  });

  describe('printAuditReport - layer results', () => {
    it('should skip backend layer when status is skip', async () => {
      mockAuditResult.layers.backend = { status: 'skip', checks: [] } as FeatureAuditResult['layers']['backend'];

      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      // Backend should not appear in non-verbose mode when skipped
      expect(calls.every(c => !c.includes('Backend'))).toBe(true);
    });

    it('should show skipped backend layer in verbose mode', async () => {
      mockAuditResult.layers.backend = { status: 'skip', checks: [] } as FeatureAuditResult['layers']['backend'];

      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'test', '--verbose']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('Skipped'))).toBe(true);
    });

    it('should show check with stub implementation status', async () => {
      mockAuditResult.layers.backend = {
        status: 'pass',
        checks: [
          { name: 'mutation', status: 'found', implementationStatus: 'stub', stubReason: 'TODO', file: 'test.ts' },
        ],
      } as FeatureAuditResult['layers']['backend'];

      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('stub'))).toBe(true);
    });

    it('should show check with stub and no reason', async () => {
      mockAuditResult.layers.backend = {
        status: 'pass',
        checks: [
          { name: 'mutation', status: 'found', implementationStatus: 'stub', file: 'test.ts' },
        ],
      } as FeatureAuditResult['layers']['backend'];

      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('stub'))).toBe(true);
    });

    it('should show implemented label for implemented checks', async () => {
      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('implemented'))).toBe(true);
    });

    it('should show missing check with expected hint in verbose mode', async () => {
      mockAuditResult.layers.backend = {
        status: 'fail',
        checks: [
          { name: 'mutation', status: 'missing', expected: 'src/mutations/test.ts' },
        ],
      } as FeatureAuditResult['layers']['backend'];

      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'test', '--verbose']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('src/mutations/test.ts'))).toBe(true);
    });

    it('should not show expected hint in non-verbose mode', async () => {
      mockAuditResult.layers.backend = {
        status: 'fail',
        checks: [
          { name: 'mutation', status: 'missing', expected: 'src/mutations/test.ts' },
        ],
      } as FeatureAuditResult['layers']['backend'];

      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'test']);

      // The expected value should not appear as a separate line without verbose
      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      const expectedLines = calls.filter(c => c.includes('src/mutations/test.ts'));
      expect(expectedLines.length).toBe(0);
    });

    it('should show file path for checks that have files', async () => {
      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('src/mutations/test.ts'))).toBe(true);
    });
  });

  describe('printAuditReport - UI layer', () => {
    it('should skip UI layer when status is skip in non-verbose mode', async () => {
      mockAuditResult.layers.ui = {
        status: 'skip',
        componentGroup: '',
        checks: [],
      } as unknown as FeatureAuditResult['layers']['ui'];

      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.every(c => !c.includes('no component group matched'))).toBe(true);
    });

    it('should show skipped UI message in verbose mode', async () => {
      mockAuditResult.layers.ui = {
        status: 'skip',
        componentGroup: '',
        checks: [],
      } as unknown as FeatureAuditResult['layers']['ui'];

      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'test', '--verbose']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('no component group matched'))).toBe(true);
    });

    it('should show UI component group name', async () => {
      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('test-cards'))).toBe(true);
    });

    it('should show partial status for UI checks', async () => {
      mockAuditResult.layers.ui = {
        status: 'fail',
        componentGroup: 'test-cards',
        checks: [
          { component: 'TestCard', status: 'partial', details: 'Missing handler' },
        ],
      } as unknown as FeatureAuditResult['layers']['ui'];

      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('partial'))).toBe(true);
    });

    it('should show missing status for UI checks', async () => {
      mockAuditResult.layers.ui = {
        status: 'fail',
        componentGroup: 'test-cards',
        checks: [
          { component: 'TestCard', status: 'missing' },
        ],
      } as unknown as FeatureAuditResult['layers']['ui'];

      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('missing'))).toBe(true);
    });

    it('should show UI check details in verbose mode', async () => {
      mockAuditResult.layers.ui = {
        status: 'fail',
        componentGroup: 'test-cards',
        checks: [
          { component: 'TestCard', status: 'partial', details: 'Missing onClick handler' },
        ],
      } as unknown as FeatureAuditResult['layers']['ui'];

      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'test', '--verbose']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('Missing onClick handler'))).toBe(true);
    });

    it('should show UI stub implementation status', async () => {
      mockAuditResult.layers.ui = {
        status: 'pass',
        componentGroup: 'test-cards',
        checks: [
          { component: 'TestCard', status: 'wired', implementationStatus: 'stub', stubReason: 'placeholder' },
        ],
      } as unknown as FeatureAuditResult['layers']['ui'];

      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('stub'))).toBe(true);
    });
  });

  describe('printAuditReport - remediation', () => {
    it('should show remediation items when present', async () => {
      mockAuditResult.remediation = [
        'Create mutation handler at src/mutations/test.ts',
        'Add hook wrapper at src/hooks/useTest.ts',
      ];

      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('Remediation'))).toBe(true);
      expect(calls.some(c => c.includes('Create mutation handler'))).toBe(true);
    });

    it('should not show remediation section when empty', async () => {
      mockAuditResult.remediation = [];

      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.every(c => !c.includes('Remediation'))).toBe(true);
    });
  });

  describe('printAuditReport - summary', () => {
    it('should show summary', async () => {
      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('All layers complete'))).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle Error exceptions', async () => {
      const { featureAudit } = await import('../../../../src/core/audit/index.js');
      vi.mocked(featureAudit).mockRejectedValueOnce(new Error('Audit failed'));

      const command = createFeatureAuditCommand();
      await expect(command.parseAsync(['node', 'test', '--mutation', 'test'])).rejects.toThrow('process.exit called');

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith('Audit failed');
    });

    it('should handle non-Error exceptions', async () => {
      const { featureAudit } = await import('../../../../src/core/audit/index.js');
      vi.mocked(featureAudit).mockRejectedValueOnce('unexpected');

      const command = createFeatureAuditCommand();
      await expect(command.parseAsync(['node', 'test', '--mutation', 'test'])).rejects.toThrow('process.exit called');

      const { logger } = await import('../../../../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalledWith('Unknown error');
    });
  });

  describe('printLayerResult - unknown check status', () => {
    it('should show question mark icon for unknown check status', async () => {
      mockAuditResult.layers.frontend = {
        status: 'pass',
        checks: [
          { name: 'handler', status: 'unknown' as 'found', implementationStatus: undefined },
        ],
      } as FeatureAuditResult['layers']['frontend'];

      const command = createFeatureAuditCommand();
      await command.parseAsync(['node', 'test', '--mutation', 'test']);

      const calls = consoleLogSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('handler'))).toBe(true);
    });
  });
});
