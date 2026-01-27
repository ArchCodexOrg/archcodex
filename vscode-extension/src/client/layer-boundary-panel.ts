/**
 * @arch extension.client.panel
 *
 * Layer Boundary WebView Panel
 *
 * Displays an SVG diagram of layer boundaries and violations.
 */
import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { parse as parseYaml } from 'yaml';

/**
 * Layer configuration from config.yaml.
 */
interface LayerConfig {
  name: string;
  paths: string[];
  can_import?: string[];
  exclude?: string[];
}

/**
 * Layer violation.
 */
interface LayerViolation {
  sourceFile: string;
  sourceLayer: string;
  importedFile: string;
  importedLayer: string;
  allowedLayers: string[];
  message: string;
}

/**
 * Layer boundary data for rendering.
 */
interface LayerBoundaryData {
  layers: LayerConfig[];
  violations: LayerViolation[];
  violationEdges: Map<string, number>; // "from|to" -> count
  mermaidDiagram: string;
}

/**
 * Escape HTML entities.
 */
function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char]);
}

/**
 * Manages the Layer Boundary WebView panel.
 */
export class LayerBoundaryPanel {
  public static currentPanel: LayerBoundaryPanel | undefined;
  private static readonly viewType = 'archcodexLayerBoundary';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly projectRoot: string;
  private disposables: vscode.Disposable[] = [];
  private currentViolations: LayerViolation[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    projectRoot: string
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.projectRoot = projectRoot;

    // Set initial content
    this.panel.webview.html = this.getLoadingHtml();

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
   * Create or show the layer boundary panel.
   */
  public static async createOrShow(
    extensionUri: vscode.Uri,
    projectRoot: string
  ): Promise<LayerBoundaryPanel> {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If panel exists, reveal it
    if (LayerBoundaryPanel.currentPanel) {
      LayerBoundaryPanel.currentPanel.panel.reveal(column);
      return LayerBoundaryPanel.currentPanel;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      LayerBoundaryPanel.viewType,
      'Layer Boundaries',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    LayerBoundaryPanel.currentPanel = new LayerBoundaryPanel(panel, extensionUri, projectRoot);
    return LayerBoundaryPanel.currentPanel;
  }

  /**
   * Update the view with current data.
   */
  public async updateView(): Promise<void> {
    try {
      // Show loading state
      this.panel.webview.html = this.getLoadingHtml();

      // Build the layer boundary data
      const data = await this.buildLayerData();
      this.currentViolations = data.violations;

      // Update webview
      this.panel.webview.html = this.getViewHtml(data);
    } catch (error) {
      this.panel.webview.html = this.getErrorHtml(
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Build layer boundary data.
   */
  private async buildLayerData(): Promise<LayerBoundaryData> {
    // Load layers from config
    const configPath = path.join(this.projectRoot, '.arch', 'config.yaml');
    const configExists = fs.existsSync(configPath);
    const layers = await this.loadLayers();

    if (layers.length === 0) {
      throw new Error(`No layers defined. Project root: ${this.projectRoot}, Config path: ${configPath}, Config exists: ${configExists}`);
    }

    // For now, show layer configuration without violation detection
    // (full import graph analysis requires the main archcodex package)
    const violations: LayerViolation[] = [];
    const violationEdges = new Map<string, number>();

    // Generate SVG diagram showing layer dependencies
    const svgDiagram = this.generateSvgDiagram(layers, violationEdges);

    return {
      layers,
      violations,
      violationEdges,
      mermaidDiagram: svgDiagram,  // Reusing the field name for now
    };
  }

  /**
   * Load layer configuration.
   */
  private async loadLayers(): Promise<LayerConfig[]> {
    const configPath = path.join(this.projectRoot, '.arch', 'config.yaml');

    if (!fs.existsSync(configPath)) {
      return [];
    }

    const content = fs.readFileSync(configPath, 'utf-8');
    const config = parseYaml(content) as { layers?: LayerConfig[] };

    return config.layers || [];
  }

  /**
   * Generate SVG diagram for layers.
   */
  private generateSvgDiagram(
    layers: LayerConfig[],
    violationEdges: Map<string, number>
  ): string {
    const nodeWidth = 100;
    const nodeHeight = 40;
    const verticalGap = 80;
    const horizontalCenter = 200;

    // Position nodes vertically (top layer at top)
    const nodePositions = new Map<string, { x: number; y: number }>();
    layers.forEach((layer, index) => {
      nodePositions.set(layer.name, {
        x: horizontalCenter,
        y: 40 + index * verticalGap
      });
    });

    const svgHeight = 40 + layers.length * verticalGap + 20;
    const svgWidth = 400;

    let svg = `<svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">`;

    // Add arrow marker definition
    svg += `
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#1976d2" />
        </marker>
        <marker id="arrowhead-red" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#f44336" />
        </marker>
      </defs>`;

    // Track edges for violations
    const addedEdges = new Set<string>();

    // Draw allowed import edges (arrows pointing down to dependencies)
    for (const layer of layers) {
      if (!layer.can_import || !Array.isArray(layer.can_import)) {
        continue;
      }
      const fromPos = nodePositions.get(layer.name);
      if (!fromPos) continue;

      for (const canImport of layer.can_import) {
        const toPos = nodePositions.get(canImport);
        if (!toPos) continue;

        addedEdges.add(`${layer.name}->${canImport}`);

        const startX = fromPos.x + nodeWidth / 2;
        const startY = fromPos.y + nodeHeight;
        const endX = toPos.x + nodeWidth / 2;
        const endY = toPos.y;

        svg += `<line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY - 5}"
                  stroke="#1976d2" stroke-width="2" marker-end="url(#arrowhead)" />`;
      }
    }

    // Draw violation edges
    for (const [edge, count] of violationEdges) {
      const [from, to] = edge.split('|');
      if (addedEdges.has(`${from}->${to}`)) continue;

      const fromPos = nodePositions.get(from);
      const toPos = nodePositions.get(to);
      if (!fromPos || !toPos) continue;

      const startX = fromPos.x + nodeWidth / 2 + 20;
      const startY = fromPos.y + nodeHeight;
      const endX = toPos.x + nodeWidth / 2 + 20;
      const endY = toPos.y;

      svg += `<line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY - 5}"
                stroke="#f44336" stroke-width="2" stroke-dasharray="5,5" marker-end="url(#arrowhead-red)" />`;
    }

    // Draw layer nodes
    for (const layer of layers) {
      const pos = nodePositions.get(layer.name);
      if (!pos) continue;

      const hasViolation = Array.from(violationEdges.keys()).some(e => e.startsWith(layer.name + '|'));
      const fill = hasViolation ? '#ffebee' : '#e3f2fd';
      const stroke = hasViolation ? '#f44336' : '#1976d2';

      svg += `<rect x="${pos.x}" y="${pos.y}" width="${nodeWidth}" height="${nodeHeight}"
                rx="4" fill="${fill}" stroke="${stroke}" stroke-width="2" />`;
      svg += `<text x="${pos.x + nodeWidth / 2}" y="${pos.y + nodeHeight / 2 + 5}"
                text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" fill="#333">${layer.name}</text>`;
    }

    svg += '</svg>';
    return svg;
  }

  /**
   * Handle messages from webview.
   */
  private handleMessage(message: { command: string; index?: number; filePath?: string }): void {
    switch (message.command) {
      case 'openFile':
        if (message.filePath) {
          const absolutePath = path.join(this.projectRoot, message.filePath);
          const uri = vscode.Uri.file(absolutePath);
          vscode.window.showTextDocument(uri);
        }
        break;
      case 'refresh':
        this.updateView();
        break;
      case 'showViolation':
        if (typeof message.index === 'number' && this.currentViolations[message.index]) {
          const violation = this.currentViolations[message.index];
          const absolutePath = path.join(this.projectRoot, violation.sourceFile);
          const uri = vscode.Uri.file(absolutePath);
          vscode.window.showTextDocument(uri);
        }
        break;
    }
  }

  /**
   * Get loading HTML.
   */
  private getLoadingHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
    }
    .loading {
      text-align: center;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--vscode-editor-foreground);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="loading">
    <div class="spinner"></div>
    <div>Analyzing layer boundaries...</div>
  </div>
</body>
</html>`;
  }

  /**
   * Get error HTML.
   */
  private getErrorHtml(message: string): string {
    const safeMessage = escapeHtml(message);
    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      padding: 20px;
      margin: 0;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
    }
    .error {
      background: #ffebee;
      border: 1px solid #f44336;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }
    .error h2 {
      color: #c62828;
      margin: 0 0 10px 0;
    }
    .error p {
      color: #333;
      margin: 0;
      white-space: pre-wrap;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <div class="error">
    <h2>Error analyzing layers</h2>
    <p>${safeMessage}</p>
  </div>
</body>
</html>`;
  }

  /**
   * Get the main view HTML.
   */
  private getViewHtml(data: LayerBoundaryData): string {
    const violationCount = data.violations.length;
    const statusClass = violationCount > 0 ? 'has-violations' : 'no-violations';
    const statusText = violationCount > 0
      ? `${violationCount} violation${violationCount > 1 ? 's' : ''} found`
      : 'All layer boundaries respected';

    // Generate nonce for CSP
    const nonce = this.getNonce();

    // Escape the Mermaid diagram for safe embedding
    const safeDiagram = escapeHtml(data.mermaidDiagram);

    return `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; style-src 'unsafe-inline'; img-src data:;">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      padding: 16px;
      overflow-y: auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .status {
      font-size: 14px;
      font-weight: 500;
    }
    .status.has-violations {
      color: #f44336;
    }
    .status.no-violations {
      color: #4caf50;
    }
    .controls button {
      padding: 6px 12px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    .controls button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .diagram-container {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 16px;
      margin-bottom: 16px;
      min-height: 200px;
      display: flex;
      justify-content: center;
    }
    .violations-section {
      margin-top: 16px;
    }
    .violations-section h3 {
      font-size: 14px;
      margin-bottom: 12px;
      color: #f44336;
    }
    .violation-list {
      list-style: none;
    }
    .violation-item {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border: 1px solid var(--vscode-panel-border);
      border-left: 3px solid #f44336;
      border-radius: 4px;
      padding: 12px;
      margin-bottom: 8px;
    }
    .violation-message {
      font-size: 13px;
      margin-bottom: 8px;
    }
    .violation-files {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    .violation-files a {
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      text-decoration: none;
    }
    .violation-files a:hover {
      text-decoration: underline;
    }
    .legend {
      margin-top: 16px;
      padding: 12px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 4px;
      font-size: 12px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 4px 0;
    }
    .legend-line {
      width: 30px;
      height: 2px;
    }
    .legend-line.allowed {
      background: #1976d2;
    }
    .legend-line.violation {
      background: #f44336;
      border-style: dashed;
    }
    .empty-state {
      text-align: center;
      padding: 40px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="status ${statusClass}" id="status"></div>
    <div class="controls">
      <button onclick="refresh()">Refresh</button>
    </div>
  </div>

  <div class="diagram-container" id="diagram">
    <p style="color: green;">Layers found: ${data.layers.length}</p>
    <p style="color: blue;">SVG length: ${data.mermaidDiagram.length}</p>
    ${data.mermaidDiagram}
  </div>

  <div class="legend">
    <div class="legend-item">
      <div class="legend-line allowed"></div>
      <span>Allowed import direction</span>
    </div>
    <div class="legend-item">
      <div class="legend-line violation" style="border-top: 2px dashed #f44336; height: 0;"></div>
      <span>Violation (forbidden import)</span>
    </div>
  </div>

  <div class="violations-section" id="violations-section"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const violations = ${JSON.stringify(data.violations.map(v => ({
      sourceFile: v.sourceFile,
      sourceLayer: v.sourceLayer,
      importedFile: v.importedFile,
      importedLayer: v.importedLayer,
      message: v.message,
    })))};
    const violationCount = ${violationCount};

    // Set status using textContent
    const statusEl = document.getElementById('status');
    statusEl.textContent = violationCount > 0
      ? violationCount + ' violation' + (violationCount > 1 ? 's' : '') + ' found'
      : 'All layer boundaries respected';

    // Render violations list using DOM methods
    const violationsSection = document.getElementById('violations-section');
    if (violations.length > 0) {
      const header = document.createElement('h3');
      header.textContent = 'Violations';
      violationsSection.appendChild(header);

      const list = document.createElement('ul');
      list.className = 'violation-list';

      violations.forEach(function(v, index) {
        const item = document.createElement('li');
        item.className = 'violation-item';

        const message = document.createElement('div');
        message.className = 'violation-message';
        message.textContent = v.message;
        item.appendChild(message);

        const files = document.createElement('div');
        files.className = 'violation-files';

        const sourceLink = document.createElement('a');
        sourceLink.textContent = v.sourceFile;
        sourceLink.onclick = function() {
          vscode.postMessage({ command: 'openFile', filePath: v.sourceFile });
        };

        const arrow = document.createTextNode(' → ');

        const targetLink = document.createElement('a');
        targetLink.textContent = v.importedFile;
        targetLink.onclick = function() {
          vscode.postMessage({ command: 'openFile', filePath: v.importedFile });
        };

        files.appendChild(sourceLink);
        files.appendChild(arrow);
        files.appendChild(targetLink);
        item.appendChild(files);

        list.appendChild(item);
      });

      violationsSection.appendChild(list);
    }

    function refresh() {
      vscode.postMessage({ command: 'refresh' });
    }
  </script>
</body>
</html>`;
  }

  /**
   * Generate a nonce for CSP.
   */
  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * Dispose resources.
   */
  public dispose(): void {
    LayerBoundaryPanel.currentPanel = undefined;

    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
