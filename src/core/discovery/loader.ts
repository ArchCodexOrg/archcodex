/**
 * @arch archcodex.core.domain
 */
import * as path from 'node:path';
import { IndexSchema, type Index } from './schema.js';
import { DecisionTreeSchema, validateDecisionTree, type DecisionTree } from './decision-tree.js';
import { loadYamlWithSchema, fileExists } from '../../utils/index.js';
import { SystemError, ErrorCodes } from '../../utils/errors.js';

const DEFAULT_INDEX_PATH = '.arch/index.yaml';
const DEFAULT_DECISION_TREE_PATH = '.arch/decision-tree.yaml';

/**
 * Load index from a file.
 */
export async function loadIndex(
  projectRoot: string,
  indexPath?: string
): Promise<Index> {
  const fullPath = indexPath
    ? path.resolve(projectRoot, indexPath)
    : path.resolve(projectRoot, DEFAULT_INDEX_PATH);

  const exists = await fileExists(fullPath);

  if (!exists) {
    // Return empty index if file doesn't exist
    return { version: '1.0', entries: [] };
  }

  try {
    return await loadYamlWithSchema(fullPath, IndexSchema);
  } catch (error) {
    if (error instanceof Error) {
      throw new SystemError(
        ErrorCodes.PARSE_ERROR,
        `Failed to load index from ${fullPath}: ${error.message}`,
        { path: fullPath, originalError: error.message }
      );
    }
    throw error;
  }
}

/**
 * Get the expected index file path for a project.
 */
export function getIndexPath(projectRoot: string): string {
  return path.resolve(projectRoot, DEFAULT_INDEX_PATH);
}

/**
 * Check if an index file exists in the project.
 */
export async function indexExists(projectRoot: string): Promise<boolean> {
  return fileExists(getIndexPath(projectRoot));
}

/**
 * Load decision tree from a file.
 */
export async function loadDecisionTree(
  projectRoot: string,
  treePath?: string
): Promise<DecisionTree | null> {
  const fullPath = treePath
    ? path.resolve(projectRoot, treePath)
    : path.resolve(projectRoot, DEFAULT_DECISION_TREE_PATH);

  const exists = await fileExists(fullPath);

  if (!exists) {
    return null;
  }

  try {
    const tree = await loadYamlWithSchema(fullPath, DecisionTreeSchema);

    // Validate tree structure
    const errors = validateDecisionTree(tree);
    if (errors.length > 0) {
      throw new SystemError(
        ErrorCodes.INVALID_REGISTRY,
        `Invalid decision tree: ${errors.join(', ')}`,
        { path: fullPath, errors }
      );
    }

    return tree;
  } catch (error) {
    if (error instanceof SystemError) {
      throw error;
    }
    if (error instanceof Error) {
      throw new SystemError(
        ErrorCodes.PARSE_ERROR,
        `Failed to load decision tree from ${fullPath}: ${error.message}`,
        { path: fullPath, originalError: error.message }
      );
    }
    throw error;
  }
}

/**
 * Get the expected decision tree file path for a project.
 */
export function getDecisionTreePath(projectRoot: string): string {
  return path.resolve(projectRoot, DEFAULT_DECISION_TREE_PATH);
}

/**
 * Check if a decision tree file exists in the project.
 */
export async function decisionTreeExists(projectRoot: string): Promise<boolean> {
  return fileExists(getDecisionTreePath(projectRoot));
}
