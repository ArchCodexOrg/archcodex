/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadRegistry,
  getRegistryPath,
  getRegistryFilePath,
  getRegistryDirPath,
  registryExists,
  loadIntentRegistry,
  suggestIntents,
  listArchitectureIds,
  listMixinIds,
  hasArchitecture,
  hasMixin,
  getRegistryContent,
  loadPartialRegistry,
  loadRegistryFromFiles,
  hasIntent,
  listIntentNames,
  getIntentsByCategory,
  loadActionRegistry,
  hasAction,
  listActionNames,
  getAction,
  matchAction,
  loadFeatureRegistry,
  hasFeature,
  listFeatureNames,
  getFeature,
} from '../../../../src/core/registry/loader.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { IntentRegistry, ActionRegistry, FeatureRegistry } from '../../../../src/core/registry/schema.js';

describe('Registry Loader', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `archcodex-test-${Date.now()}`);
    mkdirSync(join(tempDir, '.arch'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('loadRegistry - single file mode', () => {
    it('should load a valid registry file', async () => {
      const registryContent = `
base:
  description: "Base architecture"
  rationale: "Foundation for all code"
  hints:
    - "Follow best practices"
`;
      writeFileSync(join(tempDir, '.arch', 'registry.yaml'), registryContent);

      const registry = await loadRegistry(tempDir);
      expect(registry.nodes.base).toBeDefined();
      expect(registry.nodes.base.description).toBe('Base architecture');
    });

    it('should throw error for missing registry file', async () => {
      await expect(loadRegistry(tempDir)).rejects.toThrow();
    });

    it('should load registry with constraints', async () => {
      const registryContent = `
base:
  description: "Base"
  rationale: "Foundation architecture"
  constraints:
    - rule: forbid_import
      value: ["forbidden-pkg"]
      severity: error
`;
      writeFileSync(join(tempDir, '.arch', 'registry.yaml'), registryContent);

      const registry = await loadRegistry(tempDir);
      expect(registry.nodes.base.constraints).toHaveLength(1);
      expect(registry.nodes.base.constraints![0].rule).toBe('forbid_import');
    });
  });

  describe('loadRegistry - multi-file mode', () => {
    it('should load registry from directory', async () => {
      // Create registry directory structure
      const registryDir = join(tempDir, '.arch', 'registry');
      mkdirSync(registryDir, { recursive: true });

      writeFileSync(join(registryDir, 'base.yaml'), `
base:
  description: "Base architecture"
  rationale: "Foundation"
`);

      writeFileSync(join(registryDir, '_mixins.yaml'), `
tested:
  description: "Requires tests"
  rationale: "Quality mixin"
`);

      const registry = await loadRegistry(tempDir);
      expect(registry.nodes.base).toBeDefined();
      expect(registry.nodes.base.description).toBe('Base architecture');
      expect(registry.mixins.tested).toBeDefined();
    });

    it('should prefer directory over single file', async () => {
      // Create both file and directory
      writeFileSync(join(tempDir, '.arch', 'registry.yaml'), `
old:
  description: "Old format"
  rationale: "Should not load"
`);

      const registryDir = join(tempDir, '.arch', 'registry');
      mkdirSync(registryDir, { recursive: true });
      writeFileSync(join(registryDir, 'base.yaml'), `
base:
  description: "New format"
  rationale: "Should load"
`);

      const registry = await loadRegistry(tempDir);
      expect(registry.nodes.base).toBeDefined();
      expect(registry.nodes.old).toBeUndefined();
    });

    it('should load nested directories', async () => {
      const registryDir = join(tempDir, '.arch', 'registry');
      const cliDir = join(registryDir, 'cli');
      mkdirSync(cliDir, { recursive: true });

      writeFileSync(join(registryDir, 'base.yaml'), `
base:
  description: "Base"
  rationale: "Foundation"
`);

      writeFileSync(join(cliDir, '_index.yaml'), `
app.cli:
  inherits: base
  description: "CLI layer"
  rationale: "Commands"
`);

      writeFileSync(join(cliDir, 'command.yaml'), `
app.cli.command:
  inherits: app.cli
  description: "CLI command"
  rationale: "Individual commands"
`);

      const registry = await loadRegistry(tempDir);
      expect(registry.nodes.base).toBeDefined();
      expect(registry.nodes['app.cli']).toBeDefined();
      expect(registry.nodes['app.cli.command']).toBeDefined();
      expect(registry.nodes['app.cli.command'].inherits).toBe('app.cli');
    });
  });

  describe('getRegistryPath', () => {
    it('should return file path when only file exists', async () => {
      writeFileSync(join(tempDir, '.arch', 'registry.yaml'), 'base:\n  rationale: "Test"');
      const path = await getRegistryPath(tempDir);
      expect(path).toContain('.arch');
      expect(path).toContain('registry.yaml');
    });

    it('should return directory path when directory exists', async () => {
      const registryDir = join(tempDir, '.arch', 'registry');
      mkdirSync(registryDir, { recursive: true });
      writeFileSync(join(registryDir, 'base.yaml'), 'base:\n  rationale: "Test"');

      const path = await getRegistryPath(tempDir);
      expect(path).toContain('.arch');
      expect(path).toContain('registry');
      expect(path).not.toContain('.yaml');
    });
  });

  describe('getRegistryFilePath / getRegistryDirPath', () => {
    it('should return default file path', () => {
      const path = getRegistryFilePath(tempDir);
      expect(path).toContain('.arch');
      expect(path).toContain('registry.yaml');
    });

    it('should return default directory path', () => {
      const path = getRegistryDirPath(tempDir);
      expect(path).toContain('.arch');
      expect(path).toContain('registry');
      expect(path).not.toContain('.yaml');
    });
  });

  describe('registryExists', () => {
    it('should return false when registry does not exist', async () => {
      expect(await registryExists(tempDir)).toBe(false);
    });

    it('should return true when registry file exists', async () => {
      writeFileSync(join(tempDir, '.arch', 'registry.yaml'), 'base:\n  rationale: "Test"');
      expect(await registryExists(tempDir)).toBe(true);
    });

    it('should return true when registry directory exists', async () => {
      const registryDir = join(tempDir, '.arch', 'registry');
      mkdirSync(registryDir, { recursive: true });
      writeFileSync(join(registryDir, 'base.yaml'), 'base:\n  rationale: "Test"');
      expect(await registryExists(tempDir)).toBe(true);
    });
  });

  describe('loadIntentRegistry', () => {
    it('should load intents from registry/_intents.yaml', async () => {
      const registryDir = join(tempDir, '.arch', 'registry');
      mkdirSync(registryDir, { recursive: true });

      const intentsContent = `
intents:
  stateless:
    description: "No internal state"
    category: lifecycle
`;
      writeFileSync(join(registryDir, '_intents.yaml'), intentsContent);

      const registry = await loadIntentRegistry(tempDir);
      expect(registry.intents.stateless).toBeDefined();
      expect(registry.intents.stateless.description).toBe('No internal state');
      expect(registry.intents.stateless.category).toBe('lifecycle');
    });

    it('should load intents with requires patterns', async () => {
      const registryDir = join(tempDir, '.arch', 'registry');
      mkdirSync(registryDir, { recursive: true });

      const intentsContent = `
intents:
  admin-only:
    description: "Admin access required"
    requires:
      - "/isAdmin/i"
    category: auth
`;
      writeFileSync(join(registryDir, '_intents.yaml'), intentsContent);

      const registry = await loadIntentRegistry(tempDir);
      expect(registry.intents['admin-only']).toBeDefined();
      expect(registry.intents['admin-only'].requires).toEqual(['/isAdmin/i']);
    });

    it('should return empty registry when no intents file exists', async () => {
      const registry = await loadIntentRegistry(tempDir);
      expect(registry.intents).toEqual({});
    });

    it('should load intents with suggestion patterns', async () => {
      const registryDir = join(tempDir, '.arch', 'registry');
      mkdirSync(registryDir, { recursive: true });

      const intentsContent = `
intents:
  admin-only:
    description: "Admin access required"
    category: auth
    suggest_for_paths:
      - "**/admin/**"
      - "**/backoffice/**"
    suggest_for_archs:
      - "api.admin.*"
`;
      writeFileSync(join(registryDir, '_intents.yaml'), intentsContent);

      const registry = await loadIntentRegistry(tempDir);
      expect(registry.intents['admin-only'].suggest_for_paths).toEqual(['**/admin/**', '**/backoffice/**']);
      expect(registry.intents['admin-only'].suggest_for_archs).toEqual(['api.admin.*']);
    });
  });

  describe('suggestIntents', () => {
    const mockRegistry: IntentRegistry = {
      intents: {
        'admin-only': {
          description: 'Admin access required',
          category: 'auth',
          suggest_for_paths: ['**/admin/**', '**/backoffice/**'],
          suggest_for_archs: ['api.admin.*', '*.admin.*'],
        },
        'stateless': {
          description: 'No internal state',
          category: 'lifecycle',
          suggest_for_paths: ['**/validators/**', '**/utils/**'],
        },
        'public-endpoint': {
          description: 'No auth required',
          category: 'auth',
          suggest_for_archs: ['api.public.*'],
        },
      },
    };

    it('should suggest intents based on file path', () => {
      const suggestions = suggestIntents(mockRegistry, {
        filePath: 'src/admin/users.ts',
      });

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].name).toBe('admin-only');
      expect(suggestions[0].reason).toBe('path');
      expect(suggestions[0].matchedPattern).toBe('**/admin/**');
    });

    it('should suggest intents based on architecture', () => {
      const suggestions = suggestIntents(mockRegistry, {
        archId: 'api.admin.users',
      });

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].name).toBe('admin-only');
      expect(suggestions[0].reason).toBe('architecture');
      expect(suggestions[0].matchedPattern).toBe('api.admin.*');
    });

    it('should suggest intents from both path and arch', () => {
      const suggestions = suggestIntents(mockRegistry, {
        filePath: 'src/validators/email.ts',
        archId: 'api.public.health',
      });

      expect(suggestions).toHaveLength(2);
      expect(suggestions.map(s => s.name)).toContain('stateless');
      expect(suggestions.map(s => s.name)).toContain('public-endpoint');
    });

    it('should not duplicate suggestions', () => {
      const suggestions = suggestIntents(mockRegistry, {
        filePath: 'src/admin/validator.ts',
        archId: 'api.admin.validator',
      });

      // admin-only matched by both path and arch, but should only appear once
      const adminOnlySuggestions = suggestions.filter(s => s.name === 'admin-only');
      expect(adminOnlySuggestions).toHaveLength(1);
    });

    it('should return empty array for non-matching paths', () => {
      const suggestions = suggestIntents(mockRegistry, {
        filePath: 'src/services/user.ts',
        archId: 'core.service.user',
      });

      expect(suggestions).toHaveLength(0);
    });

    it('should handle arch patterns with wildcards', () => {
      const suggestions = suggestIntents(mockRegistry, {
        archId: 'core.admin.dashboard',
      });

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].name).toBe('admin-only');
      expect(suggestions[0].matchedPattern).toBe('*.admin.*');
    });

    it('should return empty array for empty registry', () => {
      const emptyRegistry: IntentRegistry = { intents: {} };
      const suggestions = suggestIntents(emptyRegistry, {
        filePath: 'src/admin/users.ts',
      });

      expect(suggestions).toHaveLength(0);
    });
  });

  describe('listArchitectureIds / listMixinIds', () => {
    it('should list all architecture IDs', async () => {
      const registryContent = `
base:
  description: "Base"
  rationale: "Foundation"
domain:
  description: "Domain"
  inherits: base
  rationale: "Domain layer"
`;
      writeFileSync(join(tempDir, '.arch', 'registry.yaml'), registryContent);

      const registry = await loadRegistry(tempDir);
      const ids = listArchitectureIds(registry);

      expect(ids).toContain('base');
      expect(ids).toContain('domain');
      expect(ids).toHaveLength(2);
    });

    it('should list all mixin IDs', async () => {
      const registryContent = `
base:
  description: "Base"
  rationale: "Foundation"
mixins:
  tested:
    description: "Requires tests"
    rationale: "Quality"
  dry:
    description: "No duplication"
    rationale: "Quality"
`;
      writeFileSync(join(tempDir, '.arch', 'registry.yaml'), registryContent);

      const registry = await loadRegistry(tempDir);
      const ids = listMixinIds(registry);

      expect(ids).toContain('tested');
      expect(ids).toContain('dry');
    });
  });

  describe('hasArchitecture / hasMixin', () => {
    it('should check if architecture exists', async () => {
      const registryContent = `
base:
  description: "Base"
  rationale: "Foundation"
`;
      writeFileSync(join(tempDir, '.arch', 'registry.yaml'), registryContent);

      const registry = await loadRegistry(tempDir);

      expect(hasArchitecture(registry, 'base')).toBe(true);
      expect(hasArchitecture(registry, 'nonexistent')).toBe(false);
    });

    it('should check if mixin exists', async () => {
      const registryContent = `
base:
  description: "Base"
  rationale: "Foundation"
mixins:
  tested:
    description: "Requires tests"
    rationale: "Quality"
`;
      writeFileSync(join(tempDir, '.arch', 'registry.yaml'), registryContent);

      const registry = await loadRegistry(tempDir);

      expect(hasMixin(registry, 'tested')).toBe(true);
      expect(hasMixin(registry, 'nonexistent')).toBe(false);
    });
  });

  describe('getRegistryContent', () => {
    it('should get content from single file', async () => {
      const registryContent = `base:\n  description: "Base"\n  rationale: "Foundation"`;
      writeFileSync(join(tempDir, '.arch', 'registry.yaml'), registryContent);

      const content = await getRegistryContent(tempDir);

      expect(content).toContain('base:');
      expect(content).toContain('Base');
    });

    it('should get content from directory', async () => {
      const registryDir = join(tempDir, '.arch', 'registry');
      mkdirSync(registryDir, { recursive: true });

      writeFileSync(join(registryDir, 'base.yaml'), `base:\n  description: "Base"\n  rationale: "Foundation"`);
      writeFileSync(join(registryDir, 'domain.yaml'), `domain:\n  description: "Domain"\n  rationale: "Domain layer"\n  inherits: base`);

      const content = await getRegistryContent(tempDir);

      expect(content).toContain('base.yaml');
      expect(content).toContain('domain.yaml');
    });

    it('should return empty string when no registry exists', async () => {
      const content = await getRegistryContent(tempDir);

      expect(content).toBe('');
    });
  });

  describe('loadPartialRegistry', () => {
    it('should load only matching patterns', async () => {
      const registryDir = join(tempDir, '.arch', 'registry');
      const cliDir = join(registryDir, 'cli');
      mkdirSync(cliDir, { recursive: true });

      writeFileSync(join(registryDir, 'base.yaml'), `base:\n  description: "Base"\n  rationale: "Foundation"`);
      writeFileSync(join(cliDir, 'command.yaml'), `cli.command:\n  description: "CLI Command"\n  inherits: base\n  rationale: "CLI"`);
      writeFileSync(join(cliDir, 'formatter.yaml'), `cli.formatter:\n  description: "CLI Formatter"\n  inherits: base\n  rationale: "CLI"`);

      const registry = await loadPartialRegistry(tempDir, ['cli/*']);

      expect(registry.nodes['cli.command']).toBeDefined();
      expect(registry.nodes['cli.formatter']).toBeDefined();
      expect(registry.nodes['base']).toBeDefined(); // Included because includeBase defaults true
    });

    it('should throw when no files match pattern and includeBase is false', async () => {
      const registryDir = join(tempDir, '.arch', 'registry');
      mkdirSync(registryDir, { recursive: true });
      writeFileSync(join(registryDir, 'base.yaml'), `base:\n  description: "Base"\n  rationale: "Foundation"`);

      await expect(loadPartialRegistry(tempDir, ['nonexistent/**'], { includeBase: false })).rejects.toThrow();
    });

    it('should throw when directory does not exist', async () => {
      await expect(loadPartialRegistry(tempDir, ['**/*'])).rejects.toThrow();
    });
  });

  describe('loadRegistryFromFiles', () => {
    it('should load specific files', async () => {
      const registryDir = join(tempDir, '.arch', 'registry');
      mkdirSync(registryDir, { recursive: true });

      const baseFile = join(registryDir, 'base.yaml');
      writeFileSync(baseFile, `base:\n  description: "Base"\n  rationale: "Foundation"`);

      const registry = await loadRegistryFromFiles([baseFile]);

      expect(registry.nodes['base']).toBeDefined();
    });

    it('should load mixins file correctly', async () => {
      const registryDir = join(tempDir, '.arch', 'registry');
      mkdirSync(registryDir, { recursive: true });

      const mixinsFile = join(registryDir, '_mixins.yaml');
      writeFileSync(mixinsFile, `tested:\n  description: "Requires tests"\n  rationale: "Quality"`);

      const registry = await loadRegistryFromFiles([mixinsFile]);

      expect(registry.mixins['tested']).toBeDefined();
    });
  });

  describe('intent helper functions', () => {
    it('hasIntent should check intent existence', async () => {
      const registryDir = join(tempDir, '.arch', 'registry');
      mkdirSync(registryDir, { recursive: true });
      writeFileSync(join(registryDir, '_intents.yaml'), `intents:\n  stateless:\n    description: "No state"`);

      const intentRegistry = await loadIntentRegistry(tempDir);

      expect(hasIntent(intentRegistry, 'stateless')).toBe(true);
      expect(hasIntent(intentRegistry, 'nonexistent')).toBe(false);
    });

    it('listIntentNames should return all intent names', async () => {
      const registryDir = join(tempDir, '.arch', 'registry');
      mkdirSync(registryDir, { recursive: true });
      writeFileSync(join(registryDir, '_intents.yaml'), `intents:\n  stateless:\n    description: "No state"\n  cacheable:\n    description: "Can cache"`);

      const intentRegistry = await loadIntentRegistry(tempDir);
      const names = listIntentNames(intentRegistry);

      expect(names).toContain('stateless');
      expect(names).toContain('cacheable');
    });

    it('getIntentsByCategory should group intents', async () => {
      const registryDir = join(tempDir, '.arch', 'registry');
      mkdirSync(registryDir, { recursive: true });
      writeFileSync(join(registryDir, '_intents.yaml'), `intents:\n  stateless:\n    description: "No state"\n    category: lifecycle\n  cacheable:\n    description: "Can cache"\n    category: performance`);

      const intentRegistry = await loadIntentRegistry(tempDir);
      const categories = getIntentsByCategory(intentRegistry);

      expect(categories.get('lifecycle')).toContain('stateless');
      expect(categories.get('performance')).toContain('cacheable');
    });
  });

  describe('Action Registry', () => {
    it('should load action registry', async () => {
      const registryDir = join(tempDir, '.arch', 'registry');
      mkdirSync(registryDir, { recursive: true });
      writeFileSync(join(registryDir, '_actions.yaml'), `actions:\n  add-view:\n    description: "Add a new view"\n    architecture: domain.view\n    checklist:\n      - "Create view file"`);

      const actionRegistry = await loadActionRegistry(tempDir);

      expect(actionRegistry.actions['add-view']).toBeDefined();
      expect(actionRegistry.actions['add-view'].description).toBe('Add a new view');
    });

    it('should return empty registry when no actions file', async () => {
      const actionRegistry = await loadActionRegistry(tempDir);

      expect(actionRegistry.actions).toEqual({});
    });

    it('hasAction should check action existence', async () => {
      const registry: ActionRegistry = {
        actions: {
          'add-view': {
            description: 'Add view',
            architecture: 'domain.view',
            checklist: ['Create view'],
          },
        },
      };

      expect(hasAction(registry, 'add-view')).toBe(true);
      expect(hasAction(registry, 'nonexistent')).toBe(false);
    });

    it('listActionNames should return all action names', () => {
      const registry: ActionRegistry = {
        actions: {
          'add-view': { description: 'Add view', architecture: 'a', checklist: [] },
          'add-service': { description: 'Add service', architecture: 'b', checklist: [] },
        },
      };

      const names = listActionNames(registry);

      expect(names).toContain('add-view');
      expect(names).toContain('add-service');
    });

    it('getAction should return action definition', () => {
      const registry: ActionRegistry = {
        actions: {
          'add-view': {
            description: 'Add view',
            architecture: 'domain.view',
            checklist: ['Create view'],
          },
        },
      };

      const action = getAction(registry, 'add-view');

      expect(action?.description).toBe('Add view');
      expect(getAction(registry, 'nonexistent')).toBeUndefined();
    });

    it('matchAction should find matching actions', () => {
      const registry: ActionRegistry = {
        actions: {
          'add-view': {
            description: 'Add a new view component',
            architecture: 'domain.view',
            checklist: ['Create view'],
            aliases: ['create view', 'new view'],
          },
          'add-service': {
            description: 'Add a service',
            architecture: 'domain.service',
            checklist: ['Create service'],
          },
        },
      };

      // Exact match
      let matches = matchAction(registry, 'add-view');
      expect(matches[0].name).toBe('add-view');
      expect(matches[0].score).toBe(1.0);

      // Alias match
      matches = matchAction(registry, 'create view');
      expect(matches[0].name).toBe('add-view');
      expect(matches[0].matchType).toBe('alias');

      // Description match
      matches = matchAction(registry, 'component');
      expect(matches.some(m => m.name === 'add-view')).toBe(true);
    });
  });

  describe('Feature Registry', () => {
    it('should load feature registry', async () => {
      const registryDir = join(tempDir, '.arch', 'registry');
      mkdirSync(registryDir, { recursive: true });
      // Schema requires 'components' with role, architecture, path
      writeFileSync(join(registryDir, '_features.yaml'), `features:
  user-crud:
    description: "User CRUD feature"
    components:
      - role: entity
        architecture: domain.entity
        path: "src/\${name}.ts"
`);

      const featureRegistry = await loadFeatureRegistry(tempDir);

      expect(featureRegistry.features['user-crud']).toBeDefined();
    });

    it('should return empty registry when no features file', async () => {
      const featureRegistry = await loadFeatureRegistry(tempDir);

      expect(featureRegistry.features).toEqual({});
    });

    it('hasFeature should check feature existence', () => {
      const registry: FeatureRegistry = {
        features: {
          'user-crud': {
            description: 'User CRUD',
            components: [{ role: 'entity', path: 'src/user.ts', architecture: 'domain' }],
          },
        },
      };

      expect(hasFeature(registry, 'user-crud')).toBe(true);
      expect(hasFeature(registry, 'nonexistent')).toBe(false);
    });

    it('listFeatureNames should return all feature names', () => {
      const registry: FeatureRegistry = {
        features: {
          'user-crud': { description: 'User CRUD', components: [] },
          'order-crud': { description: 'Order CRUD', components: [] },
        },
      };

      const names = listFeatureNames(registry);

      expect(names).toContain('user-crud');
      expect(names).toContain('order-crud');
    });

    it('getFeature should return feature definition', () => {
      const registry: FeatureRegistry = {
        features: {
          'user-crud': {
            description: 'User CRUD',
            components: [{ role: 'entity', path: 'src/user.ts', architecture: 'domain' }],
          },
        },
      };

      const feature = getFeature(registry, 'user-crud');

      expect(feature?.description).toBe('User CRUD');
      expect(getFeature(registry, 'nonexistent')).toBeUndefined();
    });
  });
});
