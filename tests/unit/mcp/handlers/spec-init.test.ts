/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for MCP spec init handler.
 * The existing spec.test.ts covers handleSpecScaffoldTouchpoints.
 * This file covers handleSpecInit which was previously untested.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSpecInit } from '../../../../src/mcp/handlers/spec.js';

// Mock dependencies
vi.mock('../../../../src/cli/commands/spec/index.js', () => ({
  runSpecInit: vi.fn(),
}));

vi.mock('../../../../src/core/spec/scaffold-touchpoints.js', () => ({
  generateTouchpointsFromEntity: vi.fn(),
  generateSpecWithTouchpoints: vi.fn(),
}));

vi.mock('../../../../src/core/registry/component-groups.js', () => ({
  loadComponentGroupsRegistry: vi.fn(),
}));

vi.mock('../../../../src/mcp/utils.js', () => ({
  isProjectInitialized: vi.fn(),
  findNearbyProject: vi.fn(),
}));

import { runSpecInit } from '../../../../src/cli/commands/spec/index.js';

describe('MCP Spec Init Handler', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleSpecInit', () => {
    it('should initialize SpecCodex successfully with created files', async () => {
      vi.mocked(runSpecInit).mockResolvedValue({
        success: true,
        filesCreated: [
          '.arch/specs/_base.yaml',
          '.arch/specs/_mixins.yaml',
          '.arch/specs/example.spec.yaml',
        ],
        filesSkipped: [],
        errors: [],
      });

      const result = await handleSpecInit(projectRoot, {});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.filesCreated).toHaveLength(3);
      expect(parsed.filesSkipped).toHaveLength(0);
      expect(parsed.errors).toHaveLength(0);
      expect(parsed.message).toContain('SpecCodex initialized successfully');
      expect(parsed.message).toContain('_base.yaml');
    });

    it('should include next steps in success message', async () => {
      vi.mocked(runSpecInit).mockResolvedValue({
        success: true,
        filesCreated: ['.arch/specs/_base.yaml'],
        filesSkipped: [],
        errors: [],
      });

      const result = await handleSpecInit(projectRoot, {});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toContain('Next steps');
      expect(parsed.message).toContain('_base.yaml');
      expect(parsed.message).toContain('_mixins.yaml');
      expect(parsed.message).toContain('example.spec.yaml');
      expect(parsed.message).toContain('spec generate');
    });

    it('should show skipped files in success message', async () => {
      vi.mocked(runSpecInit).mockResolvedValue({
        success: true,
        filesCreated: [],
        filesSkipped: [
          '.arch/specs/_base.yaml',
          '.arch/specs/_mixins.yaml',
        ],
        errors: [],
      });

      const result = await handleSpecInit(projectRoot, {});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.filesSkipped).toHaveLength(2);
      expect(parsed.message).toContain('Skipped (already exist)');
    });

    it('should pass force option', async () => {
      vi.mocked(runSpecInit).mockResolvedValue({
        success: true,
        filesCreated: ['.arch/specs/_base.yaml'],
        filesSkipped: [],
        errors: [],
      });

      await handleSpecInit(projectRoot, { force: true });

      expect(runSpecInit).toHaveBeenCalledWith({
        options: {
          force: true,
          minimal: undefined,
          projectRoot,
        },
      });
    });

    it('should pass minimal option', async () => {
      vi.mocked(runSpecInit).mockResolvedValue({
        success: true,
        filesCreated: ['.arch/specs/_base.yaml'],
        filesSkipped: [],
        errors: [],
      });

      await handleSpecInit(projectRoot, { minimal: true });

      expect(runSpecInit).toHaveBeenCalledWith({
        options: {
          force: undefined,
          minimal: true,
          projectRoot,
        },
      });
    });

    it('should not show example.spec.yaml step when minimal is true', async () => {
      vi.mocked(runSpecInit).mockResolvedValue({
        success: true,
        filesCreated: ['.arch/specs/_base.yaml'],
        filesSkipped: [],
        errors: [],
      });

      const result = await handleSpecInit(projectRoot, { minimal: true });

      const parsed = JSON.parse(result.content[0].text);
      // Minimal should skip the "Study example.spec.yaml" step
      expect(parsed.message).not.toContain('Study .arch/specs/example.spec.yaml');
    });

    it('should handle ARCH_NOT_INITIALIZED error', async () => {
      vi.mocked(runSpecInit).mockRejectedValue(new Error('ARCH_NOT_INITIALIZED: .arch directory missing'));

      const result = await handleSpecInit(projectRoot, {});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('ARCH_NOT_INITIALIZED');
      expect(parsed.message).toContain('.arch/ directory not found');
      expect(parsed.message).toContain('archcodex init');
    });

    it('should handle generic initialization failure', async () => {
      vi.mocked(runSpecInit).mockRejectedValue(new Error('Permission denied'));

      const result = await handleSpecInit(projectRoot, {});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('INIT_FAILED');
      expect(parsed.message).toContain('Initialization failed');
      expect(parsed.message).toContain('Permission denied');
    });

    it('should handle non-Error thrown values', async () => {
      vi.mocked(runSpecInit).mockRejectedValue('unexpected error string');

      const result = await handleSpecInit(projectRoot, {});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('INIT_FAILED');
      expect(parsed.message).toContain('unexpected error string');
    });

    it('should pass projectRoot to runSpecInit', async () => {
      vi.mocked(runSpecInit).mockResolvedValue({
        success: true,
        filesCreated: [],
        filesSkipped: [],
        errors: [],
      });

      await handleSpecInit('/custom/root', {});

      expect(runSpecInit).toHaveBeenCalledWith({
        options: expect.objectContaining({
          projectRoot: '/custom/root',
        }),
      });
    });

    it('should handle result with both created and skipped files', async () => {
      vi.mocked(runSpecInit).mockResolvedValue({
        success: true,
        filesCreated: ['.arch/specs/example.spec.yaml'],
        filesSkipped: ['.arch/specs/_base.yaml'],
        errors: [],
      });

      const result = await handleSpecInit(projectRoot, {});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.filesCreated).toHaveLength(1);
      expect(parsed.filesSkipped).toHaveLength(1);
      expect(parsed.message).toContain('Created');
      expect(parsed.message).toContain('Skipped');
    });

    it('should include errors from result in output', async () => {
      vi.mocked(runSpecInit).mockResolvedValue({
        success: true,
        filesCreated: ['.arch/specs/_base.yaml'],
        filesSkipped: [],
        errors: ['Warning: example spec already modified'],
      });

      const result = await handleSpecInit(projectRoot, {});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.errors).toHaveLength(1);
      expect(parsed.errors[0]).toContain('example spec already modified');
    });
  });
});
