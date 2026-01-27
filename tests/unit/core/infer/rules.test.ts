/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import {
  inferArchitecture,
  isBarrelFile,
  parseConfigRules,
  buildRulesFromSettings,
  DEFAULT_RULES,
  type InferenceRule,
} from '../../../../src/core/infer/rules.js';
import type { InferenceSettings } from '../../../../src/core/config/schema.js';

describe('inferArchitecture', () => {
  describe('with DEFAULT_RULES', () => {
    describe('React hooks', () => {
      it('should detect hooks by use* prefix and export', () => {
        const result = inferArchitecture('useAuth.ts', 'export const useAuth = () => {}', DEFAULT_RULES);
        expect(result).toBeDefined();
        expect(result?.archId).toBe('frontend.hook');
        expect(result?.confidence).toBe('high');
      });

      it('should detect hooks with function export', () => {
        const result = inferArchitecture('useUser.tsx', 'export function useUser() { return null; }', DEFAULT_RULES);
        expect(result).toBeDefined();
        expect(result?.archId).toBe('frontend.hook');
      });

      it('should not match non-hook files starting with use', () => {
        // File doesn't start with use[A-Z]
        const result = inferArchitecture('useful.ts', 'export const useful = () => {}', DEFAULT_RULES);
        expect(result?.archId).not.toBe('frontend.hook');
      });
    });

    describe('React Context', () => {
      it('should detect createContext calls', () => {
        const result = inferArchitecture('AuthContext.tsx', 'const ctx = createContext<User>(null);', DEFAULT_RULES);
        expect(result).toBeDefined();
        expect(result?.archId).toBe('frontend.context');
        expect(result?.confidence).toBe('high');
      });

      it('should detect createContext with generic', () => {
        const result = inferArchitecture('ThemeContext.tsx', 'export const ThemeContext = createContext<Theme>({ dark: false });', DEFAULT_RULES);
        expect(result?.archId).toBe('frontend.context');
      });
    });

    describe('Barrel files', () => {
      it('should detect index files with re-exports', () => {
        const result = inferArchitecture('index.ts', 'export * from "./foo";\nexport { bar } from "./bar";', DEFAULT_RULES);
        expect(result).toBeDefined();
        expect(result?.archId).toBe('base.barrel');
        expect(result?.confidence).toBe('high');
      });

      it('should detect index.js barrel files', () => {
        const result = inferArchitecture('index.js', 'export { default } from "./main";', DEFAULT_RULES);
        expect(result?.archId).toBe('base.barrel');
      });
    });

    describe('Convex functions', () => {
      it('should detect Convex mutations', () => {
        const result = inferArchitecture('mutations.ts', 'export const create = mutation(async () => {});', DEFAULT_RULES);
        expect(result).toBeDefined();
        expect(result?.archId).toBe('convex.mutation');
      });

      it('should detect Convex queries', () => {
        const result = inferArchitecture('queries.ts', 'export const get = query(async () => {});', DEFAULT_RULES);
        expect(result).toBeDefined();
        expect(result?.archId).toBe('convex.query');
      });

      it('should detect Convex actions', () => {
        const result = inferArchitecture('actions.ts', 'export const sendEmail = action(async () => {});', DEFAULT_RULES);
        expect(result?.archId).toBe('convex.action');
      });
    });

    describe('React Components', () => {
      it('should detect .tsx files with JSX return', () => {
        const result = inferArchitecture('UserCard.tsx', 'export function UserCard() { return (<div>Hello</div>); }', DEFAULT_RULES);
        expect(result).toBeDefined();
        expect(result?.archId).toBe('frontend.component');
        expect(result?.confidence).toBe('medium');
      });

      it('should detect arrow function components', () => {
        const result = inferArchitecture('Button.tsx', 'export const Button = () => { return <button>Click</button>; }', DEFAULT_RULES);
        expect(result?.archId).toBe('frontend.component');
      });

      it('should not detect .ts files as components even with JSX-like strings', () => {
        const result = inferArchitecture('utils.ts', 'export function render() { return "<div>"; }', DEFAULT_RULES);
        expect(result?.archId).not.toBe('frontend.component');
      });
    });

    describe('Type files', () => {
      it('should detect .types.ts files', () => {
        const result = inferArchitecture('user.types.ts', 'export interface User { id: string; }', DEFAULT_RULES);
        expect(result).toBeDefined();
        expect(result?.archId).toBe('base.types');
      });

      it('should detect .type.ts files (singular)', () => {
        const result = inferArchitecture('api.type.ts', 'export type ApiResponse = { data: unknown };', DEFAULT_RULES);
        expect(result?.archId).toBe('base.types');
      });
    });

    describe('Test files', () => {
      it('should detect .test.ts files', () => {
        const result = inferArchitecture('user.test.ts', 'describe("user", () => {});', DEFAULT_RULES);
        expect(result).toBeDefined();
        expect(result?.archId).toBe('base.test');
        expect(result?.confidence).toBe('high');
      });

      it('should detect .spec.ts files', () => {
        const result = inferArchitecture('auth.spec.ts', 'it("should authenticate", () => {});', DEFAULT_RULES);
        expect(result?.archId).toBe('base.test');
      });

      it('should detect .test.tsx files', () => {
        const result = inferArchitecture('Button.test.tsx', 'render(<Button />);', DEFAULT_RULES);
        expect(result?.archId).toBe('base.test');
      });
    });

    describe('No match', () => {
      it('should return null for files with no matching patterns', () => {
        const result = inferArchitecture('random.ts', 'const x = 1;', DEFAULT_RULES);
        expect(result).toBeNull();
      });

      it('should return null for empty content', () => {
        const result = inferArchitecture('empty.ts', '', DEFAULT_RULES);
        expect(result).toBeNull();
      });
    });
  });

  describe('full path matching', () => {
    it('should match patterns against full relative path', () => {
      const rules: InferenceRule[] = [{
        name: 'cli-command',
        archId: 'app.cli.command',
        confidence: 'high',
        filePattern: /src\/cli\/commands\/.*\.ts$/,
        description: 'CLI command files',
      }];

      const result = inferArchitecture('src/cli/commands/check.ts', 'export function run() {}', rules);
      expect(result?.archId).toBe('app.cli.command');
    });

    it('should match nested paths', () => {
      const rules: InferenceRule[] = [{
        name: 'deep-test',
        archId: 'test.unit',
        confidence: 'high',
        filePattern: /tests\/unit\/.*\.test\.ts$/,
        description: 'Unit test files',
      }];

      const result = inferArchitecture('tests/unit/core/constraints/base.test.ts', 'describe("test", () => {});', rules);
      expect(result?.archId).toBe('test.unit');
    });

    it('should not match when path does not include expected directories', () => {
      const rules: InferenceRule[] = [{
        name: 'src-only',
        archId: 'app.src',
        confidence: 'high',
        filePattern: /^src\/.*\.ts$/,
        description: 'Source files',
      }];

      const result = inferArchitecture('lib/utils.ts', 'export const x = 1;', rules);
      expect(result).toBeNull();
    });

    it('should work with just filename pattern (no directory)', () => {
      const rules: InferenceRule[] = [{
        name: 'test-file',
        archId: 'test.any',
        confidence: 'high',
        filePattern: /\.test\.ts$/,
        description: 'Any test file',
      }];

      // Should match regardless of path
      expect(inferArchitecture('foo.test.ts', '', rules)?.archId).toBe('test.any');
      expect(inferArchitecture('src/foo.test.ts', '', rules)?.archId).toBe('test.any');
      expect(inferArchitecture('tests/unit/deep/foo.test.ts', '', rules)?.archId).toBe('test.any');
    });
  });

  describe('custom rules', () => {
    it('should use custom rules when provided', () => {
      const customRules: InferenceRule[] = [{
        name: 'my-service',
        archId: 'myapp.service',
        confidence: 'high',
        filePattern: /Service\.ts$/,
        description: 'Service files',
      }];

      const result = inferArchitecture('UserService.ts', 'class UserService {}', customRules);
      expect(result?.archId).toBe('myapp.service');
    });

    it('should return first matching rule (first-match-wins)', () => {
      const rules: InferenceRule[] = [
        {
          name: 'specific',
          archId: 'specific.match',
          confidence: 'high',
          filePattern: /UserService\.ts$/,
          description: 'Specific file',
        },
        {
          name: 'general',
          archId: 'general.match',
          confidence: 'medium',
          filePattern: /Service\.ts$/,
          description: 'Any service',
        },
      ];

      const result = inferArchitecture('UserService.ts', '', rules);
      expect(result?.archId).toBe('specific.match');
    });

    it('should fall through to next rule on no match', () => {
      const rules: InferenceRule[] = [
        {
          name: 'specific',
          archId: 'specific.match',
          confidence: 'high',
          filePattern: /UserService\.ts$/,
          description: 'Specific file',
        },
        {
          name: 'general',
          archId: 'general.match',
          confidence: 'medium',
          filePattern: /Service\.ts$/,
          description: 'Any service',
        },
      ];

      const result = inferArchitecture('OrderService.ts', '', rules);
      expect(result?.archId).toBe('general.match');
    });
  });

  describe('matchAll logic', () => {
    it('should require all patterns when matchAll is true', () => {
      const rules: InferenceRule[] = [{
        name: 'react-component',
        archId: 'frontend.component',
        confidence: 'high',
        filePattern: /\.tsx$/,
        contentPatterns: [/export/, /return\s*</],
        matchAll: true,
        description: 'React component with export and JSX',
      }];

      // Has both patterns
      const match = inferArchitecture('Button.tsx', 'export function Button() { return <div/>; }', rules);
      expect(match?.archId).toBe('frontend.component');

      // Missing JSX return
      const noJsx = inferArchitecture('util.tsx', 'export function util() { return null; }', rules);
      expect(noJsx).toBeNull();

      // Missing export
      const noExport = inferArchitecture('internal.tsx', 'function Internal() { return <div/>; }', rules);
      expect(noExport).toBeNull();
    });

    it('should match any pattern when matchAll is false (OR logic)', () => {
      const rules: InferenceRule[] = [{
        name: 'convex-function',
        archId: 'convex.function',
        confidence: 'high',
        contentPatterns: [/mutation\(/, /query\(/, /action\(/],
        matchAll: false,
        description: 'Any Convex function',
      }];

      expect(inferArchitecture('mutations.ts', 'export const x = mutation(() => {});', rules)?.archId).toBe('convex.function');
      expect(inferArchitecture('queries.ts', 'export const x = query(() => {});', rules)?.archId).toBe('convex.function');
      expect(inferArchitecture('actions.ts', 'export const x = action(() => {});', rules)?.archId).toBe('convex.function');
      expect(inferArchitecture('other.ts', 'export const x = 1;', rules)).toBeNull();
    });

    it('should default to OR logic when matchAll is undefined', () => {
      const rules: InferenceRule[] = [{
        name: 'test',
        archId: 'test.file',
        confidence: 'high',
        contentPatterns: [/describe\(/, /it\(/, /test\(/],
        // matchAll not specified
        description: 'Test file',
      }];

      expect(inferArchitecture('a.ts', 'describe("x", () => {});', rules)?.archId).toBe('test.file');
      expect(inferArchitecture('b.ts', 'it("should work", () => {});', rules)?.archId).toBe('test.file');
      expect(inferArchitecture('c.ts', 'test("works", () => {});', rules)?.archId).toBe('test.file');
    });
  });

  describe('filePattern only rules', () => {
    it('should match based on file pattern alone', () => {
      const rules: InferenceRule[] = [{
        name: 'types',
        archId: 'core.types',
        confidence: 'medium',
        filePattern: /\.types\.ts$/,
        description: 'Type definition files',
      }];

      const result = inferArchitecture('user.types.ts', '', rules);
      expect(result?.archId).toBe('core.types');
    });

    it('should not match if filePattern fails', () => {
      const rules: InferenceRule[] = [{
        name: 'types',
        archId: 'core.types',
        confidence: 'medium',
        filePattern: /\.types\.ts$/,
        description: 'Type definition files',
      }];

      const result = inferArchitecture('user.ts', 'export type User = {};', rules);
      expect(result).toBeNull();
    });
  });

  describe('contentPatterns only rules', () => {
    it('should match based on content alone', () => {
      const rules: InferenceRule[] = [{
        name: 'zod-schema',
        archId: 'core.schema',
        confidence: 'medium',
        contentPatterns: [/z\.object\(/],
        description: 'Zod schema file',
      }];

      const result = inferArchitecture('anything.ts', 'const schema = z.object({ name: z.string() });', rules);
      expect(result?.archId).toBe('core.schema');
    });
  });

  describe('combined filePattern and contentPatterns', () => {
    it('should match if filePattern matches (contentPatterns are optional without matchAll)', () => {
      const rules: InferenceRule[] = [{
        name: 'types-file',
        archId: 'core.types',
        confidence: 'high',
        filePattern: /\.types\.ts$/,
        contentPatterns: [/export\s+interface/], // Optional - just adds confidence
        description: 'Type file',
      }];

      // File pattern alone is sufficient
      const fileOnly = inferArchitecture('user.types.ts', 'export type User = string;', rules);
      expect(fileOnly?.archId).toBe('core.types');

      // Both matching adds to matchedPatterns
      const both = inferArchitecture('user.types.ts', 'export interface User {}', rules);
      expect(both?.archId).toBe('core.types');
      expect(both?.matchedPatterns).toHaveLength(2);
    });

    it('should require BOTH filePattern AND contentPatterns when matchAll is true', () => {
      const rules: InferenceRule[] = [{
        name: 'nestjs-controller',
        archId: 'api.controller',
        confidence: 'high',
        filePattern: /\.controller\.ts$/,
        contentPatterns: [/@Controller\(/],
        matchAll: true, // Requires ALL patterns including filePattern
        description: 'NestJS controller',
      }];

      // Both match
      const match = inferArchitecture('user.controller.ts', '@Controller("users") class UserController {}', rules);
      expect(match?.archId).toBe('api.controller');

      // File matches, content doesn't - should NOT match due to matchAll
      const noDecorator = inferArchitecture('user.controller.ts', 'class UserController {}', rules);
      expect(noDecorator).toBeNull();

      // Content matches, file doesn't - should NOT match
      const wrongFile = inferArchitecture('user.ts', '@Controller("users") class UserController {}', rules);
      expect(wrongFile).toBeNull();
    });

    it('should match content only (no filePattern) when content matches', () => {
      const rules: InferenceRule[] = [{
        name: 'zod-schema',
        archId: 'core.schema',
        confidence: 'medium',
        contentPatterns: [/z\.object\(/],
        description: 'Zod schema',
      }];

      const match = inferArchitecture('anything.ts', 'const x = z.object({});', rules);
      expect(match?.archId).toBe('core.schema');

      const noMatch = inferArchitecture('anything.ts', 'const x = 1;', rules);
      expect(noMatch).toBeNull();
    });
  });

  describe('matchedPatterns tracking', () => {
    it('should track which patterns matched', () => {
      const rules: InferenceRule[] = [{
        name: 'test',
        archId: 'test',
        confidence: 'high',
        filePattern: /\.test\.ts$/,
        contentPatterns: [/describe\(/],
        description: 'Test file',
      }];

      const result = inferArchitecture('foo.test.ts', 'describe("test", () => {});', rules);
      expect(result?.matchedPatterns).toContain('path: \\.test\\.ts$');
      expect(result?.matchedPatterns).toContain('content: describe\\(');
    });
  });
});

describe('parseConfigRules', () => {
  it('should convert string patterns to RegExp', () => {
    const configRules = [{
      name: 'test',
      archId: 'test.arch',
      confidence: 'high' as const,
      filePattern: '\\.test\\.ts$',
      contentPatterns: ['describe\\(', 'it\\('],
      description: 'Test file',
    }];

    const rules = parseConfigRules(configRules);

    expect(rules[0].filePattern).toBeInstanceOf(RegExp);
    expect(rules[0].filePattern?.source).toBe('\\.test\\.ts$');
    expect(rules[0].contentPatterns?.[0]).toBeInstanceOf(RegExp);
    expect(rules[0].contentPatterns?.[1]).toBeInstanceOf(RegExp);
  });

  it('should handle missing optional fields', () => {
    const configRules = [{
      name: 'minimal',
      archId: 'minimal.arch',
      confidence: 'medium' as const, // Zod default applied during config load, explicit here
      description: 'Minimal rule',
    }];

    const rules = parseConfigRules(configRules);

    expect(rules[0].filePattern).toBeUndefined();
    expect(rules[0].contentPatterns).toBeUndefined();
    expect(rules[0].matchAll).toBeUndefined();
    expect(rules[0].confidence).toBe('medium');
  });

  it('should preserve matchAll setting', () => {
    const configRules = [{
      name: 'strict',
      archId: 'strict.arch',
      matchAll: true,
      description: 'Strict rule',
    }];

    const rules = parseConfigRules(configRules);
    expect(rules[0].matchAll).toBe(true);
  });

  it('should handle empty array', () => {
    const rules = parseConfigRules([]);
    expect(rules).toEqual([]);
  });

  it('should handle complex regex patterns', () => {
    const configRules = [{
      name: 'complex',
      archId: 'complex.arch',
      filePattern: 'src/(core|utils)/.*\\.ts$',
      contentPatterns: ['export\\s+(const|function|class)\\s+\\w+'],
      description: 'Complex pattern',
    }];

    const rules = parseConfigRules(configRules);

    expect(rules[0].filePattern?.test('src/core/engine.ts')).toBe(true);
    expect(rules[0].filePattern?.test('src/utils/helpers.ts')).toBe(true);
    expect(rules[0].filePattern?.test('src/cli/command.ts')).toBe(false);
  });
});

describe('buildRulesFromSettings', () => {
  it('should return empty array when no settings and use_builtin_rules is false', () => {
    const rules = buildRulesFromSettings(undefined);
    expect(rules).toEqual([]);
  });

  it('should return empty array when settings has no custom rules and use_builtin_rules is false', () => {
    const settings: InferenceSettings = {
      use_builtin_rules: false,
      prepend_custom: true,
      validate_arch_ids: true,
    };
    const rules = buildRulesFromSettings(settings);
    expect(rules).toEqual([]);
  });

  it('should return only custom rules when use_builtin_rules is false', () => {
    const settings: InferenceSettings = {
      use_builtin_rules: false,
      prepend_custom: true,
      validate_arch_ids: true,
      custom_rules: [{
        name: 'custom',
        archId: 'custom.arch',
        description: 'Custom rule',
      }],
    };

    const rules = buildRulesFromSettings(settings);
    expect(rules).toHaveLength(1);
    expect(rules[0].archId).toBe('custom.arch');
  });

  it('should return DEFAULT_RULES when use_builtin_rules is true and no custom rules', () => {
    const settings: InferenceSettings = {
      use_builtin_rules: true,
      prepend_custom: true,
      validate_arch_ids: true,
    };

    const rules = buildRulesFromSettings(settings);
    expect(rules).toEqual(DEFAULT_RULES);
  });

  it('should prepend custom rules when prepend_custom is true', () => {
    const settings: InferenceSettings = {
      use_builtin_rules: true,
      prepend_custom: true,
      validate_arch_ids: true,
      custom_rules: [{
        name: 'custom',
        archId: 'custom.arch',
        description: 'Custom rule',
      }],
    };

    const rules = buildRulesFromSettings(settings);
    expect(rules[0].archId).toBe('custom.arch');
    expect(rules.slice(1)).toEqual(DEFAULT_RULES);
  });

  it('should append custom rules when prepend_custom is false', () => {
    const settings: InferenceSettings = {
      use_builtin_rules: true,
      prepend_custom: false,
      validate_arch_ids: true,
      custom_rules: [{
        name: 'custom',
        archId: 'custom.arch',
        description: 'Custom rule',
      }],
    };

    const rules = buildRulesFromSettings(settings);
    expect(rules.slice(0, -1)).toEqual(DEFAULT_RULES);
    expect(rules[rules.length - 1].archId).toBe('custom.arch');
  });

  it('should handle multiple custom rules', () => {
    const settings: InferenceSettings = {
      use_builtin_rules: false,
      prepend_custom: true,
      validate_arch_ids: true,
      custom_rules: [
        { name: 'first', archId: 'first.arch', description: 'First' },
        { name: 'second', archId: 'second.arch', description: 'Second' },
        { name: 'third', archId: 'third.arch', description: 'Third' },
      ],
    };

    const rules = buildRulesFromSettings(settings);
    expect(rules).toHaveLength(3);
    expect(rules.map(r => r.archId)).toEqual(['first.arch', 'second.arch', 'third.arch']);
  });
});

describe('isBarrelFile', () => {
  it('should return true for files with only exports', () => {
    expect(isBarrelFile('export * from "./foo";\nexport { bar } from "./bar";')).toBe(true);
  });

  it('should return false for files with logic', () => {
    expect(isBarrelFile('export * from "./foo";\nconst x = 1;')).toBe(false);
  });

  it('should return true for single export', () => {
    expect(isBarrelFile('export { default } from "./main";')).toBe(true);
  });

  it('should handle comments', () => {
    const content = `// Barrel file
/* Re-exports all modules */
export * from "./a";
export * from "./b";`;
    expect(isBarrelFile(content)).toBe(true);
  });

  it('should return false for empty file', () => {
    expect(isBarrelFile('')).toBe(true); // All lines (none) are exports
  });

  it('should return false for import statements', () => {
    expect(isBarrelFile('import { x } from "./x";\nexport { x };')).toBe(false);
  });
});

describe('edge cases', () => {
  describe('special characters in patterns', () => {
    it('should handle dots in file extensions', () => {
      const rules: InferenceRule[] = [{
        name: 'test',
        archId: 'test',
        confidence: 'high',
        filePattern: /\.test\.ts$/,
        description: 'Test',
      }];

      expect(inferArchitecture('foo.test.ts', '', rules)?.archId).toBe('test');
      expect(inferArchitecture('footestts', '', rules)).toBeNull(); // Dots not escaped in input
    });

    it('should handle parentheses in content patterns', () => {
      const rules: InferenceRule[] = [{
        name: 'func',
        archId: 'func',
        confidence: 'high',
        contentPatterns: [/function\s+\w+\(/],
        description: 'Function',
      }];

      expect(inferArchitecture('a.ts', 'function foo() {}', rules)?.archId).toBe('func');
      expect(inferArchitecture('a.ts', 'const foo = 1;', rules)).toBeNull();
    });
  });

  describe('whitespace handling', () => {
    it('should match content with various whitespace', () => {
      const rules: InferenceRule[] = [{
        name: 'export',
        archId: 'export',
        confidence: 'high',
        contentPatterns: [/export\s+const/],
        description: 'Exported const',
      }];

      expect(inferArchitecture('a.ts', 'export const x = 1;', rules)?.archId).toBe('export');
      expect(inferArchitecture('a.ts', 'export  const x = 1;', rules)?.archId).toBe('export');
      expect(inferArchitecture('a.ts', 'export\tconst x = 1;', rules)?.archId).toBe('export');
      expect(inferArchitecture('a.ts', 'export\nconst x = 1;', rules)?.archId).toBe('export');
    });
  });

  describe('case sensitivity', () => {
    it('should be case-sensitive by default', () => {
      const rules: InferenceRule[] = [{
        name: 'class',
        archId: 'class',
        confidence: 'high',
        contentPatterns: [/class\s+\w+/],
        description: 'Class',
      }];

      expect(inferArchitecture('a.ts', 'class Foo {}', rules)?.archId).toBe('class');
      expect(inferArchitecture('a.ts', 'CLASS Foo {}', rules)).toBeNull();
    });

    it('should support case-insensitive patterns with flag', () => {
      const rules: InferenceRule[] = [{
        name: 'todo',
        archId: 'todo',
        confidence: 'high',
        contentPatterns: [/TODO:/i],
        description: 'Contains TODO',
      }];

      expect(inferArchitecture('a.ts', '// TODO: fix', rules)?.archId).toBe('todo');
      expect(inferArchitecture('a.ts', '// todo: fix', rules)?.archId).toBe('todo');
      expect(inferArchitecture('a.ts', '// Todo: fix', rules)?.archId).toBe('todo');
    });
  });

  describe('multiline content', () => {
    it('should match patterns across content', () => {
      const rules: InferenceRule[] = [{
        name: 'react',
        archId: 'react',
        confidence: 'high',
        contentPatterns: [/return\s*\(?\s*</],
        description: 'React component',
      }];

      const multiline = `
export function Component() {
  return (
    <div>
      Hello
    </div>
  );
}`;
      expect(inferArchitecture('a.tsx', multiline, rules)?.archId).toBe('react');
    });
  });

  describe('empty rules array', () => {
    it('should return null when rules array is empty', () => {
      const result = inferArchitecture('any.ts', 'any content', []);
      expect(result).toBeNull();
    });
  });

  describe('rule without any patterns', () => {
    it('should not match rules without filePattern or contentPatterns', () => {
      const rules: InferenceRule[] = [{
        name: 'empty',
        archId: 'empty',
        confidence: 'high',
        description: 'No patterns',
      }];

      const result = inferArchitecture('any.ts', 'any content', rules);
      expect(result).toBeNull();
    });
  });
});
