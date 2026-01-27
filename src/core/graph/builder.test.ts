import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphBuilder } from './builder.js';
import type { Registry } from '../registry/schema.js';

// Mock file system
vi.mock('../../utils/file-system.js', () => ({
  globFiles: vi.fn().mockResolvedValue(['src/test.ts']),
  readFile: vi.fn().mockResolvedValue('/** @arch archcodex.core */'),
}));

const mockRegistry: Registry = {
  nodes: {
    base: {
      description: 'Base architecture',
      rationale: 'Root architecture',
      constraints: [],
      mixins: [],
    },
    'archcodex.core': {
      inherits: 'base',
      description: 'Core layer',
      rationale: 'Core domain logic',
      constraints: [],
      mixins: ['tested'],
    },
    'archcodex.core.engine': {
      inherits: 'archcodex.core',
      description: 'Engine component',
      rationale: 'Use case orchestrators',
      constraints: [],
      mixins: ['srp'],
    },
    tested: {
      description: 'Tested mixin',
      rationale: 'Requires tests',
      constraints: [],
    },
    srp: {
      description: 'SRP mixin',
      rationale: 'Single responsibility',
      constraints: [],
    },
  },
  mixins: {},
};

describe('GraphBuilder', () => {
  let builder: GraphBuilder;

  beforeEach(() => {
    builder = new GraphBuilder('/test/project', mockRegistry);
    vi.clearAllMocks();
  });

  describe('build', () => {
    it('builds a graph from registry', async () => {
      const graph = await builder.build({ showMixins: false });

      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.edges.length).toBeGreaterThan(0);
    });

    it('includes inheritance edges', async () => {
      const graph = await builder.build({ showMixins: false });

      const inheritEdge = graph.edges.find(
        e => e.from === 'base' && e.to === 'archcodex.core' && e.type === 'inherits'
      );
      expect(inheritEdge).toBeDefined();
    });

    it('includes mixin edges when showMixins is true', async () => {
      const graph = await builder.build({ showMixins: true });

      const mixinEdge = graph.edges.find(e => e.type === 'mixin');
      expect(mixinEdge).toBeDefined();
    });

    it('excludes mixin edges when showMixins is false', async () => {
      const graph = await builder.build({ showMixins: false });

      const mixinEdge = graph.edges.find(e => e.type === 'mixin');
      expect(mixinEdge).toBeUndefined();
    });

    it('filters by root when specified', async () => {
      const graph = await builder.build({ root: 'archcodex.core', showMixins: false });

      // Should include archcodex.core and its children
      const coreNode = graph.nodes.find(n => n.id === 'archcodex.core');
      expect(coreNode).toBeDefined();
    });
  });

  describe('format', () => {
    it('formats as mermaid', async () => {
      const graph = await builder.build({ showMixins: false });
      const output = builder.format(graph, 'mermaid');

      expect(output).toContain('graph TD');
      expect(output).toContain('-->');
    });

    it('formats as graphviz', async () => {
      const graph = await builder.build({ showMixins: false });
      const output = builder.format(graph, 'graphviz');

      expect(output).toContain('digraph ArchCodex');
      expect(output).toContain('->');
    });

    it('formats as json', async () => {
      const graph = await builder.build({ showMixins: false });
      const output = builder.format(graph, 'json');

      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('nodes');
      expect(parsed).toHaveProperty('edges');
    });

    it('throws on unknown format', async () => {
      const graph = await builder.build();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Testing invalid input
      expect(() => builder.format(graph, 'unknown' as any)).toThrow('Unknown format');
    });
  });
});
