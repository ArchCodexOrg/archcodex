/**
 * @arch archcodex.core.types
 *
 * Language validator interface definition.
 * Provides language-agnostic types for multi-language support.
 */

import type {
  SemanticModel,
  SupportedLanguage,
  LanguageCapabilities,
} from './semantic.types.js';

// Re-export for convenience
export type {
  SemanticModel,
  SupportedLanguage,
  LanguageCapabilities,
  ClassInfo,
  ImportInfo,
  DecoratorInfo,
  MethodInfo,
  InterfaceInfo,
  FunctionInfo,
  SourceLocation,
  Visibility,
} from './semantic.types.js';

/**
 * Language validator interface.
 *
 * Simplified interface that produces SemanticModel.
 * Constraints operate on SemanticModel, not language-specific AST.
 */
export interface ILanguageValidator {
  /** Languages this validator supports */
  readonly supportedLanguages: SupportedLanguage[];

  /** File extensions this validator handles */
  readonly supportedExtensions: string[];

  /** Language capabilities */
  readonly capabilities: LanguageCapabilities;

  /**
   * Parse a source file into a SemanticModel.
   * @param filePath Path to the file
   * @param content Optional pre-loaded content to avoid re-reading from disk
   */
  parseFile(filePath: string, content?: string): Promise<SemanticModel>;

  /**
   * Release resources.
   */
  dispose(): void;
}
