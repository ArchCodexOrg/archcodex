/**
 * @arch extension.client.provider
 *
 * Architecture Tree View Provider
 *
 * Displays the architecture hierarchy from the registry in VSCode's explorer.
 */
import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { parse as parseYaml } from 'yaml';

/**
 * Tree item representing an architecture or mixin.
 */
export class ArchTreeItem extends vscode.TreeItem {
  constructor(
    public readonly archId: string,
    public readonly archType: 'architecture' | 'mixin' | 'file' | 'container',
    public readonly fileCount: number,
    public readonly filePath?: string,
    public readonly children: ArchTreeItem[] = [],
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed,
    public readonly parentContext?: string
  ) {
    // Use short label for display
    const label = archType === 'file'
      ? path.basename(filePath || '')
      : archId.split('.').pop() || archId;

    super(label, collapsibleState);

    // Use type-specific prefixes and parent context to ensure unique IDs
    const contextSuffix = parentContext ? `@${parentContext}` : '';
    switch (archType) {
      case 'file':
        this.id = `file:${filePath}${contextSuffix}`;
        break;
      case 'mixin':
        this.id = `mixin:${archId}${contextSuffix}`;
        break;
      case 'container':
        this.id = `container:${archId}`;
        break;
      case 'architecture':
      default:
        this.id = `arch:${archId}`;
        break;
    }
    this.tooltip = this.getTooltip();
    this.description = this.getDescription();
    this.iconPath = this.getIcon();
    this.contextValue = archType;

    // Make files clickable to open
    if (archType === 'file' && filePath) {
      this.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [vscode.Uri.file(filePath)],
      };
    }

    // Make architectures clickable to go to definition
    if (archType === 'architecture') {
      this.command = {
        command: 'archcodex.goToArchDefinition',
        title: 'Go to Definition',
        arguments: [archId],
      };
    }
  }

  private getTooltip(): string {
    if (this.archType === 'file') {
      return this.filePath || '';
    }
    if (this.archType === 'mixin') {
      return `Mixin: ${this.archId}`;
    }
    return `${this.archId}\n${this.fileCount} file${this.fileCount !== 1 ? 's' : ''}`;
  }

  private getDescription(): string {
    if (this.archType === 'file') {
      return '';
    }
    if (this.fileCount > 0) {
      return `(${this.fileCount})`;
    }
    return '';
  }

  private getIcon(): vscode.ThemeIcon {
    switch (this.archType) {
      case 'mixin':
        return new vscode.ThemeIcon('symbol-interface', new vscode.ThemeColor('symbolIcon.interfaceForeground'));
      case 'container':
        return new vscode.ThemeIcon('symbol-interface');
      case 'file':
        return new vscode.ThemeIcon('file-code');
      case 'architecture':
      default:
        return new vscode.ThemeIcon('symbol-class', new vscode.ThemeColor('symbolIcon.classForeground'));
    }
  }
}

/**
 * Parsed registry node for tree building.
 */
interface RegistryNode {
  description?: string;
  inherits?: string;
  mixins?: string[];
}

/**
 * Graph node with file information.
 */
interface GraphNode {
  id: string;
  type: 'architecture' | 'mixin';
  fileCount: number;
  files: string[];
  children: string[];
  mixins: string[];
}

/**
 * Tree data provider for architecture hierarchy.
 */
