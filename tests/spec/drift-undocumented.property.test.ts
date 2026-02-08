/**
 * @arch archcodex.test
 * @intent:cli-output
 *
 * Property tests for findUndocumentedImplementations
 * Source: spec.speccodex.drift.undocumented (invariants)
 *
 * Generated via: archcodex spec generate spec.speccodex.drift.undocumented --type property
 * Then fixed for proper function calls, assertions, and mocking.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  findUndocumentedImplementations,
} from '../../src/core/spec/drift/undocumented.js';
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
describe('findUndocumentedImplementations properties', () => {
  // Arbitrary for generating safe file names
  const fileNameArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/);

  // Arbitrary for generating registries with optional implementation fields
  const registryArb = fc.array(
    fc.tuple(
      fileNameArb,
      fc.boolean()
    ),
    { minLength: 0, maxLength: 5 }
  ).map(entries => {
    const nodes: Record<string, Record<string, unknown>> = {};
    for (const [name, hasImpl] of entries) {
      const specId = `spec.${name}`;
      nodes[specId] = {
        intent: `Do ${name}`,
        ...(hasImpl ? { implementation: `src/${name}.ts#fn` } : {}),
      };
    }
    return { nodes, mixins: {} } as SpecRegistry;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockResolvedValue('export function fn() {}');
  });

  describe('invariants', () => {
    it('test files are excluded by default exclude patterns', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fileNameArb, { minLength: 1, maxLength: 5 }),
          async (fileNames) => {
            // Reset mock state for each fast-check iteration
            mockGlobFiles.mockClear();
            mockReadFile.mockClear();
            mockReadFile.mockResolvedValue('export function fn() {}');

            // Use empty registry so no files are "covered"
            const registry: SpecRegistry = { nodes: {}, mixins: {} };
            const files = fileNames.map(name => `/test/project/src/${name}.ts`);
            mockGlobFiles.mockResolvedValue(files);

            await findUndocumentedImplementations('/test/project', registry);

            // Verify default exclude patterns include test file patterns
            expect(mockGlobFiles).toHaveBeenCalledTimes(1);
            const options = mockGlobFiles.mock.calls[0][1] as { ignore?: string[] };
            expect(options.ignore).toEqual(
              expect.arrayContaining([
                expect.stringContaining('.test.ts'),
                expect.stringContaining('.spec.ts'),
              ])
            );
          }
        ),
        { numRuns: 20 }
      );
    });

    it('each undocumented file has suggestedSpecId', async () => {
      await fc.assert(
        fc.asyncProperty(
          registryArb,
          fc.array(fileNameArb, { minLength: 1, maxLength: 5 }),
          async (registry, fileNames) => {
            mockGlobFiles.mockClear();
            mockReadFile.mockClear();
            mockReadFile.mockResolvedValue('export function fn() {}');

            const files = fileNames.map(name => `/test/project/src/${name}.ts`);
            mockGlobFiles.mockResolvedValue(files);

            const result = await findUndocumentedImplementations('/test/project', registry);

            for (const file of result.undocumented) {
              expect(file.suggestedSpecId).toBeDefined();
              expect(typeof file.suggestedSpecId).toBe('string');
              expect(file.suggestedSpecId.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('forall file in result.undocumented: suggestedSpecId starts with spec.', async () => {
      await fc.assert(
        fc.asyncProperty(
          registryArb,
          fc.array(fileNameArb, { minLength: 1, maxLength: 5 }),
          async (registry, fileNames) => {
            mockGlobFiles.mockClear();
            mockReadFile.mockClear();
            mockReadFile.mockResolvedValue('export function fn() {}');

            const files = fileNames.map(name => `/test/project/src/${name}.ts`);
            mockGlobFiles.mockResolvedValue(files);

            const result = await findUndocumentedImplementations('/test/project', registry);

            for (const file of result.undocumented) {
              expect(file.suggestedSpecId.startsWith('spec.')).toBe(true);
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
// @speccodex:property:end
