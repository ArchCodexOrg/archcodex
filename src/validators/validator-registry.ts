/**
 * @arch archcodex.core.domain
 *
 * Validator registry for managing language validators.
 * Supports plugin architecture for adding new language support.
 */

import type { SupportedLanguage, LanguageCapabilities } from './semantic.types.js';
import type { ILanguageValidator } from './interface.types.js';
import { getLanguageCapabilities } from './capabilities.js';

// Re-export for convenience
export type { ILanguageValidator } from './interface.types.js';

/**
 * Factory function for creating validators.
 * Used for lazy instantiation.
 */
export type ValidatorFactory = () => ILanguageValidator;

/**
 * Validator registration info.
 */
interface ValidatorRegistration {
  factory: ValidatorFactory;
  languages: SupportedLanguage[];
  extensions: string[];
  capabilities: LanguageCapabilities;
  instance?: ILanguageValidator;
}

/**
 * Registry for language validators.
 * Singleton pattern - one registry for the application.
 */
class ValidatorRegistry {
  private registrations = new Map<string, ValidatorRegistration>();
  private extensionMap = new Map<string, string>();

  /**
   * Register a language validator.
   *
   * @param id Unique identifier for the validator (e.g., 'typescript', 'python')
   * @param factory Factory function to create the validator
   * @param languages Languages this validator supports
   * @param extensions File extensions this validator handles
   * @param capabilities Language capabilities
   */
  register(
    id: string,
    factory: ValidatorFactory,
    languages: SupportedLanguage[],
    extensions: string[],
    capabilities?: LanguageCapabilities
  ): void {
    const caps = capabilities ?? getLanguageCapabilities(languages[0]);

    this.registrations.set(id, {
      factory,
      languages,
      extensions,
      capabilities: caps,
    });

    // Map extensions to validator ID
    for (const ext of extensions) {
      this.extensionMap.set(ext.toLowerCase(), id);
    }
  }

  /**
   * Get a validator for a specific file extension.
   * Returns null if no validator is registered for the extension.
   */
  getForExtension(extension: string): ILanguageValidator | null {
    const ext = extension.toLowerCase();
    const id = this.extensionMap.get(ext);

    if (!id) {
      return null;
    }

    return this.getById(id);
  }

  /**
   * Get a validator by ID.
   * Creates the instance lazily if not already created.
   */
  getById(id: string): ILanguageValidator | null {
    const registration = this.registrations.get(id);

    if (!registration) {
      return null;
    }

    // Lazy instantiation
    if (!registration.instance) {
      registration.instance = registration.factory();
    }

    return registration.instance;
  }

  /**
   * Get capabilities for a file extension.
   */
  getCapabilitiesForExtension(extension: string): LanguageCapabilities | null {
    const ext = extension.toLowerCase();
    const id = this.extensionMap.get(ext);

    if (!id) {
      return null;
    }

    const registration = this.registrations.get(id);
    return registration?.capabilities ?? null;
  }

  /**
   * Check if a file extension is supported.
   */
  isSupported(extension: string): boolean {
    return this.extensionMap.has(extension.toLowerCase());
  }

  /**
   * Get all supported extensions.
   */
  getSupportedExtensions(): string[] {
    return Array.from(this.extensionMap.keys());
  }

  /**
   * Get all registered validator IDs.
   */
  getRegisteredValidators(): string[] {
    return Array.from(this.registrations.keys());
  }

  /**
   * Dispose all validator instances.
   */
  disposeAll(): void {
    for (const registration of this.registrations.values()) {
      if (registration.instance) {
        registration.instance.dispose();
        registration.instance = undefined;
      }
    }
  }

  /**
   * Clear all registrations.
   * Mainly for testing.
   */
  clear(): void {
    this.disposeAll();
    this.registrations.clear();
    this.extensionMap.clear();
  }
}

/**
 * Global validator registry instance.
 */
export const validatorRegistry = new ValidatorRegistry();
