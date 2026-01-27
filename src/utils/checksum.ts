/**
 * @arch archcodex.util
 *
 * SHA-256 checksum utility for detecting file changes.
 */
import { createHash } from 'node:crypto';

/**
 * Compute a SHA-256 checksum of the given content.
 * Returns the first 16 characters of the hex digest for brevity.
 */
export function computeChecksum(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Verify if a stored checksum matches the current content.
 */
export function verifyChecksum(content: string, storedChecksum: string): boolean {
  return computeChecksum(content) === storedChecksum;
}
