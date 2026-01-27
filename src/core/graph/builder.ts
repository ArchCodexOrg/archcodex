/**
 * @arch archcodex.core.engine
 * @intent:stateless
 */
import * as path from 'node:path';
import { globFiles, readFile } from '../../utils/file-system.js';
import { extractArchId } from '../arch-tag/parser.js';
import type { Registry, ArchitectureNode } from '../registry/schema.js';
import type {
  ArchitectureGraph,
  GraphNode,
  GraphEdge,
  GraphOptions,
  GraphFormat,
} from './types.js';

/**
 * Default graph options.
 */
const DEFAULT_OPTIONS: Required<GraphOptions> = {
  format: 'mermaid',
  showFiles: false,
  showMixins: true,
  root: '',
  maxDepth: Infinity,
};

/**
 * Builds architecture graphs from registry data.
 */
export class GraphBuilder {
  private projectRoot: string;
  private registry: Registry;

  constructor(projectRoot: string, registry: Registry) {
    this.projectRoot = projectRoot;
    this.registry = registry;
  }

  /**
   * Build the architecture graph.
   */
  async build(options: GraphOptions = {}): Promise<ArchitectureGraph> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeSet = new Set<string>();

    // Get file usage if needed
    const fileUsage = opts.showFiles ? await this.scanFileUsage() : new Map<string, string[]>();

    // Collect architectures to include
    const archIds = this.getArchitectureIds(opts.root, opts.maxDepth);

