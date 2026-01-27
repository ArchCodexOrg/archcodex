/**
 * @arch archcodex.core.domain.schema
 *
 * Action schema definitions for task-oriented discovery.
 */
import { z } from 'zod';

/**
 * Action definition schema for task-oriented discovery.
 * Actions map "I want to do X" to architecture + intents + checklist.
 */
export const ActionDefinitionSchema = z.object({
  /** Description of what this action accomplishes */
  description: z.string(),
  /** Alternative phrasings that match this action */
  aliases: z.array(z.string()).optional(),
  /** The architecture to use (can reference a feature instead) */
  architecture: z.string().optional(),
  /** The feature to scaffold (for multi-file actions) */
  feature: z.string().optional(),
  /** Suggested intents to apply */
  intents: z.array(z.string()).optional(),
  /** Checklist of steps to complete */
  checklist: z.array(z.string()),
  /** Default path for new files */
  suggested_path: z.string().optional(),
  /** File naming pattern (e.g., "${name}.tsx") */
  file_pattern: z.string().optional(),
  /** Test file pattern (e.g., "${name}.test.tsx") */
  test_pattern: z.string().optional(),
  /** Variables to prompt for */
  variables: z.array(z.object({
    name: z.string(),
    prompt: z.string(),
    default: z.string().optional(),
  })).optional(),
});

/**
 * Action registry schema - maps action names to their definitions.
 */
export const ActionRegistrySchema = z.object({
  actions: z.record(z.string(), ActionDefinitionSchema),
});

// Type exports
export type ActionDefinition = z.infer<typeof ActionDefinitionSchema>;
export type ActionRegistry = z.infer<typeof ActionRegistrySchema>;
