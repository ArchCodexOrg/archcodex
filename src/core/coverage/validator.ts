/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * CoverageValidator - validates require_coverage constraints across files.
 * Discovers sources from source files, checks for handlers in target files.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { glob } from 'glob';
import ts from 'typescript';
import type {
  CoverageConstraintConfig,
  CoverageSource,
  CoverageGap,
  CoverageValidationResult,
} from './types.js';
import { applyTransform } from './transforms.js';

/** Template placeholder for source value */
const VALUE_PLACEHOLDER = '${value}';

/**
 * Validates coverage constraints across multiple files.
 */
export class CoverageValidator {
  private projectRoot: string;
  private contentCache: Map<string, string>;

  constructor(projectRoot: string, contentCache?: Map<string, string>) {
    this.projectRoot = projectRoot;
    this.contentCache = contentCache ?? new Map();
  }

  /**
   * Validate a single coverage constraint.
   */
  async validate(config: CoverageConstraintConfig): Promise<CoverageValidationResult> {
    // 1. Discover sources
    const sources = await this.discoverSources(config);

    // 2. Find handlers
    const targetFiles = await this.getTargetFiles(config.in_target_files);
    const targetContents = await this.loadFileContents(targetFiles);

    // 3. Check coverage
    const gaps: CoverageGap[] = [];
    let coveredCount = 0;

    for (const source of sources) {
      // Apply transform to the source value before searching
      const transformedValue = applyTransform(source.value, config.transform);
      const found = this.findHandler(transformedValue, config.target_pattern, targetContents);

      if (found) {
        coveredCount++;
      } else {
        // Build the expected pattern for the gap report
        const expectedPattern = config.target_pattern.replace(VALUE_PLACEHOLDER, transformedValue);
        gaps.push({
          value: source.value,
          sourceFile: source.file,
          sourceLine: source.line,
          expectedIn: config.in_target_files,
          targetPattern: expectedPattern,
        });
      }
    }

    return {
      gaps,
      totalSources: sources.length,
      coveredSources: coveredCount,
      coveragePercent: sources.length > 0 ? (coveredCount / sources.length) * 100 : 100,
    };
  }

  /**
   * Validate multiple coverage constraints.
   */
  async validateAll(configs: CoverageConstraintConfig[]): Promise<Map<string, CoverageValidationResult>> {
    const results = new Map<string, CoverageValidationResult>();

    for (const config of configs) {
      const key = `${config.archId}:${config.source_pattern}`;
      const result = await this.validate(config);
      results.set(key, result);
    }

    return results;
  }

  /**
   * Discover sources from source files.
   */
  private async discoverSources(config: CoverageConstraintConfig): Promise<CoverageSource[]> {
    const sourceFiles = await this.getSourceFiles(config.in_files);
    const sources: CoverageSource[] = [];

    for (const file of sourceFiles) {
      const content = await this.getFileContent(file);
      const discovered = this.extractSources(content, file, config);
      sources.push(...discovered);
    }

    return sources;
  }

  /**
   * Extract source values from file content based on source_type.
   */
  private extractSources(
    content: string,
    file: string,
    config: CoverageConstraintConfig
  ): CoverageSource[] {
    const sources: CoverageSource[] = [];
    const relFile = path.relative(this.projectRoot, file);

    switch (config.source_type) {
      case 'export_names':
        return this.extractExportNames(content, relFile, config.source_pattern);

      case 'string_literals':
        return this.extractStringLiterals(content, relFile, config);

      case 'file_names': {
        // For file_names mode, the source is the filename itself
        const basename = path.basename(file, path.extname(file));
        if (this.matchesPattern(basename, config.source_pattern)) {
          sources.push({ value: basename, file: relFile, line: 1 });
        }
        return sources;
      }

      case 'union_members':
        return this.extractUnionMembers(content, relFile, config.source_pattern);

      case 'object_keys':
        return this.extractObjectKeys(content, relFile, config.source_pattern);

      default:
        return sources;
    }
  }

