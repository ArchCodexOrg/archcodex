/**
 * @arch archcodex.cli.mcp.handler
 *
 * MCP tool handlers for validation operations (check, read).
 */
import { resolve, isAbsolute, relative } from 'path';
import { loadConfig } from '../../core/config/loader.js';
import { loadRegistry, loadPartialRegistry, loadRegistryFromFiles } from '../../core/registry/loader.js';
import { ValidationEngine } from '../../core/validation/engine.js';
import { ProjectValidator } from '../../core/validation/project-validator.js';
import { HydrationEngine } from '../../core/hydration/engine.js';
import { loadPatternRegistry, findMatchingPatterns, filterByRelevance } from '../../core/patterns/loader.js';
import { extractImportsAndExports } from '../../core/patterns/extractor.js';
import { globFiles, readFile as readFileUtil } from '../../utils/file-system.js';
import { loadArchIgnore } from '../../utils/archignore.js';

// ============================================================================
// CHECK HANDLER
// ============================================================================

export interface CheckOptions {
  strict?: boolean;
  project?: boolean;
  registry?: string;
  registryPattern?: string[];
}

export async function handleCheck(projectRoot: string, files: string[] | undefined, options: CheckOptions = {}) {
  // Validate files parameter
  if (!files || !Array.isArray(files) || files.length === 0) {
    return {
      content: [{
        type: 'text',
        text: `Error: No files specified for check.\n\n` +
          `Use one of these parameters:\n` +
          `  - files: ["src/file.ts"] (array of file paths)\n` +
          `  - file: "src/file.ts" (single file path)\n` +
          `  - path: "src/file.ts" (alias for file)\n\n` +
          `Example: {"file": "/absolute/path/to/file.ts"}`,
      }],
      isError: true,
    };
  }

  const config = await loadConfig(projectRoot);
  const patternRegistry = await loadPatternRegistry(projectRoot);
  const archIgnore = await loadArchIgnore(projectRoot);

  // Load registry - supports custom path, partial loading, or default
  let registry;
  if (options.registryPattern && options.registryPattern.length > 0) {
    // Partial loading - only matching patterns
    registry = await loadPartialRegistry(projectRoot, options.registryPattern);
  } else if (options.registry) {
    // Custom registry path
    const registryPath = resolve(projectRoot, options.registry);
    if (registryPath.endsWith('.yaml') || registryPath.endsWith('.yml')) {
      // Single file - auto-resolve dependencies if in registry directory
      const registryDir = resolve(projectRoot, '.arch/registry');
      const inRegistryDir = registryPath.startsWith(registryDir);
      registry = await loadRegistryFromFiles([registryPath], {
        resolveDependencies: inRegistryDir,
        registryDir: inRegistryDir ? registryDir : undefined,
      });
    } else {
      registry = await loadRegistry(projectRoot, options.registry);
    }
  } else {
    registry = await loadRegistry(projectRoot);
  }

  // Resolve file patterns (convert absolute paths to relative)
  let resolvedFiles: string[] = [];
  for (const pattern of files) {
    if (pattern.includes('*')) {
      resolvedFiles.push(...await globFiles(pattern, { cwd: projectRoot, absolute: false }));
    } else {
      // Convert absolute paths to relative (archIgnore expects relative paths)
      const filePath = isAbsolute(pattern)
        ? relative(projectRoot, pattern)
        : pattern;
      resolvedFiles.push(filePath);
    }
  }
  resolvedFiles = archIgnore.filter(resolvedFiles);

  // Use ProjectValidator for cross-file constraints, otherwise standard engine
  if (options.project) {
    const validator = new ProjectValidator(projectRoot, config, registry, patternRegistry);
    // ProjectValidator uses include patterns, not explicit file list
    // Pass resolved files as include patterns
    const result = await validator.validateProject({
      include: resolvedFiles.length > 0 ? resolvedFiles : undefined,
      strict: options.strict,
    });
    validator.dispose();

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          summary: result.summary,
          projectStats: result.projectStats,
          packageViolations: result.packageViolations,
          layerViolations: result.layerViolations,
          coverageGaps: result.coverageGaps,
          coverageStats: result.coverageStats,
          similarityViolations: result.similarityViolations,
          results: result.results.map(r => ({
            file: r.file,
            archId: r.archId,
            status: r.status,
            violations: r.violations,
            warnings: r.warnings,
          })),
        }, null, 2),
      }],
    };
  }

  const engine = new ValidationEngine(projectRoot, config, registry, patternRegistry);
  const result = await engine.validateFiles(resolvedFiles, { strict: options.strict });
  engine.dispose();

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        summary: result.summary,
        results: result.results.map(r => ({
          file: r.file,
          archId: r.archId,
          status: r.status,
          violations: r.violations,
          warnings: r.warnings,
        })),
      }, null, 2),
    }],
  };
}

// ============================================================================
// READ HANDLER
// ============================================================================

export async function handleRead(projectRoot: string, file: string, format?: string) {
  const config = await loadConfig(projectRoot);
  const registry = await loadRegistry(projectRoot);
  const patternRegistry = await loadPatternRegistry(projectRoot);
  const engine = new HydrationEngine(config, registry);

  // For AI format, don't include file content - just the architectural context
  // This significantly reduces output size and token usage
  const effectiveFormat = (format as 'verbose' | 'terse' | 'ai') || 'ai';
  const includeContent = effectiveFormat !== 'ai';

  const result = await engine.hydrateFile(file, {
    format: effectiveFormat,
    includeContent,
  });

  // Find relevant patterns based on file content with noise filtering
  const fileContent = await readFileUtil(resolve(projectRoot, file)).catch(() => '');

  // Step 1: Get all keyword matches
  const allMatches = findMatchingPatterns(patternRegistry, fileContent, { minConfidence: 0.2 });

  // Step 2: Filter to only relevant patterns using content-based analysis
  const extracted = extractImportsAndExports(fileContent);
  const relevantPatterns = filterByRelevance(allMatches, {
    imports: extracted.imports,
    exports: extracted.exports,
    content: fileContent,
  });

  // Format patterns for output - only truly relevant ones
  const patternsOutput = relevantPatterns.slice(0, 3).map(match => ({
    name: match.name,
    canonical: match.pattern.canonical,
    exports: match.pattern.exports,
    usage: match.pattern.usage,
    example: match.pattern.example,
    relevanceReason: (match as typeof match & { relevanceReason?: string }).relevanceReason,
  }));

  // For AI format, only return header (architectural context)
  // For verbose/terse, include both header and output (with file content)
  const response: Record<string, unknown> = {
    file,
    archContext: result.header,
    tokenCount: result.tokenCount,
    truncated: result.truncated,
  };

  // Only include file content for non-AI formats
  if (includeContent && result.content) {
    response.fileContent = result.content;
  }

  if (patternsOutput.length > 0) {
    response.relevantPatterns = patternsOutput;
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(response, null, 2),
    }],
  };
}
