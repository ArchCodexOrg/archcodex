/**
 * @arch archcodex.test.integration
 *
 * Health command tests for Python and Go language support.
 * Tests that the health analyzer correctly includes Python and Go files
 * in coverage metrics, architecture usage, and other health reports.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { HealthAnalyzer } from '../../src/core/health/index.js';
import { getDefaultConfig } from '../../src/core/config/loader.js';
import type { Config } from '../../src/core/config/schema.js';

describe('Health Command - Multi-language Support', () => {
  let tempDir: string;
  let testConfig: Config;

  const createTestRegistry = async (tempDir: string): Promise<void> => {
    const archDir = path.join(tempDir, '.arch');
    await fs.mkdir(archDir, { recursive: true });

    const registryContent = `
base:
  description: "Base architecture"
  rationale: "Root node for all architectures"
  hints: []

test.arch:
  inherits: base
  description: "Test architecture"
  rationale: "For testing purposes"
  hints: []

test.python:
  inherits: base
  description: "Python architecture"
  rationale: "For Python files"
  hints: []

test.go:
  inherits: base
  description: "Go architecture"
  rationale: "For Go files"
  hints: []
`;
    await fs.writeFile(path.join(archDir, 'registry.yaml'), registryContent);

    const configContent = `
files:
  scan:
    include:
      - "src/**/*.ts"
      - "src/**/*.py"
      - "src/**/*.go"
    exclude:
      - "**/node_modules/**"
      - "**/*.test.ts"
`;
    await fs.writeFile(path.join(archDir, 'config.yaml'), configContent);
  };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'archcodex-health-'));
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await createTestRegistry(tempDir);
    testConfig = getDefaultConfig();
    // Override the scan patterns for testing
    testConfig.files.scan.include = ['src/**/*.ts', 'src/**/*.py', 'src/**/*.go'];
    testConfig.files.scan.exclude = ['**/node_modules/**'];
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Coverage metrics', () => {
    it('should include Python files in total file count', async () => {
      const pyContent = `# @arch test.arch
def hello():
    pass
`;
      await fs.writeFile(path.join(tempDir, 'src', 'module.py'), pyContent);

      const analyzer = new HealthAnalyzer(tempDir, testConfig);
      const report = await analyzer.analyze({
        include: ['src/**/*.py'],
        exclude: [],
      });

      expect(report.coverage.totalFiles).toBe(1);
      expect(report.coverage.taggedFiles).toBe(1);
    });

    it('should include Go files in total file count', async () => {
      const goContent = `// @arch test.arch
package main

func Hello() {}
`;
      await fs.writeFile(path.join(tempDir, 'src', 'module.go'), goContent);

      const analyzer = new HealthAnalyzer(tempDir, testConfig);
      const report = await analyzer.analyze({
        include: ['src/**/*.go'],
        exclude: [],
      });

      expect(report.coverage.totalFiles).toBe(1);
      expect(report.coverage.taggedFiles).toBe(1);
    });

    it('should correctly calculate coverage across multiple languages', async () => {
      const tsContent = `/**
 * @arch test.arch
 */
export function hello() {}
`;
      const pyContent = `# @arch test.python
def hello():
    pass
`;
      const goContent = `// @arch test.go
package main

func Hello() {}
`;

      await fs.writeFile(path.join(tempDir, 'src', 'module.ts'), tsContent);
      await fs.writeFile(path.join(tempDir, 'src', 'module.py'), pyContent);
      await fs.writeFile(path.join(tempDir, 'src', 'module.go'), goContent);

      const analyzer = new HealthAnalyzer(tempDir, testConfig);
      const report = await analyzer.analyze({
        include: ['src/**/*.ts', 'src/**/*.py', 'src/**/*.go'],
        exclude: [],
      });

      expect(report.coverage.totalFiles).toBe(3);
      expect(report.coverage.taggedFiles).toBe(3);
      expect(report.coverage.coveragePercent).toBe(100);
    });

    it('should identify untagged Python files', async () => {
      const taggedContent = `# @arch test.arch
def tagged():
    pass
`;
      const untaggedContent = `# No arch tag here
def untagged():
    pass
`;

      await fs.writeFile(path.join(tempDir, 'src', 'tagged.py'), taggedContent);
      await fs.writeFile(path.join(tempDir, 'src', 'untagged.py'), untaggedContent);

      const analyzer = new HealthAnalyzer(tempDir, testConfig);
      const report = await analyzer.analyze({
        include: ['src/**/*.py'],
        exclude: [],
        untaggedSampleSize: 10,
      });

      expect(report.coverage.totalFiles).toBe(2);
      expect(report.coverage.taggedFiles).toBe(1);
      expect(report.coverage.untaggedFiles).toBe(1);
      expect(report.coverage.untaggedSample).toContain('src/untagged.py');
    });

    it('should identify untagged Go files', async () => {
      const taggedContent = `// @arch test.arch
