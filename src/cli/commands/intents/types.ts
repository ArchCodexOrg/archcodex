/**
 * @arch archcodex.core.types
 *
 * Shared types for intent CLI commands.
 */
import type { IntentRegistry } from '../../../core/registry/schema.js';
import type { Config } from '../../../core/config/schema.js';

export interface IntentsOptions {
  config: string;
  list?: boolean;
  show?: string;
  usage?: boolean;
  validate?: boolean;
  json?: boolean;
}

export interface IntentsContext {
  projectRoot: string;
  config: Config;
  registry: IntentRegistry;
  json?: boolean;
}

export interface ValidationIssue {
  file: string;
  intent: string;
  type: 'undefined' | 'missing_pattern' | 'forbidden_pattern' | 'conflict';
  message: string;
}
