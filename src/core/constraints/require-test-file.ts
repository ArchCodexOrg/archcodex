/**
 * @arch archcodex.core.domain.constraint
 *
 * Validates that a companion test file exists for the source file.
 */
import { existsSync } from 'fs';
import path from 'path';
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult, Violation } from './types.js';
import { BaseConstraintValidator } from './base.js';
import { ErrorCodes } from '../../utils/errors.js';

/**
 * Validates that a companion test file exists.
 * Error code: E011
 *
 * Checks for test files in multiple locations:
 * 1. Same directory: file.test.ts, file.spec.ts
 * 2. __tests__ subdirectory: __tests__/file.test.ts
 * 3. tests/ directory mirroring src/: tests/path/to/file.test.ts
 */
export class RequireTestFileValidator extends BaseConstraintValidator {
  readonly rule = 'require_test_file' as const;
  readonly errorCode = ErrorCodes.REQUIRE_TEST_FILE;

  validate(constraint: Constraint, context: ConstraintContext): ConstraintResult {
    const violations: Violation[] = [];
    const patterns = this.normalizeToArray(constraint.value);

    // Get file info
    const filePath = context.filePath;
    const ext = path.extname(context.fileName);
    const baseName = path.basename(context.fileName, ext);

    // Skip if this is already a test file
    if (this.isTestFile(context.fileName)) {
      return { passed: true, violations: [] };
    }

    // Check for companion test files
    const testFileFound = this.findTestFile(filePath, baseName, ext, patterns);

    if (!testFileFound) {
      violations.push(
        this.createViolation(
          constraint,
          `No companion test file found for '${context.fileName}'`,
          context,
          { line: 0, column: 0, actual: context.fileName }
        )
      );
    }

    return { passed: violations.length === 0, violations };
  }

  /**
   * Check if a file is already a test file.
   */
  private isTestFile(fileName: string): boolean {
    return /\.(test|spec)\.[tj]sx?$/.test(fileName);
  }

  /**
   * Find a companion test file in various locations.
   */
  private findTestFile(
    filePath: string,
    baseName: string,
    ext: string,
    patterns: string[]
  ): boolean {
    const dir = path.dirname(filePath);

    // Determine test file extensions to check
    const testExtensions = this.getTestExtensions(patterns, ext);

    // Location 1: Same directory (file.test.ts, file.spec.ts)
    for (const testExt of testExtensions) {
      const testPath = path.join(dir, `${baseName}${testExt}`);
      if (existsSync(testPath)) {
        return true;
      }
    }

    // Location 2: __tests__ subdirectory
    for (const testExt of testExtensions) {
      const testPath = path.join(dir, '__tests__', `${baseName}${testExt}`);
      if (existsSync(testPath)) {
        return true;
      }
    }

    // Location 3: tests/ directory mirroring src/
    // e.g., src/utils/yaml.ts -> tests/utils/yaml.test.ts
    const srcMatch = filePath.match(/[/\\]src[/\\](.+)$/);
    if (srcMatch) {
      const relativePath = srcMatch[1];
      const relativeDir = path.dirname(relativePath);

      // Find project root by splitting on src directory
      // Handle both Unix and Windows path separators
      const srcIndex = Math.max(
        filePath.lastIndexOf('/src/'),
        filePath.lastIndexOf('\\src\\')
      );

      // If neither separator found, skip this search location
      if (srcIndex === -1) {
        return false;
      }

      const projectRoot = filePath.slice(0, srcIndex);

      for (const testExt of testExtensions) {
        // tests/utils/yaml.test.ts
        const testPath = path.join(projectRoot, 'tests', relativeDir, `${baseName}${testExt}`);
        if (existsSync(testPath)) {
          return true;
        }

        // tests/unit/utils/yaml.test.ts
        const unitTestPath = path.join(projectRoot, 'tests', 'unit', relativeDir, `${baseName}${testExt}`);
        if (existsSync(unitTestPath)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get test file extensions based on patterns and source extension.
   */
  private getTestExtensions(patterns: string[], sourceExt: string): string[] {
    const extensions: string[] = [];

    for (const pattern of patterns) {
      // Pattern like "*.test.ts" -> ".test.ts"
      const match = pattern.match(/\*(\.[^*]+)$/);
      if (match) {
        extensions.push(match[1]);
      }
    }

    // Default extensions if none extracted from patterns
    if (extensions.length === 0) {
      if (sourceExt === '.tsx') {
        extensions.push('.test.tsx', '.spec.tsx', '.test.ts', '.spec.ts');
      } else if (sourceExt === '.ts') {
        extensions.push('.test.ts', '.spec.ts');
      } else if (sourceExt === '.jsx') {
        extensions.push('.test.jsx', '.spec.jsx', '.test.js', '.spec.js');
      } else {
        extensions.push('.test.js', '.spec.js');
      }
    }

    return extensions;
  }

  protected getFixHint(constraint: Constraint, _actual?: string): string {
    const patterns = this.normalizeToArray(constraint.value);
    const patternStr = patterns.join(' or ');
    return `Create a companion test file matching pattern: ${patternStr}`;
  }
}
