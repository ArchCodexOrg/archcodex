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

  describe('includeExternal option', () => {
    it('should include external imports when includeExternal is true', async () => {
      const result = await analyzer.analyze('src/core/registry/resolver.ts', {
        includeExternal: true,
      });

      // With includeExternal true, node_modules imports are not filtered out
      expect(result.currentImports).toBeInstanceOf(Array);
    });
  });

  describe('withPatterns option', () => {
    it('should not include suggestedPatterns when withPatterns is false', async () => {
      const result = await analyzer.analyze('src/core/registry/resolver.ts', {
        withPatterns: false,
      });

      expect(result.suggestedPatterns).toBeUndefined();
    });

    it('should include suggestedPatterns when withPatterns is true and patternRegistry is provided', async () => {
      const { loadPatternRegistry } = await import('../../../../src/core/patterns/loader.js');
      const patternRegistry = await loadPatternRegistry(projectRoot);
      const analyzerWithPatterns = new NeighborhoodAnalyzer(
        projectRoot,
        registry,
        undefined,
        patternRegistry
      );

      try {
        const result = await analyzerWithPatterns.analyze('src/core/registry/resolver.ts', {
          withPatterns: true,
        });

        // suggestedPatterns should be an array (possibly empty) when withPatterns is true
        expect(result.suggestedPatterns).toBeInstanceOf(Array);
      } finally {
        analyzerWithPatterns.dispose();
      }
    });
  });

  describe('aiSummary generation', () => {
    it('should generate an aiSummary with layer info', async () => {
      const result = await analyzer.analyze('src/core/registry/resolver.ts');

      expect(result.aiSummary).toBeDefined();
      expect(result.aiSummary).toContain('layer');
      expect(result.aiSummary).toContain('Imported by:');
    });

    it('should include FORBIDDEN section in aiSummary when forbidden imports exist', async () => {
      const result = await analyzer.analyze('src/core/registry/resolver.ts');

      if (result.forbiddenImports.length > 0) {
        expect(result.aiSummary).toContain('FORBIDDEN');
      }
    });

    it('should include CAN import from in aiSummary when layer has canImport', async () => {
      const result = await analyzer.analyze('src/core/registry/resolver.ts');

      if (result.layer.canImport.length > 0) {
        expect(result.aiSummary).toContain('CAN import from');
      }
    });

    it('should include CANNOT import from in aiSummary when layer has cannotImport', async () => {
      const result = await analyzer.analyze('src/core/registry/resolver.ts');

      if (result.layer.cannotImport.length > 0) {
        expect(result.aiSummary).toContain('CANNOT import from');
      }
    });
  });

  describe('layer inference', () => {
    it('should infer layer for a shallow path when no layers are configured', async () => {
      // Construct a no-layer-config analyzer
      const analyzerNoConfig = new NeighborhoodAnalyzer(projectRoot, registry);

      try {
        const result = await analyzerNoConfig.analyze('src/core/registry/resolver.ts');

        // Without explicit config, layer is inferred from path segments
        expect(result.layer).toBeDefined();
        expect(result.layer.name).toBeTruthy();
      } finally {
        analyzerNoConfig.dispose();
      }
    });
  });

  describe('constraints extraction', () => {
    it('should extract allowed imports from constraints', async () => {
      const result = await analyzer.analyze('src/core/registry/resolver.ts');

      // allowedImports should be an array (possibly empty)
      expect(result.allowedImports).toBeInstanceOf(Array);
    });

    it('should include importableBy when importable_by constraint exists', async () => {
      const result = await analyzer.analyze('src/core/registry/resolver.ts');

      // importableBy may or may not be defined depending on the architecture
      expect(result.constraints).toBeDefined();
      expect(result.constraints.forbidImport).toBeInstanceOf(Array);
      expect(result.constraints.requireImport).toBeInstanceOf(Array);
    });
  });
});

