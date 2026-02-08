/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 * @intent:cli-subcommand
 *
 * Handler functions for the doc command.
 * Extracted from doc.ts to keep command files under 450 lines.
 */
import chalk from 'chalk';
import { loadRegistry, resolveArchitecture } from '../../core/registry/index.js';
import { generateAdr, generateAllAdrs, createTemplateEngine, getDefaultTemplates } from '../../core/docs/index.js';
import type { AdrGeneratorOptions, AllAdrsOptions } from '../../core/docs/index.js';
import { writeFile, mkdir, readFile } from 'fs/promises';
import path from 'path';
import { fileExists } from '../../utils/file-system.js';
import { getRegistryDirPath } from '../../core/registry/loader.js';
import { loadSpecRegistry, listSpecIds, getSpecsDir, specRegistryExists } from '../../core/spec/loader.js';
import { resolveSpec } from '../../core/spec/resolver.js';
import { generateAllDocs } from '../../core/spec/generators/docs.js';
import chokidar from 'chokidar';

export type DocType = 'adr' | 'spec' | 'all';

export interface DocAdrOptions {
  all?: boolean;
  index?: boolean;
  output?: string;
  dryRun?: boolean;
  format?: 'standard' | 'compact' | 'detailed';
  json?: boolean;
  groupBy?: 'layer' | 'flat';
  skipAbstract?: boolean;
  includeInheritance?: boolean;
  includeHints?: boolean;
  includeReferences?: boolean;
  templateDir?: string;
}

