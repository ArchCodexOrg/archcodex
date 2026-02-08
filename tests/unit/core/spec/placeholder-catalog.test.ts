/** @arch archcodex.test.unit */
import { describe, it, expect } from 'vitest';
import {
  KNOWN_PLACEHOLDERS,
  findSimilarPlaceholders,
  listPlaceholders,
} from '../../../../src/core/spec/placeholder-catalog.js';

describe('placeholder-catalog', () => {
  describe('KNOWN_PLACEHOLDERS', () => {
    it('contains expected fixture placeholders', () => {
      expect(KNOWN_PLACEHOLDERS).toContain('authenticated');
      expect(KNOWN_PLACEHOLDERS).toContain('no_access');
      expect(KNOWN_PLACEHOLDERS).toContain('admin_user');
    });

    it('contains expected generator placeholders', () => {
      expect(KNOWN_PLACEHOLDERS).toContain('string');
      expect(KNOWN_PLACEHOLDERS).toContain('url');
      expect(KNOWN_PLACEHOLDERS).toContain('number');
      expect(KNOWN_PLACEHOLDERS).toContain('array');
      expect(KNOWN_PLACEHOLDERS).toContain('uuid');
      expect(KNOWN_PLACEHOLDERS).toContain('now');
    });

    it('contains expected assertion placeholders', () => {
      expect(KNOWN_PLACEHOLDERS).toContain('created');
      expect(KNOWN_PLACEHOLDERS).toContain('exists');
      expect(KNOWN_PLACEHOLDERS).toContain('defined');
      expect(KNOWN_PLACEHOLDERS).toContain('undefined');
      expect(KNOWN_PLACEHOLDERS).toContain('empty');
      expect(KNOWN_PLACEHOLDERS).toContain('contains');
      expect(KNOWN_PLACEHOLDERS).toContain('lt');
      expect(KNOWN_PLACEHOLDERS).toContain('gt');
    });

    it('contains expected composite placeholders', () => {
      expect(KNOWN_PLACEHOLDERS).toContain('all');
      expect(KNOWN_PLACEHOLDERS).toContain('and');
      expect(KNOWN_PLACEHOLDERS).toContain('any');
      expect(KNOWN_PLACEHOLDERS).toContain('or');
      expect(KNOWN_PLACEHOLDERS).toContain('not');
    });
  });

  describe('findSimilarPlaceholders', () => {
    it('finds exact match with high score', () => {
      const suggestions = findSimilarPlaceholders('contains');
      expect(suggestions).toContain('@contains');
      expect(suggestions[0]).toBe('@contains');
    });

    it('finds typo variant for contain -> contains', () => {
      const suggestions = findSimilarPlaceholders('contain');
      expect(suggestions).toContain('@contains');
    });

    it('finds typo variant for match -> matches', () => {
      const suggestions = findSimilarPlaceholders('match');
      expect(suggestions).toContain('@matches');
    });

    it('finds prefix matches', () => {
      const suggestions = findSimilarPlaceholders('def');
      expect(suggestions).toContain('@defined');
    });

    it('returns max 3 suggestions', () => {
      const suggestions = findSimilarPlaceholders('a');
      expect(suggestions.length).toBeLessThanOrEqual(3);
    });

    it('returns empty array for empty input', () => {
      const suggestions = findSimilarPlaceholders('');
      expect(suggestions).toEqual([]);
    });

    it('handles unrecognizable input with low scores', () => {
      const suggestions = findSimilarPlaceholders('xyzqwerty');
      // May return low-score matches due to character overlap, but max 3
      expect(suggestions.length).toBeLessThanOrEqual(3);
    });

    it('strips @ prefix from input', () => {
      const suggestions1 = findSimilarPlaceholders('contains');
      const suggestions2 = findSimilarPlaceholders('@contains');
      expect(suggestions1).toEqual(suggestions2);
    });

    it('strips parameters from input', () => {
      const suggestions = findSimilarPlaceholders('@contains(hello)');
      expect(suggestions).toContain('@contains');
    });

    it('finds suggestions for exist variants', () => {
      const suggestions = findSimilarPlaceholders('exist');
      expect(suggestions.some(s => s === '@exists' || s === '@undefined')).toBe(true);
    });

    it('finds suggestions for undef -> undefined', () => {
      const suggestions = findSimilarPlaceholders('undef');
      expect(suggestions).toContain('@undefined');
    });

    it('finds suggestions for has variants', () => {
      const suggestions = findSimilarPlaceholders('has');
      const hasRelated = suggestions.some(s => s === '@hasItem' || s === '@hasProperties');
      expect(hasRelated).toBe(true);
    });
  });

  describe('listPlaceholders', () => {
    it('returns array of placeholder objects', () => {
      const placeholders = listPlaceholders();
      expect(Array.isArray(placeholders)).toBe(true);
      expect(placeholders.length).toBeGreaterThan(0);
    });

    it('each placeholder has required fields', () => {
      const placeholders = listPlaceholders();
      placeholders.forEach(p => {
        expect(p).toHaveProperty('placeholder');
        expect(p).toHaveProperty('description');
        expect(p).toHaveProperty('example');
        expect(typeof p.placeholder).toBe('string');
        expect(typeof p.description).toBe('string');
        expect(typeof p.example).toBe('string');
      });
    });

    it('includes fixture placeholders', () => {
      const placeholders = listPlaceholders();
      const hasAuthenticated = placeholders.some(p => p.placeholder === '@authenticated');
      const hasNoAccess = placeholders.some(p => p.placeholder === '@no_access');
      const hasAdminUser = placeholders.some(p => p.placeholder === '@admin_user');

      expect(hasAuthenticated).toBe(true);
      expect(hasNoAccess).toBe(true);
      expect(hasAdminUser).toBe(true);
    });

    it('includes generator placeholders', () => {
      const placeholders = listPlaceholders();
      const generators = placeholders.filter(p =>
        p.placeholder.includes('@string') ||
        p.placeholder.includes('@url') ||
        p.placeholder.includes('@number') ||
        p.placeholder.includes('@uuid')
      );
      expect(generators.length).toBeGreaterThan(0);
    });

    it('includes assertion placeholders', () => {
      const placeholders = listPlaceholders();
      const assertions = placeholders.filter(p =>
        p.placeholder === '@created' ||
        p.placeholder === '@exists' ||
        p.placeholder === '@defined' ||
        p.placeholder === '@contains(\'x\')'
      );
      expect(assertions.length).toBeGreaterThan(0);
    });

    it('includes composite assertions', () => {
      const placeholders = listPlaceholders();
      const hasAll = placeholders.some(p => p.placeholder.includes('@all'));
      const hasAny = placeholders.some(p => p.placeholder.includes('@any'));
      const hasNot = placeholders.some(p => p.placeholder.includes('@not'));

      expect(hasAll).toBe(true);
      expect(hasAny).toBe(true);
      expect(hasNot).toBe(true);
    });

    it('includes object/array assertions', () => {
      const placeholders = listPlaceholders();
      const hasItem = placeholders.some(p => p.placeholder.includes('@hasItem'));
      const hasProperties = placeholders.some(p => p.placeholder.includes('@hasProperties'));
      const oneOf = placeholders.some(p => p.placeholder.includes('@oneOf'));

      expect(hasItem).toBe(true);
      expect(hasProperties).toBe(true);
      expect(oneOf).toBe(true);
    });

    it('includes comparison placeholders', () => {
      const placeholders = listPlaceholders();
      const hasGt = placeholders.some(p => p.placeholder.includes('@gt'));
      const hasLt = placeholders.some(p => p.placeholder.includes('@lt'));
      const hasBetween = placeholders.some(p => p.placeholder.includes('@between'));

      expect(hasGt).toBe(true);
      expect(hasLt).toBe(true);
      expect(hasBetween).toBe(true);
    });
  });
});
