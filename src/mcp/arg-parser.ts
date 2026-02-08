/**
 * @arch archcodex.cli.mcp
 *
 * Type-safe argument parser for MCP tool calls.
 *
 * Replaces raw `as string` / `as boolean` casts when extracting arguments
 * from the `Record<string, unknown>` provided by the MCP protocol.
 * Each getter validates the runtime type before returning, so callers get
 * genuine type safety rather than blind assertions.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The shape of arguments received from MCP tool calls. */
type McpArgs = Record<string, unknown> | undefined;

// ---------------------------------------------------------------------------
// String helpers
// ---------------------------------------------------------------------------

/**
 * Extract an optional string argument.
 * Returns `undefined` if the key is missing, null, or not a string.
 */
export function getString(args: McpArgs, key: string): string | undefined {
  const value = args?.[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  return undefined;
}

/**
 * Extract a required string argument.
 * Throws if the key is missing or not a string.
 */
export function getStringRequired(args: McpArgs, key: string): string {
  const value = getString(args, key);
  if (value === undefined) {
    throw new Error(`Required string argument "${key}" is missing or not a string`);
  }
  return value;
}

/**
 * Extract an optional string argument with a fallback from a second key.
 * Useful for aliases like `entity ?? name`.
 */
export function getStringWithFallback(args: McpArgs, key: string, fallbackKey: string): string | undefined {
  return getString(args, key) ?? getString(args, fallbackKey);
}

// ---------------------------------------------------------------------------
// Boolean helpers
// ---------------------------------------------------------------------------

/**
 * Extract an optional boolean argument.
 * Returns `undefined` if the key is missing, null, or not a boolean.
 * When `defaultValue` is provided, returns it instead of `undefined`.
 */
export function getBoolean(args: McpArgs, key: string, defaultValue?: boolean): boolean | undefined {
  const value = args?.[key];
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  return defaultValue;
}

// ---------------------------------------------------------------------------
// Number helpers
// ---------------------------------------------------------------------------

/**
 * Extract an optional number argument.
 * Returns `undefined` if the key is missing, null, or not a number.
 */
export function getNumber(args: McpArgs, key: string): number | undefined {
  const value = args?.[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  return undefined;
}

// ---------------------------------------------------------------------------
// Array helpers
// ---------------------------------------------------------------------------

/**
 * Extract an optional string array argument.
 * Returns `undefined` if the key is missing or null.
 * If the value is an array, filters to only string elements.
 */
export function getStringArray(args: McpArgs, key: string): string[] | undefined {
  const value = args?.[key];
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return undefined;
}

/**
 * Extract an optional typed array argument.
 * Returns `undefined` if the key is missing or null.
 * If the value is an array, returns it with the specified type.
 * The caller is responsible for ensuring the array contents match the type
 * (used for complex object arrays like `changes` in validate_plan).
 */
export function getArray<T>(args: McpArgs, key: string): T[] | undefined {
  const value = args?.[key];
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value as T[];
  return undefined;
}

// ---------------------------------------------------------------------------
// Raw value helpers
// ---------------------------------------------------------------------------

/**
 * Extract a raw value from args without type narrowing.
 * Returns `unknown` - useful when the value needs to be passed to
 * normalization functions like `normalizeFilePath()` that accept
 * `string | Record<string, unknown>`.
 */
export function getRaw(args: McpArgs, key: string): unknown {
  return args?.[key];
}

/**
 * Check whether a key is present and has a non-nullish value.
 */
export function hasArg(args: McpArgs, key: string): boolean {
  return args !== undefined && args[key] !== undefined && args[key] !== null;
}
