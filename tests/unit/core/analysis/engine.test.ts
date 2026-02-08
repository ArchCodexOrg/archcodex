/**
 * @arch archcodex.test.unit
 *
 * Tests for analysis engine — formatAnalysisResult, buildSummary (via runAllAnalyses),
 * compareSeverity, severityAtLeast, and summarizeDrift (via deep analysis).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock all heavy dependencies BEFORE importing the module under test
// ---------------------------------------------------------------------------

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('../../../../src/core/spec/loader.js', () => ({
  loadSpecRegistry: vi.fn(),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn(),
}));

vi.mock('../../../../src/core/registry/component-groups.js', () => ({
  loadComponentGroupsRegistry: vi.fn(),
}));

vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../../../src/core/spec/verifier.js', () => ({
  verifyImplementation: vi.fn(),
}));

vi.mock('../../../../src/core/analysis/graph.js', () => ({
  buildCrossReferenceGraph: vi.fn(),
}));

vi.mock('../../../../src/core/analysis/checkers/index.js', () => ({
  securityChecker: { id: 'sec', name: 'Security', category: 'security', check: vi.fn(() => []) },
  logicChecker: { id: 'log', name: 'Logic', category: 'logic', check: vi.fn(() => []) },
  dataChecker: { id: 'dat', name: 'Data', category: 'data', check: vi.fn(() => []) },
  consistencyChecker: { id: 'con', name: 'Consistency', category: 'consistency', check: vi.fn(() => []) },
  completenessChecker: { id: 'com', name: 'Completeness', category: 'completeness', check: vi.fn(() => []) },
  otherChecker: { id: 'oth', name: 'Other', category: 'other', check: vi.fn(() => []) },
}));

import { readFile } from 'fs/promises';
import { runAllAnalyses, formatAnalysisResult } from '../../../../src/core/analysis/engine.js';
import { compareSeverity, severityAtLeast } from '../../../../src/core/analysis/types.js';
import type { AnalysisResult, AnalysisIssue } from '../../../../src/core/analysis/types.js';
import { loadSpecRegistry } from '../../../../src/core/spec/loader.js';
import { loadRegistry } from '../../../../src/core/registry/loader.js';
import { loadComponentGroupsRegistry } from '../../../../src/core/registry/component-groups.js';
import { loadConfig } from '../../../../src/core/config/loader.js';
import { buildCrossReferenceGraph } from '../../../../src/core/analysis/graph.js';
import { verifyImplementation } from '../../../../src/core/spec/verifier.js';
import {
  securityChecker,
  logicChecker,
  dataChecker,
} from '../../../../src/core/analysis/checkers/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIssue(overrides: Partial<AnalysisIssue> = {}): AnalysisIssue {
  return {
    id: 'TEST-1',
    category: 'logic',
    severity: 'warning',
    message: 'Test issue',
    ...overrides,
  };
}

function makeResult(
  issues: AnalysisIssue[],
  specsAnalyzed = 5,
): AnalysisResult {
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  for (const issue of issues) {
    byCategory[issue.category] = (byCategory[issue.category] ?? 0) + 1;
    bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1;
  }
  return {
    issues,
    summary: { total: issues.length, byCategory, bySeverity, specsAnalyzed },
  };
}

function setupDefaultMocks(): void {
  vi.mocked(loadSpecRegistry).mockResolvedValue({
    nodes: {},
    version: '1.0',
    inheritance: {},
  } as ReturnType<typeof loadSpecRegistry> extends Promise<infer T> ? T : never);

  vi.mocked(loadRegistry).mockResolvedValue({
    nodes: {},
    version: '1.0',
    mixins: {},
    architectures: [],
    config: {},
  } as ReturnType<typeof loadRegistry> extends Promise<infer T> ? T : never);

  vi.mocked(loadComponentGroupsRegistry).mockResolvedValue({
    groups: {},
  } as ReturnType<typeof loadComponentGroupsRegistry> extends Promise<infer T> ? T : never);

  vi.mocked(loadConfig).mockResolvedValue({
    layers: [],
    shared: {},
    analysis: {
      deep_patterns: {},
      tool_entities: [],
    },
  } as ReturnType<typeof loadConfig> extends Promise<infer T> ? T : never);

  vi.mocked(buildCrossReferenceGraph).mockReturnValue({
    entityToSpecs: new Map(),
    tableToWriters: new Map(),
    tableToReaders: new Map(),
    specDependents: new Map(),
    archToSpecs: new Map(),
  });
}

// ---------------------------------------------------------------------------
// compareSeverity
// ---------------------------------------------------------------------------

describe('compareSeverity', () => {
  it('returns negative when first is more severe', () => {
    expect(compareSeverity('error', 'warning')).toBeLessThan(0);
    expect(compareSeverity('error', 'info')).toBeLessThan(0);
    expect(compareSeverity('warning', 'info')).toBeLessThan(0);
  });

  it('returns positive when first is less severe', () => {
    expect(compareSeverity('info', 'error')).toBeGreaterThan(0);
    expect(compareSeverity('warning', 'error')).toBeGreaterThan(0);
    expect(compareSeverity('info', 'warning')).toBeGreaterThan(0);
  });

  it('returns zero for equal severities', () => {
    expect(compareSeverity('error', 'error')).toBe(0);
    expect(compareSeverity('warning', 'warning')).toBe(0);
    expect(compareSeverity('info', 'info')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// severityAtLeast
// ---------------------------------------------------------------------------

describe('severityAtLeast', () => {
  it('returns true when severity meets threshold', () => {
    expect(severityAtLeast('error', 'error')).toBe(true);
    expect(severityAtLeast('error', 'warning')).toBe(true);
    expect(severityAtLeast('error', 'info')).toBe(true);
    expect(severityAtLeast('warning', 'warning')).toBe(true);
    expect(severityAtLeast('warning', 'info')).toBe(true);
    expect(severityAtLeast('info', 'info')).toBe(true);
  });

  it('returns false when severity is below threshold', () => {
    expect(severityAtLeast('info', 'error')).toBe(false);
    expect(severityAtLeast('info', 'warning')).toBe(false);
    expect(severityAtLeast('warning', 'error')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatAnalysisResult
// ---------------------------------------------------------------------------

describe('formatAnalysisResult', () => {
  it('formats empty result with no-issues message', () => {
    const result = makeResult([]);
    const output = formatAnalysisResult(result);

    expect(output).toContain('No issues found.');
    expect(output).toContain('Specs analyzed: 5');
  });

  it('groups issues by category', () => {
    const result = makeResult([
      makeIssue({ id: 'SEC-1', category: 'security', severity: 'error', message: 'Auth issue' }),
      makeIssue({ id: 'LOG-1', category: 'logic', severity: 'warning', message: 'Logic issue' }),
      makeIssue({ id: 'SEC-2', category: 'security', severity: 'warning', message: 'Rate limit' }),
    ]);
    const output = formatAnalysisResult(result);

    expect(output).toContain('Security (2)');
    expect(output).toContain('Logic (1)');
  });

  it('includes severity icons', () => {
    const result = makeResult([
      makeIssue({ severity: 'error', message: 'error msg' }),
      makeIssue({ severity: 'warning', message: 'warn msg' }),
      makeIssue({ severity: 'info', message: 'info msg' }),
    ]);
    const output = formatAnalysisResult(result);

    expect(output).toContain('[ERR]');
    expect(output).toContain('[WRN]');
    expect(output).toContain('[INF]');
  });

  it('includes spec labels when present', () => {
    const result = makeResult([
      makeIssue({ specId: 'spec.user.create', message: 'test' }),
    ]);
    const output = formatAnalysisResult(result);

    expect(output).toContain('[spec.user.create]');
  });

  it('includes field labels when present', () => {
    const result = makeResult([
      makeIssue({ field: 'email', message: 'test' }),
    ]);
    const output = formatAnalysisResult(result);

    expect(output).toContain('(email)');
  });

  it('includes suggestions when present', () => {
    const result = makeResult([
      makeIssue({ suggestion: 'Fix the thing' }),
    ]);
    const output = formatAnalysisResult(result);

    expect(output).toContain('-> Fix the thing');
  });

  it('includes summary line with counts', () => {
    const result = makeResult([
      makeIssue({ severity: 'error' }),
      makeIssue({ severity: 'warning' }),
      makeIssue({ severity: 'warning' }),
    ], 10);
    const output = formatAnalysisResult(result);

    expect(output).toContain('3 issue(s) across 10 spec(s)');
    expect(output).toContain('1 error(s)');
    expect(output).toContain('2 warning(s)');
  });

  it('formats unknown severity with fallback icon', () => {
    const result = makeResult([
      makeIssue({ severity: 'unknown' as AnalysisIssue['severity'] }),
    ]);
    const output = formatAnalysisResult(result);

    expect(output).toContain('[???]');
  });

  it('formats issues without specId or field gracefully', () => {
    const result = makeResult([
      makeIssue({ id: 'PLAIN-1', specId: undefined, field: undefined }),
    ]);
    const output = formatAnalysisResult(result);

    expect(output).toContain('PLAIN-1');
    expect(output).not.toContain('[]');
    expect(output).not.toContain('()');
  });

  it('shows info count in summary when present', () => {
    const result = makeResult([
      makeIssue({ severity: 'info' }),
      makeIssue({ severity: 'info' }),
    ]);
    const output = formatAnalysisResult(result);

    expect(output).toContain('2 info');
  });
});

// ---------------------------------------------------------------------------
// runAllAnalyses
// ---------------------------------------------------------------------------

describe('runAllAnalyses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('should return empty issues when no specs and no checker findings', async () => {
    const result = await runAllAnalyses('/fake/project');

    expect(result.issues).toHaveLength(0);
    expect(result.summary.total).toBe(0);
    expect(result.summary.specsAnalyzed).toBe(0);
  });

  it('should pass through issues from checkers', async () => {
    const mockIssue: AnalysisIssue = {
      id: 'SEC-99',
      category: 'security',
      severity: 'error',
      message: 'Something bad',
    };

    vi.mocked(securityChecker.check).mockReturnValue([mockIssue]);

    const result = await runAllAnalyses('/fake/project');

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].id).toBe('SEC-99');
    expect(result.summary.total).toBe(1);
    expect(result.summary.bySeverity['error']).toBe(1);
    expect(result.summary.byCategory['security']).toBe(1);
  });

  it('should filter by severity threshold', async () => {
    vi.mocked(logicChecker.check).mockReturnValue([
      makeIssue({ id: 'LOG-1', category: 'logic', severity: 'error' }),
      makeIssue({ id: 'LOG-2', category: 'logic', severity: 'warning' }),
      makeIssue({ id: 'LOG-3', category: 'logic', severity: 'info' }),
    ]);

    const result = await runAllAnalyses('/fake/project', { severity: 'warning', categories: ['logic'] });

    expect(result.issues).toHaveLength(2);
    expect(result.issues.map(i => i.id)).toContain('LOG-1');
    expect(result.issues.map(i => i.id)).toContain('LOG-2');
  });

  it('should filter by specIds', async () => {
    vi.mocked(logicChecker.check).mockReturnValue([
      makeIssue({ id: 'LOG-1', category: 'logic', specId: 'spec.a' }),
      makeIssue({ id: 'LOG-2', category: 'logic', specId: 'spec.b' }),
      makeIssue({ id: 'LOG-3', category: 'logic', specId: 'spec.c' }),
    ]);

    const result = await runAllAnalyses('/fake/project', { specIds: ['spec.a', 'spec.c'], categories: ['logic'] });

    expect(result.issues).toHaveLength(2);
    expect(result.issues.map(i => i.specId)).toEqual(['spec.a', 'spec.c']);
  });

  it('should include issues without specId when filtering by specIds', async () => {
    vi.mocked(logicChecker.check).mockReturnValue([
      makeIssue({ id: 'LOG-1', category: 'logic', specId: 'spec.a' }),
      makeIssue({ id: 'LOG-2', category: 'logic', specId: undefined }),
    ]);

    const result = await runAllAnalyses('/fake/project', { specIds: ['spec.a'], categories: ['logic'] });

    expect(result.issues).toHaveLength(2);
  });

  it('should filter by category', async () => {
    vi.mocked(securityChecker.check).mockReturnValue([
      makeIssue({ id: 'SEC-1', category: 'security' }),
    ]);
    vi.mocked(logicChecker.check).mockReturnValue([
      makeIssue({ id: 'LOG-1', category: 'logic' }),
    ]);

    const result = await runAllAnalyses('/fake/project', { categories: ['security'] });

    // Only security checker should have been called
    expect(securityChecker.check).toHaveBeenCalled();
    expect(logicChecker.check).not.toHaveBeenCalled();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].id).toBe('SEC-1');
  });

  it('should sort issues by severity (errors first)', async () => {
    vi.mocked(logicChecker.check).mockReturnValue([
      makeIssue({ id: 'LOG-1', category: 'logic', severity: 'info' }),
      makeIssue({ id: 'LOG-2', category: 'logic', severity: 'error' }),
      makeIssue({ id: 'LOG-3', category: 'logic', severity: 'warning' }),
    ]);

    const result = await runAllAnalyses('/fake/project', { categories: ['logic'] });

    expect(result.issues[0].severity).toBe('error');
    expect(result.issues[1].severity).toBe('warning');
    expect(result.issues[2].severity).toBe('info');
  });

  it('should skip test fixture specs', async () => {
    vi.mocked(loadSpecRegistry).mockResolvedValue({
      nodes: {
        'spec.real': { inherits: 'spec.function' },
        'spec.test': { type: 'test', inherits: 'spec.function' },
      },
      version: '1.0',
      inheritance: {},
    } as ReturnType<typeof loadSpecRegistry> extends Promise<infer T> ? T : never);

    const result = await runAllAnalyses('/fake/project');

    // Should have analyzed 1 spec (not the test fixture)
    expect(result.summary.specsAnalyzed).toBe(1);
  });

  describe('deep analysis', () => {
    it('should read implementation files in deep mode', async () => {
      vi.mocked(loadSpecRegistry).mockResolvedValue({
        nodes: {
          'spec.myFunction': {
            inherits: 'spec.function',
            implementation: 'src/service.ts#myFunction',
          },
        },
        version: '1.0',
        inheritance: {},
      } as ReturnType<typeof loadSpecRegistry> extends Promise<infer T> ? T : never);

      vi.mocked(readFile).mockResolvedValue('export function myFunction() {}');
      vi.mocked(verifyImplementation).mockReturnValue({ drift: [] });

      const result = await runAllAnalyses('/fake/project', { deep: true });

      expect(readFile).toHaveBeenCalled();
      expect(verifyImplementation).toHaveBeenCalled();
      expect(result.summary.specsAnalyzed).toBe(1);
    });

    it('should silently skip missing implementation files in deep mode', async () => {
      vi.mocked(loadSpecRegistry).mockResolvedValue({
        nodes: {
          'spec.missing': {
            inherits: 'spec.function',
            implementation: 'src/missing.ts#fn',
          },
        },
        version: '1.0',
        inheritance: {},
      } as ReturnType<typeof loadSpecRegistry> extends Promise<infer T> ? T : never);

      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await runAllAnalyses('/fake/project', { deep: true });

      expect(result.summary.specsAnalyzed).toBe(1);
      // Should not throw
    });

    it('should handle specs without implementation field in deep mode', async () => {
      vi.mocked(loadSpecRegistry).mockResolvedValue({
        nodes: {
          'spec.noImpl': {
            inherits: 'spec.function',
          },
        },
        version: '1.0',
        inheritance: {},
      } as ReturnType<typeof loadSpecRegistry> extends Promise<infer T> ? T : never);

      const result = await runAllAnalyses('/fake/project', { deep: true });

      expect(readFile).not.toHaveBeenCalled();
      expect(result.summary.specsAnalyzed).toBe(1);
    });

    it('should summarize drift with extra errors', async () => {
      vi.mocked(loadSpecRegistry).mockResolvedValue({
        nodes: {
          'spec.drift': {
            inherits: 'spec.function',
            implementation: 'src/drift.ts#fn',
          },
        },
        version: '1.0',
        inheritance: {},
      } as ReturnType<typeof loadSpecRegistry> extends Promise<infer T> ? T : never);

      vi.mocked(readFile).mockResolvedValue('export function fn() {}');
      vi.mocked(verifyImplementation).mockReturnValue({
        drift: [
          { type: 'extra_error', severity: 'warning', errorCode: 'EXTRA_ERR' },
          { type: 'missing_output', severity: 'warning', specField: 'result.data' },
          { type: 'extra_output', severity: 'info', implField: 'extra.field' },
          { type: 'architecture_mismatch', severity: 'error', expected: 'core.engine', actual: 'util' },
        ],
      });

      // Should not throw — drift is summarized and passed to context
      const result = await runAllAnalyses('/fake/project', { deep: true });
      expect(result.summary.specsAnalyzed).toBe(1);
    });
  });
});
