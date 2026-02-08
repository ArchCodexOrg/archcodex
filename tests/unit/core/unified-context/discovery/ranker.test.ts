/**
 * @arch archcodex.test.unit
 *
 * Tests for multi-signal ranking system (RRF).
 */
import { describe, it, expect } from 'vitest';
import {
  calculateRRF,
  combineSignals,
  rankModules,
  mergeRankedLists,
  normalizeScores,
  needsClarification,
  applyBoosts,
} from '../../../../../src/core/unified-context/discovery/ranker.js';
import type { RankingSignal, RankedModule } from '../../../../../src/core/unified-context/discovery/types.js';

describe('ranker', () => {
  describe('calculateRRF', () => {
    it('returns sum of reciprocal rank scores', () => {
      const result = calculateRRF([1, 2, 3]);
      // 1/(60+1) + 1/(60+2) + 1/(60+3)
      const expected = 1 / 61 + 1 / 62 + 1 / 63;
      expect(result).toBeCloseTo(expected);
    });

    it('returns 0 for empty ranks', () => {
      expect(calculateRRF([])).toBe(0);
    });

    it('uses custom k parameter', () => {
      const result = calculateRRF([1], 10);
      expect(result).toBeCloseTo(1 / 11);
    });

    it('higher rank positions produce lower scores', () => {
      const highRank = calculateRRF([1]);
      const lowRank = calculateRRF([100]);
      expect(highRank).toBeGreaterThan(lowRank);
    });
  });

  describe('combineSignals', () => {
    it('computes weighted average scaled to 100', () => {
      const signals: RankingSignal[] = [
        { type: 'path', score: 1.0, reason: 'test' },
        { type: 'entity', score: 0.5, reason: 'test' },
      ];
      const weights = { path: 0.5, entity: 0.5, architecture: 0, import: 0, recency: 0, feedback: 0 };
      const result = combineSignals(signals, weights);
      // (1.0*0.5 + 0.5*0.5) / (0.5+0.5) * 100 = 75
      expect(result).toBeCloseTo(75);
    });

    it('returns 0 when all weights are zero', () => {
      const signals: RankingSignal[] = [
        { type: 'path', score: 1.0, reason: 'test' },
      ];
      const weights = { path: 0, entity: 0, architecture: 0, import: 0, recency: 0, feedback: 0 };
      expect(combineSignals(signals, weights)).toBe(0);
    });

    it('ignores signals with zero weight', () => {
      const signals: RankingSignal[] = [
        { type: 'path', score: 1.0, reason: 'test' },
        { type: 'feedback', score: 0.1, reason: 'noise' },
      ];
      const weights = { path: 1, entity: 0, architecture: 0, import: 0, recency: 0, feedback: 0 };
      const result = combineSignals(signals, weights);
      expect(result).toBeCloseTo(100);
    });
  });

  describe('rankModules', () => {
    it('sorts modules by confidence descending', () => {
      const moduleSignals = new Map<string, RankingSignal[]>();
      moduleSignals.set('src/low/', [{ type: 'path', score: 0.3, reason: 'low' }]);
      moduleSignals.set('src/high/', [{ type: 'path', score: 0.9, reason: 'high' }]);

      const result = rankModules(moduleSignals);
      expect(result[0].path).toBe('src/high/');
      expect(result[1].path).toBe('src/low/');
    });

    it('sets primaryReason from highest-scoring signal', () => {
      const moduleSignals = new Map<string, RankingSignal[]>();
      moduleSignals.set('src/mod/', [
        { type: 'path', score: 0.3, reason: 'low match' },
        { type: 'entity', score: 0.9, reason: 'entity match' },
      ]);

      const result = rankModules(moduleSignals);
      expect(result[0].primaryReason).toBe('entity match');
    });

    it('rounds confidence to 1 decimal', () => {
      const moduleSignals = new Map<string, RankingSignal[]>();
      moduleSignals.set('src/mod/', [{ type: 'path', score: 0.333, reason: 'test' }]);

      const result = rankModules(moduleSignals);
      const decimalStr = result[0].confidence.toString();
      const decimals = decimalStr.includes('.') ? decimalStr.split('.')[1].length : 0;
      expect(decimals).toBeLessThanOrEqual(1);
    });

    it('extracts fileCount and architecture from metadata', () => {
      const moduleSignals = new Map<string, RankingSignal[]>();
      moduleSignals.set('src/mod/', [{
        type: 'path',
        score: 0.5,
        reason: 'test',
        metadata: { fileCount: 7, architecture: 'core.engine' },
      }]);

      const result = rankModules(moduleSignals);
      expect(result[0].fileCount).toBe(7);
      expect(result[0].architecture).toBe('core.engine');
    });
  });

  describe('mergeRankedLists', () => {
    it('merges multiple lists using RRF', () => {
      const list1 = new Map([['a', 10], ['b', 5]]);
      const list2 = new Map([['b', 10], ['a', 5]]);

      const merged = mergeRankedLists([list1, list2]);
      // Both items appear in both lists at equal combined ranks
      expect(merged.has('a')).toBe(true);
      expect(merged.has('b')).toBe(true);
    });

    it('gives higher scores to items ranked high in multiple lists', () => {
      const list1 = new Map([['top', 10], ['low', 1]]);
      const list2 = new Map([['top', 10], ['low', 1]]);

      const merged = mergeRankedLists([list1, list2]);
      expect(merged.get('top')!).toBeGreaterThan(merged.get('low')!);
    });

    it('handles disjoint lists', () => {
      const list1 = new Map([['a', 10]]);
      const list2 = new Map([['b', 10]]);

      const merged = mergeRankedLists([list1, list2]);
      expect(merged.has('a')).toBe(true);
      expect(merged.has('b')).toBe(true);
    });
  });

  describe('normalizeScores', () => {
    it('normalizes to 0-1 range', () => {
      const scores = new Map([['a', 10], ['b', 20], ['c', 30]]);
      const normalized = normalizeScores(scores);

      expect(normalized.get('a')).toBeCloseTo(0);
      expect(normalized.get('c')).toBeCloseTo(1);
    });

    it('handles single value', () => {
      const scores = new Map([['a', 5]]);
      const normalized = normalizeScores(scores);
      expect(normalized.get('a')).toBe(0);
    });

    it('handles equal values', () => {
      const scores = new Map([['a', 5], ['b', 5]]);
      const normalized = normalizeScores(scores);
      expect(normalized.get('a')).toBe(0);
      expect(normalized.get('b')).toBe(0);
    });
  });

  describe('needsClarification', () => {
    const makeModule = (confidence: number): RankedModule => ({
      path: 'src/mod/',
      confidence,
      signals: [],
      primaryReason: 'test',
      fileCount: 1,
    });

    it('returns false for single module', () => {
      expect(needsClarification([makeModule(80)])).toBe(false);
    });

    it('returns true when top results are close', () => {
      const modules = [makeModule(80), makeModule(75), makeModule(72)];
      expect(needsClarification(modules, 3, 10)).toBe(true);
    });

    it('returns false when top result is clearly dominant', () => {
      const modules = [makeModule(90), makeModule(50), makeModule(30)];
      expect(needsClarification(modules, 3, 10)).toBe(false);
    });

    it('respects custom topN', () => {
      const modules = [makeModule(90), makeModule(85), makeModule(30)];
      // top 2 are within 10
      expect(needsClarification(modules, 2, 10)).toBe(true);
    });
  });

  describe('applyBoosts', () => {
    const makeModule = (path: string, confidence: number, reason = 'test'): RankedModule => ({
      path,
      confidence,
      signals: [{ type: 'path' as const, score: 0.5, reason }],
      primaryReason: reason,
      fileCount: 1,
    });

    it('boosts modules matching boost paths', () => {
      const modules = [makeModule('src/components/', 50), makeModule('src/api/', 50)];
      const result = applyBoosts(modules, [], ['components']);
      const boosted = result.find(m => m.path === 'src/components/');
      expect(boosted!.confidence).toBeGreaterThan(50);
    });

    it('boosts modules with matching signal keywords', () => {
      const modules = [makeModule('src/mod/', 50, 'entity match')];
      const result = applyBoosts(modules, ['entity'], []);
      expect(result[0].confidence).toBeGreaterThan(50);
    });

    it('caps confidence at 100', () => {
      const modules = [makeModule('src/components/', 95)];
      const result = applyBoosts(modules, [], ['components']);
      expect(result[0].confidence).toBeLessThanOrEqual(100);
    });

    it('re-sorts after boosting', () => {
      const modules = [makeModule('src/first/', 80), makeModule('src/second/', 60)];
      const result = applyBoosts(modules, [], ['second']);
      expect(result[0].path).toBe('src/first/');
    });

    it('path boost is case-insensitive', () => {
      const modules = [makeModule('src/Components/', 50)];
      const result = applyBoosts(modules, [], ['components']);
      expect(result[0].confidence).toBeGreaterThan(50);
    });
  });
});
