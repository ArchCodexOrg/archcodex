/**
 * @arch archcodex.infra.validator
 *
 * Python validator using tree-sitter AST parsing.
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
import { PYTHON_CAPABILITIES } from './capabilities.js';
import { readFile } from '../utils/file-system.js';
import {
  createPythonParser,
  extractPythonSemanticModel,
} from './tree-sitter/index.js';

/**
 * Python validator using tree-sitter AST parsing.
 * Produces SemanticModel for language-agnostic constraint validation.
 */
export class PythonValidator implements ILanguageValidator {
  readonly supportedLanguages: SupportedLanguage[] = ['python'];
  readonly supportedExtensions = ['.py'];
  readonly capabilities: LanguageCapabilities = PYTHON_CAPABILITIES;

  private parser: Parser;

  constructor() {
    this.parser = createPythonParser();
  }

  async parseFile(filePath: string, content?: string): Promise<SemanticModel> {
    const fileContent = content ?? (await readFile(filePath));
    const extension = path.extname(filePath);
    const fileName = path.basename(filePath);

    return extractPythonSemanticModel(
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
