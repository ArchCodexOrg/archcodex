/**
 * @arch archcodex.cli.mcp.handler
 *
 * MCP tool handlers for help and schema operations.
 */
import { loadRegistry } from '../../core/registry/loader.js';
import {
  CONSTRAINT_RULES,
  ARCH_FIELDS,
  CONSTRAINT_FIELDS,
  CONDITIONS,
} from '../schema-data.js';
import {
  ARCHITECTURE_EXAMPLES,
  CONSTRAINT_EXAMPLES,
  RECIPE_EXAMPLES,
  ARCHITECTURE_TEMPLATE,
} from '../schema-examples.js';

// ============================================================================
// HELP HANDLER
// ============================================================================

/** Help topic definitions (mirrored from CLI help command) */
const HELP_TOPICS: Record<string, {
  description: string;
  tools: Array<{ name: string; summary: string; example?: string }>;
}> = {
  creating: {
    description: 'Starting new files with the right architecture',
    tools: [
      { name: 'archcodex_discover', summary: 'Find architecture for a concept', example: '{"query": "payment service"}' },
      { name: 'archcodex_scaffold', summary: 'Generate file from template', example: '{"archId": "domain.service", "name": "PaymentService"}' },
      { name: 'archcodex_infer', summary: 'Suggest architecture for files', example: '{"files": ["src/utils/helper.ts"]}' },
      { name: 'archcodex_decide', summary: 'Navigate decision tree', example: '{"action": "start"}' },
    ],
  },
  validating: {
    description: 'Checking code against architectural constraints',
    tools: [
      { name: 'archcodex_check', summary: 'Validate constraints (post-edit)', example: '{"files": ["src/services/*.ts"]}' },
      { name: 'archcodex_validate_plan', summary: 'Pre-flight check before writing code', example: '{"changes": [{"path": "src/new.ts", "action": "create", "archId": "core.engine"}]}' },
    ],
  },
  understanding: {
    description: 'Learning what constraints apply and why',
    tools: [
      { name: 'archcodex_session_context', summary: 'Prime context at session start (call first)', example: '{"withPatterns": true}' },
      { name: 'archcodex_plan_context', summary: 'Scoped context for a directory/task', example: '{"scope": ["src/core/health/"]}' },
      { name: 'archcodex_read', summary: 'Read one file with constraints', example: '{"file": "src/service.ts", "format": "ai"}' },
      { name: 'archcodex_why', summary: 'Explain constraint origins', example: '{"file": "src/service.ts", "constraint": "forbid_import:axios"}' },
      { name: 'archcodex_neighborhood', summary: 'Per-file import boundaries', example: '{"file": "src/core/engine.ts"}' },
      { name: 'archcodex_resolve', summary: 'Show flattened architecture', example: '{"archId": "domain.service"}' },
    ],
  },
  refactoring: {
    description: 'Comparing architectures and planning changes',
    tools: [
      { name: 'archcodex_impact', summary: 'Show blast radius before refactoring', example: '{"file": "src/core/engine.ts"}' },
      { name: 'archcodex_diff_arch', summary: 'Compare two architectures', example: '{"from": "util", "to": "domain.service"}' },
    ],
  },
  health: {
    description: 'Monitoring architecture quality and maintenance',
    tools: [
      { name: 'archcodex_health', summary: 'Health dashboard', example: '{}' },
      { name: 'archcodex_consistency', summary: 'Check registry consistency', example: '{}' },
      { name: 'archcodex_types', summary: 'Find duplicate types', example: '{"operation": "scan", "patterns": ["src/**/*.ts"]}' },
    ],
  },
  setup: {
    description: 'Project initialization and configuration',
    tools: [
      { name: 'archcodex_sync_index', summary: 'Update discovery index', example: '{}' },
      { name: 'archcodex_schema', summary: 'Available rules, mixins, examples', example: '{"filter": "rules"}' },
    ],
  },
};

const ESSENTIAL_TOOLS = [
  { name: 'archcodex_session_context', summary: 'Prime context at session start (call first)' },
  { name: 'archcodex_plan_context', summary: 'Scoped context for multi-file planning' },
  { name: 'archcodex_check', summary: 'Validate constraints after edits' },
  { name: 'archcodex_validate_plan', summary: 'Pre-flight check before writing code' },
  { name: 'archcodex_discover', summary: 'Find architecture for new files' },
];

