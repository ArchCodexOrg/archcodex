/**
 * @arch archcodex.cli.mcp
 * @intent:cli-output
 *
 * MCP tool definitions for ArchCodex.
 * Core validation and discovery tools.
 * Extended tools are in tool-definitions-extended.ts.
 */

// Common projectRoot property for tool schemas (usually not needed - auto-detected from file path)
export const projectRootProperty = {
  type: 'string',
  description: 'Project root path (optional - auto-detected from file path by finding .arch/ directory)',
};

/**
 * Core tool definitions (help, validation, discovery).
 */
export const coreToolDefinitions = [
  {
    name: 'archcodex_help',
    description: '❓ Get help on ArchCodex commands - start here if unsure what to do',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          enum: ['creating', 'validating', 'understanding', 'refactoring', 'health', 'setup', 'specs', 'wiring'],
          description: 'Help topic (omit for topic list, or use "full" for all commands)',
        },
        full: {
          type: 'boolean',
          description: 'Show all commands grouped by topic',
        },
      },
    },
  },
  {
    name: 'archcodex_schema',
    description: 'Discover available options for creating/updating architectures (rules, conditions, mixins, architectures, examples, recipes)',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        filter: {
          type: 'string',
          enum: ['all', 'rules', 'fields', 'conditions', 'mixins', 'architectures'],
          description: 'Filter to specific category (default: all)',
        },
        examples: {
          type: 'string',
          enum: ['all', 'architectures', 'constraints', 'recipes'],
          description: 'Get working YAML examples for a category',
        },
        recipe: {
          type: 'string',
          description: 'Get a specific recipe by name (e.g., "domain-service", "repository", "controller")',
        },
        template: {
          type: 'boolean',
          description: 'Get the scaffold-able architecture template',
        },
      },
    },
  },
  {
    name: 'archcodex_check',
    description: `✓ Validate files against architecture rules. Supports BATCH MODE with glob patterns.

SINGLE FILE: {"files": ["src/service.ts"]}
BATCH MODE: {"files": ["src/**/*.ts"]} to check many files at once
WITH PROJECT: {"files": ["src/**/*.ts"], "project": true} for cross-file validation`,
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'File paths or glob patterns (e.g., ["src/**/*.ts"]). Use absolute paths for auto project detection.',
        },
        file: {
          type: 'string',
          description: 'Single file path (alias for files with one item). Use absolute paths for auto project detection.',
        },
        path: {
          type: 'string',
          description: 'Alias for file parameter',
        },
        strict: {
          type: 'boolean',
          description: 'Treat warnings as errors',
        },
        project: {
          type: 'boolean',
          description: 'Enable project-level validation (cross-file constraints, layer boundaries)',
        },
        registry: {
          type: 'string',
          description: 'Custom registry file or directory path (e.g., ".arch/registry/cli/command.yaml")',
        },
        registryPattern: {
          type: 'array',
          items: { type: 'string' },
          description: 'Load only matching registry patterns (e.g., ["cli/**", "core/*"])',
        },
      },
    },
  },
  {
    name: 'archcodex_read',
    description: `Get architectural constraints, layer boundaries, and coding hints for a file.
Returns: architecture ID, MUST/NEVER rules, import boundaries, relevant patterns.
Does NOT return file content — use the Read tool for that.

WHEN TO USE: Only when you need per-file detail not covered by session_context or plan_context.
SKIP IF: You already called session_context or plan_context and know the constraints.`,
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        file: {
          type: 'string',
          description: 'File path to get constraints for (absolute or relative). Alias: path',
        },
        path: {
          type: 'string',
          description: 'Alias for file parameter',
        },
        format: {
          type: 'string',
          enum: ['verbose', 'terse', 'ai'],
          description: 'Output format (default: ai)',
        },
      },
    },
  },
  {
    name: 'archcodex_discover',
    description: '🆕 Call this BEFORE creating new files to find the right @arch tag for your intent',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        query: {
          type: 'string',
          description: 'Natural language description of what you want to build',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default: 5)',
        },
        autoSync: {
          type: 'boolean',
          description: 'Automatically sync index if stale (default: uses discovery.auto_sync from config)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'archcodex_resolve',
    description: 'Get flattened architecture with all inherited constraints, mixins, and hints',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        archId: {
          type: 'string',
          description: 'Architecture ID to resolve',
        },
      },
      required: ['archId'],
    },
  },
  {
    name: 'archcodex_neighborhood',
    description: `Get import boundaries for a specific file (what can/cannot be imported, current imports with status).

WHEN TO USE: When adding imports to a file and need per-file forbidden/allowed list.
SKIP IF: plan_context already gave you layer boundaries and forbid rules for the scope.`,
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        file: {
          type: 'string',
          description: 'File path to analyze',
        },
      },
      required: ['file'],
    },
  },
  {
    name: 'archcodex_diff_arch',
    description: 'Compare two architectures to see constraint differences',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        from: {
          type: 'string',
          description: 'Source architecture ID',
        },
        to: {
          type: 'string',
          description: 'Target architecture ID',
        },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'archcodex_health',
    description: 'Get architectural health metrics (override debt, coverage, recommendations)',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        expiringDays: {
          type: 'number',
          description: 'Days threshold for expiring overrides (default: 30)',
        },
      },
    },
  },
  {
    name: 'archcodex_sync_index',
    description: 'Check and sync discovery index with registry (find missing/orphaned entries)',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        check: {
          type: 'boolean',
          description: 'Only check staleness, do not update (default: true)',
        },
        force: {
          type: 'boolean',
          description: 'Force regeneration even if up to date',
        },
      },
    },
  },
  {
    name: 'archcodex_consistency',
    description: 'Check cross-file consistency - find missing methods/exports compared to similar files with same architecture',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        file: {
          type: 'string',
          description: 'File to analyze for consistency issues',
        },
        threshold: {
          type: 'number',
          description: 'Minimum similarity to consider files comparable (0-1, default: 0.6)',
        },
        sameArchOnly: {
          type: 'boolean',
          description: 'Only compare files with same architecture (default: true)',
        },
      },
      required: ['file'],
    },
  },
  {
    name: 'archcodex_intents',
    description: 'Discover and validate semantic intent annotations (@intent:name)',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        action: {
          type: 'string',
          enum: ['list', 'show', 'usage', 'validate', 'suggest'],
          description: 'Action to perform (default: list). Use "suggest" to get intent suggestions for a file path or architecture.',
        },
        name: {
          type: 'string',
          description: 'Intent name (required for "show" action)',
        },
        file: {
          type: 'string',
          description: 'File path (for "validate" or "suggest" action)',
        },
        archId: {
          type: 'string',
          description: 'Architecture ID (for "suggest" action)',
        },
      },
    },
  },
  {
    name: 'archcodex_action',
    description: `🎯 CALL FIRST when user says "I want to add/create/implement X" - Returns architecture, checklist, intents, and file patterns for common tasks.

WHEN TO USE:
- User wants to add a new component/feature/module
- You need guidance on what architecture and patterns to use
- Before creating multiple related files

WORKFLOW:
1. archcodex_action (match query) → Get architecture + checklist
2. If action has linkedFeature → use archcodex_feature for multi-file scaffold
3. Create files with the recommended @arch tag
4. archcodex_check to validate`,
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        query: {
          type: 'string',
          description: 'What you want to do (e.g., "add a view", "create endpoint", "add validation rule")',
        },
        action: {
          type: 'string',
          enum: ['match', 'list', 'show'],
          description: 'Action to perform: "match" (default) finds actions matching query, "list" shows all actions, "show" shows details for a specific action',
        },
        name: {
          type: 'string',
          description: 'Action name (required for "show" action)',
        },
      },
    },
  },
  {
    name: 'archcodex_feature',
    description: `📦 Multi-file scaffolding - Use when archcodex_action returns a linkedFeature to create multiple related files together.

WHEN TO USE:
- Creating a feature that requires multiple coordinated files (e.g., handler + test, component + styles + story)
- The archcodex_action response shows linkedFeature with components
- You want to ensure all parts of a feature follow the same patterns

WORKFLOW:
1. archcodex_feature (list) → See available feature templates
2. archcodex_feature (preview, feature: "name", name: "MyFeature") → See files that would be created
3. Create the files based on the preview with proper @arch tags`,
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        action: {
          type: 'string',
          enum: ['list', 'show', 'preview'],
          description: 'Action to perform: "list" shows all features, "show" shows details, "preview" shows what files would be created',
        },
        feature: {
          type: 'string',
          description: 'Feature template name (required for "show" and "preview")',
        },
        name: {
          type: 'string',
          description: 'Name for the new feature (required for "preview")',
        },
      },
    },
  },
  {
    name: 'archcodex_types',
    description: `🔍 Type consistency analysis - Find duplicate and similar type definitions that should be consolidated.

WHEN TO USE:
- Before creating a new interface/type - check if similar one exists
- During refactoring - find types that drifted apart and should be unified
- Periodic codebase health check - part of garden analysis

WHAT IT DETECTS:
- Exact duplicates: Same name, same structure in different files
- Renamed duplicates: Different names but identical structure (copy-paste)
- Similar types (>80%): Types that drifted apart and may need consolidation

USE CASES:
- "I'm adding UserProfile type" → Check if similar type already exists
- "These two files have similar interfaces" → Confirm and get consolidation suggestions`,
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        files: {
          oneOf: [
            { type: 'string', description: 'Single file pattern' },
            { type: 'array', items: { type: 'string' }, description: 'Multiple file patterns' },
          ],
          description: 'File patterns to scan (accepts string or array of strings; default: all TypeScript files)',
        },
        threshold: {
          type: 'number',
          description: 'Minimum similarity percentage for "similar" types (default: 80)',
        },
        includePrivate: {
          type: 'boolean',
          description: 'Include non-exported types (default: false)',
        },
      },
    },
  },
];


