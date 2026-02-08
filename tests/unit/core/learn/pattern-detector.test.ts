/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Comprehensive tests for the pattern-detector module.
 * Covers naming conventions, directory layers, framework hints,
 * import patterns, and cluster name suggestion.
 */
import { describe, it, expect } from 'vitest';
import {
  detectPatterns,
  suggestClusterName,
} from '../../../../src/core/learn/pattern-detector.js';
import type { ModuleSummary } from '../../../../src/core/learn/types.js';

// ---------------------------------------------------------------------------
// detectPatterns
// ---------------------------------------------------------------------------

describe('detectPatterns', () => {
  describe('naming conventions', () => {
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

    it('should detect compound naming patterns', () => {
      const files = [
        'src/foo.test.spec.ts',
      ];
      const modules = files.map(path => ({
        path,
        exports: [],
        imports: [],
      }));

      const patterns = detectPatterns(files, modules);

      // Should detect the compound pattern
      expect(patterns.namingConventions.length).toBeGreaterThan(0);
    });

    it('should not detect naming conventions from simple filenames', () => {
      const files = [
        'src/index.ts',
        'src/main.ts',
      ];
      const modules = files.map(path => ({
        path,
        exports: [],
        imports: [],
      }));

      const patterns = detectPatterns(files, modules);

      expect(patterns.namingConventions).toHaveLength(0);
    });

    it('should deduplicate naming conventions', () => {
      const files = [
        'src/a.service.ts',
        'src/b.service.ts',
        'src/c.service.ts',
      ];
      const modules = files.map(path => ({
        path,
        exports: [],
        imports: [],
      }));

      const patterns = detectPatterns(files, modules);

      const serviceCount = patterns.namingConventions.filter(p => p === '*.service.ts').length;
      expect(serviceCount).toBe(1);
    });
  });

  describe('directory layers', () => {
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

    it('should not detect layers from root-level files', () => {
      const files = ['index.ts'];
      const modules = files.map(path => ({
        path,
        exports: [],
        imports: [],
      }));

      const patterns = detectPatterns(files, modules);

      // A file with < 2 parts in the path should not produce a layer
      expect(patterns.directoryLayers).toHaveLength(0);
    });

    it('should deduplicate directory layers', () => {
      const files = [
        'src/core/a.ts',
        'src/core/b.ts',
        'src/core/c.ts',
      ];
      const modules = files.map(path => ({
        path,
        exports: [],
        imports: [],
      }));

      const patterns = detectPatterns(files, modules);

      const coreCount = patterns.directoryLayers.filter(l => l === 'src/core').length;
      expect(coreCount).toBe(1);
    });
  });

  describe('framework hints', () => {
    it('should detect NestJS from Injectable decorator', () => {
      const files = ['src/app.ts'];
      const modules: ModuleSummary[] = [{
        path: 'src/app.ts',
        exports: ['AppService'],
        imports: [],
        classes: [{
          name: 'AppService',
          methods: ['getData'],
          implements: [],
          decorators: ['Injectable'],
        }],
      }];

      const patterns = detectPatterns(files, modules);

      expect(patterns.frameworkHints).toContain('nest');
    });

    it('should detect NestJS from Controller decorator', () => {
      const files = ['src/app.ts'];
      const modules: ModuleSummary[] = [{
        path: 'src/app.ts',
        exports: ['AppController'],
        imports: [],
        classes: [{
          name: 'AppController',
          methods: ['getHello'],
          implements: [],
          decorators: ['Controller'],
        }],
      }];

      const patterns = detectPatterns(files, modules);

      expect(patterns.frameworkHints).toContain('nest');
    });

    it('should detect Angular from Component decorator', () => {
      const files = ['src/app.ts'];
      const modules: ModuleSummary[] = [{
        path: 'src/app.ts',
        exports: ['AppComponent'],
        imports: [],
        classes: [{
          name: 'AppComponent',
          methods: [],
          implements: [],
          decorators: ['Component'],
        }],
      }];

      const patterns = detectPatterns(files, modules);

      expect(patterns.frameworkHints).toContain('angular');
    });

    it('should not detect frameworks when no decorators match', () => {
      const files = ['src/app.ts'];
      const modules: ModuleSummary[] = [{
        path: 'src/app.ts',
        exports: ['App'],
        imports: [],
        classes: [{
          name: 'App',
          methods: [],
          implements: [],
          decorators: ['CustomDecorator'],
        }],
      }];

      const patterns = detectPatterns(files, modules);

      expect(patterns.frameworkHints).toHaveLength(0);
    });

    it('should handle modules without classes', () => {
      const files = ['src/app.ts'];
      const modules: ModuleSummary[] = [{
        path: 'src/app.ts',
        exports: ['something'],
        imports: [],
      }];

      const patterns = detectPatterns(files, modules);

      expect(patterns.frameworkHints).toHaveLength(0);
    });
  });

  describe('import patterns', () => {
    it('should detect import patterns', () => {
      const files = ['src/cli/commands/check.ts'];
      const modules: ModuleSummary[] = [{
        path: 'src/cli/commands/check.ts',
        exports: ['createCheckCommand'],
        imports: ['../core/engine', '../../utils/logger'],
      }];

      const patterns = detectPatterns(files, modules);

      expect(patterns.importPatterns).toContain('../core/*');
      expect(patterns.importPatterns).toContain('../utils/*');
    });

    it('should not detect import patterns from non-relative imports', () => {
      const files = ['src/app.ts'];
      const modules: ModuleSummary[] = [{
        path: 'src/app.ts',
        exports: [],
        imports: ['express', 'lodash'],
      }];

      const patterns = detectPatterns(files, modules);

      expect(patterns.importPatterns).toHaveLength(0);
    });

    it('should deduplicate import patterns', () => {
      const files = ['src/a.ts', 'src/b.ts'];
      const modules: ModuleSummary[] = [
        { path: 'src/a.ts', exports: [], imports: ['../core/x', '../core/y'] },
        { path: 'src/b.ts', exports: [], imports: ['../core/z'] },
      ];

      const patterns = detectPatterns(files, modules);

      const coreCount = patterns.importPatterns.filter(p => p === '../core/*').length;
      expect(coreCount).toBe(1);
    });
  });

  describe('empty inputs', () => {
    it('should handle empty files array', () => {
      const patterns = detectPatterns([], []);

      expect(patterns.namingConventions).toHaveLength(0);
      expect(patterns.directoryLayers).toHaveLength(0);
      expect(patterns.importPatterns).toHaveLength(0);
      expect(patterns.frameworkHints).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// suggestClusterName
// ---------------------------------------------------------------------------

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

  it('should suggest Utilities for util pattern', () => {
    expect(suggestClusterName('src/util')).toBe('Utilities');
  });

  it('should suggest LLM Integration for llm pattern', () => {
    expect(suggestClusterName('src/llm')).toBe('LLM Integration');
  });

  it('should suggest Infrastructure for infra pattern', () => {
    expect(suggestClusterName('src/infra')).toBe('Infrastructure');
  });

  it('should suggest Validators for validators pattern', () => {
    expect(suggestClusterName('src/validators')).toBe('Validators');
  });

  it('should suggest Security for security pattern', () => {
    expect(suggestClusterName('src/security')).toBe('Security');
  });

  it('should suggest API Layer for api pattern', () => {
    expect(suggestClusterName('src/api')).toBe('API Layer');
  });

  it('should suggest Services for services pattern', () => {
    expect(suggestClusterName('src/services')).toBe('Services');
  });

  it('should suggest Controllers for controllers pattern', () => {
    expect(suggestClusterName('src/controllers')).toBe('Controllers');
  });

  it('should suggest Models for models pattern', () => {
    expect(suggestClusterName('src/models')).toBe('Models');
  });

  it('should suggest Components for components pattern', () => {
    expect(suggestClusterName('src/components')).toBe('Components');
  });

  it('should capitalize unknown patterns', () => {
    expect(suggestClusterName('src/features')).toBe('Features Module');
  });

  it('should use the last path segment for suggestion', () => {
    expect(suggestClusterName('src/deep/nested/core')).toBe('Core Domain');
  });

  it('should handle single segment paths', () => {
    expect(suggestClusterName('core')).toBe('Core Domain');
  });
});
