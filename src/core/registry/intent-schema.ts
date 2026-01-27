/**
 * @arch archcodex.core.domain.schema
 *
 * Intent schema definitions for semantic intent annotations.
 */
import { z } from 'zod';

/**
 * Intent definition schema - defines what an intent means and enforces.
 */
export const IntentDefinitionSchema = z.object({
  /** Description of what this intent means */
  description: z.string(),
  /** Code patterns that must exist when this intent is used */
  requires: z.array(z.string()).optional(),
  /** Code patterns that must NOT exist when this intent is used */
  forbids: z.array(z.string()).optional(),
  /** Other intents that conflict with this one */
  conflicts_with: z.array(z.string()).optional(),
  /** Other intents that must also be present */
  requires_intent: z.array(z.string()).optional(),
  /** Category for grouping (auth, data-access, lifecycle, performance, audit) */
  category: z.string().optional(),
  /** Path glob patterns that suggest this intent (e.g., "src/admin/**") */
  suggest_for_paths: z.array(z.string()).optional(),
  /** Architecture patterns that suggest this intent (e.g., "api.admin.*") */
  suggest_for_archs: z.array(z.string()).optional(),
});

/**
 * Intent registry schema - maps intent names to their definitions.
 */
export const IntentRegistrySchema = z.object({
  intents: z.record(z.string(), IntentDefinitionSchema),
});

// Type exports
export type IntentDefinition = z.infer<typeof IntentDefinitionSchema>;
export type IntentRegistry = z.infer<typeof IntentRegistrySchema>;
