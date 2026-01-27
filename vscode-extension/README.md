# ArchCodex VSCode Extension

Architectural constraints validation and visualization for TypeScript/JavaScript projects.

## Features

### Real-time Validation

- **On-save validation** - Validates files when you save, showing errors and warnings inline
- **Quick fixes** - One-click fixes for common violations
- **Status bar** - Shows validation status at a glance

### Architecture Tree View

- **Hierarchy view** - See your architecture inheritance tree in the Explorer sidebar
- **File counts** - See how many files use each architecture
- **Go to definition** - Click to jump to the architecture definition in registry.yaml

### Import Graph Visualization

- **Force-directed graph** - Interactive D3.js visualization of import relationships
- **Layer coloring** - Nodes colored by architectural layer
- **Cycle detection** - Circular dependencies highlighted in red
- **Zoom & pan** - Navigate large codebases easily

### Layer Boundary View

- **Mermaid diagram** - Visual DAG of layer dependencies
- **Violation markers** - See forbidden imports at a glance
- **Clickable violations** - Jump to source files

### File Neighborhood

- **Import analysis** - See what a file imports and what imports it
- **Constraint status** - Which imports are allowed/forbidden
- **Pattern display** - View allow/forbid patterns from constraints

### Editor Features

- **@arch tag decorations** - See architecture descriptions inline
- **Hover information** - Rich tooltips with constraints, hints, and more
- **Go to definition** - Jump to architecture definitions

## Requirements

Your project must have an ArchCodex configuration:

```
.arch/
├── config.yaml      # Configuration
└── registry.yaml    # Architecture definitions
```

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `archcodex.enable` | `true` | Enable/disable validation |
| `archcodex.configPath` | `.arch/config.yaml` | Path to config file |
| `archcodex.validateOnSave` | `true` | Validate on file save |
| `archcodex.severityFilter` | `all` | Filter: `all`, `errors`, `warnings` |
| `archcodex.graph.maxNodes` | `500` | Max nodes in import graph |

## Commands

| Command | Description |
|---------|-------------|
| `ArchCodex: Validate Current File` | Validate the active file |
| `ArchCodex: Validate Workspace` | Validate all files |
| `ArchCodex: Show Architecture Tree` | Open architecture hierarchy |
| `ArchCodex: Show Import Graph` | Open import graph visualization |
| `ArchCodex: Show Layer Boundaries` | Open layer boundary diagram |
| `ArchCodex: Show File Neighborhood` | Show imports for current file |

## Installation

### From VSIX

1. Download the `.vsix` file
2. In VSCode, open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
3. Run "Extensions: Install from VSIX..."
4. Select the downloaded file

### From Source

```bash
cd vscode-extension
npm install
npm run build
npm run package
```

## Usage

1. Open a project with `.arch/registry.yaml`
2. The extension activates automatically
3. Edit TypeScript/JavaScript files - validation runs on save
4. Use the Architecture view in the Explorer sidebar
5. Run commands from the Command Palette

## License

MIT
