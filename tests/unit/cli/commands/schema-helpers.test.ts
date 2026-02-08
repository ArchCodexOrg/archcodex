/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for schema helper functions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { outputMinimal, outputAiFormat, outputExamples } from '../../../../src/cli/commands/schema-helpers.js';

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn().mockResolvedValue({
    nodes: {},
    mixins: {},
  }),
}));

describe('schema-helpers', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('outputMinimal', () => {
    it('should output rule names', async () => {
      await outputMinimal();
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('RULES');
    });

    it('should suggest query options', async () => {
      await outputMinimal();
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Query specific');
    });

    it('should suggest comprehensive option', async () => {
      await outputMinimal();
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Comprehensive');
    });

    it('should suggest examples option', async () => {
      await outputMinimal();
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Examples');
    });

    it('should suggest AI format option', async () => {
      await outputMinimal();
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('AI format');
    });
  });

  describe('outputAiFormat', () => {
    it('should output AI-formatted schema', async () => {
      await outputAiFormat();
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('RULES');
      expect(output).toContain('CONSTRAINT TEMPLATE');
    });

    it('should include constraint template structure', async () => {
      await outputAiFormat();
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('- rule:');
      expect(output).toContain('value:');
      expect(output).toContain('severity:');
      expect(output).toContain('why:');
    });

    it('should include structured naming section', async () => {
      await outputAiFormat();
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('STRUCTURED NAMING');
      expect(output).toContain('naming:');
    });

    it('should include architecture template', async () => {
      await outputAiFormat();
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('ARCHITECTURE TEMPLATE');
    });

    it('should mention also_valid for alternatives', async () => {
      await outputAiFormat();
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('also_valid');
    });
  });

  describe('outputExamples', () => {
    it('should list categories when called with true', () => {
      outputExamples(true, 'human');
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output.length).toBeGreaterThan(0);
    });

    it('should output all examples when called with "all"', () => {
      outputExamples('all', 'human');
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output.length).toBeGreaterThan(0);
    });

    it('should handle unknown category gracefully', () => {
      outputExamples('nonexistent', 'human');
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('No examples found');
    });

    it('should output JSON format when requested', () => {
      outputExamples('all', 'json');
      expect(consoleSpy).toHaveBeenCalled();
      const jsonOutput = consoleSpy.mock.calls[0][0];
      expect(() => JSON.parse(jsonOutput)).not.toThrow();
    });

    it('should handle empty string category', () => {
      outputExamples('', 'human');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should handle architecture category', () => {
      outputExamples('architecture', 'human');
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output.length).toBeGreaterThan(0);
    });

    it('should handle constraint category', () => {
      outputExamples('constraint', 'human');
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output.length).toBeGreaterThan(0);
    });

    it('should handle recipe category', () => {
      outputExamples('recipe', 'human');
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output.length).toBeGreaterThan(0);
    });

    it('should be case insensitive for categories', () => {
      outputExamples('ARCHITECTURE', 'human');
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output.length).toBeGreaterThan(0);
    });

    it('should handle plural categories', () => {
      outputExamples('architectures', 'human');
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output.length).toBeGreaterThan(0);
    });

    it('should output valid JSON for all examples', () => {
      outputExamples('all', 'json');
      const jsonOutput = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(jsonOutput);
      expect(parsed).toBeDefined();
      expect(typeof parsed).toBe('object');
    });

    it('should list available categories', () => {
      outputExamples(true, 'human');
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Example Categories');
    });

    it('should show usage instructions for categories', () => {
      outputExamples(true, 'human');
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('schema --examples');
    });
  });

  describe('console output validation', () => {
    it('outputMinimal should not throw', async () => {
      await expect(outputMinimal()).resolves.not.toThrow();
    });

    it('outputAiFormat should not throw', async () => {
      await expect(outputAiFormat()).resolves.not.toThrow();
    });

    it('outputExamples should not throw for valid inputs', () => {
      expect(() => outputExamples('all', 'human')).not.toThrow();
      expect(() => outputExamples('all', 'json')).not.toThrow();
      expect(() => outputExamples(true, 'human')).not.toThrow();
    });
  });
});