export async function runDocAdr(archId: string | undefined, opts: DocAdrOptions): Promise<void> {
  const projectRoot = process.cwd();

  // Load registry
  const registry = await loadRegistry(projectRoot);
  if (!registry) {
    console.error(chalk.red('Error: No .arch directory found'));
    process.exit(1);
  }

  // Build options
  const adrOptions: AdrGeneratorOptions = {
    includeInheritance: opts.includeInheritance !== false,
    includeHints: opts.includeHints !== false,
    includeReferences: opts.includeReferences !== false,
    format: opts.format as 'standard' | 'compact' | 'detailed',
  };

  // Generate all ADRs
  if (opts.all) {
    const allOptions: AllAdrsOptions = {
      outputDir: opts.output,
      includeIndex: true,
      groupBy: opts.groupBy as 'layer' | 'flat',
      skipAbstract: opts.skipAbstract !== false,
    };

    // Resolver function
    const resolveArch = (id: string) => {
      const result = resolveArchitecture(registry, id);
      return result?.architecture;
    };

    const result = generateAllAdrs(registry, resolveArch, allOptions);

    if (!result.valid) {
      for (const error of result.errors) {
        console.error(chalk.red(`Error [${error.code}]:`), error.message);
      }
      process.exit(1);
    }

    // Index only mode
    if (opts.index) {
      if (opts.json) {
        console.log(JSON.stringify({ index: result.index }, null, 2));
      } else if (opts.dryRun) {
        console.log(chalk.cyan('Would generate index.md:'));
        console.log(result.index);
      } else if (opts.output) {
        const indexPath = path.join(opts.output, 'index.md');
        await mkdir(opts.output, { recursive: true });
        await writeFile(indexPath, result.index || '');
        console.log(chalk.green('Generated:'), indexPath);
      } else {
        console.log(result.index);
      }
      return;
    }

    // Full generation
    if (opts.json) {
      console.log(JSON.stringify({
        files: result.files.map(f => ({ name: f.name, archId: f.archId })),
        index: result.index,
        count: result.files.length,
      }, null, 2));
      return;
    }

    if (opts.dryRun) {
      console.log(chalk.cyan('Would generate the following files:'));
      for (const file of result.files) {
        console.log(`  - ${file.name} (${file.archId})`);
      }
      console.log(`  - index.md`);
      console.log(chalk.dim(`\nTotal: ${result.files.length + 1} files`));
      return;
    }

    if (opts.output) {
      await mkdir(opts.output, { recursive: true });

      // Write all ADR files
      for (const file of result.files) {
        const filePath = path.join(opts.output, file.name);
        await writeFile(filePath, file.content);
        console.log(chalk.green('Generated:'), filePath);
      }

      // Write index
      if (result.index) {
        const indexPath = path.join(opts.output, 'index.md');
        await writeFile(indexPath, result.index);
        console.log(chalk.green('Generated:'), indexPath);
      }

      console.log(chalk.dim(`\nTotal: ${result.files.length + 1} files`));
    } else {
      // Output to stdout - just show summary
      console.log(chalk.cyan(`Generated ${result.files.length} ADRs:`));
      for (const file of result.files) {
        console.log(`  - ${file.archId}`);
      }
    }
    return;
  }

  // Single architecture
  if (!archId) {
    console.error(chalk.red('Error: Architecture ID required (or use --all)'));
    console.log(chalk.dim('\nUsage:'));
    console.log(chalk.dim('  archcodex doc adr <archId>'));
    console.log(chalk.dim('  archcodex doc adr --all'));
    process.exit(1);
  }

  // Check if architecture exists
  if (!registry.nodes[archId]) {
    console.error(chalk.red(`Error: Architecture '${archId}' not found`));

    // Suggest similar
    const similar = Object.keys(registry.nodes)
      .filter(id => id.includes(archId) || archId.includes(id.split('.').pop() || ''))
      .slice(0, 5);

    if (similar.length > 0) {
      console.log(chalk.dim('\nDid you mean:'));
      for (const id of similar) {
        console.log(chalk.dim(`  - ${id}`));
      }
    }
    process.exit(1);
  }

  // Resolve architecture
  const resolved = resolveArchitecture(registry, archId);
  if (!resolved) {
    console.error(chalk.red(`Error: Failed to resolve architecture '${archId}'`));
    process.exit(1);
  }

  // Generate ADR
  const result = generateAdr(resolved.architecture, adrOptions);

  if (!result.valid) {
    for (const error of result.errors) {
      console.error(chalk.red(`Error [${error.code}]:`), error.message);
    }
    process.exit(1);
  }

  // Output
  if (opts.json) {
    console.log(JSON.stringify({
      archId,
      sections: result.sections,
      markdown: result.markdown,
    }, null, 2));
    return;
  }

  if (opts.dryRun) {
    console.log(chalk.cyan(`Would generate ADR for ${archId}:`));
    console.log(chalk.dim('---'));
    console.log(result.markdown);
    return;
  }

  if (opts.output) {
    await writeFile(opts.output, result.markdown);
    console.log(chalk.green('Generated:'), opts.output);
    return;
  }

  // Output to stdout
  console.log(result.markdown);
}

export async function runDocTemplates(opts: { init?: boolean; list?: boolean; json?: boolean }): Promise<void> {
  const projectRoot = process.cwd();
  const templateDir = path.join(projectRoot, '.arch/templates/docs');
  const engine = createTemplateEngine(projectRoot);

  // List templates
  if (opts.list || (!opts.init && !opts.list)) {
    const templates = await engine.listTemplates();

    if (opts.json) {
      console.log(JSON.stringify({ templates }, null, 2));
      return;
    }

    console.log(chalk.bold('\nDocumentation Templates'));
    console.log(chalk.dim(`Template directory: ${templateDir}\n`));

    console.log(chalk.cyan('ADR Templates:'));
    for (const t of templates.filter(t => t.name.startsWith('adr'))) {
      const sourceLabel = t.source === 'custom' ? chalk.green('(custom)') : chalk.dim('(default)');
      console.log(`  - ${t.name} ${sourceLabel}`);
    }

    console.log(chalk.cyan('\nSpec Templates:'));
    for (const t of templates.filter(t => t.name.startsWith('spec'))) {
      const sourceLabel = t.source === 'custom' ? chalk.green('(custom)') : chalk.dim('(default)');
      console.log(`  - ${t.name} ${sourceLabel}`);
    }

    console.log(chalk.dim('\nTo customize, create files in .arch/templates/docs/'));
    console.log(chalk.dim('Example: .arch/templates/docs/adr.md.hbs'));
    return;
  }

  // Initialize templates
  if (opts.init) {
    const defaults = getDefaultTemplates();

    // Check if directory exists
    if (await fileExists(templateDir)) {
      console.log(chalk.yellow('Template directory already exists:'), templateDir);
      console.log(chalk.dim('Skipping files that already exist...'));
    } else {
      await mkdir(templateDir, { recursive: true });
      console.log(chalk.green('Created:'), templateDir);
    }

    // Write each template
    let created = 0;
    for (const [name, content] of Object.entries(defaults)) {
      const filePath = path.join(templateDir, `${name}.md.hbs`);
      if (await fileExists(filePath)) {
        console.log(chalk.dim(`  Skipped: ${name}.md.hbs (exists)`));
      } else {
        await writeFile(filePath, content);
        console.log(chalk.green(`  Created: ${name}.md.hbs`));
        created++;
      }
    }

    console.log(chalk.dim(`\nCreated ${created} template(s)`));
    console.log(chalk.dim('Edit these files to customize documentation output.'));
  }
}

