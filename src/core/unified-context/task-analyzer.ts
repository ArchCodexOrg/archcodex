/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Task analyzer for prompt discovery.
 * Analyzes task descriptions to suggest relevant modules using pure heuristics.
 */

import { getDbSync, getMeta } from '../db/manager.js';
import { initializeSchema } from '../db/schema.js';
import { FileRepository } from '../db/repositories/files.js';
import { EntityRepository } from '../db/repositories/entities.js';
import { DatabaseScanner } from '../db/scanner.js';
import { getGitCommitHash } from '../../utils/git.js';
import { loadIndex, matchQuery } from '../discovery/index.js';
import { extractTaskInfo, type ActionType } from './task-keywords.js';

export interface ModuleSuggestion {
  /** Module path */
  path: string;
  /** Confidence score 0-100 */
  confidence: number;
  /** Why this module was suggested */
  reason: string;
  /** File count in module */
  fileCount: number;
  /** Dominant architecture */
  architecture?: string;
}

export interface TaskAnalysis {
  /** Extracted keywords from task */
  keywords: string[];
  /** Detected entities (capitalized words that might be domain objects) */
  entities: string[];
  /** Detected action type */
  actionType: ActionType;
  /** Suggested modules sorted by confidence */
  suggestions: ModuleSuggestion[];
  /** Recommended scope */
  scope: 'single-file' | 'single-module' | 'multi-module';
  /** Recommended context level */
  contextLevel: 'brief' | 'compact' | 'full';
}

/**
 * Analyze a task description and suggest relevant modules.
 */
export async function analyzeTask(
  projectRoot: string,
  taskDescription: string
): Promise<TaskAnalysis> {
  // Extract keywords and entities
  const { keywords, entities, actionType } = extractTaskInfo(taskDescription);

  // Ensure database is ready
  const db = getDbSync(projectRoot);
  initializeSchema(db);

  const fileRepo = new FileRepository(db);
  const entityRepo = new EntityRepository(db);
  const scanner = new DatabaseScanner(db, projectRoot);

  // Auto-sync if needed
  const lastCommit = getMeta(db, 'last_git_commit');
  const currentCommit = getGitCommitHash(projectRoot);
  if (currentCommit && lastCommit !== currentCommit) {
    await scanner.incrementalSync();
  } else if (scanner.needsFullScan()) {
    await scanner.fullScan();
  }

  // Collect suggestions from multiple sources
  const suggestionMap = new Map<string, ModuleSuggestion>();

  // 1. Search by architecture keywords
  await searchByArchitecture(projectRoot, keywords, suggestionMap);

  // 2. Search by file path patterns
  searchByFilePath(keywords, fileRepo, suggestionMap);

  // 3. Search by entity references
  searchByEntities(entities, entityRepo, fileRepo, suggestionMap);

  // 4. Search by file content (grep-like)
  searchByContent(keywords, fileRepo, suggestionMap);

  // Convert to sorted array
  const suggestions = Array.from(suggestionMap.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10); // Top 10

  // Determine scope and context level
  const scope = determineScope(suggestions, actionType);
  const contextLevel = determineContextLevel(scope, actionType);

  return {
    keywords,
    entities,
    actionType,
    suggestions,
    scope,
    contextLevel,
  };
}

// extractTaskInfo is imported from ./task-keywords.js (shared with discovery/analyzer.ts)

/**
 * Search for modules by matching architecture keywords.
 */
async function searchByArchitecture(
  projectRoot: string,
  keywords: string[],
  suggestionMap: Map<string, ModuleSuggestion>
): Promise<void> {
  try {
    const index = await loadIndex(projectRoot);

    for (const keyword of keywords) {
      const matches = matchQuery(index, keyword, { limit: 5 });

      for (const match of matches) {
        // Find modules containing files with this architecture
        const db = getDbSync(projectRoot);
        const fileRepo = new FileRepository(db);
        const archId = match.entry.arch_id;
        const files = fileRepo.query({ archPattern: archId });

        // Group by module (first 2 path segments after src/)
        const moduleCounts = new Map<string, number>();
        for (const file of files) {
          const module = getModulePath(file.path);
          if (module) {
            moduleCounts.set(module, (moduleCounts.get(module) ?? 0) + 1);
          }
        }

        // Add suggestions - architecture matches rank lower than path matches
        for (const [modulePath, count] of moduleCounts) {
          const existing = suggestionMap.get(modulePath);
          // Architecture matches: 50-75% confidence (lower than path matches)
          const confidence = Math.min(75, 50 + match.score * 20 + count * 2);

          if (!existing || existing.confidence < confidence) {
            suggestionMap.set(modulePath, {
              path: modulePath,
              confidence,
              reason: `Architecture match: ${archId} (keyword: "${keyword}")`,
              fileCount: count,
              architecture: archId,
            });
          }
        }
      }
    }
  } catch { /* database index not available */
    // Index not available, skip architecture search
  }
}

