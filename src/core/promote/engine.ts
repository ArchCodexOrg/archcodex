/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Promote engine: automates the override → intent lifecycle.
 * Scans for matching overrides, updates registry constraints,
 * and replaces overrides with intent annotations.
 */
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { loadConfig } from '../config/loader.js';
import { loadIntentRegistry } from '../registry/loader.js';
import { AuditScanner } from '../audit/scanner.js';
import { parseArchTags } from '../arch-tag/parser.js';
import { readFile } from '../../utils/file-system.js';
import type { AuditReport } from '../audit/types.js';
import type {
  PromoteInput,
  PromoteResult,
  PromoteFileChange,
  PromoteRegistryChange,
  PromoteIntentChange,
} from './types.js';

const DEFAULT_REGISTRY_DIR = '.arch/registry';
const DEFAULT_INTENTS_FILE = '_intents.yaml';

// Patterns for override-related lines
const REASON_LINE = /^\s*\*?\s*@reason\s+/;
const EXPIRES_LINE = /^\s*\*?\s*@expires\s+/;
const TICKET_LINE = /^\s*\*?\s*@ticket\s+/;
const APPROVED_BY_LINE = /^\s*\*?\s*@approved_by\s+/;

/**
 * Promote engine orchestrates the override → intent transformation.
 */
export class PromoteEngine {
  constructor(private projectRoot: string) {}

  async promote(input: PromoteInput): Promise<PromoteResult> {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Phase 1: Find matching overrides
    const config = await loadConfig(this.projectRoot);
    const scanner = new AuditScanner(this.projectRoot, config);
    const report = await scanner.scan();
    const fileChanges = await this.findMatchingOverrides(report, input.rule, input.value, input.intentName);

    if (fileChanges.length === 0) {
      warnings.push(`No overrides matching ${input.rule}:${input.value} found.`);
    }

    // Phase 2: Check intent registry
    const intentRegistry = await loadIntentRegistry(this.projectRoot);
    const intentExists = input.intentName in intentRegistry.intents;
    const intentChange: PromoteIntentChange = {
      isNew: !intentExists,
      name: input.intentName,
      description: input.description,
      category: input.category,
    };

    if (!intentExists && !input.description) {
      errors.push(`New intent "${input.intentName}" requires --description to define it.`);
    }

    // Phase 3: Find constraint definitions in registry
    const registryChanges = await this.findConstraintDefinitions(input.rule, input.value, input.intentName);

    if (registryChanges.length === 0) {
      warnings.push(`No constraint definitions found matching ${input.rule}:${input.value} in registry.`);
    }

    const result: PromoteResult = {
      fileChanges,
      registryChanges,
      intentChange,
      applied: false,
      warnings,
      errors,
    };

    // Phase 4: Apply if requested and no blocking errors
    if (input.apply && errors.length === 0) {
      if (intentChange.isNew) {
        await this.applyIntentChange(intentChange);
      }
      await this.applyRegistryChanges(registryChanges, input.intentName);
      await this.applyFileChanges(fileChanges, input.intentName);
      result.applied = true;
    }

    return result;
  }

  /**
   * Find all overrides matching the given rule:value pattern.
   */
  private async findMatchingOverrides(
    report: AuditReport,
    rule: string,
    valuePattern: string,
    intentName: string
  ): Promise<PromoteFileChange[]> {
    const changes: PromoteFileChange[] = [];

    for (const file of report.files) {
      for (const override of file.overrides) {
        // Match: exact rule, value contains the pattern
        if (override.rule !== rule) continue;
        if (!override.value.includes(valuePattern)) continue;

        // Determine override block extent
        const absolutePath = path.resolve(this.projectRoot, file.filePath);
        const content = await readFile(absolutePath);
        const lines = content.split('\n');
        const { startLine, endLine } = this.findOverrideBlockExtent(lines, override.line);

        // Check if intent already present
        const parseResult = parseArchTags(content);
        const intentAlreadyPresent = parseResult.intents.some(
          i => i.name.toLowerCase() === intentName.toLowerCase()
        );

        changes.push({
          filePath: file.filePath,
          archId: file.archId,
          overrideStartLine: startLine,
          overrideEndLine: endLine,
          overrideRule: override.rule,
          overrideValue: override.value,
          intentAlreadyPresent,
        });
      }
    }

    return changes;
  }

