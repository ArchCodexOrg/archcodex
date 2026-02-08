/**
 * @arch archcodex.cli.mcp.handler
 *
 * MCP tool handler for feature audit - comprehensive verification across layers.
 *
 * @see spec.archcodex.featureAudit in .arch/specs/archcodex/feature-audit.spec.yaml
 */
import {
  featureAudit,
  type FeatureAuditResult,
} from '../../core/audit/index.js';
import { isProjectInitialized, findNearbyProject } from '../utils.js';

// ============================================================================
// FEATURE AUDIT HANDLER
// ============================================================================

export interface FeatureAuditOptions {
  mutation?: string;
  entity?: string;
  verbose?: boolean;
}

/**
 * Handle feature audit MCP tool request.
 * Verifies feature implementation across backend, frontend, and UI layers.
 */
export async function handleFeatureAudit(
  projectRoot: string,
  options: FeatureAuditOptions = {}
) {
  try {
    // Validate project is initialized
    const isInitialized = await isProjectInitialized(projectRoot);
    if (!isInitialized) {
      const nearbyProject = await findNearbyProject(projectRoot);

      return {
        content: [{
          type: 'text',
          text: `Error: Project not initialized with ArchCodex.\n\n` +
            `Project root: ${projectRoot}\n` +
            `Expected .arch/ directory not found.\n\n` +
            (nearbyProject
              ? `Found nearby project: ${nearbyProject}\n` +
                `Use: archcodex_feature_audit with projectRoot="${nearbyProject}"\n\n`
              : `To initialize this project, run:\n` +
                `  cd ${projectRoot}\n` +
                `  archcodex init\n\n`) +
            `Or provide the correct project root using the projectRoot parameter.`,
        }],
        isError: true,
      };
    }

    // Validate inputs
    if (!options.mutation && !options.entity) {
      return {
        content: [{
          type: 'text',
          text: formatUsageHelp(),
        }],
      };
    }

    // Run the audit
    const result = await featureAudit({
      mutation: options.mutation,
      entity: options.entity,
      projectRoot,
      verbose: options.verbose,
    });

    return {
      content: [{
        type: 'text',
        text: formatAuditResult(result, options.verbose),
      }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      content: [{
        type: 'text',
        text: `Error running feature audit: ${errorMessage}\n\n` +
          `Project root: ${projectRoot}\n\n` +
          `Try checking:\n` +
          `  1. Is the project root correct?\n` +
          `  2. Does .arch/component-groups.yaml exist for UI checks?\n` +
          `  3. Run: archcodex feature-audit --help for CLI usage.`,
      }],
      isError: true,
    };
  }
}

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

/**
 * Format usage help message.
 */
function formatUsageHelp(): string {
  return `# Feature Audit

Verify feature implementation across backend, frontend, and UI layers.

## Parameters

- **mutation**: Mutation name to audit (e.g., 'duplicateEntry')
- **entity**: Entity name for UI component group matching (e.g., 'products')
- **verbose**: Show detailed information (default: false)

## Usage Examples

\`\`\`
// Audit a mutation
archcodex_feature_audit({ mutation: "duplicateEntry" })

// Audit with entity for UI layer checking
archcodex_feature_audit({ mutation: "duplicateProduct", entity: "products" })

// Entity-only audit (UI layer focus)
archcodex_feature_audit({ entity: "products" })
\`\`\`

## What It Checks

**Backend Layer** (requires mutation):
- Mutation exists in convex/
- Mutation is exported from barrel (index.ts)

**Frontend Layer** (requires mutation):
- Hook wrapper exists (useMutation)
- Handler function exists

**UI Layer** (requires entity with component group):
- Each component in matched group references the handler
`;
}

/**
 * Format audit result for MCP output.
 */
function formatAuditResult(result: FeatureAuditResult, verbose = false): string {
  const lines: string[] = [];

  // Status header
  const statusEmoji = result.status === 'complete' ? '✅' : result.status === 'incomplete' ? '⚠️' : '❌';
  lines.push(`# Feature Audit: ${statusEmoji} ${result.status.toUpperCase()}`);
  lines.push('');

  // Backend layer
  lines.push('## Backend Layer');
  if (result.layers.backend.status === 'skip') {
    lines.push('_Skipped (no mutation provided)_');
  } else {
    const backendStatus = result.layers.backend.status === 'pass' ? '✅' : '❌';
    lines.push(`Status: ${backendStatus} ${result.layers.backend.status}`);
    lines.push('');
    for (const check of result.layers.backend.checks) {
      const checkEmoji = check.status === 'found' ? '✅' : '❌';
      const implLabel = formatImplStatus(check.implementationStatus, check.stubReason);
      lines.push(`- ${checkEmoji} ${check.name}${implLabel}`);
      if (check.file) {
        lines.push(`  - File: ${check.file}`);
      }
      if (check.status !== 'found' && check.expected && verbose) {
        lines.push(`  - Expected: ${check.expected}`);
      }
    }
  }
  lines.push('');

  // Frontend layer
  lines.push('## Frontend Layer');
  if (result.layers.frontend.status === 'skip') {
    lines.push('_Skipped (no mutation provided)_');
  } else {
    const frontendStatus = result.layers.frontend.status === 'pass' ? '✅' : '❌';
    lines.push(`Status: ${frontendStatus} ${result.layers.frontend.status}`);
    lines.push('');
    for (const check of result.layers.frontend.checks) {
      const checkEmoji = check.status === 'found' ? '✅' : '❌';
      const implLabel = formatImplStatus(check.implementationStatus, check.stubReason);
      lines.push(`- ${checkEmoji} ${check.name}${implLabel}`);
      if (check.file) {
        lines.push(`  - File: ${check.file}`);
      }
      if (check.status !== 'found' && check.expected && verbose) {
        lines.push(`  - Expected: ${check.expected}`);
      }
    }
  }
  lines.push('');

  // UI layer
  lines.push('## UI Layer');
  if (result.layers.ui.status === 'skip') {
    lines.push('_Skipped (no component group matched)_');
  } else {
    const uiStatus = result.layers.ui.status === 'pass' ? '✅' : '❌';
    lines.push(`Status: ${uiStatus} ${result.layers.ui.status}`);
    if (result.layers.ui.componentGroup) {
      lines.push(`Component Group: ${result.layers.ui.componentGroup}`);
    }
    lines.push('');
    for (const check of result.layers.ui.checks) {
      const checkEmoji = check.status === 'wired' ? '✅' : check.status === 'partial' ? '⚠️' : '❌';
      const implLabel = formatImplStatus(check.implementationStatus, check.stubReason);
      lines.push(`- ${checkEmoji} ${check.component} (${check.status})${implLabel}`);
      if (check.details && verbose) {
        lines.push(`  - ${check.details}`);
      }
    }
  }
  lines.push('');

  // Remediation
  if (result.remediation.length > 0) {
    lines.push('## Remediation');
    for (const item of result.remediation) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }

  // Summary
  lines.push('---');
  lines.push(result.summary);

  return lines.join('\n');
}

/**
 * Format implementation status label for output.
 */
function formatImplStatus(
  status?: string,
  reason?: string
): string {
  if (!status) return '';
  if (status === 'stub') {
    return reason ? ` [stub: ${reason}]` : ' [stub]';
  }
  if (status === 'implemented') {
    return ' [implemented]';
  }
  return '';
}
