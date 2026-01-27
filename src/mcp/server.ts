/**
 * @arch archcodex.cli.mcp
 * @intent:cli-output
 *
 * ArchCodex MCP Server - Exposes ArchCodex functionality as MCP tools.
 * Handler implementations are in ./handlers/ for maintainability.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { resolve, dirname, isAbsolute } from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

// Read version from package.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(resolve(__dirname, '../../../package.json'), 'utf-8'));
const VERSION = packageJson.version;

// Utilities
import {
  getDefaultProjectRoot,
  resolveProjectRootFromFile,
  resolveProjectRootFromFiles,
  normalizeFilePath,
  normalizeFilePaths,
  normalizeFilesList,
  normalizeStringList,
} from './utils.js';

// Handlers
import {
  handleHelp,
  handleSchema,
  handleCheck,
  handleRead,
  handleDiscover,
  handleResolve,
  handleNeighborhood,
  handleDiffArch,
  handleHealth,
  handleSyncIndex,
  handleConsistency,
  handleTypes,
  handleIntents,
  handleAction,
  handleFeature,
  handleInfer,
  handleSessionContext,
  handlePlanContext,
  handleValidatePlan,
  handleImpact,
  handleWhy,
  handleDecide,
  handleScaffold,
} from './handlers/index.js';

const defaultProjectRoot = getDefaultProjectRoot();

// Common projectRoot property for tool schemas (usually not needed - auto-detected from file path)
const projectRootProperty = {
  type: 'string',
  description: 'Project root path (optional - auto-detected from file path by finding .arch/ directory)',
};

/**
 * Create and start the MCP server.
 */
