/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for block-level code similarity analyzer.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { findSimilarBlocks } from '../../../../src/core/similarity/block-analyzer.js';

describe('block-analyzer', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'block-analyzer-test-'));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeFixture(name: string, content: string): Promise<string> {
    const filePath = path.join(tmpDir, name);
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  describe('findSimilarBlocks', () => {
    it('should detect identical functions across files', async () => {
      const file1 = await writeFixture('a.ts', `
        export function processData(items: string[]) {
          const result: string[] = [];
          for (const item of items) {
            const cleaned = item.trim().toLowerCase();
            if (cleaned.length > 0) {
              result.push(cleaned);
            }
          }
          return result;
        }
      `);

      const file2 = await writeFixture('b.ts', `
        export function processData(items: string[]) {
          const result: string[] = [];
          for (const item of items) {
            const cleaned = item.trim().toLowerCase();
            if (cleaned.length > 0) {
              result.push(cleaned);
            }
          }
          return result;
        }
      `);

      const matches = await findSimilarBlocks(tmpDir, [file1, file2], {
        threshold: 0.8,
        minLines: 3,
      });

      expect(matches.length).toBe(1);
      expect(matches[0].similarity).toBeCloseTo(1, 1);
      expect(matches[0].block1.name).toBe('processData');
      expect(matches[0].block2.name).toBe('processData');
    });

    it('should detect similar functions with minor differences', async () => {
      const file1 = await writeFixture('sim1.ts', `
        export function validateInput(data: Record<string, unknown>) {
          const errors: string[] = [];
          if (!data.name) {
            errors.push('Name is required');
          }
          if (!data.email) {
            errors.push('Email is required');
          }
          if (errors.length > 0) {
            throw new Error(errors.join(', '));
          }
          return data;
        }
      `);

      const file2 = await writeFixture('sim2.ts', `
        export function validatePayload(payload: Record<string, unknown>) {
          const issues: string[] = [];
          if (!payload.name) {
            issues.push('Name is required');
          }
          if (!payload.email) {
            issues.push('Email is required');
          }
          if (issues.length > 0) {
            throw new Error(issues.join(', '));
          }
          return payload;
        }
      `);

      const matches = await findSimilarBlocks(tmpDir, [file1, file2], {
        threshold: 0.7,
        minLines: 3,
      });

      expect(matches.length).toBe(1);
      expect(matches[0].similarity).toBeGreaterThan(0.7);
    });

    it('should not match dissimilar functions', async () => {
      const file1 = await writeFixture('diff1.ts', `
        export function calculateSum(numbers: number[]) {
          let total = 0;
          for (const num of numbers) {
            total += num;
          }
          return total;
        }
      `);

      const file2 = await writeFixture('diff2.ts', `
        export function formatDate(date: Date) {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return \`\${year}-\${month}-\${day}\`;
        }
      `);

      const matches = await findSimilarBlocks(tmpDir, [file1, file2], {
        threshold: 0.8,
        minLines: 3,
      });

      expect(matches.length).toBe(0);
    });

    it('should extract class methods', async () => {
      const file1 = await writeFixture('class1.ts', `
        export class ServiceA {
          process(items: string[]) {
            const filtered = items.filter(i => i.length > 0);
            const mapped = filtered.map(i => i.toUpperCase());
            const sorted = mapped.sort();
            return sorted;
          }
        }
      `);

      const file2 = await writeFixture('class2.ts', `
        export class ServiceB {
          process(items: string[]) {
            const filtered = items.filter(i => i.length > 0);
            const mapped = filtered.map(i => i.toUpperCase());
            const sorted = mapped.sort();
            return sorted;
          }
        }
      `);

      const matches = await findSimilarBlocks(tmpDir, [file1, file2], {
        threshold: 0.8,
        minLines: 3,
      });

      expect(matches.length).toBe(1);
      expect(matches[0].block1.name).toBe('ServiceA.process');
      expect(matches[0].block2.name).toBe('ServiceB.process');
    });

    it('should extract arrow functions', async () => {
      const file1 = await writeFixture('arrow1.ts', `
        export const transform = (items: string[]) => {
          const result: string[] = [];
          for (const item of items) {
            result.push(item.trim());
            result.push(item.toLowerCase());
          }
          return result;
        };
      `);

      const file2 = await writeFixture('arrow2.ts', `
        export const convert = (items: string[]) => {
          const result: string[] = [];
          for (const item of items) {
            result.push(item.trim());
            result.push(item.toLowerCase());
          }
          return result;
        };
      `);

      const matches = await findSimilarBlocks(tmpDir, [file1, file2], {
        threshold: 0.8,
        minLines: 3,
      });

      expect(matches.length).toBe(1);
      expect(matches[0].block1.name).toBe('transform');
      expect(matches[0].block2.name).toBe('convert');
    });

    it('should respect minLines option', async () => {
      const file1 = await writeFixture('short1.ts', `
        export function add(a: number, b: number) {
          return a + b;
        }

        export function multiply(a: number, b: number) {
          return a * b;
        }
      `);

      const file2 = await writeFixture('short2.ts', `
        export function add(a: number, b: number) {
          return a + b;
        }

        export function multiply(a: number, b: number) {
          return a * b;
        }
      `);

      // With minLines=5, these 3-line functions should be skipped
      const matches = await findSimilarBlocks(tmpDir, [file1, file2], {
        threshold: 0.8,
        minLines: 5,
      });

      expect(matches.length).toBe(0);
    });

    it('should handle empty files', async () => {
      const file1 = await writeFixture('empty1.ts', '');
      const file2 = await writeFixture('empty2.ts', '// just a comment');

      const matches = await findSimilarBlocks(tmpDir, [file1, file2], {
        threshold: 0.8,
        minLines: 3,
      });

      expect(matches.length).toBe(0);
    });

    it('should handle single-function files', async () => {
      const file1 = await writeFixture('single.ts', `
        export function onlyOne(x: number) {
          const doubled = x * 2;
          const tripled = x * 3;
          const summed = doubled + tripled;
          return summed;
        }
      `);

      const matches = await findSimilarBlocks(tmpDir, [file1], {
        threshold: 0.8,
        minLines: 3,
      });

      // Single file with one function can't have matches
      expect(matches.length).toBe(0);
    });

    it('should respect maxBlocks option', async () => {
      // Create many functions
      const funcs = Array.from({ length: 20 }, (_, i) => `
        export function fn${i}(x: number) {
          const a = x + ${i};
          const b = a * 2;
          const c = b + 1;
          return c;
        }
      `).join('\n');

      const file1 = await writeFixture('many1.ts', funcs);
      const file2 = await writeFixture('many2.ts', funcs);

      const matches = await findSimilarBlocks(tmpDir, [file1, file2], {
        threshold: 0.8,
        minLines: 3,
        maxBlocks: 5,
      });

      // Should still work but with limited blocks analyzed
      expect(matches.length).toBeLessThanOrEqual(200);
    });

    it('should respect maxMatches option', async () => {
      // Create identical functions to generate many matches
      const funcs = Array.from({ length: 10 }, (_, i) => `
        export function process${i}(items: string[]) {
          const result: string[] = [];
          for (const item of items) {
            result.push(item.trim());
          }
          return result;
        }
      `).join('\n');

      const file1 = await writeFixture('max1.ts', funcs);
      const file2 = await writeFixture('max2.ts', funcs);

      const matches = await findSimilarBlocks(tmpDir, [file1, file2], {
        threshold: 0.7,
        minLines: 3,
        maxMatches: 3,
      });

      expect(matches.length).toBeLessThanOrEqual(3);
    });

    it('should include correct file and line info', async () => {
      const file1 = await writeFixture('info1.ts', `
        // some header comment

        export function targetFunction(x: number) {
          const step1 = x + 1;
          const step2 = step1 * 2;
          const step3 = step2 - 1;
          return step3;
        }
      `);

      const file2 = await writeFixture('info2.ts', `
        export function targetFunction(x: number) {
          const step1 = x + 1;
          const step2 = step1 * 2;
          const step3 = step2 - 1;
          return step3;
        }
      `);

      const matches = await findSimilarBlocks(tmpDir, [file1, file2], {
        threshold: 0.8,
        minLines: 3,
      });

      expect(matches.length).toBe(1);
      expect(matches[0].block1.file).toBe('info1.ts');
      expect(matches[0].block2.file).toBe('info2.ts');
      expect(matches[0].block1.line).toBeGreaterThan(0);
      expect(matches[0].block2.line).toBeGreaterThan(0);
      expect(matches[0].block1.lines).toBeGreaterThanOrEqual(5);
    });

    it('should skip private methods (starting with underscore)', async () => {
      const file1 = await writeFixture('priv1.ts', `
        export class MyClass {
          _privateHelper(items: string[]) {
            const result: string[] = [];
            for (const item of items) {
              result.push(item.trim());
            }
            return result;
          }
        }
      `);

      const file2 = await writeFixture('priv2.ts', `
        export class OtherClass {
          _privateHelper(items: string[]) {
            const result: string[] = [];
            for (const item of items) {
              result.push(item.trim());
            }
            return result;
          }
        }
      `);

      const matches = await findSimilarBlocks(tmpDir, [file1, file2], {
        threshold: 0.8,
        minLines: 3,
      });

      // Private methods (starting with _) should be skipped
      expect(matches.length).toBe(0);
    });

    it('should sort matches by similarity descending', async () => {
      const file1 = await writeFixture('sort1.ts', `
        export function exactMatch(x: number) {
          const a = x + 1;
          const b = a * 2;
          const c = b + 3;
          return c;
        }

        export function partialMatch(items: string[]) {
          const result: string[] = [];
          for (const item of items) {
            result.push(item.toUpperCase());
          }
          return result;
        }
      `);

      const file2 = await writeFixture('sort2.ts', `
        export function exactMatch(x: number) {
          const a = x + 1;
          const b = a * 2;
          const c = b + 3;
          return c;
        }

        export function similarMatch(entries: string[]) {
          const output: string[] = [];
          for (const entry of entries) {
            output.push(entry.toUpperCase());
          }
          return output;
        }
      `);

      const matches = await findSimilarBlocks(tmpDir, [file1, file2], {
        threshold: 0.7,
        minLines: 3,
      });

      if (matches.length > 1) {
        for (let i = 1; i < matches.length; i++) {
          expect(matches[i - 1].similarity).toBeGreaterThanOrEqual(matches[i].similarity);
        }
      }
    });

    it('should handle files that cannot be parsed', async () => {
      const validFile = await writeFixture('valid.ts', `
        export function validFn(x: number) {
          const a = x + 1;
          const b = a * 2;
          const c = b + 3;
          return c;
        }
      `);

      const invalidFile = await writeFixture('invalid.ts', `
        this is not {{ valid typescript
        }}}} syntax at all !!!
      `);

      // Should not throw, just skip the invalid file
      const matches = await findSimilarBlocks(tmpDir, [validFile, invalidFile], {
        threshold: 0.8,
        minLines: 3,
      });

      expect(matches).toEqual([]);
    });
  });
});
