/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for arch-tag utilities.
 */
import { describe, it, expect } from 'vitest';
import {
  insertArchTag,
  replaceArchTag,
  detectLanguageFromExtension,
  hasArchTag,
  extractArchId,
} from '../../../src/utils/arch-tag.js';

describe('arch-tag utils', () => {
  describe('insertArchTag', () => {
    it('should insert tag at start of empty file', () => {
      const result = insertArchTag('', 'test.arch');
      expect(result).toBe('/**\n * @arch test.arch\n */\n');
    });

    it('should insert tag at start of file with content', () => {
      const content = 'const x = 1;';
      const result = insertArchTag(content, 'test.arch');
      expect(result).toContain('@arch test.arch');
      expect(result).toContain('const x = 1;');
    });

    it('should preserve shebang at top', () => {
      const content = '#!/usr/bin/env node\nconst x = 1;';
      const result = insertArchTag(content, 'test.arch');
      expect(result.startsWith('#!/usr/bin/env node\n')).toBe(true);
      expect(result).toContain('@arch test.arch');
    });

    it('should preserve "use strict" at top', () => {
      const content = '"use strict";\nconst x = 1;';
      const result = insertArchTag(content, 'test.arch');
      expect(result.startsWith('"use strict";\n')).toBe(true);
      expect(result).toContain('@arch test.arch');
    });

    it('should preserve "use client" at top', () => {
      const content = "'use client';\nconst x = 1;";
      const result = insertArchTag(content, 'test.arch');
      expect(result.startsWith("'use client';\n")).toBe(true);
      expect(result).toContain('@arch test.arch');
    });

    it('should add tag to existing JSDoc comment', () => {
      const content = '/**\n * Existing comment\n */\nconst x = 1;';
      const result = insertArchTag(content, 'test.arch');
      expect(result).toContain('Existing comment');
      expect(result).toContain('@arch test.arch');
      // Should only have one JSDoc block
      expect(result.match(/\/\*\*/g)?.length).toBe(1);
    });
  });

  describe('replaceArchTag', () => {
    it('should replace existing arch tag', () => {
      const content = '/**\n * @arch old.arch\n */\nconst x = 1;';
      const result = replaceArchTag(content, 'new.arch');
      expect(result).toContain('@arch new.arch');
      expect(result).not.toContain('old.arch');
    });

    it('should handle arch tag with different formatting', () => {
      const content = '// @arch    old.arch\nconst x = 1;';
      const result = replaceArchTag(content, 'new.arch');
      // The function preserves whitespace after @arch
      expect(result).toContain('new.arch');
      expect(result).not.toContain('old.arch');
    });
  });

  describe('detectLanguageFromExtension', () => {
    it('should detect TypeScript from .ts extension', () => {
      expect(detectLanguageFromExtension('file.ts')).toBe('typescript');
      expect(detectLanguageFromExtension('path/to/file.ts')).toBe('typescript');
    });

    it('should detect TypeScript from .tsx extension', () => {
      expect(detectLanguageFromExtension('Component.tsx')).toBe('typescript');
    });

    it('should detect TypeScript from .mts and .cts extensions', () => {
      expect(detectLanguageFromExtension('module.mts')).toBe('typescript');
      expect(detectLanguageFromExtension('module.cts')).toBe('typescript');
    });

    it('should detect JavaScript from .js extension', () => {
      expect(detectLanguageFromExtension('file.js')).toBe('javascript');
    });

    it('should detect JavaScript from .jsx, .mjs, .cjs extensions', () => {
      expect(detectLanguageFromExtension('Component.jsx')).toBe('javascript');
      expect(detectLanguageFromExtension('module.mjs')).toBe('javascript');
      expect(detectLanguageFromExtension('module.cjs')).toBe('javascript');
    });

    it('should detect Python from .py extension', () => {
      expect(detectLanguageFromExtension('file.py')).toBe('python');
      expect(detectLanguageFromExtension('path/to/module.py')).toBe('python');
    });

    it('should detect Go from .go extension', () => {
      expect(detectLanguageFromExtension('file.go')).toBe('go');
      expect(detectLanguageFromExtension('path/to/main.go')).toBe('go');
    });

    it('should be case-insensitive', () => {
      expect(detectLanguageFromExtension('file.PY')).toBe('python');
      expect(detectLanguageFromExtension('file.GO')).toBe('go');
      expect(detectLanguageFromExtension('file.TS')).toBe('typescript');
    });

    it('should default to typescript for unknown extensions', () => {
      expect(detectLanguageFromExtension('file.unknown')).toBe('typescript');
      expect(detectLanguageFromExtension('file')).toBe('typescript');
    });
  });

  describe('insertArchTag - Python', () => {
    it('should insert Python comment tag at start of file', () => {
      const result = insertArchTag('', 'test.arch', 'file.py');
      expect(result).toBe('# @arch test.arch\n');
    });

    it('should insert tag at start of Python file with content', () => {
      const content = 'def hello():\n    pass';
      const result = insertArchTag(content, 'test.arch', 'file.py');
      expect(result).toBe('# @arch test.arch\ndef hello():\n    pass');
    });

    it('should preserve Python shebang at top', () => {
      const content = '#!/usr/bin/env python3\ndef hello():\n    pass';
      const result = insertArchTag(content, 'test.arch', 'script.py');
      expect(result.startsWith('#!/usr/bin/env python3\n')).toBe(true);
      expect(result).toContain('# @arch test.arch');
      // Tag should come after shebang
      expect(result.indexOf('#!/usr/bin/env python3')).toBeLessThan(result.indexOf('@arch'));
    });

    it('should preserve Python encoding declaration', () => {
      const content = '# -*- coding: utf-8 -*-\ndef hello():\n    pass';
      const result = insertArchTag(content, 'test.arch', 'file.py');
      expect(result).toContain('# -*- coding: utf-8 -*-');
      expect(result).toContain('# @arch test.arch');
      // Tag should come after encoding
      expect(result.indexOf('coding:')).toBeLessThan(result.indexOf('@arch'));
    });

    it('should handle shebang + encoding declaration', () => {
      const content = '#!/usr/bin/env python3\n# -*- coding: utf-8 -*-\ndef hello():\n    pass';
      const result = insertArchTag(content, 'test.arch', 'script.py');
      expect(result.startsWith('#!/usr/bin/env python3\n')).toBe(true);
      expect(result).toContain('# -*- coding: utf-8 -*-');
      expect(result).toContain('# @arch test.arch');
      // Order: shebang, encoding, @arch
      const shebangIdx = result.indexOf('#!/usr/bin/env python3');
      const encodingIdx = result.indexOf('coding:');
      const archIdx = result.indexOf('@arch');
      expect(shebangIdx).toBeLessThan(encodingIdx);
      expect(encodingIdx).toBeLessThan(archIdx);
    });

    it('should replace existing Python @arch tag', () => {
      const content = '# @arch old.arch\ndef hello():\n    pass';
      const result = insertArchTag(content, 'new.arch', 'file.py');
      expect(result).toContain('# @arch new.arch');
      expect(result).not.toContain('old.arch');
    });
  });

  describe('insertArchTag - Go', () => {
    it('should insert Go comment tag at start of file', () => {
      const result = insertArchTag('', 'test.arch', 'file.go');
      expect(result).toBe('// @arch test.arch\n');
    });

    it('should insert tag at start of Go file with content', () => {
      const content = 'package main\n\nfunc main() {}';
      const result = insertArchTag(content, 'test.arch', 'main.go');
      expect(result).toBe('// @arch test.arch\npackage main\n\nfunc main() {}');
    });

    it('should preserve Go build tags', () => {
      const content = '//go:build linux\n// +build linux\n\npackage main';
      const result = insertArchTag(content, 'test.arch', 'linux.go');
      expect(result).toContain('//go:build linux');
      expect(result).toContain('// +build linux');
      expect(result).toContain('// @arch test.arch');
      // Tag should come after build tags
      const buildIdx = result.indexOf('//go:build');
      const archIdx = result.indexOf('@arch');
      expect(buildIdx).toBeLessThan(archIdx);
    });

    it('should replace existing Go @arch tag', () => {
      const content = '// @arch old.arch\npackage main';
      const result = insertArchTag(content, 'new.arch', 'file.go');
      expect(result).toContain('// @arch new.arch');
      expect(result).not.toContain('old.arch');
    });
  });

  describe('hasArchTag', () => {
    it('should detect TypeScript @arch tag', () => {
      expect(hasArchTag('/** @arch test.arch */')).toBe(true);
      expect(hasArchTag('/**\n * @arch test.arch\n */')).toBe(true);
    });

    it('should detect Python @arch tag', () => {
      expect(hasArchTag('# @arch test.arch')).toBe(true);
    });

    it('should detect Go @arch tag', () => {
      expect(hasArchTag('// @arch test.arch')).toBe(true);
    });

    it('should return false when no @arch tag', () => {
      expect(hasArchTag('const x = 1;')).toBe(false);
      expect(hasArchTag('# just a comment')).toBe(false);
    });
  });

  describe('extractArchId', () => {
    it('should extract arch ID from TypeScript', () => {
      expect(extractArchId('/** @arch test.arch */')).toBe('test.arch');
      expect(extractArchId('/**\n * @arch my.archId\n */')).toBe('my.archId');
    });

    it('should extract arch ID from Python', () => {
      expect(extractArchId('# @arch python.module')).toBe('python.module');
    });

    it('should extract arch ID from Go', () => {
      expect(extractArchId('// @arch go.package')).toBe('go.package');
    });

    it('should return null when no @arch tag', () => {
      expect(extractArchId('const x = 1;')).toBeNull();
    });
  });
});
