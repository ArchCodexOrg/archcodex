/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadActionRegistry,
  hasAction,
  listActionNames,
  getAction,
  matchAction,
  loadFeatureRegistry,
  hasFeature,
  listFeatureNames,
  getFeature,
  findFeatureByAction,
} from '../../../../src/core/registry/loader.js';

describe('Action Registry Loader', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'archcodex-action-test-'));
    await mkdir(join(tempDir, '.arch', 'registry'), { recursive: true });
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('loadActionRegistry', () => {
    it('should return empty registry when file does not exist', async () => {
      const registry = await loadActionRegistry(tempDir);
      expect(registry.actions).toEqual({});
    });

    it('should load actions from _actions.yaml', async () => {
      const actionsContent = `
actions:
  add-view:
    description: "Add a new UI view"
    aliases:
      - "create view"
      - "new component"
    architecture: ui.component
    intents:
      - stateless
    checklist:
      - "Define component props"
      - "Add accessibility attributes"
    suggested_path: "src/components"
    file_pattern: "\${name}.tsx"
`;
      await writeFile(join(tempDir, '.arch', 'registry', '_actions.yaml'), actionsContent);

      const registry = await loadActionRegistry(tempDir);

      expect(Object.keys(registry.actions)).toContain('add-view');
      expect(registry.actions['add-view'].description).toBe('Add a new UI view');
      expect(registry.actions['add-view'].aliases).toEqual(['create view', 'new component']);
      expect(registry.actions['add-view'].architecture).toBe('ui.component');
      expect(registry.actions['add-view'].intents).toEqual(['stateless']);
      expect(registry.actions['add-view'].checklist).toHaveLength(2);
    });
  });

  describe('hasAction', () => {
    it('should return true for existing action', async () => {
      const registry = await loadActionRegistry(tempDir);
      expect(hasAction(registry, 'add-view')).toBe(true);
    });

    it('should return false for non-existing action', async () => {
      const registry = await loadActionRegistry(tempDir);
      expect(hasAction(registry, 'non-existent')).toBe(false);
    });
  });

  describe('listActionNames', () => {
    it('should return all action names', async () => {
      const registry = await loadActionRegistry(tempDir);
      expect(listActionNames(registry)).toContain('add-view');
    });
  });

  describe('getAction', () => {
    it('should return action definition', async () => {
      const registry = await loadActionRegistry(tempDir);
      const action = getAction(registry, 'add-view');

      expect(action).toBeDefined();
      expect(action?.description).toBe('Add a new UI view');
    });

    it('should return undefined for non-existing action', async () => {
      const registry = await loadActionRegistry(tempDir);
      expect(getAction(registry, 'non-existent')).toBeUndefined();
    });
  });

  describe('matchAction', () => {
    it('should match by exact name', async () => {
      const registry = await loadActionRegistry(tempDir);
      const matches = matchAction(registry, 'add-view');

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].name).toBe('add-view');
      expect(matches[0].score).toBe(1.0);
      expect(matches[0].matchType).toBe('exact');
    });

    it('should match by alias', async () => {
      const registry = await loadActionRegistry(tempDir);
      const matches = matchAction(registry, 'create view');

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].name).toBe('add-view');
      expect(matches[0].score).toBe(0.95);
      expect(matches[0].matchType).toBe('alias');
    });

    it('should match by partial alias', async () => {
      const registry = await loadActionRegistry(tempDir);
      const matches = matchAction(registry, 'new component');

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].name).toBe('add-view');
      expect(matches[0].matchType).toBe('alias');
    });

    it('should match by description keywords', async () => {
      const registry = await loadActionRegistry(tempDir);
      // "UI" appears only in description, not in name or aliases
      const matches = matchAction(registry, 'new UI');

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].name).toBe('add-view');
      // The match type depends on which part matches first
      expect(['description', 'exact', 'alias']).toContain(matches[0].matchType);
    });

    it('should return empty array for no matches', async () => {
      const registry = await loadActionRegistry(tempDir);
      const matches = matchAction(registry, 'xyz completely unrelated query');

      expect(matches).toEqual([]);
    });

    it('should sort matches by score descending', async () => {
      // Add another action
      const actionsContent = `
actions:
  add-view:
    description: "Add a new UI view"
    aliases:
      - "create view"
      - "new component"
    architecture: ui.component
    checklist:
      - "Step 1"
  add-button:
    description: "Add a button component"
    aliases:
      - "create button"
    architecture: ui.button
    checklist:
      - "Step 1"
`;
      await writeFile(join(tempDir, '.arch', 'registry', '_actions.yaml'), actionsContent);

      const registry = await loadActionRegistry(tempDir);
      const matches = matchAction(registry, 'add');

      expect(matches.length).toBe(2);
      // Both should match 'add' in name
      for (let i = 1; i < matches.length; i++) {
        expect(matches[i].score).toBeLessThanOrEqual(matches[i - 1].score);
      }
    });
  });
});

