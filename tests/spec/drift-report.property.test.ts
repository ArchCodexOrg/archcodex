/**
 * @arch archcodex.test
 * @intent:cli-output
 *
 * Property tests for generateDriftReport
 * Source: spec.speccodex.drift.report (invariants)
 *
 * Generated via: archcodex spec generate spec.speccodex.drift.report --type property
 * Then fixed for proper function calls, assertions, and mocking.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  generateDriftReport,
} from '../../src/core/spec/drift/report.js';
import type { SpecRegistry } from '../../src/core/spec/schema.js';

// Mock file-system utilities
vi.mock('../../src/utils/file-system.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils/file-system.js')>();
  return {
    ...actual,
    globFiles: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue('export function fn() {}'),
  };
});

import { globFiles, readFile } from '../../src/utils/file-system.js';

const mockGlobFiles = vi.mocked(globFiles);
const mockReadFile = vi.mocked(readFile);

// @speccodex:property:start - DO NOT EDIT BETWEEN MARKERS
describe('generateDriftReport properties', () => {
  // Arbitrary for generating spec nodes with varying wired/unwired/examples states
  const specNodeArb = fc.record({
    intent: fc.stringMatching(/^[A-Za-z ]{1,20}$/),
    hasImpl: fc.boolean(),
    hasExamples: fc.boolean(),
  });

  // Arbitrary for registries with 0-5 specs
  const registryArb = fc.array(
    fc.tuple(
      fc.stringMatching(/^spec\.[a-z]{2,8}$/).filter(s => s.length > 5),
      specNodeArb
    ),
    { minLength: 0, maxLength: 5 }
  ).chain(entries => {
    // Also generate some undocumented files
    return fc.array(
      fc.stringMatching(/^[a-z]{2,8}$/).map(name => `/test/project/src/${name}.ts`),
      { minLength: 0, maxLength: 3 }
    ).map(orphanFiles => {
      const nodes: Record<string, Record<string, unknown>> = {};
      for (const [id, node] of entries) {
        nodes[id] = {
          intent: node.intent,
          ...(node.hasImpl ? { implementation: `src/${id.replace('spec.', '')}.ts#fn` } : {}),
          ...(node.hasExamples
            ? { examples: { success: [{ name: 'test', given: {}, then: {} }] } }
            : {}),
        };
      }
      return { registry: { nodes, mixins: {} } as SpecRegistry, orphanFiles };
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGlobFiles.mockResolvedValue([]);
    mockReadFile.mockResolvedValue('export function fn() {}');
  });

  describe('invariants', () => {
    it('valid is false if errors > 0', async () => {
      await fc.assert(
        fc.asyncProperty(registryArb, async ({ registry, orphanFiles }) => {
          mockGlobFiles.mockClear();
          mockReadFile.mockClear();
          mockReadFile.mockResolvedValue('export function fn() {}');
          mockGlobFiles.mockResolvedValue(orphanFiles);

          const result = await generateDriftReport('/test/project', registry, {
            includeSignatureCheck: false,
          });

          // Bi-conditional: errors > 0 <=> valid === false
          if (result.summary.errors > 0) {
            expect(result.valid).toBe(false);
          }
          if (result.valid) {
            expect(result.summary.errors).toBe(0);
          }
        }),
        { numRuns: 30 }
      );
    });

    it('issues are sorted by severity (errors first)', async () => {
      await fc.assert(
        fc.asyncProperty(registryArb, async ({ registry, orphanFiles }) => {
          mockGlobFiles.mockClear();
          mockReadFile.mockClear();
          mockReadFile.mockResolvedValue('export function fn() {}');
          mockGlobFiles.mockResolvedValue(orphanFiles);

          const result = await generateDriftReport('/test/project', registry, {
            includeSignatureCheck: false,
          });

          const severityOrder: Record<string, number> = {
            error: 0,
            warning: 1,
            info: 2,
          };

          for (let i = 1; i < result.issues.length; i++) {
            const prevOrder = severityOrder[result.issues[i - 1].severity];
            const currOrder = severityOrder[result.issues[i].severity];
            expect(prevOrder).toBeLessThanOrEqual(currOrder);
          }
        }),
        { numRuns: 30 }
      );
    });

    it('forall issue in result.issues: issue.message is defined and non-empty', async () => {
      await fc.assert(
        fc.asyncProperty(registryArb, async ({ registry, orphanFiles }) => {
          mockGlobFiles.mockClear();
          mockReadFile.mockClear();
          mockReadFile.mockResolvedValue('export function fn() {}');
          mockGlobFiles.mockResolvedValue(orphanFiles);

          const result = await generateDriftReport('/test/project', registry, {
            includeSignatureCheck: false,
          });

          for (const issue of result.issues) {
            expect(issue.message).toBeDefined();
            expect(typeof issue.message).toBe('string');
            expect(issue.message.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 30 }
      );
    });
  });
});
// @speccodex:property:end
