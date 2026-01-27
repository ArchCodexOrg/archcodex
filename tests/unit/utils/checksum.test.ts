/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for checksum utility.
 */
import { describe, it, expect } from 'vitest';
import { computeChecksum, verifyChecksum } from '../../../src/utils/checksum.js';

describe('computeChecksum', () => {
  it('should compute a 16-character checksum', () => {
    const checksum = computeChecksum('test content');
    expect(checksum).toHaveLength(16);
  });

  it('should return consistent checksum for same content', () => {
    const content = 'hello world';
    const checksum1 = computeChecksum(content);
    const checksum2 = computeChecksum(content);
    expect(checksum1).toBe(checksum2);
  });

  it('should return different checksum for different content', () => {
    const checksum1 = computeChecksum('content A');
    const checksum2 = computeChecksum('content B');
    expect(checksum1).not.toBe(checksum2);
  });

  it('should be case sensitive', () => {
    const checksum1 = computeChecksum('Hello');
    const checksum2 = computeChecksum('hello');
    expect(checksum1).not.toBe(checksum2);
  });

  it('should handle empty string', () => {
    const checksum = computeChecksum('');
    expect(checksum).toHaveLength(16);
  });

  it('should handle multiline content', () => {
    const content = `line 1
line 2
line 3`;
    const checksum = computeChecksum(content);
    expect(checksum).toHaveLength(16);
  });
});

describe('verifyChecksum', () => {
  it('should return true for matching checksum', () => {
    const content = 'test content';
    const checksum = computeChecksum(content);
    expect(verifyChecksum(content, checksum)).toBe(true);
  });

  it('should return false for non-matching checksum', () => {
    const content = 'test content';
    const wrongChecksum = 'wrongchecksum123';
    expect(verifyChecksum(content, wrongChecksum)).toBe(false);
  });

  it('should return false when content has changed', () => {
    const originalContent = 'original';
    const checksum = computeChecksum(originalContent);
    const modifiedContent = 'modified';
    expect(verifyChecksum(modifiedContent, checksum)).toBe(false);
  });
});
