/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Enhanced task analyzer with multi-signal ranking, clarifying questions,
 * and learning-to-rank feedback.
 */

import type Database from 'better-sqlite3';
import { getDbSync, getMeta } from '../../db/manager.js';
import { initializeSchema } from '../../db/schema.js';
import { FileRepository } from '../../db/repositories/files.js';
import { EntityRepository } from '../../db/repositories/entities.js';
import { DatabaseScanner } from '../../db/scanner.js';
import { getGitCommitHash } from '../../../utils/git.js';
import { loadIndex, matchQuery } from '../../discovery/index.js';
import { extractTaskInfo } from '../task-keywords.js';
import type {
  EnhancedTaskAnalysis,
  RankedModule,
  RankingSignal,
  RankingWeights,
  ClarifyingQuestion,
  ClarifyingAnswers,
} from './types.js';
import { DEFAULT_WEIGHTS } from './types.js';
import { rankModules, needsClarification, applyBoosts } from './ranker.js';
import { generateQuestions, parseAnswers } from './questions.js';
import { initializeFeedbackSchema, calculateFeedbackBoost, recordFeedback } from './feedback.js';

// Re-export for convenience
export { DEFAULT_WEIGHTS } from './types.js';
export type { EnhancedTaskAnalysis, RankedModule, ClarifyingQuestion, ClarifyingAnswers };

// Shared constants (ACTION_PATTERNS, STOP_WORDS, etc.) and extractTaskInfo
// are imported from ../task-keywords.js to avoid duplication with task-analyzer.ts

/**
 * Enhanced task analyzer options.
 */
export interface AnalyzerOptions {
  /** Custom ranking weights */
  weights?: RankingWeights;
  /** Whether to generate clarifying questions */
  generateQuestions?: boolean;
  /** Whether to include model targeting question */
  includeModelQuestion?: boolean;
  /** Whether to use feedback for ranking */
  useFeedback?: boolean;
  /** Maximum number of suggestions to return */
  limit?: number;
}

/**
 * Analyze a task with multi-signal ranking.
 */
export async function analyzeTaskEnhanced(
  projectRoot: string,
  taskDescription: string,
  options: AnalyzerOptions = {}
): Promise<EnhancedTaskAnalysis> {
  const {
    weights = DEFAULT_WEIGHTS,
    generateQuestions: shouldGenerateQuestions = true,
    includeModelQuestion = false,
    useFeedback = true,
    limit = 10,
  } = options;

  // Extract keywords and entities
  const { keywords, entities, actionType } = extractTaskInfo(taskDescription);

  // Initialize database
  const db = getDbSync(projectRoot);
  initializeSchema(db);
  if (useFeedback) {
    initializeFeedbackSchema(db);
  }

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

  // Collect signals per module
  const moduleSignals = new Map<string, RankingSignal[]>();

  // Signal 1: Path matching (highest priority)
  collectPathSignals(keywords, fileRepo, moduleSignals);

  // Signal 2: Entity matching
  collectEntitySignals(entities, entityRepo, fileRepo, moduleSignals);

  // Signal 3: Architecture matching
  await collectArchitectureSignals(projectRoot, keywords, fileRepo, moduleSignals);

  // Signal 4: Feedback boost (if enabled)
  if (useFeedback) {
    applyFeedbackSignals(db, keywords, moduleSignals);
  }

  // Rank modules using combined signals
  let suggestions = rankModules(moduleSignals, weights);

  // Limit results
  suggestions = suggestions.slice(0, limit);

  // Generate clarifying questions if requested or if results are ambiguous
  let clarifyingQuestions: ClarifyingQuestion[] = [];
  const needsClarity = needsClarification(suggestions);

  // Always generate questions if explicitly requested (--interactive mode)
  // Otherwise only generate when results are ambiguous
  if (shouldGenerateQuestions) {
    clarifyingQuestions = generateQuestions(keywords, suggestions, actionType, {
      includeModelQuestion,
      detectedEntities: entities,
    });
  }

  // Determine scope
  const scope = determineScope(suggestions, actionType);

  return {
    task: taskDescription,
    keywords,
    entities,
    actionType,
    suggestions,
    clarifyingQuestions,
    scope,
    needsClarification: needsClarity,
  };
}

/**
 * Result of refining analysis with answers.
 */
export interface RefinedAnalysis {
  analysis: EnhancedTaskAnalysis;
  /** Selected model if user answered the model question */
  selectedModel?: 'haiku' | 'sonnet' | 'opus';
  /** Selected scope if user answered the scope question */
  selectedScope?: 'ui-only' | 'logic-only' | 'data-only' | 'full';
  /** Whether to include entity context in prompt */
  includeEntityContext?: boolean;
}

/**
 * Refine analysis with clarifying question answers.
 */
