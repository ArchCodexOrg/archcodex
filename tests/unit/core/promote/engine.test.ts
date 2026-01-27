/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { PromoteEngine } from '../../../../src/core/promote/engine.js';

describe('PromoteEngine', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promote-test-'));

    // Create minimal .arch structure
    const registryDir = path.join(tmpDir, '.arch', 'registry');
    await fs.mkdir(registryDir, { recursive: true });

    // Config file
    await fs.writeFile(
      path.join(tmpDir, '.arch', 'config.yaml'),
      `version: "1.0"\nvalidation:\n  strict: false\noverrides:\n  required_fields: [reason]\n  warn_no_expiry: false\n  max_expiry_days: 180\n`
    );

    // Base registry
    await fs.writeFile(
      path.join(registryDir, 'base.yaml'),
      `base:\n  description: Base\n  constraints:\n    - rule: forbid_pattern\n      value: "console\\\\.log"\n      severity: warning\n      why: Use logger\n`
    );

    // Intents file
    await fs.writeFile(
      path.join(registryDir, '_intents.yaml'),
      `intents:\n  stateless:\n    description: "No state"\n    category: lifecycle\n`
    );

    // Source file with override
    const srcDir = path.join(tmpDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(
      path.join(srcDir, 'example.ts'),
      `/**\n * @arch base\n * @override forbid_pattern:console\\.log\n * @reason Need console for CLI\n * @expires 2027-01-01\n */\nconsole.log('hello');\n`
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should find matching overrides in dry-run mode', async () => {
    const engine = new PromoteEngine(tmpDir);
    const result = await engine.promote({
      rule: 'forbid_pattern',
      value: 'console',
      intentName: 'cli-output',
      description: 'CLI output allowed',
      apply: false,
    });

    expect(result.applied).toBe(false);
    expect(result.fileChanges).toHaveLength(1);
    expect(result.fileChanges[0].filePath).toContain('example.ts');
    expect(result.fileChanges[0].overrideRule).toBe('forbid_pattern');
    expect(result.fileChanges[0].intentAlreadyPresent).toBe(false);
  });

  it('should detect new intent needs creation', async () => {
    const engine = new PromoteEngine(tmpDir);
    const result = await engine.promote({
      rule: 'forbid_pattern',
      value: 'console',
      intentName: 'cli-output',
      description: 'CLI output',
      apply: false,
    });

    expect(result.intentChange.isNew).toBe(true);
    expect(result.intentChange.name).toBe('cli-output');
  });

  it('should detect existing intent', async () => {
    const engine = new PromoteEngine(tmpDir);
    const result = await engine.promote({
      rule: 'forbid_pattern',
      value: 'console',
      intentName: 'stateless', // already defined
      description: 'Stateless',
      apply: false,
    });

    expect(result.intentChange.isNew).toBe(false);
  });

  it('should error when new intent has no description', async () => {
    const engine = new PromoteEngine(tmpDir);
    const result = await engine.promote({
      rule: 'forbid_pattern',
      value: 'console',
      intentName: 'cli-output',
      // No description
      apply: false,
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('requires --description');
  });

  it('should find constraint definitions in registry', async () => {
    const engine = new PromoteEngine(tmpDir);
    const result = await engine.promote({
      rule: 'forbid_pattern',
      value: 'console',
      intentName: 'cli-output',
      description: 'CLI output',
      apply: false,
    });

    expect(result.registryChanges).toHaveLength(1);
    expect(result.registryChanges[0].constraintRule).toBe('forbid_pattern');
    expect(result.registryChanges[0].intentAlreadyInUnless).toBe(false);
  });

  it('should warn when no overrides match', async () => {
    const engine = new PromoteEngine(tmpDir);
    const result = await engine.promote({
      rule: 'forbid_import',
      value: 'nonexistent',
      intentName: 'test',
      description: 'Test',
      apply: false,
    });

    expect(result.fileChanges).toHaveLength(0);
    expect(result.warnings.some(w => w.includes('No overrides matching'))).toBe(true);
  });

  it('should apply changes when --apply is set', async () => {
    const engine = new PromoteEngine(tmpDir);
    const result = await engine.promote({
      rule: 'forbid_pattern',
      value: 'console',
      intentName: 'cli-output',
      description: 'CLI output allowed',
      category: 'cli',
      apply: true,
    });

    expect(result.applied).toBe(true);

    // Verify intent was added to _intents.yaml
    const intentsContent = await fs.readFile(
      path.join(tmpDir, '.arch', 'registry', '_intents.yaml'),
      'utf-8'
    );
    expect(intentsContent).toContain('cli-output:');
    expect(intentsContent).toContain('CLI output allowed');

    // Verify source file was updated
    const srcContent = await fs.readFile(
      path.join(tmpDir, 'src', 'example.ts'),
      'utf-8'
    );
    expect(srcContent).not.toContain('@override');
    expect(srcContent).not.toContain('@reason');
    expect(srcContent).not.toContain('@expires');
    expect(srcContent).toContain('@intent:cli-output');
  });

  it('should not apply changes when errors exist', async () => {
    const engine = new PromoteEngine(tmpDir);
    const result = await engine.promote({
      rule: 'forbid_pattern',
      value: 'console',
      intentName: 'cli-output',
      // No description = error for new intent
      apply: true,
    });

    expect(result.applied).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