  /**
   * Find the full extent of an override block (override + reason + expires + ticket + approved_by).
   */
  private findOverrideBlockExtent(lines: string[], overrideLine: number): { startLine: number; endLine: number } {
    const startLine = overrideLine; // 1-based
    let endLine = overrideLine;

    // Scan forward from the override line
    for (let i = overrideLine; i < lines.length; i++) { // overrideLine is 1-based, lines[overrideLine] is the next line
      const line = lines[i]; // 0-based index = i, which is overrideLine (1-based) = next line after override
      if (REASON_LINE.test(line) || EXPIRES_LINE.test(line) || TICKET_LINE.test(line) || APPROVED_BY_LINE.test(line)) {
        endLine = i + 1; // Convert to 1-based
      } else {
        break;
      }
    }

    return { startLine, endLine };
  }

  /**
   * Find constraint definitions in registry YAML files that match rule:value.
   */
  private async findConstraintDefinitions(
    rule: string,
    valuePattern: string,
    intentName: string
  ): Promise<PromoteRegistryChange[]> {
    const registryDir = path.resolve(this.projectRoot, DEFAULT_REGISTRY_DIR);
    const changes: PromoteRegistryChange[] = [];

    // Find all YAML files in registry
    const yamlFiles = await this.findYamlFiles(registryDir);

    for (const filePath of yamlFiles) {
      const fileName = path.basename(filePath);
      // Skip special files
      if (fileName.startsWith('_')) continue;

      const content = await fs.readFile(filePath, 'utf-8');
      const constraintMatches = this.findConstraintsInYaml(content, rule, valuePattern, intentName);

      for (const match of constraintMatches) {
        changes.push({
          filePath,
          archId: match.archId,
          constraintRule: rule,
          constraintValue: match.value,
          unlessAlreadyExists: match.unlessExists,
          intentAlreadyInUnless: match.intentInUnless,
        });
      }
    }

    return changes;
  }

