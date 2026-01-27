/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 */
import { Command } from 'commander';
import * as path from 'node:path';
import { minimatch } from 'minimatch';
import { loadConfig } from '../../core/config/loader.js';
import { loadRegistry } from '../../core/registry/loader.js';
import { HydrationEngine } from '../../core/hydration/engine.js';
import type { HydrationFormat, LayerBoundaryInfo } from '../../core/hydration/types.js';
import { logger as log } from '../../utils/logger.js';
import { readFile, fileExists } from '../../utils/file-system.js';
import { parseArchTags } from '../../core/arch-tag/parser.js';
import { resolveArchitecture } from '../../core/registry/resolver.js';
import { loadPatternRegistry } from '../../core/patterns/loader.js';
import { ProjectAnalyzer } from '../../core/imports/analyzer.js';
import type { Registry } from '../../core/registry/schema.js';
import type { LayerConfig, Config } from '../../core/config/schema.js';

/**
 * Create the read command.
 */
export function createReadCommand(): Command {
  return new Command('read')
    .description('Read a file with hydrated architectural context')
    .argument('<file>', 'File to read')
    .option('-f, --format <format>', 'Output format: verbose, terse, or ai', 'verbose')
    .option('-t, --token-limit <limit>', 'Maximum tokens for header', '4000')
    .option('--no-content', 'Only output the header, not the file content')
    .option('--no-pointers', 'Exclude pointer content from hydration')
    .option('--with-example', 'Include reference implementation (golden sample)')
    .option('--with-source', 'Include file source in AI format (default: excluded)')
    .option('--with-deps', 'Include imported_by count in AI format (slower)')
    .option('-c, --config <path>', 'Path to config file', '.arch/config.yaml')
    .action(async (file: string, options: ReadOptions) => {
      try {
        await runRead(file, options);
      } catch (error) {
        log.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

interface ReadOptions {
  format: string;
  tokenLimit: string;
  content: boolean;
  pointers: boolean;
  withExample: boolean;
  withSource: boolean;
  withDeps: boolean;
  config: string;
}

async function runRead(file: string, options: ReadOptions): Promise<void> {
  const projectRoot = process.cwd();

  // Load configuration
  const config = await loadConfig(projectRoot, options.config);

  // Load registry
  const registry = await loadRegistry(projectRoot, config.registry);

  // Load pattern registry for AI format suggestions
  const patternRegistry = await loadPatternRegistry(projectRoot);

  // Create hydration engine
  const engine = new HydrationEngine(config, registry);

  // Validate format
  const format = options.format as HydrationFormat;
  if (format !== 'verbose' && format !== 'terse' && format !== 'ai') {
    log.error(`Invalid format: ${options.format}. Use 'verbose', 'terse', or 'ai'.`);
    process.exit(1);
  }

  // Get file path
  const filePath = path.resolve(projectRoot, file);
  const relativePath = path.relative(projectRoot, filePath);

  // For AI format, compute boundaries if layers are configured
  let boundaries: LayerBoundaryInfo | undefined;
  if (format === 'ai' && config.layers && config.layers.length > 0) {
    const layer = findLayerForFile(relativePath, config.layers);
    if (layer) {
      // Compute which layers this file CANNOT import from
      const allLayerNames = config.layers.map(l => l.name);
      const canImportSet = new Set([layer.name, ...layer.can_import]); // Can always import from same layer
      const cannotImport = allLayerNames.filter(name => !canImportSet.has(name));

      boundaries = {
        layer: layer.name,
        canImport: layer.can_import,
        cannotImport: cannotImport.length > 0 ? cannotImport : undefined,
        // Only compute importedByCount if --with-deps is set (expensive)
        importedByCount: options.withDeps ? await countImporters(filePath, projectRoot, config) : undefined,
      };
    }
  }

  // For AI format, default to no content unless --with-source is set
  const includeContent = format === 'ai' ? options.withSource : options.content;

  // Skip pattern registry for .arch/ config files (patterns are irrelevant for config)
  const isArchConfigFile = relativePath.startsWith('.arch/') || relativePath.startsWith('.arch\\');

  // Hydrate the file
  const result = await engine.hydrateFile(filePath, {
    format,
    tokenLimit: parseInt(options.tokenLimit, 10),
    includePointers: options.pointers,
    includeContent,
    boundaries,
    patternRegistry: isArchConfigFile ? undefined : (patternRegistry || undefined),
  });

  // Output the result
  console.log(result.output);

  // Include reference implementation if requested
  if (options.withExample) {
    const example = await getGoldenSample(filePath, registry, projectRoot);
    if (example) {
      console.log('\n--- REFERENCE IMPLEMENTATION ---\n');
      console.log(example);
    }
  }

  // If truncated, show a warning to stderr
  if (result.truncated && result.truncationDetails) {
    const details = result.truncationDetails;
    let truncatedItems: string[] = [];
    if (details.pointersTruncated) truncatedItems.push('pointers');
    if (details.hintsTruncated) truncatedItems.push('hints');

    log.warn(
      `Content truncated to fit token limit. Removed: ${truncatedItems.join(', ')}`
    );
    log.info(
      `Original: ~${details.originalTokens} tokens → Final: ~${details.finalTokens} tokens`
    );
  }

  // Show token count
  log.info(`Estimated tokens: ${result.tokenCount}`);
}

/**
 * Get golden sample (reference implementation) for a file.
 * Looks up reference_implementations from the architecture.
 */
async function getGoldenSample(
  filePath: string,
  registry: Registry,
  projectRoot: string
): Promise<string | null> {
  // Read and parse the file to get its arch tag
  const content = await readFile(filePath);
  const { archTag } = parseArchTags(content);

  if (!archTag) {
    return null;
  }

  try {
    // Resolve the architecture
    const { architecture } = resolveArchitecture(registry, archTag.archId);

    // Check for reference implementations
    if (!architecture.reference_implementations || architecture.reference_implementations.length === 0) {
      log.info('No reference implementations defined for this architecture');
      return null;
    }

    // Try to find a valid reference file (not the same as the current file)
    for (const refPath of architecture.reference_implementations) {
      const fullRefPath = path.resolve(projectRoot, refPath);

      // Skip if it's the same file
      if (fullRefPath === filePath) {
        continue;
      }

      // Check if file exists
      if (await fileExists(fullRefPath)) {
        const refContent = await readFile(fullRefPath);

        // Extract a skeleton (imports + class/function signatures, ~50 lines max)
        const skeleton = extractSkeleton(refContent);

        return `// From: ${refPath}\n${skeleton}`;
      }
    }

    log.info('No accessible reference implementation found');
    return null;
  } catch {
    // Architecture not found
    return null;
  }
}

/**
 * Extract a skeleton from source code.
 * Keeps imports, class declarations, function signatures.
 * Removes implementation bodies.
 */
function extractSkeleton(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let inBody = 0;
  let skipUntilBrace = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Always include imports
    if (trimmed.startsWith('import ') || trimmed.startsWith('export ') && trimmed.includes(' from ')) {
      result.push(line);
      continue;
    }

    // Always include type imports/exports
    if (trimmed.startsWith('export type ') || trimmed.startsWith('export interface ')) {
      result.push(line);
      skipUntilBrace = true;
      continue;
    }

    // Track brace depth for skipping bodies
    if (skipUntilBrace) {
      result.push(line);
      if (trimmed.includes('}')) {
        skipUntilBrace = false;
      }
      continue;
    }

    // Include class declarations
    if (trimmed.match(/^(export\s+)?(abstract\s+)?class\s+/)) {
      result.push(line);
      inBody = 1;
      continue;
    }

    // Inside class, include method signatures
    if (inBody > 0) {
      // Track braces
      const opens = (line.match(/{/g) || []).length;
      const closes = (line.match(/}/g) || []).length;

      // Method signature (no body yet)
      if (trimmed.match(/^(public|private|protected|async|static|\*|get|set)?\s*\w+\s*\([^)]*\)/)) {
        // Just show signature
        if (opens === closes) {
          result.push(line.replace(/\{[\s\S]*\}/, '{ ... }'));
        } else {
          result.push(line.replace(/\{[\s\S]*$/, '{ ... }'));
        }
        continue;
      }

      // Track class body depth
      inBody += opens - closes;

      // Include closing brace
      if (inBody === 0) {
        result.push('}');
      }
    }
  }

  // Limit to ~50 lines
  const maxLines = 50;
  if (result.length > maxLines) {
    return result.slice(0, maxLines).join('\n') + '\n// ... (truncated)';
  }

  return result.join('\n');
}

/**
 * Find which layer a file belongs to based on config.layers.
 */
function findLayerForFile(relativePath: string, layers: LayerConfig[]): LayerConfig | null {
  // Normalize to forward slashes for matching
  const normalizedPath = relativePath.replace(/\\/g, '/');

  for (const layer of layers) {
    for (const pattern of layer.paths) {
      if (minimatch(normalizedPath, pattern)) {
        return layer;
      }
    }
  }

  return null;
}

/**
 * Count files that import the given file (expensive - builds import graph).
 * Uses ProjectAnalyzer to compute accurate importer count.
 */
async function countImporters(
  filePath: string,
  projectRoot: string,
  config: Config
): Promise<number> {
  const analyzer = new ProjectAnalyzer(projectRoot);
  await analyzer.buildImportGraph({
    include: config.files?.scan?.include,
    exclude: config.files?.scan?.exclude,
  });
  const absolutePath = path.resolve(projectRoot, filePath);
  return analyzer.getImporters(absolutePath).length;
}
