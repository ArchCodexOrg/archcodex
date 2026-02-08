/**
 * @arch archcodex.infra.fs
 *
 * YAML parsing and serialization utilities.
 */
import { parse, parseAllDocuments, stringify } from 'yaml';
import { z } from 'zod';
import { SystemError, ErrorCodes } from './errors.js';
import { readFile, writeFile } from './file-system.js';

/**
 * Parse YAML content into an object.
 */
export function parseYaml<T>(content: string): T {
  try {
    return parse(content) as T;
  } catch (error) {
    throw new SystemError(
      ErrorCodes.PARSE_ERROR,
      `Failed to parse YAML: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { error }
    );
  }
}

/**
 * Parse multi-document YAML content into an array of objects.
 * Documents are separated by '---'.
 */
export function parseYamlMultiDoc<T>(content: string): T[] {
  try {
    const docs = parseAllDocuments(content);
    return docs.map((doc) => doc.toJSON() as T);
  } catch (error) {
    throw new SystemError(
      ErrorCodes.PARSE_ERROR,
      `Failed to parse YAML: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { error }
    );
  }
}

/**
 * Parse multi-document YAML and merge all documents into a single object.
 * Later documents override earlier ones for conflicting keys.
 */
export function parseYamlMultiDocMerged<T extends Record<string, unknown>>(content: string): T {
  const docs = parseYamlMultiDoc<Record<string, unknown>>(content);
  return docs.reduce((merged, doc) => ({ ...merged, ...doc }), {} as Record<string, unknown>) as T;
}

/**
 * Parse and validate YAML content with a Zod schema.
 */
export function parseYamlWithSchema<T extends z.ZodTypeAny>(
  content: string,
  schema: T
): z.infer<T> {
  const parsed = parseYaml<unknown>(content);
  const result = schema.safeParse(parsed);

  if (!result.success) {
    throw new SystemError(
      ErrorCodes.INVALID_REGISTRY,
      `YAML validation failed: ${formatZodError(result.error)}`,
      { errors: result.error.issues }
    );
  }

  return result.data;
}

/**
 * Load and parse a YAML file.
 */
export async function loadYaml<T>(filePath: string): Promise<T> {
  try {
    const content = await readFile(filePath);
    return parseYaml<T>(content);
  } catch (error) {
    if (error instanceof SystemError) {
      throw error;
    }
    throw new SystemError(
      ErrorCodes.PARSE_ERROR,
      `Failed to load YAML file: ${filePath}`,
      { filePath, error }
    );
  }
}

/**
 * Load and validate a YAML file with a Zod schema.
 */
export async function loadYamlWithSchema<T extends z.ZodTypeAny>(
  filePath: string,
  schema: T
): Promise<z.infer<T>> {
  try {
    const content = await readFile(filePath);
    return parseYamlWithSchema(content, schema);
  } catch (error) {
    if (error instanceof SystemError) {
      // Re-throw with file path context
      throw new SystemError(
        error.code,
        `${error.message} (file: ${filePath})`,
        { ...error.details, filePath }
      );
    }
    throw new SystemError(
      ErrorCodes.PARSE_ERROR,
      `Failed to load YAML file: ${filePath}`,
      { filePath, error }
    );
  }
}

/**
 * Stringify an object to YAML.
 */
export function stringifyYaml(data: unknown): string {
  return stringify(data, {
    indent: 2,
    lineWidth: 100,
  });
}

/**
 * Write an object to a YAML file.
 */
export async function writeYaml(filePath: string, data: unknown): Promise<void> {
  const content = stringifyYaml(data);
  await writeFile(filePath, content);
}

/**
 * Format Zod errors into a readable string.
 */
function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((e) => {
      const path = e.path.join('.');
      return path ? `${path}: ${e.message}` : e.message;
    })
    .join('; ');
}
