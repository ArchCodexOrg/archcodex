/**
 * @arch extension.server.service
 *
 * Wraps ArchCodex ValidationEngine for LSP server use.
 */
import * as path from 'node:path';
import { Diagnostic } from 'vscode-languageserver/node';
import { resultToDiagnostics } from './diagnostics.js';

// Import from parent archcodex package
// In production, this would be: import { ... } from 'archcodex';
import { ValidationEngine } from '../../../src/core/validation/engine.js';
import { loadConfig } from '../../../src/core/config/loader.js';
import { loadRegistry } from '../../../src/core/registry/loader.js';
import { loadPatternRegistry } from '../../../src/core/patterns/loader.js';
import type { Config } from '../../../src/core/config/schema.js';
import type { Registry } from '../../../src/core/registry/schema.js';
import type { PatternRegistry } from '../../../src/core/patterns/types.js';
import type { ValidationResult } from '../../../src/core/validation/types.js';

export interface ValidatorServiceOptions {
  projectRoot: string;
  configPath?: string;
}

/**
 * Service that manages validation engine lifecycle and provides validation.
 */
export class ValidatorService {
  private projectRoot: string;
  private configPath: string;
  private config: Config | null = null;
  private registry: Registry | null = null;
  private patternRegistry: PatternRegistry | null = null;
  private engine: ValidationEngine | null = null;
  private initialized = false;

  constructor(options: ValidatorServiceOptions) {
    this.projectRoot = options.projectRoot;
    this.configPath = options.configPath ?? '.arch/config.yaml';
  }

  /**
   * Initialize the validation engine.
   * Must be called before validation.
   */
  async initialize(): Promise<void> {
    try {
      // Load configuration
      const configFullPath = path.join(this.projectRoot, this.configPath);
      this.config = await loadConfig(this.projectRoot, configFullPath);

      // Load registry
      this.registry = await loadRegistry(this.projectRoot);

      // Load pattern registry (optional)
      try {
        this.patternRegistry = await loadPatternRegistry(this.projectRoot);
      } catch {
        // Pattern registry is optional
        this.patternRegistry = null;
      }

      // Create validation engine
      this.engine = new ValidationEngine(
        this.projectRoot,
        this.config,
        this.registry,
        this.patternRegistry ?? undefined
      );

      this.initialized = true;
    } catch (error) {
      this.initialized = false;
      throw new Error(
        `Failed to initialize ArchCodex: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Reload configuration (after config file changes).
   */
  async reload(): Promise<void> {
    if (this.engine) {
      this.engine.dispose();
    }
    this.initialized = false;
    await this.initialize();
  }

  /**
   * Check if the service is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Validate a single file and return LSP diagnostics.
   */
  async validateFile(filePath: string): Promise<Diagnostic[]> {
    if (!this.initialized || !this.engine) {
      throw new Error('ValidatorService not initialized');
    }

    try {
      // Convert URI to relative path if needed
      const relativePath = path.isAbsolute(filePath)
        ? path.relative(this.projectRoot, filePath)
        : filePath;

      // Validate the file
      const result = await this.engine.validateFile(relativePath);

      // Convert to diagnostics
      return resultToDiagnostics(result);
    } catch (error) {
      // Return error as diagnostic
      return [{
        severity: 1, // Error
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
        message: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        source: 'archcodex',
        code: 'E999',
      }];
    }
  }

  /**
   * Validate a file and return the raw result.
   */
  async validateFileRaw(filePath: string): Promise<ValidationResult | null> {
    if (!this.initialized || !this.engine) {
      return null;
    }

    try {
      const relativePath = path.isAbsolute(filePath)
        ? path.relative(this.projectRoot, filePath)
        : filePath;

      return await this.engine.validateFile(relativePath);
    } catch {
      return null;
    }
  }

  /**
   * Get the current configuration.
   */
  getConfig(): Config | null {
    return this.config;
  }

  /**
   * Get the current registry.
   */
  getRegistry(): Registry | null {
    return this.registry;
  }

  /**
   * Dispose resources.
   */
  dispose(): void {
    if (this.engine) {
      this.engine.dispose();
    }
    this.initialized = false;
  }
}
