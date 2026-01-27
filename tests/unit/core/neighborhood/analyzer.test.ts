/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for NeighborhoodAnalyzer.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import { NeighborhoodAnalyzer } from '../../../../src/core/neighborhood/analyzer.js';
import { loadRegistry } from '../../../../src/core/registry/loader.js';
import type { Registry } from '../../../../src/core/registry/schema.js';

describe('NeighborhoodAnalyzer', () => {
  const projectRoot = path.resolve(__dirname, '../../../..');
  let registry: Registry;
  let analyzer: NeighborhoodAnalyzer;

  beforeAll(async () => {
    registry = await loadRegistry(projectRoot);
    analyzer = new NeighborhoodAnalyzer(projectRoot, registry);
  });

  afterAll(() => {
    analyzer.dispose();
  });

  describe('analyze', () => {
    it('should analyze a file with @arch tag', async () => {
      const result = await analyzer.analyze('src/core/registry/resolver.ts');

      expect(result.file).toBe('src/core/registry/resolver.ts');
      expect(result.architecture).toBe('archcodex.core.domain.resolver');
      expect(result.layer.name).toBe('src/core');
      expect(result.layer.canImport).toBeInstanceOf(Array);
      expect(result.layer.cannotImport).toBeInstanceOf(Array);
    });

    it('should identify files that import the analyzed file', async () => {
      const result = await analyzer.analyze('src/core/registry/resolver.ts');

      expect(result.importedBy).toBeInstanceOf(Array);
      expect(result.importedBy.length).toBeGreaterThan(0);
      expect(result.importedBy[0]).toHaveProperty('file');
      expect(result.importedBy[0]).toHaveProperty('architecture');
    });

    it('should identify current imports with status', async () => {
      const result = await analyzer.analyze('src/core/registry/resolver.ts');

      expect(result.currentImports).toBeInstanceOf(Array);
      expect(result.currentImports.length).toBeGreaterThan(0);
      expect(result.currentImports[0]).toHaveProperty('path');
      expect(result.currentImports[0]).toHaveProperty('allowed');
    });

    it('should extract forbidden imports from constraints', async () => {
      const result = await analyzer.analyze('src/core/registry/resolver.ts');

      expect(result.forbiddenImports).toBeInstanceOf(Array);
      // forbiddenImports is now an array of ForbiddenImportConstraint objects
      // Each has a 'value' array of forbidden module names
      const allForbiddenValues = result.forbiddenImports.flatMap(f => f.value);
      // Core domain files should forbid CLI-related imports
      expect(allForbiddenValues).toContain('chalk');
      expect(allForbiddenValues).toContain('commander');
    });

    it('should deduplicate forbidden imports', async () => {
      const result = await analyzer.analyze('src/core/registry/resolver.ts');

      // Each constraint object should be unique (based on its value array)
      const valueStrings = result.forbiddenImports.map(f => JSON.stringify(f.value));
      const uniqueValues = [...new Set(valueStrings)];
      expect(valueStrings.length).toBe(uniqueValues.length);
    });

    it('should infer layer from file path', async () => {
      const result = await analyzer.analyze('src/cli/commands/check.ts');

      expect(result.layer.name).toBe('src/cli');
    });

    it('should provide same-layer patterns', async () => {
      const result = await analyzer.analyze('src/core/registry/resolver.ts');

      expect(result.sameLayerPatterns).toContain('src/core/*');
    });

    it('should filter external imports by default', async () => {
      const result = await analyzer.analyze('src/core/registry/resolver.ts', {
        includeExternal: false,
      });

      const hasNodeModules = result.currentImports.some(i =>
        i.path.includes('node_modules')
      );
      expect(hasNodeModules).toBe(false);
    });

    it('should handle files without @arch tag', async () => {
      // Create analyzer and test with untagged file behavior
      const result = await analyzer.analyze('src/core/neighborhood/index.ts');

      // Should still work, just with null architecture
      expect(result.file).toBe('src/core/neighborhood/index.ts');
      expect(result.layer.name).toBe('src/core');
    });
  });

  describe('edge cases', () => {
    it('should handle relative paths', async () => {
      const result = await analyzer.analyze('./src/core/registry/resolver.ts');

      expect(result.file).toBe('src/core/registry/resolver.ts');
    });

    it('should handle absolute paths', async () => {
      const absolutePath = path.join(projectRoot, 'src/core/registry/resolver.ts');
      const result = await analyzer.analyze(absolutePath);

      expect(result.file).toBe('src/core/registry/resolver.ts');
    });
  });
});
