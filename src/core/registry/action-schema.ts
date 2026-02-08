/**
 * @arch archcodex.core.domain.schema
 *
 * Action schema definitions for task-oriented discovery.
 * @see spec.archcodex.actionChecklist in .arch/specs/archcodex/action-checklist.spec.yaml
 */
import { z } from 'zod';

/**
 * Triggers for automatic component group matching.
 */
export const ActionTriggersSchema = z.object({
  /** Entity names that trigger this action */
  entities: z.array(z.string()).optional(),
  /** Mutation name patterns (e.g., '*Item', '*Order*') */
  mutation_patterns: z.array(z.string()).optional(),
});

export type ActionTriggers = z.infer<typeof ActionTriggersSchema>;

/**
 * UI section of structured checklist.
 * Can reference a component group for automatic expansion.
 */
export const StructuredChecklistUISchema = z.object({
  /** Component group name to expand (or 'auto' to match from triggers) */
  from_component_group: z.string().optional(),
  /** Static UI checklist items */
  items: z.array(z.string()).optional(),
  /** Additional items after component group expansion */
  additional: z.array(z.string()).optional(),
});

export type StructuredChecklistUI = z.infer<typeof StructuredChecklistUISchema>;

/**
 * Structured checklist with backend/frontend/ui sections.
 * Provides clear separation of concerns for agent task tracking.
 */
export const StructuredChecklistSchema = z.object({
  /** Backend tasks (mutations, exports, etc.) */
  backend: z.array(z.string()).optional(),
  /** Frontend tasks (hooks, handlers, etc.) */
  frontend: z.array(z.string()).optional(),
  /** UI tasks with optional component group expansion */
  ui: z.union([
    StructuredChecklistUISchema,
    z.array(z.string()),
  ]).optional(),
});

export type StructuredChecklist = z.infer<typeof StructuredChecklistSchema>;

/**
 * Checklist can be either:
 * - Flat array (legacy, backward compatible)
 * - Structured object with backend/frontend/ui sections
 */
export const ChecklistSchema = z.union([
  z.array(z.string()),
  StructuredChecklistSchema,
]);

export type Checklist = z.infer<typeof ChecklistSchema>;

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
  /** Triggers for automatic component group matching */
  triggers: ActionTriggersSchema.optional(),
  /** Checklist of steps - flat array or structured sections */
  checklist: ChecklistSchema,
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
