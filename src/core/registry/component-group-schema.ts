/**
 * @arch archcodex.core.domain.schema
 *
 * Component group schema definitions for UI component coupling awareness.
 * Groups define coupled UI components that must be updated together.
 */
import { z } from 'zod';

/**
 * Single component in a component group.
 */
export const ComponentGroupItemSchema = z.object({
  /** File path relative to project root */
  path: z.string(),
  /** What this component renders (e.g., 'task', 'note') */
  renders: z.string().optional(),
});

/**
 * Triggers that cause a component group to be matched.
 */
export const ComponentGroupTriggersSchema = z.object({
  /** Entity names that trigger this group */
  entities: z.array(z.string()).optional(),
  /** Glob patterns for mutation names (e.g., '*Item', '*Order*') */
  mutation_patterns: z.array(z.string()).optional(),
});

/**
 * Related files for a component group.
 */
export const ComponentGroupRelatedSchema = z.object({
  /** Actions file path */
  actions: z.string().optional(),
  /** Handlers file path */
  handlers: z.string().optional(),
}).passthrough(); // Allow additional related file types

/**
 * Component group definition - coupled UI components that must be updated together.
 */
export const ComponentGroupDefinitionSchema = z.object({
  /** Human-readable description */
  description: z.string().optional(),
  /** Components in this group */
  components: z.array(ComponentGroupItemSchema).min(1),
  /** Triggers for matching this group */
  triggers: ComponentGroupTriggersSchema.optional(),
  /** Related files (handlers, actions, etc.) */
  related: ComponentGroupRelatedSchema.optional(),
  /** Warning message shown when group is matched */
  warning: z.string().optional(),
});

/**
 * Component groups registry schema - maps group names to definitions.
 */
export const ComponentGroupsRegistrySchema = z.object({
  'component-groups': z.record(z.string(), ComponentGroupDefinitionSchema).default({}),
});

// Type exports
export type ComponentGroupItem = z.infer<typeof ComponentGroupItemSchema>;
export type ComponentGroupTriggers = z.infer<typeof ComponentGroupTriggersSchema>;
export type ComponentGroupRelated = z.infer<typeof ComponentGroupRelatedSchema>;
export type ComponentGroupDefinition = z.infer<typeof ComponentGroupDefinitionSchema>;
export type ComponentGroupsRegistry = z.infer<typeof ComponentGroupsRegistrySchema>;
