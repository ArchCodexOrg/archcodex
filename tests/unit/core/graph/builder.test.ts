/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for the GraphBuilder class.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphBuilder } from '../../../../src/core/graph/builder.js';
import type { Registry } from '../../../../src/core/registry/schema.js';

// Mock dependencies
vi.mock('../../../../src/utils/file-system.js', () => ({
  globFiles: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockResolvedValue(''),
}));

vi.mock('../../../../src/core/arch-tag/parser.js', () => ({
  extractArchId: vi.fn().mockReturnValue(null),
}));

describe('GraphBuilder', () => {
  const projectRoot = '/test/project';
  let mockRegistry: Registry;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRegistry = {
      nodes: {
        base: {
          description: 'Base architecture',
        },
        'app.core': {
          description: 'Core module',
          inherits: 'base',
        },
        'app.core.domain': {
          description: 'Domain layer',
          inherits: 'app.core',
          mixins: ['tested'],
        },
        'app.cli': {
          description: 'CLI module',
          inherits: 'base',
        },
      },
      mixins: {
        tested: {
          description: 'Requires tests',
          constraints: [],
        },
      },
    };
  });

  describe('constructor', () => {
    it('should create a GraphBuilder instance', () => {
      const builder = new GraphBuilder(projectRoot, mockRegistry);
      expect(builder).toBeDefined();
    });
  });

  describe('build', () => {
    it('should build graph with nodes and edges', async () => {
      const builder = new GraphBuilder(projectRoot, mockRegistry);
      const graph = await builder.build();

      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.edges.length).toBeGreaterThan(0);
    });

    it('should include inheritance edges', async () => {
      const builder = new GraphBuilder(projectRoot, mockRegistry);
      const graph = await builder.build();

      const inheritEdges = graph.edges.filter(e => e.type === 'inherits');
      expect(inheritEdges.length).toBeGreaterThan(0);
    });

    it('should include mixin edges when showMixins is true', async () => {
      const builder = new GraphBuilder(projectRoot, mockRegistry);
      const graph = await builder.build({ showMixins: true });

      const mixinEdges = graph.edges.filter(e => e.type === 'mixin');
      expect(mixinEdges.length).toBeGreaterThan(0);
    });

    it('should exclude mixin edges when showMixins is false', async () => {
      const builder = new GraphBuilder(projectRoot, mockRegistry);
      const graph = await builder.build({ showMixins: false });

      const mixinEdges = graph.edges.filter(e => e.type === 'mixin');
      expect(mixinEdges.length).toBe(0);
    });

    it('should filter by root when specified', async () => {
      const builder = new GraphBuilder(projectRoot, mockRegistry);
      const graph = await builder.build({ root: 'app.core' });

      const nodeIds = graph.nodes.map(n => n.id);
      expect(nodeIds).toContain('app.core');
      expect(nodeIds).toContain('app.core.domain');
    });
  });

  describe('format', () => {
    it('should format graph as mermaid', async () => {
      const builder = new GraphBuilder(projectRoot, mockRegistry);
      const graph = await builder.build();
      const output = builder.format(graph, 'mermaid');

      expect(output).toContain('graph TD');
      expect(output).toContain('-->');
    });

    it('should format graph as graphviz', async () => {
      const builder = new GraphBuilder(projectRoot, mockRegistry);
      const graph = await builder.build();
      const output = builder.format(graph, 'graphviz');

      expect(output).toContain('digraph');
      expect(output).toContain('->');
    });

    it('should format graph as json', async () => {
      const builder = new GraphBuilder(projectRoot, mockRegistry);
      const graph = await builder.build();
      const output = builder.format(graph, 'json');

      const parsed = JSON.parse(output);
      expect(parsed.nodes).toBeDefined();
      expect(parsed.edges).toBeDefined();
    });

    it('should throw for unknown format', async () => {
      const builder = new GraphBuilder(projectRoot, mockRegistry);
      const graph = await builder.build();

      expect(() => builder.format(graph, 'unknown' as any)).toThrow('Unknown format');
    });
  });
});
