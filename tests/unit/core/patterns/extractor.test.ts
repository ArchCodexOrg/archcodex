/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for pattern extractor utility.
 */
import { describe, it, expect } from 'vitest';
import { extractImportsAndExports, getModuleName } from '../../../../src/core/patterns/extractor.js';

describe('extractImportsAndExports', () => {
  describe('imports', () => {
    it('should extract default imports', () => {
      const content = `import axios from 'axios';`;
      const result = extractImportsAndExports(content);
      expect(result.imports).toContain('axios');
    });

    it('should extract named imports', () => {
      const content = `import { useState, useEffect } from 'react';`;
      const result = extractImportsAndExports(content);
      expect(result.imports).toContain('react');
    });

    it('should extract namespace imports', () => {
      const content = `import * as path from 'path';`;
      const result = extractImportsAndExports(content);
      expect(result.imports).toContain('path');
    });

    it('should extract relative imports', () => {
      const content = `import { logger } from '../utils/logger';`;
      const result = extractImportsAndExports(content);
      expect(result.imports).toContain('../utils/logger');
    });

    it('should extract dynamic imports', () => {
      const content = `const module = await import('some-module');`;
      const result = extractImportsAndExports(content);
      expect(result.imports).toContain('some-module');
    });

    it('should extract require statements', () => {
      const content = `const fs = require('fs');`;
      const result = extractImportsAndExports(content);
      expect(result.imports).toContain('fs');
    });

    it('should deduplicate imports', () => {
      const content = `
        import axios from 'axios';
        import { get } from 'axios';
      `;
      const result = extractImportsAndExports(content);
      const axiosCount = result.imports.filter(i => i === 'axios').length;
      expect(axiosCount).toBe(1);
    });

    it('should handle multiple import types', () => {
      const content = `
        import fs from 'fs';
        import { join } from 'path';
        const module = require('lodash');
        const lazy = await import('lazy-module');
      `;
      const result = extractImportsAndExports(content);
      expect(result.imports).toContain('fs');
      expect(result.imports).toContain('path');
      expect(result.imports).toContain('lodash');
      expect(result.imports).toContain('lazy-module');
    });
  });

  describe('exports', () => {
    it('should extract exported functions', () => {
      const content = `export function validateInput() {}`;
      const result = extractImportsAndExports(content);
      expect(result.exports).toContain('validateInput');
    });

    it('should extract exported async functions', () => {
      const content = `export async function fetchData() {}`;
      const result = extractImportsAndExports(content);
      expect(result.exports).toContain('fetchData');
    });

    it('should extract exported constants', () => {
      const content = `export const API_URL = 'https://api.example.com';`;
      const result = extractImportsAndExports(content);
      expect(result.exports).toContain('API_URL');
    });

    it('should extract exported let variables', () => {
      const content = `export let counter = 0;`;
      const result = extractImportsAndExports(content);
      expect(result.exports).toContain('counter');
    });

    it('should extract exported var variables', () => {
      const content = `export var legacyValue = 'old';`;
      const result = extractImportsAndExports(content);
      expect(result.exports).toContain('legacyValue');
    });

    it('should extract exported classes', () => {
      const content = `export class UserService {}`;
      const result = extractImportsAndExports(content);
      expect(result.exports).toContain('UserService');
    });

    it('should extract exported interfaces', () => {
      const content = `export interface User { name: string; }`;
      const result = extractImportsAndExports(content);
      expect(result.exports).toContain('User');
    });

    it('should extract exported types', () => {
      const content = `export type UserId = string;`;
      const result = extractImportsAndExports(content);
      expect(result.exports).toContain('UserId');
    });

    it('should extract exported enums', () => {
      const content = `export enum Status { Active, Inactive }`;
      const result = extractImportsAndExports(content);
      expect(result.exports).toContain('Status');
    });

    it('should extract named exports', () => {
      const content = `export { foo, bar, baz };`;
      const result = extractImportsAndExports(content);
      expect(result.exports).toContain('foo');
      expect(result.exports).toContain('bar');
      expect(result.exports).toContain('baz');
    });

    it('should extract named exports with aliases (taking original name)', () => {
      const content = `export { originalName as aliasName };`;
      const result = extractImportsAndExports(content);
      expect(result.exports).toContain('originalName');
      expect(result.exports).not.toContain('aliasName');
    });

    it('should extract default exported function', () => {
      const content = `export default function MyComponent() {}`;
      const result = extractImportsAndExports(content);
      expect(result.exports).toContain('MyComponent');
    });

    it('should extract default exported class', () => {
      const content = `export default class MainClass {}`;
      const result = extractImportsAndExports(content);
      expect(result.exports).toContain('MainClass');
    });

    it('should deduplicate exports', () => {
      const content = `
        export const foo = 1;
        export { foo };
      `;
      const result = extractImportsAndExports(content);
      const fooCount = result.exports.filter(e => e === 'foo').length;
      expect(fooCount).toBe(1);
    });

    it('should filter out type keyword from exports', () => {
      const content = `export { type User, Config };`;
      const result = extractImportsAndExports(content);
      expect(result.exports).not.toContain('type');
      expect(result.exports).toContain('Config');
    });
  });

  describe('combined', () => {
    it('should return empty arrays for content without imports/exports', () => {
      const content = `const x = 1; function foo() {}`;
      const result = extractImportsAndExports(content);
      expect(result.imports).toEqual([]);
      expect(result.exports).toEqual([]);
    });

    it('should handle complex file content', () => {
      const content = `
        import { join } from 'path';
        import axios from 'axios';

        export const API_BASE = '/api';

        export async function fetchUsers() {
          return axios.get(join(API_BASE, 'users'));
        }

        export class UserService {
          async getUser(id: string) {}
        }

        export default function main() {}
      `;
      const result = extractImportsAndExports(content);

      expect(result.imports).toContain('path');
      expect(result.imports).toContain('axios');
      expect(result.exports).toContain('API_BASE');
      expect(result.exports).toContain('fetchUsers');
      expect(result.exports).toContain('UserService');
      expect(result.exports).toContain('main');
    });
  });
});