export function refineWithAnswers(
  analysis: EnhancedTaskAnalysis,
  answers: string
): RefinedAnalysis {
  const { boostKeywords, boostPaths, selectedModel, selectedScope, includeEntityContext } = parseAnswers(
    analysis.clarifyingQuestions,
    answers
  );

  const refinedSuggestions = applyBoosts(
    analysis.suggestions,
    boostKeywords,
    boostPaths
  );

  return {
    analysis: {
      ...analysis,
      suggestions: refinedSuggestions,
      needsClarification: false,
      clarifyingQuestions: [],
    },
    selectedModel,
    selectedScope,
    includeEntityContext,
  };
}

/**
 * Record user selection for learning.
 */
export function recordSelection(
  projectRoot: string,
  task: string,
  keywords: string[],
  selectedModules: string[],
  shownModules: string[]
): void {
  const db = getDbSync(projectRoot);
  initializeFeedbackSchema(db);
  recordFeedback(db, task, keywords, selectedModules, shownModules);
}

// extractTaskInfo is imported from ../task-keywords.js (shared module)

/**
 * Collect path-based signals (highest priority).
 */
function collectPathSignals(
  keywords: string[],
  fileRepo: FileRepository,
  moduleSignals: Map<string, RankingSignal[]>
): void {
  for (const keyword of keywords) {
    const files = fileRepo.query({ pathPattern: `%${keyword}%` });

    const moduleCounts = new Map<string, { count: number; directMatch: boolean; archId?: string }>();

    for (const file of files) {
      // Pass keyword to include feature directories (e.g., src/components/orders/)
      const module = getModulePath(file.path, keyword);
      if (!module) continue;

      const existing = moduleCounts.get(module) ?? { count: 0, directMatch: false };
      existing.count++;
      if (file.archId) existing.archId = file.archId;

      // Check for direct directory name match
      const pathParts = module.toLowerCase().split('/');
      if (pathParts.some(part => part === keyword || part.includes(keyword))) {
        existing.directMatch = true;
      }

      moduleCounts.set(module, existing);
    }

    for (const [modulePath, data] of moduleCounts) {
      const signals = moduleSignals.get(modulePath) ?? [];

      // Direct match = 0.9-1.0, contains = 0.6-0.85
      const baseScore = data.directMatch ? 0.9 : 0.6;
      const countBonus = Math.min(0.1, data.count * 0.02);

      signals.push({
        type: 'path',
        score: baseScore + countBonus,
        reason: data.directMatch
          ? `Directory "${keyword}" matches`
          : `Path contains "${keyword}"`,
        metadata: { fileCount: data.count, architecture: data.archId },
      });

      moduleSignals.set(modulePath, signals);
    }
  }
}

/**
 * Collect entity-based signals.
 */
function collectEntitySignals(
  entities: string[],
  entityRepo: EntityRepository,
  _fileRepo: FileRepository,
  moduleSignals: Map<string, RankingSignal[]>
): void {
  for (const entity of entities) {
    const files = entityRepo.getFilesForEntity(entity);

    const moduleCounts = new Map<string, { count: number; archId?: string }>();

    for (const file of files) {
      const module = getModulePath(file.path);
      if (!module) continue;

      const existing = moduleCounts.get(module) ?? { count: 0 };
      existing.count++;
      if (file.archId) existing.archId = file.archId;
      moduleCounts.set(module, existing);
    }

    for (const [modulePath, data] of moduleCounts) {
      const signals = moduleSignals.get(modulePath) ?? [];

      // Entity matches get 0.7-0.9 score
      const score = 0.7 + Math.min(0.2, data.count * 0.05);

      signals.push({
        type: 'entity',
        score,
        reason: `References entity "${entity}"`,
        metadata: { fileCount: data.count, architecture: data.archId },
      });

      moduleSignals.set(modulePath, signals);
    }
  }
}

/**
 * Collect architecture-based signals.
 */
async function collectArchitectureSignals(
  projectRoot: string,
  keywords: string[],
  fileRepo: FileRepository,
  moduleSignals: Map<string, RankingSignal[]>
): Promise<void> {
  try {
    const index = await loadIndex(projectRoot);

    for (const keyword of keywords) {
      const matches = matchQuery(index, keyword, { limit: 5 });

      for (const match of matches) {
        const archId = match.entry.arch_id;
        const files = fileRepo.query({ archPattern: archId });

        const moduleCounts = new Map<string, number>();
        for (const file of files) {
          const module = getModulePath(file.path);
          if (module) {
            moduleCounts.set(module, (moduleCounts.get(module) ?? 0) + 1);
          }
        }

        for (const [modulePath, count] of moduleCounts) {
          const signals = moduleSignals.get(modulePath) ?? [];

          // Architecture matches: 0.4-0.7 (lower than path matches)
          const score = 0.4 + match.score * 0.25 + Math.min(0.05, count * 0.01);

          signals.push({
            type: 'architecture',
            score,
            reason: `Architecture "${archId}" (keyword: "${keyword}")`,
            metadata: { fileCount: count, architecture: archId },
          });

          moduleSignals.set(modulePath, signals);
        }
      }
    }
  } catch { /* database index not available */
    // Index not available, skip
  }
}

