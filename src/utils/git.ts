/**
 * @arch archcodex.infra.git
 *
 * Git integration utilities for pre-commit hooks.
 * Provides staged file detection and git state queries.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execAsync = promisify(exec);

/**
 * Get list of staged files (files added to git index).
 * Returns relative paths from the project root.
 *
 * @param projectRoot - Root directory of the project
 * @returns Array of relative file paths that are staged
 */
export async function getStagedFiles(projectRoot: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync('git diff --cached --name-only --diff-filter=ACMR', {
      cwd: projectRoot,
      encoding: 'utf-8',
    });

    if (!stdout.trim()) {
      return [];
    }

    return stdout
      .trim()
      .split('\n')
      .filter(line => line.length > 0);
  } catch {
    // Not a git repo or git command failed
    return [];
  }
}

/**
 * Get list of modified files (staged + unstaged changes).
 * Returns relative paths from the project root.
 *
 * @param projectRoot - Root directory of the project
 * @returns Array of relative file paths that have changes
 */
export async function getModifiedFiles(projectRoot: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync('git diff --name-only --diff-filter=ACMR HEAD', {
      cwd: projectRoot,
      encoding: 'utf-8',
    });

    if (!stdout.trim()) {
      return [];
    }

    return stdout
      .trim()
      .split('\n')
      .filter(line => line.length > 0);
  } catch {
    return [];
  }
}

/**
 * Check if the current directory is inside a git repository.
 *
 * @param projectRoot - Root directory to check
 * @returns True if inside a git repo
 */
export async function isGitRepository(projectRoot: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --git-dir', {
      cwd: projectRoot,
      encoding: 'utf-8',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current branch name.
 *
 * @param projectRoot - Root directory of the project
 * @returns Branch name or null if not in a git repo
 */
export async function getCurrentBranch(projectRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectRoot,
      encoding: 'utf-8',
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Convert relative paths to absolute paths.
 *
 * @param projectRoot - Root directory
 * @param relativePaths - Array of relative paths
 * @returns Array of absolute paths
 */
export function toAbsolutePaths(projectRoot: string, relativePaths: string[]): string[] {
  return relativePaths.map(relPath => join(projectRoot, relPath));
}