export async function runDocWatch(type: DocType, opts: { output: string; debounce: string; clear?: boolean }): Promise<void> {
  const projectRoot = process.cwd();
  const debounceMs = parseInt(opts.debounce, 10) || 500;
  const watchPaths: string[] = [];

  if (type === 'adr' || type === 'all') watchPaths.push(getRegistryDirPath(projectRoot));
  if (type === 'spec' || type === 'all') {
    const specsDir = getSpecsDir(projectRoot);
    if (await specRegistryExists(projectRoot)) watchPaths.push(specsDir);
  }

  console.log();
  console.log(chalk.bold.cyan('ArchCodex Doc Watch Mode'));
  console.log(chalk.dim('─'.repeat(50)));
  console.log(chalk.dim(`Type:      ${type}`));
  console.log(chalk.dim(`Output:    ${opts.output}`));
  console.log(chalk.dim(`Watching:  ${watchPaths.map(p => path.relative(projectRoot, p)).join(', ')}`));
  console.log(chalk.dim(`Debounce:  ${debounceMs}ms`));
  console.log(chalk.dim('Press Ctrl+C to stop'));
  console.log();

  await regenerateDocs(projectRoot, type, opts.output);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const watcher = chokidar.watch(watchPaths, { ignored: ['**/node_modules/**'], ignoreInitial: true, persistent: true });

  watcher.on('all', (_event, filePath) => {
    if (!filePath.endsWith('.yaml') && !filePath.endsWith('.yml')) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (opts.clear) console.clear();
      console.log(chalk.yellow(`\n[${new Date().toLocaleTimeString()}] Change detected: ${path.basename(filePath)}`));
      await regenerateDocs(projectRoot, type, opts.output);
    }, debounceMs);
  });

  watcher.on('ready', () => console.log(chalk.green('Watching for changes...')));
}

export async function regenerateDocs(projectRoot: string, type: DocType, baseDir: string): Promise<{ adrCount: number; specCount: number }> {
  let adrCount = 0, specCount = 0;

  if (type === 'adr' || type === 'all') {
    const registry = await loadRegistry(projectRoot);
    if (registry) {
      const resolveArch = (id: string) => resolveArchitecture(registry, id)?.architecture;
      const result = generateAllAdrs(registry, resolveArch, { includeIndex: true, groupBy: 'layer', skipAbstract: true });
      if (result.valid) {
        const adrDir = type === 'all' ? path.join(baseDir, 'adr') : baseDir;
        await mkdir(adrDir, { recursive: true });
        for (const file of result.files) await writeFile(path.join(adrDir, file.name), file.content);
        if (result.index) await writeFile(path.join(adrDir, 'index.md'), result.index);
        adrCount = result.files.length + 1;
        console.log(chalk.green(`✓ ADRs: ${adrCount} files in ${adrDir}`));
      }
    }
  }

  if (type === 'spec' || type === 'all') {
    if (await specRegistryExists(projectRoot)) {
      const specRegistry = await loadSpecRegistry(projectRoot);
      const specIds = listSpecIds(specRegistry);
      const specDir = type === 'all' ? path.join(baseDir, 'spec') : baseDir;
      await mkdir(specDir, { recursive: true });

      for (const specId of specIds) {
        const resolved = resolveSpec(specRegistry, specId);
        if (resolved.valid && resolved.spec) {
          const result = generateAllDocs(resolved.spec, { includeToc: true });
          if (result.valid && result.markdown) {
            const fileName = `${specId.replace(/\./g, '-')}.md`;
            await writeFile(path.join(specDir, fileName), result.markdown);
            specCount++;
          }
        }
      }
      if (specCount > 0) console.log(chalk.green(`✓ Specs: ${specCount} files in ${specDir}`));
    }
  }

  return { adrCount, specCount };
}