export interface HelpOptions {
  topic?: string;
  full?: boolean;
}

export function handleHelp(options: HelpOptions) {
  const { topic, full } = options;

  if (full) {
    // Show all tools grouped by topic
    const output: Record<string, unknown> = {
      message: 'ArchCodex MCP Tools - All Commands',
      topics: {},
    };
    for (const [name, data] of Object.entries(HELP_TOPICS)) {
      (output.topics as Record<string, unknown>)[name] = {
        description: data.description,
        tools: data.tools,
      };
    }
    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
  }

  if (topic) {
    const topicData = HELP_TOPICS[topic.toLowerCase()];
    if (!topicData) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: `Unknown topic: ${topic}`,
            availableTopics: Object.keys(HELP_TOPICS),
          }, null, 2),
        }],
        isError: true,
      };
    }
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          topic: topic,
          description: topicData.description,
          tools: topicData.tools,
          seeAlso: Object.keys(HELP_TOPICS).filter(t => t !== topic.toLowerCase()),
        }, null, 2),
      }],
    };
  }

  // Default: show essentials + topic list
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        message: 'ArchCodex MCP Tools',
        essentials: ESSENTIAL_TOOLS,
        topics: Object.entries(HELP_TOPICS).map(([name, data]) => ({
          name,
          description: data.description,
        })),
        usage: {
          forTopic: 'archcodex_help with topic parameter',
          forAll: 'archcodex_help with full=true',
        },
      }, null, 2),
    }],
  };
}

// ============================================================================
// SCHEMA HANDLER
// ============================================================================

export interface SchemaOptions {
  filter?: string;
  examples?: string;
  recipe?: string;
  template?: boolean;
}

export async function handleSchema(projectRoot: string, options: SchemaOptions = {}) {
  const { filter, examples, recipe, template } = options;
  const output: Record<string, unknown> = {};

  // Handle template request
  if (template) {
    return { content: [{ type: 'text', text: JSON.stringify({ template: ARCHITECTURE_TEMPLATE }, null, 2) }] };
  }

  // Handle recipe request
  if (recipe) {
    const recipeContent = RECIPE_EXAMPLES[recipe as keyof typeof RECIPE_EXAMPLES];
    if (!recipeContent) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: `Recipe "${recipe}" not found`,
            available: Object.keys(RECIPE_EXAMPLES),
          }, null, 2),
        }],
        isError: true,
      };
    }
    return { content: [{ type: 'text', text: JSON.stringify({ name: recipe, yaml: recipeContent }, null, 2) }] };
  }

  // Handle examples request
  if (examples) {
    const examplesOutput: Record<string, unknown> = {};
    if (examples === 'all' || examples === 'architectures') {
      examplesOutput.architectures = ARCHITECTURE_EXAMPLES;
    }
    if (examples === 'all' || examples === 'constraints') {
      examplesOutput.constraints = CONSTRAINT_EXAMPLES;
    }
    if (examples === 'all' || examples === 'recipes') {
      examplesOutput.recipes = RECIPE_EXAMPLES;
    }
    return { content: [{ type: 'text', text: JSON.stringify(examplesOutput, null, 2) }] };
  }

  // Default: show schema data
  const showAll = !filter || filter === 'all';

  if (showAll || filter === 'rules') {
    output.rules = CONSTRAINT_RULES;
  }
  if (showAll || filter === 'fields') {
    output.architectureFields = ARCH_FIELDS;
    output.constraintFields = CONSTRAINT_FIELDS;
  }
  if (showAll || filter === 'conditions') {
    output.conditions = CONDITIONS;
  }

  if (showAll || filter === 'mixins' || filter === 'architectures') {
    try {
      const registry = await loadRegistry(projectRoot);
      if (showAll || filter === 'mixins') {
        output.mixins = Object.entries(registry.mixins).map(([id, m]) => ({
          id,
          description: m.description || m.rationale?.split('\n')[0],
        }));
      }
      if (showAll || filter === 'architectures') {
        output.architectures = Object.entries(registry.nodes).map(([id, a]) => ({
          id,
          inherits: a.inherits,
          description: a.description,
        }));
      }
    } catch {
      if (showAll || filter === 'mixins') output.mixins = [];
      if (showAll || filter === 'architectures') output.architectures = [];
    }
  }

  return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
}
