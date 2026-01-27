/**
 * @arch extension.client.entry
 *
 * ArchCodex VSCode Extension Client
 *
 * Entry point for the VSCode extension. Starts the language server
 * and manages the client connection.
 */
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';
import { ArchTreeProvider } from './tree-provider.js';
import { ImportGraphPanel } from './import-graph-panel.js';
import { LayerBoundaryPanel } from './layer-boundary-panel.js';
import { NeighborhoodPanel } from './neighborhood-panel.js';
import {
  updateDecorations,
  createHoverProvider,
  clearRegistryCache,
  disposeDecorations,
} from './decorations.js';

let client: LanguageClient | undefined;
let statusBarItem: vscode.StatusBarItem;
let archTreeProvider: ArchTreeProvider;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.name = 'ArchCodex';
  statusBarItem.command = 'archcodex.validate';
  context.subscriptions.push(statusBarItem);

  // Start the language server
  await startLanguageServer(context);

  // Register architecture tree view
  archTreeProvider = new ArchTreeProvider();
  const treeView = vscode.window.createTreeView('archcodexTree', {
    treeDataProvider: archTreeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Watch for registry changes to refresh tree and clear cache
  const registryWatcher = vscode.workspace.createFileSystemWatcher('**/.arch/registry.yaml');
  registryWatcher.onDidChange(() => {
    archTreeProvider.refresh();
    clearRegistryCache();
    updateActiveEditorDecorations();
  });
  registryWatcher.onDidCreate(() => {
    archTreeProvider.refresh();
    clearRegistryCache();
  });
  registryWatcher.onDidDelete(() => {
    archTreeProvider.refresh();
    clearRegistryCache();
  });
  context.subscriptions.push(registryWatcher);

  // Register hover provider for @arch tags
  const hoverProvider = vscode.languages.registerHoverProvider(
    ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'],
    createHoverProvider()
  );
  context.subscriptions.push(hoverProvider);

  // Update decorations when editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        updateDecorations(editor);
      }
    })
  );

  // Update decorations when document changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && event.document === editor.document) {
        updateDecorations(editor);
      }
    })
  );

  // Initial decoration update
  updateActiveEditorDecorations();

  // Register commands
  registerCommands(context);

  // Show status bar
  updateStatusBar('ready');
}

async function startLanguageServer(
  context: vscode.ExtensionContext
): Promise<void> {
  // Path to server module
  const serverModule = context.asAbsolutePath(
    path.join('dist', 'server', 'server.js')
  );

  // Debug options for the server
  const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

  // Server options
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions,
    },
  };

  // Client options
  const clientOptions: LanguageClientOptions = {
    // Register the server for TypeScript and JavaScript files
    documentSelector: [
      { scheme: 'file', language: 'typescript' },
      { scheme: 'file', language: 'typescriptreact' },
      { scheme: 'file', language: 'javascript' },
      { scheme: 'file', language: 'javascriptreact' },
    ],
    synchronize: {
      // Watch for changes to .arch/ files
      fileEvents: [
        vscode.workspace.createFileSystemWatcher('**/.arch/**/*.yaml'),
        vscode.workspace.createFileSystemWatcher('**/.arch/**/*.yml'),
      ],
    },
  };

  // Create the language client
  client = new LanguageClient(
    'archcodex',
    'ArchCodex',
    serverOptions,
    clientOptions
  );

  // Start the client (also starts the server)
  await client.start();

  // Listen for diagnostics to update status bar
  client.onNotification('textDocument/publishDiagnostics', (params) => {
    updateStatusBarFromDiagnostics(params.diagnostics);
  });
}

