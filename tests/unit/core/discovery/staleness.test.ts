/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for index staleness detection.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { checkIndexStaleness, getStalenessMessage } from '../../../../src/core/discovery/staleness.js';
import { computeChecksum } from '../../../../src/utils/checksum.js';

describe('checkIndexStaleness', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'archcodex-staleness-'));
    await fs.mkdir(path.join(tmpDir, '.arch'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should return not stale if registry does not exist', async () => {
    const result = await checkIndexStaleness(tmpDir);
    expect(result.isStale).toBe(false);
  });

  it('should return stale with no_index if index does not exist', async () => {
    const registryContent = `
test.arch:
  rationale: Test architecture
`;
    await fs.writeFile(path.join(tmpDir, '.arch/registry.yaml'), registryContent);

    const result = await checkIndexStaleness(tmpDir);
    expect(result.isStale).toBe(true);
    expect(result.reason).toBe('no_index');
  });

  it('should return stale with no_checksum for legacy index', async () => {
    const registryContent = `
test.arch:
  rationale: Test architecture
`;
    const indexContent = `
version: "1.0"
entries:
  - arch_id: test.arch
    keywords: [test]
`;
    await fs.writeFile(path.join(tmpDir, '.arch/registry.yaml'), registryContent);
    await fs.writeFile(path.join(tmpDir, '.arch/index.yaml'), indexContent);

    const result = await checkIndexStaleness(tmpDir);
    expect(result.isStale).toBe(true);
    expect(result.reason).toBe('no_checksum');
  });

  it('should return stale with checksum_mismatch when registry changed', async () => {
    const registryContent = `
test.arch:
  rationale: Test architecture
`;
    const oldChecksum = computeChecksum('old content');
    const indexContent = `
version: "1.0"
registry_checksum: "${oldChecksum}"
entries:
  - arch_id: test.arch
    keywords: [test]
`;
    await fs.writeFile(path.join(tmpDir, '.arch/registry.yaml'), registryContent);
    await fs.writeFile(path.join(tmpDir, '.arch/index.yaml'), indexContent);

    const result = await checkIndexStaleness(tmpDir);
    expect(result.isStale).toBe(true);
    expect(result.reason).toBe('checksum_mismatch');
    expect(result.storedChecksum).toBe(oldChecksum);
    expect(result.currentChecksum).not.toBe(oldChecksum);
  });

  it('should return not stale when checksum matches', async () => {
    const registryContent = `
test.arch:
  rationale: Test architecture
`;
    const checksum = computeChecksum(registryContent);
    const indexContent = `
version: "1.0"
registry_checksum: "${checksum}"
entries:
  - arch_id: test.arch
    keywords: [test]
`;
    await fs.writeFile(path.join(tmpDir, '.arch/registry.yaml'), registryContent);
    await fs.writeFile(path.join(tmpDir, '.arch/index.yaml'), indexContent);

    const result = await checkIndexStaleness(tmpDir);
    expect(result.isStale).toBe(false);
  });

  it('should detect missing architectures even with matching checksum', async () => {
    const registryContent = `
test.arch:
  rationale: Test architecture
new.arch:
  rationale: New architecture
`;
    const checksum = computeChecksum(registryContent);
    // Index only has test.arch, missing new.arch
    const indexContent = `
version: "1.0"
registry_checksum: "${checksum}"
entries:
  - arch_id: test.arch
    keywords: [test]
`;
    await fs.writeFile(path.join(tmpDir, '.arch/registry.yaml'), registryContent);
    await fs.writeFile(path.join(tmpDir, '.arch/index.yaml'), indexContent);

    const result = await checkIndexStaleness(tmpDir);
    expect(result.isStale).toBe(true);
    expect(result.reason).toBe('missing_architectures');
    expect(result.missingArchIds).toContain('new.arch');
  });
});

describe('getStalenessMessage', () => {
  it('should return up to date message when not stale', () => {
    const message = getStalenessMessage({
      isStale: false,
      currentChecksum: 'abc123',
    });
    expect(message).toBe('Index is up to date.');
  });

  it('should return appropriate message for no_index', () => {
    const message = getStalenessMessage({
      isStale: true,
      reason: 'no_index',
      currentChecksum: 'abc123',
    });
    expect(message).toContain('does not exist');
    expect(message).toContain('sync-index');
  });

  it('should return appropriate message for no_checksum', () => {
    const message = getStalenessMessage({
      isStale: true,
      reason: 'no_checksum',
      currentChecksum: 'abc123',
    });
    expect(message).toContain('missing checksum');
    expect(message).toContain('legacy');
  });

  it('should return appropriate message for checksum_mismatch', () => {
    const message = getStalenessMessage({
      isStale: true,
      reason: 'checksum_mismatch',
      currentChecksum: 'abc123',
      storedChecksum: 'old123',
    });
    expect(message).toContain('modified');
  });

  it('should return appropriate message for missing_architectures', () => {
    const message = getStalenessMessage({
      isStale: true,
      reason: 'missing_architectures',
      currentChecksum: 'abc123',
      missingArchIds: ['arch1', 'arch2'],
    });
    expect(message).toContain('missing');
    expect(message).toContain('2');
  });
});
