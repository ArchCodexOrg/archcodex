/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for the watch command - file watching and re-validation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWatchCommand } from '../../../../src/cli/commands/watch.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: Object.assign((s: string) => s, {
      cyan: (s: string) => s,
      green: (s: string) => s,
    }),
    dim: (s: string) => s,
    cyan: (s: string) => s,
    yellow: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    blue: (s: string) => s,
    magenta: (s: string) => s,
  },
}));

// Track watcher event registrations
const mockFileWatcherOn = vi.fn().mockReturnThis();
const mockFileWatcherClose = vi.fn();
const mockRegistryWatcherOn = vi.fn().mockReturnThis();
const mockRegistryWatcherClose = vi.fn();

let watchCallIndex = 0;

// Mock chokidar to prevent actual file watching
vi.mock('chokidar', () => {
  const createChokidarMock = () => ({
    default: {
      watch: vi.fn().mockImplementation(() => {
        watchCallIndex++;
        if (watchCallIndex % 2 === 1) {
          // File watcher (first call)
          return {
            on: mockFileWatcherOn,
            close: mockFileWatcherClose,
          };
        } else {
          // Registry watcher (second call)
          return {
            on: mockRegistryWatcherOn,
            close: mockRegistryWatcherClose,
          };
        }
      }),
    },
    watch: vi.fn().mockImplementation(() => {
      watchCallIndex++;
      if (watchCallIndex % 2 === 1) {
        return {
          on: mockFileWatcherOn,
          close: mockFileWatcherClose,
        };
      } else {
        return {
          on: mockRegistryWatcherOn,
          close: mockRegistryWatcherClose,
        };
      }
    }),
  });
  return createChokidarMock();
});

// Mock dependencies
vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    version: '1.0',
    files: { scan: { include: ['src/**/*.ts'] } },
  }),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn().mockResolvedValue({
    nodes: { base: { description: 'Base' } },
    mixins: {},
  }),
  getRegistryFilePath: vi.fn().mockReturnValue('/project/.arch/registry.yaml'),
  getRegistryDirPath: vi.fn().mockReturnValue('/project/.arch/registry'),
}));

vi.mock('../../../../src/core/validation/engine.js', () => ({
  ValidationEngine: vi.fn(function() {
    return {
      validateFiles: vi.fn().mockResolvedValue({ results: [] }),
      dispose: vi.fn(),
    };
  }),
}));

vi.mock('../../../../src/utils/archignore.js', () => ({
  loadArchIgnore: vi.fn().mockResolvedValue({
    ignores: vi.fn().mockReturnValue(false),
  }),
}));

vi.mock('../../../../src/utils/file-system.js', () => ({
  fileExists: vi.fn().mockResolvedValue(false),
}));

