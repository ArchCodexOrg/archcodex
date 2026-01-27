/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Test regex patterns against source files before committing constraints.
 * Uses the same regex flags (gms) as forbid_pattern/require_pattern.
 */
import { Command } from 'commander';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { glob } from 'glob';
import { loadConfig } from '../../core/config/loader.js';

/**
 * Create the test-pattern command.
 *
 * Usage: archcodex test-pattern <regex> [glob]
 * Tests a regex pattern against files to preview matches before adding constraints.
 */
export function createTestPatternCommand(): Command {
  return new Command('test-pattern')
    .description('Test a regex pattern against files (same flags as forbid_pattern)')
    .argument('<regex>', 'Regex pattern to test (same syntax as forbid_pattern/require_pattern)')
    .argument('[fileGlob]', 'Glob pattern for files to scan (default: from config.files.scan)')
    .option('--max-matches <n>', 'Maximum matches to show', '20')
    .option('--context <n>', 'Lines of context around each match', '0')
    .option('--json', 'Output as JSON')
    .action(async (regex: string, fileGlob: string | undefined, options) => {
      const projectRoot = process.cwd();

      // Use config scan patterns if no glob specified
      if (!fileGlob) {
        const config = await loadConfig(projectRoot);
        const patterns = config.files?.scan?.include ?? ['**/*.ts', '**/*.tsx'];
        fileGlob = patterns[0];
      }
      const maxMatches = parseInt(options.maxMatches, 10);
      const contextLines = parseInt(options.context, 10);

      // Compile regex with same flags as forbid_pattern
      let pattern: RegExp;
      try {
        pattern = new RegExp(regex, 'gms');
      } catch (e) {
        console.error(`\x1b[31mInvalid regex: ${(e as Error).message}\x1b[0m`);
        process.exit(1);
      }

      // Find files matching glob
      const files = await glob(fileGlob, {
        cwd: projectRoot,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
        absolute: true,
      });

      if (files.length === 0) {
        console.log(`\x1b[33mNo files found matching: ${fileGlob}\x1b[0m`);
        return;
      }

      // Scan files
      const matchResults: Array<{
        file: string;
        matches: Array<{ line: number; text: string; context?: string[] }>;
      }> = [];
      let totalMatches = 0;
      let filesWithMatches = 0;

      for (const file of files) {
        let content: string;
        try {
          content = fs.readFileSync(file, 'utf-8');
        } catch {
          continue;
        }

        // Reset regex state for each file
        pattern.lastIndex = 0;
        const fileMatches: Array<{ line: number; text: string; context?: string[] }> = [];
        const lines = content.split('\n');

        const allMatches = [...content.matchAll(pattern)];

        for (const match of allMatches) {
          const beforeMatch = content.substring(0, match.index ?? 0);
          const lineNum = beforeMatch.split('\n').length;
          const matchText = match[0].length > 80
            ? match[0].substring(0, 80) + '...'
            : match[0];

          // Get context lines if requested
          let context: string[] | undefined;
          if (contextLines > 0) {
            const start = Math.max(0, lineNum - 1 - contextLines);
            const end = Math.min(lines.length, lineNum + contextLines);
            context = lines.slice(start, end).map((l, i) => {
              const num = start + i + 1;
              const marker = num === lineNum ? '>' : ' ';
              return `${marker} ${num}: ${l}`;
            });
          }

          fileMatches.push({ line: lineNum, text: matchText, context });
          totalMatches++;
        }

        if (fileMatches.length > 0) {
          filesWithMatches++;
          matchResults.push({
            file: path.relative(projectRoot, file),
            matches: fileMatches,
          });
        }
      }

      // Output results
      if (options.json) {
        console.log(JSON.stringify({
          pattern: regex,
          flags: 'gms',
          totalFiles: files.length,
          filesWithMatches,
          totalMatches,
          matches: matchResults.slice(0, maxMatches),
        }, null, 2));
        return;
      }

      // Human format
      console.log(`\n\x1b[1mPattern:\x1b[0m ${regex}`);
      console.log(`\x1b[1mFlags:\x1b[0m gms (global, multiline, dotAll)`);
      console.log('');

      if (totalMatches === 0) {
        console.log(`\x1b[32mNo matches\x1b[0m in ${files.length} files`);
        return;
      }

      console.log(`\x1b[31mMATCHES\x1b[0m (${totalMatches} in ${filesWithMatches} files):`);

      let shown = 0;
      for (const result of matchResults) {
        if (shown >= maxMatches) break;

        for (const m of result.matches) {
          if (shown >= maxMatches) break;

          if (m.context) {
            console.log(`\n  \x1b[36m${result.file}:${m.line}\x1b[0m`);
            for (const line of m.context) {
              console.log(`    ${line}`);
            }
          } else {
            const displayText = m.text.replace(/\n/g, '\\n');
            console.log(`  \x1b[36m${result.file}:${m.line}\x1b[0m`);
            console.log(`    ${displayText}`);
          }
          shown++;
        }
      }

      if (totalMatches > maxMatches) {
        console.log(`\n  ... ${totalMatches - maxMatches} more (use --max-matches to see all)`);
      }

      console.log(`\n\x1b[90mNo match in ${files.length - filesWithMatches} files\x1b[0m`);
      console.log('');
    });
}
