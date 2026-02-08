/**
 * @arch archcodex.test.unit
 *
 * Tests for spec verify subcommand registration and action execution.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerVerifyCommand } from '../../../../../src/cli/commands/spec/verify.js';

// --- Configurable mock state ---
let mockRegistry: { nodes: Record<string, unknown> };
let mockResolved: {
  valid: boolean;
  spec: { node: { implementation?: string } } | null;
  errors: Array<{ code: string; message: string }>;
};
let mockVerifyResult: { valid: boolean };
let mockImplContent: string;
let mockReadFileError: boolean;

// --- Mocks ---
vi.mock('../../../../../src/core/spec/index.js', () => ({
  loadSpecRegistry: vi.fn(async () => mockRegistry),
  resolveSpec: vi.fn(() => mockResolved),
  verifyImplementation: vi.fn(() => mockVerifyResult),
  formatVerifyResult: vi.fn(() => 'formatted verify output'),
}));

vi.mock('../../../../../src/utils/file-system.js', () => ({
  readFile: vi.fn(async () => {
    if (mockReadFileError) {
      throw new Error('File not found');
    }
    return mockImplContent;
  }),
}));

vi.mock('../../../../../src/utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('chalk', () => ({
  default: {
    red: (s: string) => s,
    yellow: (s: string) => s,
    green: (s: string) => s,
    cyan: (s: string) => s,
    dim: (s: string) => s,
    bold: (s: string) => s,
  },
}));

import {
  loadSpecRegistry,
  resolveSpec,
  verifyImplementation,
  formatVerifyResult,
} from '../../../../../src/core/spec/index.js';
import { logger } from '../../../../../src/utils/logger.js';

describe('registerVerifyCommand', () => {
  it('registers verify subcommand on parent', () => {
    const parent = new Command('spec');
    registerVerifyCommand(parent);

    const verify = parent.commands.find(c => c.name() === 'verify');
    expect(verify).toBeDefined();
    expect(verify!.description()).toContain('Verify');
  });

  it('verify command requires specId argument', () => {
    const parent = new Command('spec');
    registerVerifyCommand(parent);

    const verify = parent.commands.find(c => c.name() === 'verify')!;
    expect(verify.registeredArguments).toHaveLength(1);
    expect(verify.registeredArguments[0].name()).toBe('specId');
    expect(verify.registeredArguments[0].required).toBe(true);
  });

  it('verify command has --impl option', () => {
    const parent = new Command('spec');
    registerVerifyCommand(parent);

    const verify = parent.commands.find(c => c.name() === 'verify')!;
    const implOption = verify.options.find(o => o.long === '--impl');
    expect(implOption).toBeDefined();
  });

  it('verify command has --json option', () => {
    const parent = new Command('spec');
    registerVerifyCommand(parent);

    const verify = parent.commands.find(c => c.name() === 'verify')!;
    const jsonOption = verify.options.find(o => o.long === '--json');
    expect(jsonOption).toBeDefined();
  });

  it('verify command has --no-architecture option', () => {
    const parent = new Command('spec');
    registerVerifyCommand(parent);

    const verify = parent.commands.find(c => c.name() === 'verify')!;
    const opt = verify.options.find(o => o.long === '--no-architecture');
    expect(opt).toBeDefined();
  });

  it('verify command has --no-errors option', () => {
    const parent = new Command('spec');
    registerVerifyCommand(parent);

    const verify = parent.commands.find(c => c.name() === 'verify')!;
    const opt = verify.options.find(o => o.long === '--no-errors');
    expect(opt).toBeDefined();
  });

  it('verify command has --no-inputs option', () => {
    const parent = new Command('spec');
    registerVerifyCommand(parent);

    const verify = parent.commands.find(c => c.name() === 'verify')!;
    const opt = verify.options.find(o => o.long === '--no-inputs');
    expect(opt).toBeDefined();
  });
});

describe('verify command action', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let processCwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    processCwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/test-project');

    // Reset mock state
    mockRegistry = { nodes: { 'spec.test': {} } };
    mockResolved = {
      valid: true,
      spec: { node: { implementation: 'src/test.ts#myFunc' } },
      errors: [],
    };
    mockVerifyResult = { valid: true };
    mockImplContent = 'export function myFunc() {}';
    mockReadFileError = false;
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('spec resolution failure', () => {
    it('exits with 1 and logs errors when spec is invalid (text mode)', async () => {
      mockResolved = {
        valid: false,
        spec: null,
        errors: [{ code: 'NOT_FOUND', message: 'Spec not found' }],
      };

      const parent = new Command('spec');
      registerVerifyCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'verify', 'spec.missing']);
      } catch {
        // process.exit
      }

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('spec.missing'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('outputs JSON when spec is invalid with --json', async () => {
      mockResolved = {
        valid: false,
        spec: null,
        errors: [{ code: 'NOT_FOUND', message: 'Spec not found' }],
      };

      const parent = new Command('spec');
      registerVerifyCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'verify', 'spec.missing', '--json']);
      } catch {
        // process.exit
      }

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try {
          const parsed = JSON.parse(c[0] as string);
          return parsed.valid === false;
        } catch {
          return false;
        }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('implementation path resolution', () => {
    it('infers implementation path from spec implementation field', async () => {
      mockResolved = {
        valid: true,
        spec: { node: { implementation: 'src/services/user.ts#createUser' } },
        errors: [],
      };

      const parent = new Command('spec');
      registerVerifyCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'verify', 'spec.user.create']);
      } catch {
        // process.exit
      }

      expect(verifyImplementation).toHaveBeenCalled();
    });

    it('uses --impl option when provided', async () => {
      const parent = new Command('spec');
      registerVerifyCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'verify', 'spec.test', '--impl', 'src/custom.ts']);
      } catch {
        // process.exit
      }

      expect(verifyImplementation).toHaveBeenCalled();
    });

    it('exits with 1 when no implementation path and no implementation field in spec', async () => {
      mockResolved = {
        valid: true,
        spec: { node: {} },
        errors: [],
      };

      const parent = new Command('spec');
      registerVerifyCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'verify', 'spec.test']);
      } catch {
        // process.exit
      }

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('No implementation path'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('implementation file reading', () => {
    it('exits with 1 when implementation file not found (text mode)', async () => {
      mockReadFileError = true;

      const parent = new Command('spec');
      registerVerifyCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'verify', 'spec.test']);
      } catch {
        // process.exit
      }

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('not found'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('outputs JSON when implementation file not found with --json', async () => {
      mockReadFileError = true;

      const parent = new Command('spec');
      registerVerifyCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'verify', 'spec.test', '--json']);
      } catch {
        // process.exit
      }

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try {
          const parsed = JSON.parse(c[0] as string);
          return parsed.errors?.[0]?.code === 'IMPLEMENTATION_NOT_FOUND';
        } catch {
          return false;
        }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('verification results', () => {
    it('outputs formatted result when verification passes', async () => {
      mockVerifyResult = { valid: true };

      const parent = new Command('spec');
      registerVerifyCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'verify', 'spec.test']);
      } catch {
        // process.exit
      }

      expect(formatVerifyResult).toHaveBeenCalledWith(mockVerifyResult);
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('exits with 1 when verification fails', async () => {
      mockVerifyResult = { valid: false };

      const parent = new Command('spec');
      registerVerifyCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'verify', 'spec.test']);
      } catch {
        // process.exit
      }

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('outputs JSON when --json flag is used', async () => {
      mockVerifyResult = { valid: true };

      const parent = new Command('spec');
      registerVerifyCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'verify', 'spec.test', '--json']);
      } catch {
        // process.exit
      }

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try {
          JSON.parse(c[0] as string);
          return true;
        } catch {
          return false;
        }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);
    });

    it('passes architecture/errors/inputs options to verifyImplementation', async () => {
      const parent = new Command('spec');
      registerVerifyCommand(parent);

      try {
        await parent.parseAsync([
          'node', 'spec', 'verify', 'spec.test',
          '--no-architecture', '--no-errors', '--no-inputs',
        ]);
      } catch {
        // process.exit
      }

      expect(verifyImplementation).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          checkArchitecture: false,
          checkErrors: false,
          checkInputs: false,
        }),
      );
    });

    it('defaults to checking architecture/errors/inputs when flags not set', async () => {
      const parent = new Command('spec');
      registerVerifyCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'verify', 'spec.test']);
      } catch {
        // process.exit
      }

      expect(verifyImplementation).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          checkArchitecture: true,
          checkErrors: true,
          checkInputs: true,
        }),
      );
    });
  });

  describe('error handling', () => {
    it('catches unexpected errors and logs them (text mode)', async () => {
      vi.mocked(loadSpecRegistry).mockRejectedValueOnce(new Error('Unexpected failure'));

      const parent = new Command('spec');
      registerVerifyCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'verify', 'spec.test']);
      } catch {
        // process.exit
      }

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Unexpected failure'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('outputs JSON error when exception occurs with --json', async () => {
      vi.mocked(loadSpecRegistry).mockRejectedValueOnce(new Error('Unexpected failure'));

      const parent = new Command('spec');
      registerVerifyCommand(parent);

      try {
        await parent.parseAsync(['node', 'spec', 'verify', 'spec.test', '--json']);
      } catch {
        // process.exit
      }

      const jsonCalls = consoleLogSpy.mock.calls.filter(c => {
        try {
          const parsed = JSON.parse(c[0] as string);
          return parsed.error !== undefined;
        } catch {
          return false;
        }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});