package main

func Tagged() {}
`;
      const untaggedContent = `// No arch tag
package main

func Untagged() {}
`;

      await fs.writeFile(path.join(tempDir, 'src', 'tagged.go'), taggedContent);
      await fs.writeFile(path.join(tempDir, 'src', 'untagged.go'), untaggedContent);

      const analyzer = new HealthAnalyzer(tempDir, testConfig);
      const report = await analyzer.analyze({
        include: ['src/**/*.go'],
        exclude: [],
        untaggedSampleSize: 10,
      });

      expect(report.coverage.totalFiles).toBe(2);
      expect(report.coverage.taggedFiles).toBe(1);
      expect(report.coverage.untaggedFiles).toBe(1);
      expect(report.coverage.untaggedSample).toContain('src/untagged.go');
    });
  });

  describe('Architecture usage', () => {
    it('should track Python file architecture usage', async () => {
      const py1 = `# @arch test.python
def func1(): pass
`;
      const py2 = `# @arch test.python
def func2(): pass
`;
      const py3 = `# @arch test.arch
def func3(): pass
`;

      await fs.writeFile(path.join(tempDir, 'src', 'file1.py'), py1);
      await fs.writeFile(path.join(tempDir, 'src', 'file2.py'), py2);
      await fs.writeFile(path.join(tempDir, 'src', 'file3.py'), py3);

      const analyzer = new HealthAnalyzer(tempDir, testConfig);
      const report = await analyzer.analyze({
        include: ['src/**/*.py'],
        exclude: [],
        includeArchUsage: true,
      });

      expect(report.coverage.archUsage).toBeDefined();

      const pythonArch = report.coverage.archUsage?.find(a => a.archId === 'test.python');
      expect(pythonArch?.fileCount).toBe(2);

      const testArch = report.coverage.archUsage?.find(a => a.archId === 'test.arch');
      expect(testArch?.fileCount).toBe(1);
    });

    it('should track Go file architecture usage', async () => {
      const go1 = `// @arch test.go
package main
func Func1() {}
`;
      const go2 = `// @arch test.go
package utils
func Func2() {}
`;

      await fs.writeFile(path.join(tempDir, 'src', 'file1.go'), go1);
      await fs.writeFile(path.join(tempDir, 'src', 'file2.go'), go2);

      const analyzer = new HealthAnalyzer(tempDir, testConfig);
      const report = await analyzer.analyze({
        include: ['src/**/*.go'],
        exclude: [],
        includeArchUsage: true,
      });

      expect(report.coverage.archUsage).toBeDefined();

      const goArch = report.coverage.archUsage?.find(a => a.archId === 'test.go');
      expect(goArch?.fileCount).toBe(2);
    });

    it('should track mixed language architecture usage', async () => {
      const tsContent = `/**
 * @arch test.arch
 */
export function ts() {}
`;
      const pyContent = `# @arch test.arch
def py(): pass
`;
      const goContent = `// @arch test.arch
package main
func Go() {}
`;

      await fs.writeFile(path.join(tempDir, 'src', 'module.ts'), tsContent);
      await fs.writeFile(path.join(tempDir, 'src', 'module.py'), pyContent);
      await fs.writeFile(path.join(tempDir, 'src', 'module.go'), goContent);

      const analyzer = new HealthAnalyzer(tempDir, testConfig);
      const report = await analyzer.analyze({
        include: ['src/**/*.ts', 'src/**/*.py', 'src/**/*.go'],
        exclude: [],
        includeArchUsage: true,
      });

      const testArch = report.coverage.archUsage?.find(a => a.archId === 'test.arch');
      expect(testArch?.fileCount).toBe(3);
    });
  });

  describe('Registry health', () => {
    it('should identify architectures used only by Python files', async () => {
      const pyContent = `# @arch test.python
def func(): pass
`;
      await fs.writeFile(path.join(tempDir, 'src', 'module.py'), pyContent);

      const analyzer = new HealthAnalyzer(tempDir, testConfig);
      const report = await analyzer.analyze({
        include: ['src/**/*.py'],
        exclude: [],
      });

      // test.python should be used
      expect(report.coverage.usedArchIds).toContain('test.python');
    });

    it('should identify architectures used only by Go files', async () => {
      const goContent = `// @arch test.go
