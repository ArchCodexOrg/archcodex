/**
 * @arch archcodex.test.unit
 *
 * Tests for spec types and shared helpers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveOutputPath } from '../../../../../src/cli/commands/spec/types.js';

vi.mock('../../../../../src/utils/file-system.js', () => ({
  ensureDir: vi.fn(),
}));

describe('resolveOutputPath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns file path as-is when not a directory', async () => {
    const result = await resolveOutputPath('output/test.ts', 'spec.test', 'unit');
    expect(result).toBe('output/test.ts');
  });

  it('generates filename for directory-like path ending with /', async () => {
    const result = await resolveOutputPath('output/', 'spec.test.create', 'unit');
    expect(result).toContain('spec-test-create');
    expect(result).toContain('.unit.test.ts');
  });

  it('generates .md extension for docs type', async () => {
    const result = await resolveOutputPath('output/', 'spec.test', 'docs');
    expect(result).toContain('.docs.md');
  });
});
