/**
 * @arch archcodex.test.unit
 *
 * Tests for context formatter.
 */
import { describe, it, expect } from 'vitest';
import { formatContext, formatContexts } from '../../../../src/core/context/formatter.js';
import type { SynthesizedContext } from '../../../../src/core/context/types.js';

describe('Context Formatter', () => {
  const sampleContext: SynthesizedContext = {
    entity: 'todos',
    fields: [
      { name: '_id', type: 'Id<todos>' },
      { name: 'title', type: 'string' },
      { name: 'content', type: 'string', optional: true },
      { name: 'position', type: 'number' },
      { name: 'userId', type: 'Id<users>', isReference: true, referenceTarget: 'users' },
    ],
    relationships: [
      { name: 'userId', type: 'belongs_to', target: 'users', field: 'userId' },
      { name: 'comments', type: 'has_many', target: 'comments' },
    ],
    behaviors: [
      { type: 'ordering', fields: ['position'] },
    ],
    existingOperations: [
      { name: 'createTodo', file: 'todo.service.ts', line: 10 },
      { name: 'getTodo', file: 'todo.service.ts', line: 25 },
    ],
    similarOperations: [
      { name: 'duplicateTemplate', file: 'template.service.ts', line: 50 },
    ],
  };

  describe('formatContext with yaml format', () => {
    it('should format context as YAML', () => {
      const result = formatContext(sampleContext, { format: 'yaml' });

      expect(result).toContain('entity: todos');
      expect(result).toContain('fields:');
      expect(result).toContain('relationships:');
      expect(result).toContain('behaviors:');
      expect(result).toContain('existing_operations:');
      expect(result).toContain('similar_operations:');
    });

    it('should include field names with optional indicators', () => {
      const result = formatContext(sampleContext, { format: 'yaml' });

      expect(result).toContain('content?'); // Optional field
      expect(result).toContain('title'); // Required field (no ?)
    });

    it('should format relationships with type and target', () => {
      const result = formatContext(sampleContext, { format: 'yaml' });

      expect(result).toContain('userId: belongs_to users');
      expect(result).toContain('comments: has_many comments');
    });

    it('should format behaviors with fields', () => {
      const result = formatContext(sampleContext, { format: 'yaml' });

      expect(result).toContain('ordering: position field');
    });

    it('should format operations with file and line', () => {
      const result = formatContext(sampleContext, { format: 'yaml' });

      expect(result).toContain('createTodo (todo.service.ts:10)');
      expect(result).toContain('duplicateTemplate (template.service.ts:50)');
    });

    it('should use yaml as default format', () => {
      const result = formatContext(sampleContext);

      expect(result).toContain('entity: todos');
    });
  });

  describe('formatContext with json format', () => {
    it('should format context as valid JSON', () => {
      const result = formatContext(sampleContext, { format: 'json' });

      const parsed = JSON.parse(result);
      expect(parsed.entity).toBe('todos');
      expect(parsed.fields).toHaveLength(5);
      expect(parsed.relationships).toHaveLength(2);
      expect(parsed.behaviors).toHaveLength(1);
    });

    it('should include all context properties', () => {
      const result = formatContext(sampleContext, { format: 'json' });

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('entity');
      expect(parsed).toHaveProperty('fields');
      expect(parsed).toHaveProperty('relationships');
      expect(parsed).toHaveProperty('behaviors');
      expect(parsed).toHaveProperty('existingOperations');
      expect(parsed).toHaveProperty('similarOperations');
    });
  });

  describe('formatContext with compact format', () => {
    it('should format context in minimal form', () => {
      const result = formatContext(sampleContext, { format: 'compact' });

      // Should be a single line or very compact
      expect(result.split('\n').length).toBeLessThanOrEqual(1);
    });

    it('should include entity name and fields', () => {
      const result = formatContext(sampleContext, { format: 'compact' });

      expect(result).toContain('todos');
      expect(result).toContain('title');
    });

    it('should use short relationship type notation', () => {
      const result = formatContext(sampleContext, { format: 'compact' });

      // Should use N:1 for belongs_to, 1:N for has_many
      expect(result).toContain('N:1');
      expect(result).toContain('1:N');
    });

    it('should include operation counts', () => {
      const result = formatContext(sampleContext, { format: 'compact' });

      expect(result).toContain('ops:2');
      expect(result).toContain('similar:1');
    });

    it('should skip internal fields (starting with _)', () => {
      const result = formatContext(sampleContext, { format: 'compact' });

      expect(result).not.toContain('_id');
    });
  });

  describe('formatContext with constraints', () => {
    it('should include constraints in yaml format', () => {
      const contextWithConstraints: SynthesizedContext = {
        ...sampleContext,
        constraints: {
          archId: 'archcodex.core.domain',
          constraints: ['forbid_import: axios', 'require_pattern: logger'],
        },
      };

      const result = formatContext(contextWithConstraints, { format: 'yaml' });

      expect(result).toContain('constraints:');
      expect(result).toContain('architecture: archcodex.core.domain');
      expect(result).toContain('forbid_import: axios');
    });
  });

  describe('formatContext with empty sections', () => {
    it('should handle context with no relationships', () => {
      const contextNoRels: SynthesizedContext = {
        ...sampleContext,
        relationships: [],
      };

      const result = formatContext(contextNoRels, { format: 'yaml' });

      expect(result).not.toContain('relationships:');
    });

    it('should handle context with no behaviors', () => {
      const contextNoBehaviors: SynthesizedContext = {
        ...sampleContext,
        behaviors: [],
      };

      const result = formatContext(contextNoBehaviors, { format: 'yaml' });

      expect(result).not.toContain('behaviors:');
    });

    it('should handle context with no operations', () => {
      const contextNoOps: SynthesizedContext = {
        ...sampleContext,
        existingOperations: [],
        similarOperations: [],
      };

      const result = formatContext(contextNoOps, { format: 'yaml' });

      expect(result).not.toContain('existing_operations:');
      expect(result).not.toContain('similar_operations:');
    });
  });

  describe('formatContexts', () => {
    it('should format multiple contexts', () => {
      const contexts: SynthesizedContext[] = [
        sampleContext,
        {
          ...sampleContext,
          entity: 'users',
          fields: [{ name: 'name', type: 'string' }],
        },
      ];

      const result = formatContexts(contexts, { format: 'yaml' });

      expect(result).toContain('entity: todos');
      expect(result).toContain('entity: users');
    });

    it('should format multiple contexts as JSON array', () => {
      const contexts: SynthesizedContext[] = [
        sampleContext,
        { ...sampleContext, entity: 'users' },
      ];

      const result = formatContexts(contexts, { format: 'json' });

      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
    });
  });

  describe('formatContext with file reference filtering', () => {
    it('should show relevance annotation on file references', () => {
      const contextWithFiles: SynthesizedContext = {
        ...sampleContext,
        fileReferences: [{
          archId: 'core',
          files: [
            { path: 'src/createEntry.ts', refType: 'function', lineNumber: 10, relevance: 'direct' },
            { path: 'src/types.ts', refType: 'type', lineNumber: 5, relevance: 'peripheral' },
          ],
        }],
      };

      const result = formatContext(contextWithFiles, { format: 'yaml' });

      expect(result).toContain('[direct]');
      expect(result).toContain('[peripheral]');
    });

    it('should show truncation notice when files were omitted', () => {
      const contextWithTruncation: SynthesizedContext = {
        ...sampleContext,
        fileReferences: [{
          archId: 'core',
          files: [{ path: 'src/main.ts', refType: 'function', lineNumber: 1 }],
        }],
        truncatedFiles: 12,
      };

      const result = formatContext(contextWithTruncation, { format: 'yaml' });

      expect(result).toContain('12 peripheral files omitted');
      expect(result).toContain('verbose: true');
    });

    it('should not show truncation notice when no files were omitted', () => {
      const contextNoTruncation: SynthesizedContext = {
        ...sampleContext,
        fileReferences: [{
          archId: 'core',
          files: [{ path: 'src/main.ts', refType: 'function', lineNumber: 1 }],
        }],
      };

      const result = formatContext(contextNoTruncation, { format: 'yaml' });

      expect(result).not.toContain('files omitted');
    });

    it('should not show relevance label when not annotated', () => {
      const contextNoRelevance: SynthesizedContext = {
        ...sampleContext,
        fileReferences: [{
          archId: 'core',
          files: [{ path: 'src/main.ts', refType: 'function', lineNumber: 1 }],
        }],
      };

      const result = formatContext(contextNoRelevance, { format: 'yaml' });

      expect(result).not.toContain('[direct]');
      expect(result).not.toContain('[peripheral]');
      expect(result).not.toContain('[related]');
    });
  });

  describe('formatContext with uiComponents', () => {
    it('should include ui_components in yaml format', () => {
      const contextWithUI: SynthesizedContext = {
        ...sampleContext,
        uiComponents: {
          group: 'order-cards',
          warning: 'Ensure all 5 cards are updated together',
          components: [
            { path: 'src/components/orders/TaskCard.tsx', renders: 'task' },
            { path: 'src/components/orders/NoteCard.tsx', renders: 'note' },
          ],
          related: {
            actions: 'src/actions/OrderActions.tsx',
            handlers: 'src/hooks/useOrderHandlers.ts',
          },
        },
      };

      const result = formatContext(contextWithUI, { format: 'yaml' });

      expect(result).toContain('ui_components:');
      expect(result).toContain('group: order-cards');
      expect(result).toContain('warning:');
      expect(result).toContain('5 cards');
      expect(result).toContain('components:');
      expect(result).toContain('TaskCard.tsx');
      expect(result).toContain('(renders: task)');
      expect(result).toContain('related:');
      expect(result).toContain('actions:');
      expect(result).toContain('handlers:');
    });

    it('should include ui count in compact format', () => {
      const contextWithUI: SynthesizedContext = {
        ...sampleContext,
        uiComponents: {
          group: 'order-cards',
          components: [
            { path: 'src/components/orders/TaskCard.tsx' },
            { path: 'src/components/orders/NoteCard.tsx' },
            { path: 'src/components/orders/DecisionCard.tsx' },
          ],
        },
      };

      const result = formatContext(contextWithUI, { format: 'compact' });

      expect(result).toContain('ui:3');
    });

    it('should include uiComponents in JSON format', () => {
      const contextWithUI: SynthesizedContext = {
        ...sampleContext,
        uiComponents: {
          group: 'user-cards',
          components: [{ path: 'src/UserCard.tsx' }],
        },
      };

      const result = formatContext(contextWithUI, { format: 'json' });
      const parsed = JSON.parse(result);

      expect(parsed.uiComponents).toBeDefined();
      expect(parsed.uiComponents.group).toBe('user-cards');
      expect(parsed.uiComponents.components).toHaveLength(1);
    });

    it('should handle uiComponents without optional fields', () => {
      const contextWithMinimalUI: SynthesizedContext = {
        ...sampleContext,
        uiComponents: {
          group: 'simple-group',
          components: [{ path: 'src/Component.tsx' }],
        },
      };

      const result = formatContext(contextWithMinimalUI, { format: 'yaml' });

      expect(result).toContain('ui_components:');
      expect(result).toContain('group: simple-group');
      expect(result).not.toContain('warning:');
      expect(result).not.toContain('related:');
    });
  });
});