package main
func Func() {}
`;
      await fs.writeFile(path.join(tempDir, 'src', 'module.go'), goContent);

      const analyzer = new HealthAnalyzer(tempDir, testConfig);
      const report = await analyzer.analyze({
        include: ['src/**/*.go'],
        exclude: [],
      });

      expect(report.coverage.usedArchIds).toContain('test.go');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty Python files', async () => {
      await fs.writeFile(path.join(tempDir, 'src', 'empty.py'), '');

      const analyzer = new HealthAnalyzer(tempDir, testConfig);
      const report = await analyzer.analyze({
        include: ['src/**/*.py'],
        exclude: [],
      });

      expect(report.coverage.totalFiles).toBe(1);
      expect(report.coverage.untaggedFiles).toBe(1);
    });

    it('should handle empty Go files', async () => {
      await fs.writeFile(path.join(tempDir, 'src', 'empty.go'), '');

      const analyzer = new HealthAnalyzer(tempDir, testConfig);
      const report = await analyzer.analyze({
        include: ['src/**/*.go'],
        exclude: [],
      });

      expect(report.coverage.totalFiles).toBe(1);
      expect(report.coverage.untaggedFiles).toBe(1);
    });

    it('should handle Python files with syntax errors', async () => {
      const content = `# @arch test.arch
def broken(
    # Missing closing paren
`;
      await fs.writeFile(path.join(tempDir, 'src', 'broken.py'), content);

      const analyzer = new HealthAnalyzer(tempDir, testConfig);

      // Should not throw
      const report = await analyzer.analyze({
        include: ['src/**/*.py'],
        exclude: [],
      });

      expect(report).toBeDefined();
      // File should still be counted and @arch tag extracted
      expect(report.coverage.totalFiles).toBe(1);
    });

    it('should handle Go files with syntax errors', async () => {
      const content = `// @arch test.arch
package main

func broken( {
	// Missing closing paren
}
`;
      await fs.writeFile(path.join(tempDir, 'src', 'broken.go'), content);

      const analyzer = new HealthAnalyzer(tempDir, testConfig);

      // Should not throw
      const report = await analyzer.analyze({
        include: ['src/**/*.go'],
        exclude: [],
      });

      expect(report).toBeDefined();
      expect(report.coverage.totalFiles).toBe(1);
    });

    it('should handle large number of mixed-language files', async () => {
      // Create many files
      for (let i = 0; i < 10; i++) {
        await fs.writeFile(
          path.join(tempDir, 'src', `file${i}.py`),
          `# @arch test.python\ndef func${i}(): pass\n`
        );
        await fs.writeFile(
          path.join(tempDir, 'src', `file${i}.go`),
          `// @arch test.go\npackage main\nfunc Func${i}() {}\n`
        );
      }

      const analyzer = new HealthAnalyzer(tempDir, testConfig);
      const report = await analyzer.analyze({
        include: ['src/**/*.py', 'src/**/*.go'],
        exclude: [],
      });

      expect(report.coverage.totalFiles).toBe(20);
      expect(report.coverage.taggedFiles).toBe(20);
      expect(report.coverage.coveragePercent).toBe(100);
    });

    it('should handle files with unicode content', async () => {
      const pyContent = `# @arch test.arch
# 日本語コメント
def greet():
    return "こんにちは"
`;
      const goContent = `// @arch test.arch
// 日本語コメント
package main

func Greet() string {
	return "こんにちは"
}
`;

      await fs.writeFile(path.join(tempDir, 'src', 'unicode.py'), pyContent);
      await fs.writeFile(path.join(tempDir, 'src', 'unicode.go'), goContent);

      const analyzer = new HealthAnalyzer(tempDir, testConfig);
      const report = await analyzer.analyze({
        include: ['src/**/*.py', 'src/**/*.go'],
        exclude: [],
      });

      expect(report.coverage.totalFiles).toBe(2);
      expect(report.coverage.taggedFiles).toBe(2);
    });
  });

  describe('Recommendations', () => {
    it('should recommend tagging untagged Python files', async () => {
      // Create mostly untagged files
      await fs.writeFile(path.join(tempDir, 'src', 'tagged.py'), '# @arch test.arch\ndef f(): pass\n');
      await fs.writeFile(path.join(tempDir, 'src', 'untagged1.py'), 'def f1(): pass\n');
      await fs.writeFile(path.join(tempDir, 'src', 'untagged2.py'), 'def f2(): pass\n');
      await fs.writeFile(path.join(tempDir, 'src', 'untagged3.py'), 'def f3(): pass\n');
      await fs.writeFile(path.join(tempDir, 'src', 'untagged4.py'), 'def f4(): pass\n');

      const analyzer = new HealthAnalyzer(tempDir, testConfig);
      const report = await analyzer.analyze({
        include: ['src/**/*.py'],
        exclude: [],
      });

      // Coverage should be low
      expect(report.coverage.coveragePercent).toBeLessThan(50);

      // Should have a recommendation about coverage
      const coverageRec = report.recommendations.find(
        r => r.title.toLowerCase().includes('coverage') || r.message.toLowerCase().includes('untagged')
      );
      expect(coverageRec).toBeDefined();
    });
  });
});
