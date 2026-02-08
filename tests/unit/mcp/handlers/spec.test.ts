/**
 * @arch archcodex.test.unit
 *
 * Tests for MCP spec handlers.
 * @see spec.archcodex.scaffoldTouchpoints in .arch/specs/archcodex/scaffold-touchpoints.spec.yaml
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSpecInit, handleSpecScaffoldTouchpoints } from '../../../../src/mcp/handlers/spec.js';

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
import { generateTouchpointsFromEntity, generateSpecWithTouchpoints } from '../../../../src/core/spec/scaffold-touchpoints.js';
import { loadComponentGroupsRegistry } from '../../../../src/core/registry/component-groups.js';
import { isProjectInitialized, findNearbyProject } from '../../../../src/mcp/utils.js';

describe('MCP Spec Scaffold Touchpoints Handler', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isProjectInitialized).mockResolvedValue(true);
    vi.mocked(findNearbyProject).mockResolvedValue(null);
    vi.mocked(loadComponentGroupsRegistry).mockResolvedValue({
      'component-groups': {
        'order-cards': {
          description: 'Order card components',
          components: [
            { path: 'src/components/orders/TaskCard.tsx', renders: 'task' },
            { path: 'src/components/orders/NoteCard.tsx', renders: 'note' },
          ],
          triggers: {
            entities: ['orders'],
          },
        },
      },
    });
  });

  describe('handleSpecScaffoldTouchpoints', () => {
    it('should return usage help when no specId provided', async () => {
      const result = await handleSpecScaffoldTouchpoints(projectRoot, {
        specId: '',
        entity: 'test',
      });

      expect(result.content[0].text).toContain('Spec Scaffold with Touchpoints');
      expect(result.content[0].text).toContain('Parameters');
    });

    it('should return error when no entity provided', async () => {
      const result = await handleSpecScaffoldTouchpoints(projectRoot, {
        specId: 'spec.test.create',
        entity: '',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('entity parameter is required');
    });

    it('should return error when project not initialized', async () => {
      vi.mocked(isProjectInitialized).mockResolvedValue(false);

      const result = await handleSpecScaffoldTouchpoints(projectRoot, {
        specId: 'spec.test.create',
        entity: 'testEntity',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not initialized');
    });

    it('should suggest nearby project when not initialized', async () => {
      vi.mocked(isProjectInitialized).mockResolvedValue(false);
      vi.mocked(findNearbyProject).mockResolvedValue('/nearby/project');

      const result = await handleSpecScaffoldTouchpoints(projectRoot, {
        specId: 'spec.test.create',
        entity: 'testEntity',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('/nearby/project');
    });

    it('should generate spec with touchpoints', async () => {
      vi.mocked(generateTouchpointsFromEntity).mockResolvedValue({
        touchpoints: [
          { component: 'TaskCard', handler: 'handleDuplicate', wired: false, priority: 'required' },
          { component: 'NoteCard', handler: 'handleDuplicate', wired: false, priority: 'required' },
        ],
        componentGroup: 'order-cards',
        warning: 'Update all cards together',
      });
      vi.mocked(generateSpecWithTouchpoints).mockReturnValue(`
spec.orders.duplicateEntry:
  inherits: spec.function
  ui:
    touchpoints:
      - component: TaskCard
        handler: handleDuplicate
      - component: NoteCard
        handler: handleDuplicate
`);

      const result = await handleSpecScaffoldTouchpoints(projectRoot, {
        specId: 'spec.orders.duplicateEntry',
        entity: 'orders',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.specId).toBe('spec.orders.duplicateEntry');
      expect(parsed.entity).toBe('orders');
      expect(parsed.componentGroup).toBe('order-cards');
      expect(parsed.touchpointsCount).toBe(2);
      expect(parsed.warning).toBe('Update all cards together');
      expect(parsed.yaml).toContain('handleDuplicate');
    });

    it('should pass operation to generator', async () => {
      vi.mocked(generateTouchpointsFromEntity).mockResolvedValue({
        touchpoints: [],
        componentGroup: undefined,
      });
      vi.mocked(generateSpecWithTouchpoints).mockReturnValue('yaml: content');

      await handleSpecScaffoldTouchpoints(projectRoot, {
        specId: 'spec.orders.archiveOrder',
        entity: 'orders',
        operation: 'archive',
      });

      expect(generateTouchpointsFromEntity).toHaveBeenCalledWith({
        entity: 'orders',
        operation: 'archive',
        projectRoot,
      });
    });

    it('should handle no matching component group', async () => {
      vi.mocked(generateTouchpointsFromEntity).mockResolvedValue({
        touchpoints: [],
        componentGroup: undefined,
      });
      vi.mocked(generateSpecWithTouchpoints).mockReturnValue('spec.orders.test:\n  ui: {}');

      const result = await handleSpecScaffoldTouchpoints(projectRoot, {
        specId: 'spec.orders.test',
        entity: 'unknownEntity',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.touchpointsCount).toBe(0);
      expect(parsed.componentGroup).toBeUndefined();
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(loadComponentGroupsRegistry).mockRejectedValue(new Error('Failed to load'));

      const result = await handleSpecScaffoldTouchpoints(projectRoot, {
        specId: 'spec.test.create',
        entity: 'testEntity',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error scaffolding spec');
      expect(result.content[0].text).toContain('Failed to load');
    });
  });
});

describe('MCP Spec Init Handler', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleSpecInit', () => {
    it('should return success result when initialization succeeds', async () => {
      vi.mocked(runSpecInit).mockResolvedValue({
        success: true,
        filesCreated: ['.arch/specs/_base.yaml', '.arch/specs/_mixins.yaml'],
        filesSkipped: [],
        errors: [],
      });

      const result = await handleSpecInit(projectRoot, {});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.filesCreated).toHaveLength(2);
      expect(parsed.message).toContain('initialized successfully');
    });

    it('should include "Created" section in message when files are created', async () => {
      vi.mocked(runSpecInit).mockResolvedValue({
        success: true,
        filesCreated: ['.arch/specs/_base.yaml'],
        filesSkipped: [],
        errors: [],
      });

      const result = await handleSpecInit(projectRoot, {});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toContain('Created:');
      expect(parsed.message).toContain('_base.yaml');
    });

    it('should include "Skipped" section when files are skipped', async () => {
      vi.mocked(runSpecInit).mockResolvedValue({
        success: true,
        filesCreated: [],
        filesSkipped: ['.arch/specs/_base.yaml', '.arch/specs/_mixins.yaml'],
        errors: [],
      });

      const result = await handleSpecInit(projectRoot, {});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toContain('Skipped (already exist)');
      expect(parsed.filesSkipped).toHaveLength(2);
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
    });

    it('should include example step when not minimal', async () => {
      vi.mocked(runSpecInit).mockResolvedValue({
        success: true,
        filesCreated: [],
        filesSkipped: [],
        errors: [],
      });

      const result = await handleSpecInit(projectRoot, { minimal: false });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toContain('example.spec.yaml');
    });

    it('should not include example step when minimal is true', async () => {
      vi.mocked(runSpecInit).mockResolvedValue({
        success: true,
        filesCreated: [],
        filesSkipped: [],
        errors: [],
      });

      const result = await handleSpecInit(projectRoot, { minimal: true });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).not.toContain('example.spec.yaml');
    });

    it('should pass force option to runSpecInit', async () => {
      vi.mocked(runSpecInit).mockResolvedValue({
        success: true,
        filesCreated: [],
        filesSkipped: [],
        errors: [],
      });

      await handleSpecInit(projectRoot, { force: true });

      expect(runSpecInit).toHaveBeenCalledWith({
        options: expect.objectContaining({
          force: true,
          projectRoot,
        }),
      });
    });

    it('should pass minimal option to runSpecInit', async () => {
      vi.mocked(runSpecInit).mockResolvedValue({
        success: true,
        filesCreated: [],
        filesSkipped: [],
        errors: [],
      });

      await handleSpecInit(projectRoot, { minimal: true });

      expect(runSpecInit).toHaveBeenCalledWith({
        options: expect.objectContaining({
          minimal: true,
          projectRoot,
        }),
      });
    });

    it('should return error when ARCH_NOT_INITIALIZED', async () => {
      vi.mocked(runSpecInit).mockRejectedValue(
        new Error('ARCH_NOT_INITIALIZED: .arch/ directory not found')
      );

      const result = await handleSpecInit(projectRoot, {});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('ARCH_NOT_INITIALIZED');
      expect(parsed.message).toContain('.arch/ directory not found');
    });

    it('should return generic error for other failures', async () => {
      vi.mocked(runSpecInit).mockRejectedValue(
        new Error('Permission denied')
      );

      const result = await handleSpecInit(projectRoot, {});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('INIT_FAILED');
      expect(parsed.message).toContain('Permission denied');
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(runSpecInit).mockRejectedValue('string error');

      const result = await handleSpecInit(projectRoot, {});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('INIT_FAILED');
    });

    it('should use projectRoot parameter', async () => {
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
  });
});
