/**
 * @arch archcodex.core.domain.schema
 *
 * Zod schema for pattern registry validation.
 */
import { z } from 'zod';

/**
 * Schema for a single pattern definition.
 */
export const PatternSchema = z.object({
  /** Path to the canonical implementation file */
  canonical: z.string(),
  /** Exported symbols from this module */
  exports: z.array(z.string()).optional(),
  /** Usage guidance */
  usage: z.string().optional(),
  /** Keywords for discovery (used to match against code/imports) */
  keywords: z.array(z.string()).optional(),
  /** Optional description */
  description: z.string().optional(),
  /** Example usage code */
  example: z.string().optional(),
});

/**
 * Schema for the pattern registry.
 */
export const PatternRegistrySchema = z.object({
  /** Map of pattern name to pattern definition */
  patterns: z.record(z.string(), PatternSchema).default({}),
});

// Type exports
export type PatternSchemaType = z.infer<typeof PatternSchema>;
export type PatternRegistrySchemaType = z.infer<typeof PatternRegistrySchema>;
