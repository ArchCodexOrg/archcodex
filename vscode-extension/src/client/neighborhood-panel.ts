/**
 * @arch extension.client.panel
 *
 * Neighborhood WebView Panel
 *
 * Shows the import neighborhood of a file: who imports it, what it imports,
 * and what it's allowed/forbidden to import.
 */
import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { parse as parseYaml } from 'yaml';

/**
 * Import status from analyzer.
 */
interface ImportStatus {
  path: string;
  allowed: boolean;
  forbiddenBy?: string;
}

/**
 * Imported by info.
 */
interface ImportedByInfo {
  file: string;
  architecture: string | null;
}

/**
 * Neighborhood data.
 */
interface Neighborhood {
  file: string;
  architecture: string | null;
  layer: string;
  importedBy: ImportedByInfo[];
  currentImports: ImportStatus[];
  allowedImports: string[];
  forbiddenImports: string[];
  sameLayerPatterns: string[];
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
 * Manages the Neighborhood WebView panel.
 */
export class NeighborhoodPanel {
  public static currentPanel: NeighborhoodPanel | undefined;
  private static readonly viewType = 'archcodexNeighborhood';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly projectRoot: string;
  private currentFilePath: string | undefined;
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
   * Create or show the neighborhood panel.
   */
  public static async createOrShow(
    extensionUri: vscode.Uri,
    projectRoot: string
  ): Promise<NeighborhoodPanel> {
    const column = vscode.ViewColumn.Beside;

    // If panel exists, reveal it
    if (NeighborhoodPanel.currentPanel) {
      NeighborhoodPanel.currentPanel.panel.reveal(column);
      return NeighborhoodPanel.currentPanel;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      NeighborhoodPanel.viewType,
      'File Neighborhood',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    NeighborhoodPanel.currentPanel = new NeighborhoodPanel(panel, extensionUri, projectRoot);
    return NeighborhoodPanel.currentPanel;
  }

  /**
   * Analyze and display neighborhood for a file.
   */
  public async analyzeFile(filePath: string): Promise<void> {
    this.currentFilePath = filePath;
    this.panel.title = `Neighborhood: ${path.basename(filePath)}`;

    try {
      // Show loading state
      this.panel.webview.html = this.getLoadingHtml();

      // Load registry
      const registry = await this.loadRegistry();

      // Analyze neighborhood
      const { NeighborhoodAnalyzer } = await import(
        '../../../src/core/neighborhood/analyzer.js'
      );

      const analyzer = new NeighborhoodAnalyzer(this.projectRoot, registry);
      const neighborhood = await analyzer.analyze(filePath);
      analyzer.dispose();

      // Update webview
      this.panel.webview.html = this.getViewHtml(neighborhood);
    } catch (error) {
      this.panel.webview.html = this.getErrorHtml(
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Load registry from file.
   */
  private async loadRegistry(): Promise<Record<string, unknown>> {
    const registryPath = path.join(this.projectRoot, '.arch', 'registry.yaml');

    if (!fs.existsSync(registryPath)) {
      return { nodes: {} };
    }

    const content = fs.readFileSync(registryPath, 'utf-8');
    return parseYaml(content) as Record<string, unknown>;
  }

  /**
   * Handle messages from webview.
   */
  private handleMessage(message: { command: string; filePath?: string }): void {
    switch (message.command) {
      case 'openFile':
        if (message.filePath) {
          const absolutePath = path.isAbsolute(message.filePath)
            ? message.filePath
            : path.join(this.projectRoot, message.filePath);
          const uri = vscode.Uri.file(absolutePath);
          vscode.window.showTextDocument(uri);
        }
        break;
      case 'refresh':
        if (this.currentFilePath) {
          this.analyzeFile(this.currentFilePath);
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
    <div>Analyzing neighborhood...</div>
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
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
    }
    .error {
      text-align: center;
      color: var(--vscode-errorForeground);
    }
  </style>
</head>
<body>
  <div class="error">
    <h2>Error analyzing neighborhood</h2>
    <p>${safeMessage}</p>
  </div>
</body>
</html>`;
  }

  /**
   * Get the main view HTML.
   */
  private getViewHtml(data: Neighborhood): string {
    const forbiddenCount = data.currentImports.filter(i => !i.allowed).length;

    // Prepare sanitized data for JavaScript
    const sanitizedData = {
      file: escapeHtml(data.file),
      architecture: data.architecture ? escapeHtml(data.architecture) : null,
      layer: escapeHtml(data.layer),
      importedBy: data.importedBy.map(i => ({
        file: escapeHtml(i.file),
        architecture: i.architecture ? escapeHtml(i.architecture) : null,
      })),
      currentImports: data.currentImports.map(i => ({
        path: escapeHtml(i.path),
        allowed: i.allowed,
        forbiddenBy: i.forbiddenBy ? escapeHtml(i.forbiddenBy) : undefined,
      })),
      allowedImports: data.allowedImports.map(escapeHtml),
      forbiddenImports: data.forbiddenImports.map(escapeHtml),
      sameLayerPatterns: data.sameLayerPatterns.map(escapeHtml),
    };

    return `<!DOCTYPE html>
<html>
<head>
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
      font-size: 13px;
      padding: 16px;
      overflow-y: auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .file-info h2 {
      font-size: 16px;
      margin-bottom: 8px;
      word-break: break-all;
    }
    .meta {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    .meta-item {
      margin: 4px 0;
    }
    .meta-label {
      font-weight: 500;
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
    .section {
      margin-bottom: 20px;
    }
    .section h3 {
      font-size: 14px;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section h3 .count {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: normal;
    }
    .section h3 .count.error {
      background: #f44336;
      color: white;
    }
    .list {
      list-style: none;
    }
    .list-item {
      padding: 8px 12px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 4px;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .list-item.forbidden {
      border-left: 3px solid #f44336;
    }
    .list-item.allowed {
      border-left: 3px solid #4caf50;
    }
    .list-item a {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      cursor: pointer;
      flex: 1;
      word-break: break-all;
    }
    .list-item a:hover {
      text-decoration: underline;
    }
    .list-item .arch-tag {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-badge-background);
      padding: 2px 6px;
      border-radius: 3px;
    }
    .list-item .status-icon {
      font-size: 14px;
    }
    .list-item .status-icon.allowed {
      color: #4caf50;
    }
    .list-item .status-icon.forbidden {
      color: #f44336;
    }
    .pattern-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .pattern {
      background: var(--vscode-editor-inactiveSelectionBackground);
      padding: 4px 8px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
    }
    .pattern.forbidden {
      border-left: 3px solid #f44336;
    }
    .pattern.allowed {
      border-left: 3px solid #4caf50;
    }
    .empty {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }
    .forbidden-reason {
      font-size: 11px;
      color: #f44336;
      margin-left: auto;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="file-info">
      <h2 id="file-name"></h2>
      <div class="meta">
        <div class="meta-item">
          <span class="meta-label">Architecture:</span>
          <span id="architecture"></span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Layer:</span>
          <span id="layer"></span>
        </div>
      </div>
    </div>
    <div class="controls">
      <button onclick="refresh()">Refresh</button>
    </div>
  </div>

  <div class="section">
    <h3>Imported By <span class="count" id="imported-by-count"></span></h3>
    <ul class="list" id="imported-by-list"></ul>
  </div>

  <div class="section">
    <h3>Current Imports <span class="count" id="imports-count"></span></h3>
    <ul class="list" id="imports-list"></ul>
  </div>

  <div class="section">
    <h3>Allowed Import Patterns</h3>
    <div class="pattern-list" id="allowed-patterns"></div>
  </div>

  <div class="section">
    <h3>Forbidden Import Patterns</h3>
    <div class="pattern-list" id="forbidden-patterns"></div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const data = ${JSON.stringify(sanitizedData)};

    // File info
    document.getElementById('file-name').textContent = data.file;
    document.getElementById('architecture').textContent = data.architecture || '(untagged)';
    document.getElementById('layer').textContent = data.layer;

    // Imported by
    const importedByCount = document.getElementById('imported-by-count');
    importedByCount.textContent = data.importedBy.length;

    const importedByList = document.getElementById('imported-by-list');
    if (data.importedBy.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'No files import this file';
      importedByList.appendChild(empty);
    } else {
      data.importedBy.forEach(function(item) {
        const li = document.createElement('li');
        li.className = 'list-item';

        const link = document.createElement('a');
        link.textContent = item.file;
        link.onclick = function() {
          vscode.postMessage({ command: 'openFile', filePath: item.file });
        };
        li.appendChild(link);

        if (item.architecture) {
          const tag = document.createElement('span');
          tag.className = 'arch-tag';
          tag.textContent = item.architecture;
          li.appendChild(tag);
        }

        importedByList.appendChild(li);
      });
    }

    // Current imports
    const forbiddenCount = data.currentImports.filter(function(i) { return !i.allowed; }).length;
    const importsCount = document.getElementById('imports-count');
    if (forbiddenCount > 0) {
      importsCount.className = 'count error';
      importsCount.textContent = data.currentImports.length + ' (' + forbiddenCount + ' forbidden)';
    } else {
      importsCount.textContent = data.currentImports.length;
    }

    const importsList = document.getElementById('imports-list');
    if (data.currentImports.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'No imports';
      importsList.appendChild(empty);
    } else {
      data.currentImports.forEach(function(item) {
        const li = document.createElement('li');
        li.className = 'list-item ' + (item.allowed ? 'allowed' : 'forbidden');

        const icon = document.createElement('span');
        icon.className = 'status-icon ' + (item.allowed ? 'allowed' : 'forbidden');
        icon.textContent = item.allowed ? '✓' : '✗';
        li.appendChild(icon);

        const link = document.createElement('a');
        link.textContent = item.path;
        link.onclick = function() {
          vscode.postMessage({ command: 'openFile', filePath: item.path });
        };
        li.appendChild(link);

        if (item.forbiddenBy) {
          const reason = document.createElement('span');
          reason.className = 'forbidden-reason';
          reason.textContent = item.forbiddenBy;
          li.appendChild(reason);
        }

        importsList.appendChild(li);
      });
    }

    // Allowed patterns
    const allowedPatterns = document.getElementById('allowed-patterns');
    const allAllowed = data.allowedImports.concat(data.sameLayerPatterns);
    if (allAllowed.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'empty';
      empty.textContent = 'No explicit allow patterns';
      allowedPatterns.appendChild(empty);
    } else {
      allAllowed.forEach(function(pattern) {
        const span = document.createElement('span');
        span.className = 'pattern allowed';
        span.textContent = pattern;
        allowedPatterns.appendChild(span);
      });
    }

    // Forbidden patterns
    const forbiddenPatterns = document.getElementById('forbidden-patterns');
    if (data.forbiddenImports.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'empty';
      empty.textContent = 'No forbidden patterns';
      forbiddenPatterns.appendChild(empty);
    } else {
      data.forbiddenImports.forEach(function(pattern) {
        const span = document.createElement('span');
        span.className = 'pattern forbidden';
        span.textContent = pattern;
        forbiddenPatterns.appendChild(span);
      });
    }

    function refresh() {
      vscode.postMessage({ command: 'refresh' });
    }
  </script>
</body>
</html>`;
  }

  /**
   * Dispose resources.
   */
  public dispose(): void {
    NeighborhoodPanel.currentPanel = undefined;

    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
