/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Feature engine for multi-file scaffolding.
 * Scaffolds multiple related files based on feature templates.
 */
import * as path from 'node:path';
import { fileExists } from '../../utils/file-system.js';
import type { FeatureDefinition } from '../registry/schema.js';
import type { Registry } from '../registry/schema.js';
import type { Index } from '../discovery/index.js';
import { ScaffoldEngine } from './engine.js';

/**
 * Variables for feature scaffolding.
 */
export interface FeatureVariables {
  /** Primary name (e.g., "UserValidator") */
  name: string;
  /** Additional custom variables */
  [key: string]: string;
}

/**
 * Options for scaffolding a feature.
 */
export interface FeatureScaffoldOptions {
  /** Feature definition to scaffold */
  feature: FeatureDefinition;
  /** Feature name (for reference) */
  featureName: string;
  /** Variables for template substitution */
  variables: FeatureVariables;
  /** Whether to overwrite existing files */
  overwrite?: boolean;
  /** Dry run - just return what would be created */
  dryRun?: boolean;
  /** Skip optional components */
  skipOptional?: boolean;
}

/**
 * Result for a single component scaffold.
 */
export interface ComponentResult {
  /** Component role (e.g., "constraint", "test") */
  role: string;
  /** Architecture used */
  architecture: string;
  /** Output path */
  path: string;
  /** Whether scaffold was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Whether this was skipped (optional component) */
  skipped?: boolean;
}

/**
 * Result for the entire feature scaffold.
 */
export interface FeatureScaffoldResult {
  /** Feature name */
  featureName: string;
  /** Overall success */
  success: boolean;
  /** Results for each component */
  components: ComponentResult[];
  /** Checklist items for manual steps */
  checklist: string[];
  /** Error message if overall failure */
  error?: string;
}

/**
 * Feature engine for multi-file scaffolding.
 */
export class FeatureEngine {
  private projectRoot: string;
  private scaffoldEngine: ScaffoldEngine;

  constructor(projectRoot: string, templateDir?: string, registry?: Registry) {
    this.projectRoot = projectRoot;
    this.scaffoldEngine = new ScaffoldEngine(projectRoot, templateDir, registry);
  }

  /**
   * Scaffold all components of a feature.
   */
  async scaffoldFeature(
    options: FeatureScaffoldOptions,
    index?: Index
  ): Promise<FeatureScaffoldResult> {
    const { feature, featureName, variables, overwrite, dryRun, skipOptional } = options;

    const results: ComponentResult[] = [];
    let hasError = false;

    for (const component of feature.components) {
      // Skip optional components if requested
      if (skipOptional && component.optional) {
        results.push({
          role: component.role,
          architecture: component.architecture,
          path: this.interpolatePath(component.path, variables),
          success: true,
          skipped: true,
        });
        continue;
      }

      const outputPath = this.interpolatePath(component.path, variables);

      // Dry run - just check if would work
      if (dryRun) {
        const exists = await fileExists(path.resolve(this.projectRoot, outputPath));
        results.push({
          role: component.role,
          architecture: component.architecture,
          path: outputPath,
          success: !exists || overwrite === true,
          error: exists && !overwrite ? 'File already exists' : undefined,
        });
        continue;
      }

      // Actually scaffold
      const result = await this.scaffoldEngine.scaffold(
        {
          archId: component.architecture,
          name: variables.name,
          outputPath: path.dirname(outputPath),
          template: component.template,
          variables: this.buildVariables(variables, feature.shared_variables),
          overwrite,
        },
        index
      );

      if (!result.success) {
        hasError = true;
      }

      results.push({
        role: component.role,
        architecture: component.architecture,
        path: result.filePath || outputPath,
        success: result.success,
        error: result.error,
      });
    }

    return {
      featureName,
      success: !hasError,
      components: results,
      checklist: feature.checklist || [],
      error: hasError ? 'One or more components failed to scaffold' : undefined,
    };
  }

  /**
   * Interpolate path placeholders.
   */
  private interpolatePath(pathTemplate: string, variables: FeatureVariables): string {
    let result = pathTemplate;

    for (const [key, value] of Object.entries(variables)) {
      // Support ${name}, ${variableName} syntax
      const pattern = new RegExp(`\\$\\{${key}\\}`, 'g');
      result = result.replace(pattern, value);
    }

    // Also support lowercase version (${name} matches both name and NAME)
    if (variables.name) {
      result = result.replace(/\$\{name\}/g, variables.name);
      result = result.replace(/\$\{NAME\}/g, variables.name);
    }

    return result;
  }

  /**
   * Build combined variables from input and shared.
   */
  private buildVariables(
    variables: FeatureVariables,
    sharedVariables?: Record<string, string>
  ): Record<string, string> {
    const result: Record<string, string> = {};

    // Add shared variables first (can be overridden)
    if (sharedVariables) {
      for (const [key, value] of Object.entries(sharedVariables)) {
        // Interpolate shared variables with feature variables
        result[key] = this.interpolatePath(value, variables);
      }
    }

    // Add input variables (override shared)
    for (const [key, value] of Object.entries(variables)) {
      result[key.toUpperCase()] = value;
    }

    return result;
  }

  /**
   * Get a preview of what files would be created.
   */
  async previewFeature(
    feature: FeatureDefinition,
    _featureName: string,
    variables: FeatureVariables
  ): Promise<{ components: Array<{ role: string; architecture: string; path: string; exists: boolean; optional: boolean }> }> {
    const components: Array<{ role: string; architecture: string; path: string; exists: boolean; optional: boolean }> = [];

    for (const component of feature.components) {
      const outputPath = this.interpolatePath(component.path, variables);
      const fullPath = path.resolve(this.projectRoot, outputPath);
      const exists = await fileExists(fullPath);

      components.push({
        role: component.role,
        architecture: component.architecture,
        path: outputPath,
        exists,
        optional: component.optional || false,
      });
    }

    return { components };
  }
}
