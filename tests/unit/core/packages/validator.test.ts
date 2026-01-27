/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for package boundary validator.
 */
import { describe, it, expect } from 'vitest';
import { PackageBoundaryValidator } from '../../../../src/core/packages/validator.js';
import type { ImportGraph } from '../../../../src/core/imports/types.js';
import type { PackageConfig } from '../../../../src/core/config/schema.js';

describe('PackageBoundaryValidator', () => {
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
    it('should pass when no packages are configured', () => {
      const validator = new PackageBoundaryValidator(projectRoot, []);
      const graph = createGraph([
        { path: 'packages/core/index.ts', imports: ['packages/api/client.ts'] },
      ]);

      const result = validator.validate(graph);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should pass when imports are within allowed packages', () => {
      const packages: PackageConfig[] = [
        { path: 'packages/core', can_import: [] },
        { path: 'packages/api', can_import: ['packages/core'] },
      ];
      const validator = new PackageBoundaryValidator(projectRoot, packages);

      const graph = createGraph([
        { path: 'packages/core/utils.ts', imports: [] },
        { path: 'packages/api/client.ts', imports: ['packages/core/utils.ts'] },
      ]);

      const result = validator.validate(graph);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect violations when importing from disallowed packages', () => {
      const packages: PackageConfig[] = [
        { path: 'packages/core', can_import: [] },
        { path: 'packages/api', can_import: [] }, // api cannot import anything
      ];
      const validator = new PackageBoundaryValidator(projectRoot, packages);

      const graph = createGraph([
        { path: 'packages/core/utils.ts', imports: [] },
        { path: 'packages/api/client.ts', imports: ['packages/core/utils.ts'] },
      ]);

      const result = validator.validate(graph);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].sourcePackage).toBe('packages/api');
      expect(result.violations[0].targetPackage).toBe('packages/core');
    });

    it('should allow imports within the same package', () => {
      const packages: PackageConfig[] = [
        { path: 'packages/core', can_import: [] },
      ];
      const validator = new PackageBoundaryValidator(projectRoot, packages);

      const graph = createGraph([
        { path: 'packages/core/utils.ts', imports: [] },
        { path: 'packages/core/index.ts', imports: ['packages/core/utils.ts'] },
      ]);

      const result = validator.validate(graph);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should skip files not in any defined package', () => {
      const packages: PackageConfig[] = [
        { path: 'packages/core', can_import: [] },
      ];
      const validator = new PackageBoundaryValidator(projectRoot, packages);

      const graph = createGraph([
        { path: 'src/app.ts', imports: ['packages/core/utils.ts'] },
        { path: 'packages/core/utils.ts', imports: [] },
      ]);

      const result = validator.validate(graph);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should support package names for can_import', () => {
      const packages: PackageConfig[] = [
        { path: 'packages/core', name: '@myorg/core', can_import: [] },
        { path: 'packages/api', name: '@myorg/api', can_import: ['@myorg/core'] },
      ];
      const validator = new PackageBoundaryValidator(projectRoot, packages);

      const graph = createGraph([
        { path: 'packages/core/utils.ts', imports: [] },
        { path: 'packages/api/client.ts', imports: ['packages/core/utils.ts'] },
      ]);

      const result = validator.validate(graph);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should match the most specific package for nested paths', () => {
      const packages: PackageConfig[] = [
        { path: 'packages/core', can_import: [] },
        { path: 'packages/core/internal', can_import: ['packages/core'] },
      ];
      const validator = new PackageBoundaryValidator(projectRoot, packages);

      const graph = createGraph([
        { path: 'packages/core/public.ts', imports: [] },
        {
          path: 'packages/core/internal/private.ts',
          imports: ['packages/core/public.ts'],
        },
      ]);

      const result = validator.validate(graph);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should provide summary statistics', () => {
      const packages: PackageConfig[] = [
        { path: 'packages/core', can_import: [] },
        { path: 'packages/api', can_import: ['packages/core'] },
      ];
      const validator = new PackageBoundaryValidator(projectRoot, packages);

      const graph = createGraph([
        { path: 'packages/core/utils.ts', imports: [] },
        { path: 'packages/api/client.ts', imports: ['packages/core/utils.ts'] },
        { path: 'packages/api/server.ts', imports: ['packages/core/utils.ts'] },
      ]);

      const result = validator.validate(graph);

      expect(result.summary.filesChecked).toBe(3);
      expect(result.summary.importsAnalyzed).toBe(2);
      expect(result.summary.violationCount).toBe(0);
    });

    it('should report multiple violations from the same file', () => {
      const packages: PackageConfig[] = [
        { path: 'packages/core', can_import: [] },
        { path: 'packages/utils', can_import: [] },
        { path: 'packages/api', can_import: [] }, // cannot import anything
      ];
      const validator = new PackageBoundaryValidator(projectRoot, packages);

      const graph = createGraph([
        { path: 'packages/core/index.ts', imports: [] },
        { path: 'packages/utils/helpers.ts', imports: [] },
        {
          path: 'packages/api/client.ts',
          imports: ['packages/core/index.ts', 'packages/utils/helpers.ts'],
        },
      ]);

      const result = validator.validate(graph);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(2);
    });
  });

  describe('getPackages', () => {
    it('should return resolved packages', () => {
      const packages: PackageConfig[] = [
        { path: 'packages/core', can_import: [] },
        { path: 'packages/api', name: '@myorg/api', can_import: ['packages/core'] },
      ];
      const validator = new PackageBoundaryValidator(projectRoot, packages);

      const resolved = validator.getPackages();

      expect(resolved).toHaveLength(2);
      expect(resolved[0].name).toBe('packages/core');
      expect(resolved[0].path).toBe('packages/core/');
      expect(resolved[1].name).toBe('@myorg/api');
      expect(resolved[1].canImport).toContain('packages/core');
    });
  });
});