/**
 * Search for modules by file path patterns.
 */
function searchByFilePath(
  keywords: string[],
  fileRepo: FileRepository,
  suggestionMap: Map<string, ModuleSuggestion>
): void {
  for (const keyword of keywords) {
    // Search for files with keyword in path
    const files = fileRepo.query({ pathPattern: `%${keyword}%` });

    // Group by module
    const moduleCounts = new Map<string, { count: number; archId?: string; directMatch: boolean }>();
    for (const file of files) {
      const module = getModulePath(file.path);
      if (module) {
        const existing = moduleCounts.get(module) ?? { count: 0, directMatch: false };
        existing.count++;
        if (file.archId) {
          existing.archId = file.archId;
        }
        // Check if keyword matches a directory name directly
        const pathParts = module.toLowerCase().split('/');
        if (pathParts.some(part => part === keyword || part.includes(keyword))) {
          existing.directMatch = true;
        }
        moduleCounts.set(module, existing);
      }
    }

    // Add suggestions - path matches rank highest
    for (const [modulePath, data] of moduleCounts) {
      const existing = suggestionMap.get(modulePath);
      // Direct directory match: 90-100%, path contains: 76-90%
      // Both rank higher than architecture matches (50-75%)
      const baseConfidence = data.directMatch ? 90 : 76;
      const confidence = Math.min(100, baseConfidence + Math.min(data.count, 10));

      if (!existing || existing.confidence < confidence) {
        const reason = data.directMatch
          ? `Directory "${keyword}" matches`
          : `Path contains "${keyword}"`;
        suggestionMap.set(modulePath, {
          path: modulePath,
          confidence,
          reason,
          fileCount: data.count,
          architecture: data.archId,
        });
      }
    }
  }
}

/**
 * Search for modules by entity references.
 */
function searchByEntities(
  entities: string[],
  entityRepo: EntityRepository,
  fileRepo: FileRepository,
  suggestionMap: Map<string, ModuleSuggestion>
): void {
  for (const entity of entities) {
    const files = entityRepo.getFilesForEntity(entity);

    // Group by module
    const moduleCounts = new Map<string, { count: number; archId?: string }>();
    for (const file of files) {
      const module = getModulePath(file.path);
      if (module) {
        const existing = moduleCounts.get(module) ?? { count: 0 };
        existing.count++;
        if (file.archId) {
          existing.archId = file.archId;
        }
        moduleCounts.set(module, existing);
      }
    }

    // Add suggestions with high confidence for entity matches
    for (const [modulePath, data] of moduleCounts) {
      const existing = suggestionMap.get(modulePath);
      const confidence = Math.min(95, 70 + data.count * 8);

      if (!existing || existing.confidence < confidence) {
        // Get total file count for the module
        const allFiles = fileRepo.query({ pathPattern: modulePath + '%' });

        suggestionMap.set(modulePath, {
          path: modulePath,
          confidence,
          reason: `References entity "${entity}"`,
          fileCount: allFiles.length,
          architecture: data.archId,
        });
      }
    }
  }
}

/**
 * Search by file content (using existing file scan data).
 */
function searchByContent(
  keywords: string[],
  fileRepo: FileRepository,
  suggestionMap: Map<string, ModuleSuggestion>
): void {
  // For now, we search by arch tag names which often contain domain keywords
  // Full content search would require grep integration

  for (const keyword of keywords) {
    // Search architectures containing the keyword
    const files = fileRepo.query({ archPattern: `%${keyword}%` });

    // Group by module
    const moduleCounts = new Map<string, { count: number; archId?: string }>();
    for (const file of files) {
      const module = getModulePath(file.path);
      if (module) {
        const existing = moduleCounts.get(module) ?? { count: 0 };
        existing.count++;
        if (file.archId) {
          existing.archId = file.archId;
        }
        moduleCounts.set(module, existing);
      }
    }

    // Add suggestions
    for (const [modulePath, data] of moduleCounts) {
      const existing = suggestionMap.get(modulePath);
      const confidence = Math.min(85, 40 + data.count * 10);

      if (!existing || existing.confidence < confidence) {
        suggestionMap.set(modulePath, {
          path: modulePath,
          confidence,
          reason: `Architecture contains "${keyword}"`,
          fileCount: data.count,
          architecture: data.archId,
        });
      }
    }
  }
}