export async function runDocVerify(type: DocType, opts: { output: string; fix?: boolean; json?: boolean }): Promise<number> {
  const projectRoot = process.cwd();
  const staleFiles: string[] = [];

  if (!(await fileExists(opts.output))) {
    if (opts.json) console.log(JSON.stringify({ valid: false, error: 'DIR_NOT_FOUND', staleFiles: [] }));
    else console.error(chalk.red(`Error: Directory not found: ${opts.output}`));
    return 1;
  }

  // Verify ADRs
  if (type === 'adr' || type === 'all') {
    const registry = await loadRegistry(projectRoot);
    if (registry) {
      const resolveArch = (id: string) => resolveArchitecture(registry, id)?.architecture;
      const result = generateAllAdrs(registry, resolveArch, { includeIndex: true, groupBy: 'layer', skipAbstract: true });
      const adrDir = type === 'all' ? path.join(opts.output, 'adr') : opts.output;

      for (const file of result.files) {
        const filePath = path.join(adrDir, file.name);
        if (!(await fileExists(filePath)) || (await readFile(filePath, 'utf-8')).trim() !== file.content.trim()) {
          staleFiles.push(type === 'all' ? `adr/${file.name}` : file.name);
        }
      }
      if (result.index) {
        const indexPath = path.join(adrDir, 'index.md');
        if ((await fileExists(indexPath)) && (await readFile(indexPath, 'utf-8')).trim() !== result.index.trim()) {
          staleFiles.push(type === 'all' ? 'adr/index.md' : 'index.md');
        }
      }
    }
  }

  // Verify Specs
  if ((type === 'spec' || type === 'all') && await specRegistryExists(projectRoot)) {
    const specRegistry = await loadSpecRegistry(projectRoot);
    const specDir = type === 'all' ? path.join(opts.output, 'spec') : opts.output;

    for (const specId of listSpecIds(specRegistry)) {
      const resolved = resolveSpec(specRegistry, specId);
      if (resolved.valid && resolved.spec) {
        const result = generateAllDocs(resolved.spec, { includeToc: true });
        if (result.valid && result.markdown) {
          const fileName = `${specId.replace(/\./g, '-')}.md`;
          const filePath = path.join(specDir, fileName);
          if (!(await fileExists(filePath)) || (await readFile(filePath, 'utf-8')).trim() !== result.markdown.trim()) {
            staleFiles.push(type === 'all' ? `spec/${fileName}` : fileName);
          }
        }
      }
    }
  }

  if (opts.json) {
    console.log(JSON.stringify({ valid: staleFiles.length === 0, staleFiles, type }));
    return staleFiles.length === 0 ? 0 : 1;
  }

  if (staleFiles.length === 0) {
    console.log(chalk.green(`✓ ${type === 'all' ? 'All documentation' : type.toUpperCase() + ' documentation'} is up-to-date`));
    return 0;
  }

  console.log(chalk.yellow(`⚠ ${staleFiles.length} file(s) are stale:`));
  for (const f of staleFiles) console.log(chalk.dim(`  - ${f}`));

  if (opts.fix) {
    console.log(chalk.cyan('\nRegenerating...'));
    await regenerateDocs(projectRoot, type, opts.output);
    return 0;
  }

  console.log(chalk.dim(`\nRun with --fix to regenerate`));
  return 1;
}
