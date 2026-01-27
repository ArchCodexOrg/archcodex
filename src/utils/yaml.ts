/**
 * @arch archcodex.infra.fs
 *
 * YAML parsing and serialization utilities.
 */
import { parse, stringify } from 'yaml';
import type { ZodType, ZodError, ZodTypeDef } from 'zod';
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
 * Parse and validate YAML content with a Zod schema.
 */
export function parseYamlWithSchema<Output, Def extends ZodTypeDef, Input>(
  content: string,
  schema: ZodType<Output, Def, Input>
): Output {
  const parsed = parseYaml<unknown>(content);
  const result = schema.safeParse(parsed);

  if (!result.success) {
    throw new SystemError(
      ErrorCodes.INVALID_REGISTRY,
      `YAML validation failed: ${formatZodError(result.error)}`,
      { errors: result.error.errors }
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
export async function loadYamlWithSchema<Output, Def extends ZodTypeDef, Input>(
  filePath: string,
  schema: ZodType<Output, Def, Input>
): Promise<Output> {
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
function formatZodError(error: ZodError): string {
  return error.errors
    .map((e) => {
      const path = e.path.join('.');
      return path ? `${path}: ${e.message}` : e.message;
    })
    .join('; ');
}
