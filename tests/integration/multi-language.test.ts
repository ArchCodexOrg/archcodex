/**
 * @arch archcodex.test.integration
 *
 * Integration tests for multi-language support (Python, Go).
 * Tests actual file operations with scaffold, tag, and bootstrap commands.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ScaffoldEngine } from '../../src/core/scaffold/engine.js';
import { insertArchTag, replaceArchTag, detectLanguageFromExtension, hasArchTag, extractArchId } from '../../src/utils/arch-tag.js';
import { inferArchitecture, DEFAULT_RULES, buildRulesFromSettings } from '../../src/core/infer/rules.js';

describe('Multi-language Integration Tests', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'archcodex-test-'));
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.mkdir(path.join(tempDir, '.arch'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Scaffold Engine - Multi-language', () => {
    it('should scaffold TypeScript file with correct structure', async () => {
      const engine = new ScaffoldEngine(tempDir);
      const result = await engine.scaffold({
        archId: 'test.service',
        name: 'UserService',
        outputPath: 'src',
        language: 'typescript',
      });

      expect(result.success).toBe(true);
      expect(result.filePath).toContain('.ts');

      const content = await fs.readFile(result.filePath!, 'utf-8');
      expect(content).toContain('/**');
      expect(content).toContain('@arch test.service');
      expect(content).toContain('export class UserService');
      expect(content).toContain('constructor()');
    });

    it('should scaffold Python file with correct structure', async () => {
      const engine = new ScaffoldEngine(tempDir);
      const result = await engine.scaffold({
        archId: 'test.service',
        name: 'UserService',
        outputPath: 'src',
        language: 'python',
      });

      expect(result.success).toBe(true);
      expect(result.filePath).toContain('.py');

      const content = await fs.readFile(result.filePath!, 'utf-8');
      expect(content).toContain('# @arch test.service');
      expect(content).toContain('class UserService:');
      expect(content).toContain('def __init__(self)');
      expect(content).toContain('"""UserService implementation."""');
    });

    it('should scaffold Go file with correct structure', async () => {
      const engine = new ScaffoldEngine(tempDir);
      const result = await engine.scaffold({
        archId: 'test.service',
        name: 'UserService',
        outputPath: 'src',
        language: 'go',
      });

      expect(result.success).toBe(true);
      expect(result.filePath).toContain('.go');

      const content = await fs.readFile(result.filePath!, 'utf-8');
      expect(content).toContain('// @arch test.service');
      expect(content).toContain('package src');
      expect(content).toContain('type UserService struct');
      expect(content).toContain('func NewUserService()');
    });

    it('should infer language from output path extension', async () => {
      const engine = new ScaffoldEngine(tempDir);

      // Python inferred from .py
      const pyResult = await engine.scaffold({
        archId: 'test.module',
        name: 'Handler',
        outputPath: 'src/handler.py',
      });
      expect(pyResult.success).toBe(true);
      const pyContent = await fs.readFile(pyResult.filePath!, 'utf-8');
      expect(pyContent).toContain('# @arch');

      // Go inferred from .go
      const goResult = await engine.scaffold({
        archId: 'test.module',
        name: 'Handler',
        outputPath: 'src/handler.go',
      });
      expect(goResult.success).toBe(true);
      const goContent = await fs.readFile(goResult.filePath!, 'utf-8');
      expect(goContent).toContain('// @arch');
    });
  });

  describe('Tag Insertion - Multi-language', () => {
    it('should insert Python @arch tag preserving shebang and encoding', async () => {
      const originalContent = `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Module docstring."""

def main():
    pass
`;
      const filePath = path.join(tempDir, 'src', 'script.py');
      await fs.writeFile(filePath, originalContent);

      const newContent = insertArchTag(originalContent, 'cli.script', 'script.py');
      await fs.writeFile(filePath, newContent);

      const result = await fs.readFile(filePath, 'utf-8');

      // Verify order: shebang, encoding, @arch, rest
      const lines = result.split('\n');
      expect(lines[0]).toBe('#!/usr/bin/env python3');
      expect(lines[1]).toContain('coding:');
      expect(lines[2]).toBe('# @arch cli.script');
      expect(hasArchTag(result)).toBe(true);
      expect(extractArchId(result)).toBe('cli.script');
    });

    it('should insert Go @arch tag preserving build tags', async () => {
      const originalContent = `//go:build linux
// +build linux

package main

func main() {}
`;
      const filePath = path.join(tempDir, 'src', 'linux.go');
      await fs.writeFile(filePath, originalContent);

      const newContent = insertArchTag(originalContent, 'platform.linux', 'linux.go');
      await fs.writeFile(filePath, newContent);

      const result = await fs.readFile(filePath, 'utf-8');

      // Verify build tags are preserved and @arch comes after
      expect(result).toContain('//go:build linux');
      expect(result).toContain('// +build linux');
      expect(result).toContain('// @arch platform.linux');
      const buildIdx = result.indexOf('//go:build');
      const archIdx = result.indexOf('@arch');
      expect(buildIdx).toBeLessThan(archIdx);
    });

    it('should replace existing @arch tag using replaceArchTag', async () => {
      // TypeScript - use replaceArchTag for replacement
      const tsContent = insertArchTag('', 'old.arch', 'file.ts');
      const tsUpdated = replaceArchTag(tsContent, 'new.arch');
      expect(extractArchId(tsUpdated)).toBe('new.arch');
      expect(tsUpdated.match(/@arch/g)?.length).toBe(1);

      // Python - insertArchTag handles replacement
      const pyContent = insertArchTag('', 'old.arch', 'file.py');
      const pyUpdated = insertArchTag(pyContent, 'new.arch', 'file.py');
      expect(extractArchId(pyUpdated)).toBe('new.arch');

      // Go - insertArchTag handles replacement
      const goContent = insertArchTag('', 'old.arch', 'file.go');
      const goUpdated = insertArchTag(goContent, 'new.arch', 'file.go');
      expect(extractArchId(goUpdated)).toBe('new.arch');
    });
  });

  describe('Inference - Multi-language', () => {
    it('should infer Python test files correctly', () => {
      expect(inferArchitecture('test_user.py', '', DEFAULT_RULES)?.archId).toBe('base.test');
      expect(inferArchitecture('user_test.py', '', DEFAULT_RULES)?.archId).toBe('base.test');
      expect(inferArchitecture('tests/test_auth.py', '', DEFAULT_RULES)?.archId).toBe('base.test');
    });

    it('should infer Go test files correctly', () => {
      expect(inferArchitecture('user_test.go', '', DEFAULT_RULES)?.archId).toBe('base.test');
      expect(inferArchitecture('pkg/auth/auth_test.go', '', DEFAULT_RULES)?.archId).toBe('base.test');
    });

    it('should infer Go main package correctly', () => {
      const mainContent = `package main

func main() {
    fmt.Println("Hello")
}`;
      const result = inferArchitecture('main.go', mainContent, DEFAULT_RULES);
      expect(result?.archId).toBe('bin.main');
      expect(result?.confidence).toBe('high');
    });

    it('should infer Python __init__.py as barrel', () => {
      expect(inferArchitecture('__init__.py', '', DEFAULT_RULES)?.archId).toBe('base.barrel');
      expect(inferArchitecture('src/pkg/__init__.py', '', DEFAULT_RULES)?.archId).toBe('base.barrel');
    });

    it('should use custom rules when configured', () => {
      const settings = {
        use_builtin_rules: false,
        prepend_custom: true,
        validate_arch_ids: true,
        custom_rules: [{
          name: 'my-python-service',
          archId: 'myapp.service',
          confidence: 'high' as const,
          filePattern: 'services/.*\\.py$',
          description: 'Python service files',
        }],
      };

      const rules = buildRulesFromSettings(settings);
      const result = inferArchitecture('services/user_service.py', '', rules);
      expect(result?.archId).toBe('myapp.service');
    });
  });

  describe('Language Detection', () => {
    it('should detect all supported languages', () => {
      // TypeScript
      expect(detectLanguageFromExtension('file.ts')).toBe('typescript');
      expect(detectLanguageFromExtension('file.tsx')).toBe('typescript');
      expect(detectLanguageFromExtension('file.mts')).toBe('typescript');

      // JavaScript
      expect(detectLanguageFromExtension('file.js')).toBe('javascript');
      expect(detectLanguageFromExtension('file.jsx')).toBe('javascript');
      expect(detectLanguageFromExtension('file.mjs')).toBe('javascript');

      // Python
      expect(detectLanguageFromExtension('file.py')).toBe('python');

      // Go
      expect(detectLanguageFromExtension('file.go')).toBe('go');
    });

    it('should handle full paths correctly', () => {
      expect(detectLanguageFromExtension('/path/to/file.py')).toBe('python');
      expect(detectLanguageFromExtension('src/handlers/api.go')).toBe('go');
      expect(detectLanguageFromExtension('C:\\Users\\code\\main.ts')).toBe('typescript');
    });
  });

  describe('End-to-End Workflow', () => {
    it('should scaffold, read, and validate Python file', async () => {
      // 1. Scaffold a Python file
      const engine = new ScaffoldEngine(tempDir);
      const scaffoldResult = await engine.scaffold({
        archId: 'api.handler',
        name: 'RequestHandler',
        outputPath: 'src',
        language: 'python',
      });
      expect(scaffoldResult.success).toBe(true);

      // 2. Read and verify content
      const content = await fs.readFile(scaffoldResult.filePath!, 'utf-8');
      expect(hasArchTag(content)).toBe(true);
      expect(extractArchId(content)).toBe('api.handler');

      // 3. Verify language detection
      expect(detectLanguageFromExtension(scaffoldResult.filePath!)).toBe('python');
    });

    it('should scaffold, read, and validate Go file', async () => {
      // 1. Scaffold a Go file
      const engine = new ScaffoldEngine(tempDir);
      const scaffoldResult = await engine.scaffold({
        archId: 'api.handler',
        name: 'RequestHandler',
        outputPath: 'src/handlers',
        language: 'go',
      });
      expect(scaffoldResult.success).toBe(true);

      // 2. Read and verify content
      const content = await fs.readFile(scaffoldResult.filePath!, 'utf-8');
      expect(hasArchTag(content)).toBe(true);
      expect(extractArchId(content)).toBe('api.handler');
      expect(content).toContain('package handlers'); // Package derived from path

      // 3. Verify language detection
      expect(detectLanguageFromExtension(scaffoldResult.filePath!)).toBe('go');
    });
  });
});
