/**
 * @arch archcodex.core.domain.schema
 *
 * Feature schema definitions for multi-file scaffolding.
 */
import { z } from 'zod';

/**
 * Feature component schema for multi-file scaffolding.
 */
export const FeatureComponentSchema = z.object({
  /** Role of this component (e.g., "command", "engine", "test") */
  role: z.string(),
  /** Architecture to use for this component */
  architecture: z.string(),
  /** Output path pattern (e.g., "src/core/constraints/${name}.ts") */
  path: z.string(),
  /** Template name (optional, defaults to architecture's template) */
  template: z.string().optional(),
  /** Whether this component is optional */
  optional: z.boolean().optional(),
});

/**
 * Feature definition schema for multi-file scaffolding templates.
 * Features define a set of related files to scaffold together.
 */
export const FeatureDefinitionSchema = z.object({
  /** Description of what this feature creates */
  description: z.string(),
  /** List of components to scaffold */
  components: z.array(FeatureComponentSchema),
  /** Shared variables across all components */
  shared_variables: z.record(z.string(), z.string()).optional(),
  /** Checklist of manual steps after scaffolding */
  checklist: z.array(z.string()).optional(),
  /** Action that triggers this feature */
  triggered_by_action: z.string().optional(),
});

/**
 * Feature registry schema - maps feature names to their definitions.
 */
export const FeatureRegistrySchema = z.object({
  features: z.record(z.string(), FeatureDefinitionSchema),
});

// Type exports
export type FeatureComponent = z.infer<typeof FeatureComponentSchema>;
export type FeatureDefinition = z.infer<typeof FeatureDefinitionSchema>;
export type FeatureRegistry = z.infer<typeof FeatureRegistrySchema>;
