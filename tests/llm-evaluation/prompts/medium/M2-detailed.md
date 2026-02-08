Create a new MCP handler for architecture statistics in src/mcp/handlers/.

The handler should expose a tool called `archcodex_stats` that returns:
- Total file count
- Files by architecture
- Untagged file count
- Recent violations

Requirements:
1. Follow the existing MCP handler patterns in this project
2. Use the correct @arch tag for MCP handlers
3. Do NOT import commander or SDK server modules directly
4. Delegate all heavy lifting to core engines
5. Export the handler from the handlers index

The tool should be callable via MCP protocol.
