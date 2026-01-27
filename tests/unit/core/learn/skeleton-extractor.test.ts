/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SkeletonExtractor,
  skeletonToYaml,
  formatSkeletonForPrompt,
} from '../../../../src/core/learn/skeleton-extractor.js';

// Mock dependencies
vi.mock('../../../../src/utils/file-system.js', () => ({
  globFiles: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock('../../../../src/core/arch-tag/parser.js', () => ({
  extractArchId: vi.fn(),
}));

vi.mock('../../../../src/core/learn/pattern-detector.js', () => ({
  detectPatterns: vi.fn().mockReturnValue([]),
  suggestClusterName: vi.fn((pattern) => pattern),
}));

import { globFiles, readFile } from '../../../../src/utils/file-system.js';
import { extractArchId } from '../../../../src/core/arch-tag/parser.js';

describe('skeleton-extractor', () => {
  describe('SkeletonExtractor', () => {
    let extractor: SkeletonExtractor;

    beforeEach(() => {
      vi.clearAllMocks();
      extractor = new SkeletonExtractor('/test/project');
    });

    afterEach(() => {
      extractor.dispose();
    });

    it('should export SkeletonExtractor class', () => {
      expect(SkeletonExtractor).toBeDefined();
      expect(typeof SkeletonExtractor).toBe('function');
    });

    it('should be constructable with project root', () => {
      expect(extractor).toBeInstanceOf(SkeletonExtractor);
    });

    it('should have extract method', () => {
      expect(typeof extractor.extract).toBe('function');
    });

    it('should have dispose method', () => {
      expect(typeof extractor.dispose).toBe('function');
    });

    describe('extract', () => {
      it('should extract empty skeleton for no files', async () => {
        vi.mocked(globFiles).mockResolvedValue([]);

        const result = await extractor.extract();

        expect(result.skeleton.totalFiles).toBe(0);
        expect(result.skeleton.modules).toEqual([]);
        expect(result.skeleton.directories).toEqual([]);
      });

      it('should extract modules from files', async () => {
        vi.mocked(globFiles).mockResolvedValue(['src/index.ts']);
        vi.mocked(readFile).mockResolvedValue('export const x = 1;');
        vi.mocked(extractArchId).mockReturnValue(null);

        const result = await extractor.extract();

        expect(result.skeleton.totalFiles).toBe(1);
        expect(result.skeleton.modules).toHaveLength(1);
        expect(result.skeleton.modules[0].path).toBe('src/index.ts');
      });

      it('should track existing @arch tags', async () => {
        vi.mocked(globFiles).mockResolvedValue(['src/service.ts']);
        vi.mocked(readFile).mockResolvedValue('/**\n * @arch domain.service\n */\nconst x = 1;');
        vi.mocked(extractArchId).mockReturnValue('domain.service');

        const result = await extractor.extract();

        expect(result.skeleton.existingTags).toHaveLength(1);
        expect(result.skeleton.existingTags[0].archId).toBe('domain.service');
      });

      it('should respect maxFiles option', async () => {
        const files = Array.from({ length: 10 }, (_, i) => `src/file${i}.ts`);
        vi.mocked(globFiles).mockResolvedValue(files);
        vi.mocked(readFile).mockResolvedValue('export const x = 1;');
        vi.mocked(extractArchId).mockReturnValue(null);

        const result = await extractor.extract({ maxFiles: 3 });

        expect(result.skeleton.totalFiles).toBe(3);
        expect(result.skeleton.modules).toHaveLength(3);
        expect(result.warnings).toContain('Truncated to 3 files (total: 10)');
      });

      it('should build directory summaries', async () => {
        vi.mocked(globFiles).mockResolvedValue([
          'src/core/a.ts',
          'src/core/b.ts',
          'src/cli/c.ts',
        ]);
        vi.mocked(readFile).mockResolvedValue('export const x = 1;');
        vi.mocked(extractArchId).mockReturnValue(null);

        const result = await extractor.extract();

        expect(result.skeleton.directories.length).toBeGreaterThan(0);
        const coreDir = result.skeleton.directories.find(d => d.path === 'src/core');
        const cliDir = result.skeleton.directories.find(d => d.path === 'src/cli');
        expect(coreDir?.fileCount).toBe(2);
        expect(cliDir?.fileCount).toBe(1);
      });

      it('should detect file naming patterns in directories', async () => {
        vi.mocked(globFiles).mockResolvedValue([
          'src/core/user.controller.ts',
          'src/core/order.controller.ts',
        ]);
        vi.mocked(readFile).mockResolvedValue('export class Controller {}');
        vi.mocked(extractArchId).mockReturnValue(null);

        const result = await extractor.extract();

        const coreDir = result.skeleton.directories.find(d => d.path === 'src/core');
        expect(coreDir?.patterns).toContain('*.controller.ts');
      });

      it('should extract internal imports', async () => {
        vi.mocked(globFiles).mockResolvedValue(['src/service.ts']);
        vi.mocked(readFile).mockResolvedValue(`
          import { helper } from './utils/helper';
          import { logger } from './logger.js';
          import axios from 'axios';
        `);
        vi.mocked(extractArchId).mockReturnValue(null);

        const result = await extractor.extract();

        const module = result.skeleton.modules[0];
        expect(module.imports).toContain('./utils/helper');
        expect(module.imports).toContain('./logger');
        // External imports are not included
        expect(module.imports).not.toContain('axios');
      });

      it('should extract exports when skipDetails is false', async () => {
        vi.mocked(globFiles).mockResolvedValue(['src/utils.ts']);
        vi.mocked(readFile).mockResolvedValue(`
          export function helper() {}
          export const VERSION = '1.0';
          export class Service {}
        `);
        vi.mocked(extractArchId).mockReturnValue(null);

        const result = await extractor.extract({ skipDetails: false });

        const module = result.skeleton.modules[0];
        expect(module.exports).toContain('helper');
        expect(module.exports).toContain('VERSION');
        expect(module.exports).toContain('Service');
      });

      it('should extract classes with details', async () => {
        vi.mocked(globFiles).mockResolvedValue(['src/service.ts']);
        vi.mocked(readFile).mockResolvedValue(`
          export class UserService extends BaseService implements IService {
            public getName() { return 'user'; }
            public getAll() { return []; }
          }
        `);
        vi.mocked(extractArchId).mockReturnValue(null);

        const result = await extractor.extract({ skipDetails: false });

        const module = result.skeleton.modules[0];
        expect(module.classes).toBeDefined();
        expect(module.classes).toHaveLength(1);
        expect(module.classes![0].name).toBe('UserService');
        expect(module.classes![0].extends).toBe('BaseService');
        expect(module.classes![0].implements).toContain('IService');
        expect(module.classes![0].methods).toContain('getName');
        expect(module.classes![0].methods).toContain('getAll');
      });

      it('should extract functions', async () => {
        vi.mocked(globFiles).mockResolvedValue(['src/utils.ts']);
        vi.mocked(readFile).mockResolvedValue(`
          export function publicFunc() {}
          function privateFunc() {}
        `);
        vi.mocked(extractArchId).mockReturnValue(null);

        const result = await extractor.extract({ skipDetails: false });

        const module = result.skeleton.modules[0];
        expect(module.functions).toContain('publicFunc');
        // Private functions not included
        expect(module.functions).not.toContain('privateFunc');
      });

      it('should extract interfaces', async () => {
        vi.mocked(globFiles).mockResolvedValue(['src/types.ts']);
        vi.mocked(readFile).mockResolvedValue(`
          export interface User { name: string; }
          interface Internal { id: string; }
        `);
        vi.mocked(extractArchId).mockReturnValue(null);

        const result = await extractor.extract({ skipDetails: false });

        const module = result.skeleton.modules[0];
        expect(module.interfaces).toContain('User');
        // Non-exported interfaces not included
        expect(module.interfaces).not.toContain('Internal');
      });

      it('should extract type aliases', async () => {
        vi.mocked(globFiles).mockResolvedValue(['src/types.ts']);
        vi.mocked(readFile).mockResolvedValue(`
          export type UserId = string;
          type InternalId = number;
        `);
        vi.mocked(extractArchId).mockReturnValue(null);

        const result = await extractor.extract({ skipDetails: false });

        const module = result.skeleton.modules[0];
        expect(module.exports).toContain('UserId');
      });

      it('should detect import clusters', async () => {
        vi.mocked(globFiles).mockResolvedValue([
          'src/cli/command.ts',
          'src/core/engine.ts',
          'src/util/logger.ts',
        ]);
        vi.mocked(readFile)
          .mockResolvedValueOnce(`import { engine } from '../core/engine';`) // cli imports core
          .mockResolvedValueOnce(`import { logger } from '../util/logger';`) // core imports util
          .mockResolvedValueOnce(`export const logger = {};`); // util
        vi.mocked(extractArchId).mockReturnValue(null);

        const result = await extractor.extract();

        expect(result.skeleton.importClusters.length).toBeGreaterThan(0);
      });

      it('should provide extraction time', async () => {
        vi.mocked(globFiles).mockResolvedValue([]);

        const result = await extractor.extract();

        expect(result.extractionTimeMs).toBeGreaterThanOrEqual(0);
      });

      it('should use custom include/exclude patterns', async () => {
        vi.mocked(globFiles).mockResolvedValue([]);

        await extractor.extract({
          include: ['lib/**/*.ts'],
          exclude: ['**/*.spec.ts'],
        });

        expect(vi.mocked(globFiles)).toHaveBeenCalledWith(
          ['lib/**/*.ts'],
          expect.objectContaining({
            ignore: ['**/*.spec.ts'],
          })
        );
      });

      it('should handle parse errors gracefully', async () => {
        vi.mocked(globFiles).mockResolvedValue(['src/bad.ts']);
        vi.mocked(readFile).mockResolvedValue('const x = {{invalid syntax}}');
        vi.mocked(extractArchId).mockReturnValue(null);

        const result = await extractor.extract({ skipDetails: false });

        // Should not throw, should return basic module info
        expect(result.skeleton.modules).toHaveLength(1);
        expect(result.skeleton.modules[0].path).toBe('src/bad.ts');
      });

      it('should skip details when skipDetails is true', async () => {
        vi.mocked(globFiles).mockResolvedValue(['src/utils.ts']);
        vi.mocked(readFile).mockResolvedValue(`
          export class Service { method() {} }
          export function helper() {}
        `);
        vi.mocked(extractArchId).mockReturnValue(null);

        const result = await extractor.extract({ skipDetails: true });

        const module = result.skeleton.modules[0];
        // With skipDetails, only imports are extracted
        expect(module.path).toBe('src/utils.ts');
      });

      it('should handle files in root directory', async () => {
        vi.mocked(globFiles).mockResolvedValue(['index.ts']);
        vi.mocked(readFile).mockResolvedValue('export const main = () => {};');
        vi.mocked(extractArchId).mockReturnValue(null);

        const result = await extractor.extract();

        expect(result.skeleton.modules).toHaveLength(1);
        expect(result.skeleton.modules[0].path).toBe('index.ts');
      });

      it('should handle class decorators', async () => {
        vi.mocked(globFiles).mockResolvedValue(['src/controller.ts']);
        vi.mocked(readFile).mockResolvedValue(`
          @Injectable()
          @Controller('/api')
          export class ApiController {}
        `);
        vi.mocked(extractArchId).mockReturnValue(null);

        const result = await extractor.extract({ skipDetails: false });

        const module = result.skeleton.modules[0];
        expect(module.classes![0].decorators).toContain('Injectable');
        expect(module.classes![0].decorators).toContain('Controller');
      });
    });

    describe('dispose', () => {
      it('should dispose without error', () => {
        expect(() => extractor.dispose()).not.toThrow();
      });

      it('should be safe to call multiple times', () => {
        extractor.dispose();
        expect(() => extractor.dispose()).not.toThrow();
      });
    });
  });

  describe('re-exports', () => {
    it('should re-export skeletonToYaml', () => {
      expect(typeof skeletonToYaml).toBe('function');
    });

    it('should re-export formatSkeletonForPrompt', () => {
      expect(typeof formatSkeletonForPrompt).toBe('function');
    });
  });
});
