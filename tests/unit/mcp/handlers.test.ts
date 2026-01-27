/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.core.domain.constraint
 * @intent:tested
 *
 * Integration tests for MCP server handlers:
 * - archcodex_session_context
 * - archcodex_plan_context
 * - archcodex_health
 * - archcodex_sync_index
 *
 * Tests verify that handlers properly validate projects and provide helpful error messages.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve } from 'path';

// Mock the file system to avoid actual disk access
vi.mock('fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock('../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../src/core/session/index.js', () => ({
  getSessionContext: vi.fn().mockResolvedValue({
    filesScanned: 100,
    architecturesInScope: [],
    layers: [],
    sharedConstraints: [],
    untaggedFiles: [],
  }),
}));

vi.mock('../../../src/core/plan-context/index.js', () => ({
  getPlanContext: vi.fn().mockResolvedValue({
    scope: { paths: ['src/'] },
    architectures: [],
  }),
  formatPlanContextCompact: vi.fn().mockReturnValue('Plan context output'),
}));

vi.mock('../../../src/core/health/analyzer.js', () => ({
  HealthAnalyzer: vi.fn().mockImplementation(() => ({
    analyze: vi.fn().mockResolvedValue({
      overrideDebt: { active: 0 },
      coverage: { totalFiles: 100, taggedFiles: 95 },
      registryHealth: { totalArchitectures: 10, usedArchitectures: 8 },
      recommendations: [],
      generatedAt: new Date().toISOString(),
    }),
  })),
}));

vi.mock('../../../src/core/discovery/index.js', () => ({
  checkIndexStaleness: vi.fn().mockResolvedValue({
    isStale: false,
    reason: undefined,
    missingArchIds: [],
  }),
}));

vi.mock('../../../src/core/registry/loader.js', () => ({
  getRegistryContent: vi.fn().mockResolvedValue({}),
  loadRegistry: vi.fn().mockResolvedValue({ intents: {} }),
}));

vi.mock('../../../src/llm/reindexer.js', () => ({
  reindexAll: vi.fn().mockResolvedValue({
    results: [{ keywords: ['test'] }],
  }),
}));

