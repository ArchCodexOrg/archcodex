/**
 * @arch archcodex.cli.mcp.handler
 *
 * MCP tool handlers for context and planning operations
 * (session-context, plan-context, validate-plan, impact, why, decide).
 */
import { resolve, relative } from 'path';
import { loadConfig } from '../../core/config/loader.js';
import { loadRegistry } from '../../core/registry/loader.js';
import { resolveArchitecture } from '../../core/registry/resolver.js';
import { extractArchId } from '../../core/arch-tag/parser.js';
import { getSessionContext } from '../../core/session/index.js';
import { loadDecisionTree, startNavigation, getCurrentNode, answerQuestion, isDecisionResult } from '../../core/discovery/index.js';
import { readFile } from '../../utils/file-system.js';
import { isProjectInitialized, findNearbyProject, normalizeStringList } from '../utils.js';

// ============================================================================
// SESSION CONTEXT HANDLER
// ============================================================================

export interface SessionContextHandlerOptions {
  patterns?: string | string[];
  full?: boolean;
  withPatterns?: boolean;
  withDuplicates?: boolean;
  withoutLayers?: boolean;
  scope?: string | string[];
}

export async function handleSessionContext(projectRoot: string, options: SessionContextHandlerOptions = {}) {
  // Normalize patterns: accept both string and array
  const patterns = options.patterns
    ? normalizeStringList(options.patterns as string | string[] | undefined)
    : ['src/**/*.ts', 'src/**/*.tsx'];

  // Normalize scope: accept both string and array
  const scope = options.scope ? normalizeStringList(options.scope as string | string[] | undefined) : undefined;

  const withPatterns = options.withPatterns ?? false;

  // Defaults: compact=true, deduplicate=true, withLayers=true
  // Opt-out: full, withDuplicates, withoutLayers
  const compact = !options.full;
  const deduplicate = !options.withDuplicates;
  const withLayers = !options.withoutLayers;

  // Validate project is initialized before proceeding
  const isInitialized = await isProjectInitialized(projectRoot);
  if (!isInitialized) {
    // Try to find a nearby project to suggest
    const nearbyProject = await findNearbyProject(projectRoot);

    return {
      content: [{
        type: 'text',
        text: `Error: Project not initialized with ArchCodex.\n\n` +
          `Project root: ${projectRoot}\n` +
          `Expected .arch/ directory not found.\n\n` +
          (nearbyProject
            ? `Found nearby project: ${nearbyProject}\n` +
              `Use: archcodex_session_context with projectRoot="${nearbyProject}"\n\n`
            : `To initialize this project, run:\n` +
              `  cd ${projectRoot}\n` +
              `  archcodex init\n\n`) +
          `Or provide the correct project root using the projectRoot parameter.`,
      }],
      isError: true,
    };
  }

  try {
    const result = await getSessionContext(projectRoot, patterns, {
      compact,
      withPatterns,
      deduplicate,
      withLayers,
      scope,
    });

    if (compact) {
      // Compact format for minimal context (default)
      const lines: string[] = [
        `# ArchCodex Session Context`,
        `# ${result.filesScanned} files scanned`,
        '',
      ];

      // Show layer boundaries if available
      if (result.layers && result.layers.length > 0) {
        lines.push('## Layers');
        for (const layer of result.layers) {
          const imports = layer.canImport.length > 0 ? layer.canImport.join(', ') : '(leaf)';
          lines.push(`${layer.name} -> [${imports}]`);
        }
        lines.push('');
      }

      // Show shared constraints if deduplicated
      if (result.sharedConstraints && result.sharedConstraints.length > 0) {
        lines.push('## Shared (all archs)');
        for (const group of result.sharedConstraints) {
          lines.push(`- ${group.type}: ${group.values.join(', ')}`);
        }
        lines.push('');
      }

      for (const arch of result.architecturesInScope) {
        lines.push(`## ${arch.archId} (${arch.fileCount})`);
        if (arch.forbid.length > 0) {
          lines.push(`- forbid: ${arch.forbid.join(', ')}`);
        }
        if (arch.patterns.length > 0) {
          lines.push(`- patterns: ${arch.patterns.join(', ')}`);
        }
        if (arch.require.length > 0) {
          lines.push(`- require: ${arch.require.join(', ')}`);
        }
        if (arch.hints.length > 0) {
          lines.push(`- hint: ${arch.hints[0]}`);
        }
      }

      // Add canonical patterns if included
      if (result.canonicalPatterns && result.canonicalPatterns.length > 0) {
        lines.push('');
        lines.push('## Canonical Patterns');
        for (const p of result.canonicalPatterns) {
          const exports = p.exports.length > 0 ? ` [${p.exports.join(', ')}]` : '';
          lines.push(`- ${p.name}: ${p.canonical}${exports}`);
        }
      }

      if (result.untaggedFiles.length > 0) {
        lines.push('');
        lines.push(`## Untagged: ${result.untaggedFiles.length} files`);
      }

      return {
        content: [{
          type: 'text',
          text: lines.join('\n'),
        }],
      };
    }

    // Full JSON output (opt-in with full: true)
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          summary: `Scanned ${result.filesScanned} files across ${result.architecturesInScope.length} architectures`,
          architecturesInScope: result.architecturesInScope.map(arch => ({
            archId: arch.archId,
            fileCount: arch.fileCount,
            description: arch.description,
            forbid: arch.forbid,
            patterns: arch.patterns,
            require: arch.require,
            hints: arch.hints.slice(0, 2), // Limit hints for brevity
            mixins: arch.mixins,
          })),
          layers: result.layers,
          sharedConstraints: result.sharedConstraints,
          canonicalPatterns: result.canonicalPatterns,
          untaggedCount: result.untaggedFiles.length,
          untaggedFiles: result.untaggedFiles.slice(0, 10), // Limit for brevity
          tip: 'Use archcodex_read for full constraints on specific files',
        }, null, 2),
      }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isRegistryError = errorMessage.includes('Registry') || errorMessage.includes('registry');

    return {
      content: [{
        type: 'text',
        text: `Error getting session context: ${errorMessage}\n\n` +
          `Project root: ${projectRoot}\n\n` +
          (isRegistryError
            ? `The project registry might be corrupted or missing.\n` +
              `Try running: archcodex sync-index --force`
            : `Try checking:\n` +
              `  1. Is the project root correct? Use projectRoot parameter if needed.\n` +
              `  2. Does .arch/ directory exist and contain valid files?\n` +
              `  3. Run: archcodex health for more diagnostics.`),
      }],
      isError: true,
    };
  }
}

