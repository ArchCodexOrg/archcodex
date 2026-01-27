/**
 * @arch archcodex.core.domain
 */
import * as path from 'node:path';
import { ConfigSchema, type Config } from './schema.js';
import { loadYamlWithSchema, fileExists } from '../../utils/index.js';
import { ConfigError } from '../../utils/errors.js';

const DEFAULT_CONFIG_PATH = '.arch/config.yaml';

/**
 * Default configuration values.
 * Used when no config file exists.
 */
export function getDefaultConfig(): Config {
  return ConfigSchema.parse({});
}

/**
 * Load configuration from a file.
 * Falls back to defaults if the file doesn't exist.
 */
export async function loadConfig(
  projectRoot: string,
  configPath?: string
): Promise<Config> {
  const fullPath = configPath
    ? path.resolve(projectRoot, configPath)
    : path.resolve(projectRoot, DEFAULT_CONFIG_PATH);

  const exists = await fileExists(fullPath);

  if (!exists) {
    // Return default config if file doesn't exist
    return getDefaultConfig();
  }

  try {
    return await loadYamlWithSchema(fullPath, ConfigSchema);
  } catch (error) {
    if (error instanceof Error) {
      throw new ConfigError(
        'CONFIG_LOAD_ERROR',
        `Failed to load config from ${fullPath}: ${error.message}`,
        { path: fullPath, originalError: error.message }
      );
    }
    throw error;
  }
}

/**
 * Merge partial config with defaults.
 */
export function mergeConfig(partial: Partial<Config>): Config {
  // Use Zod to parse and apply defaults
  return ConfigSchema.parse(partial);
}

/**
 * Get the expected config file path for a project.
 */
export function getConfigPath(projectRoot: string): string {
  return path.resolve(projectRoot, DEFAULT_CONFIG_PATH);
}

/**
 * Check if a config file exists in the project.
 */
export async function configExists(projectRoot: string): Promise<boolean> {
  return fileExists(getConfigPath(projectRoot));
}
