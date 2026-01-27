/**
 * @arch extension.client.decorations
 *
 * Editor Decorations for ArchCodex
 *
 * Provides visual decorations for @arch tags and hover information.
 */
import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { parse as parseYaml } from 'yaml';

/**
 * Decoration type for @arch tags.
 */
const archTagDecorationType = vscode.window.createTextEditorDecorationType({
  after: {
    margin: '0 0 0 1em',
    color: new vscode.ThemeColor('editorCodeLens.foreground'),
  },
});

/**
 * Registry node structure.
 */
interface RegistryNode {
  description?: string;
  rationale?: string;
  inherits?: string;
  mixins?: string[];
  constraints?: Record<string, unknown>[];
  hints?: string[];
}

/**
 * Cached registry data - maps archId to node.
 */
let cachedRegistry: Record<string, RegistryNode> | null = null;
let registryPath: string | null = null;

/**
 * Load and cache the registry.
 * The registry format has architectures at root level (e.g., base:, archcodex.cli:)
 */
function loadRegistry(projectRoot: string): Record<string, RegistryNode> | null {
  const regPath = path.join(projectRoot, '.arch', 'registry.yaml');

  if (registryPath !== regPath) {
    cachedRegistry = null;
    registryPath = regPath;
  }

  if (cachedRegistry) {
    return cachedRegistry;
  }

  try {
    if (fs.existsSync(regPath)) {
      const content = fs.readFileSync(regPath, 'utf-8');
      const parsed = parseYaml(content) as Record<string, unknown>;

      // Registry has architectures at root level (base:, archcodex.cli:, etc.)
      // Filter to only include valid architecture nodes (objects with description/inherits/etc.)
      cachedRegistry = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          cachedRegistry[key] = value as RegistryNode;
        }
      }
      return cachedRegistry;
    }
  } catch {
    // Ignore errors
  }

  return null;
}

/**
 * Clear the registry cache.
 */
export function clearRegistryCache(): void {
  cachedRegistry = null;
}

/**
 * Update decorations for a text editor.
 */
export function updateDecorations(editor: vscode.TextEditor): void {
  if (!editor) return;

  const document = editor.document;

  // Only decorate TypeScript/JavaScript files
  if (!['typescript', 'typescriptreact', 'javascript', 'javascriptreact'].includes(document.languageId)) {
    return;
  }

  const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!projectRoot) return;

  const registry = loadRegistry(projectRoot);
  if (!registry) return;

  const decorations: vscode.DecorationOptions[] = [];

  // Find @arch tag in the first 50 lines
  const text = document.getText();
  const lines = text.split('\n').slice(0, 50);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/@arch\s+([\w.-]+)/);

    if (match) {
      const archId = match[1];
      const node = registry[archId];

      if (node) {
        const startPos = line.indexOf(match[0]);
        const range = new vscode.Range(
          new vscode.Position(i, startPos),
          new vscode.Position(i, startPos + match[0].length)
        );

        // Build decoration text
        let decorationText = '';
        if (node.description) {
          decorationText = `— ${node.description}`;
        }

        decorations.push({
          range,
          renderOptions: {
            after: {
              contentText: decorationText,
            },
          },
        });
      }

      break; // Only process first @arch tag
    }
  }

  editor.setDecorations(archTagDecorationType, decorations);
}

/**
 * Create a hover provider for @arch tags.
 */
export function createHoverProvider(): vscode.HoverProvider {
  return {
    provideHover(
      document: vscode.TextDocument,
      position: vscode.Position
    ): vscode.ProviderResult<vscode.Hover> {
      const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!projectRoot) return null;

      const registry = loadRegistry(projectRoot);
      if (!registry) return null;

      // Get the line text
      const line = document.lineAt(position.line).text;

      // Check if we're hovering over an @arch tag
      const match = line.match(/@arch\s+([\w.-]+)/);
      if (!match) return null;

      const archId = match[1];
      const tagStart = line.indexOf(match[0]);
      const tagEnd = tagStart + match[0].length;

      // Check if position is within the tag
      if (position.character < tagStart || position.character > tagEnd) {
        return null;
      }

      // Get node info
      const node = registry[archId];
      if (!node) {
        return new vscode.Hover(
          new vscode.MarkdownString(`**Unknown architecture:** \`${archId}\``)
        );
      }

      // Build hover content
      const md = new vscode.MarkdownString();
      md.isTrusted = true;

      // Header
      md.appendMarkdown(`## ${archId}\n\n`);

      // Description
      if (node.description) {
        md.appendMarkdown(`${node.description}\n\n`);
      }

      // Rationale
      if (node.rationale) {
        md.appendMarkdown(`**Rationale:** ${node.rationale}\n\n`);
      }

      // Inheritance
      if (node.inherits) {
        md.appendMarkdown(`**Inherits from:** \`${node.inherits}\`\n\n`);
      }

      // Mixins
      if (node.mixins && node.mixins.length > 0) {
        md.appendMarkdown(`**Mixins:** ${node.mixins.map(m => `\`${m}\``).join(', ')}\n\n`);
      }

      // Constraints summary
      if (node.constraints && node.constraints.length > 0) {
        md.appendMarkdown(`**Constraints:** ${node.constraints.length} rule(s)\n\n`);

        // Show first few constraints
        const constraintsToShow = node.constraints.slice(0, 5);
        for (const constraint of constraintsToShow) {
          const entries = Object.entries(constraint);
          if (entries.length > 0) {
            const [rule, value] = entries[0];
            const valueStr = Array.isArray(value)
              ? value.slice(0, 3).join(', ') + (value.length > 3 ? '...' : '')
              : String(value);
            md.appendMarkdown(`- \`${rule}\`: ${valueStr}\n`);
          }
        }

        if (node.constraints.length > 5) {
          md.appendMarkdown(`- ... and ${node.constraints.length - 5} more\n`);
        }
        md.appendMarkdown('\n');
      }

      // Hints
      if (node.hints && node.hints.length > 0) {
        md.appendMarkdown(`**Hints:**\n`);
        for (const hint of node.hints.slice(0, 3)) {
          md.appendMarkdown(`- ${hint}\n`);
        }
        if (node.hints.length > 3) {
          md.appendMarkdown(`- ... and ${node.hints.length - 3} more\n`);
        }
      }

      // Link to definition
      md.appendMarkdown('\n---\n');
      md.appendMarkdown(`[Go to definition](command:archcodex.goToArchDefinition?${encodeURIComponent(JSON.stringify(archId))})`);

      return new vscode.Hover(md, new vscode.Range(
        new vscode.Position(position.line, tagStart),
        new vscode.Position(position.line, tagEnd)
      ));
    },
  };
}

/**
 * Dispose decoration type.
 */
export function disposeDecorations(): void {
  archTagDecorationType.dispose();
}
