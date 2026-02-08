/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for MCP intents handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleIntents } from '../../../../src/mcp/handlers/intents.js';

// Mock dependencies
vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadIntentRegistry: vi.fn(),
  getIntentsByCategory: vi.fn(),
  listIntentNames: vi.fn(),
  suggestIntents: vi.fn(),
  loadActionRegistry: vi.fn(),
  loadFeatureRegistry: vi.fn(),
  matchAction: vi.fn(),
  getAction: vi.fn(),
  listActionNames: vi.fn(),
  findFeatureByAction: vi.fn(),
  listFeatureNames: vi.fn(),
  getFeature: vi.fn(),
}));

vi.mock('../../../../src/core/arch-tag/parser.js', () => ({
  extractIntents: vi.fn(),
  parseArchTags: vi.fn(),
}));

vi.mock('../../../../src/core/infer/index.js', () => ({
  inferArchitecture: vi.fn(),
  buildRulesFromSettings: vi.fn(),
}));

vi.mock('../../../../src/utils/pattern-matcher.js', () => ({
  patternMatches: vi.fn(),
}));

vi.mock('../../../../src/utils/file-system.js', () => ({
  readFile: vi.fn(),
  globFiles: vi.fn(),
}));

vi.mock('../../../../src/utils/archignore.js', () => ({
  loadArchIgnore: vi.fn(),
}));

vi.mock('../../../../src/core/registry/component-groups.js', () => ({
  loadComponentGroupsRegistry: vi.fn(),
  expandChecklist: vi.fn(),
}));

import {
  loadIntentRegistry,
  getIntentsByCategory,
  listIntentNames,
  suggestIntents,
  loadActionRegistry,
  loadFeatureRegistry,
  matchAction,
  getAction,
  listActionNames,
  findFeatureByAction,
  listFeatureNames,
  getFeature,
} from '../../../../src/core/registry/loader.js';
import { loadConfig } from '../../../../src/core/config/loader.js';
import { extractIntents, parseArchTags } from '../../../../src/core/arch-tag/parser.js';
import { inferArchitecture, buildRulesFromSettings } from '../../../../src/core/infer/index.js';
import { patternMatches } from '../../../../src/utils/pattern-matcher.js';
import { readFile, globFiles } from '../../../../src/utils/file-system.js';
import { loadArchIgnore } from '../../../../src/utils/archignore.js';
import { loadComponentGroupsRegistry, expandChecklist } from '../../../../src/core/registry/component-groups.js';
import { handleAction, handleFeature, handleInfer } from '../../../../src/mcp/handlers/intents.js';

