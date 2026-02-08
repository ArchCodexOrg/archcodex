/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for ForbidImportValidator.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ForbidImportValidator } from '../../../../src/core/constraints/forbid-import.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';
import type { ConstraintContext } from '../../../../src/core/constraints/types.js';
import type { SemanticModel, ImportInfo } from '../../../../src/validators/semantic.types.js';

describe('ForbidImportValidator', () => {
  let validator: ForbidImportValidator;

  function createImport(overrides: Partial<ImportInfo>): ImportInfo {
    return {
      moduleSpecifier: 'test-module',
      importType: 'static',
      location: { line: 1, column: 1 },
      ...overrides,
    };
  }

  function createContext(imports: ImportInfo[]): ConstraintContext {
    const parsedFile: SemanticModel = {
      filePath: '/test/file.ts',
      fileName: 'file.ts',
      extension: '.ts',
      content: '',
      lineCount: 10,
      language: 'typescript',
      imports,
      classes: [],
      interfaces: [],
      functions: [],
      functionCalls: [],
      mutations: [],
    };

    return {
      filePath: '/test/file.ts',
      fileName: 'file.ts',
      parsedFile,
      archId: 'test.arch',
      constraintSource: 'test.arch',
    };
  }

  beforeEach(() => {
    validator = new ForbidImportValidator();
  });

  it('should have correct rule name and error code', () => {
    expect(validator.rule).toBe('forbid_import');
    expect(validator.errorCode).toBe('E003');
  });

  describe('exact match detection', () => {
    it('should detect forbidden import with exact match', () => {
      const context = createContext([
        createImport({ moduleSpecifier: 'axios' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['axios'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain('axios');
    });

    it('should pass when no forbidden imports present', () => {
      const context = createContext([
        createImport({ moduleSpecifier: 'lodash' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['axios'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect multiple forbidden imports', () => {
      const context = createContext([
        createImport({ moduleSpecifier: 'axios' }),
        createImport({ moduleSpecifier: 'request', location: { line: 5, column: 1 } }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['axios', 'request'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(2);
    });
  });

  describe('prefix matching', () => {
    it('should match subpath imports', () => {
      const context = createContext([
        createImport({ moduleSpecifier: 'axios/lib/core' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['axios'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations[0].message).toContain('axios');
    });

    it('should not match similar-named modules', () => {
      const context = createContext([
        createImport({ moduleSpecifier: 'axios-retry' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['axios'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });
  });

  describe('dynamic imports', () => {
    it('should detect dynamic imports', () => {
      const context = createContext([
        createImport({ moduleSpecifier: 'axios', isDynamic: true }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['axios'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations[0].message).toContain('Dynamic import');
    });

    it('should say Import for static imports', () => {
      const context = createContext([
        createImport({ moduleSpecifier: 'axios', isDynamic: false }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['axios'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].message).toMatch(/^Import/);
    });
  });

  describe('violation details', () => {
    it('should include line and column in violation', () => {
      const context = createContext([
        createImport({
          moduleSpecifier: 'axios',
          location: { line: 10, column: 5 },
        }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['axios'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].line).toBe(10);
      expect(result.violations[0].column).toBe(5);
    });

    it('should include constraint source in message', () => {
      const parsedFile: SemanticModel = {
        filePath: '/test/file.ts',
        fileName: 'file.ts',
        extension: '.ts',
        content: '',
        lineCount: 10,
        language: 'typescript',
        imports: [createImport({ moduleSpecifier: 'axios' })],
        classes: [],
        interfaces: [],
        functions: [],
        functionCalls: [],
        mutations: [],
      };

      const context: ConstraintContext = {
        filePath: '/test/file.ts',
        fileName: 'file.ts',
        parsedFile,
        archId: 'test.arch',
        constraintSource: 'domain.service',
      };

      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['axios'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].message).toContain('from domain.service');
    });

    it('should include why from constraint', () => {
      const context = createContext([
        createImport({ moduleSpecifier: 'axios' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['axios'],
        severity: 'error',
        why: 'Use our HTTP client for consistent error handling',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].why).toBe('Use our HTTP client for consistent error handling');
    });
  });

  describe('suggestion building', () => {
    it('should include replace suggestion with alternative', () => {
      const context = createContext([
        createImport({ moduleSpecifier: 'axios' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['axios'],
        severity: 'error',
        alternative: 'src/utils/http-client',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].suggestion).toEqual({
        action: 'replace',
        target: 'axios',
        replacement: 'src/utils/http-client',
      });
    });

    it('should include replace suggestion with detailed alternatives', () => {
      const context = createContext([
        createImport({ moduleSpecifier: 'axios' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['axios'],
        severity: 'error',
        alternatives: [
          {
            module: 'src/utils/http-client',
            export: 'HttpClient',
            description: 'HTTP client with retry logic',
          },
        ],
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].suggestion).toEqual({
        action: 'replace',
        target: 'axios',
        replacement: 'HttpClient',
        importStatement: "import { HttpClient } from 'src/utils/http-client';",
      });
    });

    it('should include remove suggestion when no alternative', () => {
      const context = createContext([
        createImport({ moduleSpecifier: 'axios' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['axios'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].suggestion).toEqual({
        action: 'remove',
        target: 'axios',
      });
    });

    it('should use wildcard import when no export in alternatives', () => {
      const context = createContext([
        createImport({ moduleSpecifier: 'axios' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['axios'],
        severity: 'error',
        alternatives: [
          {
            module: 'src/utils/http-client',
            // No export specified
          },
        ],
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].suggestion?.importStatement).toBeUndefined();
    });
  });

  describe('didYouMean building', () => {
    it('should include didYouMean from alternative', () => {
      const context = createContext([
        createImport({ moduleSpecifier: 'axios' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['axios'],
        severity: 'error',
        alternative: 'src/utils/http-client',
        why: 'Use our client for retry logic',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean).toEqual({
        file: 'src/utils/http-client',
        description: 'Use our client for retry logic',
      });
    });

    it('should include didYouMean from detailed alternatives', () => {
      const context = createContext([
        createImport({ moduleSpecifier: 'axios' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['axios'],
        severity: 'error',
        alternatives: [
          {
            module: 'src/utils/http-client',
            export: 'HttpClient',
            description: 'HTTP client with retry',
            example: 'const client = new HttpClient();',
          },
        ],
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean).toEqual({
        file: 'src/utils/http-client',
        export: 'HttpClient',
        description: 'HTTP client with retry',
        exampleUsage: 'const client = new HttpClient();',
      });
    });

    it('should use default description for alternatives without description', () => {
      const context = createContext([
        createImport({ moduleSpecifier: 'axios' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['axios'],
        severity: 'error',
        alternatives: [
          {
            module: 'src/utils/http-client',
            export: 'HttpClient',
            // No description
          },
        ],
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean?.description).toBe('Use the canonical implementation');
    });

    it('should use default description for alternative without why', () => {
      const context = createContext([
        createImport({ moduleSpecifier: 'axios' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['axios'],
        severity: 'error',
        alternative: 'src/utils/http-client',
        // No why field
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean?.description).toBe('Use the approved alternative instead');
    });

    it('should include didYouMean from pattern registry', () => {
      const parsedFile: SemanticModel = {
        filePath: '/test/file.ts',
        fileName: 'file.ts',
        extension: '.ts',
        content: '',
        lineCount: 10,
        language: 'typescript',
        imports: [createImport({ moduleSpecifier: 'axios' })],
        classes: [],
        interfaces: [],
        functions: [],
        functionCalls: [],
        mutations: [],
      };

      const context: ConstraintContext = {
        filePath: '/test/file.ts',
        fileName: 'file.ts',
        parsedFile,
        archId: 'test.arch',
        constraintSource: 'test.arch',
        patternRegistry: {
          patterns: {
            httpClient: {
              canonical: 'src/utils/http-client.ts',
              exports: ['HttpClient'],
              usage: 'Use HttpClient for all HTTP requests',
              keywords: ['http', 'axios', 'request', 'fetch'],
            },
          },
        },
      };

      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['axios'],
        severity: 'error',
        // No alternative/alternatives - should fall back to pattern registry
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean).toEqual({
        file: 'src/utils/http-client.ts',
        export: 'HttpClient',
        description: 'Use HttpClient for all HTTP requests',
        exampleUsage: undefined,
      });
    });

    it('should match pattern registry by keyword in forbidden module', () => {
      const parsedFile: SemanticModel = {
        filePath: '/test/file.ts',
        fileName: 'file.ts',
        extension: '.ts',
        content: '',
        lineCount: 10,
        language: 'typescript',
        imports: [createImport({ moduleSpecifier: 'node-fetch' })],
        classes: [],
        interfaces: [],
        functions: [],
        functionCalls: [],
        mutations: [],
      };

      const context: ConstraintContext = {
        filePath: '/test/file.ts',
        fileName: 'file.ts',
        parsedFile,
        archId: 'test.arch',
        constraintSource: 'test.arch',
        patternRegistry: {
          patterns: {
            httpClient: {
              canonical: 'src/utils/http-client.ts',
              exports: ['HttpClient'],
              keywords: ['http', 'axios', 'fetch'],
            },
          },
        },
      };

      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['node-fetch'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean?.file).toBe('src/utils/http-client.ts');
    });

    it('should return undefined didYouMean when no match found', () => {
      const parsedFile: SemanticModel = {
        filePath: '/test/file.ts',
        fileName: 'file.ts',
        extension: '.ts',
        content: '',
        lineCount: 10,
        language: 'typescript',
        imports: [createImport({ moduleSpecifier: 'some-random-module' })],
        classes: [],
        interfaces: [],
        functions: [],
        functionCalls: [],
        mutations: [],
      };

      const context: ConstraintContext = {
        filePath: '/test/file.ts',
        fileName: 'file.ts',
        parsedFile,
        archId: 'test.arch',
        constraintSource: 'test.arch',
        patternRegistry: {
          patterns: {
            logger: {
              canonical: 'src/utils/logger.ts',
              keywords: ['log', 'debug'],
            },
          },
        },
      };

      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['some-random-module'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean).toBeUndefined();
    });

    it('should handle pattern registry with no patterns', () => {
      const parsedFile: SemanticModel = {
        filePath: '/test/file.ts',
        fileName: 'file.ts',
        extension: '.ts',
        content: '',
        lineCount: 10,
        language: 'typescript',
        imports: [createImport({ moduleSpecifier: 'axios' })],
        classes: [],
        interfaces: [],
        functions: [],
        functionCalls: [],
        mutations: [],
      };

      const context: ConstraintContext = {
        filePath: '/test/file.ts',
        fileName: 'file.ts',
        parsedFile,
        archId: 'test.arch',
        constraintSource: 'test.arch',
        patternRegistry: {
          // No patterns defined
        },
      };

      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['axios'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean).toBeUndefined();
    });

    it('should include example from pattern registry', () => {
      const parsedFile: SemanticModel = {
        filePath: '/test/file.ts',
        fileName: 'file.ts',
        extension: '.ts',
        content: '',
        lineCount: 10,
        language: 'typescript',
        imports: [createImport({ moduleSpecifier: 'axios' })],
        classes: [],
        interfaces: [],
        functions: [],
        functionCalls: [],
        mutations: [],
      };

      const context: ConstraintContext = {
        filePath: '/test/file.ts',
        fileName: 'file.ts',
        parsedFile,
        archId: 'test.arch',
        constraintSource: 'test.arch',
        patternRegistry: {
          patterns: {
            httpClient: {
              canonical: 'src/utils/http-client.ts',
              exports: ['HttpClient'],
              keywords: ['axios', 'http'],
              example: 'const client = new HttpClient({ timeout: 5000 });',
            },
          },
        },
      };

      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['axios'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].didYouMean?.exampleUsage).toBe('const client = new HttpClient({ timeout: 5000 });');
    });
  });

  describe('getFixHint', () => {
    it('should return hint with alternatives plural', () => {
      const context = createContext([
        createImport({ moduleSpecifier: 'axios' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['axios'],
        severity: 'error',
        alternatives: [
          { module: 'src/utils/http-client' },
          { module: 'src/utils/fetch-wrapper' },
        ],
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].fixHint).toBe('Use an approved alternative: src/utils/http-client, src/utils/fetch-wrapper');
    });

    it('should return hint with alternative singular', () => {
      const context = createContext([
        createImport({ moduleSpecifier: 'axios' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['axios'],
        severity: 'error',
        alternative: 'src/utils/http-client',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].fixHint).toBe('Use the approved alternative: src/utils/http-client');
    });

    it('should return DI hint for layer-related imports', () => {
      const context = createContext([
        createImport({ moduleSpecifier: 'infrastructure/database' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['infrastructure/database'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].fixHint).toContain('dependency injection');
    });

    it('should return DI hint for platform imports', () => {
      const context = createContext([
        createImport({ moduleSpecifier: '@platform/storage' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['@platform/storage'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].fixHint).toContain('dependency injection');
    });

    it('should return DI hint for adapter imports', () => {
      const context = createContext([
        createImport({ moduleSpecifier: 'src/adapter/postgres' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['src/adapter/postgres'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].fixHint).toContain('dependency injection');
    });

    it('should return default hint when no alternative or layer pattern', () => {
      const context = createContext([
        createImport({ moduleSpecifier: 'lodash' }),
      ]);
      const constraint: Constraint = {
        rule: 'forbid_import',
        value: ['lodash'],
        severity: 'error',
      };

      const result = validator.validate(constraint, context);

      expect(result.violations[0].fixHint).toBe('Remove the import or use an approved alternative');
    });
  });
});
