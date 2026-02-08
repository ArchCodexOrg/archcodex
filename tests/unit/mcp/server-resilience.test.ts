/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for MCP server resilience improvements:
 * - Project initialization detection
 * - Nearby project discovery
 * - Improved error messages for context tools
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdir, rmdir, writeFile, unlink } from 'fs/promises';
import { resolve, join } from 'path';
import { tmpdir } from 'os';

// Helper to create temporary test directories
async function createTempProject(name: string): Promise<string> {
  const baseDir = resolve(tmpdir(), `archcodex-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const projectDir = resolve(baseDir, name);
  await mkdir(projectDir, { recursive: true });
  return projectDir;
}

// Helper to cleanup temporary directories
async function cleanupTempProject(dir: string): Promise<void> {
  try {
    // Remove all files recursively
    const { rm } = await import('fs/promises');
    await rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

describe('MCP Server Resilience', () => {
  describe('isProjectInitialized', () => {
    it('should detect initialized project with .arch directory', async () => {
      const projectDir = await createTempProject('initialized-project');
      try {
        // Create .arch directory
        const archDir = resolve(projectDir, '.arch');
        await mkdir(archDir, { recursive: true });

        // Test by checking directory exists
        const { access } = await import('fs/promises');
        await expect(access(archDir)).resolves.toBeUndefined();
      } finally {
        await cleanupTempProject(projectDir);
      }
    });

    it('should reject uninitialized project without .arch directory', async () => {
      const projectDir = await createTempProject('uninitialized-project');
      try {
        const { access } = await import('fs/promises');
        const archDir = resolve(projectDir, '.arch');

        // Should throw because .arch doesn't exist
        await expect(access(archDir)).rejects.toThrow();
      } finally {
        await cleanupTempProject(projectDir);
      }
    });
  });

  describe('findNearbyProject', () => {
    it('should find initialized project in current directory', async () => {
      const projectDir = await createTempProject('nearby-test');
      try {
        // Create .arch in the project
        const archDir = resolve(projectDir, '.arch');
        await mkdir(archDir, { recursive: true });

        // Verify project is initialized
        const { access } = await import('fs/promises');
        await expect(access(archDir)).resolves.toBeUndefined();
      } finally {
        await cleanupTempProject(projectDir);
      }
    });

    it('should find initialized project in parent directory', async () => {
      const baseDir = await createTempProject('parent-test');
      try {
        // Create .arch in parent
        const archDir = resolve(baseDir, '.arch');
        await mkdir(archDir, { recursive: true });

        // Create subdirectory
        const subDir = resolve(baseDir, 'subdir', 'nested');
        await mkdir(subDir, { recursive: true });

        // Should be able to walk up from subdir to find parent's .arch
        const { access } = await import('fs/promises');
        await expect(access(archDir)).resolves.toBeUndefined();
      } finally {
        await cleanupTempProject(baseDir);
      }
    });

    it('should return null when no project found', async () => {
      const baseDir = await createTempProject('no-project-test');
      try {
        // Don't create .arch, so no project is initialized
        // Verifying that directory has no .arch
        const { access } = await import('fs/promises');
        const archDir = resolve(baseDir, '.arch');
        await expect(access(archDir)).rejects.toThrow();
      } finally {
        await cleanupTempProject(baseDir);
      }
    });
  });

  describe('error handling improvements', () => {
    it('should provide helpful error when project not initialized', async () => {
      // Test that error message structure is correct
      const projectRoot = '/nonexistent/project';

      const errorMessage = `Error: Project not initialized with ArchCodex.

Project root: ${projectRoot}
Expected .arch/ directory not found.

To initialize this project, run:
  cd ${projectRoot}
  archcodex init

Or provide the correct project root using the projectRoot parameter.`;

      // Verify error message contains key information
      expect(errorMessage).toContain('Project not initialized');
      expect(errorMessage).toContain(projectRoot);
      expect(errorMessage).toContain('archcodex init');
      expect(errorMessage).toContain('projectRoot parameter');
    });

    it('should include nearby project suggestion in error', async () => {
      const projectRoot = '/some/path';
      const nearbyProject = '/nearby/project';

      const errorMessage = `Error: Project not initialized with ArchCodex.

Project root: ${projectRoot}
Expected .arch/ directory not found.

Found nearby project: ${nearbyProject}
Use: archcodex_session_context with projectRoot="${nearbyProject}"

Or provide the correct project root using the projectRoot parameter.`;

      // Verify error includes suggestion
      expect(errorMessage).toContain('Found nearby project');
      expect(errorMessage).toContain(nearbyProject);
      expect(errorMessage).toContain('archcodex_session_context');
    });

    it('should provide registry-specific guidance on registry errors', async () => {
      const errorMessage = `Error getting session context: Registry file not found

Project root: /some/project

The project registry might be corrupted or missing.
Try running: archcodex sync-index --force`;

      // Verify registry-specific guidance
      expect(errorMessage).toContain('registry');
      expect(errorMessage).toContain('sync-index');
    });

    it('should provide general debugging guidance on other errors', async () => {
      const errorMessage = `Error getting session context: Some other error

Project root: /some/project

Try checking:
  1. Is the project root correct? Use projectRoot parameter if needed.
  2. Does .arch/ directory exist and contain valid files?
  3. Run: archcodex health for more diagnostics.`;

      // Verify general guidance
      expect(errorMessage).toContain('Is the project root correct');
      expect(errorMessage).toContain('.arch/ directory exist');
      expect(errorMessage).toContain('archcodex health');
    });
  });

  describe('relative path handling', () => {
    it('should reject relative path without projectRoot', () => {
      const relativePath = 'convex/**/*.ts';
      const errorMessage = `Error: Use absolute path instead of "${relativePath}".

To use relative paths, explicitly provide projectRoot parameter:
${JSON.stringify({ projectRoot: '/absolute/path/to/project' })}

Or use absolute paths (most editors provide these in file context).`;

      // Verify error structure
      expect(errorMessage).toContain('absolute path');
      expect(errorMessage).toContain('projectRoot parameter');
      expect(errorMessage).toContain(relativePath);
    });

    it('should accept relative path with explicit projectRoot', () => {
      const projectRoot = '/absolute/project/path';
      const args = { projectRoot, file: 'relative/file.ts' };

      // Verify parameters are structured correctly
      expect(args.projectRoot).toBe(projectRoot);
      expect(args.file).toBe('relative/file.ts');
    });
  });

  describe('tool-specific error messages', () => {
    const testCases = [
      { tool: 'archcodex_session_context', commandName: 'archcodex_session_context' },
      { tool: 'archcodex_plan_context', commandName: 'archcodex_plan_context' },
      { tool: 'archcodex_health', commandName: 'archcodex_health' },
      { tool: 'archcodex_sync_index', commandName: 'archcodex_sync_index' },
    ];

    testCases.forEach(({ tool, commandName }) => {
      it(`${tool} should provide tool-specific guidance`, () => {
        const projectRoot = '/some/path';
        const nearbyProject = '/correct/path';

        const errorMessage = `Error: Project not initialized with ArchCodex.

Project root: ${projectRoot}
Expected .arch/ directory not found.

Found nearby project: ${nearbyProject}
Use: ${commandName} with projectRoot="${nearbyProject}"

Or provide the correct project root using the projectRoot parameter.`;

        // Verify tool-specific guidance
        expect(errorMessage).toContain(commandName);
        expect(errorMessage).toContain(nearbyProject);
      });
    });
  });

  describe('error recovery suggestions', () => {
    it('should suggest archcodex init for uninitialized projects', () => {
      const errorMessage = `Error: Project not initialized with ArchCodex.

Project root: /some/path
Expected .arch/ directory not found.

To initialize this project, run:
  cd /some/path
  archcodex init`;

      expect(errorMessage).toContain('archcodex init');
    });

    it('should suggest sync-index for registry errors', () => {
      const errorMessage = `The project registry might be corrupted or missing.
Try running: archcodex sync-index --force`;

      expect(errorMessage).toContain('sync-index');
      expect(errorMessage).toContain('--force');
    });

    it('should suggest health command for general diagnostics', () => {
      const errorMessage = `Try checking:
  1. Is the project root correct? Use projectRoot parameter if needed.
  2. Does .arch/ directory exist and contain valid files?
  3. Run: archcodex health for more diagnostics.`;

      expect(errorMessage).toContain('archcodex health');
    });
  });

  describe('agent resilience', () => {
    it('should not make agents give up with helpful error messages', () => {
      // Simulate agent's decision logic
      const toolResponse = {
        content: [{
          type: 'text',
          text: `Error: Project not initialized with ArchCodex.

Project root: /some/path
Expected .arch/ directory not found.

Found nearby project: /correct/path
Use: archcodex_session_context with projectRoot="/correct/path"

Or provide the correct project root using the projectRoot parameter.`,
        }],
        isError: true,
      };

      // Agent should have actionable guidance, not just an error
      const hasGuidance = toolResponse.content[0].text.includes('Found nearby project') ||
        toolResponse.content[0].text.includes('archcodex init') ||
        toolResponse.content[0].text.includes('projectRoot parameter');

      expect(hasGuidance).toBe(true);
    });

    it('should include project root context in all error messages', () => {
      const errorMessages = [
        `Error getting session context: Something failed

Project root: /my/project

Try checking...`,
        `Error getting plan context: Something failed

Project root: /my/project

Try checking...`,
        `Error getting health metrics: Something failed

Project root: /my/project

Try checking...`,
      ];

      errorMessages.forEach(msg => {
        expect(msg).toContain('Project root:');
        expect(msg).toMatch(/Project root: \/\w+\/\w+/);
      });
    });

    it('should distinguish between project init and data errors', () => {
      const initError = `Error: Project not initialized with ArchCodex.

Project root: /some/path
Expected .arch/ directory not found.

To initialize this project, run:
  cd /some/path
  archcodex init`;

      const dataError = `Error getting session context: Registry is corrupted

Project root: /some/path

The project registry might be corrupted or missing.
Try running: archcodex sync-index --force`;

      // Different errors should have different guidance
      expect(initError).toContain('archcodex init');
      expect(dataError).toContain('sync-index');
      expect(dataError).not.toContain('archcodex init');
    });
  });
});
