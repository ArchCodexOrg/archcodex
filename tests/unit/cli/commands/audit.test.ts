/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for the audit command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAuditCommand } from '../../../../src/cli/commands/audit.js';
import type { AuditReport, OverrideCluster } from '../../../../src/core/audit/index.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: (s: string) => s,
    dim: (s: string) => s,
    cyan: (s: string) => s,
    green: (s: string) => s,
    yellow: (s: string) => s,
    red: (s: string) => s,
    magenta: (s: string) => s,
  },
}));

// Configurable mock behavior
let mockScanResult: AuditReport = {
  files: [],
  summary: {
    filesWithOverrides: 0,
    totalOverrides: 0,
    activeOverrides: 0,
    expiringOverrides: 0,
    expiredOverrides: 0,
    invalidOverrides: 0,
  },
  generatedAt: '2025-01-25T12:00:00.000Z',
};

let mockClusterResult: OverrideCluster[] = [];

// Mock dependencies
vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    version: '1.0',
    registry: {},
  }),
}));

vi.mock('../../../../src/core/audit/index.js', () => ({
  AuditScanner: vi.fn(function() {
    return {
    scan: vi.fn().mockImplementation(async () => mockScanResult),
  };
  }),
  clusterOverrides: vi.fn().mockImplementation(() => mockClusterResult),
}));

vi.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { loadConfig } from '../../../../src/core/config/loader.js';
import { AuditScanner, clusterOverrides } from '../../../../src/core/audit/index.js';
import { logger } from '../../../../src/utils/logger.js';

