/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for extended MCP tool definitions.
 * Validates structure, uniqueness, and JSON Schema compliance of extended tool definitions.
 */
import { describe, it, expect } from 'vitest';
import { extendedToolDefinitions } from '../../../src/mcp/tool-definitions-extended.js';
import { coreToolDefinitions } from '../../../src/mcp/tool-definitions.js';

describe('extendedToolDefinitions', () => {
  describe('structure', () => {
    it('should export a non-empty array of tool definitions', () => {
      expect(Array.isArray(extendedToolDefinitions)).toBe(true);
      expect(extendedToolDefinitions.length).toBeGreaterThan(0);
    });

    it('every tool should have name, description, and inputSchema', () => {
      for (const tool of extendedToolDefinitions) {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.description).toBe('string');
        expect(typeof tool.inputSchema).toBe('object');
      }
    });

    it('every tool name should start with "archcodex_"', () => {
      for (const tool of extendedToolDefinitions) {
        expect(tool.name).toMatch(/^archcodex_/);
      }
    });

    it('every tool description should be non-empty', () => {
      for (const tool of extendedToolDefinitions) {
        expect(tool.description.trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe('uniqueness', () => {
    it('should not have duplicate tool names within extended definitions', () => {
      const names = extendedToolDefinitions.map(t => t.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('should not overlap with core tool names', () => {
      const coreNames = new Set(coreToolDefinitions.map(t => t.name));
      const extendedNames = extendedToolDefinitions.map(t => t.name);
      for (const name of extendedNames) {
        expect(coreNames.has(name)).toBe(false);
      }
    });
  });

  describe('JSON Schema compliance', () => {
    it('every inputSchema should have type "object"', () => {
      for (const tool of extendedToolDefinitions) {
        expect(tool.inputSchema.type).toBe('object');
      }
    });

    it('every inputSchema should have a properties object', () => {
      for (const tool of extendedToolDefinitions) {
        expect(tool.inputSchema).toHaveProperty('properties');
        expect(typeof tool.inputSchema.properties).toBe('object');
      }
    });

    it('required fields should be an array of strings when present', () => {
      for (const tool of extendedToolDefinitions) {
        if ('required' in tool.inputSchema) {
          expect(Array.isArray(tool.inputSchema.required)).toBe(true);
          for (const req of tool.inputSchema.required) {
            expect(typeof req).toBe('string');
          }
        }
      }
    });

    it('required fields should reference properties that exist', () => {
      for (const tool of extendedToolDefinitions) {
        if ('required' in tool.inputSchema && Array.isArray(tool.inputSchema.required)) {
          const propertyNames = Object.keys(tool.inputSchema.properties);
          for (const req of tool.inputSchema.required) {
            expect(propertyNames).toContain(req);
          }
        }
      }
    });

    it('each property should have a type or oneOf/enum definition', () => {
      for (const tool of extendedToolDefinitions) {
        for (const [, propDef] of Object.entries(tool.inputSchema.properties)) {
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
      for (const tool of extendedToolDefinitions) {
        for (const [, propDef] of Object.entries(tool.inputSchema.properties)) {
          const def = propDef as Record<string, unknown>;
          expect(def).toHaveProperty('description');
          expect(typeof def.description).toBe('string');
        }
      }
    });
  });

  describe('known extended tools', () => {
    const expectedTools = [
      'archcodex_scaffold',
      'archcodex_infer',
      'archcodex_why',
      'archcodex_decide',
      'archcodex_session_context',
      'archcodex_plan_context',
      'archcodex_validate_plan',
      'archcodex_impact',
      'archcodex_entity_context',
      'archcodex_map',
      'archcodex_context',
      'archcodex_spec_init',
      'archcodex_spec_scaffold_touchpoints',
      'archcodex_feature_audit',
      'archcodex_analyze',
    ];

    it('should contain all expected extended tools', () => {
      const names = extendedToolDefinitions.map(t => t.name);
      for (const expected of expectedTools) {
        expect(names).toContain(expected);
      }
    });
  });

  describe('specific tool schemas', () => {
    it('archcodex_scaffold should require "archId" and "name"', () => {
      const tool = extendedToolDefinitions.find(t => t.name === 'archcodex_scaffold');
      expect(tool).toBeDefined();
      expect(tool!.inputSchema.required).toContain('archId');
      expect(tool!.inputSchema.required).toContain('name');
    });

    it('archcodex_infer should require "files"', () => {
      const tool = extendedToolDefinitions.find(t => t.name === 'archcodex_infer');
      expect(tool).toBeDefined();
      expect(tool!.inputSchema.required).toContain('files');
    });

    it('archcodex_why should require "file"', () => {
      const tool = extendedToolDefinitions.find(t => t.name === 'archcodex_why');
      expect(tool).toBeDefined();
      expect(tool!.inputSchema.required).toContain('file');
    });

    it('archcodex_validate_plan should require "changes"', () => {
      const tool = extendedToolDefinitions.find(t => t.name === 'archcodex_validate_plan');
      expect(tool).toBeDefined();
      expect(tool!.inputSchema.required).toContain('changes');
    });

    it('archcodex_impact should require "file"', () => {
      const tool = extendedToolDefinitions.find(t => t.name === 'archcodex_impact');
      expect(tool).toBeDefined();
      expect(tool!.inputSchema.required).toContain('file');
    });

    it('archcodex_spec_scaffold_touchpoints should require "specId" and "entity"', () => {
      const tool = extendedToolDefinitions.find(t => t.name === 'archcodex_spec_scaffold_touchpoints');
      expect(tool).toBeDefined();
      expect(tool!.inputSchema.required).toContain('specId');
      expect(tool!.inputSchema.required).toContain('entity');
    });

    it('archcodex_context should support module, entity, format, and sections', () => {
      const tool = extendedToolDefinitions.find(t => t.name === 'archcodex_context');
      expect(tool).toBeDefined();
      const props = tool!.inputSchema.properties;
      expect(props).toHaveProperty('module');
      expect(props).toHaveProperty('entity');
      expect(props).toHaveProperty('format');
      expect(props).toHaveProperty('sections');
    });

    it('archcodex_context format should have correct enum values', () => {
      const tool = extendedToolDefinitions.find(t => t.name === 'archcodex_context');
      expect(tool).toBeDefined();
      const formatProp = tool!.inputSchema.properties.format as Record<string, unknown>;
      expect(formatProp.enum).toEqual(['compact', 'full', 'json']);
    });

    it('archcodex_decide action should have correct enum values', () => {
      const tool = extendedToolDefinitions.find(t => t.name === 'archcodex_decide');
      expect(tool).toBeDefined();
      const actionProp = tool!.inputSchema.properties.action as Record<string, unknown>;
      expect(actionProp.enum).toEqual(['start', 'answer', 'show-tree']);
    });

    it('archcodex_analyze severity should have correct enum values', () => {
      const tool = extendedToolDefinitions.find(t => t.name === 'archcodex_analyze');
      expect(tool).toBeDefined();
      const severityProp = tool!.inputSchema.properties.severity as Record<string, unknown>;
      expect(severityProp.enum).toEqual(['error', 'warning', 'info']);
    });

    it('archcodex_validate_plan changes items should have action enum', () => {
      const tool = extendedToolDefinitions.find(t => t.name === 'archcodex_validate_plan');
      expect(tool).toBeDefined();
      const changesSchema = tool!.inputSchema.properties.changes as Record<string, unknown>;
      const itemsSchema = changesSchema.items as Record<string, unknown>;
      const actionProp = (itemsSchema.properties as Record<string, Record<string, unknown>>).action;
      expect(actionProp.enum).toEqual(['create', 'modify', 'delete', 'rename']);
    });
  });

  describe('projectRoot usage', () => {
    it('every extended tool should include projectRoot property', () => {
      for (const tool of extendedToolDefinitions) {
        expect(tool.inputSchema.properties).toHaveProperty('projectRoot');
      }
    });
  });
});
