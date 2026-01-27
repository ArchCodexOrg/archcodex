/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test.unit
 */
import { describe, it, expect } from 'vitest';
import { FeatureEngine } from '../../../../src/core/scaffold/feature-engine.js';
import type { FeatureDefinition } from '../../../../src/core/registry/schema.js';

describe('FeatureEngine', () => {
  const projectRoot = process.cwd();

  describe('previewFeature', () => {
    it('should preview files to be created', async () => {
      const engine = new FeatureEngine(projectRoot);

      const feature: FeatureDefinition = {
        description: 'Test feature',
        components: [
          {
            role: 'main',
            architecture: 'archcodex.core.domain',
            path: 'src/test/${name}.ts',
          },
          {
            role: 'test',
            architecture: 'archcodex.test.unit',
            path: 'tests/unit/${name}.test.ts',
            optional: true,
          },
        ],
        checklist: ['Register in index'],
      };

      const result = await engine.previewFeature(feature, 'test-feature', { name: 'MyComponent' });

      expect(result.components).toHaveLength(2);
      expect(result.components[0].role).toBe('main');
      expect(result.components[0].path).toBe('src/test/MyComponent.ts');
      expect(result.components[0].optional).toBe(false);
      expect(result.components[1].role).toBe('test');
      expect(result.components[1].path).toBe('tests/unit/MyComponent.test.ts');
      expect(result.components[1].optional).toBe(true);
    });
  });

  describe('scaffoldFeature', () => {
    it('should return skipped results for optional components when skipOptional is true', async () => {
      const engine = new FeatureEngine(projectRoot);

      const feature: FeatureDefinition = {
        description: 'Test feature',
        components: [
          {
            role: 'main',
            architecture: 'archcodex.core.domain',
            path: 'src/test/${name}.ts',
          },
          {
            role: 'test',
            architecture: 'archcodex.test.unit',
            path: 'tests/unit/${name}.test.ts',
            optional: true,
          },
        ],
      };

      const result = await engine.scaffoldFeature({
        feature,
        featureName: 'test-feature',
        variables: { name: 'TestFeature' },
        dryRun: true,
        skipOptional: true,
      });

      expect(result.featureName).toBe('test-feature');
      expect(result.components).toHaveLength(2);
      expect(result.components[1].skipped).toBe(true);
    });

    it('should check for existing files in dry run mode', async () => {
      const engine = new FeatureEngine(projectRoot);

      const feature: FeatureDefinition = {
        description: 'Test feature',
        components: [
          {
            role: 'package',
            architecture: 'archcodex.core.domain',
            path: 'package.json', // This file exists
          },
        ],
      };

      const result = await engine.scaffoldFeature({
        feature,
        featureName: 'test-feature',
        variables: { name: 'Test' },
        dryRun: true,
        overwrite: false,
      });

      expect(result.components[0].success).toBe(false);
      expect(result.components[0].error).toBe('File already exists');
    });
  });
});
