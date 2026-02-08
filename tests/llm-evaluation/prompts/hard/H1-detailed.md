Add a caching layer to the unified context synthesizer in src/core/unified-context/.

The cache should:
1. Cache synthesized context by module path and options hash
2. Invalidate when git commit changes (already tracked in DB)
3. Have a configurable TTL (default 5 minutes)
4. Be memory-based for now (no persistence)

Implementation plan:
1. First, define cache types (CacheEntry, CacheOptions)
2. Then, implement the cache in a separate file
3. Finally, integrate with synthesizeUnifiedModuleContext

Requirements:
- Respect the layer boundaries (core cannot import from cli/mcp)
- Follow modification order: types first, then implementation, then integration
- Use the correct @arch tags for each file
- Follow existing caching patterns if any exist in the codebase
