/**
 * @arch archcodex.cli.mcp.handler
 *
 * MCP tool handler for scaffolding operations.
 */
import { loadRegistry, loadIntentRegistry, suggestIntents } from '../../core/registry/loader.js';
import { ScaffoldEngine } from '../../core/scaffold/index.js';
import { loadIndex } from '../../core/discovery/index.js';

// ============================================================================
// SCAFFOLD HANDLER
// ============================================================================

export interface ScaffoldOptions {
  archId: string;
  name: string;
  output?: string;
  template?: string;
  dryRun?: boolean;
}

export async function handleScaffold(projectRoot: string, options: ScaffoldOptions) {
  const { archId, name, output, template, dryRun } = options;

  if (!archId || !name) {
    return {
      content: [{ type: 'text', text: 'Error: archId and name are required' }],
      isError: true,
    };
  }

  // Load registry for reference_implementations
  let registry;
  try {
    registry = await loadRegistry(projectRoot);
  } catch { /* registry optional */ }

  // Load intent registry for suggestions
  let intentRegistry;
  try {
    intentRegistry = await loadIntentRegistry(projectRoot);
  } catch { /* intent registry optional */ }

  const engine = new ScaffoldEngine(projectRoot, '.arch/templates', registry);
  const index = await loadIndex(projectRoot);

  // For dry-run, we still call scaffold but return the content without writing
  // The engine writes by default, so for true dry-run we'd need engine support
  // For now, just return what would be generated
  const result = await engine.scaffold(
    {
      archId,
      name,
      outputPath: output,
      template,
      overwrite: !dryRun, // Don't overwrite in dry-run mode
    },
    index,
  );

  // Get suggested intents if available
  let suggestedIntents: Array<{ name: string; reason: string }> = [];
  if (intentRegistry && result.filePath) {
    suggestedIntents = suggestIntents(intentRegistry, {
      filePath: result.filePath,
      archId,
    }).map(s => ({ name: s.name, reason: s.reason }));
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: result.success,
        archId,
        name,
        filePath: result.filePath,
        error: result.error,
        content: result.content,
        suggestedIntents: suggestedIntents.length > 0 ? suggestedIntents : undefined,
      }, null, 2),
    }],
  };
}
