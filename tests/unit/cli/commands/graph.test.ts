/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for the graph command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGraphCommand } from '../../../../src/cli/commands/graph.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: (s: string) => s,
    dim: (s: string) => s,
  },
}));

// Configurable mock behavior
let mockBuildResult = {
  nodes: [
    { id: 'base', type: 'architecture', fileCount: 5 },
    { id: 'archcodex.core', type: 'architecture', fileCount: 10 },
  ] as { id: string; type: string; fileCount?: number }[],
  edges: [{ from: 'archcodex.core', to: 'base', type: 'inherits' }],
};
let mockFormatOutput = 'graph TD\n  base --> archcodex.core';

// Mock dependencies
vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    version: '1.0',
    registry: {},
  }),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn().mockResolvedValue({
    architectures: {
      base: { description: 'Base', rationale: 'Foundation' },
      'archcodex.core': { description: 'Core', rationale: 'Core logic', inherits: 'base' },
    },
    mixins: {},
  }),
}));

vi.mock('../../../../src/core/graph/index.js', () => ({
  GraphBuilder: vi.fn(function() {
    return {
    build: vi.fn().mockImplementation(async () => mockBuildResult),
    format: vi.fn().mockImplementation(() => mockFormatOutput),
  };
  }),
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
import { loadRegistry } from '../../../../src/core/registry/loader.js';
import { GraphBuilder } from '../../../../src/core/graph/index.js';
import { logger as log } from '../../../../src/utils/logger.js';

describe('graph command', () => {
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
    mockBuildResult = {
      nodes: [
        { id: 'base', type: 'architecture', fileCount: 5 },
        { id: 'archcodex.core', type: 'architecture', fileCount: 10 },
      ],
      edges: [{ from: 'archcodex.core', to: 'base', type: 'inherits' }],
    };
    mockFormatOutput = 'graph TD\n  base --> archcodex.core';
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
  });

  describe('createGraphCommand', () => {
    it('should create a command with correct name', () => {
      const command = createGraphCommand();
      expect(command.name()).toBe('graph');
    });

    it('should have the correct description', () => {
      const command = createGraphCommand();
      expect(command.description()).toContain('architecture');
    });

    it('should have required options', () => {
      const command = createGraphCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--format');
      expect(optionNames).toContain('--config');
      expect(optionNames).toContain('--show-files');
      expect(optionNames).toContain('--show-mixins');
      expect(optionNames).toContain('--root');
      expect(optionNames).toContain('--max-depth');
    });

    it('should have correct default for format option', () => {
      const command = createGraphCommand();
      const formatOption = command.options.find((opt) => opt.long === '--format');
      expect(formatOption?.defaultValue).toBe('mermaid');
    });

    it('should have short flags for common options', () => {
      const command = createGraphCommand();
      const options = command.options;

      const configOption = options.find((opt) => opt.long === '--config');
      expect(configOption?.short).toBe('-c');

      const formatOption = options.find((opt) => opt.long === '--format');
      expect(formatOption?.short).toBe('-f');
    });
  });

  describe('command execution', () => {
    it('should load config and registry', async () => {
      const command = createGraphCommand();
      await command.parseAsync(['node', 'test']);

      expect(loadConfig).toHaveBeenCalled();
      expect(loadRegistry).toHaveBeenCalled();
    });

    it('should create GraphBuilder with project root and registry', async () => {
      const command = createGraphCommand();
      await command.parseAsync(['node', 'test']);

      expect(GraphBuilder).toHaveBeenCalledWith('/project', expect.any(Object));
    });
  });

  describe('format validation', () => {
    it('should accept mermaid format', async () => {
      const command = createGraphCommand();
      await command.parseAsync(['node', 'test', '--format', 'mermaid']);

      // Command completes without error
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should accept graphviz format', async () => {
      const command = createGraphCommand();
      await command.parseAsync(['node', 'test', '--format', 'graphviz']);

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should accept json format', async () => {
      const command = createGraphCommand();
      await command.parseAsync(['node', 'test', '--format', 'json']);

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should reject invalid format', async () => {
      const command = createGraphCommand();

      try {
        await command.parseAsync(['node', 'test', '--format', 'invalid']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Invalid format'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('mermaid output', () => {
    it('should show graph header', async () => {
      const command = createGraphCommand();
      await command.parseAsync(['node', 'test', '--format', 'mermaid']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Architecture Graph'))).toBe(true);
      expect(calls.some((c) => c?.includes('mermaid'))).toBe(true);
    });

    it('should show formatted output', async () => {
      mockFormatOutput = 'graph TD\n  A --> B';

      const command = createGraphCommand();
      await command.parseAsync(['node', 'test', '--format', 'mermaid']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('graph TD'))).toBe(true);
    });

    it('should show summary with counts', async () => {
      const command = createGraphCommand();
      await command.parseAsync(['node', 'test', '--format', 'mermaid']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Architectures: 2'))).toBe(true);
      expect(calls.some((c) => c?.includes('Edges: 1'))).toBe(true);
    });

    it('should show files count when --show-files is used', async () => {
      const command = createGraphCommand();
      await command.parseAsync(['node', 'test', '--format', 'mermaid', '--show-files']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Files using architectures: 15'))).toBe(true);
    });

    it('should not show files count without --show-files', async () => {
      const command = createGraphCommand();
      await command.parseAsync(['node', 'test', '--format', 'mermaid']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Files using architectures'))).toBe(false);
    });
  });

  describe('graphviz output', () => {
    it('should show graphviz header', async () => {
      const command = createGraphCommand();
      await command.parseAsync(['node', 'test', '--format', 'graphviz']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Architecture Graph'))).toBe(true);
      expect(calls.some((c) => c?.includes('graphviz'))).toBe(true);
    });
  });

  describe('JSON output', () => {
    it('should output JSON without header', async () => {
      mockFormatOutput = '{"nodes":[],"edges":[]}';

      const command = createGraphCommand();
      await command.parseAsync(['node', 'test', '--format', 'json']);

      // JSON mode outputs only the JSON
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith('{"nodes":[],"edges":[]}');
    });

    it('should not show summary in JSON mode', async () => {
      mockFormatOutput = '{"nodes":[],"edges":[]}';

      const command = createGraphCommand();
      await command.parseAsync(['node', 'test', '--format', 'json']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Architectures:'))).toBe(false);
    });
  });

  describe('empty graph handling', () => {
    it('should warn when no architectures found', async () => {
      mockBuildResult = { nodes: [], edges: [] };

      const command = createGraphCommand();
      await command.parseAsync(['node', 'test']);

      expect(log.warn).toHaveBeenCalledWith('No architectures found in registry');
    });

    it('should not format when graph is empty', async () => {
      mockBuildResult = { nodes: [], edges: [] };

      const command = createGraphCommand();
      await command.parseAsync(['node', 'test']);

      // Only the warning, no graph output
      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('graph TD'))).toBe(false);
    });
  });

  describe('mixin counting', () => {
    it('should count mixins separately from architectures', async () => {
      mockBuildResult = {
        nodes: [
          { id: 'base', type: 'architecture' },
          { id: 'tested', type: 'mixin' },
          { id: 'srp', type: 'mixin' },
        ],
        edges: [],
      };

      const command = createGraphCommand();
      await command.parseAsync(['node', 'test', '--format', 'mermaid']);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Architectures: 1'))).toBe(true);
      expect(calls.some((c) => c?.includes('Mixins: 2'))).toBe(true);
    });
  });

  describe('config option', () => {
    it('should use custom config path when provided', async () => {
      const command = createGraphCommand();
      await command.parseAsync(['node', 'test', '--config', 'custom/config.yaml']);

      expect(loadConfig).toHaveBeenCalledWith(expect.stringContaining('custom/config.yaml'));
    });

    it('should use default config path when not provided', async () => {
      const command = createGraphCommand();
      await command.parseAsync(['node', 'test']);

      expect(loadConfig).toHaveBeenCalledWith(expect.stringContaining('.arch/config.yaml'));
    });
  });

  describe('error handling', () => {
    it('should handle config loading errors', async () => {
      vi.mocked(loadConfig).mockRejectedValue(new Error('Config not found'));

      const command = createGraphCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected - process.exit throws
      }

      expect(log.error).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(loadConfig).mockRejectedValue('string error');

      const command = createGraphCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalledWith('Unknown error');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle registry loading errors', async () => {
      vi.mocked(loadRegistry).mockRejectedValue(new Error('Registry not found'));

      const command = createGraphCommand();

      try {
        await command.parseAsync(['node', 'test']);
      } catch {
        // Expected
      }

      expect(log.error).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});
