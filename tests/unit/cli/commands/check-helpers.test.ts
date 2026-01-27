/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for check command helper functions.
 */
import { describe, it, expect } from 'vitest';
import {
  parseThreshold,
  mergePrecommitSettings,
  getExitCodeWithThresholds,
} from '../../../../src/cli/commands/check-helpers.js';

describe('parseThreshold', () => {
  it('should parse numeric values', () => {
    expect(parseThreshold('0')).toBe(0);
    expect(parseThreshold('10')).toBe(10);
    expect(parseThreshold('100')).toBe(100);
  });

  it('should return null for "null" string', () => {
    expect(parseThreshold('null')).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(parseThreshold('')).toBeNull();
  });

  it('should return null for non-numeric strings', () => {
    expect(parseThreshold('abc')).toBeNull();
  });
});

describe('mergePrecommitSettings', () => {
  it('should use defaults when no config provided', () => {
    const result = mergePrecommitSettings(undefined, {});
    expect(result.maxErrors).toBeNull();
    expect(result.maxWarnings).toBeNull();
    expect(result.outputFormat).toBe('human');
    expect(result.onlyStagedFiles).toBe(false);
  });

  it('should use config values', () => {
    const result = mergePrecommitSettings({
      max_errors: 5,
      max_warnings: 10,
      output_format: 'compact',
      only_staged_files: true,
      include: ['src/**'],
      exclude: ['**/*.test.ts'],
    }, {});
    expect(result.maxErrors).toBe(5);
    expect(result.maxWarnings).toBe(10);
    expect(result.outputFormat).toBe('compact');
    expect(result.onlyStagedFiles).toBe(true);
    expect(result.include).toEqual(['src/**']);
    expect(result.exclude).toEqual(['**/*.test.ts']);
  });

  it('should override config with CLI options', () => {
    const result = mergePrecommitSettings({
      max_errors: 5,
      output_format: 'compact',
    }, {
      maxErrors: 0,
      json: true,
    });
    expect(result.maxErrors).toBe(0);
    expect(result.outputFormat).toBe('json');
  });

  it('should handle staged flag', () => {
    const result = mergePrecommitSettings(undefined, { staged: true });
    expect(result.onlyStagedFiles).toBe(true);
  });
});

describe('getExitCodeWithThresholds', () => {
  const exitCodes = { success: 0, error: 1, warning_only: 2 };

  it('should return success when no errors or warnings', () => {
    expect(getExitCodeWithThresholds({ failed: 0, warned: 0 }, exitCodes, null, null)).toBe(0);
  });

  it('should return error when errors exceed threshold', () => {
    expect(getExitCodeWithThresholds({ failed: 5, warned: 0 }, exitCodes, 3, null)).toBe(1);
  });

  it('should return success when errors within threshold', () => {
    expect(getExitCodeWithThresholds({ failed: 3, warned: 0 }, exitCodes, 5, null)).toBe(0);
  });

  it('should return error when warnings exceed threshold', () => {
    expect(getExitCodeWithThresholds({ failed: 0, warned: 10 }, exitCodes, null, 5)).toBe(1);
  });

  it('should return warning_only when warnings exist but no threshold', () => {
    expect(getExitCodeWithThresholds({ failed: 0, warned: 5 }, exitCodes, null, null)).toBe(2);
  });

  it('should return error on any error when threshold is null', () => {
    expect(getExitCodeWithThresholds({ failed: 1, warned: 0 }, exitCodes, null, null)).toBe(1);
  });
});
