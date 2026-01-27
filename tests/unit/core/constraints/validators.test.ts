/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MaxFileLinesValidator } from '../../../../src/core/constraints/max-file-lines.js';
import { MaxPublicMethodsValidator } from '../../../../src/core/constraints/max-public-methods.js';
import { ForbidImportValidator } from '../../../../src/core/constraints/forbid-import.js';
import { RequireImportValidator } from '../../../../src/core/constraints/require-import.js';
import { NamingPatternValidator } from '../../../../src/core/constraints/naming-pattern.js';
import { LocationPatternValidator } from '../../../../src/core/constraints/location-pattern.js';
import { RequireTestFileValidator } from '../../../../src/core/constraints/require-test-file.js';
import { TypeScriptValidator } from '../../../../src/validators/typescript.js';
import type { ConstraintContext, Violation } from '../../../../src/core/constraints/types.js';
import type { ParsedFile } from '../../../../src/validators/interface.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';
import { writeFile, mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Create a basic constraint context for testing.
 */
const createContext = (fileName: string, options?: Partial<ConstraintContext>): ConstraintContext => ({
  fileName,
  filePath: `/src/${fileName}`,
  archId: 'test.arch',
  content: '',
  parsedFile: null as unknown as ParsedFile,
  ...options,
});

/**
 * Create a mock ParsedFile for line count tests.
 */
const createParsedFile = (lineCount: number): ParsedFile => ({
  filePath: '/src/test.ts',
  fileName: 'test.ts',
  extension: '.ts',
  content: 'x\n'.repeat(lineCount),
  lineCount,
  ast: null as unknown as ParsedFile['ast'],
});

describe('NamingPatternValidator', () => {
  let validator: NamingPatternValidator;

  beforeEach(() => {
    validator = new NamingPatternValidator();
  });

  it('should have correct rule name', () => {
    expect(validator.rule).toBe('naming_pattern');
  });

  it('should pass when file name matches pattern', () => {
    const constraint: Constraint = {
      rule: 'naming_pattern',
      value: '^[A-Z][a-zA-Z]+Service\\.ts$',
      severity: 'warning',
    };
    const context = createContext('UserService.ts');

    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(true);
  });

  it('should fail when file name does not match pattern', () => {
    const constraint: Constraint = {
      rule: 'naming_pattern',
      value: '^[A-Z][a-zA-Z]+Service\\.ts$',
      severity: 'warning',
    };
    const context = createContext('user-service.ts');

    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(false);
  });

  it('should match against full file name including extension', () => {
    const constraint: Constraint = {
      rule: 'naming_pattern',
      value: '^[A-Z][a-zA-Z]+\\.ts$',
      severity: 'warning',
    };
    const context = createContext('UserService.ts');

    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(true);
  });

  it('should handle special characters in pattern', () => {
    const constraint: Constraint = {
      rule: 'naming_pattern',
      value: '^[a-z]+\\.[a-z]+\\.ts$',  // e.g., "user.service.ts"
      severity: 'warning',
    };

    const contextMatch = createContext('user.service.ts');
    expect(validator.validate(constraint, contextMatch).passed).toBe(true);

    const contextNoMatch = createContext('UserService.ts');
    expect(validator.validate(constraint, contextNoMatch).passed).toBe(false);
  });

  it('should handle invalid regex gracefully', () => {
    const constraint: Constraint = {
      rule: 'naming_pattern',
      value: '[invalid(regex',
      severity: 'warning',
    };
    const context = createContext('test.ts');

    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(false);
    expect(result.violations[0].message).toContain('Invalid');
  });
});

describe('LocationPatternValidator', () => {
  let validator: LocationPatternValidator;

  beforeEach(() => {
    validator = new LocationPatternValidator();
  });

  it('should have correct rule name', () => {
    expect(validator.rule).toBe('location_pattern');
  });
});

describe('ForbidImportValidator', () => {
  let validator: ForbidImportValidator;

  beforeEach(() => {
    validator = new ForbidImportValidator();
  });

  it('should have correct rule name', () => {
    expect(validator.rule).toBe('forbid_import');
  });

  it('should have correct error code', () => {
    expect(validator.errorCode).toBe('E003');
  });
});

describe('RequireImportValidator', () => {
  let validator: RequireImportValidator;

  beforeEach(() => {
    validator = new RequireImportValidator();
  });

  it('should have correct rule name', () => {
    expect(validator.rule).toBe('require_import');
  });

  it('should have correct error code', () => {
    expect(validator.errorCode).toBe('E004');
  });
});

describe('MaxFileLinesValidator', () => {
  let validator: MaxFileLinesValidator;

  beforeEach(() => {
    validator = new MaxFileLinesValidator();
  });

  it('should have correct rule name', () => {
    expect(validator.rule).toBe('max_file_lines');
  });

  it('should have correct error code', () => {
    expect(validator.errorCode).toBe('E010');
  });

  it('should pass when file is under limit', () => {
    const constraint: Constraint = {
      rule: 'max_file_lines',
      value: 200,
      severity: 'warning',
    };
    const context = createContext('test.ts', {
      parsedFile: createParsedFile(100),
    });

    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('should pass when file is exactly at limit', () => {
    const constraint: Constraint = {
      rule: 'max_file_lines',
      value: 200,
      severity: 'warning',
    };
    const context = createContext('test.ts', {
      parsedFile: createParsedFile(200),
    });

    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(true);
  });

  it('should fail when file exceeds limit', () => {
    const constraint: Constraint = {
      rule: 'max_file_lines',
      value: 200,
      severity: 'warning',
    };
    const context = createContext('test.ts', {
      parsedFile: createParsedFile(250),
    });

    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('250');
    expect(result.violations[0].message).toContain('200');
  });

  it('should include line count in fix hint', () => {
    const constraint: Constraint = {
      rule: 'max_file_lines',
      value: 150,
      severity: 'warning',
    };
    const context = createContext('test.ts', {
      parsedFile: createParsedFile(200),
    });

    const result = validator.validate(constraint, context);
    expect(result.violations[0].fixHint).toContain('150');
  });
});

describe('RequireTestFileValidator', () => {
  let validator: RequireTestFileValidator;
  let testDir: string;

  beforeEach(async () => {
    validator = new RequireTestFileValidator();
    testDir = join(tmpdir(), `archcodex-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should have correct rule name', () => {
    expect(validator.rule).toBe('require_test_file');
  });

  it('should have correct error code', () => {
    expect(validator.errorCode).toBe('E011');
  });

  it('should skip test files themselves', () => {
    const constraint: Constraint = {
      rule: 'require_test_file',
      value: ['*.test.ts', '*.spec.ts'],
      severity: 'warning',
    };
    const context = createContext('service.test.ts');

    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(true);
  });

  it('should fail when no companion test file exists', () => {
    const constraint: Constraint = {
      rule: 'require_test_file',
      value: ['*.test.ts', '*.spec.ts'],
      severity: 'warning',
    };
    const context = createContext('service.ts', {
      filePath: join(testDir, 'service.ts'),
    });

    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(false);
    expect(result.violations[0].message).toContain('companion test file');
  });

  it('should pass when test file exists in same directory', async () => {
    // Create source file and test file
    await writeFile(join(testDir, 'service.ts'), 'export class Service {}');
    await writeFile(join(testDir, 'service.test.ts'), 'describe("Service", () => {});');

    const constraint: Constraint = {
      rule: 'require_test_file',
      value: ['*.test.ts', '*.spec.ts'],
      severity: 'warning',
    };
    const context = createContext('service.ts', {
      filePath: join(testDir, 'service.ts'),
    });

    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(true);
  });

  it('should pass when spec file exists in same directory', async () => {
    await writeFile(join(testDir, 'service.ts'), 'export class Service {}');
    await writeFile(join(testDir, 'service.spec.ts'), 'describe("Service", () => {});');

    const constraint: Constraint = {
      rule: 'require_test_file',
      value: ['*.test.ts', '*.spec.ts'],
      severity: 'warning',
    };
    const context = createContext('service.ts', {
      filePath: join(testDir, 'service.ts'),
    });

    const result = validator.validate(constraint, context);
    expect(result.passed).toBe(true);
  });
});