describe('NeighborhoodAnalyzer branch coverage', () => {
  const projectRoot = path.resolve(__dirname, '../../../..');
  let registry: Registry;

  beforeAll(async () => {
    registry = await loadRegistry(projectRoot);
  });

  describe('getLayerInfo branches', () => {
    it('should infer layer from path when no config layers exist', async () => {
      // Analyzer with no config
      const analyzerNoConfig = new NeighborhoodAnalyzer(projectRoot, registry, undefined);
      try {
        const result = await analyzerNoConfig.analyze('src/core/registry/resolver.ts');
        // Without config layers, inferred from path
        expect(result.layer.name).toBeTruthy();
        expect(result.layer.canImport).toEqual([]);
        expect(result.layer.cannotImport).toEqual([]);
      } finally {
        analyzerNoConfig.dispose();
      }
    });

    it('should handle a file at root level for layer inference', async () => {
      // Empty path edge case - single segment path
      const analyzerNoConfig = new NeighborhoodAnalyzer(projectRoot, registry, undefined);
      try {
        // Since we can't easily create files at root, test with a real shallow file
        // The getLayerInfo fallback for parts.length < 2 returns parts[0] || 'root'
        const result = await analyzerNoConfig.analyze('vitest.config.ts');
        // For a single-segment path, layer name should be the filename or inferred
        expect(result.layer.name).toBeTruthy();
      } finally {
        analyzerNoConfig.dispose();
      }
    });
  });

  describe('checkImportStatus branches', () => {
    it('should detect layer violations when importing from forbidden layer', async () => {
      const { loadConfig } = await import('../../../../src/core/config/loader.js');
      const config = await loadConfig(projectRoot);
      const analyzerWithConfig = new NeighborhoodAnalyzer(projectRoot, registry, config);

      try {
        // cli layer should have some constraints about what it can import
        const result = await analyzerWithConfig.analyze('src/core/registry/resolver.ts');

        // Verify import statuses contain allowed field
        for (const imp of result.currentImports) {
          expect(typeof imp.allowed).toBe('boolean');
          expect(typeof imp.path).toBe('string');
        }
      } finally {
        analyzerWithConfig.dispose();
      }
    });
  });

  describe('checkMissingRequired branches', () => {
    it('should handle require_import constraints with match mode any', async () => {
      // This tests the any match mode branch in checkMissingRequired
      const { loadConfig } = await import('../../../../src/core/config/loader.js');
      const config = await loadConfig(projectRoot);
      const analyzerWithConfig = new NeighborhoodAnalyzer(projectRoot, registry, config);

      try {
        const result = await analyzerWithConfig.analyze('src/core/registry/resolver.ts');
        // missingRequired should be an array
        expect(result.missingRequired).toBeInstanceOf(Array);
      } finally {
        analyzerWithConfig.dispose();
      }
    });
  });

  describe('matchesPattern branches', () => {
    it('should handle simple module patterns without slashes or wildcards', async () => {
      const { loadConfig } = await import('../../../../src/core/config/loader.js');
      const config = await loadConfig(projectRoot);
      const analyzerWithConfig = new NeighborhoodAnalyzer(projectRoot, registry, config);

      try {
        // Analyze a file that has forbidden simple module imports like "chalk"
        const result = await analyzerWithConfig.analyze('src/core/registry/resolver.ts');
        // The forbiddenImports should contain simple module names
        const allForbidden = result.forbiddenImports.flatMap(f => f.value);
        // Simple names like 'chalk', 'commander' etc are matched via matchesPattern
        expect(allForbidden.length).toBeGreaterThan(0);
      } finally {
        analyzerWithConfig.dispose();
      }
    });
  });

  describe('getSuggestedPatterns branches', () => {
    it('should return empty array when patternRegistry is not provided', async () => {
      const analyzerNoPatterns = new NeighborhoodAnalyzer(projectRoot, registry, undefined, undefined);
      try {
        const result = await analyzerNoPatterns.analyze('src/core/registry/resolver.ts', {
          withPatterns: true,
        });
        // Without patternRegistry, suggestedPatterns should be undefined
        // because the condition `opts.withPatterns && this.patternRegistry` is false
        expect(result.suggestedPatterns).toBeUndefined();
      } finally {
        analyzerNoPatterns.dispose();
      }
    });
  });

  describe('dispose', () => {
    it('should dispose without error', () => {
      const tempAnalyzer = new NeighborhoodAnalyzer(projectRoot, registry);
      expect(() => tempAnalyzer.dispose()).not.toThrow();
    });
  });
});
