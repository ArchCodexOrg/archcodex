/**
 * @arch archcodex.core.domain.constraint
 *
 * Validates that companion files exist (barrels, tests, styles, stories).
 * Supports variable substitution and optional content validation.
 */
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult, Violation } from './types.js';
import { BaseConstraintValidator } from './base.js';
import { ErrorCodes } from '../../utils/errors.js';
import { generateCompanionTemplate, type CompanionFileInfo } from './companion-file-templates.js';

/** Configuration for companion file constraint. */
interface CompanionFileConfig {
  path: string;
  must_export?: boolean;
}

/** Validates that companion files exist. Error code: E028 */
export class RequireCompanionFileValidator extends BaseConstraintValidator {
  readonly rule = 'require_companion_file' as const;
  readonly errorCode = ErrorCodes.REQUIRE_COMPANION_FILE;

  validate(constraint: Constraint, context: ConstraintContext): ConstraintResult {
    const violations: Violation[] = [];
    const configs = this.parseConfigs(constraint.value);

    // Get file info for variable substitution
    const fileInfo = this.getFileInfo(context.filePath);

    // Skip if this file is itself a companion (e.g., index.ts, *.test.ts)
    if (this.isCompanionFile(context.fileName)) {
      return { passed: true, violations: [] };
    }

    for (const config of configs) {
      const companionPath = this.resolveCompanionPath(config.path, fileInfo, context.filePath);

      // Phase 1: Check if companion file exists
      if (!existsSync(companionPath)) {
        const relativePath = path.relative(path.dirname(context.filePath), companionPath);
        const suggestion = generateCompanionTemplate(fileInfo, companionPath);

        violations.push(
          this.createViolation(
            constraint,
            `Missing companion file: ${relativePath}`,
            context,
            {
              line: 0,
              column: 0,
              actual: context.fileName,
              suggestion,
            }
          )
        );
        continue;
      }

      // Phase 2: Check if companion exports this file (if must_export is true)
      if (config.must_export) {
        const exportCheck = this.checkExportsFrom(companionPath, fileInfo.name, fileInfo.ext);
        if (!exportCheck.exports) {
          const relativePath = path.relative(path.dirname(context.filePath), companionPath);
          violations.push(
            this.createViolation(
              constraint,
              `Companion file ${relativePath} does not export from '${context.fileName}'`,
              context,
              {
                line: 0,
                column: 0,
                actual: context.fileName,
                suggestion: {
                  action: 'add',
                  target: relativePath,
                  replacement: exportCheck.suggestedExport,
                  insertAt: 'end',
                },
              }
            )
          );
        }
      }
    }

    return { passed: violations.length === 0, violations };
  }

  /** Parse constraint value into companion file configs. */
  private parseConfigs(value: unknown): CompanionFileConfig[] {
    if (typeof value === 'string') return [{ path: value }];
    if (Array.isArray(value)) {
      return value.map(v => {
        if (typeof v === 'string') return { path: v };
        if (typeof v === 'object' && v !== null && 'path' in v) {
          const obj = v as Record<string, unknown>;
          return { path: String(obj.path), must_export: Boolean(obj.must_export) };
        }
        return { path: String(v) };
      });
    }
    if (typeof value === 'object' && value !== null && 'path' in value) {
      const obj = value as Record<string, unknown>;
      return [{ path: String(obj.path), must_export: Boolean(obj.must_export) }];
    }
    return [];
  }

  /** Get file info for variable substitution. */
  private getFileInfo(filePath: string): CompanionFileInfo {
    const ext = path.extname(filePath);
    const name = path.basename(filePath, ext);
    const dir = path.basename(path.dirname(filePath));

    return {
      name,
      nameKebab: this.toKebabCase(name),
      ext: ext.slice(1), // Remove leading dot
      dir,
    };
  }

  /** Convert string to kebab-case. */
  private toKebabCase(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase();
  }

  /** Resolve companion path with variable substitution. */
  private resolveCompanionPath(pattern: string, fileInfo: CompanionFileInfo, sourcePath: string): string {
    const sourceDir = path.dirname(sourcePath);
    const resolved = pattern
      .replace(/\$\{name\}/g, fileInfo.name)
      .replace(/\$\{name:kebab\}/g, fileInfo.nameKebab)
      .replace(/\$\{ext\}/g, fileInfo.ext)
      .replace(/\$\{dir\}/g, fileInfo.dir);
    return path.isAbsolute(resolved) ? resolved : path.resolve(sourceDir, resolved);
  }

  /** Check if a file is itself a companion file (skip validation). */
  private isCompanionFile(fileName: string): boolean {
    return fileName === 'index.ts' || fileName === 'index.tsx' || fileName === 'index.js' ||
      /\.(test|spec)\.[tj]sx?$/.test(fileName) || /\.stories?\.[tj]sx?$/.test(fileName);
  }

  /** Check if companion file exports from source file. */
  private checkExportsFrom(companionPath: string, sourceName: string, _sourceExt: string): { exports: boolean; suggestedExport: string } {
    const suggestedExport = `export * from './${sourceName}.js';`;
    try {
      const content = readFileSync(companionPath, 'utf-8');
      const ext = '(\\.js|\\.ts|\\.tsx)?';
      const patterns = [
        new RegExp(`export\\s+\\*\\s+from\\s+['"]\\./${sourceName}${ext}['"]`),
        new RegExp(`export\\s+\\{[^}]+\\}\\s+from\\s+['"]\\./${sourceName}${ext}['"]`),
        new RegExp(`from\\s+['"]\\./${sourceName}['"]`),
      ];
      return { exports: patterns.some(p => p.test(content)), suggestedExport };
    } catch { /* file read error */
      return { exports: false, suggestedExport };
    }
  }

  protected getFixHint(constraint: Constraint, _actual?: string): string {
    const configs = this.parseConfigs(constraint.value);
    const paths = configs.map(c => c.path).join(', ');
    return `Create companion file(s): ${paths}`;
  }
}
