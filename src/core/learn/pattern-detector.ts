/**
 * @arch archcodex.core.domain
 *
 * Pattern detection utilities for codebase analysis.
 */
import * as path from 'node:path';
import type {
  ModuleSummary,
  DetectedPatterns,
} from './types.js';

/**
 * Detect patterns and conventions in the codebase.
 */
export function detectPatterns(files: string[], modules: ModuleSummary[]): DetectedPatterns {
  // Naming conventions
  const namingPatterns = new Set<string>();
  for (const file of files) {
    const filename = path.basename(file);
    const match = filename.match(/\.([a-z]+(?:\.[a-z]+)?)\.ts$/);
    if (match) {
      namingPatterns.add(`*.${match[1]}.ts`);
    }
  }

  // Directory layers
  const directoryLayers = new Set<string>();
  for (const file of files) {
    const parts = file.split('/');
    if (parts.length >= 2) {
      directoryLayers.add(parts.slice(0, 2).join('/'));
    }
  }

  // Framework hints from imports
  const frameworkHints = new Set<string>();

  for (const module of modules) {
    // Infer from class decorators and patterns
    for (const cls of module.classes || []) {
      for (const decorator of cls.decorators) {
        if (decorator === 'Injectable' || decorator === 'Controller') {
          frameworkHints.add('nest');
        }
        if (decorator === 'Component') {
          frameworkHints.add('angular');
        }
      }
    }
  }

  // Import patterns
  const importPatterns = new Set<string>();
  for (const module of modules) {
    for (const imp of module.imports) {
      // Detect common patterns like "../core/" imports
      const match = imp.match(/\.\.\/([a-z]+)\//);
      if (match) {
        importPatterns.add(`../${match[1]}/*`);
      }
    }
  }

  return {
    namingConventions: Array.from(namingPatterns),
    directoryLayers: Array.from(directoryLayers),
    importPatterns: Array.from(importPatterns),
    frameworkHints: Array.from(frameworkHints),
  };
}

/**
 * Suggest a human-readable name for a cluster.
 */
export function suggestClusterName(pattern: string): string {
  const parts = pattern.split('/');
  const last = parts[parts.length - 1];

  // Common layer names
  const layerNames: Record<string, string> = {
    cli: 'CLI Layer',
    core: 'Core Domain',
    infra: 'Infrastructure',
    utils: 'Utilities',
    util: 'Utilities',
    validators: 'Validators',
    llm: 'LLM Integration',
    security: 'Security',
    api: 'API Layer',
    services: 'Services',
    controllers: 'Controllers',
    models: 'Models',
    components: 'Components',
  };

  return layerNames[last] || `${last.charAt(0).toUpperCase()}${last.slice(1)} Module`;
}
