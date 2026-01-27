/**
 * @arch archcodex.infra.validator-support
 *
 * Language capabilities definitions.
 * Each language has different features that affect which constraints apply.
 */

import type { LanguageCapabilities, SupportedLanguage } from './semantic.types.js';

/**
 * TypeScript/JavaScript capabilities.
 */
export const TYPESCRIPT_CAPABILITIES: LanguageCapabilities = {
  hasClassInheritance: true,
  hasInterfaces: true,
  hasDecorators: true,
  hasVisibilityModifiers: true,
};

/**
 * JavaScript capabilities (same as TypeScript for our purposes).
 */
export const JAVASCRIPT_CAPABILITIES: LanguageCapabilities = {
  hasClassInheritance: true,
  hasInterfaces: false, // JS has no interfaces
  hasDecorators: true,  // Stage 3 decorators
  hasVisibilityModifiers: true, // # private fields
};

/**
 * Python capabilities.
 * Note: Python uses ABC/Protocol for interfaces, decorators are native.
 */
export const PYTHON_CAPABILITIES: LanguageCapabilities = {
  hasClassInheritance: true,
  hasInterfaces: true,  // ABC, Protocol
  hasDecorators: true,
  hasVisibilityModifiers: false, // Convention only (_underscore)
};

/**
 * Go capabilities.
 * Note: Go uses struct embedding (not inheritance), implicit interfaces, no decorators.
 */
export const GO_CAPABILITIES: LanguageCapabilities = {
  hasClassInheritance: true,  // Struct embedding maps to extends in semantic model
  hasInterfaces: true,        // Implicit/structural interfaces
  hasDecorators: false,       // No decorators
  hasVisibilityModifiers: true, // Exported (uppercase) vs unexported
};

/**
 * Java capabilities.
 */
export const JAVA_CAPABILITIES: LanguageCapabilities = {
  hasClassInheritance: true,
  hasInterfaces: true,
  hasDecorators: true,  // Annotations
  hasVisibilityModifiers: true,
};

/**
 * Get capabilities for a language.
 */
export function getLanguageCapabilities(language: SupportedLanguage): LanguageCapabilities {
  switch (language) {
    case 'typescript':
      return TYPESCRIPT_CAPABILITIES;
    case 'javascript':
      return JAVASCRIPT_CAPABILITIES;
    case 'python':
      return PYTHON_CAPABILITIES;
    case 'go':
      return GO_CAPABILITIES;
    case 'java':
      return JAVA_CAPABILITIES;
    default:
      // Default to TypeScript capabilities for unknown languages
      return TYPESCRIPT_CAPABILITIES;
  }
}

/**
 * Check if a constraint type applies to a language.
 */
export function constraintAppliesTo(
  constraintRule: string,
  language: SupportedLanguage
): boolean {
  const caps = getLanguageCapabilities(language);

  switch (constraintRule) {
    case 'must_extend':
      return caps.hasClassInheritance;
    case 'implements':
      return caps.hasInterfaces;
    case 'require_decorator':
    case 'forbid_decorator':
      return caps.hasDecorators;
    case 'max_public_methods':
      return true; // All languages can count methods regardless of visibility modifiers
    default:
      // All other constraints apply to all languages
      return true;
  }
}
