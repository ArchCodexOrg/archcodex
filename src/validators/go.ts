/**
 * @arch archcodex.infra.validator
 *
 * Go validator using tree-sitter AST parsing.
 * Produces SemanticModel for language-agnostic constraint validation.
 */

import * as path from 'node:path';
import Parser from 'tree-sitter';
import type { ILanguageValidator } from './interface.types.js';
import type {
  SemanticModel,
  SupportedLanguage,
  LanguageCapabilities,
} from './semantic.types.js';
import { GO_CAPABILITIES } from './capabilities.js';
import { readFile } from '../utils/file-system.js';
import {
  createGoParser,
  extractGoSemanticModel,
} from './tree-sitter/index.js';

/**
 * Go validator using tree-sitter AST parsing.
 * Produces SemanticModel for language-agnostic constraint validation.
 */
export class GoValidator implements ILanguageValidator {
  readonly supportedLanguages: SupportedLanguage[] = ['go'];
  readonly supportedExtensions = ['.go'];
  readonly capabilities: LanguageCapabilities = GO_CAPABILITIES;

  private parser: Parser;

  constructor() {
    this.parser = createGoParser();
  }

  async parseFile(filePath: string, content?: string): Promise<SemanticModel> {
    const fileContent = content ?? (await readFile(filePath));
    const extension = path.extname(filePath);
    const fileName = path.basename(filePath);

    return extractGoSemanticModel(
      this.parser,
      fileContent,
      filePath,
      fileName,
      extension
    );
  }

  dispose(): void {
    // Parser cleanup if needed
  }
}
