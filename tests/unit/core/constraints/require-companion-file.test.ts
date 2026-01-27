/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { RequireCompanionFileValidator } from '../../../../src/core/constraints/require-companion-file.js';
import type { Constraint } from '../../../../src/core/registry/schema.js';
import type { ConstraintContext } from '../../../../src/core/constraints/types.js';
import type { SemanticModel } from '../../../../src/validators/semantic.types.js';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

describe('RequireCompanionFileValidator', () => {
  const validator = new RequireCompanionFileValidator();

  const createContext = (
    filePath: string,
    fileName: string
  ): ConstraintContext => ({
    filePath,
    fileName,
    archId: 'test.arch',
    constraintSource: 'test.arch',
    parsedFile: {
      filePath,
      fileName,
      extension: '.ts',
      content: '',
      lineCount: 100,
      language: 'typescript',
      imports: [],
      classes: [],
      interfaces: [],
      functions: [],
      functionCalls: [],
      mutations: [],
      exports: [],
    } as SemanticModel,
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct rule name', () => {
    expect(validator.rule).toBe('require_companion_file');
  });

  describe('Phase 1: Existence check', () => {
    it('should pass when companion file exists (string value)', () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const constraint: Constraint = {
        rule: 'require_companion_file',
        value: './index.ts',
        severity: 'warning',
      };
      const context = createContext('/project/src/MyService.ts', 'MyService.ts');
      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should fail when companion file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const constraint: Constraint = {
        rule: 'require_companion_file',
        value: './index.ts',
        severity: 'warning',
      };
      const context = createContext('/project/src/MyService.ts', 'MyService.ts');
      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain('Missing companion file');
    });

    it('should skip validation for barrel files (index.ts)', () => {
      const constraint: Constraint = {
        rule: 'require_companion_file',
        value: './index.ts',
        severity: 'warning',
      };
      const context = createContext('/project/src/index.ts', 'index.ts');
      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
      expect(existsSync).not.toHaveBeenCalled();
    });

    it('should skip validation for test files', () => {
      const constraint: Constraint = {
        rule: 'require_companion_file',
        value: './index.ts',
        severity: 'warning',
      };
      const context = createContext('/project/src/MyService.test.ts', 'MyService.test.ts');
      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
      expect(existsSync).not.toHaveBeenCalled();
    });

    it('should skip validation for story files', () => {
      const constraint: Constraint = {
        rule: 'require_companion_file',
        value: './index.ts',
        severity: 'warning',
      };
      const context = createContext('/project/src/Button.stories.tsx', 'Button.stories.tsx');
      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
      expect(existsSync).not.toHaveBeenCalled();
    });
  });

  describe('Variable substitution', () => {
    it('should substitute ${name} with file basename', () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const constraint: Constraint = {
        rule: 'require_companion_file',
        value: '${name}.test.ts',
        severity: 'warning',
      };
      const context = createContext('/project/src/Calculator.ts', 'Calculator.ts');
      validator.validate(constraint, context);

      expect(existsSync).toHaveBeenCalledWith('/project/src/Calculator.test.ts');
    });

    it('should substitute ${name:kebab} with kebab-case name', () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const constraint: Constraint = {
        rule: 'require_companion_file',
        value: '${name:kebab}.module.css',
        severity: 'warning',
      };
      const context = createContext('/project/src/MyComponent.tsx', 'MyComponent.tsx');
      validator.validate(constraint, context);

      expect(existsSync).toHaveBeenCalledWith('/project/src/my-component.module.css');
    });

    it('should substitute ${ext} with file extension', () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const constraint: Constraint = {
        rule: 'require_companion_file',
        value: '${name}.test.${ext}',
        severity: 'warning',
      };
      const context = createContext('/project/src/Button.tsx', 'Button.tsx');
      validator.validate(constraint, context);

      expect(existsSync).toHaveBeenCalledWith('/project/src/Button.test.tsx');
    });

    it('should substitute ${dir} with parent directory name', () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const constraint: Constraint = {
        rule: 'require_companion_file',
        value: './${dir}-barrel.ts',
        severity: 'warning',
      };
      const context = createContext('/project/src/components/Button.tsx', 'Button.tsx');
      validator.validate(constraint, context);

      expect(existsSync).toHaveBeenCalledWith('/project/src/components/components-barrel.ts');
    });
  });

  describe('Phase 2: must_export validation', () => {
    it('should pass when companion exports from source file', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue("export * from './MyService.js';");

      const constraint: Constraint = {
        rule: 'require_companion_file',
        value: {
          path: './index.ts',
          must_export: true,
        },
        severity: 'warning',
      };
      const context = createContext('/project/src/MyService.ts', 'MyService.ts');
      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });

    it('should fail when companion does not export from source file', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue("export * from './other.js';");

      const constraint: Constraint = {
        rule: 'require_companion_file',
        value: {
          path: './index.ts',
          must_export: true,
        },
        severity: 'warning',
      };
      const context = createContext('/project/src/MyService.ts', 'MyService.ts');
      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations[0].message).toContain('does not export from');
    });

    it('should recognize named exports', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue("export { MyService } from './MyService.js';");

      const constraint: Constraint = {
        rule: 'require_companion_file',
        value: {
          path: './index.ts',
          must_export: true,
        },
        severity: 'warning',
      };
      const context = createContext('/project/src/MyService.ts', 'MyService.ts');
      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });

    it('should recognize exports without extension', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue("export * from './MyService';");

      const constraint: Constraint = {
        rule: 'require_companion_file',
        value: {
          path: './index.ts',
          must_export: true,
        },
        severity: 'warning',
      };
      const context = createContext('/project/src/MyService.ts', 'MyService.ts');
      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });
  });

  describe('Array values', () => {
    it('should check multiple companion files', () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        if (String(path).includes('index.ts')) return true;
        if (String(path).includes('.test.ts')) return false;
        return false;
      });

      const constraint: Constraint = {
        rule: 'require_companion_file',
        value: ['./index.ts', '${name}.test.ts'],
        severity: 'warning',
      };
      const context = createContext('/project/src/MyService.ts', 'MyService.ts');
      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain('MyService.test.ts');
    });

    it('should pass when all companion files exist', () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const constraint: Constraint = {
        rule: 'require_companion_file',
        value: ['./index.ts', '${name}.test.ts', '${name}.stories.tsx'],
        severity: 'warning',
      };
      const context = createContext('/project/src/Button.tsx', 'Button.tsx');
      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });
  });

  describe('Phase 3: Auto-fix suggestions', () => {
    it('should suggest barrel file content', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const constraint: Constraint = {
        rule: 'require_companion_file',
        value: './index.ts',
        severity: 'warning',
      };
      const context = createContext('/project/src/utils/MyService.ts', 'MyService.ts');
      const result = validator.validate(constraint, context);

      expect(result.violations[0].suggestion).toBeDefined();
      expect(result.violations[0].suggestion?.action).toBe('add');
      expect(result.violations[0].suggestion?.replacement).toContain('export *');
      expect(result.violations[0].suggestion?.replacement).toContain('MyService');
    });

    it('should suggest test file content', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const constraint: Constraint = {
        rule: 'require_companion_file',
        value: '${name}.test.ts',
        severity: 'warning',
      };
      const context = createContext('/project/src/Calculator.ts', 'Calculator.ts');
      const result = validator.validate(constraint, context);

      expect(result.violations[0].suggestion).toBeDefined();
      expect(result.violations[0].suggestion?.replacement).toContain('describe');
      expect(result.violations[0].suggestion?.replacement).toContain('Calculator');
    });

    it('should suggest story file content', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const constraint: Constraint = {
        rule: 'require_companion_file',
        value: '${name}.stories.tsx',
        severity: 'warning',
      };
      const context = createContext('/project/src/Button.tsx', 'Button.tsx');
      const result = validator.validate(constraint, context);

      expect(result.violations[0].suggestion).toBeDefined();
      expect(result.violations[0].suggestion?.replacement).toContain('Meta');
      expect(result.violations[0].suggestion?.replacement).toContain('StoryObj');
      expect(result.violations[0].suggestion?.replacement).toContain('Button');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty value gracefully', () => {
      const constraint: Constraint = {
        rule: 'require_companion_file',
        value: [],
        severity: 'warning',
      };
      const context = createContext('/project/src/MyService.ts', 'MyService.ts');
      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });

    it('should handle object without path gracefully', () => {
      const constraint: Constraint = {
        rule: 'require_companion_file',
        value: {} as unknown,
        severity: 'warning',
      };
      const context = createContext('/project/src/MyService.ts', 'MyService.ts');
      const result = validator.validate(constraint, context);

      expect(result.passed).toBe(true);
    });
  });
});