function registerCommands(context: vscode.ExtensionContext): void {
  // Validate current file
  context.subscriptions.push(
    vscode.commands.registerCommand('archcodex.validate', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active file to validate');
        return;
      }

      // Force save to trigger validation
      await editor.document.save();
      vscode.window.showInformationMessage('ArchCodex: Validating...');
    })
  );

  // Validate workspace
  context.subscriptions.push(
    vscode.commands.registerCommand('archcodex.validateWorkspace', async () => {
      vscode.window.showInformationMessage(
        'ArchCodex: Workspace validation not yet implemented'
      );
    })
  );

  // Show architecture tree - focus the tree view
  context.subscriptions.push(
    vscode.commands.registerCommand('archcodex.showArchTree', () => {
      vscode.commands.executeCommand('archcodexTree.focus');
    })
  );

  // Go to architecture definition in registry.yaml
  context.subscriptions.push(
    vscode.commands.registerCommand('archcodex.goToArchDefinition', async (archId: string) => {
      const registryPath = archTreeProvider.getRegistryPath();
      if (!registryPath) {
        vscode.window.showWarningMessage('Registry file not found');
        return;
      }

      const line = archTreeProvider.findArchitectureLine(archId);
      const uri = vscode.Uri.file(registryPath);
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document);

      // Move cursor to the architecture definition
      const position = new vscode.Position(line, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    })
  );

  // Refresh architecture tree
  context.subscriptions.push(
    vscode.commands.registerCommand('archcodex.refreshArchTree', () => {
      archTreeProvider.refresh();
    })
  );

  // Show import graph
  context.subscriptions.push(
    vscode.commands.registerCommand('archcodex.showImportGraph', async () => {
      const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!projectRoot) {
        vscode.window.showWarningMessage('No workspace folder open');
        return;
      }

      const panel = await ImportGraphPanel.createOrShow(
        context.extensionUri,
        projectRoot
      );
      await panel.updateGraph();
    })
  );

  // Show layer boundaries
  context.subscriptions.push(
    vscode.commands.registerCommand('archcodex.showLayerBoundaries', async () => {
      const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!projectRoot) {
        vscode.window.showWarningMessage('No workspace folder open');
        return;
      }

      const panel = await LayerBoundaryPanel.createOrShow(
        context.extensionUri,
        projectRoot
      );
      await panel.updateView();
    })
  );

  // Show file neighborhood
  context.subscriptions.push(
    vscode.commands.registerCommand('archcodex.showNeighborhood', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active file');
        return;
      }

      const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!projectRoot) {
        vscode.window.showWarningMessage('No workspace folder open');
        return;
      }

      const panel = await NeighborhoodPanel.createOrShow(
        context.extensionUri,
        projectRoot
      );
      await panel.analyzeFile(editor.document.uri.fsPath);
    })
  );

  // Discover architecture
  context.subscriptions.push(
    vscode.commands.registerCommand('archcodex.discover', async () => {
      const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!projectRoot) {
        vscode.window.showWarningMessage('No workspace folder open');
        return;
      }

      // Ask user for description
      const query = await vscode.window.showInputBox({
        prompt: 'Describe what you are building',
        placeHolder: 'e.g., "payment service", "CLI command", "validation engine"',
      });

      if (!query) {
        return;
      }

      try {
        // Load index
        const indexPath = require('path').join(projectRoot, '.arch', 'index.yaml');
        const fs = require('fs');
        const { parse: parseYaml } = require('yaml');

        if (!fs.existsSync(indexPath)) {
          vscode.window.showWarningMessage('No .arch/index.yaml found. Run "archcodex reindex" to generate it.');
          return;
        }

        const content = fs.readFileSync(indexPath, 'utf-8');
        const index = parseYaml(content);

        // Import matcher
        const { matchQuery } = await import('../../../src/core/discovery/matcher.js');

        // Find matches
        const results = matchQuery(index, query, { limit: 5 });

        if (results.length === 0) {
          vscode.window.showInformationMessage('No matching architectures found.');
          return;
        }

        // Show quick pick with results
        const items = results.map(r => ({
          label: r.entry.arch_id,
          description: `Score: ${(r.score * 100).toFixed(0)}%`,
          detail: r.entry.description || `Matched: ${r.matchedKeywords.join(', ')}`,
          archId: r.entry.arch_id,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select an architecture to use',
        });

        if (selected) {
          // Copy to clipboard and offer to insert
          await vscode.env.clipboard.writeText(`/** @arch ${selected.archId} */`);

          const action = await vscode.window.showInformationMessage(
            `Architecture "${selected.archId}" copied to clipboard`,
            'Insert at cursor',
            'Go to definition'
          );

          if (action === 'Insert at cursor') {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
              editor.edit(editBuilder => {
                editBuilder.insert(editor.selection.active, `/** @arch ${selected.archId} */\n`);
              });
            }
          } else if (action === 'Go to definition') {
            vscode.commands.executeCommand('archcodex.goToArchDefinition', selected.archId);
          }
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    })
  );
}

/**
 * Update decorations for the active editor.
 */
function updateActiveEditorDecorations(): void {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    updateDecorations(editor);
  }
}

function updateStatusBar(status: 'ready' | 'validating' | 'error' | 'pass' | 'fail'): void {
  switch (status) {
    case 'ready':
      statusBarItem.text = '$(check) ArchCodex';
      statusBarItem.tooltip = 'ArchCodex ready';
      statusBarItem.backgroundColor = undefined;
      break;
    case 'validating':
      statusBarItem.text = '$(sync~spin) ArchCodex';
      statusBarItem.tooltip = 'Validating...';
      statusBarItem.backgroundColor = undefined;
      break;
    case 'pass':
      statusBarItem.text = '$(check) ArchCodex';
      statusBarItem.tooltip = 'No violations found';
      statusBarItem.backgroundColor = undefined;
      break;
    case 'fail':
      statusBarItem.text = '$(error) ArchCodex';
      statusBarItem.tooltip = 'Violations found';
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.errorBackground'
      );
      break;
    case 'error':
      statusBarItem.text = '$(warning) ArchCodex';
      statusBarItem.tooltip = 'Error during validation';
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
      break;
  }
  statusBarItem.show();
}

function updateStatusBarFromDiagnostics(diagnostics: unknown[]): void {
  if (!Array.isArray(diagnostics)) {
    return;
  }

  const hasErrors = diagnostics.some(
    (d: { severity?: number }) => d.severity === 1
  );
  const hasWarnings = diagnostics.some(
    (d: { severity?: number }) => d.severity === 2
  );

  if (hasErrors) {
    updateStatusBar('fail');
  } else if (hasWarnings) {
    statusBarItem.text = '$(warning) ArchCodex';
    statusBarItem.tooltip = 'Warnings found';
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      'statusBarItem.warningBackground'
    );
    statusBarItem.show();
  } else {
    updateStatusBar('pass');
  }
}

export async function deactivate(): Promise<void> {
  disposeDecorations();
  if (client) {
    await client.stop();
  }
}
