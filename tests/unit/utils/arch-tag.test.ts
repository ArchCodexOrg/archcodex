/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for arch-tag utilities.
 */
import { describe, it, expect } from 'vitest';
import { insertArchTag, replaceArchTag } from '../../../src/utils/arch-tag.js';

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
});