async function main() {
  const server = new Server(
    { name: 'archcodex', version: VERSION },
    { capabilities: { tools: {}, prompts: {} } }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'archcodex_help',
        description: '❓ Get help on ArchCodex commands - start here if unsure what to do',
        inputSchema: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              enum: ['creating', 'validating', 'understanding', 'refactoring', 'health', 'setup'],
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
        description: `Read a file with hydrated architectural constraints, hints, and allowed imports.

WHEN TO USE: Only when you need per-file detail not covered by session_context or plan_context.
SKIP IF: You already called session_context or plan_context and know the constraints.`,
        inputSchema: {
          type: 'object',
          properties: {
            projectRoot: projectRootProperty,
            file: {
              type: 'string',
              description: 'File path to read (absolute or relative). Alias: path',
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
    ],
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Extract file paths from args to auto-detect project root
    // Support various parameter names: file, path, files (agents use different names)
    // Also support both string and object formats (with path property)
    const filePaths: string[] = [];
    if (args?.file) {
      try {
        filePaths.push(normalizeFilePath(args.file as string | Record<string, unknown>));
      } catch {
        // Skip invalid file format for project detection
      }
    }
    if (args?.path) {
      try {
        filePaths.push(normalizeFilePath(args.path as string | Record<string, unknown>));
      } catch {
        // Skip invalid path format for project detection
      }
    }
    if (Array.isArray(args?.files)) {
      try {
        filePaths.push(...normalizeFilePaths(args.files as (string | Record<string, unknown>)[]));
      } catch {
        // Skip invalid files format for project detection
      }
    }

    // Reject relative paths - require absolute paths for reliable project detection
    // UNLESS projectRoot is explicitly provided
    const relativePath = filePaths.find(p => !isAbsolute(p));
    if (relativePath && !args?.projectRoot) {
      return {
        content: [{
          type: 'text',
          text: `Error: Use absolute path instead of "${relativePath}".\n\n` +
            `To use relative paths, explicitly provide projectRoot parameter:\n` +
            `${JSON.stringify({ projectRoot: "/absolute/path/to/project", ...args })}\n\n` +
            `Or use absolute paths (most editors provide these in file context).`,
        }],
        isError: true,
      };
    }

    // Try all file paths to find project root (not just the first)
    const root = await resolveProjectRootFromFiles(defaultProjectRoot, filePaths, args?.projectRoot as string | undefined);

    try {
      switch (name) {
        case 'archcodex_help':
          return handleHelp({
            topic: args?.topic as string | undefined,
            full: args?.full as boolean | undefined,
          });

        case 'archcodex_schema':
          return await handleSchema(root, {
            filter: args?.filter as string | undefined,
            examples: args?.examples as string | undefined,
            recipe: args?.recipe as string | undefined,
            template: args?.template as boolean | undefined,
          });

        case 'archcodex_check': {
          // Support multiple parameter formats:
          // - files: can be string OR array of strings/objects
          // - file: can be string OR object
          // - path: can be string OR object (alias for file)
          let checkFiles: string[] | undefined;
          if (args?.files) {
            checkFiles = normalizeFilesList(args.files as string | Record<string, unknown> | (string | Record<string, unknown>)[]);
          } else if (args?.file) {
            checkFiles = [normalizeFilePath(args.file as string | Record<string, unknown>)];
          } else if (args?.path) {
            checkFiles = [normalizeFilePath(args.path as string | Record<string, unknown>)];
          }
          const registryPattern = args?.registryPattern
            ? normalizeStringList(args.registryPattern as string | string[] | undefined)
            : undefined;
          return await handleCheck(root, checkFiles, {
            strict: args?.strict as boolean | undefined,
            project: args?.project as boolean | undefined,
            registry: args?.registry as string | undefined,
            registryPattern: registryPattern && registryPattern.length > 0 ? registryPattern : undefined,
          });
        }

        case 'archcodex_read': {
          // Support both 'file' and 'path' parameter names (string or object)
          const readFile = normalizeFilePath((args?.file || args?.path) as string | Record<string, unknown>);
          return await handleRead(root, readFile, args?.format as string);
        }

        case 'archcodex_discover':
          return await handleDiscover(root, args?.query as string, {
            limit: args?.limit as number | undefined,
            autoSync: args?.autoSync as boolean | undefined,
          });

        case 'archcodex_resolve':
          return await handleResolve(root, args?.archId as string);

        case 'archcodex_neighborhood': {
          const neighborhoodFile = normalizeFilePath(args?.file as string | Record<string, unknown>);
          return await handleNeighborhood(root, neighborhoodFile);
        }

        case 'archcodex_diff_arch':
          return await handleDiffArch(root, args?.from as string, args?.to as string);

        case 'archcodex_health':
          return await handleHealth(root, args?.expiringDays as number | undefined);

        case 'archcodex_sync_index':
          return await handleSyncIndex(root, args?.check as boolean | undefined, args?.force as boolean);

        case 'archcodex_consistency': {
          const consistencyFile = args?.file ? normalizeFilePath(args.file as string | Record<string, unknown>) : undefined;
          if (!consistencyFile) {
            return {
              content: [{
                type: 'text',
                text: `Error: file parameter is required for consistency check\n\n` +
                  `Usage: {"file": "/path/to/file.ts"} or {"file": {"path": "/path/to/file.ts"}}`,
              }],
              isError: true,
            };
          }
          return await handleConsistency(root, consistencyFile, {
            threshold: args?.threshold as number | undefined,
            sameArchOnly: args?.sameArchOnly as boolean | undefined,
          });
        }

        case 'archcodex_intents': {
          const intentsFile = args?.file ? normalizeFilePath(args.file as string | Record<string, unknown>) : undefined;
          return await handleIntents(root, {
            action: args?.action as string | undefined,
            name: args?.name as string | undefined,
            file: intentsFile,
            archId: args?.archId as string | undefined,
          });
        }

        case 'archcodex_action':
          return await handleAction(root, {
            query: args?.query as string | undefined,
            action: args?.action as string | undefined,
            name: args?.name as string | undefined,
          });

        case 'archcodex_feature':
          return await handleFeature(root, {
            action: args?.action as string | undefined,
            feature: args?.feature as string | undefined,
            name: args?.name as string | undefined,
          });

        case 'archcodex_types': {
          const typesFiles = args?.files
            ? normalizeFilesList(args.files as string | Record<string, unknown> | (string | Record<string, unknown>)[])
            : [];
          return await handleTypes(root, {
            files: typesFiles.length > 0 ? typesFiles : undefined,
            threshold: args?.threshold as number | undefined,
            includePrivate: args?.includePrivate as boolean | undefined,
          });
        }

        case 'archcodex_scaffold':
          return await handleScaffold(root, {
            archId: args?.archId as string,
            name: args?.name as string,
            output: args?.output as string | undefined,
            template: args?.template as string | undefined,
            dryRun: args?.dryRun as boolean | undefined,
          });

        case 'archcodex_infer': {
          const inferFiles = args?.files
            ? normalizeFilesList(args.files as string | Record<string, unknown> | (string | Record<string, unknown>)[])
            : [];
          return await handleInfer(root, {
            files: inferFiles,
            untaggedOnly: args?.untaggedOnly as boolean | undefined,
          });
        }

        case 'archcodex_why': {
          const whyFile = normalizeFilePath(args?.file as string | Record<string, unknown>);
          return await handleWhy(root, {
            file: whyFile,
            constraint: args?.constraint as string | undefined,
          });
        }

        case 'archcodex_decide':
          return await handleDecide(root, {
            action: args?.action as string | undefined,
            answer: args?.answer as boolean | undefined,
            sessionId: args?.sessionId as string | undefined,
          });

        case 'archcodex_session_context':
          return await handleSessionContext(root, {
            patterns: args?.patterns as string[] | undefined,
            full: args?.full as boolean | undefined,
            withPatterns: args?.withPatterns as boolean | undefined,
            withDuplicates: args?.withDuplicates as boolean | undefined,
            withoutLayers: args?.withoutLayers as boolean | undefined,
            scope: args?.scope as string[] | undefined,
          });

        case 'archcodex_impact': {
          const impactFile = normalizeFilePath(args?.file as string | Record<string, unknown>);
          return await handleImpact(root, {
            file: impactFile,
            depth: args?.depth as number | undefined,
          });
        }

        case 'archcodex_plan_context':
          return await handlePlanContext(root, {
            scope: args?.scope as string[] | undefined,
            files: args?.files as string[] | undefined,
          });

        case 'archcodex_validate_plan':
          return await handleValidatePlan(root, {
            changes: args?.changes as Array<{ path: string; action: string; archId?: string; newImports?: string[]; codePatterns?: string[]; newPath?: string }>,
          });

        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Add context for registry/project errors to help agents understand what went wrong
      const isRegistryError = errorMessage.includes('Registry') || errorMessage.includes('.arch');
      const contextInfo = isRegistryError
        ? `\n\nContext: Looking for .arch/ in project root: ${root}` +
          (filePaths.length > 0 ? `\nFile(s) requested: ${filePaths.join(', ')}` : '') +
          `\n\nIf this project should use ArchCodex, run 'archcodex init' in the project directory.` +
          `\nIf this project doesn't use ArchCodex, the file can be read normally without architectural constraints.`
        : '';

      return {
        content: [{ type: 'text', text: `Error: ${errorMessage}${contextInfo}` }],
        isError: true,
      };
    }
  });

  // List available prompts
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: 'archcodex_workflow',
        description: 'Workflow guide for working with ArchCodex-enabled codebases',
      },
      {
        name: 'archcodex_before_edit',
        description: 'Context to load before editing a file',
        arguments: [
          {
            name: 'file',
            description: 'File path to get context for',
            required: true,
          },
        ],
      },
    ],
  }));

  // Get prompt content
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'archcodex_workflow':
        return {
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: `# ArchCodex Workflow

This codebase uses ArchCodex for architectural enforcement. Follow this workflow:

## Before Reading/Editing Files
Use \`archcodex_read\` to get architectural context:
- Constraints (what's forbidden/required)
- Hints (behavioral guidance)
- Import boundaries

## Before Creating New Files

### Option A: User says "I want to add X" → Use Action-Based Discovery
1. \`archcodex_action\` with query → Get architecture, checklist, and file patterns
2. If response shows \`linkedFeature\` → Use \`archcodex_feature\` for multi-file scaffold
3. Follow the checklist and create files with the recommended @arch tag

### Option B: Simple file creation → Use Discovery
1. \`archcodex_discover\` with description → Find matching architecture ID
2. Create file with the @arch tag

## Creating Multi-File Features
When you need to create related files together (e.g., handler + test):
1. \`archcodex_feature\` (list) → See available templates
2. \`archcodex_feature\` (preview) → See what files would be created
3. Create files based on the preview

## Checking Type Consistency
Before creating new types/interfaces:
- \`archcodex_types\` → Check if similar types already exist
- Avoid creating duplicate types that should be consolidated

## After Making Changes
Use \`archcodex_check\` to validate:
- Check for constraint violations
- Review suggestions for fixes
- Use \`project: true\` for cross-file validation

## Key Commands
- \`archcodex_read\` - Get file context (ALWAYS do this first)
- \`archcodex_check\` - Validate changes
- \`archcodex_action\` - "I want to add X" → guidance for common tasks
- \`archcodex_feature\` - Multi-file scaffolding
- \`archcodex_types\` - Check for duplicate types
- \`archcodex_discover\` - Find architecture for new files
- \`archcodex_resolve\` - See full architecture rules
- \`archcodex_neighborhood\` - See import boundaries`,
            },
          }],
        };

      case 'archcodex_before_edit': {
        const file = args?.file as string;
        if (!file) {
          return {
            messages: [{
              role: 'user',
              content: { type: 'text', text: 'Error: file argument is required' },
            }],
          };
        }

        // Get the architectural context for the file
        const root = await resolveProjectRootFromFile(defaultProjectRoot, file);
        const result = await handleRead(root, file, 'ai');
        const contextText = (result.content[0] as { text: string }).text;

        return {
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: `# Architectural Context for ${file}

Before editing this file, review its constraints and hints:

${contextText}

Remember to run \`archcodex_check\` after making changes.`,
            },
          }],
        };
      }

      default:
        return {
          messages: [{
            role: 'user',
            content: { type: 'text', text: `Unknown prompt: ${name}` },
          }],
        };
    }
  });

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