/**
 * Apply feedback-based signals.
 */
function applyFeedbackSignals(
  db: Database.Database,
  keywords: string[],
  moduleSignals: Map<string, RankingSignal[]>
): void {
  for (const [modulePath, signals] of moduleSignals) {
    const boost = calculateFeedbackBoost(db, keywords, modulePath);

    if (boost !== 0) {
      signals.push({
        type: 'feedback',
        score: 0.5 + boost, // Center at 0.5, range 0.4-0.6
        reason: boost > 0 ? 'Frequently selected' : 'Rarely selected',
        metadata: { boost },
      });
    }
  }
}

/**
 * Extract module path from file path.
 * Normalizes barrel files (e.g., src/modules/orders.ts) to their directory equivalent (src/modules/orders/).
 */
function getModulePath(filePath: string, targetKeyword?: string): string | null {
  const parts = filePath.split('/').filter(p => p.length > 0);
  if (parts.length < 2) return null;

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
    return parts.slice(0, 2).join('/') + '/';
  }

  // Base depth depends on structure:
  // - lib/orders/ → depth 2
  // - src/modules/orders/ → depth 3
  // - src/app/(app)/dashboard/ → depth 3 + route groups
  let depth = parts[rootIndex] === 'src' ? 3 : 2;

  // Account for Next.js route groups (app)
  for (let i = rootIndex + 1; i < parts.length && i < rootIndex + depth + 2; i++) {
    if (parts[i].startsWith('(') && parts[i].endsWith(')')) {
      depth++;
    }
  }

  // If a target keyword is provided, extend depth to include it
  if (targetKeyword) {
    const keywordLower = targetKeyword.toLowerCase();
    for (let i = rootIndex + 1; i < parts.length - 1; i++) {
      const part = parts[i].toLowerCase();
      if (part === keywordLower || part.includes(keywordLower)) {
        depth = Math.max(depth, i - rootIndex + 1);
        break;
      }
    }
  }

  const endIndex = Math.min(rootIndex + depth, parts.length);
  if (endIndex <= rootIndex + 1) return null;

  const moduleParts = parts.slice(rootIndex, endIndex);

  // Normalize barrel files: src/modules/orders.ts → src/modules/orders/
  // This merges barrel files with their corresponding directories
  const lastPart = moduleParts[moduleParts.length - 1];
  if (lastPart.includes('.') && moduleParts.length === 2) {
    // It's a file directly under root (e.g., lib/orders.ts)
    // Strip extension to get directory name (orders.ts → orders)
    const baseName = lastPart.replace(/\.[^.]+$/, '');
    moduleParts[moduleParts.length - 1] = baseName;
  }

  return moduleParts.join('/') + '/';
}

/**
 * Determine scope based on suggestions.
 */
function determineScope(
  suggestions: RankedModule[],
  actionType: EnhancedTaskAnalysis['actionType']
): EnhancedTaskAnalysis['scope'] {
  if (suggestions.length === 0) return 'single-module';

  if (suggestions.length === 1 ||
      (suggestions[0].confidence > 80 &&
       (suggestions.length < 2 || suggestions[0].confidence - suggestions[1].confidence > 30))) {
    if (suggestions[0].fileCount <= 3) return 'single-file';
    return 'single-module';
  }

  if (actionType === 'refactor') return 'multi-module';

  const highConfidence = suggestions.filter(s => s.confidence >= 60);
  if (highConfidence.length >= 2) return 'multi-module';

  return 'single-module';
}

/**
 * Format enhanced analysis for display.
 */
export function formatEnhancedAnalysis(analysis: EnhancedTaskAnalysis): string {
  const lines: string[] = [];

  lines.push('Task Analysis:');
  lines.push(`  Action: ${analysis.actionType}`);
  lines.push(`  Keywords: ${analysis.keywords.join(', ') || '(none)'}`);
  if (analysis.entities.length > 0) {
    lines.push(`  Entities: ${analysis.entities.join(', ')}`);
  }
  lines.push(`  Scope: ${analysis.scope}`);
  lines.push('');

  if (analysis.suggestions.length === 0) {
    lines.push('No module suggestions found.');
  } else {
    lines.push('Suggested Modules:');
    for (let i = 0; i < Math.min(5, analysis.suggestions.length); i++) {
      const s = analysis.suggestions[i];
      const arch = s.architecture ? ` [${s.architecture}]` : '';
      lines.push(`  ${i + 1}. ${s.path} (${s.confidence}%)${arch}`);
      lines.push(`     ${s.primaryReason} (${s.fileCount} files)`);

      // Show signal breakdown
      if (s.signals.length > 1) {
        const signalSummary = s.signals
          .map(sig => `${sig.type}:${Math.round(sig.score * 100)}%`)
          .join(', ');
        lines.push(`     Signals: ${signalSummary}`);
      }
    }
  }

  return lines.join('\n');
}
