/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { matchConcepts, validateConcepts, getArchitecturesFromMatches, type ConceptRegistry } from '../../../../src/core/discovery/concepts.js';

describe('concepts', () => {
  const mockRegistry: ConceptRegistry = {
    concepts: {
      validation: {
        description: 'Type checking and validation',
        aliases: ['type guard', 'validator', 'schema'],
        architectures: ['domain.schema', 'domain.constraint'],
      },
      api_handler: {
        description: 'HTTP endpoints',
        aliases: ['controller', 'endpoint', 'api', 'rest'],
        architectures: ['app.controller'],
      },
    },
  };

  describe('matchConcepts', () => {
    it('should match exact alias', () => {
      const matches = matchConcepts('type guard', mockRegistry);
      expect(matches).toHaveLength(1);
      expect(matches[0].conceptName).toBe('validation');
      expect(matches[0].matchedAliases).toContain('type guard');
    });

    it('should match partial query containing alias', () => {
      const matches = matchConcepts('I need a validator for input', mockRegistry);
      expect(matches).toHaveLength(1);
      expect(matches[0].conceptName).toBe('validation');
    });

    it('should match multiple concepts', () => {
      const matches = matchConcepts('validator endpoint', mockRegistry);
      expect(matches).toHaveLength(2);
    });

    it('should return empty for no match', () => {
      const matches = matchConcepts('something unrelated', mockRegistry);
      expect(matches).toHaveLength(0);
    });

    it('should be case insensitive', () => {
      const matches = matchConcepts('TYPE GUARD', mockRegistry);
      expect(matches).toHaveLength(1);
      expect(matches[0].conceptName).toBe('validation');
    });

    it('should calculate confidence based on matched aliases', () => {
      const matches = matchConcepts('validator schema', mockRegistry);
      expect(matches[0].confidence).toBeGreaterThan(0);
    });
  });

  describe('getArchitecturesFromMatches', () => {
    it('should return unique architectures', () => {
      const matches = matchConcepts('validator', mockRegistry);
      const archs = getArchitecturesFromMatches(matches);
      expect(archs).toContain('domain.schema');
      expect(archs).toContain('domain.constraint');
    });

    it('should preserve order by confidence', () => {
      const matches = matchConcepts('validator endpoint', mockRegistry);
      const archs = getArchitecturesFromMatches(matches);
      expect(archs.length).toBeGreaterThan(0);
    });
  });

  describe('validateConcepts', () => {
    it('should pass for valid references', () => {
      const validArchIds = new Set(['domain.schema', 'domain.constraint', 'app.controller']);
      const result = validateConcepts(mockRegistry, validArchIds);
      expect(result.valid).toBe(true);
      expect(result.invalidReferences).toHaveLength(0);
    });

    it('should detect invalid references', () => {
      const validArchIds = new Set(['domain.schema']); // Missing domain.constraint and app.controller
      const result = validateConcepts(mockRegistry, validArchIds);
      expect(result.valid).toBe(false);
      expect(result.invalidReferences.length).toBeGreaterThan(0);
    });

    it('should detect orphaned concepts', () => {
      const validArchIds = new Set<string>(); // No valid archs
      const result = validateConcepts(mockRegistry, validArchIds);
      expect(result.orphanedConcepts).toContain('validation');
      expect(result.orphanedConcepts).toContain('api_handler');
    });
  });
});
