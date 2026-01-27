/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import {
  skeletonToYaml,
  formatSkeletonForPrompt,
} from '../../../../src/core/learn/skeleton-formatter.js';
import type { ProjectSkeleton } from '../../../../src/core/learn/types.js';

describe('skeleton-formatter', () => {
  const mockSkeleton: ProjectSkeleton = {
    rootPath: '/test/project',
    totalFiles: 10,
    directories: [
      { path: 'src/cli', fileCount: 3 },
      { path: 'src/core', fileCount: 5 },
      { path: 'src/utils', fileCount: 2 },
    ],
    modules: [
      {
        path: 'src/cli/index.ts',
        exports: ['main'],
        imports: ['../core/engine'],
        classes: [{ name: 'CLI', methods: ['run'], decorators: [] }],
      },
      {
        path: 'src/core/engine.ts',
        exports: ['Engine'],
        imports: ['../utils/logger'],
      },
    ],
    importClusters: [
      {
        name: 'CLI Layer',
        pattern: 'src/cli',
        files: ['src/cli/index.ts'],
        importsFrom: ['src/core'],
        importedBy: [],
        layerLevel: 1,
      },
    ],
    existingTags: [
      { file: 'src/cli/index.ts', archId: 'app.cli' },
    ],
    detectedPatterns: {
      namingConventions: [],
      directoryLayers: ['src/cli', 'src/core'],
      importPatterns: [],
      frameworkHints: [],
    },
  };

  describe('skeletonToYaml', () => {
    it('should convert skeleton to YAML-serializable format', () => {
      const yaml = skeletonToYaml(mockSkeleton);

      expect(yaml._comment).toContain('/test/project');
      expect(yaml.files).toBe(10);
      expect(yaml.directories).toHaveLength(3);
      expect(yaml.modules).toHaveLength(2);
      expect(yaml.import_clusters).toHaveLength(1);
      expect(yaml.existing_tags).toHaveLength(1);
    });

    it('should include directory path and file count', () => {
      const yaml = skeletonToYaml(mockSkeleton);

      expect(yaml.directories[0].path).toBe('src/cli');
      expect(yaml.directories[0].files).toBe(3);
    });

    it('should include module exports and imports', () => {
      const yaml = skeletonToYaml(mockSkeleton);

      expect(yaml.modules[0].path).toBe('src/cli/index.ts');
      expect(yaml.modules[0].exports).toContain('main');
      expect(yaml.modules[0].imports).toContain('../core/engine');
    });

    it('should include class info', () => {
      const yaml = skeletonToYaml(mockSkeleton);

      expect(yaml.modules[0].classes).toBeDefined();
      expect(yaml.modules[0].classes![0].name).toBe('CLI');
      expect(yaml.modules[0].classes![0].methods).toContain('run');
    });
  });

  describe('formatSkeletonForPrompt', () => {
    it('should format skeleton as YAML string', () => {
      const formatted = formatSkeletonForPrompt(mockSkeleton);

      expect(formatted).toContain('# Skeleton for: /test/project');
      expect(formatted).toContain('files: 10');
      expect(formatted).toContain('directories:');
      expect(formatted).toContain('modules:');
    });

    it('should include directory summaries', () => {
      const formatted = formatSkeletonForPrompt(mockSkeleton);

      expect(formatted).toContain('src/cli');
      expect(formatted).toContain('# 3 files');
    });

    it('should include import clusters', () => {
      const formatted = formatSkeletonForPrompt(mockSkeleton);

      expect(formatted).toContain('import_clusters:');
      expect(formatted).toContain('CLI Layer');
    });

    it('should include existing tags section', () => {
      const formatted = formatSkeletonForPrompt(mockSkeleton);

      expect(formatted).toContain('existing_tags:');
      expect(formatted).toContain('app.cli');
    });
  });
});
