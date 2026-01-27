/**
 * @arch extension.client.panel
 *
 * Import Graph WebView Panel
 *
 * Displays a D3.js force-directed graph of import relationships.
 */
import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { parse as parseYaml } from 'yaml';
import type {
  D3Node,
  D3Link,
  D3GraphData,
  ImportGraphNode,
  CyclePath,
  LayerConfig,
} from './import-graph-types.js';
import {
  getLoadingHtml,
  getErrorHtml,
  getGraphHtml,
} from './import-graph-html.js';

/**
 * Manages the Import Graph WebView panel.
 */
export class ImportGraphPanel {
  public static currentPanel: ImportGraphPanel | undefined;
  private static readonly viewType = 'archcodexImportGraph';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly projectRoot: string;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    projectRoot: string
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.projectRoot = projectRoot;

    // Set initial content
    this.panel.webview.html = getLoadingHtml();

    // Handle panel disposal
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      null,
      this.disposables
    );
  }

  /**
   * Create or show the import graph panel.
   */
  public static async createOrShow(
    extensionUri: vscode.Uri,
    projectRoot: string
  ): Promise<ImportGraphPanel> {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If panel exists, reveal it
    if (ImportGraphPanel.currentPanel) {
      ImportGraphPanel.currentPanel.panel.reveal(column);
      return ImportGraphPanel.currentPanel;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      ImportGraphPanel.viewType,
      'Import Graph',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    ImportGraphPanel.currentPanel = new ImportGraphPanel(panel, extensionUri, projectRoot);
    return ImportGraphPanel.currentPanel;
  }

  /**
   * Update the graph with new data.
   */
  public async updateGraph(): Promise<void> {
    try {
      this.panel.webview.html = getLoadingHtml();
      const graphData = await this.buildGraphData();
      this.panel.webview.html = getGraphHtml(graphData);
    } catch (error) {
      this.panel.webview.html = getErrorHtml(
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Build graph data from the project.
   */
  private async buildGraphData(): Promise<D3GraphData> {
    const layers = await this.loadLayers();

    const { ProjectAnalyzer } = await import(
      '../../../src/core/imports/analyzer.js'
    );

    const analyzer = new ProjectAnalyzer(this.projectRoot);
    const result = await analyzer.buildImportGraph();

    const maxNodes = vscode.workspace
      .getConfiguration('archcodex')
      .get<number>('graph.maxNodes', 500);

    const d3Data = this.convertToD3Format(result.graph, result.cycles, layers, maxNodes);

    analyzer.dispose();
    return d3Data;
  }

  /**
   * Load layer configuration.
   */
  private async loadLayers(): Promise<Map<string, LayerConfig>> {
    const configPath = path.join(this.projectRoot, '.arch', 'config.yaml');
    const layers = new Map<string, LayerConfig>();

    try {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = parseYaml(content) as { layers?: LayerConfig[] };

        if (config.layers && Array.isArray(config.layers)) {
          for (const layerConfig of config.layers) {
            if (layerConfig.name && layerConfig.paths) {
              layers.set(layerConfig.name, layerConfig);
            }
          }
        }
      }
    } catch {
      // Ignore errors
    }

    return layers;
  }

  /**
   * Convert ImportGraph to D3 format.
   */
  private convertToD3Format(
    graph: { nodes: Map<string, ImportGraphNode> },
    cycles: CyclePath[],
    layers: Map<string, LayerConfig>,
    maxNodes: number
  ): D3GraphData {
    // Build set of files in cycles
    const filesInCycles = new Set<string>();
    const cycleEdges = new Set<string>();

    for (const cycle of cycles) {
      for (let i = 0; i < cycle.files.length - 1; i++) {
        filesInCycles.add(cycle.files[i]);
        cycleEdges.add(`${cycle.files[i]}|${cycle.files[i + 1]}`);
      }
    }

    // Sort nodes by connection count for prioritization
    const sortedNodes = Array.from(graph.nodes.entries()).sort((a, b) => {
      const aConnections = a[1].imports.length + (Array.isArray(a[1].importedBy) ? a[1].importedBy.length : a[1].importedBy.size);
      const bConnections = b[1].imports.length + (Array.isArray(b[1].importedBy) ? b[1].importedBy.length : b[1].importedBy.size);
      return bConnections - aConnections;
    });

    const selectedNodes = new Map(sortedNodes.slice(0, maxNodes));
    const layerColors = this.generateLayerColors(layers);

    // Convert nodes
    const d3Nodes: D3Node[] = [];
    for (const [filePath, node] of selectedNodes) {
      const relativePath = path.relative(this.projectRoot, filePath);
      const layer = this.findLayer(relativePath, layers);
      const importedByCount = Array.isArray(node.importedBy)
        ? node.importedBy.length
        : node.importedBy.size;

      d3Nodes.push({
        id: filePath,
        label: path.basename(filePath),
        archId: node.archId,
        layer,
        importCount: node.imports.length,
        importedByCount,
        inCycle: filesInCycles.has(filePath),
      });
    }

    // Convert links
    const d3Links: D3Link[] = [];
    for (const [filePath, node] of selectedNodes) {
      for (const importedPath of node.imports) {
        if (selectedNodes.has(importedPath)) {
          d3Links.push({
            source: filePath,
            target: importedPath,
            inCycle: cycleEdges.has(`${filePath}|${importedPath}`),
          });
        }
      }
    }

    return {
      nodes: d3Nodes,
      links: d3Links,
      layers: Array.from(layerColors.entries()).map(([name, color]) => ({
        name,
        color,
      })),
    };
  }

  /**
   * Find which layer a file belongs to.
   */
  private findLayer(
    relativePath: string,
    layers: Map<string, LayerConfig>
  ): string | null {
    const { minimatch } = require('minimatch');

    for (const [layerName, config] of layers) {
      if (!config.paths) continue;
      for (const pattern of config.paths) {
        if (minimatch(relativePath, pattern)) {
          return layerName;
        }
      }
    }
    return null;
  }

  /**
   * Generate colors for layers.
   */
  private generateLayerColors(layers: Map<string, LayerConfig>): Map<string, string> {
    const colors = [
      '#4CAF50', '#2196F3', '#FF9800', '#9C27B0',
      '#00BCD4', '#E91E63', '#CDDC39', '#795548',
    ];

    const layerColors = new Map<string, string>();
    let i = 0;

    for (const name of layers.keys()) {
      layerColors.set(name, colors[i % colors.length]);
      i++;
    }

    return layerColors;
  }

  /**
   * Handle messages from webview.
   */
  private handleMessage(message: { command: string; filePath?: string }): void {
    switch (message.command) {
      case 'openFile':
        if (message.filePath) {
          const uri = vscode.Uri.file(message.filePath);
          vscode.window.showTextDocument(uri);
        }
        break;
      case 'refresh':
        this.updateGraph();
        break;
    }
  }

  /**
   * Dispose resources.
   */
  public dispose(): void {
    ImportGraphPanel.currentPanel = undefined;
    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
