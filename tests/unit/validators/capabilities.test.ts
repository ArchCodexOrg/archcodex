/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for language capabilities.
 */
import { describe, it, expect } from 'vitest';
import {
  TYPESCRIPT_CAPABILITIES,
  JAVASCRIPT_CAPABILITIES,
  PYTHON_CAPABILITIES,
  GO_CAPABILITIES,
  JAVA_CAPABILITIES,
  getLanguageCapabilities,
  constraintAppliesTo,
} from '../../../src/validators/capabilities.js';

describe('Language Capabilities', () => {
  describe('TYPESCRIPT_CAPABILITIES', () => {
    it('should have class inheritance', () => {
      expect(TYPESCRIPT_CAPABILITIES.hasClassInheritance).toBe(true);
    });

    it('should have interfaces', () => {
      expect(TYPESCRIPT_CAPABILITIES.hasInterfaces).toBe(true);
    });

    it('should have decorators', () => {
      expect(TYPESCRIPT_CAPABILITIES.hasDecorators).toBe(true);
    });

    it('should have visibility modifiers', () => {
      expect(TYPESCRIPT_CAPABILITIES.hasVisibilityModifiers).toBe(true);
    });
  });

  describe('JAVASCRIPT_CAPABILITIES', () => {
    it('should have class inheritance', () => {
      expect(JAVASCRIPT_CAPABILITIES.hasClassInheritance).toBe(true);
    });

    it('should not have interfaces', () => {
      expect(JAVASCRIPT_CAPABILITIES.hasInterfaces).toBe(false);
    });

    it('should have decorators', () => {
      expect(JAVASCRIPT_CAPABILITIES.hasDecorators).toBe(true);
    });

    it('should have visibility modifiers', () => {
      expect(JAVASCRIPT_CAPABILITIES.hasVisibilityModifiers).toBe(true);
    });
  });

  describe('PYTHON_CAPABILITIES', () => {
    it('should have class inheritance', () => {
      expect(PYTHON_CAPABILITIES.hasClassInheritance).toBe(true);
    });

    it('should have interfaces (ABC, Protocol)', () => {
      expect(PYTHON_CAPABILITIES.hasInterfaces).toBe(true);
    });

    it('should have decorators', () => {
      expect(PYTHON_CAPABILITIES.hasDecorators).toBe(true);
    });

    it('should not have visibility modifiers (convention only)', () => {
      expect(PYTHON_CAPABILITIES.hasVisibilityModifiers).toBe(false);
    });
  });

  describe('GO_CAPABILITIES', () => {
    it('should have class inheritance (embedding mapped to extends)', () => {
      expect(GO_CAPABILITIES.hasClassInheritance).toBe(true);
    });

    it('should have interfaces', () => {
      expect(GO_CAPABILITIES.hasInterfaces).toBe(true);
    });

    it('should not have decorators', () => {
      expect(GO_CAPABILITIES.hasDecorators).toBe(false);
    });

    it('should have visibility modifiers (exported/unexported)', () => {
      expect(GO_CAPABILITIES.hasVisibilityModifiers).toBe(true);
    });
  });

  describe('JAVA_CAPABILITIES', () => {
    it('should have class inheritance', () => {
      expect(JAVA_CAPABILITIES.hasClassInheritance).toBe(true);
    });

    it('should have interfaces', () => {
      expect(JAVA_CAPABILITIES.hasInterfaces).toBe(true);
    });

    it('should have decorators (annotations)', () => {
      expect(JAVA_CAPABILITIES.hasDecorators).toBe(true);
    });

    it('should have visibility modifiers', () => {
      expect(JAVA_CAPABILITIES.hasVisibilityModifiers).toBe(true);
    });
  });
});

describe('getLanguageCapabilities', () => {
  it('should return TypeScript capabilities', () => {
    expect(getLanguageCapabilities('typescript')).toBe(TYPESCRIPT_CAPABILITIES);
  });

  it('should return JavaScript capabilities', () => {
    expect(getLanguageCapabilities('javascript')).toBe(JAVASCRIPT_CAPABILITIES);
  });

  it('should return Python capabilities', () => {
    expect(getLanguageCapabilities('python')).toBe(PYTHON_CAPABILITIES);
  });

  it('should return Go capabilities', () => {
    expect(getLanguageCapabilities('go')).toBe(GO_CAPABILITIES);
  });

  it('should return Java capabilities', () => {
    expect(getLanguageCapabilities('java')).toBe(JAVA_CAPABILITIES);
  });

  it('should default to TypeScript capabilities for unknown languages', () => {
    expect(getLanguageCapabilities('unknown' as any)).toBe(TYPESCRIPT_CAPABILITIES);
  });
});

describe('constraintAppliesTo', () => {
  describe('must_extend constraint', () => {
    it('should apply to TypeScript (has class inheritance)', () => {
      expect(constraintAppliesTo('must_extend', 'typescript')).toBe(true);
    });

    it('should apply to Java (has class inheritance)', () => {
      expect(constraintAppliesTo('must_extend', 'java')).toBe(true);
    });

    it('should apply to Go (embedding mapped to extends in semantic model)', () => {
      expect(constraintAppliesTo('must_extend', 'go')).toBe(true);
    });
  });

  describe('implements constraint', () => {
    it('should apply to TypeScript (has interfaces)', () => {
      expect(constraintAppliesTo('implements', 'typescript')).toBe(true);
    });

    it('should not apply to JavaScript (no interfaces)', () => {
      expect(constraintAppliesTo('implements', 'javascript')).toBe(false);
    });

    it('should apply to Go (has implicit interfaces)', () => {
      expect(constraintAppliesTo('implements', 'go')).toBe(true);
    });
  });

  describe('decorator constraints', () => {
    it('should apply require_decorator to TypeScript', () => {
      expect(constraintAppliesTo('require_decorator', 'typescript')).toBe(true);
    });

    it('should apply forbid_decorator to JavaScript', () => {
      expect(constraintAppliesTo('forbid_decorator', 'javascript')).toBe(true);
    });

    it('should not apply require_decorator to Go', () => {
      expect(constraintAppliesTo('require_decorator', 'go')).toBe(false);
    });

    it('should not apply forbid_decorator to Go', () => {
      expect(constraintAppliesTo('forbid_decorator', 'go')).toBe(false);
    });
  });

  describe('max_public_methods constraint', () => {
    it('should apply to all languages (can count methods)', () => {
      expect(constraintAppliesTo('max_public_methods', 'typescript')).toBe(true);
      expect(constraintAppliesTo('max_public_methods', 'python')).toBe(true);
      expect(constraintAppliesTo('max_public_methods', 'go')).toBe(true);
    });
  });

  describe('other constraints', () => {
    it('should apply unknown constraints to all languages', () => {
      expect(constraintAppliesTo('forbid_import', 'typescript')).toBe(true);
      expect(constraintAppliesTo('forbid_import', 'python')).toBe(true);
      expect(constraintAppliesTo('forbid_import', 'go')).toBe(true);
      expect(constraintAppliesTo('forbid_import', 'java')).toBe(true);
    });

    it('should apply max_file_lines to all languages', () => {
      expect(constraintAppliesTo('max_file_lines', 'typescript')).toBe(true);
      expect(constraintAppliesTo('max_file_lines', 'python')).toBe(true);
    });

    it('should apply forbid_pattern to all languages', () => {
      expect(constraintAppliesTo('forbid_pattern', 'typescript')).toBe(true);
      expect(constraintAppliesTo('forbid_pattern', 'go')).toBe(true);
    });
  });
});
