/**
 * @arch archcodex.core.domain
 * @intent:registry-infrastructure
 *
 * Feature registry loader - load and query features.
 */
import * as path from 'node:path';
import {
  FeatureRegistrySchema,
  type FeatureRegistry,
  type FeatureDefinition,
} from './schema.js';
import { loadYamlWithSchema, fileExists } from '../../utils/index.js';
import { RegistryError, ErrorCodes } from '../../utils/errors.js';

const DEFAULT_REGISTRY_DIR = '.arch/registry';
const DEFAULT_FEATURES_FILE = '_features.yaml';

/**
 * Load feature registry from _features.yaml.
 * Returns an empty registry if file doesn't exist.
 */
export async function loadFeatureRegistry(projectRoot: string): Promise<FeatureRegistry> {
  const dirPath = path.resolve(projectRoot, DEFAULT_REGISTRY_DIR);
  const featuresPath = path.join(dirPath, DEFAULT_FEATURES_FILE);

  if (!(await fileExists(featuresPath))) {
    // Return empty registry if no features file
    return { features: {} };
  }

  try {
    return await loadYamlWithSchema(featuresPath, FeatureRegistrySchema);
  } catch (error) {
    if (error instanceof RegistryError) {
      throw error;
    }
    if (error instanceof Error) {
      throw new RegistryError(
        ErrorCodes.INVALID_REGISTRY,
        `Failed to load feature registry from ${featuresPath}: ${error.message}`,
        { path: featuresPath, originalError: error.message }
      );
    }
    throw error;
  }
}

/**
 * Check if a feature exists in the registry.
 */
export function hasFeature(featureRegistry: FeatureRegistry, featureName: string): boolean {
  return featureName in featureRegistry.features;
}

/**
 * Get all feature names from the registry.
 */
export function listFeatureNames(featureRegistry: FeatureRegistry): string[] {
  return Object.keys(featureRegistry.features);
}

/**
 * Get a feature definition by name.
 */
export function getFeature(featureRegistry: FeatureRegistry, featureName: string): FeatureDefinition | undefined {
  return featureRegistry.features[featureName];
}

/**
 * Find a feature that is triggered by a specific action.
 */
export function findFeatureByAction(featureRegistry: FeatureRegistry, actionName: string): FeatureDefinition | undefined {
  for (const feature of Object.values(featureRegistry.features)) {
    if (feature.triggered_by_action === actionName) {
      return feature;
    }
  }
  return undefined;
}