/**
 * Extract module path from file path.
 * Handles various directory structures:
 * - src/core/db/ -> src/core/db/
 * - src/(app)/projects/ -> src/(app)/projects/
 * - lib/orders/ -> lib/orders/
 * - lib/utils/ -> lib/utils/
 */
function getModulePath(filePath: string): string | null {
  const parts = filePath.split('/').filter(p => p.length > 0);

  if (parts.length < 2) {
    return null;
  }

  // Common root directories to look for
  const rootDirs = ['src', 'convex', 'lib', 'app', 'pages', 'components', 'tests', 'test'];
  let rootIndex = -1;

  for (const root of rootDirs) {
    const idx = parts.indexOf(root);
    if (idx !== -1) {
      rootIndex = idx;
      break;
    }
  }

  if (rootIndex === -1) {
    // No common root found, use first two directories
    return parts.slice(0, 2).join('/') + '/';
  }

  // Get 2 levels after root (e.g., src/core/db/, lib/orders/)
  // Handle parenthetical dirs like (app) by including them
  let depth = 2;
  for (let i = rootIndex + 1; i < parts.length && depth < 3; i++) {
    // Parenthetical dirs like (app) are groupings, go one level deeper
    if (parts[i].startsWith('(') && parts[i].endsWith(')')) {
      depth++;
    }
  }

  const endIndex = Math.min(rootIndex + depth, parts.length);
  if (endIndex <= rootIndex + 1) {
    return null;
  }

  return parts.slice(rootIndex, endIndex).join('/') + '/';
}

/**
 * Determine task scope based on suggestions and action type.
 */
function determineScope(
  suggestions: ModuleSuggestion[],
  actionType: TaskAnalysis['actionType']
): TaskAnalysis['scope'] {
  if (suggestions.length === 0) {
    return 'single-module';
  }

  // If top suggestion has very high confidence and others are much lower
  if (suggestions.length === 1 ||
      (suggestions[0].confidence > 80 &&
       (suggestions.length < 2 || suggestions[0].confidence - suggestions[1].confidence > 30))) {
    // Check if it's a small module
    if (suggestions[0].fileCount <= 3) {
      return 'single-file';
    }
    return 'single-module';
  }

  // Refactoring often spans multiple modules
  if (actionType === 'refactor') {
    return 'multi-module';
  }

  // If multiple high-confidence suggestions
  const highConfidence = suggestions.filter(s => s.confidence >= 60);
  if (highConfidence.length >= 2) {
    return 'multi-module';
  }

  return 'single-module';
}

/**
 * Determine recommended context level.
 */
function determineContextLevel(
  scope: TaskAnalysis['scope'],
  actionType: TaskAnalysis['actionType']
): TaskAnalysis['contextLevel'] {
  // Simple tasks need less context
  if (scope === 'single-file' && (actionType === 'fix' || actionType === 'modify')) {
    return 'brief';
  }

  // Refactoring needs full context
  if (actionType === 'refactor' || scope === 'multi-module') {
    return 'full';
  }

  // Default to compact
  return 'compact';
}

/**
 * Format task analysis for display.
 */
export function formatTaskAnalysis(analysis: TaskAnalysis): string {
  const lines: string[] = [];

  lines.push('Task Analysis:');
  lines.push(`  Action: ${analysis.actionType}`);
  lines.push(`  Keywords: ${analysis.keywords.join(', ') || '(none)'}`);
  if (analysis.entities.length > 0) {
    lines.push(`  Entities: ${analysis.entities.join(', ')}`);
  }
  lines.push(`  Scope: ${analysis.scope}`);
  lines.push(`  Context: ${analysis.contextLevel}`);
  lines.push('');

  if (analysis.suggestions.length === 0) {
    lines.push('No module suggestions found.');
    lines.push('Try being more specific or check that the codebase is indexed.');
  } else {
    lines.push('Suggested Modules:');
    for (let i = 0; i < Math.min(5, analysis.suggestions.length); i++) {
      const s = analysis.suggestions[i];
      const arch = s.architecture ? ` [${s.architecture}]` : '';
      lines.push(`  ${i + 1}. ${s.path} (${s.confidence}% confidence)${arch}`);
      lines.push(`     ${s.reason} (${s.fileCount} files)`);
    }
  }

  return lines.join('\n');
}