    // Build nodes and edges for architectures
    for (const archId of archIds) {
      const arch = this.registry.nodes[archId];
      if (!arch) continue;

      // Add node
      if (!nodeSet.has(archId)) {
        nodeSet.add(archId);
        const files = fileUsage.get(archId) || [];
        nodes.push({
          id: archId,
          label: this.getLabel(archId),
          type: 'architecture',
          fileCount: files.length,
          files: opts.showFiles ? files : undefined,
        });
      }

      // Add inheritance edge
      if (arch.inherits) {
        const parentId = arch.inherits;
        edges.push({
          from: parentId,
          to: archId,
          type: 'inherits',
        });

        // Ensure parent node exists
        if (!nodeSet.has(parentId)) {
          nodeSet.add(parentId);
          const files = fileUsage.get(parentId) || [];
          nodes.push({
            id: parentId,
            label: this.getLabel(parentId),
            type: 'architecture',
            fileCount: files.length,
            files: opts.showFiles ? files : undefined,
          });
        }
      }

      // Add mixin edges
      if (opts.showMixins && arch.mixins) {
        for (const mixinId of arch.mixins) {
          edges.push({
            from: mixinId,
            to: archId,
            type: 'mixin',
          });

          // Add mixin node
          if (!nodeSet.has(mixinId)) {
            nodeSet.add(mixinId);
            nodes.push({
              id: mixinId,
              label: mixinId,
              type: 'mixin',
            });
          }
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * Format graph as string output.
   */
  format(graph: ArchitectureGraph, format: GraphFormat): string {
    switch (format) {
      case 'mermaid':
        return this.formatMermaid(graph);
      case 'graphviz':
        return this.formatGraphviz(graph);
      case 'json':
        return JSON.stringify(graph, null, 2);
      default:
        throw new Error(`Unknown format: ${format}`);
    }
  }

  /**
   * Get architecture IDs to include, optionally filtered by root.
   */
  private getArchitectureIds(root: string, maxDepth: number): string[] {
    const allIds = Object.keys(this.registry.nodes);

    if (!root) {
      return allIds;
    }

    // Filter to architectures under the root
    const result: string[] = [];
    const visited = new Set<string>();

    const traverse = (id: string, depth: number): void => {
      if (visited.has(id) || depth > maxDepth) return;
      visited.add(id);

      if (id.startsWith(root) || id === root) {
        result.push(id);
      }

      // Find children (architectures that inherit from this one)
      for (const [childId, childArch] of Object.entries(this.registry.nodes)) {
        if ((childArch as ArchitectureNode).inherits === id) {
          traverse(childId, depth + 1);
        }
      }
    };

    traverse(root, 0);
    return result;
  }

  /**
   * Get short label from architecture ID.
   */
  private getLabel(archId: string): string {
    const parts = archId.split('.');
    return parts[parts.length - 1];
  }

  /**
   * Scan project files to find which architectures are used.
   */
  private async scanFileUsage(): Promise<Map<string, string[]>> {
    const usage = new Map<string, string[]>();

    const files = await globFiles(['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'], {
      cwd: this.projectRoot,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/*.d.ts'],
      absolute: false,
    });

    for (const filePath of files) {
      const absolutePath = path.resolve(this.projectRoot, filePath);
      try {
        const content = await readFile(absolutePath);
        const archId = extractArchId(content);

        if (archId) {
          const existing = usage.get(archId) || [];
          existing.push(filePath);
          usage.set(archId, existing);
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return usage;
  }

  /**
   * Format graph as Mermaid diagram.
   */
  private formatMermaid(graph: ArchitectureGraph): string {
    const lines: string[] = ['graph TD'];

    // Add edges
    for (const edge of graph.edges) {
      const fromSafe = this.sanitizeId(edge.from);
      const toSafe = this.sanitizeId(edge.to);
      const fromLabel = this.getLabel(edge.from);
      const toLabel = this.getLabel(edge.to);

      if (edge.type === 'inherits') {
        lines.push(`    ${fromSafe}[${fromLabel}] --> ${toSafe}[${toLabel}]`);
      } else {
        // Mixin relationship - use dotted line
        lines.push(`    ${fromSafe}([${fromLabel}]) -.-> ${toSafe}[${toLabel}]`);
      }
    }

    // Add file counts as comments if available
    for (const node of graph.nodes) {
      if (node.fileCount && node.fileCount > 0) {
        lines.push(`    %% ${node.id}: ${node.fileCount} files`);
      }
    }

    // Add styling
    lines.push('');
    lines.push('    classDef mixin fill:#e1f5fe,stroke:#01579b');
    lines.push('    classDef arch fill:#f3e5f5,stroke:#4a148c');

    // Apply classes
    const archNodes = graph.nodes.filter(n => n.type === 'architecture').map(n => this.sanitizeId(n.id));
    const mixinNodeIds = graph.nodes.filter(n => n.type === 'mixin').map(n => this.sanitizeId(n.id));

    if (archNodes.length > 0) {
      lines.push(`    class ${archNodes.join(',')} arch`);
    }
    if (mixinNodeIds.length > 0) {
      lines.push(`    class ${mixinNodeIds.join(',')} mixin`);
    }

    return lines.join('\n');
  }

  /**
   * Format graph as Graphviz DOT.
   */
  private formatGraphviz(graph: ArchitectureGraph): string {
    const lines: string[] = [
      'digraph ArchCodex {',
      '    rankdir=TB;',
      '    node [shape=box, style=filled];',
      '',
    ];

    // Define nodes
    for (const node of graph.nodes) {
      const id = this.sanitizeId(node.id);
      const label = node.label;
      const fillColor = node.type === 'mixin' ? '#e1f5fe' : '#f3e5f5';
      const shape = node.type === 'mixin' ? 'ellipse' : 'box';

      let nodeLabel = label;
      if (node.fileCount && node.fileCount > 0) {
        nodeLabel += `\\n(${node.fileCount} files)`;
      }

      lines.push(`    ${id} [label="${nodeLabel}", fillcolor="${fillColor}", shape=${shape}];`);
    }

    lines.push('');

    // Define edges
    for (const edge of graph.edges) {
      const from = this.sanitizeId(edge.from);
      const to = this.sanitizeId(edge.to);
      const style = edge.type === 'mixin' ? ', style=dashed' : '';

      lines.push(`    ${from} -> ${to}[${style}];`);
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Sanitize ID for use in Mermaid/Graphviz.
   */
  private sanitizeId(id: string): string {
    return id.replace(/[.-]/g, '_');
  }
}
