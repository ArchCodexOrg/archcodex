/**
 * @arch archcodex.test
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
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
} from './capabilities.js';

describe('Language Capabilities', () => {
  describe('TYPESCRIPT_CAPABILITIES', () => {
    it('has all features enabled', () => {
      expect(TYPESCRIPT_CAPABILITIES.hasClassInheritance).toBe(true);
      expect(TYPESCRIPT_CAPABILITIES.hasInterfaces).toBe(true);
      expect(TYPESCRIPT_CAPABILITIES.hasDecorators).toBe(true);
      expect(TYPESCRIPT_CAPABILITIES.hasVisibilityModifiers).toBe(true);
    });
  });

  describe('JAVASCRIPT_CAPABILITIES', () => {
    it('has no interfaces', () => {
      expect(JAVASCRIPT_CAPABILITIES.hasInterfaces).toBe(false);
    });
  });

  describe('GO_CAPABILITIES', () => {
    it('has no class inheritance or decorators', () => {
      expect(GO_CAPABILITIES.hasClassInheritance).toBe(false);
      expect(GO_CAPABILITIES.hasDecorators).toBe(false);
    });
  });

  describe('getLanguageCapabilities', () => {
    it('returns TypeScript capabilities', () => {
      expect(getLanguageCapabilities('typescript')).toBe(TYPESCRIPT_CAPABILITIES);
    });

    it('returns JavaScript capabilities', () => {
      expect(getLanguageCapabilities('javascript')).toBe(JAVASCRIPT_CAPABILITIES);
    });

    it('returns Python capabilities', () => {
      expect(getLanguageCapabilities('python')).toBe(PYTHON_CAPABILITIES);
    });

    it('returns Go capabilities', () => {
      expect(getLanguageCapabilities('go')).toBe(GO_CAPABILITIES);
    });

    it('returns Java capabilities', () => {
      expect(getLanguageCapabilities('java')).toBe(JAVA_CAPABILITIES);
    });
  });

  describe('constraintAppliesTo', () => {
    it('must_extend applies to languages with class inheritance', () => {
      expect(constraintAppliesTo('must_extend', 'typescript')).toBe(true);
      expect(constraintAppliesTo('must_extend', 'go')).toBe(false);
    });

    it('implements applies to languages with interfaces', () => {
      expect(constraintAppliesTo('implements', 'typescript')).toBe(true);
      expect(constraintAppliesTo('implements', 'javascript')).toBe(false);
    });

    it('require_decorator applies to languages with decorators', () => {
      expect(constraintAppliesTo('require_decorator', 'typescript')).toBe(true);
      expect(constraintAppliesTo('require_decorator', 'go')).toBe(false);
    });

    it('generic constraints apply to all languages', () => {
      expect(constraintAppliesTo('forbid_import', 'typescript')).toBe(true);
      expect(constraintAppliesTo('forbid_import', 'go')).toBe(true);
    });
  });
});