vi.mock('node:fs/promises', () => ({
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
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

vi.mock('../../../../src/core/cache/types.js', () => ({
  CACHE_PATH: '.arch/.cache/validation.json',
}));

import chokidar from 'chokidar';
import { existsSync } from 'node:fs';
import { loadConfig } from '../../../../src/core/config/loader.js';
import { loadRegistry } from '../../../../src/core/registry/loader.js';
import { loadArchIgnore } from '../../../../src/utils/archignore.js';
import { ValidationEngine } from '../../../../src/core/validation/engine.js';
import { logger as log } from '../../../../src/utils/logger.js';

describe('watch command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let processCwdSpy: ReturnType<typeof vi.spyOn>;
  let processOnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    watchCallIndex = 0;
    mockFileWatcherOn.mockReturnThis();
    mockRegistryWatcherOn.mockReturnThis();

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      // Don't throw, just track the call
    }) as never);
    processCwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/project');
    processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
    processOnSpy.mockRestore();
  });

  describe('createWatchCommand', () => {
    it('should create a command with correct name', () => {
      const command = createWatchCommand();
      expect(command.name()).toBe('watch');
    });

    it('should have the correct description', () => {
      const command = createWatchCommand();
      expect(command.description()).toContain('Watch');
    });

    it('should have an optional patterns argument', () => {
      const command = createWatchCommand();
      const args = command.registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('patterns');
      expect(args[0].required).toBe(false);
      expect(args[0].variadic).toBe(true);
    });

    it('should have required options', () => {
      const command = createWatchCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--clear');
      expect(optionNames).toContain('--debounce');
      expect(optionNames).toContain('--config');
    });

    it('should have default value for debounce', () => {
      const command = createWatchCommand();
      const debounceOption = command.options.find((opt) => opt.long === '--debounce');
      expect(debounceOption?.defaultValue).toBe('300');
    });

    it('should have short flag for config', () => {
      const command = createWatchCommand();
      const configOption = command.options.find((opt) => opt.long === '--config');
      expect(configOption?.short).toBe('-c');
    });
  });

  describe('error handling', () => {
    it('should handle config loading error', async () => {
      vi.mocked(loadConfig).mockRejectedValueOnce(new Error('Config error'));

      const command = createWatchCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Ignore
      }

      expect(log.error).toHaveBeenCalledWith('Config error');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle registry loading error', async () => {
      vi.mocked(loadRegistry).mockRejectedValueOnce(new Error('Registry error'));

      const command = createWatchCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Ignore
      }

      expect(log.error).toHaveBeenCalledWith('Registry error');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle archignore loading error', async () => {
      vi.mocked(loadArchIgnore).mockRejectedValueOnce(new Error('Archignore error'));

      const command = createWatchCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Ignore
      }

      expect(log.error).toHaveBeenCalledWith('Archignore error');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(loadConfig).mockRejectedValueOnce('string error');

      const command = createWatchCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Ignore
      }

      expect(log.error).toHaveBeenCalledWith('Unknown error');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('initialization', () => {
    it('should load config on start', async () => {
      const command = createWatchCommand();

      const promise = command.parseAsync(['node', 'test']);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(loadConfig).toHaveBeenCalledWith('/project', undefined);
    });

    it('should load registry on start', async () => {
      const command = createWatchCommand();
      const promise = command.parseAsync(['node', 'test']);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(loadRegistry).toHaveBeenCalledWith('/project');
    });

    it('should load archignore on start', async () => {
      const command = createWatchCommand();
      const promise = command.parseAsync(['node', 'test']);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(loadArchIgnore).toHaveBeenCalledWith('/project');
    });

    it('should create validation engine', async () => {
      const command = createWatchCommand();
      const promise = command.parseAsync(['node', 'test']);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(ValidationEngine).toHaveBeenCalled();
    });

    it('should use custom config path when provided', async () => {
      const command = createWatchCommand();
      const promise = command.parseAsync(['node', 'test', '--config', 'custom/config.yaml']);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(loadConfig).toHaveBeenCalledWith('/project', 'custom/config.yaml');
    });

    it('should show watch mode header', async () => {
      const command = createWatchCommand();
      const promise = command.parseAsync(['node', 'test']);
      await new Promise(resolve => setTimeout(resolve, 50));

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Watch Mode'))).toBe(true);
    });

    it('should show watching patterns', async () => {
      const command = createWatchCommand();
      const promise = command.parseAsync(['node', 'test']);
      await new Promise(resolve => setTimeout(resolve, 50));

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Watching:'))).toBe(true);
    });

    it('should show debounce value', async () => {
      const command = createWatchCommand();
      const promise = command.parseAsync(['node', 'test']);
      await new Promise(resolve => setTimeout(resolve, 50));

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Debounce:'))).toBe(true);
    });

    it('should initialize successfully', async () => {
      const command = createWatchCommand();
      const promise = command.parseAsync(['node', 'test']);
      await new Promise(resolve => setTimeout(resolve, 50));

      // If we got here without errors, initialization succeeded
      expect(loadConfig).toHaveBeenCalled();
      expect(loadRegistry).toHaveBeenCalled();
      expect(loadArchIgnore).toHaveBeenCalled();
    });

    it('should use custom patterns when provided', async () => {
      const command = createWatchCommand();
      const promise = command.parseAsync(['node', 'test', 'lib/**/*.ts', 'app/**/*.ts']);
      await new Promise(resolve => setTimeout(resolve, 50));

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('lib/**/*.ts'))).toBe(true);
    });

    it('should show Press Ctrl+C message', async () => {
      const command = createWatchCommand();
      const promise = command.parseAsync(['node', 'test']);
      await new Promise(resolve => setTimeout(resolve, 50));

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Ctrl+C'))).toBe(true);
    });
  });

  describe('chokidar watcher setup', () => {
    it('should create two watchers (file and registry)', async () => {
      const command = createWatchCommand();
      const promise = command.parseAsync(['node', 'test']);
      await new Promise(resolve => setTimeout(resolve, 50));

      // chokidar.watch should be called twice (file watcher + registry watcher)
      expect(watchCallIndex).toBe(2);
    });

    it('should register event handlers on file watcher', async () => {
      const command = createWatchCommand();
      const promise = command.parseAsync(['node', 'test']);
      await new Promise(resolve => setTimeout(resolve, 50));

      const registeredEvents = mockFileWatcherOn.mock.calls.map(c => c[0]);
      expect(registeredEvents).toContain('ready');
      expect(registeredEvents).toContain('change');
      expect(registeredEvents).toContain('add');
      expect(registeredEvents).toContain('error');
    });

    it('should register event handlers on registry watcher', async () => {
      const command = createWatchCommand();
      const promise = command.parseAsync(['node', 'test']);
      await new Promise(resolve => setTimeout(resolve, 50));

      const registeredEvents = mockRegistryWatcherOn.mock.calls.map(c => c[0]);
      expect(registeredEvents).toContain('ready');
      expect(registeredEvents).toContain('change');
      expect(registeredEvents).toContain('add');
      expect(registeredEvents).toContain('unlink');
      expect(registeredEvents).toContain('error');
    });

    it('should register SIGINT handler for graceful shutdown', async () => {
      const command = createWatchCommand();
      const promise = command.parseAsync(['node', 'test']);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.anything());
    });
  });

  describe('debounce handling', () => {
    it('should use default debounce of 300ms', async () => {
      const command = createWatchCommand();
      const promise = command.parseAsync(['node', 'test']);
      await new Promise(resolve => setTimeout(resolve, 50));

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('300ms'))).toBe(true);
    });

    it('should use custom debounce value', async () => {
      const command = createWatchCommand();
      const promise = command.parseAsync(['node', 'test', '--debounce', '500']);
      await new Promise(resolve => setTimeout(resolve, 50));

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('500ms'))).toBe(true);
    });

    it('should fall back to 300ms for invalid debounce value', async () => {
      const command = createWatchCommand();
      const promise = command.parseAsync(['node', 'test', '--debounce', 'invalid']);
      await new Promise(resolve => setTimeout(resolve, 50));

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('300ms'))).toBe(true);
    });

    it('should fall back to 300ms for negative debounce value', async () => {
      const command = createWatchCommand();
      const promise = command.parseAsync(['node', 'test', '--debounce', '-100']);
      await new Promise(resolve => setTimeout(resolve, 50));

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('300ms'))).toBe(true);
    });
  });

  describe('graceful shutdown', () => {
    it('should close watchers and exit on SIGINT', async () => {
      const command = createWatchCommand();
      const promise = command.parseAsync(['node', 'test']);
      await new Promise(resolve => setTimeout(resolve, 50));

      // Get the SIGINT handler
      const sigintCall = processOnSpy.mock.calls.find(
        (c) => c[0] === 'SIGINT'
      );
      expect(sigintCall).toBeDefined();

      // Execute the handler
      const sigintHandler = sigintCall![1] as () => void;
      sigintHandler();

      // Verify cleanup
      expect(mockFileWatcherClose).toHaveBeenCalled();
      expect(mockRegistryWatcherClose).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });
  });

  describe('directory detection', () => {
    it('should check for standard directories to watch', async () => {
      const command = createWatchCommand();
      const promise = command.parseAsync(['node', 'test']);
      await new Promise(resolve => setTimeout(resolve, 50));

      // existsSync should be called to check for standard directories
      expect(existsSync).toHaveBeenCalled();
    });

    it('should fall back to cwd when no standard directories exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const command = createWatchCommand();
      const promise = command.parseAsync(['node', 'test']);
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should still create watchers even without standard dirs
      expect(watchCallIndex).toBe(2);
    });
  });
});
