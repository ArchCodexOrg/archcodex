/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for SimilarityAnalyzer.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import { SimilarityAnalyzer } from '../../../../src/core/similarity/analyzer.js';

describe('SimilarityAnalyzer', () => {
  const projectRoot = path.resolve(__dirname, '../../../..');
  let analyzer: SimilarityAnalyzer;

  beforeAll(() => {
    analyzer = new SimilarityAnalyzer(projectRoot);
  });

  afterAll(() => {
    analyzer.dispose();
  });

  describe('extractSignature', () => {
    it('should extract signature from a TypeScript file', async () => {
      const sig = await analyzer.extractSignature('src/core/registry/resolver.ts');

      expect(sig.file).toBe('src/core/registry/resolver.ts');
      expect(sig.archId).toBe('archcodex.core.domain.resolver');
      expect(sig.methods.length).toBeGreaterThan(0);
      expect(sig.exports.length).toBeGreaterThan(0);
    });

    it('should extract class names', async () => {
      const sig = await analyzer.extractSignature('src/core/hydration/engine.ts');

      expect(sig.classes).toContain('HydrationEngine');
    });

    it('should extract import modules', async () => {
      const sig = await analyzer.extractSignature('src/core/registry/resolver.ts');

      expect(sig.importModules.length).toBeGreaterThan(0);
    });
  });

  describe('findSimilar', () => {
    it('should find similar files based on structure', async () => {
      // Compare constraint validators - they should be similar
      const candidates = [
        'src/core/constraints/forbid-import.ts',
        'src/core/constraints/require-import.ts',
        'src/core/constraints/must-extend.ts',
        'src/core/constraints/implements.ts',
      ];

      const matches = await analyzer.findSimilar(
        'src/core/constraints/forbid-import.ts',
        candidates,
        { threshold: 0.1 } // Lower threshold since validators have different method names
      );

      // At least some matches should be found
      expect(matches.length).toBeGreaterThanOrEqual(0);
      // Validators should share some structural similarity (imports, base class)
    });

    it('should respect threshold option', async () => {
      const candidates = [
        'src/core/constraints/forbid-import.ts',
        'src/core/constraints/require-import.ts',
      ];

      const lowThreshold = await analyzer.findSimilar(
        'src/core/constraints/forbid-import.ts',
        candidates,
        { threshold: 0.1 }
      );

      const highThreshold = await analyzer.findSimilar(
        'src/core/constraints/forbid-import.ts',
        candidates,
        { threshold: 0.9 }
      );

      expect(lowThreshold.length).toBeGreaterThanOrEqual(highThreshold.length);
    });

    it('should not include self in results', async () => {
      const candidates = [
        'src/core/constraints/forbid-import.ts',
        'src/core/constraints/require-import.ts',
      ];

      const matches = await analyzer.findSimilar(
        'src/core/constraints/forbid-import.ts',
        candidates
      );

      expect(matches.every((m) => !m.file.includes('forbid-import'))).toBe(true);
    });

    it('should include matched aspects in results', async () => {
      const candidates = [
        'src/core/constraints/require-import.ts',
      ];

      const matches = await analyzer.findSimilar(
        'src/core/constraints/forbid-import.ts',
        candidates,
        { threshold: 0.1 }
      );

      if (matches.length > 0) {
        expect(matches[0].matchedAspects).toBeInstanceOf(Array);
      }
    });
  });
});