describe('getModuleName', () => {
  it('should extract module name from simple package', () => {
    expect(getModuleName('lodash')).toBe('lodash');
  });

  it('should extract module name from scoped package', () => {
    expect(getModuleName('@company/api')).toBe('api');
  });

  it('should extract module name from relative path', () => {
    expect(getModuleName('../utils/logger')).toBe('logger');
  });

  it('should extract module name from deep relative path', () => {
    expect(getModuleName('../../core/services/user')).toBe('user');
  });

  it('should remove .js extension', () => {
    expect(getModuleName('./file.js')).toBe('file');
  });

  it('should remove .ts extension', () => {
    expect(getModuleName('./file.ts')).toBe('file');
  });

  it('should remove .tsx extension', () => {
    expect(getModuleName('./component.tsx')).toBe('component');
  });

  it('should remove .jsx extension', () => {
    expect(getModuleName('./component.jsx')).toBe('component');
  });

  it('should remove .mjs extension', () => {
    expect(getModuleName('./module.mjs')).toBe('module');
  });

  it('should remove .cjs extension', () => {
    expect(getModuleName('./module.cjs')).toBe('module');
  });

  it('should handle index files by returning parent directory', () => {
    expect(getModuleName('./utils/index')).toBe('utils');
  });

  it('should handle index.js by returning parent directory', () => {
    expect(getModuleName('./utils/index.js')).toBe('utils');
  });

  it('should return index if no parent directory', () => {
    expect(getModuleName('index')).toBe('index');
  });

  it('should handle absolute paths', () => {
    expect(getModuleName('/Users/project/src/utils/logger')).toBe('logger');
  });
});