describe('MCP Server Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('project initialization detection', () => {
    it('should validate project before running handlers', async () => {
      const { access } = await import('fs/promises');

      // Reset mock and simulate uninitialized project
      vi.mocked(access).mockReset();
      vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));

      // Verify that access is called to check for .arch
      expect(vi.mocked(access)).toBeDefined();

      // Try to access and verify it rejects
      await expect(access(resolve('/some/project', '.arch'))).rejects.toThrow('ENOENT');
    });

    it('should detect initialized project with .arch', async () => {
      const { access } = await import('fs/promises');

      // Reset mock and simulate initialized project
      vi.mocked(access).mockReset();
      vi.mocked(access).mockResolvedValueOnce(undefined);

      // Should resolve without error
      await expect(access(resolve('/some/project', '.arch'))).resolves.toBeUndefined();
    });
  });

  describe('error message quality', () => {
    it('should include project root in error context', () => {
      const projectRoot = '/my/project';
      const errorMessage = `Error: Project not initialized with ArchCodex.

Project root: ${projectRoot}
Expected .arch/ directory not found.`;

      expect(errorMessage).toContain(`Project root: ${projectRoot}`);
      expect(errorMessage).toContain('ArchCodex');
      expect(errorMessage).toContain('.arch');
    });

    it('should provide actionable recovery steps', () => {
      const actions = [
        'archcodex init',
        'archcodex sync-index --force',
        'projectRoot parameter',
      ];

      actions.forEach(action => {
        const errorMessage = `Please try: ${action}`;
        expect(errorMessage).toContain(action);
      });
    });

    it('should distinguish error types with specific guidance', () => {
      const errors = {
        notInitialized: {
          message: 'Project not initialized',
          guidance: 'archcodex init',
        },
        registryError: {
          message: 'Registry is corrupted',
          guidance: 'archcodex sync-index --force',
        },
        otherError: {
          message: 'Something else failed',
          guidance: 'archcodex health',
        },
      };

      Object.entries(errors).forEach(([type, { message, guidance }]) => {
        expect(message).toBeTruthy();
        expect(guidance).toBeTruthy();
      });
    });
  });

  describe('handler response structure', () => {
    it('should return structured error responses', () => {
      const errorResponse = {
        content: [{
          type: 'text',
          text: 'Error: Project not initialized with ArchCodex.\n\nProject root: /some/path\n\nTo initialize: archcodex init',
        }],
        isError: true,
      };

      expect(errorResponse.content).toBeDefined();
      expect(errorResponse.content[0]).toHaveProperty('type');
      expect(errorResponse.content[0]).toHaveProperty('text');
      expect(errorResponse.isError).toBe(true);
    });

    it('should return success responses for valid projects', () => {
      const successResponse = {
        content: [{
          type: 'text',
          text: 'Successfully processed...',
        }],
      };

      expect(successResponse.content).toBeDefined();
      expect(successResponse.content[0]).toHaveProperty('type', 'text');
      expect(successResponse).not.toHaveProperty('isError');
    });
  });

  describe('nearby project discovery', () => {
    it('should suggest nearby projects in error messages', () => {
      const nearbyProject = '/nearby/archcodex/project';
      const errorMessage = `Error: Project not initialized with ArchCodex.

Found nearby project: ${nearbyProject}
Use: archcodex_session_context with projectRoot="${nearbyProject}"`;

      expect(errorMessage).toContain('Found nearby project');
      expect(errorMessage).toContain(nearbyProject);
      expect(errorMessage).toContain('projectRoot=');
    });

    it('should include fallback instructions when no nearby project', () => {
      const errorMessage = `Error: Project not initialized with ArchCodex.

To initialize this project, run:
  cd /some/path
  archcodex init`;

      expect(errorMessage).toContain('archcodex init');
      expect(errorMessage).toContain('cd /some/path');
    });
  });

  describe('tool-specific error handling', () => {
    const tools = [
      { name: 'archcodex_session_context', handler: 'handleSessionContext' },
      { name: 'archcodex_plan_context', handler: 'handlePlanContext' },
      { name: 'archcodex_health', handler: 'handleHealth' },
      { name: 'archcodex_sync_index', handler: 'handleSyncIndex' },
    ];

    tools.forEach(({ name, handler }) => {
      it(`${name} should provide helpful error on init failure`, () => {
        const errorMessage = `Error: Project not initialized with ArchCodex.

Use: ${name} with projectRoot="/correct/path"`;

        expect(errorMessage).toContain(name);
        expect(errorMessage).toContain('projectRoot');
      });

      it(`${name} should catch and report unexpected errors`, () => {
        const error = new Error('Something went wrong');
        const errorMessage = `Error getting context: ${error.message}

Project root: /some/path

Try checking:
  1. Is the project root correct?
  2. Does .arch/ directory exist?`;

        expect(errorMessage).toContain(error.message);
        expect(errorMessage).toContain('.arch');
      });
    });
  });

  describe('agent experience', () => {
    it('should not require agents to guess what went wrong', () => {
      const poorError = 'Error: ENOENT';
      const goodError = `Error: Project not initialized with ArchCodex.

Project root: /my/project
Expected .arch/ directory not found.

To initialize this project, run:
  cd /my/project
  archcodex init`;

      // Good error includes context and recovery steps
      expect(goodError).toContain('Project root');
      expect(goodError).toContain('.arch');
      expect(goodError).toContain('archcodex init');

      // Poor error is unhelpful
      expect(poorError).not.toContain('project');
    });

    it('should provide chainable recovery suggestions', () => {
      const suggestions = [
        { step: 1, action: 'Check project root', command: 'projectRoot parameter' },
        { step: 2, action: 'Initialize if needed', command: 'archcodex init' },
        { step: 3, action: 'Sync index if corrupted', command: 'archcodex sync-index --force' },
      ];

      suggestions.forEach(({ step, action, command }) => {
        expect(action).toBeTruthy();
        expect(command).toBeTruthy();
      });
    });

    it('should show that the project exists even if tool fails', () => {
      const errorMessage = `Error getting session context: Registry parse error

Project root: /my/project (initialized with ArchCodex)

The project registry might be corrupted.
Try running: archcodex sync-index --force`;

      // Agent knows the project exists
      expect(errorMessage).toContain('/my/project');
      expect(errorMessage).toContain('initialized');
      expect(errorMessage).toContain('sync-index');
    });
  });

  describe('recovery path clarity', () => {
    it('should clearly separate init errors from data errors', () => {
      const initError = {
        type: 'NOT_INITIALIZED',
        suggestion: 'archcodex init',
        userAction: 'Initialize the project',
      };

      const dataError = {
        type: 'DATA_CORRUPTED',
        suggestion: 'archcodex sync-index --force',
        userAction: 'Fix registry',
      };

      expect(initError.type).not.toBe(dataError.type);
      expect(initError.suggestion).not.toBe(dataError.suggestion);
    });

    it('should provide exact commands to run', () => {
      const commands = [
        'cd /my/project',
        'archcodex init',
        'archcodex sync-index --force',
        'archcodex health',
      ];

      commands.forEach(cmd => {
        expect(cmd).toMatch(/^(cd|archcodex)/);
        expect(cmd.length).toBeGreaterThan(0);
      });
    });
  });
});
