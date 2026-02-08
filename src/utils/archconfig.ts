/**
 * @arch archcodex.infra.config
 *
 * Loader for .archconfig credentials file.
 * Supports loading API keys from ~/.archconfig or .archconfig in project root.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { resolve, join } from 'path';

/**
 * Configuration loaded from .archconfig
 */
export interface ArchConfig {
  /** OpenAI API key */
  openai_api_key?: string;
  /** Anthropic API key */
  anthropic_api_key?: string;
  [key: string]: string | undefined;
}

/**
 * Parse a dotenv-style config file.
 * Supports KEY=value format, with optional quotes.
 */
function parseConfigFile(content: string): ArchConfig {
  const config: ArchConfig = {};
  const lines = content.split('\n');

  for (const line of lines) {
    // Skip comments and empty lines
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Parse KEY=value
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim().toLowerCase();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    config[key] = value;
  }

  return config;
}

/**
 * Load .archconfig from the filesystem.
 * Checks in order:
 * 1. .archconfig in project root
 * 2. ~/.archconfig in home directory
 *
 * Values from project root take precedence.
 */
export async function loadArchConfig(projectRoot?: string): Promise<ArchConfig> {
  const config: ArchConfig = {};

  // Check home directory first (lower priority)
  const homeConfig = join(homedir(), '.archconfig');
  if (existsSync(homeConfig)) {
    try {
      const content = await readFile(homeConfig, 'utf-8');
      Object.assign(config, parseConfigFile(content));
    } catch { /* ignore errors reading home config */ }
  }

  // Check project root (higher priority, overrides home)
  if (projectRoot) {
    const projectConfig = resolve(projectRoot, '.archconfig');
    if (existsSync(projectConfig)) {
      try {
        const content = await readFile(projectConfig, 'utf-8');
        Object.assign(config, parseConfigFile(content));
      } catch { /* ignore errors reading project config */ }
    }
  }

  return config;
}

/**
 * Get an API key from archconfig or environment.
 * Checks archconfig first, then falls back to environment variable.
 */
export function getApiKey(
  config: ArchConfig,
  provider: 'openai' | 'anthropic' | 'mistral'
): string | undefined {
  const configKey = `${provider}_api_key`;
  const envKey = `${provider.toUpperCase()}_API_KEY`;

  // Check archconfig first
  if (config[configKey]) {
    return config[configKey];
  }

  // Fall back to environment variable
  return process.env[envKey];
}

/**
 * Synchronously check if .archconfig exists.
 */
export function archConfigExists(projectRoot?: string): boolean {
  const homeConfig = join(homedir(), '.archconfig');
  if (existsSync(homeConfig)) return true;

  if (projectRoot) {
    const projectConfig = resolve(projectRoot, '.archconfig');
    if (existsSync(projectConfig)) return true;
  }

  return false;
}

