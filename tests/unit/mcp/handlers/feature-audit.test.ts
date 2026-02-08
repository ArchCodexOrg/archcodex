/**
 * @arch archcodex.test.unit
 *
 * Tests for MCP feature-audit handler.
 * @see spec.archcodex.featureAudit in .arch/specs/archcodex/feature-audit.spec.yaml
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleFeatureAudit } from '../../../../src/mcp/handlers/feature-audit.js';

// Mock dependencies
vi.mock('../../../../src/core/audit/index.js', () => ({
  featureAudit: vi.fn(),
}));

vi.mock('../../../../src/mcp/utils.js', () => ({
  isProjectInitialized: vi.fn(),
  findNearbyProject: vi.fn(),
}));

import { featureAudit } from '../../../../src/core/audit/index.js';
import { isProjectInitialized, findNearbyProject } from '../../../../src/mcp/utils.js';

describe('MCP Feature Audit Handler', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isProjectInitialized).mockResolvedValue(true);
    vi.mocked(findNearbyProject).mockResolvedValue(null);
  });

  describe('handleFeatureAudit', () => {
    it('should return usage help when no mutation or entity provided', async () => {
      const result = await handleFeatureAudit(projectRoot, {});

      expect(result.content[0].text).toContain('Feature Audit');
      expect(result.content[0].text).toContain('Parameters');
      expect(result.isError).toBeUndefined();
    });

    it('should return error when project not initialized', async () => {
      vi.mocked(isProjectInitialized).mockResolvedValue(false);

      const result = await handleFeatureAudit(projectRoot, { mutation: 'test' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not initialized');
    });

    it('should suggest nearby project when not initialized', async () => {
      vi.mocked(isProjectInitialized).mockResolvedValue(false);
      vi.mocked(findNearbyProject).mockResolvedValue('/nearby/project');

      const result = await handleFeatureAudit(projectRoot, { mutation: 'test' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('/nearby/project');
    });

    it('should call featureAudit with mutation', async () => {
      vi.mocked(featureAudit).mockResolvedValue({
        status: 'complete',
        layers: {
          backend: { status: 'pass', checks: [] },
          frontend: { status: 'pass', checks: [] },
          ui: { status: 'skip', checks: [] },
        },
        remediation: [],
        summary: 'All checks passed',
      });

      const result = await handleFeatureAudit(projectRoot, { mutation: 'duplicateOrder' });

      expect(featureAudit).toHaveBeenCalledWith({
        mutation: 'duplicateOrder',
        entity: undefined,
        projectRoot,
        verbose: undefined,
      });
      expect(result.content[0].text).toContain('COMPLETE');
    });

    it('should call featureAudit with mutation and entity', async () => {
      vi.mocked(featureAudit).mockResolvedValue({
        status: 'incomplete',
        layers: {
          backend: { status: 'pass', checks: [] },
          frontend: { status: 'fail', checks: [{ name: 'hook_wrapper', status: 'missing' }] },
          ui: { status: 'skip', checks: [] },
        },
        remediation: ['Add hook wrapper'],
        summary: 'Frontend layer incomplete',
      });

      const result = await handleFeatureAudit(projectRoot, {
        mutation: 'duplicateOrder',
        entity: 'orders',
      });

      expect(featureAudit).toHaveBeenCalledWith({
        mutation: 'duplicateOrder',
        entity: 'orders',
        projectRoot,
        verbose: undefined,
      });
      expect(result.content[0].text).toContain('INCOMPLETE');
      expect(result.content[0].text).toContain('Remediation');
    });

    it('should handle verbose mode', async () => {
      vi.mocked(featureAudit).mockResolvedValue({
        status: 'complete',
        layers: {
          backend: { status: 'pass', checks: [] },
          frontend: { status: 'pass', checks: [] },
          ui: { status: 'pass', checks: [], componentGroup: 'order-cards' },
        },
        remediation: [],
        summary: 'All checks passed',
      });

      await handleFeatureAudit(projectRoot, {
        mutation: 'test',
        verbose: true,
      });

      expect(featureAudit).toHaveBeenCalledWith(
        expect.objectContaining({ verbose: true })
      );
    });

    it('should format backend layer results', async () => {
      vi.mocked(featureAudit).mockResolvedValue({
        status: 'incomplete',
        layers: {
          backend: {
            status: 'fail',
            checks: [
              { name: 'mutation_exists', status: 'found', file: 'src/domain/test/mutations.ts' },
              { name: 'barrel_export', status: 'missing', expected: 'index.ts' },
            ],
          },
          frontend: { status: 'skip', checks: [] },
          ui: { status: 'skip', checks: [] },
        },
        remediation: ['Export mutation from barrel'],
        summary: 'Backend incomplete',
      });

      const result = await handleFeatureAudit(projectRoot, { mutation: 'test' });

      expect(result.content[0].text).toContain('Backend Layer');
      expect(result.content[0].text).toContain('mutation_exists');
      expect(result.content[0].text).toContain('src/domain/test/mutations.ts');
    });

    it('should format UI layer with component group', async () => {
      vi.mocked(featureAudit).mockResolvedValue({
        status: 'incomplete',
        layers: {
          backend: { status: 'pass', checks: [] },
          frontend: { status: 'pass', checks: [] },
          ui: {
            status: 'fail',
            componentGroup: 'order-cards',
            checks: [
              { component: 'TaskCard', status: 'wired' },
              { component: 'NoteCard', status: 'missing', details: 'No handler reference' },
            ],
          },
        },
        remediation: ['Wire NoteCard to handler'],
        summary: 'UI incomplete',
      });

      const result = await handleFeatureAudit(projectRoot, {
        mutation: 'duplicate',
        entity: 'orders',
      });

      expect(result.content[0].text).toContain('UI Layer');
      expect(result.content[0].text).toContain('order-cards');
      expect(result.content[0].text).toContain('TaskCard');
      expect(result.content[0].text).toContain('NoteCard');
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(featureAudit).mockRejectedValue(new Error('Test error'));

      const result = await handleFeatureAudit(projectRoot, { mutation: 'test' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error running feature audit');
      expect(result.content[0].text).toContain('Test error');
    });

    it('should skip layers appropriately', async () => {
      vi.mocked(featureAudit).mockResolvedValue({
        status: 'complete',
        layers: {
          backend: { status: 'skip', checks: [] },
          frontend: { status: 'skip', checks: [] },
          ui: { status: 'pass', checks: [] },
        },
        remediation: [],
        summary: 'UI-only check passed',
      });

      const result = await handleFeatureAudit(projectRoot, { entity: 'testEntity' });

      expect(result.content[0].text).toContain('Skipped');
    });
  });
});
