/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Feedback storage for learning-to-rank.
 * Tracks user selections to improve future rankings.
 */

import type Database from 'better-sqlite3';
import type { SelectionFeedback } from './types.js';
import { createHash } from 'crypto';

/**
 * Initialize feedback schema in the database.
 */
export function initializeFeedbackSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS discovery_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_hash TEXT NOT NULL,
      keywords TEXT NOT NULL,
      selected_modules TEXT NOT NULL,
      ignored_modules TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_feedback_keywords
    ON discovery_feedback(keywords);

    CREATE INDEX IF NOT EXISTS idx_feedback_timestamp
    ON discovery_feedback(timestamp);
  `);
}

/**
 * Record user selection feedback.
 */
export function recordFeedback(
  db: Database.Database,
  task: string,
  keywords: string[],
  selectedModules: string[],
  shownModules: string[]
): void {
  const taskHash = hashTask(task);
  const ignoredModules = shownModules.filter(m => !selectedModules.includes(m));

  const stmt = db.prepare(`
    INSERT INTO discovery_feedback
    (task_hash, keywords, selected_modules, ignored_modules, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(
    taskHash,
    JSON.stringify(keywords),
    JSON.stringify(selectedModules),
    JSON.stringify(ignoredModules),
    Date.now()
  );
}

/**
 * Get feedback statistics for a keyword.
 */
export function getKeywordStats(
  db: Database.Database,
  keyword: string
): Map<string, { selected: number; ignored: number }> {
  const stats = new Map<string, { selected: number; ignored: number }>();

  const stmt = db.prepare(`
    SELECT selected_modules, ignored_modules
    FROM discovery_feedback
    WHERE keywords LIKE ?
    ORDER BY timestamp DESC
    LIMIT 100
  `);

  const rows = stmt.all(`%"${keyword}"%`) as Array<{
    selected_modules: string;
    ignored_modules: string;
  }>;

  for (const row of rows) {
    const selected = JSON.parse(row.selected_modules) as string[];
    const ignored = JSON.parse(row.ignored_modules) as string[];

    for (const module of selected) {
      const current = stats.get(module) ?? { selected: 0, ignored: 0 };
      current.selected++;
      stats.set(module, current);
    }

    for (const module of ignored) {
      const current = stats.get(module) ?? { selected: 0, ignored: 0 };
      current.ignored++;
      stats.set(module, current);
    }
  }

  return stats;
}

/**
 * Calculate feedback boost for a module based on historical selections.
 */
export function calculateFeedbackBoost(
  db: Database.Database,
  keywords: string[],
  modulePath: string
): number {
  let totalSelected = 0;
  let totalIgnored = 0;

  for (const keyword of keywords) {
    const stats = getKeywordStats(db, keyword);
    const moduleStats = stats.get(modulePath);
    if (moduleStats) {
      totalSelected += moduleStats.selected;
      totalIgnored += moduleStats.ignored;
    }
  }

  const total = totalSelected + totalIgnored;
  if (total === 0) return 0;

  // Selection rate: 0 to 1
  const selectionRate = totalSelected / total;

  // Convert to boost: -0.1 to +0.1
  // Frequently selected = positive boost
  // Frequently ignored = negative boost
  return (selectionRate - 0.5) * 0.2;
}

/**
 * Get all feedback entries for analysis.
 */
export function getAllFeedback(db: Database.Database): SelectionFeedback[] {
  const stmt = db.prepare(`
    SELECT task_hash, keywords, selected_modules, ignored_modules, timestamp
    FROM discovery_feedback
    ORDER BY timestamp DESC
    LIMIT 1000
  `);

  const rows = stmt.all() as Array<{
    task_hash: string;
    keywords: string;
    selected_modules: string;
    ignored_modules: string;
    timestamp: number;
  }>;

  return rows.map(row => ({
    taskHash: row.task_hash,
    keywords: JSON.parse(row.keywords),
    selectedModules: JSON.parse(row.selected_modules),
    ignoredModules: JSON.parse(row.ignored_modules),
    timestamp: row.timestamp,
  }));
}

/**
 * Clean up old feedback entries (older than 30 days).
 */
export function cleanupOldFeedback(db: Database.Database): number {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const stmt = db.prepare(`
    DELETE FROM discovery_feedback
    WHERE timestamp < ?
  `);

  const result = stmt.run(thirtyDaysAgo);
  return result.changes;
}

/**
 * Hash a task description for grouping similar tasks.
 */
function hashTask(task: string): string {
  // Normalize: lowercase, remove extra spaces, sort words
  const normalized = task
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .sort()
    .join(' ');

  return createHash('md5').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Get co-selection patterns (modules frequently selected together).
 */
export function getCoSelectionPatterns(
  db: Database.Database
): Map<string, string[]> {
  const patterns = new Map<string, string[]>();

  const stmt = db.prepare(`
    SELECT selected_modules
    FROM discovery_feedback
    WHERE json_array_length(selected_modules) > 1
    ORDER BY timestamp DESC
    LIMIT 200
  `);

  const rows = stmt.all() as Array<{ selected_modules: string }>;

  for (const row of rows) {
    const modules = JSON.parse(row.selected_modules) as string[];
    if (modules.length < 2) continue;

    // Record each pair
    for (let i = 0; i < modules.length; i++) {
      for (let j = i + 1; j < modules.length; j++) {
        const existing = patterns.get(modules[i]) ?? [];
        if (!existing.includes(modules[j])) {
          existing.push(modules[j]);
        }
        patterns.set(modules[i], existing);

        // Bidirectional
        const existing2 = patterns.get(modules[j]) ?? [];
        if (!existing2.includes(modules[i])) {
          existing2.push(modules[i]);
        }
        patterns.set(modules[j], existing2);
      }
    }
  }

  return patterns;
}
