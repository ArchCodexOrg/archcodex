/**
 * @arch archcodex.cli.mcp
 * @intent:cli-output
 *
 * ArchCodex MCP Server - Exposes ArchCodex functionality as MCP tools.
 * Handler implementations are in ./handlers/ for maintainability.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from '../utils/logger.js';
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

// Type-safe argument extraction
import {
  getString,
  getBoolean,
  getNumber,
  getStringArray,
  getArray,
  getRaw,
  hasArg,
} from './arg-parser.js';

// Tool definitions (extracted for maintainability)
import { coreToolDefinitions } from './tool-definitions.js';
import { extendedToolDefinitions } from './tool-definitions-extended.js';

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
  handleEntityContext,
  handleArchitectureMap,
  handleUnifiedContext,
  handleSpecInit,
  handleSpecScaffoldTouchpoints,
  handleFeatureAudit,
  handleAnalyze,
} from './handlers/index.js';

const defaultProjectRoot = getDefaultProjectRoot();

/**
 * Create and start the MCP server.
 */
async function main() {
  const server = new Server(
    { name: 'archcodex', version: VERSION },
    { capabilities: { tools: {}, prompts: {} } }
  );

  // List available tools (definitions extracted to tool-definitions.ts)
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...coreToolDefinitions, ...extendedToolDefinitions],
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Extract file paths from args to auto-detect project root
    // Support various parameter names: file, path, files (agents use different names)
    // Also support both string and object formats (with path property)
    const filePaths: string[] = [];
    if (hasArg(args, 'file')) {
      try {
        filePaths.push(normalizeFilePath(getRaw(args, 'file') as string | Record<string, unknown>));
      } catch { /* skip invalid file format for project detection */ }
    }
    if (hasArg(args, 'path')) {
      try {
        filePaths.push(normalizeFilePath(getRaw(args, 'path') as string | Record<string, unknown>));
      } catch { /* skip invalid path format for project detection */ }
    }
    if (Array.isArray(getRaw(args, 'files'))) {
      try {
        filePaths.push(...normalizeFilePaths(getRaw(args, 'files') as (string | Record<string, unknown>)[]));
      } catch { /* skip invalid files format for project detection */ }
    }
    // Support scope parameter (used by plan_context)
    if (Array.isArray(getRaw(args, 'scope'))) {
      try {
        filePaths.push(...normalizeFilePaths(getRaw(args, 'scope') as (string | Record<string, unknown>)[]));
      } catch { /* skip invalid scope format for project detection */ }
    }
    // Support module parameter (used by map)
    if (hasArg(args, 'module')) {
      try {
        filePaths.push(normalizeFilePath(getRaw(args, 'module') as string | Record<string, unknown>));
      } catch { /* skip invalid module format for project detection */ }
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
    const root = await resolveProjectRootFromFiles(defaultProjectRoot, filePaths, getString(args, 'projectRoot'));

    try {
      switch (name) {
        case 'archcodex_help':
          return handleHelp({
            topic: getString(args, 'topic'),
            full: getBoolean(args, 'full'),
          });

        case 'archcodex_schema':
          return await handleSchema(root, {
            filter: getString(args, 'filter'),
            examples: getString(args, 'examples'),
            recipe: getString(args, 'recipe'),
            template: getBoolean(args, 'template'),
          });

        case 'archcodex_check': {
          // Support multiple parameter formats:
          // - files: can be string OR array of strings/objects
          // - file: can be string OR object
          // - path: can be string OR object (alias for file)
          let checkFiles: string[] | undefined;
          if (hasArg(args, 'files')) {
            checkFiles = normalizeFilesList(getRaw(args, 'files') as string | Record<string, unknown> | (string | Record<string, unknown>)[]);
          } else if (hasArg(args, 'file')) {
            checkFiles = [normalizeFilePath(getRaw(args, 'file') as string | Record<string, unknown>)];
          } else if (hasArg(args, 'path')) {
            checkFiles = [normalizeFilePath(getRaw(args, 'path') as string | Record<string, unknown>)];
          }
          const registryPattern = hasArg(args, 'registryPattern')
            ? normalizeStringList(getRaw(args, 'registryPattern') as string | string[] | undefined)
            : undefined;
          return await handleCheck(root, checkFiles, {
            strict: getBoolean(args, 'strict'),
            project: getBoolean(args, 'project'),
            registry: getString(args, 'registry'),
            registryPattern: registryPattern && registryPattern.length > 0 ? registryPattern : undefined,
          });
        }

        case 'archcodex_read': {
          // Support both 'file' and 'path' parameter names (string or object)
          const readFile = normalizeFilePath((getRaw(args, 'file') || getRaw(args, 'path')) as string | Record<string, unknown>);
          return await handleRead(root, readFile, getString(args, 'format'));
        }

        case 'archcodex_discover':
          return await handleDiscover(root, getString(args, 'query') as string, {
            limit: getNumber(args, 'limit'),
            autoSync: getBoolean(args, 'autoSync'),
          });

        case 'archcodex_resolve':
          return await handleResolve(root, getString(args, 'archId') as string);

        case 'archcodex_neighborhood': {
          const neighborhoodFile = normalizeFilePath(getRaw(args, 'file') as string | Record<string, unknown>);
          return await handleNeighborhood(root, neighborhoodFile);
        }

        case 'archcodex_diff_arch':
          return await handleDiffArch(root, getString(args, 'from') as string, getString(args, 'to') as string);

        case 'archcodex_health':
          return await handleHealth(root, getNumber(args, 'expiringDays'));

        case 'archcodex_sync_index':
          return await handleSyncIndex(root, getBoolean(args, 'check'), getBoolean(args, 'force'));

        case 'archcodex_consistency': {
          const consistencyFile = hasArg(args, 'file') ? normalizeFilePath(getRaw(args, 'file') as string | Record<string, unknown>) : undefined;
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
            threshold: getNumber(args, 'threshold'),
            sameArchOnly: getBoolean(args, 'sameArchOnly'),
          });
        }

        case 'archcodex_intents': {
          const intentsFile = hasArg(args, 'file') ? normalizeFilePath(getRaw(args, 'file') as string | Record<string, unknown>) : undefined;
          return await handleIntents(root, {
            action: getString(args, 'action'),
            name: getString(args, 'name'),
            file: intentsFile,
            archId: getString(args, 'archId'),
          });
        }

        case 'archcodex_action':
          return await handleAction(root, {
            query: getString(args, 'query'),
            action: getString(args, 'action'),
            name: getString(args, 'name'),
          });

        case 'archcodex_feature':
          return await handleFeature(root, {
            action: getString(args, 'action'),
            feature: getString(args, 'feature'),
            name: getString(args, 'name'),
          });

        case 'archcodex_types': {
          const typesFiles = hasArg(args, 'files')
            ? normalizeFilesList(getRaw(args, 'files') as string | Record<string, unknown> | (string | Record<string, unknown>)[])
            : [];
          return await handleTypes(root, {
            files: typesFiles.length > 0 ? typesFiles : undefined,
            threshold: getNumber(args, 'threshold'),
            includePrivate: getBoolean(args, 'includePrivate'),
          });
        }

        case 'archcodex_scaffold':
          return await handleScaffold(root, {
            archId: getString(args, 'archId') as string,
            name: getString(args, 'name') as string,
            output: getString(args, 'output'),
            template: getString(args, 'template'),
            dryRun: getBoolean(args, 'dryRun'),
          });

        case 'archcodex_infer': {
          const inferFiles = hasArg(args, 'files')
            ? normalizeFilesList(getRaw(args, 'files') as string | Record<string, unknown> | (string | Record<string, unknown>)[])
            : [];
          return await handleInfer(root, {
            files: inferFiles,
            untaggedOnly: getBoolean(args, 'untaggedOnly'),
          });
        }

        case 'archcodex_why': {
          const whyFile = normalizeFilePath(getRaw(args, 'file') as string | Record<string, unknown>);
          return await handleWhy(root, {
            file: whyFile,
            constraint: getString(args, 'constraint'),
          });
        }

        case 'archcodex_decide':
          return await handleDecide(root, {
            action: getString(args, 'action'),
            answer: getBoolean(args, 'answer'),
            sessionId: getString(args, 'sessionId'),
          });

        case 'archcodex_session_context':
          return await handleSessionContext(root, {
            patterns: getStringArray(args, 'patterns'),
            full: getBoolean(args, 'full'),
            withPatterns: getBoolean(args, 'withPatterns'),
            withDuplicates: getBoolean(args, 'withDuplicates'),
            withoutLayers: getBoolean(args, 'withoutLayers'),
            scope: getStringArray(args, 'scope'),
          });

        case 'archcodex_impact': {
          const impactFile = normalizeFilePath(getRaw(args, 'file') as string | Record<string, unknown>);
          return await handleImpact(root, {
            file: impactFile,
            depth: getNumber(args, 'depth'),
          });
        }

        case 'archcodex_plan_context':
          return await handlePlanContext(root, {
            scope: getStringArray(args, 'scope'),
            files: getStringArray(args, 'files'),
          });

        case 'archcodex_validate_plan':
          return await handleValidatePlan(root, {
            changes: getArray<{ path: string; action: string; archId?: string; newImports?: string[]; codePatterns?: string[]; newPath?: string }>(args, 'changes') ?? [],
          });

        case 'archcodex_entity_context':
          return await handleEntityContext(root, {
            entity: (getRaw(args, 'entity') ?? getRaw(args, 'name')) as string | string[] | undefined,
            operation: getString(args, 'operation'),
            format: getString(args, 'format') as 'yaml' | 'json' | 'compact' | undefined,
            refresh: getBoolean(args, 'refresh'),
            explicitProjectRoot: hasArg(args, 'projectRoot'),
            maxFiles: getNumber(args, 'maxFiles'),
            verbose: getBoolean(args, 'verbose'),
          });

        case 'archcodex_map': {
          const mapFile = hasArg(args, 'file') ? normalizeFilePath(getRaw(args, 'file') as string | Record<string, unknown>) : undefined;
          return await handleArchitectureMap(root, {
            entity: getString(args, 'entity'),
            architecture: getString(args, 'architecture'),
            file: mapFile,
            module: getString(args, 'module'),
            depth: getNumber(args, 'depth'),
            refresh: getBoolean(args, 'refresh'),
          });
        }

        case 'archcodex_context':
          return await handleUnifiedContext(root, {
            module: getString(args, 'module'),
            entity: getString(args, 'entity'),
            format: getString(args, 'format') as 'compact' | 'full' | 'json' | undefined,
            sections: getArray<'project-rules' | 'modification-order' | 'boundaries' | 'entities' | 'impact' | 'constraints'>(args, 'sections'),
            confirm: getBoolean(args, 'confirm'),
            summary: getBoolean(args, 'summary'),
            brief: getBoolean(args, 'brief'),
          });

        case 'archcodex_spec_init':
          return await handleSpecInit(root, {
            force: getBoolean(args, 'force'),
            minimal: getBoolean(args, 'minimal'),
            projectRoot: root,
          });

        case 'archcodex_spec_scaffold_touchpoints':
          return await handleSpecScaffoldTouchpoints(root, {
            specId: getString(args, 'specId') as string,
            entity: getString(args, 'entity') as string,
            operation: getString(args, 'operation'),
          });

        case 'archcodex_feature_audit':
          return await handleFeatureAudit(root, {
            mutation: getString(args, 'mutation'),
            entity: getString(args, 'entity'),
            verbose: getBoolean(args, 'verbose'),
          });

        case 'archcodex_analyze':
          return await handleAnalyze(root, {
            category: getString(args, 'category'),
            severity: getString(args, 'severity'),
            specIds: getStringArray(args, 'specIds'),
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
        const file = getString(args, 'file');
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

main().catch((err) => {
  logger.error('MCP server failed to start', err instanceof Error ? err : undefined);
  process.exit(1);
});
