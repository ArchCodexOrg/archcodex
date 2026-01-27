/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { generateCompanionTemplate, type CompanionFileInfo } from '../../../../src/core/constraints/companion-file-templates.js';

describe('generateCompanionTemplate', () => {
  const fileInfo: CompanionFileInfo = {
    name: 'MyComponent',
    nameKebab: 'my-component',
    ext: 'tsx',
    dir: 'components',
  };

  it('generates barrel file template', () => {
    const result = generateCompanionTemplate(fileInfo, '/path/to/index.ts');
    expect(result.action).toBe('add');
    expect(result.replacement).toContain('@arch archcodex.barrel');
    expect(result.replacement).toContain("export * from './MyComponent.js'");
  });

  it('generates test file template', () => {
    const result = generateCompanionTemplate(fileInfo, '/path/to/MyComponent.test.tsx');
    expect(result.action).toBe('add');
    expect(result.replacement).toContain("import { describe, it, expect } from 'vitest'");
    expect(result.replacement).toContain("describe('MyComponent'");
  });

  it('generates story file template', () => {
    const result = generateCompanionTemplate(fileInfo, '/path/to/MyComponent.stories.tsx');
    expect(result.action).toBe('add');
    expect(result.replacement).toContain("import type { Meta, StoryObj }");
    expect(result.replacement).toContain("title: 'Components/MyComponent'");
  });

  it('generates generic template for unknown companion type', () => {
    const result = generateCompanionTemplate(fileInfo, '/path/to/MyComponent.styles.css');
    expect(result.action).toBe('add');
    expect(result.replacement).toContain('Companion file for MyComponent');
  });
});