  /**
   * Search YAML content for constraint blocks matching rule and value.
   */
  private findConstraintsInYaml(
    content: string,
    rule: string,
    valuePattern: string,
    intentName: string
  ): Array<{ archId: string; value: string; unlessExists: boolean; intentInUnless: boolean }> {
    const results: Array<{ archId: string; value: string; unlessExists: boolean; intentInUnless: boolean }> = [];
    const lines = content.split('\n');

    let currentArchId = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Track architecture IDs (top-level keys in YAML, not indented or indented at arch level)
      const archMatch = line.match(/^(\w[\w.-]*):$/);
      if (archMatch) {
        currentArchId = archMatch[1];
        continue;
      }

      // Look for constraint rule matches
      const ruleMatch = line.match(/^\s*-\s*rule:\s*(\w+)/);
      if (ruleMatch && ruleMatch[1] === rule) {
        // Found a matching rule, check the value in nearby lines
        const blockEnd = this.findConstraintBlockEnd(lines, i);
        const blockLines = lines.slice(i, blockEnd);
        const blockText = blockLines.join('\n');

        // Check if value matches
        const valueMatch = blockText.match(/value:\s*(.+)/);
        if (valueMatch) {
          const rawValue = valueMatch[1].trim().replace(/^["']|["']$/g, '');
          if (rawValue.includes(valuePattern)) {
            // Check for existing unless clause
            const unlessExists = /\bunless:/.test(blockText);
            const intentRef = `@intent:${intentName}`;
            const intentInUnless = unlessExists && blockText.includes(intentRef);

            results.push({
              archId: currentArchId,
              value: rawValue,
              unlessExists,
              intentInUnless,
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Find the end of a constraint block (next `- rule:` or unindented line).
   */
  private findConstraintBlockEnd(lines: string[], startIdx: number): number {
    const startIndent = lines[startIdx].match(/^(\s*)/)?.[1].length ?? 0;

    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '') continue;
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
      // New constraint item at same or lower indent level
      if (indent <= startIndent && line.trim().startsWith('-')) break;
      // Back to architecture key level
      if (indent < startIndent) break;
    }

    // Return the line after the last line of the block
    for (let i = lines.length - 1; i > startIdx; i--) {
      const line = lines[i];
      if (line.trim() === '') continue;
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
      if (indent > startIndent || indent === startIndent) {
        return i + 1;
      }
    }
    return lines.length;
  }

  /**
   * Apply intent definition to _intents.yaml.
   */
  private async applyIntentChange(intentChange: PromoteIntentChange): Promise<void> {
    const intentsPath = path.resolve(this.projectRoot, DEFAULT_REGISTRY_DIR, DEFAULT_INTENTS_FILE);

    let content: string;
    try {
      content = await fs.readFile(intentsPath, 'utf-8');
    } catch {
      // File doesn't exist, create it
      content = 'intents:\n';
    }

    // Append new intent definition
    const indent = '  ';
    let intentBlock = `\n${indent}${intentChange.name}:\n`;
    intentBlock += `${indent}${indent}description: "${intentChange.description}"\n`;
    if (intentChange.category) {
      intentBlock += `${indent}${indent}category: ${intentChange.category}\n`;
    }

    // Append before trailing newlines
    const trimmed = content.trimEnd();
    content = trimmed + intentBlock + '\n';

    await fs.writeFile(intentsPath, content, 'utf-8');
  }

  /**
   * Apply unless clause additions to registry YAML files.
   */
  private async applyRegistryChanges(
    changes: PromoteRegistryChange[],
    intentName: string
  ): Promise<void> {
    // Group changes by file
    const byFile = new Map<string, PromoteRegistryChange[]>();
    for (const change of changes) {
      if (change.intentAlreadyInUnless) continue; // Skip already-configured
      const list = byFile.get(change.filePath) ?? [];
      list.push(change);
      byFile.set(change.filePath, list);
    }

    for (const [filePath, fileChanges] of byFile) {
      let content = await fs.readFile(filePath, 'utf-8');

      // Process each constraint in this file (process from bottom to top to preserve line numbers)
      const lines = content.split('\n');
      const insertions: Array<{ lineIdx: number; text: string }> = [];

      for (const change of fileChanges) {
        const insertInfo = this.findUnlessInsertionPoint(lines, change.constraintRule, change.constraintValue, intentName);
        if (insertInfo) {
          insertions.push(insertInfo);
        }
      }

      // Sort insertions by line index descending (apply from bottom to top)
      insertions.sort((a, b) => b.lineIdx - a.lineIdx);

      for (const { lineIdx, text } of insertions) {
        lines.splice(lineIdx, 0, text);
      }

      content = lines.join('\n');
      await fs.writeFile(filePath, content, 'utf-8');
    }
  }

  /**
   * Find where to insert the unless clause for a constraint.
   */
  private findUnlessInsertionPoint(
    lines: string[],
    rule: string,
    value: string,
    intentName: string
  ): { lineIdx: number; text: string } | null {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const ruleMatch = line.match(/^\s*-\s*rule:\s*(\w+)/);
      if (ruleMatch && ruleMatch[1] === rule) {
        // Check if value matches in nearby lines
        const blockEnd = this.findConstraintBlockEnd(lines, i);
        const blockText = lines.slice(i, blockEnd).join('\n');
        if (!blockText.includes(value)) continue;

        // Detect indentation (constraint item indent + 2)
        const itemIndent = line.match(/^(\s*)/)?.[1] ?? '';
        const fieldIndent = itemIndent + '  ';
        const arrayIndent = fieldIndent + '  ';
        const intentRef = `"@intent:${intentName}"`;

        // Check if unless already exists
        const unlessIdx = lines.slice(i, blockEnd).findIndex(l => /^\s*unless:/.test(l));
        if (unlessIdx >= 0) {
          // Append to existing unless array
          const unlessLineIdx = i + unlessIdx;
          // Find end of unless array
          let insertAfter = unlessLineIdx;
          for (let j = unlessLineIdx + 1; j < blockEnd; j++) {
            if (/^\s*-\s+"?@/.test(lines[j]) || /^\s*-\s+import:/.test(lines[j])) {
              insertAfter = j;
            } else {
              break;
            }
          }
          return { lineIdx: insertAfter + 1, text: `${arrayIndent}- ${intentRef}` };
        }

        // Find best insertion point (after why: or severity:)
        let insertAfter = i;
        for (let j = i + 1; j < blockEnd; j++) {
          if (/^\s*(why|severity|value|pattern|applies_when):/.test(lines[j])) {
            insertAfter = j;
          }
          // Stop at multi-line value blocks
          if (/^\s*(intent|counterexamples|codeExample|alternative):/.test(lines[j])) {
            break;
          }
        }

        const unlessBlock = `${fieldIndent}unless:\n${arrayIndent}- ${intentRef}`;
        return { lineIdx: insertAfter + 1, text: unlessBlock };
      }
    }
    return null;
  }

  /**
   * Apply override → intent replacements in source files.
   */
  private async applyFileChanges(
    changes: PromoteFileChange[],
    intentName: string
  ): Promise<void> {
    // Group changes by file (a file might have multiple overrides)
    const byFile = new Map<string, PromoteFileChange[]>();
    for (const change of changes) {
      const list = byFile.get(change.filePath) ?? [];
      list.push(change);
      byFile.set(change.filePath, list);
    }

    for (const [filePath, fileChanges] of byFile) {
      const absolutePath = path.resolve(this.projectRoot, filePath);
      let content = await fs.readFile(absolutePath, 'utf-8');
      const lines = content.split('\n');

      // Sort changes by start line descending (process from bottom to top)
      const sorted = [...fileChanges].sort((a, b) => b.overrideStartLine - a.overrideStartLine);

      for (const change of sorted) {
        // Remove override block lines
        const startIdx = change.overrideStartLine - 1; // Convert to 0-based
        const endIdx = change.overrideEndLine - 1;
        const count = endIdx - startIdx + 1;
        lines.splice(startIdx, count);
      }

      // Add @intent if not already present
      const anyNeedsIntent = fileChanges.some(c => !c.intentAlreadyPresent);
      if (anyNeedsIntent) {
        // Find the @arch line to insert after
        const archLineIdx = lines.findIndex(l => /@arch\s+/.test(l));
        if (archLineIdx >= 0) {
          // Determine comment style (JSDoc: " * @intent:" or line comment: "// @intent:")
          const archLine = lines[archLineIdx];
          const isJsDoc = /^\s*\*/.test(archLine);
          const indent = archLine.match(/^(\s*)/)?.[1] ?? '';

          if (isJsDoc) {
            lines.splice(archLineIdx + 1, 0, `${indent}* @intent:${intentName}`);
          } else {
            lines.splice(archLineIdx + 1, 0, `${indent}// @intent:${intentName}`);
          }
        }
      }

      content = lines.join('\n');
      await fs.writeFile(absolutePath, content, 'utf-8');
    }
  }

  /**
   * Recursively find all YAML files in a directory.
   */
  private async findYamlFiles(dirPath: string): Promise<string[]> {
    const results: string[] = [];

    async function scanDir(currentPath: string): Promise<void> {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          await scanDir(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
          results.push(fullPath);
        }
      }
    }

    await scanDir(dirPath);
    return results.sort();
  }
}