export class ArchTreeProvider implements vscode.TreeDataProvider<ArchTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ArchTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private projectRoot: string | undefined;
  private registryPath: string | undefined;
  private graph: Map<string, GraphNode> = new Map();
  private rootNodes: string[] = [];
  private allMixins: Set<string> = new Set();

  constructor() {
    this.projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (this.projectRoot) {
      this.registryPath = path.join(this.projectRoot, '.arch', 'registry.yaml');
    }
  }

  /**
   * Refresh the tree view.
   */
  refresh(): void {
    this.graph.clear();
    this.rootNodes = [];
    this.allMixins.clear();
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get tree item for display.
   */
  getTreeItem(element: ArchTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children of a tree item.
   */
  async getChildren(element?: ArchTreeItem): Promise<ArchTreeItem[]> {
    if (!this.projectRoot) {
      return [this.createMessageItem('No workspace folder open')];
    }

    if (!this.registryPath) {
      return [this.createMessageItem('No registry path configured')];
    }

    // Load registry if not loaded
    if (this.graph.size === 0) {
      await this.loadRegistry();
    }

    // Root level - show top-level architectures and mixins
    if (!element) {
      // Check if registry was loaded
      if (this.graph.size === 0 && this.rootNodes.length === 0) {
        // Check if registry file exists
        if (!fs.existsSync(this.registryPath)) {
          return [this.createMessageItem('No .arch/registry.yaml found')];
        }
        return [this.createMessageItem('No architectures defined')];
      }

      const items: ArchTreeItem[] = [];

      // Add root architectures (those without parents or whose parents aren't in registry)
      for (const archId of this.rootNodes) {
        const node = this.graph.get(archId);
        if (node) {
          const hasChildren = node.children.length > 0 || node.mixins.length > 0 || node.files.length > 0;
          items.push(new ArchTreeItem(
            archId,
            'architecture',
            node.fileCount,
            undefined,
            [],
            hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
          ));
        }
      }

      // Add mixins section if there are any
      if (this.allMixins.size > 0) {
        const mixinRoot = new ArchTreeItem(
          'mixins',
          'container',
          0,
          undefined,
          [],
          vscode.TreeItemCollapsibleState.Collapsed
        );
        // Override the label for the mixins container
        mixinRoot.label = 'Mixins';
        items.push(mixinRoot);
      }

      return items;
    }

    // Mixins container
    if (element.archId === 'mixins' && element.archType === 'container') {
      return Array.from(this.allMixins).sort().map(mixinId =>
        new ArchTreeItem(
          mixinId,
          'mixin',
          0,
          undefined,
          [],
          vscode.TreeItemCollapsibleState.None
        )
      );
    }

    // Children of an architecture
    if (element.archType === 'architecture') {
      const node = this.graph.get(element.archId);
      if (!node) return [];

      const items: ArchTreeItem[] = [];

      // Add child architectures
      for (const childId of node.children) {
        const childNode = this.graph.get(childId);
        if (childNode) {
          const hasChildren = childNode.children.length > 0 || childNode.mixins.length > 0 || childNode.files.length > 0;
          items.push(new ArchTreeItem(
            childId,
            'architecture',
            childNode.fileCount,
            undefined,
            [],
            hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
          ));
        }
      }

      // Add mixins used by this architecture (with parent context for unique IDs)
      for (const mixinId of node.mixins) {
        items.push(new ArchTreeItem(
          mixinId,
          'mixin',
          0,
          undefined,
          [],
          vscode.TreeItemCollapsibleState.None,
          element.archId
        ));
      }

      // Add files using this architecture (with parent context for unique IDs)
      for (const filePath of node.files) {
        const absolutePath = path.join(this.projectRoot!, filePath);
        items.push(new ArchTreeItem(
          filePath,
          'file',
          0,
          absolutePath,
          [],
          vscode.TreeItemCollapsibleState.None,
          element.archId
        ));
      }

      return items;
    }

    return [];
  }

  /**
   * Load and parse the registry.yaml file.
   */
  private async loadRegistry(): Promise<void> {
    this.graph.clear();
    this.rootNodes = [];
    this.allMixins.clear();

    if (!this.registryPath || !this.projectRoot) {
      return;
    }

    try {
      // Check if registry exists
      if (!fs.existsSync(this.registryPath)) {
        return;
      }

      const content = fs.readFileSync(this.registryPath, 'utf-8');
      const parsed = parseYaml(content) as Record<string, unknown>;

      // Registry has architectures at root level (base:, archcodex.cli:, etc.)
      // Filter to only include valid architecture nodes
      const nodes: Record<string, RegistryNode> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          nodes[key] = value as RegistryNode;
        }
      }

      if (Object.keys(nodes).length === 0) {
        return;
      }

      // Scan files for @arch tags
      const fileUsage = await this.scanFileUsage();

      // Build graph nodes
      const parentSet = new Set<string>();

      for (const [archId, node] of Object.entries(nodes)) {
        const files = fileUsage.get(archId) || [];

        this.graph.set(archId, {
          id: archId,
          type: 'architecture',
          fileCount: files.length,
          files,
          children: [],
          mixins: node.mixins || [],
        });

        // Track mixins
        if (node.mixins) {
          for (const mixin of node.mixins) {
            this.allMixins.add(mixin);
          }
        }

        // Track parent
        if (node.inherits) {
          parentSet.add(node.inherits);
        }
      }

      // Build parent-child relationships
      for (const [archId, node] of Object.entries(nodes)) {
        if (node.inherits && this.graph.has(node.inherits)) {
          const parent = this.graph.get(node.inherits);
          if (parent) {
            parent.children.push(archId);
          }
        }
      }

      // Find root nodes (no parent or parent not in registry)
      for (const [archId, node] of Object.entries(nodes)) {
        if (!node.inherits || !this.graph.has(node.inherits)) {
          this.rootNodes.push(archId);
        }
      }

      // Sort root nodes
      this.rootNodes.sort();

    } catch (error) {
      console.error('Failed to load registry:', error);
    }
  }

  /**
   * Scan project files to find @arch tags.
   */
  private async scanFileUsage(): Promise<Map<string, string[]>> {
    const usage = new Map<string, string[]>();

    if (!this.projectRoot) {
      return usage;
    }

    const archTagPattern = /@arch\s+([\w.-]+)/;

    // Find all TypeScript/JavaScript files
    const files = await vscode.workspace.findFiles(
      '**/*.{ts,tsx,js,jsx}',
      '**/node_modules/**'
    );

    for (const file of files) {
      try {
        const content = fs.readFileSync(file.fsPath, 'utf-8');
        // Only check first 1000 chars for performance
        const header = content.slice(0, 1000);
        const match = header.match(archTagPattern);

        if (match) {
          const archId = match[1];
          const relativePath = path.relative(this.projectRoot, file.fsPath);
          const existing = usage.get(archId) || [];
          existing.push(relativePath);
          usage.set(archId, existing);
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return usage;
  }

  /**
   * Find the line number of an architecture in registry.yaml.
   */
  findArchitectureLine(archId: string): number {
    if (!this.registryPath || !fs.existsSync(this.registryPath)) {
      return 0;
    }

    try {
      const content = fs.readFileSync(this.registryPath, 'utf-8');
      const lines = content.split('\n');

      // Look for the architecture ID as a key
      const searchPattern = new RegExp(`^\\s*${archId.replace(/\./g, '\\.')}:`);

      for (let i = 0; i < lines.length; i++) {
        if (searchPattern.test(lines[i])) {
          return i;
        }
      }
    } catch {
      // Ignore errors
    }

    return 0;
  }

  /**
   * Get the registry file path.
   */
  getRegistryPath(): string | undefined {
    return this.registryPath;
  }

  /**
   * Create a message item for displaying status messages in the tree.
   */
  private createMessageItem(message: string): ArchTreeItem {
    const item = new ArchTreeItem(
      message,
      'architecture',
      0,
      undefined,
      [],
      vscode.TreeItemCollapsibleState.None
    );
    item.description = '';
    item.iconPath = new vscode.ThemeIcon('info');
    item.contextValue = 'message';
    // Remove any command to make it non-clickable
    item.command = undefined;
    return item;
  }
}
