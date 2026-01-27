/**
 * @arch archcodex.core.domain.constraint
 *
 * Template generation for companion file auto-fix suggestions.
 * Extracted from RequireCompanionFileValidator to keep main validator focused.
 */
import path from 'path';
import type { Suggestion } from './types.js';

/**
 * File info used for template variable substitution.
 */
export interface CompanionFileInfo {
  name: string;
  nameKebab: string;
  ext: string;
  dir: string;
}

/**
 * Generate auto-fix suggestion content for missing companion files.
 * Returns appropriate templates for barrel files, tests, stories, etc.
 */
export function generateCompanionTemplate(
  fileInfo: CompanionFileInfo,
  companionPath: string
): Suggestion {
  const companionName = path.basename(companionPath);

  if (isBarrelFile(companionName)) {
    return generateBarrelTemplate(fileInfo, companionPath);
  }

  if (isTestFile(companionName)) {
    return generateTestTemplate(fileInfo, companionPath);
  }

  if (isStoryFile(companionName)) {
    return generateStoryTemplate(fileInfo, companionPath);
  }

  return generateGenericTemplate(fileInfo, companionPath);
}

function isBarrelFile(name: string): boolean {
  return name === 'index.ts' || name === 'index.tsx' || name === 'index.js';
}

function isTestFile(name: string): boolean {
  return name.includes('.test.') || name.includes('.spec.');
}

function isStoryFile(name: string): boolean {
  return name.includes('.stories.');
}

function generateBarrelTemplate(fileInfo: CompanionFileInfo, companionPath: string): Suggestion {
  return {
    action: 'add',
    target: companionPath,
    replacement: `/**
 * @arch archcodex.barrel
 *
 * Barrel export for ${fileInfo.dir} module.
 */
export * from './${fileInfo.name}.js';
`,
    insertAt: 'start',
  };
}

function generateTestTemplate(fileInfo: CompanionFileInfo, companionPath: string): Suggestion {
  return {
    action: 'add',
    target: companionPath,
    replacement: `import { describe, it, expect } from 'vitest';
import { ${fileInfo.name} } from './${fileInfo.name}.js';

describe('${fileInfo.name}', () => {
  it('should exist', () => {
    expect(${fileInfo.name}).toBeDefined();
  });
});
`,
    insertAt: 'start',
  };
}

function generateStoryTemplate(fileInfo: CompanionFileInfo, companionPath: string): Suggestion {
  return {
    action: 'add',
    target: companionPath,
    replacement: `import type { Meta, StoryObj } from '@storybook/react';
import { ${fileInfo.name} } from './${fileInfo.name}.js';

const meta: Meta<typeof ${fileInfo.name}> = {
  title: 'Components/${fileInfo.name}',
  component: ${fileInfo.name},
};

export default meta;
type Story = StoryObj<typeof ${fileInfo.name}>;

export const Default: Story = {};
`,
    insertAt: 'start',
  };
}

function generateGenericTemplate(fileInfo: CompanionFileInfo, companionPath: string): Suggestion {
  return {
    action: 'add',
    target: companionPath,
    replacement: `// Companion file for ${fileInfo.name}`,
    insertAt: 'start',
  };
}
