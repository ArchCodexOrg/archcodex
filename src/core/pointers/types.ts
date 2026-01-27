/**
 * @arch archcodex.core.types
 *
 * Pointer type definitions.
 */

/**
 * Supported URI schemes for pointers.
 */
export type PointerScheme = 'arch' | 'code' | 'template';

/**
 * Parsed pointer URI.
 */
export interface ParsedPointer {
  /** Original URI */
  uri: string;
  /** URI scheme */
  scheme: PointerScheme;
  /** Path within the scheme */
  path: string;
  /** Optional fragment (after #) */
  fragment?: string;
}

/**
 * Result of resolving a pointer.
 */
export interface ResolvedPointer {
  /** Original URI */
  uri: string;
  /** Resolved absolute file path */
  filePath: string;
  /** Content of the resolved file */
  content: string;
  /** Optional fragment content (if fragment was specified) */
  fragmentContent?: string;
  /** Whether the resolution was successful */
  success: boolean;
  /** Error message if resolution failed */
  error?: string;
}

/**
 * Options for pointer resolution.
 */
export interface PointerResolverOptions {
  /** Base path for arch:// URIs */
  archBasePath: string;
  /** Base path for code:// URIs */
  codeBasePath: string;
  /** Base path for template:// URIs */
  templateBasePath: string;
  /** Allowed schemes */
  allowedSchemes: PointerScheme[];
}