// ============================================================================
// PLAN CONTEXT HANDLER
// ============================================================================

export interface PlanContextHandlerOptions {
  scope?: string | string[];
  files?: string | string[];
}

export async function handlePlanContext(projectRoot: string, options: PlanContextHandlerOptions) {
  // Validate project is initialized before proceeding
  const isInitialized = await isProjectInitialized(projectRoot);
  if (!isInitialized) {
    // Try to find a nearby project to suggest
    const nearbyProject = await findNearbyProject(projectRoot);

    return {
      content: [{
        type: 'text',
        text: `Error: Project not initialized with ArchCodex.\n\n` +
          `Project root: ${projectRoot}\n` +
          `Expected .arch/ directory not found.\n\n` +
          `When using 'scope' with relative paths, provide 'projectRoot':\n` +
          `  { "projectRoot": "/path/to/project", "scope": ["src/"] }\n\n` +
          (nearbyProject
            ? `Found nearby project: ${nearbyProject}\n` +
              `Try: { "projectRoot": "${nearbyProject}", "scope": [...] }\n\n`
            : `To initialize this project, run:\n` +
              `  cd ${projectRoot}\n` +
              `  archcodex init\n\n`),
      }],
      isError: true,
    };
  }

  const { getPlanContext, formatPlanContextCompact } = await import('../../core/plan-context/index.js');

  // Normalize scope and files: accept both string and array formats
  const scopePaths = options.scope ? normalizeStringList(options.scope as string | string[] | undefined) : ['src/'];
  const targetFiles = options.files ? normalizeStringList(options.files as string | string[] | undefined) : undefined;

  const scope = {
    paths: scopePaths,
    targetFiles: targetFiles && targetFiles.length > 0 ? targetFiles : undefined,
  };

  try {
    const result = await getPlanContext(projectRoot, scope);
    const text = formatPlanContextCompact(result);

    return {
      content: [{ type: 'text', text }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isRegistryError = errorMessage.includes('Registry') || errorMessage.includes('registry');

    return {
      content: [{
        type: 'text',
        text: `Error getting plan context: ${errorMessage}\n\n` +
          `Project root: ${projectRoot}\n\n` +
          (isRegistryError
            ? `The project registry might be corrupted or missing.\n` +
              `Try running: archcodex sync-index --force`
            : `Try checking:\n` +
              `  1. Is the project root correct? Use projectRoot parameter if needed.\n` +
              `  2. Does .arch/ directory exist and contain valid files?\n` +
              `  3. Try archcodex plan-context from the command line for more details.`),
      }],
      isError: true,
    };
  }
}

// ============================================================================
// VALIDATE PLAN HANDLER
// ============================================================================

export interface ValidatePlanOptions {
  changes: Array<{ path: string; action: string; archId?: string; newImports?: string | string[]; codePatterns?: string | string[]; newPath?: string }>;
}

export async function handleValidatePlan(projectRoot: string, options: ValidatePlanOptions) {
  const { validatePlan, formatValidationResult } = await import('../../core/validate-plan/index.js');

  if (!options.changes || !Array.isArray(options.changes)) {
    return {
      content: [{
        type: 'text',
        text: `Error: changes array is required\n\n` +
          `Changes can be passed as:\n` +
          `1. Array of objects with path and action:\n` +
          `   { "changes": [{ "path": "/file.ts", "action": "create" }] }\n\n` +
          `2. Array of path strings:\n` +
          `   { "changes": ["/file.ts"] }\n\n` +
          `Supported actions: create, modify, delete, rename`,
      }],
      isError: true,
    };
  }

  try {
    const input = {
      changes: options.changes.map((c: unknown) => {
        // Support both string paths and objects
        let change: Record<string, unknown>;
        if (typeof c === 'string') {
          // If just a string path, assume it's a file to check
          change = { path: c };
        } else if (typeof c === 'object' && c !== null) {
          change = c as Record<string, unknown>;
        } else {
          throw new Error(`Invalid change format: expected string or object, got ${typeof c}`);
        }

        // Extract and validate path
        const path = change.path;
        if (!path || typeof path !== 'string') {
          throw new Error(`Change missing required 'path' property`);
        }

        // Extract action and validate (required)
        const action = change.action as string | undefined;
        if (!action) {
          throw new Error(`Change at path "${path}" missing required 'action' field. Must be: create, modify, delete, or rename`);
        }
        if (!['create', 'modify', 'delete', 'rename'].includes(action)) {
          throw new Error(`Invalid action "${action}". Must be: create, modify, delete, or rename`);
        }

        // Normalize newImports and codePatterns: accept both string and array formats
        const newImports = change.newImports
          ? normalizeStringList(change.newImports as string | string[] | undefined)
          : undefined;
        const codePatterns = change.codePatterns
          ? normalizeStringList(change.codePatterns as string | string[] | undefined)
          : undefined;

        return {
          path,
          action: action as 'create' | 'modify' | 'delete' | 'rename',
          archId: change.archId as string | undefined,
          newImports: newImports && newImports.length > 0 ? newImports : undefined,
          codePatterns: codePatterns && codePatterns.length > 0 ? codePatterns : undefined,
          newPath: typeof change.newPath === 'string' ? change.newPath : undefined,
        };
      }),
    };

    const result = await validatePlan(projectRoot, input);
    const text = formatValidationResult(result);

    return {
      content: [{ type: 'text', text }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: 'text',
        text: `Error validating plan: ${errorMessage}\n\n` +
          `Project root: ${projectRoot}\n\n` +
          `Make sure each change has a valid 'path' property:\n` +
          `- String: "/path/to/file.ts"\n` +
          `- Object: { "path": "/path/to/file.ts", "action": "create", ... }`,
      }],
      isError: true,
    };
  }
}

// ============================================================================
// IMPACT HANDLER
// ============================================================================

export interface ImpactOptions {
  file: string;
  depth?: number;
}

export async function handleImpact(projectRoot: string, options: ImpactOptions) {
  const { file, depth = 2 } = options;

  if (!file) {
    return {
      content: [{ type: 'text', text: 'Error: file is required' }],
      isError: true,
    };
  }

  const { ProjectAnalyzer } = await import('../../core/imports/analyzer.js');

  const analyzer = new ProjectAnalyzer(projectRoot);

  try {
    // Build import graph for the entire project
    const graphResult = await analyzer.buildImportGraph();

    // Resolve the file path
    const absolutePath = resolve(projectRoot, file);
    const relativePath = relative(projectRoot, absolutePath);

    // Get direct importers
    const importers = analyzer.getImporters(relativePath);

    // Get transitive dependents
    const dependents = analyzer.getDependents(new Set([absolutePath]), depth);

    // Group dependents by architecture for better insight
    const archGroups = new Map<string, string[]>();
    for (const depPath of dependents) {
      const relPath = relative(projectRoot, depPath);
      const node = graphResult.graph.nodes.get(depPath);
      const archId = node?.archId || 'untagged';
      if (!archGroups.has(archId)) archGroups.set(archId, []);
      archGroups.get(archId)!.push(relPath);
    }

    // Format for agent consumption
    const response: Record<string, unknown> = {
      file: relativePath,
      directImporters: importers.length,
      totalDependents: dependents.size,
      transitiveDepth: depth,
    };

    // Add importers list
    if (importers.length > 0) {
      response.importedBy = importers.map(i => ({
        file: relative(projectRoot, i.filePath),
        architecture: i.archId || 'untagged',
      }));
    }

    // Add architecture breakdown for large impact
    if (dependents.size > 5) {
      response.dependentsByArchitecture = Object.fromEntries(
        Array.from(archGroups.entries()).map(([arch, files]) => [arch, files.length])
      );
    }

    // Add warning for high-impact changes
    if (dependents.size > 10) {
      response.warning = `⚠️ High impact: ${dependents.size} files depend on this file`;
    }

    // Add suggestion
    if (dependents.size > 0) {
      response.suggestion = 'Consider running archcodex_check on dependents after changes';
      if (dependents.size <= 20) {
        response.checkCommand = `archcodex_check with files: [${Array.from(dependents).map(d => `"${relative(projectRoot, d)}"`).slice(0, 10).join(', ')}${dependents.size > 10 ? ', ...' : ''}]`;
      }
    } else {
      response.suggestion = 'No dependents - safe to modify';
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2),
      }],
    };
  } finally {
    analyzer.dispose();
  }
}

