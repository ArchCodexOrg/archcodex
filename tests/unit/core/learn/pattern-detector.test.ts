/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import {
  detectPatterns,
  suggestClusterName,
} from '../../../../src/core/learn/pattern-detector.js';

describe('pattern-detector', () => {
  describe('detectPatterns', () => {
    it('should detect naming conventions from file names', () => {
      const files = [
        'src/cli/commands/check.command.ts',
        'src/cli/commands/verify.command.ts',
        'src/core/services/user.service.ts',
      ];
      const modules = files.map(path => ({
        path,
        exports: [],
        imports: [],
      }));

      const patterns = detectPatterns(files, modules);

      expect(patterns.namingConventions).toContain('*.command.ts');
      expect(patterns.namingConventions).toContain('*.service.ts');
    });

    it('should detect directory layers', () => {
      const files = [
        'src/cli/index.ts',
        'src/core/engine.ts',
        'src/utils/logger.ts',
      ];
      const modules = files.map(path => ({
        path,
        exports: [],
        imports: [],
      }));

      const patterns = detectPatterns(files, modules);

      expect(patterns.directoryLayers).toContain('src/cli');
      expect(patterns.directoryLayers).toContain('src/core');
      expect(patterns.directoryLayers).toContain('src/utils');
    });

    it('should detect framework hints from decorators', () => {
      const files = ['src/app.ts'];
      const modules = [{
        path: 'src/app.ts',
        exports: ['AppController'],
        imports: [],
        classes: [{
          name: 'AppController',
          methods: ['getHello'],
          decorators: ['Controller'],
        }],
      }];

      const patterns = detectPatterns(files, modules);

      expect(patterns.frameworkHints).toContain('nest');
    });

    it('should detect import patterns', () => {
      const files = ['src/cli/commands/check.ts'];
      const modules = [{
        path: 'src/cli/commands/check.ts',
        exports: ['createCheckCommand'],
        imports: ['../core/engine', '../../utils/logger'],
      }];

      const patterns = detectPatterns(files, modules);

      expect(patterns.importPatterns).toContain('../core/*');
      expect(patterns.importPatterns).toContain('../utils/*');
    });
  });

  describe('suggestClusterName', () => {
    it('should suggest CLI Layer for cli pattern', () => {
      expect(suggestClusterName('src/cli')).toBe('CLI Layer');
    });

    it('should suggest Core Domain for core pattern', () => {
      expect(suggestClusterName('src/core')).toBe('Core Domain');
    });

    it('should suggest Utilities for utils pattern', () => {
      expect(suggestClusterName('src/utils')).toBe('Utilities');
    });

    it('should capitalize unknown patterns', () => {
      expect(suggestClusterName('src/features')).toBe('Features Module');
    });
  });
});
