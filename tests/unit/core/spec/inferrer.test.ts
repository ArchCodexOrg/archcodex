/**
 * @arch archcodex.test.unit
 *
 * Tests for spec inferrer — generates spec YAML from TypeScript implementations.
 */
import { describe, it, expect } from 'vitest';
import { inferSpec } from '../../../../src/core/spec/inferrer.js';

// Fixture paths (relative to project root)
const FIXTURES = 'tests/fixtures/typescript';

// @speccodex:start - DO NOT EDIT BETWEEN MARKERS
describe('inferSpec', () => {
  describe('success cases', () => {
    it('plain function infers spec.function', () => {
      // Arrange
      const implementationPath = `${FIXTURES}/plain-function.ts#formatDate`;

      // Act
      const result = inferSpec({ implementationPath });

      // Assert
      expect(result.valid).toBe(true);
      expect(result.specId).toContain("spec.");
      expect(result.detectedPatterns.baseSpec).toBe('spec.function');
      expect(result.detectedPatterns.security.authentication).toBe('none');
      expect(result.yaml).toContain("inherits: spec.function");
    });

    it('makeAuthMutation infers spec.mutation with required auth', () => {
      // Arrange
      const implementationPath = `${FIXTURES}/auth-mutation.ts#create`;

      // Act
      const result = inferSpec({ implementationPath });

      // Assert
      expect(result.valid).toBe(true);
      expect(result.detectedPatterns.baseSpec).toBe('spec.mutation');
      expect(result.detectedPatterns.security.authentication).toBe('required');
      expect(result.yaml).toContain("authentication: required");
    });

    it('override inherits via option', () => {
      // Arrange
      const implementationPath = `${FIXTURES}/plain-function.ts#formatDate`;
      const options = { inherits: "spec.action" };

      // Act
      const result = inferSpec({ implementationPath, options });

      // Assert
      expect(result.valid).toBe(true);
      expect(result.detectedPatterns.baseSpec).toBe('spec.action');
      expect(result.yaml).toContain("inherits: spec.action");
    });

    it('YAML includes TODO placeholders for manual fields', () => {
      // Arrange
      const implementationPath = `${FIXTURES}/helpers.ts#doStuff`;

      // Act
      const result = inferSpec({ implementationPath });

      // Assert
      expect(result.valid).toBe(true);
      expect(result.yaml).toContain("intent:");
    });

    it('detects side effects from code patterns', () => {
      // Arrange
      const implementationPath = `${FIXTURES}/mutation-update.ts#update`;

      // Act
      const result = inferSpec({ implementationPath });

      // Assert
      expect(result.valid).toBe(true);
      expect(result.detectedPatterns.effects.length).toBeGreaterThan(0);
    });

    it('extracts error codes from ConvexError throws', () => {
      // Arrange
      const implementationPath = `${FIXTURES}/mutation-delete.ts#remove`;

      // Act
      const result = inferSpec({ implementationPath });

      // Assert
      expect(result.valid).toBe(true);
      expect(result.detectedPatterns.errorCodes.length).toBeGreaterThan(0);
    });

  });

  describe('cross-file type resolution', { timeout: 30_000 }, () => {
    it('resolves imported return type fields', () => {
      const implementationPath = `${FIXTURES}/imported-types/main.ts#processUser`;

      const result = inferSpec({ implementationPath });

      expect(result.valid).toBe(true);
      // Return type UserResult should be resolved from types.ts
      expect(result.yaml).toContain('valid');
      expect(result.yaml).toContain('boolean');
      expect(result.yaml).toContain('errors');
      expect(result.yaml).toContain('userId');
      // Should NOT contain TODO for UserResult
      expect(result.yaml).not.toContain("TODO: Review type 'UserResult'");
    });

    it('resolves imported return type with .js extension import', () => {
      const implementationPath = `${FIXTURES}/imported-types/main-js-import.ts#getUser`;

      const result = inferSpec({ implementationPath });

      expect(result.valid).toBe(true);
      expect(result.yaml).toContain('valid');
      expect(result.yaml).toContain('userId');
      expect(result.yaml).not.toContain("TODO: Review type 'UserResult'");
    });
  });

  describe('error cases', () => {
    it('invalid path format (no hash)', () => {
      // Arrange
      const implementationPath = "no-hash-here.ts";

      // Act
      const result = inferSpec({ implementationPath });

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({"code":"INVALID_PATH"})]));
    });

    it('file not found', () => {
      // Arrange
      const implementationPath = "nonexistent/file.ts#fn";

      // Act
      const result = inferSpec({ implementationPath });

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({"code":"IMPLEMENTATION_NOT_FOUND"})]));
    });

    it('export not found in file', () => {
      // Arrange
      const implementationPath = `${FIXTURES}/helpers.ts#nonExistentExport`;

      // Act
      const result = inferSpec({ implementationPath });

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({"code":"EXPORT_NOT_FOUND"})]));
    });

  });

});
// @speccodex:end
