/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for core MCP tool definitions.
 * Validates structure, uniqueness, and JSON Schema compliance of tool definitions.
 */
import { describe, it, expect } from 'vitest';
import { coreToolDefinitions, projectRootProperty } from '../../../src/mcp/tool-definitions.js';

describe('coreToolDefinitions', () => {
  describe('structure', () => {
    it('should export a non-empty array of tool definitions', () => {
      expect(Array.isArray(coreToolDefinitions)).toBe(true);
      expect(coreToolDefinitions.length).toBeGreaterThan(0);
    });

    it('every tool should have name, description, and inputSchema', () => {
      for (const tool of coreToolDefinitions) {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.description).toBe('string');
        expect(typeof tool.inputSchema).toBe('object');
      }
    });

    it('every tool name should start with "archcodex_"', () => {
      for (const tool of coreToolDefinitions) {
        expect(tool.name).toMatch(/^archcodex_/);
      }
    });

    it('every tool description should be non-empty', () => {
      for (const tool of coreToolDefinitions) {
        expect(tool.description.trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe('uniqueness', () => {
    it('should not have duplicate tool names', () => {
      const names = coreToolDefinitions.map(t => t.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });

  describe('JSON Schema compliance', () => {
    it('every inputSchema should have type "object"', () => {
      for (const tool of coreToolDefinitions) {
        expect(tool.inputSchema.type).toBe('object');
      }
    });

    it('every inputSchema should have a properties object', () => {
      for (const tool of coreToolDefinitions) {
        expect(tool.inputSchema).toHaveProperty('properties');
        expect(typeof tool.inputSchema.properties).toBe('object');
      }
    });

    it('required fields should be an array of strings when present', () => {
      for (const tool of coreToolDefinitions) {
        if ('required' in tool.inputSchema) {
          expect(Array.isArray(tool.inputSchema.required)).toBe(true);
          for (const req of tool.inputSchema.required) {
            expect(typeof req).toBe('string');
          }
        }
      }
    });

    it('required fields should reference properties that exist', () => {
      for (const tool of coreToolDefinitions) {
        if ('required' in tool.inputSchema && Array.isArray(tool.inputSchema.required)) {
          const propertyNames = Object.keys(tool.inputSchema.properties);
          for (const req of tool.inputSchema.required) {
            expect(propertyNames).toContain(req);
          }
        }
      }
    });

    it('each property should have a type or oneOf/enum definition', () => {
      for (const tool of coreToolDefinitions) {
        for (const [propName, propDef] of Object.entries(tool.inputSchema.properties)) {
          const def = propDef as Record<string, unknown>;
          const hasTypeInfo =
            'type' in def ||
            'oneOf' in def ||
            'enum' in def;
          expect(hasTypeInfo).toBe(true);
        }
      }
    });

    it('each property should have a description', () => {
      for (const tool of coreToolDefinitions) {
        for (const [propName, propDef] of Object.entries(tool.inputSchema.properties)) {
          const def = propDef as Record<string, unknown>;
          expect(def).toHaveProperty('description');
          expect(typeof def.description).toBe('string');
        }
      }
    });
  });

  describe('known tools', () => {
    const expectedTools = [
      'archcodex_help',
      'archcodex_schema',
      'archcodex_check',
      'archcodex_read',
      'archcodex_discover',
      'archcodex_resolve',
      'archcodex_neighborhood',
      'archcodex_diff_arch',
      'archcodex_health',
      'archcodex_sync_index',
      'archcodex_consistency',
      'archcodex_intents',
      'archcodex_action',
      'archcodex_feature',
      'archcodex_types',
    ];

    it('should contain all expected core tools', () => {
      const names = coreToolDefinitions.map(t => t.name);
      for (const expected of expectedTools) {
        expect(names).toContain(expected);
      }
    });
  });

  describe('specific tool schemas', () => {
    it('archcodex_discover should require "query"', () => {
      const tool = coreToolDefinitions.find(t => t.name === 'archcodex_discover');
      expect(tool).toBeDefined();
      expect(tool!.inputSchema.required).toContain('query');
    });

    it('archcodex_resolve should require "archId"', () => {
      const tool = coreToolDefinitions.find(t => t.name === 'archcodex_resolve');
      expect(tool).toBeDefined();
      expect(tool!.inputSchema.required).toContain('archId');
    });

    it('archcodex_neighborhood should require "file"', () => {
      const tool = coreToolDefinitions.find(t => t.name === 'archcodex_neighborhood');
      expect(tool).toBeDefined();
      expect(tool!.inputSchema.required).toContain('file');
    });

    it('archcodex_diff_arch should require "from" and "to"', () => {
      const tool = coreToolDefinitions.find(t => t.name === 'archcodex_diff_arch');
      expect(tool).toBeDefined();
      expect(tool!.inputSchema.required).toContain('from');
      expect(tool!.inputSchema.required).toContain('to');
    });

    it('archcodex_consistency should require "file"', () => {
      const tool = coreToolDefinitions.find(t => t.name === 'archcodex_consistency');
      expect(tool).toBeDefined();
      expect(tool!.inputSchema.required).toContain('file');
    });

    it('archcodex_check should support both files array and single file', () => {
      const tool = coreToolDefinitions.find(t => t.name === 'archcodex_check');
      expect(tool).toBeDefined();
      const props = tool!.inputSchema.properties;
      expect(props).toHaveProperty('files');
      expect(props).toHaveProperty('file');
      expect(props).toHaveProperty('path');
    });

    it('archcodex_help should have topic enum', () => {
      const tool = coreToolDefinitions.find(t => t.name === 'archcodex_help');
      expect(tool).toBeDefined();
      const topicProp = tool!.inputSchema.properties.topic as Record<string, unknown>;
      expect(topicProp).toHaveProperty('enum');
      expect(Array.isArray(topicProp.enum)).toBe(true);
      expect((topicProp.enum as string[]).length).toBeGreaterThan(0);
    });

    it('archcodex_schema should have filter and examples enums', () => {
      const tool = coreToolDefinitions.find(t => t.name === 'archcodex_schema');
      expect(tool).toBeDefined();
      const filterProp = tool!.inputSchema.properties.filter as Record<string, unknown>;
      const examplesProp = tool!.inputSchema.properties.examples as Record<string, unknown>;
      expect(filterProp).toHaveProperty('enum');
      expect(examplesProp).toHaveProperty('enum');
    });
  });

  describe('projectRootProperty', () => {
    it('should be an object with type and description', () => {
      expect(projectRootProperty).toHaveProperty('type', 'string');
      expect(projectRootProperty).toHaveProperty('description');
      expect(typeof projectRootProperty.description).toBe('string');
    });

    it('should be referenced in every tool inputSchema', () => {
      for (const tool of coreToolDefinitions) {
        // archcodex_help may not need projectRoot
        if (tool.name === 'archcodex_help') continue;
        expect(tool.inputSchema.properties).toHaveProperty('projectRoot');
      }
    });
  });
});
