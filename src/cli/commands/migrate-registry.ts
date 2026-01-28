/**
 * @arch archcodex.cli.command.meta
 * @intent:cli-output
 *
 * Migration command to convert single-file registry to multi-file directory structure.
 */
import { Command } from 'commander';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { loadYaml, stringifyYaml, fileExists, directoryExists, ensureDir } from '../../utils/index.js';
import { logger } from '../../utils/logger.js';
import { RegistrySchema, type ArchitectureNode } from '../../core/registry/schema.js';

interface MigrateOptions {
  dryRun?: boolean;
  force?: boolean;
}

/**
 * Create the migrate-registry command.
 */
export function createMigrateRegistryCommand(): Command {
  return new Command('migrate-registry')
    .description('Convert single-file registry.yaml to multi-file directory structure')
    .argument('[source]', 'Source YAML file (default: .arch/registry.yaml)')
    .option('--dry-run', 'Show what would be created without writing files')
    .option('--force', 'Overwrite existing registry directory')
    .action(async (source: string | undefined, options: MigrateOptions) => {
      const projectRoot = process.cwd();

      try {
        await migrateRegistry(projectRoot, options, source);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : 'Migration failed');
        process.exit(1);
      }
    });
}

/**
 * Migrate single-file registry to directory structure.
 */
async function migrateRegistry(projectRoot: string, options: MigrateOptions, source?: string): Promise<void> {
  const sourceFile = source
    ? path.resolve(projectRoot, source)
    : path.join(projectRoot, '.arch/registry.yaml');
  const targetDir = path.join(projectRoot, '.arch/registry');

  // Check source exists
  if (!(await fileExists(sourceFile))) {
    throw new Error(`Source registry not found: ${sourceFile}`);
  }

  // Check target doesn't exist (unless --force)
  if (await directoryExists(targetDir)) {
    if (!options.force) {
      throw new Error(`Target directory already exists: ${targetDir}\nUse --force to overwrite.`);
    }
    if (!options.dryRun) {
      await fs.rm(targetDir, { recursive: true });
    }
  }

  // Load the registry
  const rawRegistry = await loadYaml<Record<string, unknown>>(sourceFile);

  // Extract mixins and nodes
  const { mixins: rawMixins, ...nodes } = rawRegistry as {
    mixins?: Record<string, ArchitectureNode>;
    [key: string]: unknown;
  };

  // Plan the file structure
  const filePlan: Map<string, Record<string, ArchitectureNode>> = new Map();

  // Process architecture nodes
  for (const [archId, node] of Object.entries(nodes)) {
    if (!node || typeof node !== 'object') continue;

    const filePath = archIdToFilePath(archId);
    const existing = filePlan.get(filePath) || {};
    existing[archId] = node as ArchitectureNode;
    filePlan.set(filePath, existing);
  }

  // Add mixins file
  if (rawMixins && Object.keys(rawMixins).length > 0) {
    filePlan.set('_mixins.yaml', rawMixins);
  }

  // Output plan
  console.log('\n📁 Migration Plan:\n');
  console.log(`Source: ${sourceFile}`);
  console.log(`Target: ${targetDir}/\n`);

  const sortedFiles = Array.from(filePlan.keys()).sort();
  for (const filePath of sortedFiles) {
    const content = filePlan.get(filePath)!;
    const archIds = Object.keys(content);
    const indent = '  '.repeat(filePath.split('/').length - 1);
    console.log(`${indent}📄 ${filePath}`);
    for (const archId of archIds) {
      console.log(`${indent}   └─ ${archId}`);
    }
  }

  console.log(`\nTotal: ${filePlan.size} files, ${Object.keys(nodes).length} architectures, ${rawMixins ? Object.keys(rawMixins).length : 0} mixins\n`);

  // Validate the registry before writing
  console.log('🔍 Validating registry...\n');
  const registryToValidate = {
    ...nodes,
    mixins: rawMixins || {},
  };

  let validationPassed = false;
  try {
    const validationResult = RegistrySchema.safeParse(registryToValidate);
    if (!validationResult.success) {
      console.log('❌ Registry validation failed:\n');
      for (const error of validationResult.error.issues) {
        const pathStr = error.path.join('.');
        console.log(`  • ${pathStr}: ${error.message}`);
      }
      console.log('\n⚠️  Fix these issues before migrating, or the registry will fail to load.\n');
    } else {
      validationPassed = true;
    }
  } catch (validationError) {
    // Preprocess throws for better error messages - catch and display
    console.log('❌ Registry validation failed:\n');
    console.log(`  • ${validationError instanceof Error ? validationError.message : 'Unknown error'}`);
    console.log('\n⚠️  Fix these issues before migrating, or the registry will fail to load.\n');
  }

  if (!validationPassed) {
    if (!options.force) {
      throw new Error('Validation failed. Use --force to write anyway (not recommended).');
    }
    console.log('⚠️  Proceeding due to --force flag...\n');
  } else {
    console.log('✓ Registry validation passed\n');
  }

  if (options.dryRun) {
    console.log('🔍 Dry run - no files written.\n');
    return;
  }

  // Create files
  console.log('✨ Creating files...\n');

  for (const [filePath, content] of filePlan) {
    const fullPath = path.join(targetDir, filePath);
    const dir = path.dirname(fullPath);

    await ensureDir(dir);
    await fs.writeFile(fullPath, stringifyYaml(content), 'utf-8');
    console.log(`  ✓ ${filePath}`);
  }

  console.log('\n✅ Migration complete!\n');
  console.log('Next steps:');
  console.log('  1. Verify: archcodex resolve <arch-id>');
  console.log('  2. Test: archcodex check "src/**/*.ts"');
  console.log('  3. Remove old file: rm .arch/registry.yaml\n');
}

/**
 * Convert architecture ID to file path.
 *
 * Examples:
 *   base                        → base.yaml
 *   archcodex.cli               → cli/_index.yaml
 *   archcodex.cli.command       → cli/command.yaml
 *   archcodex.core.domain       → core/domain/_index.yaml
 *   archcodex.core.domain.schema → core/domain/schema.yaml
 */
function archIdToFilePath(archId: string): string {
  // Handle simple IDs without namespace prefix
  if (!archId.includes('.')) {
    return `${archId}.yaml`;
  }

  // Split and remove common prefix (e.g., "archcodex")
  const parts = archId.split('.');

  // Remove the first part if it's a common prefix
  if (parts[0] === 'archcodex' || parts[0] === 'arch') {
    parts.shift();
  }

  if (parts.length === 0) {
    return '_root.yaml';
  }

  if (parts.length === 1) {
    // archcodex.cli → cli/_index.yaml
    return `${parts[0]}/_index.yaml`;
  }

  // archcodex.cli.command → cli/command.yaml
  // archcodex.core.domain → core/domain/_index.yaml
  // archcodex.core.domain.schema → core/domain/schema.yaml

  const lastPart = parts[parts.length - 1];
  const dirParts = parts.slice(0, -1);

  // Check if this is a "parent" architecture (has children with same prefix)
  // For simplicity, we'll use _index.yaml for layer-level architectures
  const isParentArch = ['core', 'cli', 'infra', 'util', 'common', 'domain', 'test'].includes(lastPart);

  if (isParentArch && dirParts.length > 0) {
    return `${dirParts.join('/')}/${lastPart}/_index.yaml`;
  }

  return `${dirParts.join('/')}/${lastPart}.yaml`;
}