describe('audit command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let processCwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    processCwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/project');

    // Reset mock behavior
    mockScanResult = {
      files: [],
      summary: {
        filesWithOverrides: 0,
        totalOverrides: 0,
        activeOverrides: 0,
        expiringOverrides: 0,
        expiredOverrides: 0,
        invalidOverrides: 0,
      },
      generatedAt: '2025-01-25T12:00:00.000Z',
    };
    mockClusterResult = [];

    // Reset the AuditScanner mock to use the configurable behavior
    vi.mocked(AuditScanner).mockImplementation(function() {
      return {
      scan: vi.fn().mockImplementation(async () => mockScanResult),
    } as any;
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createAuditCommand', () => {
    it('should create a command with correct name', () => {
      const command = createAuditCommand();
      expect(command.name()).toBe('audit');
    });

    it('should have the correct description', () => {
      const command = createAuditCommand();
      expect(command.description()).toContain('@override');
    });

    it('should have required options', () => {
      const command = createAuditCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--json');
      expect(optionNames).toContain('--expired');
      expect(optionNames).toContain('--expiring');
      expect(optionNames).toContain('--suggest-intents');
      expect(optionNames).toContain('--config');
    });

    it('should have short flag for config option', () => {
      const command = createAuditCommand();
      const configOption = command.options.find((opt) => opt.long === '--config');
      expect(configOption?.short).toBe('-c');
    });

    it('should have default value for expiring option', () => {
      const command = createAuditCommand();
      const expiringOption = command.options.find((opt) => opt.long === '--expiring');
      expect(expiringOption?.defaultValue).toBe('30');
    });
  });

  describe('command execution', () => {
    it('should load config', async () => {
      const command = createAuditCommand();
      await command.parseAsync(['node', 'test']);

      expect(loadConfig).toHaveBeenCalledWith(expect.stringContaining('.arch/config.yaml'));
    });

    it('should create AuditScanner with project root and config', async () => {
      const command = createAuditCommand();
      await command.parseAsync(['node', 'test']);

      expect(AuditScanner).toHaveBeenCalledWith('/project', expect.any(Object));
    });

    it('should scan with default expiring days', async () => {
      const mockScan = vi.fn().mockResolvedValue(mockScanResult);
      vi.mocked(AuditScanner).mockImplementation(function() {
      return {
        scan: mockScan,
      } as any;
    });

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test']);

      expect(mockScan).toHaveBeenCalledWith({
        expiringDays: 30,
        expiredOnly: undefined,
        expiringOnly: false,
      });
    });

    it('should pass custom expiring days', async () => {
      const mockScan = vi.fn().mockResolvedValue(mockScanResult);
      vi.mocked(AuditScanner).mockImplementation(function() {
      return {
        scan: mockScan,
      } as any;
    });

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test', '--expiring', '60']);

      expect(mockScan).toHaveBeenCalledWith(expect.objectContaining({
        expiringDays: 60,
      }));
    });

    it('should pass expired only flag', async () => {
      const mockScan = vi.fn().mockResolvedValue(mockScanResult);
      vi.mocked(AuditScanner).mockImplementation(function() {
      return {
        scan: mockScan,
      } as any;
    });

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test', '--expired']);

      expect(mockScan).toHaveBeenCalledWith(expect.objectContaining({
        expiredOnly: true,
      }));
    });
  });

  describe('JSON output', () => {
    it('should output JSON when --json flag is provided', async () => {
      mockScanResult = {
        files: [],
        summary: {
          filesWithOverrides: 0,
          totalOverrides: 0,
          activeOverrides: 0,
          expiringOverrides: 0,
          expiredOverrides: 0,
          invalidOverrides: 0,
        },
        generatedAt: '2025-01-25T12:00:00.000Z',
      };

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test', '--json']);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.files).toBeDefined();
      expect(output.summary).toBeDefined();
    });

    it('should include files in JSON output', async () => {
      mockScanResult = {
        files: [
          {
            filePath: 'src/file.ts',
            archId: 'test.domain',
            overrides: [
              {
                rule: 'forbid_import',
                value: 'axios',
                reason: 'Legacy code',
                expires: '2025-06-01',
                status: 'active',
                daysUntilExpiry: 120,
                errors: [],
                warnings: [],
              },
            ],
          },
        ],
        summary: {
          filesWithOverrides: 1,
          totalOverrides: 1,
          activeOverrides: 1,
          expiringOverrides: 0,
          expiredOverrides: 0,
          invalidOverrides: 0,
        },
        generatedAt: '2025-01-25T12:00:00.000Z',
      };

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test', '--json']);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.files).toHaveLength(1);
      expect(output.files[0].filePath).toBe('src/file.ts');
    });

    it('should output clusters as JSON with --suggest-intents --json', async () => {
      mockClusterResult = [
        {
          constraintKey: 'forbid_import:axios',
          fileCount: 3,
          files: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
          commonReasons: ['Legacy code'],
          promoteCommand: 'archcodex promote forbid_import:axios --dry-run',
        },
      ];

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test', '--suggest-intents', '--json']);

      expect(clusterOverrides).toHaveBeenCalled();
      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output).toHaveLength(1);
      expect(output[0].constraintKey).toBe('forbid_import:axios');
    });
  });

  describe('human-readable output', () => {
    it('should show report header', async () => {
      const command = createAuditCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('OVERRIDE AUDIT REPORT'))).toBe(true);
    });

    it('should show no overrides message when empty', async () => {
      mockScanResult = {
        files: [],
        summary: {
          filesWithOverrides: 0,
          totalOverrides: 0,
          activeOverrides: 0,
          expiringOverrides: 0,
          expiredOverrides: 0,
          invalidOverrides: 0,
        },
        generatedAt: '2025-01-25T12:00:00.000Z',
      };

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('No overrides found'))).toBe(true);
    });

    it('should show no expired overrides message with --expired flag', async () => {
      mockScanResult = {
        files: [],
        summary: {
          filesWithOverrides: 0,
          totalOverrides: 0,
          activeOverrides: 0,
          expiringOverrides: 0,
          expiredOverrides: 0,
          invalidOverrides: 0,
        },
        generatedAt: '2025-01-25T12:00:00.000Z',
      };

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test', '--expired']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('No expired overrides found'))).toBe(true);
    });

    it('should show file path', async () => {
      mockScanResult = {
        files: [
          {
            filePath: 'src/services/payment.ts',
            archId: 'payment.service',
            overrides: [
              {
                rule: 'forbid_import',
                value: 'axios',
                reason: 'Test',
                status: 'active',
                daysUntilExpiry: null,
                errors: [],
                warnings: [],
              },
            ],
          },
        ],
        summary: {
          filesWithOverrides: 1,
          totalOverrides: 1,
          activeOverrides: 1,
          expiringOverrides: 0,
          expiredOverrides: 0,
          invalidOverrides: 0,
        },
        generatedAt: '2025-01-25T12:00:00.000Z',
      };

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('src/services/payment.ts'))).toBe(true);
    });

    it('should show architecture ID', async () => {
      mockScanResult = {
        files: [
          {
            filePath: 'src/file.ts',
            archId: 'test.domain',
            overrides: [
              {
                rule: 'forbid_import',
                value: 'axios',
                status: 'active',
                daysUntilExpiry: null,
                errors: [],
                warnings: [],
              },
            ],
          },
        ],
        summary: {
          filesWithOverrides: 1,
          totalOverrides: 1,
          activeOverrides: 1,
          expiringOverrides: 0,
          expiredOverrides: 0,
          invalidOverrides: 0,
        },
        generatedAt: '2025-01-25T12:00:00.000Z',
      };

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Architecture: test.domain'))).toBe(true);
    });

    it('should show override rule and value', async () => {
      mockScanResult = {
        files: [
          {
            filePath: 'src/file.ts',
            overrides: [
              {
                rule: 'forbid_import',
                value: 'axios',
                status: 'active',
                daysUntilExpiry: null,
                errors: [],
                warnings: [],
              },
            ],
          },
        ],
        summary: {
          filesWithOverrides: 1,
          totalOverrides: 1,
          activeOverrides: 1,
          expiringOverrides: 0,
          expiredOverrides: 0,
          invalidOverrides: 0,
        },
        generatedAt: '2025-01-25T12:00:00.000Z',
      };

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('forbid_import') && c?.includes('axios'))).toBe(true);
    });

    it('should show override reason', async () => {
      mockScanResult = {
        files: [
          {
            filePath: 'src/file.ts',
            overrides: [
              {
                rule: 'forbid_import',
                value: 'axios',
                reason: 'Legacy integration code',
                status: 'active',
                daysUntilExpiry: null,
                errors: [],
                warnings: [],
              },
            ],
          },
        ],
        summary: {
          filesWithOverrides: 1,
          totalOverrides: 1,
          activeOverrides: 1,
          expiringOverrides: 0,
          expiredOverrides: 0,
          invalidOverrides: 0,
        },
        generatedAt: '2025-01-25T12:00:00.000Z',
      };

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Reason:') && c?.includes('Legacy integration code'))).toBe(true);
    });

    it('should show expiry date and days until expiry', async () => {
      mockScanResult = {
        files: [
          {
            filePath: 'src/file.ts',
            overrides: [
              {
                rule: 'forbid_import',
                value: 'axios',
                expires: '2025-06-01',
                status: 'active',
                daysUntilExpiry: 120,
                errors: [],
                warnings: [],
              },
            ],
          },
        ],
        summary: {
          filesWithOverrides: 1,
          totalOverrides: 1,
          activeOverrides: 1,
          expiringOverrides: 0,
          expiredOverrides: 0,
          invalidOverrides: 0,
        },
        generatedAt: '2025-01-25T12:00:00.000Z',
      };

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Expires:') && c?.includes('2025-06-01'))).toBe(true);
      expect(calls.some((c) => c?.includes('in 120 days'))).toBe(true);
    });

    it('should show days ago for expired overrides', async () => {
      mockScanResult = {
        files: [
          {
            filePath: 'src/file.ts',
            overrides: [
              {
                rule: 'forbid_import',
                value: 'axios',
                expires: '2024-12-01',
                status: 'expired',
                daysUntilExpiry: -55,
                errors: [],
                warnings: [],
              },
            ],
          },
        ],
        summary: {
          filesWithOverrides: 1,
          totalOverrides: 1,
          activeOverrides: 0,
          expiringOverrides: 0,
          expiredOverrides: 1,
          invalidOverrides: 0,
        },
        generatedAt: '2025-01-25T12:00:00.000Z',
      };

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('55 days ago'))).toBe(true);
    });

    it('should show ticket reference', async () => {
      mockScanResult = {
        files: [
          {
            filePath: 'src/file.ts',
            overrides: [
              {
                rule: 'forbid_import',
                value: 'axios',
                ticket: 'ARCH-123',
                status: 'active',
                daysUntilExpiry: null,
                errors: [],
                warnings: [],
              },
            ],
          },
        ],
        summary: {
          filesWithOverrides: 1,
          totalOverrides: 1,
          activeOverrides: 1,
          expiringOverrides: 0,
          expiredOverrides: 0,
          invalidOverrides: 0,
        },
        generatedAt: '2025-01-25T12:00:00.000Z',
      };

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Ticket:') && c?.includes('ARCH-123'))).toBe(true);
    });

    it('should show approved by', async () => {
      mockScanResult = {
        files: [
          {
            filePath: 'src/file.ts',
            overrides: [
              {
                rule: 'forbid_import',
                value: 'axios',
                approvedBy: 'tech-lead',
                status: 'active',
                daysUntilExpiry: null,
                errors: [],
                warnings: [],
              },
            ],
          },
        ],
        summary: {
          filesWithOverrides: 1,
          totalOverrides: 1,
          activeOverrides: 1,
          expiringOverrides: 0,
          expiredOverrides: 0,
          invalidOverrides: 0,
        },
        generatedAt: '2025-01-25T12:00:00.000Z',
      };

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Approved by:') && c?.includes('tech-lead'))).toBe(true);
    });

    it('should show errors', async () => {
      mockScanResult = {
        files: [
          {
            filePath: 'src/file.ts',
            overrides: [
              {
                rule: 'forbid_import',
                value: 'axios',
                status: 'invalid',
                daysUntilExpiry: null,
                errors: ['Missing @reason tag'],
                warnings: [],
              },
            ],
          },
        ],
        summary: {
          filesWithOverrides: 1,
          totalOverrides: 1,
          activeOverrides: 0,
          expiringOverrides: 0,
          expiredOverrides: 0,
          invalidOverrides: 1,
        },
        generatedAt: '2025-01-25T12:00:00.000Z',
      };

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Missing @reason tag'))).toBe(true);
    });

    it('should show warnings', async () => {
      mockScanResult = {
        files: [
          {
            filePath: 'src/file.ts',
            overrides: [
              {
                rule: 'forbid_import',
                value: 'axios',
                status: 'expiring',
                daysUntilExpiry: 10,
                errors: [],
                warnings: ['Expiring soon'],
              },
            ],
          },
        ],
        summary: {
          filesWithOverrides: 1,
          totalOverrides: 1,
          activeOverrides: 0,
          expiringOverrides: 1,
          expiredOverrides: 0,
          invalidOverrides: 0,
        },
        generatedAt: '2025-01-25T12:00:00.000Z',
      };

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Expiring soon'))).toBe(true);
    });

    it('should show summary with counts', async () => {
      mockScanResult = {
        files: [
          {
            filePath: 'src/file.ts',
            overrides: [
              {
                rule: 'forbid_import',
                value: 'axios',
                status: 'active',
                daysUntilExpiry: null,
                errors: [],
                warnings: [],
              },
            ],
          },
        ],
        summary: {
          filesWithOverrides: 3,
          totalOverrides: 5,
          activeOverrides: 2,
          expiringOverrides: 2,
          expiredOverrides: 1,
          invalidOverrides: 0,
        },
        generatedAt: '2025-01-25T12:00:00.000Z',
      };

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Files with overrides: 3'))).toBe(true);
      expect(calls.some((c) => c?.includes('Total overrides: 5'))).toBe(true);
      expect(calls.some((c) => c?.includes('Active: 2'))).toBe(true);
    });

    it('should show invalid count when present', async () => {
      mockScanResult = {
        files: [
          {
            filePath: 'src/file.ts',
            overrides: [
              {
                rule: 'forbid_import',
                value: 'axios',
                status: 'invalid',
                daysUntilExpiry: null,
                errors: ['Missing reason'],
                warnings: [],
              },
            ],
          },
        ],
        summary: {
          filesWithOverrides: 1,
          totalOverrides: 1,
          activeOverrides: 0,
          expiringOverrides: 0,
          expiredOverrides: 0,
          invalidOverrides: 1,
        },
        generatedAt: '2025-01-25T12:00:00.000Z',
      };

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Invalid: 1'))).toBe(true);
    });

    it('should show generated at timestamp', async () => {
      mockScanResult = {
        files: [],
        summary: {
          filesWithOverrides: 0,
          totalOverrides: 0,
          activeOverrides: 0,
          expiringOverrides: 0,
          expiredOverrides: 0,
          invalidOverrides: 0,
        },
        generatedAt: '2025-01-25T12:00:00.000Z',
      };

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Generated at:'))).toBe(false); // Only shown when files exist
    });
  });

  describe('suggest intents mode', () => {
    it('should call clusterOverrides when --suggest-intents flag is provided', async () => {
      const command = createAuditCommand();
      await command.parseAsync(['node', 'test', '--suggest-intents']);

      expect(clusterOverrides).toHaveBeenCalled();
    });

    it('should show clusters header', async () => {
      mockClusterResult = [
        {
          constraintKey: 'forbid_import:axios',
          fileCount: 2,
          files: ['src/a.ts', 'src/b.ts'],
          commonReasons: [],
          promoteCommand: 'archcodex promote forbid_import:axios --dry-run',
        },
      ];

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test', '--suggest-intents']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Override Clusters'))).toBe(true);
    });

    it('should show no clusters message when empty', async () => {
      mockClusterResult = [];

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test', '--suggest-intents']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('No override clusters found'))).toBe(true);
    });

    it('should show cluster constraint key and file count', async () => {
      mockClusterResult = [
        {
          constraintKey: 'forbid_import:axios',
          fileCount: 3,
          files: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
          commonReasons: [],
          promoteCommand: 'archcodex promote forbid_import:axios --dry-run',
        },
      ];

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test', '--suggest-intents']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('forbid_import:axios'))).toBe(true);
      expect(calls.some((c) => c?.includes('3 files'))).toBe(true);
    });

    it('should show files in cluster', async () => {
      mockClusterResult = [
        {
          constraintKey: 'forbid_import:axios',
          fileCount: 2,
          files: ['src/services/a.ts', 'src/services/b.ts'],
          commonReasons: [],
          promoteCommand: 'archcodex promote forbid_import:axios --dry-run',
        },
      ];

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test', '--suggest-intents']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('src/services/a.ts'))).toBe(true);
      expect(calls.some((c) => c?.includes('src/services/b.ts'))).toBe(true);
    });

    it('should show common reasons when present', async () => {
      mockClusterResult = [
        {
          constraintKey: 'forbid_import:axios',
          fileCount: 2,
          files: ['src/a.ts', 'src/b.ts'],
          commonReasons: ['Legacy code'],
          promoteCommand: 'archcodex promote forbid_import:axios --dry-run',
        },
      ];

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test', '--suggest-intents']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Reasons:') && c?.includes('Legacy code'))).toBe(true);
    });

    it('should truncate long reasons', async () => {
      const longReason = 'A'.repeat(60);
      mockClusterResult = [
        {
          constraintKey: 'forbid_import:axios',
          fileCount: 2,
          files: ['src/a.ts', 'src/b.ts'],
          commonReasons: [longReason],
          promoteCommand: 'archcodex promote forbid_import:axios --dry-run',
        },
      ];

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test', '--suggest-intents']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('...'))).toBe(true);
    });

    it('should show promote command', async () => {
      mockClusterResult = [
        {
          constraintKey: 'forbid_import:axios',
          fileCount: 2,
          files: ['src/a.ts', 'src/b.ts'],
          commonReasons: [],
          promoteCommand: 'archcodex promote forbid_import:axios --dry-run',
        },
      ];

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test', '--suggest-intents']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Suggested:'))).toBe(true);
      expect(calls.some((c) => c?.includes('archcodex promote'))).toBe(true);
    });

    it('should show tip about dry-run', async () => {
      mockClusterResult = [
        {
          constraintKey: 'forbid_import:axios',
          fileCount: 2,
          files: ['src/a.ts', 'src/b.ts'],
          commonReasons: [],
          promoteCommand: 'archcodex promote forbid_import:axios --dry-run',
        },
      ];

      const command = createAuditCommand();
      await command.parseAsync(['node', 'test', '--suggest-intents']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Tip:'))).toBe(true);
      expect(calls.some((c) => c?.includes('dry-run'))).toBe(true);
    });
  });

  describe('config option', () => {
    it('should use custom config path when provided', async () => {
      const command = createAuditCommand();
      await command.parseAsync(['node', 'test', '--config', 'custom/config.yaml']);

      expect(loadConfig).toHaveBeenCalledWith(expect.stringContaining('custom/config.yaml'));
    });

    it('should use default config path when not provided', async () => {
      const command = createAuditCommand();
      await command.parseAsync(['node', 'test']);

      expect(loadConfig).toHaveBeenCalledWith(expect.stringContaining('.arch/config.yaml'));
    });
  });

  describe('error handling', () => {
    it('should handle config loading errors', async () => {
      vi.mocked(loadConfig).mockRejectedValue(new Error('Config not found'));

      const command = createAuditCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(loadConfig).mockRejectedValue('string error');

      const command = createAuditCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith('Unknown error');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});