describe('MCP Intents Handler', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(loadIntentRegistry).mockResolvedValue({
      intents: {
        'cli-output': {
          description: 'Allows console output',
          category: 'io',
          requires: [],
          forbids: [],
          conflicts_with: [],
        },
        'admin-only': {
          description: 'Admin access required',
          category: 'security',
          requires: ['auth-check'],
          forbids: ['public-access'],
          conflicts_with: [],
        },
      },
    });
    vi.mocked(listIntentNames).mockReturnValue(['cli-output', 'admin-only']);
    vi.mocked(getIntentsByCategory).mockReturnValue(
      new Map([
        ['io', ['cli-output']],
        ['security', ['admin-only']],
      ])
    );
  });

  describe('handleIntents', () => {
    it('should list all intents by default', async () => {
      const result = await handleIntents(projectRoot);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.total).toBe(2);
      expect(parsed.byCategory).toBeDefined();
      expect(parsed.intents['cli-output']).toBeDefined();
      expect(parsed.intents['admin-only']).toBeDefined();
    });

    it('should list intents with action=list', async () => {
      const result = await handleIntents(projectRoot, { action: 'list' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.total).toBe(2);
      expect(parsed.intents['cli-output'].description).toBe('Allows console output');
      expect(parsed.intents['cli-output'].category).toBe('io');
    });

    it('should show intent details', async () => {
      const result = await handleIntents(projectRoot, { action: 'show', name: 'cli-output' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.name).toBe('cli-output');
      expect(parsed.description).toBe('Allows console output');
    });

    it('should return error when showing non-existent intent', async () => {
      const result = await handleIntents(projectRoot, { action: 'show', name: 'nonexistent' });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('Intent not found');
    });

    it('should return error when name is missing for show action', async () => {
      const result = await handleIntents(projectRoot, { action: 'show' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('name is required');
    });

    it('should include similar intents when not found', async () => {
      const result = await handleIntents(projectRoot, { action: 'show', name: 'cli' });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.similar).toContain('cli-output');
    });

    it('should show intent metadata flags', async () => {
      const result = await handleIntents(projectRoot, { action: 'list' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.intents['admin-only'].hasRequires).toBe(true);
      expect(parsed.intents['admin-only'].hasForbids).toBe(true);
      expect(parsed.intents['cli-output'].hasRequires).toBe(false);
    });

    it('should return error for unknown action', async () => {
      const result = await handleIntents(projectRoot, { action: 'invalid' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown action');
    });

    it('should handle suggest action', async () => {
      vi.mocked(suggestIntents).mockReturnValue([
        { name: 'cli-output', reason: 'CLI file', description: 'test', category: 'io' },
      ]);

      const result = await handleIntents(projectRoot, { action: 'suggest', file: 'src/cli.ts' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.suggestions).toBeDefined();
      expect(parsed.suggestions.length).toBe(1);
    });

    it('should return error when suggest action has no file or archId', async () => {
      const result = await handleIntents(projectRoot, { action: 'suggest' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('file or archId is required');
    });

    it('should handle usage action', async () => {
      vi.mocked(loadConfig).mockResolvedValue({ version: '1.0' });
      vi.mocked(globFiles).mockResolvedValue(['/test/project/src/a.ts']);
      vi.mocked(loadArchIgnore).mockResolvedValue({
        filter: (files: string[]) => files,
        shouldIgnore: () => false,
      });
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test\n * @intent:cli-output\n */');
      vi.mocked(extractIntents).mockReturnValue(['cli-output']);

      const result = await handleIntents(projectRoot, { action: 'usage' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.defined).toBeDefined();
    });

    it('should handle validate action', async () => {
      vi.mocked(loadConfig).mockResolvedValue({ version: '1.0' });
      vi.mocked(globFiles).mockResolvedValue(['/test/project/src/a.ts']);
      vi.mocked(loadArchIgnore).mockResolvedValue({
        filter: (files: string[]) => files,
        shouldIgnore: () => false,
      });
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test\n * @intent:cli-output\n */');
      vi.mocked(extractIntents).mockReturnValue(['cli-output']);
      vi.mocked(patternMatches).mockReturnValue(true);

      const result = await handleIntents(projectRoot, { action: 'validate' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.totalIntents).toBeDefined();
      expect(parsed.passed).toBeDefined();
    });
  });
});

describe('MCP Action Handler', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(loadActionRegistry).mockResolvedValue({
      actions: {
        'add-view': {
          description: 'Add a new view',
          aliases: ['create view'],
          architecture: 'app.view',
          checklist: ['Create component', 'Add route'],
        },
      },
    });
    vi.mocked(loadFeatureRegistry).mockResolvedValue({
      features: {},
    });
    vi.mocked(loadComponentGroupsRegistry).mockResolvedValue({
      'component-groups': {},
    });
    vi.mocked(expandChecklist).mockImplementation((checklist) => ({
      format: Array.isArray(checklist) ? 'flat' : 'structured',
      flat: Array.isArray(checklist) ? checklist : undefined,
    }));
    vi.mocked(listActionNames).mockReturnValue(['add-view']);
  });

  describe('handleAction', () => {
    it('should list all actions', async () => {
      const result = await handleAction(projectRoot, { action: 'list' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.actions).toBeDefined();
      expect(parsed.actions.length).toBe(1);
      expect(parsed.actions[0].name).toBe('add-view');
    });

    it('should show hint when no actions defined', async () => {
      vi.mocked(listActionNames).mockReturnValue([]);

      const result = await handleAction(projectRoot, { action: 'list' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.hint).toContain('_actions.yaml');
    });

    it('should show action details', async () => {
      vi.mocked(getAction).mockReturnValue({
        description: 'Add a new view',
        aliases: ['create view'],
        architecture: 'app.view',
        checklist: ['Create component'],
      });
      vi.mocked(findFeatureByAction).mockReturnValue(null);

      const result = await handleAction(projectRoot, { action: 'show', name: 'add-view' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.name).toBe('add-view');
      expect(parsed.description).toBe('Add a new view');
    });

    it('should return error when action not found', async () => {
      vi.mocked(getAction).mockReturnValue(null);

      const result = await handleAction(projectRoot, { action: 'show', name: 'nonexistent' });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('Action not found');
    });

    it('should return error when name is missing for show', async () => {
      const result = await handleAction(projectRoot, { action: 'show' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('name is required');
    });

    it('should match actions by query', async () => {
      vi.mocked(matchAction).mockReturnValue([
        {
          name: 'add-view',
          score: 0.9,
          matchType: 'alias',
          action: {
            description: 'Add a new view',
            architecture: 'app.view',
          },
        },
      ]);
      vi.mocked(findFeatureByAction).mockReturnValue(null);

      const result = await handleAction(projectRoot, { query: 'create view' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.bestMatch).toBeDefined();
      expect(parsed.bestMatch.name).toBe('add-view');
    });

    it('should show hint when no query provided', async () => {
      const result = await handleAction(projectRoot, {});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.hint).toBeDefined();
      expect(parsed.examples).toBeDefined();
    });

    it('should show hint when no matches found', async () => {
      vi.mocked(matchAction).mockReturnValue([]);

      const result = await handleAction(projectRoot, { query: 'nonexistent' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.hint).toContain('No matching actions');
    });
  });
});

describe('MCP Feature Handler', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(loadFeatureRegistry).mockResolvedValue({
      features: {
        'validation-rule': {
          description: 'Create a validation rule',
          components: [
            { role: 'validator', architecture: 'core.validator', path: 'src/validators/${name}.ts' },
            { role: 'test', architecture: 'core.test', path: 'tests/${name}.test.ts', optional: true },
          ],
          checklist: ['Implement validate method', 'Add to registry'],
        },
      },
    });
    vi.mocked(listFeatureNames).mockReturnValue(['validation-rule']);
  });

  describe('handleFeature', () => {
    it('should list all features', async () => {
      const result = await handleFeature(projectRoot, { action: 'list' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.features).toBeDefined();
      expect(parsed.features.length).toBe(1);
      expect(parsed.features[0].name).toBe('validation-rule');
    });

    it('should show hint when no features defined', async () => {
      vi.mocked(listFeatureNames).mockReturnValue([]);

      const result = await handleFeature(projectRoot, { action: 'list' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.hint).toContain('_features.yaml');
    });

    it('should show feature details', async () => {
      vi.mocked(getFeature).mockReturnValue({
        description: 'Create a validation rule',
        components: [
          { role: 'validator', architecture: 'core.validator', path: 'src/validators/${name}.ts' },
        ],
        checklist: ['Implement validate method'],
      });

      const result = await handleFeature(projectRoot, { action: 'show', feature: 'validation-rule' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.name).toBe('validation-rule');
      expect(parsed.components).toBeDefined();
    });

    it('should return error when feature not found', async () => {
      vi.mocked(getFeature).mockReturnValue(null);

      const result = await handleFeature(projectRoot, { action: 'show', feature: 'nonexistent' });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('Feature not found');
    });

    it('should return error when feature is missing for show', async () => {
      const result = await handleFeature(projectRoot, { action: 'show' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('feature is required');
    });

    it('should preview feature files', async () => {
      vi.mocked(getFeature).mockReturnValue({
        description: 'Create a validation rule',
        components: [
          { role: 'validator', architecture: 'core.validator', path: 'src/validators/${name}.ts' },
        ],
        checklist: ['Implement'],
      });

      const result = await handleFeature(projectRoot, { action: 'preview', feature: 'validation-rule', name: 'MyRule' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.files).toBeDefined();
      expect(parsed.files[0].path).toContain('MyRule');
    });

    it('should return error when preview is missing feature or name', async () => {
      const result = await handleFeature(projectRoot, { action: 'preview' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('feature and name are required');
    });

    it('should return error for unknown action', async () => {
      const result = await handleFeature(projectRoot, { action: 'invalid' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown action');
    });
  });
});

describe('MCP Infer Handler', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(loadConfig).mockResolvedValue({ version: '1.0' });
    vi.mocked(buildRulesFromSettings).mockReturnValue([]);
    vi.mocked(loadIntentRegistry).mockResolvedValue({ intents: {} });
    vi.mocked(suggestIntents).mockReturnValue([]);
  });

  describe('handleInfer', () => {
    it('should return error when files is empty', async () => {
      const result = await handleInfer(projectRoot, { files: [] });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('files is required');
    });

    it('should infer architecture for files', async () => {
      vi.mocked(readFile).mockResolvedValue('export class MyService {}');
      vi.mocked(parseArchTags).mockReturnValue({ archTag: null, overrides: [], intents: [] });
      vi.mocked(inferArchitecture).mockReturnValue({
        archId: 'domain.service',
        confidence: 'high',
        reason: 'Matches service pattern',
      });

      const result = await handleInfer(projectRoot, { files: ['src/MyService.ts'] });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.filesAnalyzed).toBe(1);
      expect(parsed.results).toHaveLength(1);
      expect(parsed.results[0].suggestedArch).toBe('domain.service');
    });

    it('should expand glob patterns', async () => {
      vi.mocked(globFiles).mockResolvedValue(['src/a.ts', 'src/b.ts']);
      vi.mocked(readFile).mockResolvedValue('export class A {}');
      vi.mocked(parseArchTags).mockReturnValue({ archTag: null, overrides: [], intents: [] });
      vi.mocked(inferArchitecture).mockReturnValue(null);

      const result = await handleInfer(projectRoot, { files: ['src/*.ts'] });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.filesAnalyzed).toBe(2);
    });

    it('should skip tagged files when untaggedOnly is true', async () => {
      vi.mocked(readFile).mockResolvedValue('/**\n * @arch test.arch\n */\nexport class A {}');
      vi.mocked(parseArchTags).mockReturnValue({
        archTag: { archId: 'test.arch', inlineMixins: [] },
        overrides: [],
        intents: [],
      });

      const result = await handleInfer(projectRoot, { files: ['src/a.ts'], untaggedOnly: true });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results).toHaveLength(0);
    });

    it('should include intent suggestions', async () => {
      vi.mocked(readFile).mockResolvedValue('export class CLI {}');
      vi.mocked(parseArchTags).mockReturnValue({ archTag: null, overrides: [], intents: [] });
      vi.mocked(inferArchitecture).mockReturnValue({
        archId: 'cli.command',
        confidence: 'high',
        reason: 'CLI pattern',
      });
      vi.mocked(suggestIntents).mockReturnValue([
        { name: 'cli-output', reason: 'CLI file', description: 'test', category: 'io' },
      ]);

      const result = await handleInfer(projectRoot, { files: ['src/cli.ts'] });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results[0].suggestedIntents).toBeDefined();
      expect(parsed.results[0].suggestedIntents.length).toBe(1);
    });
  });
});
