/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for MCP meta handlers (help and schema).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleHelp, handleSchema } from '../../../../src/mcp/handlers/meta.js';

// Mock dependencies
vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn(),
}));

import { loadRegistry } from '../../../../src/core/registry/loader.js';

describe('MCP Meta Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(loadRegistry).mockResolvedValue({
      nodes: {
        base: { description: 'Base architecture' },
        'domain.service': { description: 'Domain service', inherits: 'base' },
      },
      mixins: {
        tested: { description: 'Requires tests' },
        srp: { description: 'Single Responsibility' },
      },
    });
  });

  describe('handleHelp', () => {
    it('should return essentials and topic list by default', () => {
      const result = handleHelp({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toBe('ArchCodex MCP Tools');
      expect(parsed.essentials).toBeDefined();
      expect(Array.isArray(parsed.essentials)).toBe(true);
      expect(parsed.topics).toBeDefined();
      expect(Array.isArray(parsed.topics)).toBe(true);
    });

    it('should return full help when full=true', () => {
      const result = handleHelp({ full: true });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toBe('ArchCodex MCP Tools - All Commands');
      expect(parsed.topics).toBeDefined();
      expect(typeof parsed.topics).toBe('object');
      expect(parsed.topics.creating).toBeDefined();
      expect(parsed.topics.validating).toBeDefined();
    });

    it('should return topic details for valid topic', () => {
      const result = handleHelp({ topic: 'creating' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.topic).toBe('creating');
      expect(parsed.description).toBeDefined();
      expect(parsed.tools).toBeDefined();
      expect(Array.isArray(parsed.tools)).toBe(true);
      expect(parsed.seeAlso).toBeDefined();
    });

    it('should return error for unknown topic', () => {
      const result = handleHelp({ topic: 'nonexistent' });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('Unknown topic');
      expect(parsed.availableTopics).toBeDefined();
    });

    it('should be case-insensitive for topics', () => {
      const result = handleHelp({ topic: 'CREATING' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.topic).toBe('CREATING');
      expect(parsed.tools).toBeDefined();
    });

    it('should include examples in tool entries', () => {
      const result = handleHelp({ topic: 'creating' });

      const parsed = JSON.parse(result.content[0].text);
      const discoverTool = parsed.tools.find((t: { name: string }) => t.name === 'archcodex_discover');
      expect(discoverTool).toBeDefined();
      expect(discoverTool.example).toBeDefined();
    });
  });

  describe('handleSchema', () => {
    const projectRoot = '/test/project';

    it('should return all schema data by default', async () => {
      const result = await handleSchema(projectRoot);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.rules).toBeDefined();
      expect(parsed.architectureFields).toBeDefined();
      expect(parsed.constraintFields).toBeDefined();
      expect(parsed.conditions).toBeDefined();
      expect(parsed.mixins).toBeDefined();
      expect(parsed.architectures).toBeDefined();
    });

    it('should return only rules when filter=rules', async () => {
      const result = await handleSchema(projectRoot, { filter: 'rules' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.rules).toBeDefined();
      expect(parsed.architectureFields).toBeUndefined();
      expect(parsed.mixins).toBeUndefined();
    });

    it('should return only fields when filter=fields', async () => {
      const result = await handleSchema(projectRoot, { filter: 'fields' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.architectureFields).toBeDefined();
      expect(parsed.constraintFields).toBeDefined();
      expect(parsed.rules).toBeUndefined();
    });

    it('should return only conditions when filter=conditions', async () => {
      const result = await handleSchema(projectRoot, { filter: 'conditions' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.conditions).toBeDefined();
      expect(parsed.rules).toBeUndefined();
    });

    it('should return only mixins when filter=mixins', async () => {
      const result = await handleSchema(projectRoot, { filter: 'mixins' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.mixins).toBeDefined();
      expect(Array.isArray(parsed.mixins)).toBe(true);
      expect(parsed.rules).toBeUndefined();
    });

    it('should return only architectures when filter=architectures', async () => {
      const result = await handleSchema(projectRoot, { filter: 'architectures' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.architectures).toBeDefined();
      expect(Array.isArray(parsed.architectures)).toBe(true);
      expect(parsed.rules).toBeUndefined();
    });

    it('should return template when template=true', async () => {
      const result = await handleSchema(projectRoot, { template: true });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.template).toBeDefined();
      expect(parsed.rules).toBeUndefined();
    });

    it('should return recipe when valid recipe name provided', async () => {
      const result = await handleSchema(projectRoot, { recipe: 'domain-service' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.name).toBe('domain-service');
      expect(parsed.yaml).toBeDefined();
    });

    it('should return error for unknown recipe', async () => {
      const result = await handleSchema(projectRoot, { recipe: 'nonexistent' });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('not found');
      expect(parsed.available).toBeDefined();
    });

    it('should return architecture examples', async () => {
      const result = await handleSchema(projectRoot, { examples: 'architectures' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.architectures).toBeDefined();
    });

    it('should return constraint examples', async () => {
      const result = await handleSchema(projectRoot, { examples: 'constraints' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.constraints).toBeDefined();
    });

    it('should return recipe examples', async () => {
      const result = await handleSchema(projectRoot, { examples: 'recipes' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.recipes).toBeDefined();
    });

    it('should return all examples', async () => {
      const result = await handleSchema(projectRoot, { examples: 'all' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.architectures).toBeDefined();
      expect(parsed.constraints).toBeDefined();
      expect(parsed.recipes).toBeDefined();
    });

    it('should handle registry loading failure gracefully', async () => {
      vi.mocked(loadRegistry).mockRejectedValue(new Error('Registry not found'));

      const result = await handleSchema(projectRoot, { filter: 'mixins' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.mixins).toEqual([]);
    });

    it('should format mixins with id and description', async () => {
      const result = await handleSchema(projectRoot, { filter: 'mixins' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.mixins).toContainEqual(expect.objectContaining({ id: 'tested' }));
      expect(parsed.mixins).toContainEqual(expect.objectContaining({ id: 'srp' }));
    });

    it('should format architectures with id, inherits, and description', async () => {
      const result = await handleSchema(projectRoot, { filter: 'architectures' });

      const parsed = JSON.parse(result.content[0].text);
      const domainService = parsed.architectures.find((a: { id: string }) => a.id === 'domain.service');
      expect(domainService).toBeDefined();
      expect(domainService.inherits).toBe('base');
      expect(domainService.description).toBe('Domain service');
    });
  });
});
