/**
 * @arch archcodex.test.unit
 *
 * Tests for generator barrel exports.
 */
import { describe, it, expect } from 'vitest';
import * as generators from '../../../../../src/core/spec/generators/index.js';

describe('Generator Exports', () => {
  it('exports unit test generator', () => {
    expect(generators.generateUnitTests).toBeDefined();
    expect(typeof generators.generateUnitTests).toBe('function');
  });

  it('exports property test generator', () => {
    expect(generators.generatePropertyTests).toBeDefined();
    expect(typeof generators.generatePropertyTests).toBe('function');
  });

  it('exports integration test generator', () => {
    expect(generators.generateIntegrationTests).toBeDefined();
    expect(typeof generators.generateIntegrationTests).toBe('function');
  });

  it('exports UI test generator', () => {
    expect(generators.generateUITests).toBeDefined();
    expect(typeof generators.generateUITests).toBe('function');
  });

  it('exports documentation generators', () => {
    expect(generators.generateApiDocs).toBeDefined();
    expect(generators.generateExampleDocs).toBeDefined();
    expect(generators.generateErrorDocs).toBeDefined();
    expect(generators.generateAllDocs).toBeDefined();
  });

  it('exports utility functions', () => {
    expect(generators.extractManualCode).toBeDefined();
    expect(generators.mergeWithExisting).toBeDefined();
    expect(generators.hasUISection).toBeDefined();
  });

  it('exports all expected types', () => {
    // Type exports are verified at compile time
    // This test just ensures the module loads correctly
    expect(Object.keys(generators).length).toBeGreaterThan(10);
  });
});
