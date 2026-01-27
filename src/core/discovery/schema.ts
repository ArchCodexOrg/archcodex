/**
 * @arch archcodex.core.domain.schema
 */
import { z } from 'zod';

/**
 * Schema for a single index entry.
 */
export const IndexEntrySchema = z.object({
  arch_id: z.string(),
  keywords: z.array(z.string()),
  description: z.string().optional(),
  suggested_path: z.string().optional(),
  suggested_name: z.string().optional(),
  template: z.string().optional(),
});

/**
 * Schema for the complete index.yaml file.
 */
export const IndexSchema = z.object({
  version: z.string().default('1.0'),
  registry_checksum: z.string().optional(),
  entries: z.array(IndexEntrySchema).default([]),
});

// Type exports
export type IndexEntry = z.infer<typeof IndexEntrySchema>;
export type Index = z.infer<typeof IndexSchema>;
