Create a new CLI command called "metrics" in the src/cli/commands/ directory.

This command should display architectural metrics including:
- Number of files per architecture
- Layer boundary violation counts
- Override debt summary (overrides nearing expiry)

Requirements:
1. Follow the existing CLI command patterns in this project
2. Use the correct @arch tag for CLI commands
3. Import only from allowed layers (core, utils) - NOT from mcp layer
4. Register the command in the CLI index
5. Use the existing database/registry infrastructure from core

The command should be invoked as: `archcodex metrics`