// ============================================================================
// WHY HANDLER
// ============================================================================

export interface WhyOptions {
  file: string;
  constraint?: string;
}

export async function handleWhy(projectRoot: string, options: WhyOptions) {
  const { file, constraint } = options;

  if (!file) {
    return {
      content: [{ type: 'text', text: 'Error: file is required' }],
      isError: true,
    };
  }

  // Read file and extract @arch tag
  const content = await readFile(resolve(projectRoot, file));
  const archId = extractArchId(content);

  if (!archId) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          file,
          error: 'No @arch tag found in file',
        }, null, 2),
      }],
    };
  }

  // Load registry and resolve architecture
  const config = await loadConfig(projectRoot);
  const registry = await loadRegistry(projectRoot, config.registry);
  const { architecture } = resolveArchitecture(registry, archId);

  // Parse constraint argument if provided
  let targetRule: string | undefined;
  let targetValue: string | undefined;

  if (constraint) {
    const colonIndex = constraint.indexOf(':');
    if (colonIndex > 0) {
      targetRule = constraint.substring(0, colonIndex);
      targetValue = constraint.substring(colonIndex + 1);
    } else {
      targetRule = constraint;
    }
  }

  // Find matching constraints
  const matchingConstraints = architecture.constraints.filter((c) => {
    if (!targetRule) return true;
    if (c.rule !== targetRule) return false;
    if (!targetValue) return true;

    if (Array.isArray(c.value)) {
      return c.value.some((v) => String(v).toLowerCase() === targetValue!.toLowerCase());
    }
    return String(c.value).toLowerCase() === targetValue.toLowerCase();
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        file,
        archId,
        inheritanceChain: architecture.inheritanceChain,
        appliedMixins: architecture.appliedMixins,
        constraints: matchingConstraints.map(c => ({
          rule: c.rule,
          value: c.value,
          source: c.source,
          severity: c.severity,
          why: c.why,
        })),
      }, null, 2),
    }],
  };
}