  /**
   * Extract exported names matching a pattern.
   */
  private extractExportNames(
    content: string,
    file: string,
    pattern: string
  ): CoverageSource[] {
    const sources: CoverageSource[] = [];
    const lines = content.split('\n');

    // Match: export const/let/var/function/class Name
    const exportRegex = /export\s+(?:const|let|var|function|class|type|interface)\s+(\w+)/g;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match;
      exportRegex.lastIndex = 0;

      while ((match = exportRegex.exec(line)) !== null) {
        const name = match[1];
        if (this.matchesPattern(name, pattern)) {
          sources.push({ value: name, file, line: i + 1 });
        }
      }
    }

    return sources;
  }

  /**
   * Extract string literals using regex patterns.
   */
  private extractStringLiterals(
    content: string,
    file: string,
    config: CoverageConstraintConfig
  ): CoverageSource[] {
    const sources: CoverageSource[] = [];

    try {
      // First, match the source_pattern to get the region containing values
      const sourceRegex = new RegExp(config.source_pattern, 'gms');
      const sourceMatch = sourceRegex.exec(content);

      if (!sourceMatch) {
        return sources;
      }

      // Get the matched text (either capture group 1 or full match)
      const matchedText = sourceMatch[1] ?? sourceMatch[0];

      // Now extract individual values using extract_values pattern
      const extractPattern = config.extract_values ?? '"([^"]+)"';
      const extractRegex = new RegExp(extractPattern, 'g');

      let valueMatch;
      while ((valueMatch = extractRegex.exec(matchedText)) !== null) {
        const value = valueMatch[1] ?? valueMatch[0];

        // Find line number for this value in original content
        const valueIndex = content.indexOf(value);
        const lineNumber = valueIndex >= 0
          ? content.substring(0, valueIndex).split('\n').length
          : 1;

        sources.push({ value, file, line: lineNumber });
      }
    } catch { /* invalid regex pattern */
      // Invalid regex - skip
    }

    return sources;
  }

  /**
   * Extract string literal members from a TypeScript union type.
   * Uses TypeScript AST for accurate parsing.
   *
   * @param content - File content
   * @param file - Relative file path
   * @param typeName - Name of the type to find (e.g., "DomainEventType")
   */
  private extractUnionMembers(
    content: string,
    file: string,
    typeName: string
  ): CoverageSource[] {
    const sources: CoverageSource[] = [];

    try {
      const sourceFile = ts.createSourceFile(
        file,
        content,
        ts.ScriptTarget.Latest,
        true
      );

      // Find the type alias with the given name
      const visit = (node: ts.Node): void => {
        if (ts.isTypeAliasDeclaration(node) && node.name.text === typeName) {
          // Extract string literals from the union type
          this.extractStringLiteralsFromType(node.type, sourceFile, file, sources);
        }
        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    } catch { /* TypeScript parse failed */
      // Failed to parse - return empty
    }

    return sources;
  }

  /**
   * Recursively extract string literals from a type node.
   */
  private extractStringLiteralsFromType(
    typeNode: ts.TypeNode,
    sourceFile: ts.SourceFile,
    file: string,
    sources: CoverageSource[]
  ): void {
    if (ts.isUnionTypeNode(typeNode)) {
      // Process each member of the union
      for (const member of typeNode.types) {
        this.extractStringLiteralsFromType(member, sourceFile, file, sources);
      }
    } else if (ts.isLiteralTypeNode(typeNode)) {
      // Extract string literal value
      if (ts.isStringLiteral(typeNode.literal)) {
        const value = typeNode.literal.text;
        const line = sourceFile.getLineAndCharacterOfPosition(typeNode.getStart()).line + 1;
        sources.push({ value, file, line });
      }
    } else if (ts.isParenthesizedTypeNode(typeNode)) {
      // Unwrap parenthesized types
      this.extractStringLiteralsFromType(typeNode.type, sourceFile, file, sources);
    }
  }

  /**
   * Extract keys from a TypeScript object literal or const assertion.
   * Uses TypeScript AST for accurate parsing.
   *
   * @param content - File content
   * @param file - Relative file path
   * @param objectName - Name of the object/const to find (e.g., "handlers")
   */
  private extractObjectKeys(
    content: string,
    file: string,
    objectName: string
  ): CoverageSource[] {
    const sources: CoverageSource[] = [];

    try {
      const sourceFile = ts.createSourceFile(
        file,
        content,
        ts.ScriptTarget.Latest,
        true
      );

      // Find variable declaration with the given name
      const visit = (node: ts.Node): void => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === objectName) {
          if (node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
            this.extractKeysFromObject(node.initializer, sourceFile, file, sources);
          }
        }
        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    } catch { /* TypeScript parse failed */
      // Failed to parse - return empty
    }

    return sources;
  }

  /**
   * Extract string keys from an object literal expression.
   */
  private extractKeysFromObject(
    objLiteral: ts.ObjectLiteralExpression,
    sourceFile: ts.SourceFile,
    file: string,
    sources: CoverageSource[]
  ): void {
    for (const prop of objLiteral.properties) {
      if (ts.isPropertyAssignment(prop)) {
        let keyValue: string | null = null;

        if (ts.isStringLiteral(prop.name)) {
          keyValue = prop.name.text;
        } else if (ts.isIdentifier(prop.name)) {
          keyValue = prop.name.text;
        } else if (ts.isComputedPropertyName(prop.name)) {
          // Handle computed property names like [EventType.FOO]
          if (ts.isStringLiteral(prop.name.expression)) {
            keyValue = prop.name.expression.text;
          }
        }

        if (keyValue !== null) {
          const line = sourceFile.getLineAndCharacterOfPosition(prop.getStart()).line + 1;
          sources.push({ value: keyValue, file, line });
        }
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        // Handle shorthand { foo } syntax
        const keyValue = prop.name.text;
        const line = sourceFile.getLineAndCharacterOfPosition(prop.getStart()).line + 1;
        sources.push({ value: keyValue, file, line });
      }
    }
  }

  /**
   * Check if a name matches a glob-like pattern.
   * Supports * wildcard.
   */
  private matchesPattern(name: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    const regex = new RegExp(`^${regexStr}$`);
    return regex.test(name);
  }

  /**
   * Find a handler for a source value in target files.
   */
  private findHandler(
    value: string,
    targetPattern: string,
    targetContents: Map<string, string>
  ): { file: string; line: number } | null {
    // Build the pattern to search for - replace ${value} with escaped value
    const valuePlaceholderRegex = /\$\{value\}/g;
    const searchPattern = targetPattern.replace(valuePlaceholderRegex, this.escapeRegex(value));

    try {
      const regex = new RegExp(searchPattern);

      for (const [file, content] of targetContents) {
        if (regex.test(content)) {
          // Find line number
          const match = content.match(regex);
          if (match && match.index !== undefined) {
            const line = content.substring(0, match.index).split('\n').length;
            return { file, line };
          }
          return { file, line: 1 };
        }
      }
    } catch { /* invalid regex, fallback to literal search */
      // Invalid regex - try literal search
      for (const [file, content] of targetContents) {
        if (content.includes(value)) {
          return { file, line: 1 };
        }
      }
    }

    return null;
  }

  /**
   * Escape special regex characters.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get files matching a glob pattern.
   */
  private async getSourceFiles(pattern: string): Promise<string[]> {
    const absolutePattern = path.isAbsolute(pattern)
      ? pattern
      : path.join(this.projectRoot, pattern);

    return glob(absolutePattern, {
      nodir: true,
      absolute: true,
    });
  }

  /**
   * Get target files matching a glob pattern.
   */
  private async getTargetFiles(pattern: string): Promise<string[]> {
    return this.getSourceFiles(pattern);
  }

  /**
   * Load contents of multiple files.
   */
  private async loadFileContents(files: string[]): Promise<Map<string, string>> {
    const contents = new Map<string, string>();

    for (const file of files) {
      const content = await this.getFileContent(file);
      const relFile = path.relative(this.projectRoot, file);
      contents.set(relFile, content);
    }

    return contents;
  }

  /**
   * Get file content (with caching).
   */
  private async getFileContent(file: string): Promise<string> {
    if (this.contentCache.has(file)) {
      return this.contentCache.get(file)!;
    }

    try {
      const content = await fs.promises.readFile(file, 'utf-8');
      this.contentCache.set(file, content);
      return content;
    } catch { /* file read error */
      return '';
    }
  }

  /**
   * Set content cache (shared with other validators).
   */
  setContentCache(cache: Map<string, string>): void {
    this.contentCache = cache;
  }
}