describe('Feature Registry Loader', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'archcodex-feature-test-'));
    await mkdir(join(tempDir, '.arch', 'registry'), { recursive: true });
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('loadFeatureRegistry', () => {
    it('should return empty registry when file does not exist', async () => {
      const registry = await loadFeatureRegistry(tempDir);
      expect(registry.features).toEqual({});
    });

    it('should load features from _features.yaml', async () => {
      const featuresContent = `
features:
  validation-rule:
    description: "Complete validation rule with constraint and tests"
    components:
      - role: constraint
        architecture: core.constraint
        path: "src/core/constraints/\${name}.ts"
      - role: test
        architecture: test.unit
        path: "tests/unit/core/constraints/\${name}.test.ts"
    checklist:
      - "Register constraint"
      - "Add exports"
    triggered_by_action: add-constraint
`;
      await writeFile(join(tempDir, '.arch', 'registry', '_features.yaml'), featuresContent);

      const registry = await loadFeatureRegistry(tempDir);

      expect(Object.keys(registry.features)).toContain('validation-rule');
      expect(registry.features['validation-rule'].description).toBe('Complete validation rule with constraint and tests');
      expect(registry.features['validation-rule'].components).toHaveLength(2);
      expect(registry.features['validation-rule'].triggered_by_action).toBe('add-constraint');
    });
  });

  describe('hasFeature', () => {
    it('should return true for existing feature', async () => {
      const registry = await loadFeatureRegistry(tempDir);
      expect(hasFeature(registry, 'validation-rule')).toBe(true);
    });

    it('should return false for non-existing feature', async () => {
      const registry = await loadFeatureRegistry(tempDir);
      expect(hasFeature(registry, 'non-existent')).toBe(false);
    });
  });

  describe('listFeatureNames', () => {
    it('should return all feature names', async () => {
      const registry = await loadFeatureRegistry(tempDir);
      expect(listFeatureNames(registry)).toContain('validation-rule');
    });
  });

  describe('getFeature', () => {
    it('should return feature definition', async () => {
      const registry = await loadFeatureRegistry(tempDir);
      const feature = getFeature(registry, 'validation-rule');

      expect(feature).toBeDefined();
      expect(feature?.components).toHaveLength(2);
    });

    it('should return undefined for non-existing feature', async () => {
      const registry = await loadFeatureRegistry(tempDir);
      expect(getFeature(registry, 'non-existent')).toBeUndefined();
    });
  });

  describe('findFeatureByAction', () => {
    it('should find feature triggered by action', async () => {
      const registry = await loadFeatureRegistry(tempDir);
      const feature = findFeatureByAction(registry, 'add-constraint');

      expect(feature).toBeDefined();
      expect(feature?.components).toHaveLength(2);
    });

    it('should return undefined when no feature is triggered by action', async () => {
      const registry = await loadFeatureRegistry(tempDir);
      expect(findFeatureByAction(registry, 'non-existent-action')).toBeUndefined();
    });
  });
});