// ============================================================================
// DECIDE HANDLER
// ============================================================================

// Session storage for decision tree navigation
type DecisionTree = NonNullable<Awaited<ReturnType<typeof loadDecisionTree>>>;
type NavigationState = ReturnType<typeof startNavigation>;

const decisionSessions = new Map<string, {
  tree: DecisionTree;
  state: NavigationState;
  path: Array<{ question: string; answer: boolean }>;
}>();

export interface DecideOptions {
  action?: string;
  answer?: boolean;
  sessionId?: string;
}

export async function handleDecide(projectRoot: string, options: DecideOptions) {
  const { action = 'start', answer, sessionId } = options;

  // Load decision tree
  const tree = await loadDecisionTree(projectRoot);

  if (!tree) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'No decision tree found',
          hint: 'Create .arch/decision-tree.yaml to enable this feature',
        }, null, 2),
      }],
    };
  }

  // Show tree structure
  if (action === 'show-tree') {
    const nodes: Record<string, unknown> = {};
    for (const [id, node] of Object.entries(tree.nodes)) {
      nodes[id] = {
        type: node.type,
        text: node.type === 'question' ? node.text : undefined,
        examples: node.type === 'question' ? node.examples : undefined,
        archId: node.type === 'result' ? node.arch_id : undefined,
        why: node.type === 'result' ? node.why : undefined,
      };
    }
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          description: tree.description,
          start: tree.start,
          nodes,
        }, null, 2),
      }],
    };
  }

  // Start new session
  if (action === 'start' || !sessionId) {
    const state = startNavigation(tree);
    const newSessionId = `decide-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const currentNode = getCurrentNode(tree, state);

    decisionSessions.set(newSessionId, { tree, state, path: [] });

    // Clean old sessions (keep last 100)
    if (decisionSessions.size > 100) {
      const keys = Array.from(decisionSessions.keys());
      for (let i = 0; i < keys.length - 100; i++) {
        decisionSessions.delete(keys[i]);
      }
    }

    if (currentNode && currentNode.type === 'question') {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            type: 'question',
            sessionId: newSessionId,
            questionNumber: 1,
            text: currentNode.text,
            examples: currentNode.examples,
            path: [],
          }, null, 2),
        }],
      };
    }
  }

  // Continue existing session
  if (action === 'answer' && sessionId) {
    const session = decisionSessions.get(sessionId);
    if (!session) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'Session not found or expired',
            hint: 'Start a new session with action: "start"',
          }, null, 2),
        }],
        isError: true,
      };
    }

    if (answer === undefined) {
      return {
        content: [{ type: 'text', text: 'Error: answer is required (true/false)' }],
        isError: true,
      };
    }

    // Record the question before answering
    const currentNode = getCurrentNode(session.tree, session.state);
    if (currentNode && currentNode.type === 'question') {
      session.path.push({ question: currentNode.text, answer });
    }

    // Answer and advance (convert boolean to 'yes'|'no')
    const newState = answerQuestion(session.tree, session.state, answer ? 'yes' : 'no');

    // Check if newState is a DecisionResult (has archId property)
    if (isDecisionResult(newState)) {
      // Clean up session
      decisionSessions.delete(sessionId);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            type: 'result',
            archId: newState.archId,
            why: newState.why,
            path: session.path,
            scaffoldCommand: `archcodex scaffold ${newState.archId} --name <ClassName>`,
          }, null, 2),
        }],
      };
    }

    // Update session state
    session.state = newState;

    const nextNode = getCurrentNode(session.tree, newState);

    if (nextNode && nextNode.type === 'question') {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            type: 'question',
            sessionId,
            questionNumber: session.path.length + 1,
            text: nextNode.text,
            examples: nextNode.examples,
            path: session.path,
          }, null, 2),
        }],
      };
    }

    // If nextNode is a result node
    if (nextNode && nextNode.type === 'result') {
      decisionSessions.delete(sessionId);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            type: 'result',
            archId: nextNode.arch_id,
            why: nextNode.why,
            path: session.path,
            scaffoldCommand: `archcodex scaffold ${nextNode.arch_id} --name <ClassName>`,
          }, null, 2),
        }],
      };
    }
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        error: 'Invalid action',
        hint: 'Use action: "start", "answer", or "show-tree"',
      }, null, 2),
    }],
    isError: true,
  };
}

