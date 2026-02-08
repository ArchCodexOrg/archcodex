/**
 * @arch archcodex.infra.git
 *
 * Git integration utilities for pre-commit hooks.
 * Provides staged file detection and git state queries.
 */

import { exec, execFileSync } from 'child_process';
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
  } catch { /* not a git repo or git command failed */
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
  } catch { /* not a git repo */
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
  } catch { /* not a git repo */
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
  } catch { /* not a git repo */
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

/** Default timeout for git commands in milliseconds */
const GIT_COMMAND_TIMEOUT_MS = 10000;

/**
 * Get the current git commit hash (synchronous).
 *
 * @param projectRoot - Root directory of the project
 * @returns Commit hash (40 char hex string) or null if not in a git repo or git unavailable
 * @throws Never throws - returns null on any error
 */
export function getGitCommitHash(projectRoot: string): string | null {
  try {
    const result = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: GIT_COMMAND_TIMEOUT_MS,
    });
    return result.trim() || null;
  } catch { /* not a git repo or git unavailable */
    return null;
  }
}

/**
 * Get files changed since a specific commit (synchronous).
 *
 * @param projectRoot - Root directory of the project
 * @param sinceCommit - Commit hash to compare against (must be valid commit in repo)
 * @returns Object with added, modified, and deleted file arrays (paths relative to projectRoot)
 * @throws Never throws - returns empty arrays on any error (invalid commit, not a git repo, etc.)
 */
export function getChangedFilesSinceCommit(
  projectRoot: string,
  sinceCommit: string
): { added: string[]; modified: string[]; deleted: string[] } {
  try {
    // Get added files
    const addedResult = execFileSync(
      'git',
      ['diff', '--name-only', '--diff-filter=A', `${sinceCommit}..HEAD`],
      { cwd: projectRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: GIT_COMMAND_TIMEOUT_MS }
    );
    const added = addedResult.trim() ? addedResult.trim().split('\n') : [];

    // Get modified files
    const modifiedResult = execFileSync(
      'git',
      ['diff', '--name-only', '--diff-filter=M', `${sinceCommit}..HEAD`],
      { cwd: projectRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: GIT_COMMAND_TIMEOUT_MS }
    );
    const modified = modifiedResult.trim() ? modifiedResult.trim().split('\n') : [];

    // Get deleted files
    const deletedResult = execFileSync(
      'git',
      ['diff', '--name-only', '--diff-filter=D', `${sinceCommit}..HEAD`],
      { cwd: projectRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: GIT_COMMAND_TIMEOUT_MS }
    );
    const deleted = deletedResult.trim() ? deletedResult.trim().split('\n') : [];

    return { added, modified, deleted };
  } catch { /* invalid commit, not a git repo, or git unavailable */
    return { added: [], modified: [], deleted: [] };
  }
}
