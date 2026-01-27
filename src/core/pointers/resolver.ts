/**
 * @arch archcodex.core.domain.resolver
 */
import * as path from 'node:path';
import { readFile, fileExists } from '../../utils/file-system.js';
import { SecurityError, ErrorCodes } from '../../utils/errors.js';
import type {
  ParsedPointer,
  ResolvedPointer,
  PointerScheme,
  PointerResolverOptions,
} from './types.js';

/**
 * Pattern to match pointer URIs.
 */
const POINTER_PATTERN = /^(arch|code|template):\/\/(.+?)(?:#(.+))?$/;

/**
 * Dangerous path patterns to reject.
 */
const DANGEROUS_PATTERNS = [
  /\.\.\//,           // Parent directory traversal
  /^\//,              // Absolute paths
  /^[a-zA-Z]:\\/,     // Windows absolute paths
  /\/\.\.\//,         // Embedded parent traversal
  /%2e%2e/i,          // URL-encoded ..
  /%2f/i,             // URL-encoded /
];

/**
 * Resolver for pointer URIs (arch://, code://, template://).
 */
export class PointerResolver {
  private options: PointerResolverOptions;
  private projectRoot: string;

  constructor(projectRoot: string, options: Partial<PointerResolverOptions> = {}) {
    this.projectRoot = projectRoot;
    this.options = {
      archBasePath: options.archBasePath ?? '.arch/docs',
      codeBasePath: options.codeBasePath ?? '.',
      templateBasePath: options.templateBasePath ?? '.arch/templates',
      allowedSchemes: options.allowedSchemes ?? ['arch', 'code', 'template'],
    };
  }

  /**
   * Parse a pointer URI into its components.
   */
  parse(uri: string): ParsedPointer | null {
    const match = uri.match(POINTER_PATTERN);
    if (!match) {
      return null;
    }

    return {
      uri,
      scheme: match[1] as PointerScheme,
      path: match[2],
      fragment: match[3],
    };
  }

  /**
   * Resolve a pointer URI to its content.
   */
  async resolve(uri: string): Promise<ResolvedPointer> {
    const parsed = this.parse(uri);

    if (!parsed) {
      return {
        uri,
        filePath: '',
        content: '',
        success: false,
        error: `Invalid pointer URI format: ${uri}`,
      };
    }

    // Check if scheme is allowed
    if (!this.options.allowedSchemes.includes(parsed.scheme)) {
      return {
        uri,
        filePath: '',
        content: '',
        success: false,
        error: `Scheme '${parsed.scheme}' is not allowed`,
      };
    }

    // Validate path for security
    const pathError = this.validatePath(parsed.path);
    if (pathError) {
      return {
        uri,
        filePath: '',
        content: '',
        success: false,
        error: pathError,
      };
    }

    // Get base path for scheme
    const basePath = this.getBasePath(parsed.scheme);
    const resolvedPath = path.resolve(this.projectRoot, basePath, parsed.path);

    // Verify the resolved path is within the allowed sandbox
    const sandboxPath = path.resolve(this.projectRoot, basePath);
    if (!resolvedPath.startsWith(sandboxPath)) {
      throw new SecurityError(
        ErrorCodes.PATH_TRAVERSAL,
        `Path traversal detected: ${uri} resolves outside sandbox`,
        { uri, resolvedPath, sandboxPath }
      );
    }

    // Check if file exists
    if (!(await fileExists(resolvedPath))) {
      return {
        uri,
        filePath: resolvedPath,
        content: '',
        success: false,
        error: `File not found: ${resolvedPath}`,
      };
    }

    try {
      const content = await readFile(resolvedPath);
      let fragmentContent: string | undefined;

      // Extract fragment if specified
      if (parsed.fragment) {
        fragmentContent = this.extractFragment(content, parsed.fragment);
      }

      return {
        uri,
        filePath: resolvedPath,
        content,
        fragmentContent,
        success: true,
      };
    } catch (error) {
      return {
        uri,
        filePath: resolvedPath,
        content: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Validate a path for security issues.
   */
  private validatePath(uriPath: string): string | null {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(uriPath)) {
        return `Security violation: dangerous path pattern detected in '${uriPath}'`;
      }
    }
    return null;
  }

  /**
   * Get the base path for a scheme.
   */
  private getBasePath(scheme: PointerScheme): string {
    switch (scheme) {
      case 'arch':
        return this.options.archBasePath;
      case 'code':
        return this.options.codeBasePath;
      case 'template':
        return this.options.templateBasePath;
    }
  }

  /**
   * Extract a fragment from content.
   * Supports:
   * - Line ranges: #L10-L20
   * - Named sections: #section-name (searches for ## section-name in markdown)
   * - Code symbols: #ClassName or #functionName (basic search)
   */
  private extractFragment(content: string, fragment: string): string | undefined {
    // Line range: L10-L20
    const lineMatch = fragment.match(/^L(\d+)(?:-L(\d+))?$/);
    if (lineMatch) {
      const startLine = parseInt(lineMatch[1], 10);
      const endLine = lineMatch[2] ? parseInt(lineMatch[2], 10) : startLine;
      const lines = content.split('\n');
      return lines.slice(startLine - 1, endLine).join('\n');
    }

    // Section: look for ## fragment or # fragment in markdown
    const sectionPattern = new RegExp(`^##?\\s+${this.escapeRegex(fragment)}\\s*$`, 'm');
    const sectionMatch = content.match(sectionPattern);
    if (sectionMatch && sectionMatch.index !== undefined) {
      // Extract from section header to next section or end
      const rest = content.slice(sectionMatch.index);
      const nextSectionMatch = rest.slice(1).match(/^#/m);
      if (nextSectionMatch && nextSectionMatch.index !== undefined) {
        return rest.slice(0, nextSectionMatch.index + 1).trim();
      }
      return rest.trim();
    }

    // Code symbol: basic search for class/function/const definition
    const symbolPatterns = [
      new RegExp(`(?:class|interface|type|enum)\\s+${this.escapeRegex(fragment)}[^{]*\\{[^}]*\\}`, 's'),
      new RegExp(`(?:function|const|let|var)\\s+${this.escapeRegex(fragment)}[^;{]*(?:\\{[^}]*\\}|;)`, 's'),
      new RegExp(`${this.escapeRegex(fragment)}\\s*[:=]\\s*(?:function)?[^;{]*(?:\\{[^}]*\\}|;)`, 's'),
    ];

    for (const pattern of symbolPatterns) {
      const match = content.match(pattern);
      if (match) {
        return match[0];
      }
    }

    return undefined;
  }

  /**
   * Escape regex special characters.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
