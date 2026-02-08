/**
 * Test fixture: function that imports type from node_modules (should not resolve)
 */
import type { Project } from 'ts-morph';

export function createProject(): Project {
  return {} as Project;
}
