/**
 * @arch archcodex.cli.mcp
 * @intent:cli-output
 *
 * Extended MCP tool definitions for ArchCodex.
 * Contains context, analysis, and spec tools.
 * Split from tool-definitions.ts for maintainability.
 */

import { projectRootProperty } from './tool-definitions.js';

/**
 * Extended tool definitions (scaffold, context, analysis, spec tools).
 */
export const extendedToolDefinitions = [
  {
    name: 'archcodex_scaffold',
    description: '🆕 Generate a new file from architecture template with proper @arch tag and structure',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        archId: {
          type: 'string',
          description: 'Architecture ID (e.g., domain.service)',
        },
        name: {
          type: 'string',
          description: 'Name for the class/component',
        },
        output: {
          type: 'string',
          description: 'Output directory',
        },
        template: {
          type: 'string',
          description: 'Custom template file',
        },
        dryRun: {
          type: 'boolean',
          description: 'Preview without writing files',
        },
      },
      required: ['archId', 'name'],
    },
  },
  {
    name: 'archcodex_infer',
    description: '🔍 Suggest architecture for file(s) based on content analysis - useful for untagged or legacy files',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        files: {
          oneOf: [
            { type: 'string', description: 'Single file path or glob pattern' },
            { type: 'array', items: { type: 'string' }, description: 'Multiple file paths or glob patterns' },
          ],
          description: 'File paths or glob patterns (accepts string or array of strings)',
        },
        untaggedOnly: {
          type: 'boolean',
          description: 'Only analyze files without @arch tags',
        },
      },
      required: ['files'],
    },
  },
  {
    name: 'archcodex_why',
    description: '❓ Explain why a constraint applies to a file - traces inheritance chain to show source',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        file: {
          type: 'string',
          description: 'File path to analyze',
        },
        constraint: {
          type: 'string',
          description: 'Specific constraint to explain (e.g., forbid_import:axios)',
        },
      },
      required: ['file'],
    },
  },
  {
    name: 'archcodex_decide',
    description: '🌳 Navigate decision tree to find the right architecture - answers yes/no questions to reach a recommendation',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        action: {
          type: 'string',
          enum: ['start', 'answer', 'show-tree'],
          description: 'Action: start new session, answer question, or show tree structure',
        },
        answer: {
          type: 'boolean',
          description: 'Answer to current question (true=yes, false=no)',
        },
        sessionId: {
          type: 'string',
          description: 'Session ID for multi-turn navigation (returned from previous call)',
        },
      },
    },
  },
  {
    name: 'archcodex_session_context',
    description: `🚀 CALL AT SESSION START to prime context with architecture summaries - reduces subsequent tool calls by providing compact overview of all constraints affecting files in scope.

DEFAULTS: Compact output with deduplicated constraints and layer boundaries (optimized for agents).
Use 'full: true' for verbose JSON output.

WHEN TO USE:
- At the start of a coding session to understand the codebase constraints
- Before working on multiple files in a directory
- When you want to minimize per-file archcodex_read calls

RETURNS (compact format):
- Layer boundaries (what can import what)
- Shared constraints (deduplicated across all architectures)
- Per-architecture unique constraints, hints, patterns
- Untagged files that need attention
- Canonical patterns (with withPatterns: true) to avoid creating duplicates`,
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        patterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Glob patterns for files to analyze (default: ["src/**/*.ts", "src/**/*.tsx"])',
        },
        full: {
          type: 'boolean',
          description: 'Use verbose JSON output instead of compact format (default: false)',
        },
        withPatterns: {
          type: 'boolean',
          description: 'Include canonical patterns from .arch/patterns.yaml (reusable implementations)',
        },
        withDuplicates: {
          type: 'boolean',
          description: 'Keep duplicate constraints per architecture instead of deduplicating (default: false)',
        },
        withoutLayers: {
          type: 'boolean',
          description: 'Exclude layer boundary map from output (default: false)',
        },
        scope: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter to specific directory paths',
        },
      },
    },
  },
  {
    name: 'archcodex_plan_context',
    description: `🗺️ CALL AT PLAN START - Gets scope-aware architecture context with layer boundaries, deduplicated constraints, and canonical patterns in a single call.

WHEN TO USE:
- Starting plan mode - get all constraints for the area you'll be working in
- Working on a specific directory or set of files
- Before designing multi-file changes

REPLACES multiple calls to: session_context + read + neighborhood + impact

OUTPUT (~400 tokens for typical scope):
- Layer boundaries (what can/cannot be imported)
- Shared constraints (deduplicated across architectures)
- Per-architecture unique rules, hints, and reference implementations
- Relevant canonical patterns (to avoid code duplication)`,
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        scope: {
          type: 'array',
          items: { type: 'string' },
          description: 'Paths to include: directories (expanded to **/*.ts), files (used directly), or globs. Auto-detects based on extension. Examples: ["src/core/", "src/utils/helper.ts", "**/*.test.ts"]',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: '(Deprecated - use scope instead) Specific files. The scope parameter now auto-detects files vs directories.',
        },
      },
    },
  },
  {
    name: 'archcodex_validate_plan',
    description: `✅ Validate a proposed change set BEFORE execution - catches architectural violations during planning.

WHEN TO USE:
- After designing changes but BEFORE writing code
- To verify imports, layer boundaries, and naming patterns are correct
- To check if new files have the right @arch tag

ACCEPTS:
- List of file changes (create/modify/delete) with proposed imports and patterns
- Returns violations, warnings, and impacted files`,
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        changes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path (relative to project root)' },
              action: { type: 'string', enum: ['create', 'modify', 'delete', 'rename'], description: 'Type of change' },
              archId: { type: 'string', description: 'Architecture ID for new files (required for create)' },
              newImports: { type: 'array', items: { type: 'string' }, description: 'New imports being added' },
              codePatterns: { type: 'array', items: { type: 'string' }, description: 'Code patterns that will appear' },
              newPath: { type: 'string', description: 'New path for rename actions' },
            },
            required: ['path', 'action'],
          },
          description: 'List of proposed file changes',
        },
      },
      required: ['changes'],
    },
  },
  {
    name: 'archcodex_impact',
    description: `⚠️ Call BEFORE refactoring - shows what files import this file and what would break.

WHEN TO USE:
- Before modifying exports or renaming functions
- Before deleting or moving files
- To understand how changes propagate through the codebase

RETURNS:
- Direct importers (files that directly import this file)
- Total dependents (transitive imports up to configurable depth)
- Warning if high-impact change (>10 dependents)
- Architecture IDs of affected files`,
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        file: {
          type: 'string',
          description: 'File to analyze impact for',
        },
        depth: {
          type: 'number',
          description: 'Max depth for transitive dependents (default: 2)',
        },
      },
      required: ['file'],
    },
  },
  {
    name: 'archcodex_entity_context',
    description: `🧠 Get synthesized mental model for an entity - schema, relationships, behaviors, and existing operations.

USAGE:
- No entity param → list all entities in schema (fast, cached)
- With entity param → exact match shows full context, partial match searches

WHEN TO USE:
- Before working on entity-related operations (duplicate, delete, archive)
- To understand data model and relationships
- To find similar operations in the codebase

RETURNS:
- Entity fields and types
- Relationships (has_many, belongs_to, many_to_many)
- Detected behaviors (soft_delete, ordering, audit_trail)
- Existing CRUD operations for the entity
- Similar operations (duplicate*, clone*, copy*) in codebase

NOTE: Auto-detects schema location by walking up directories (convex/schema.ts, prisma/schema.prisma).`,
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        entity: {
          oneOf: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' } },
          ],
          description: 'Entity name(s) - string, comma-separated, or array. Omit to list all, exact name for full context, partial to search.',
        },
        name: {
          oneOf: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' } },
          ],
          description: 'Alias for "entity" - use either one.',
        },
        operation: {
          type: 'string',
          description: 'Operation hint (e.g., "duplicate", "delete", "archive")',
        },
        format: {
          type: 'string',
          enum: ['yaml', 'json', 'compact'],
          description: 'Output format (default: yaml)',
        },
        refresh: {
          type: 'boolean',
          description: 'Force cache refresh (re-extract schema)',
        },
        maxFiles: {
          type: 'number',
          description: 'Maximum file references to return (default: 15). Direct/related files are always kept.',
        },
        verbose: {
          type: 'boolean',
          description: 'Return all file references without filtering (default: false)',
        },
      },
    },
  },
  {
    name: 'archcodex_map',
    description: `🗺️ Query the architecture map - understand how files relate to each other through @arch tags and imports.

USAGE:
- No params → overview of architectures and file counts
- entity param → all files related to an entity (e.g., "todos", "User")
- architecture param → all files in an architecture (e.g., "convex.mutation")
- file param → imports/importedBy for a specific file
- module param → FULL CONTEXT for a directory including files, internal imports, external dependencies, consumers, and entity references

WHEN TO USE:
- "Show me everything about the db module" → use module: "src/core/db/"
- "What files are in the health system?" → use module: "src/core/health/"
- "How does the MCP handlers module work?" → use module: "src/mcp/handlers/"
- To understand which files belong to which architecture
- To find all files touching a specific entity
- To trace import relationships between files

The module query is especially useful for understanding a subsystem - it shows all files, how they connect internally, what they depend on externally, and who uses them.

NOTE: First call may take a few seconds to scan the project. Subsequent calls are fast.`,
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        entity: {
          type: 'string',
          description: 'Entity name to find related files (e.g., "todos", "User")',
        },
        architecture: {
          type: 'string',
          description: 'Architecture ID to list files (e.g., "convex.mutation"). Use % for wildcard (e.g., "convex.%")',
        },
        file: {
          type: 'string',
          description: 'File path to get import graph',
        },
        module: {
          type: 'string',
          description: 'Module/directory path to get full context (e.g., "src/core/db/")',
        },
        depth: {
          type: 'number',
          description: 'Import graph traversal depth (default: 2)',
        },
        refresh: {
          type: 'boolean',
          description: 'Force re-scan before query',
        },
      },
    },
  },
  {
    name: 'archcodex_context',
    description: `🎯 UNIFIED CONTEXT - Get everything an LLM needs to modify code in one call.

Combines module structure (archcodex_map) with entity schemas (archcodex_entity_context) into a single, LLM-optimized output.

WHAT YOU GET:
1. Modification Order - DEFINES → IMPLEMENTS → ORCHESTRATES with impact counts
2. Layer Boundaries - CAN/CANNOT import lists
3. Entity Schemas - Fields, relationships, behaviors for entities in the module
4. Impact - External consumers that would break if exports change
5. ArchCodex - Constraints, hints, and validation command

WHEN TO USE:
- Before modifying a module: archcodex_context { "module": "src/core/db/" }
- Before working with an entity: archcodex_context { "entity": "User" }

OUTPUT (~1-2k tokens, optimized for LLMs):
- Files grouped by role with 🔴breaks count
- Entity schemas with behaviors (soft_delete, ordering)
- Validation command to run after changes

REPLACES multiple calls to: archcodex_map + archcodex_entity_context + archcodex_plan_context`,
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        module: {
          type: 'string',
          description: 'Module/directory path (e.g., "src/core/db/")',
        },
        entity: {
          type: 'string',
          description: 'Entity name (e.g., "User", "todos")',
        },
        format: {
          type: 'string',
          enum: ['compact', 'full', 'json'],
          description: 'Output format (default: compact - optimized for LLMs)',
        },
        sections: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['project-rules', 'modification-order', 'boundaries', 'entities', 'impact', 'constraints'],
          },
          description: 'Filter to specific sections (default: all). Options: project-rules, modification-order, boundaries, entities, impact, constraints',
        },
        confirm: {
          type: 'boolean',
          description: 'Bypass interactive mode for large modules (>30 files). Set to true to get full output.',
        },
        summary: {
          type: 'boolean',
          description: 'Return structure summary only (submodule counts, layer boundaries, no file lists)',
        },
        brief: {
          type: 'boolean',
          description: 'Return minimal essential info only (arch, boundaries, forbidden). Best for simple tasks.',
        },
      },
    },
  },
  {
    name: 'archcodex_spec_init',
    description: `🆕 Initialize SpecCodex with base specs and mixins.

Creates the .arch/specs/ directory structure with:
- _base.yaml: Base specs (spec.function, spec.mutation, spec.query)
- _mixins.yaml: Reusable mixins (requires_auth, logs_audit, rate_limited)
- example.spec.yaml: Example spec demonstrating features (unless minimal)

PREREQUISITES: Run archcodex init first to create .arch/ directory.

WHEN TO USE:
- Setting up SpecCodex for the first time
- After running archcodex init on a new project`,
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        force: {
          type: 'boolean',
          description: 'Overwrite existing files (default: false)',
        },
        minimal: {
          type: 'boolean',
          description: 'Only create essential files, skip example (default: false)',
        },
      },
    },
  },
  {
    name: 'archcodex_spec_scaffold_touchpoints',
    description: `🎯 Generate a spec YAML with ui.touchpoints auto-populated from component groups.

WHEN TO USE:
- Creating a new spec for a feature that affects multiple UI components
- When entity maps to a component group (e.g., product cards)
- To ensure all UI touchpoints are documented in the spec

WHAT IT DOES:
1. Looks up component groups matching the entity
2. Derives handler name from spec ID (e.g., duplicate → handleDuplicate)
3. Generates touchpoints for each component in the matched group
4. Returns complete spec YAML with ui.touchpoints populated

USAGE:
- Basic: {"specId": "spec.product.duplicate", "entity": "products"}
- With operation: {"specId": "spec.product.archive", "entity": "products", "operation": "archive"}`,
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        specId: {
          type: 'string',
          description: 'Spec ID to generate (e.g., "spec.product.duplicate")',
        },
        entity: {
          type: 'string',
          description: 'Entity name for component group lookup (e.g., "products")',
        },
        operation: {
          type: 'string',
          description: 'Operation name for handler derivation (auto-derived from specId if not provided)',
        },
      },
      required: ['specId', 'entity'],
    },
  },
  {
    name: 'archcodex_feature_audit',
    description: `🔍 Comprehensive feature verification across backend, frontend, and UI layers.

WHEN TO USE:
- After implementing a feature to verify all layers are wired
- To check if a mutation is properly exported, hooked, and UI-connected
- When debugging why a feature isn't working end-to-end

WHAT IT CHECKS:
- Backend: Mutation exists in convex/, exported from barrel
- Frontend: Hook wrapper exists, handler function exists
- UI: Each component in matched group references the handler

USAGE:
- Audit mutation: {"mutation": "duplicateProduct"}
- Audit with entity: {"mutation": "duplicateProduct", "entity": "products"}
- Entity-only (UI focus): {"entity": "products"}`,
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        mutation: {
          type: 'string',
          description: 'Mutation name to audit (e.g., "duplicateProduct")',
        },
        entity: {
          type: 'string',
          description: 'Entity name for UI component group matching (e.g., "products")',
        },
        verbose: {
          type: 'boolean',
          description: 'Show detailed information including expected values (default: false)',
        },
      },
    },
  },
  {
    name: 'archcodex_analyze',
    description: `🔬 Schema-inferred analysis — detects logic, security, data, consistency, completeness, and other issues by cross-referencing spec, architecture, and component group YAML schemas.

WHEN TO USE:
- After writing or modifying specs to check for issues
- To find security gaps, data integrity problems, or logic errors in specs
- To verify consistency between specs and architectures
- As part of a spec review workflow

CATEGORIES (66 analyses):
- security (14): Auth gaps, missing rate limits, permission mismatches, DoS vectors
- logic (13): Contradictory invariants, unreachable branches, coverage gaps
- data (11): Sensitive leakage, missing cascades, type mismatches, partial writes
- consistency (11): Arch-spec mismatches, layer violations, inheritance conflicts, drift
- completeness (8): Missing examples, orphaned specs, CRUD gaps
- other (9): Effect complexity, deprecated usage, N+1 risks

USAGE:
- All analyses: {}
- Security only: {"category": "security"}
- Errors only: {"severity": "error"}
- Specific spec: {"specIds": ["spec.user.create"]}`,
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: projectRootProperty,
        category: {
          type: 'string',
          description: 'Filter by category (comma-separated: logic,security,data,consistency,completeness,other)',
        },
        severity: {
          type: 'string',
          description: 'Minimum severity threshold: error, warning, or info (default: info)',
          enum: ['error', 'warning', 'info'],
        },
        specIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter to specific spec IDs',
        },
      },
    },
  },
];
