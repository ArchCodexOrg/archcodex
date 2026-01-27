/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: Object.assign((s: string) => s, {
      green: (s: string) => s,
      yellow: (s: string) => s,
      red: (s: string) => s,
      magenta: (s: string) => s,
      cyan: (s: string) => s,
    }),
    dim: (s: string) => s,
    cyan: (s: string) => s,
    yellow: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    magenta: (s: string) => s,
  },
}));

import { printGardenReport } from '../../../../src/cli/formatters/garden.js';
import type { GardenReport } from '../../../../src/core/garden/types.js';

describe('printGardenReport', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should print report without errors for empty report', () => {
    const report: GardenReport = {
      patterns: [],
      inconsistencies: [],
      keywordSuggestions: [],
      keywordCleanups: [],
      typeDuplicates: [],
      summary: {
        filesScanned: 0,
        patternsDetected: 0,
        inconsistenciesFound: 0,
        keywordSuggestionCount: 0,
        keywordCleanupCount: 0,
        typeDuplicateCount: 0,
        hasIssues: false,
      },
    };

    expect(() => printGardenReport(report)).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should print patterns when present', () => {
    const report: GardenReport = {
      patterns: [
        {
          pattern: 'test-pattern',
          files: ['a.ts', 'b.ts'],
          inIndex: true,
          archId: 'test.arch',
          suggestedKeywords: [],
        },
      ],
      inconsistencies: [],
      keywordSuggestions: [],
      keywordCleanups: [],
      typeDuplicates: [],
      summary: {
        filesScanned: 2,
        patternsDetected: 1,
        inconsistenciesFound: 0,
        keywordSuggestionCount: 0,
        keywordCleanupCount: 0,
        typeDuplicateCount: 0,
        hasIssues: false,
      },
    };

    expect(() => printGardenReport(report)).not.toThrow();
    const output = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('PATTERNS DETECTED');
  });

  it('should show healthy message when no issues', () => {
    const report: GardenReport = {
      patterns: [],
      inconsistencies: [],
      keywordSuggestions: [],
      keywordCleanups: [],
      typeDuplicates: [],
      summary: {
        filesScanned: 10,
        patternsDetected: 0,
        inconsistenciesFound: 0,
        keywordSuggestionCount: 0,
        keywordCleanupCount: 0,
        typeDuplicateCount: 0,
        hasIssues: false,
      },
    };

    printGardenReport(report);
    const output = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('healthy');
  });
});
