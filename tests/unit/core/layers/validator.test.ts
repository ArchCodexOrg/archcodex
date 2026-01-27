/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for layer boundary validator.
 */
import { describe, it, expect } from 'vitest';
import { LayerBoundaryValidator } from '../../../../src/core/layers/validator.js';
import type { ImportGraph } from '../../../../src/core/imports/types.js';
import type { LayerConfig } from '../../../../src/core/config/schema.js';

describe('LayerBoundaryValidator', () => {
  const projectRoot = '/project';

  const createGraph = (
    nodes: Array<{ path: string; imports: string[] }>
  ): ImportGraph => ({
    nodes: new Map(
      nodes.map((n) => [
        `${projectRoot}/${n.path}`,
        {
          filePath: `${projectRoot}/${n.path}`,
          archId: null,
          imports: n.imports.map((i) => `${projectRoot}/${i}`),
          importedBy: new Set<string>(),
        },
      ])
    ),
  });

  describe('validate', () => {
    it('should pass when no layers are configured', () => {
      const validator = new LayerBoundaryValidator(projectRoot, []);
      const graph = createGraph([
        { path: 'src/core/index.ts', imports: ['src/cli/command.ts'] },
      ]);

      const result = validator.validate(graph);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should allow imports within the same layer', () => {
      const layers: LayerConfig[] = [
        { name: 'core', paths: ['src/core/**'], can_import: [] },
      ];
      const validator = new LayerBoundaryValidator(projectRoot, layers);

      const graph = createGraph([
        { path: 'src/core/utils.ts', imports: [] },
        { path: 'src/core/index.ts', imports: ['src/core/utils.ts'] },
      ]);

      const result = validator.validate(graph);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should allow imports to permitted layers', () => {
      const layers: LayerConfig[] = [
        { name: 'utils', paths: ['src/utils/**'], can_import: [] },
        { name: 'core', paths: ['src/core/**'], can_import: ['utils'] },
      ];
      const validator = new LayerBoundaryValidator(projectRoot, layers);

      const graph = createGraph([
        { path: 'src/utils/helpers.ts', imports: [] },
        { path: 'src/core/engine.ts', imports: ['src/utils/helpers.ts'] },
      ]);

      const result = validator.validate(graph);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should reject imports to forbidden layers', () => {
      const layers: LayerConfig[] = [
        { name: 'utils', paths: ['src/utils/**'], can_import: [] },
        { name: 'core', paths: ['src/core/**'], can_import: [] }, // core cannot import anything
      ];
      const validator = new LayerBoundaryValidator(projectRoot, layers);

      const graph = createGraph([
        { path: 'src/utils/helpers.ts', imports: [] },
        { path: 'src/core/engine.ts', imports: ['src/utils/helpers.ts'] },
      ]);

      const result = validator.validate(graph);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].sourceLayer).toBe('core');
      expect(result.violations[0].importedLayer).toBe('utils');
      expect(result.violations[0].sourceFile).toBe('src/core/engine.ts');
      expect(result.violations[0].importedFile).toBe('src/utils/helpers.ts');
    });

    it('should ignore files not in any defined layer', () => {
      const layers: LayerConfig[] = [
        { name: 'core', paths: ['src/core/**'], can_import: [] },
      ];
      const validator = new LayerBoundaryValidator(projectRoot, layers);

      const graph = createGraph([
        { path: 'src/external/service.ts', imports: ['src/core/utils.ts'] },
        { path: 'src/core/utils.ts', imports: [] },
      ]);

      const result = validator.validate(graph);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should ignore imports to files not in any layer', () => {
      const layers: LayerConfig[] = [
        { name: 'core', paths: ['src/core/**'], can_import: [] },
      ];
      const validator = new LayerBoundaryValidator(projectRoot, layers);

      const graph = createGraph([
        { path: 'src/core/engine.ts', imports: ['src/external/service.ts'] },
        { path: 'src/external/service.ts', imports: [] },
      ]);

      const result = validator.validate(graph);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should handle glob patterns correctly', () => {
      const layers: LayerConfig[] = [
        { name: 'utils', paths: ['src/utils/**', 'src/common/**'], can_import: [] },
        { name: 'core', paths: ['src/core/**'], can_import: ['utils'] },
      ];
      const validator = new LayerBoundaryValidator(projectRoot, layers);

      const graph = createGraph([
        { path: 'src/utils/helpers.ts', imports: [] },
        { path: 'src/common/types.ts', imports: [] },
        { path: 'src/core/engine.ts', imports: ['src/utils/helpers.ts', 'src/common/types.ts'] },
      ]);

      const result = validator.validate(graph);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should handle multiple patterns per layer', () => {
      const layers: LayerConfig[] = [
        { name: 'infra', paths: ['src/infra/**', 'src/validators/**'], can_import: [] },
        { name: 'core', paths: ['src/core/**'], can_import: [] }, // core cannot import infra
      ];
      const validator = new LayerBoundaryValidator(projectRoot, layers);

      const graph = createGraph([
        { path: 'src/infra/database.ts', imports: [] },
        { path: 'src/validators/schema.ts', imports: [] },
        {
          path: 'src/core/engine.ts',
          imports: ['src/infra/database.ts', 'src/validators/schema.ts'],
        },
      ]);

      const result = validator.validate(graph);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(2);
      expect(result.violations.every((v) => v.sourceLayer === 'core')).toBe(true);
      expect(result.violations.every((v) => v.importedLayer === 'infra')).toBe(true);
    });

    it('should report multiple violations from the same file', () => {
      const layers: LayerConfig[] = [
        { name: 'utils', paths: ['src/utils/**'], can_import: [] },
        { name: 'infra', paths: ['src/infra/**'], can_import: [] },
        { name: 'core', paths: ['src/core/**'], can_import: [] }, // cannot import anything
      ];
      const validator = new LayerBoundaryValidator(projectRoot, layers);

      const graph = createGraph([
        { path: 'src/utils/helpers.ts', imports: [] },
        { path: 'src/infra/database.ts', imports: [] },
        {
          path: 'src/core/engine.ts',
          imports: ['src/utils/helpers.ts', 'src/infra/database.ts'],
        },
      ]);

      const result = validator.validate(graph);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(2);
    });

    it('should provide clear violation messages', () => {
      const layers: LayerConfig[] = [
        { name: 'utils', paths: ['src/utils/**'], can_import: [] },
        { name: 'core', paths: ['src/core/**'], can_import: [] },
      ];
      const validator = new LayerBoundaryValidator(projectRoot, layers);

      const graph = createGraph([
        { path: 'src/utils/helpers.ts', imports: [] },
        { path: 'src/core/engine.ts', imports: ['src/utils/helpers.ts'] },
      ]);

      const result = validator.validate(graph);

      expect(result.violations[0].message).toContain("Layer 'core' cannot import from 'utils'");
      expect(result.violations[0].message).toContain('allowed: none');
    });

    it('should list allowed layers in violation message', () => {
      const layers: LayerConfig[] = [
        { name: 'utils', paths: ['src/utils/**'], can_import: [] },
        { name: 'infra', paths: ['src/infra/**'], can_import: [] },
        { name: 'core', paths: ['src/core/**'], can_import: ['utils'] }, // can only import utils
      ];
      const validator = new LayerBoundaryValidator(projectRoot, layers);

      const graph = createGraph([
        { path: 'src/infra/database.ts', imports: [] },
        { path: 'src/core/engine.ts', imports: ['src/infra/database.ts'] },
      ]);

      const result = validator.validate(graph);

      expect(result.violations[0].message).toContain("Layer 'core' cannot import from 'infra'");
      expect(result.violations[0].message).toContain('allowed: utils');
      expect(result.violations[0].allowedLayers).toContain('utils');
    });

    it('should handle complex multi-layer architecture', () => {
      const layers: LayerConfig[] = [
        { name: 'utils', paths: ['src/utils/**'], can_import: [] },
        { name: 'core', paths: ['src/core/**'], can_import: ['utils'] },
        { name: 'infra', paths: ['src/infra/**'], can_import: ['utils', 'core'] },
        { name: 'cli', paths: ['src/cli/**'], can_import: ['utils', 'core', 'infra'] },
      ];
      const validator = new LayerBoundaryValidator(projectRoot, layers);

      // Valid imports following the hierarchy
      const graph = createGraph([
        { path: 'src/utils/helpers.ts', imports: [] },
        { path: 'src/core/engine.ts', imports: ['src/utils/helpers.ts'] },
        { path: 'src/infra/database.ts', imports: ['src/utils/helpers.ts', 'src/core/engine.ts'] },
        {
          path: 'src/cli/main.ts',
          imports: ['src/utils/helpers.ts', 'src/core/engine.ts', 'src/infra/database.ts'],
        },
      ]);

      const result = validator.validate(graph);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect upward violations in layer hierarchy', () => {
      const layers: LayerConfig[] = [
        { name: 'utils', paths: ['src/utils/**'], can_import: [] },
        { name: 'core', paths: ['src/core/**'], can_import: ['utils'] },
        { name: 'cli', paths: ['src/cli/**'], can_import: ['utils', 'core'] },
      ];
      const validator = new LayerBoundaryValidator(projectRoot, layers);

      // Invalid: core importing from cli (upward import)
      const graph = createGraph([
        { path: 'src/cli/command.ts', imports: [] },
        { path: 'src/core/engine.ts', imports: ['src/cli/command.ts'] },
      ]);

      const result = validator.validate(graph);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].sourceLayer).toBe('core');
      expect(result.violations[0].importedLayer).toBe('cli');
    });
  });

  describe('getLayers', () => {
    it('should return resolved layers', () => {
      const layers: LayerConfig[] = [
        { name: 'utils', paths: ['src/utils/**'], can_import: [] },
        { name: 'core', paths: ['src/core/**'], can_import: ['utils'] },
      ];
      const validator = new LayerBoundaryValidator(projectRoot, layers);

      const resolved = validator.getLayers();

      expect(resolved).toHaveLength(2);
      expect(resolved[0].name).toBe('utils');
      expect(resolved[0].patterns).toEqual(['src/utils/**']);
      expect(resolved[0].canImport.size).toBe(0);
      expect(resolved[1].name).toBe('core');
      expect(resolved[1].canImport.has('utils')).toBe(true);
    });
  });

  describe('exclude patterns', () => {
    it('should exclude files matching exclude patterns', () => {
      const layers: LayerConfig[] = [
        {
          name: 'convex',
          paths: ['convex/**'],
          can_import: [],
          exclude: ['convex/_generated/**', 'convex/**/types.ts'],
        },
        { name: 'core', paths: ['src/core/**'], can_import: [] },
      ];
      const validator = new LayerBoundaryValidator(projectRoot, layers);

      // Generated files importing from core should NOT cause violations
      // because they are excluded from the 'convex' layer
      const graph = createGraph([
        { path: 'convex/_generated/api.ts', imports: ['src/core/engine.ts'] },
        { path: 'convex/mutations/types.ts', imports: ['src/core/engine.ts'] },
        { path: 'src/core/engine.ts', imports: [] },
      ]);

      const result = validator.validate(graph);

      // Should pass because excluded files are not in any layer
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should still validate non-excluded files in layer', () => {
      const layers: LayerConfig[] = [
        {
          name: 'convex',
          paths: ['convex/**'],
          can_import: [],
          exclude: ['convex/_generated/**'],
        },
        { name: 'core', paths: ['src/core/**'], can_import: [] },
      ];
      const validator = new LayerBoundaryValidator(projectRoot, layers);

      // Non-generated convex file importing from core should still violate
      const graph = createGraph([
        { path: 'convex/mutations/create.ts', imports: ['src/core/engine.ts'] },
        { path: 'src/core/engine.ts', imports: [] },
      ]);

      const result = validator.validate(graph);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].sourceLayer).toBe('convex');
      expect(result.violations[0].importedLayer).toBe('core');
    });

    it('should handle multiple exclude patterns', () => {
      const layers: LayerConfig[] = [
        {
          name: 'convex',
          paths: ['convex/**'],
          can_import: [],
          exclude: [
            'convex/_generated/**',
            'convex/**/types.ts',
            'convex/**/types/*.ts',
            'convex/**/*Types.ts',
          ],
        },
      ];
      const validator = new LayerBoundaryValidator(projectRoot, layers);

      const resolved = validator.getLayers();

      expect(resolved[0].excludePatterns).toHaveLength(4);
      expect(resolved[0].excludePatterns).toContain('convex/_generated/**');
      expect(resolved[0].excludePatterns).toContain('convex/**/types.ts');
    });
  });
});
