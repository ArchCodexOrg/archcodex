/**
 * @arch archcodex.core.domain
 *
 * FeedbackStore - manages persistence of violation data for the feedback loop.
 * Stores violations in .arch/feedback.json for pattern analysis and recommendations.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { FeedbackData, ViolationEntry } from './types.js';
import type { ValidationResult } from '../validation/types.js';
import type { ConstraintRule } from '../registry/schema.js';
import { formatConstraintValue } from '../../utils/format.js';

const FEEDBACK_VERSION = '1.0';
const FEEDBACK_FILE = '.arch/feedback.json';

/**
 * Store for recording and retrieving violation feedback data.
 */
export class FeedbackStore {
  private projectRoot: string;
  private feedbackPath: string;
  private data: FeedbackData | null = null;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.feedbackPath = path.join(projectRoot, FEEDBACK_FILE);
  }

  /**
   * Load feedback data from disk.
   * Creates a new empty store if file doesn't exist.
   */
  async load(): Promise<FeedbackData> {
    if (this.data) {
      return this.data;
    }

    try {
      const content = await fs.readFile(this.feedbackPath, 'utf-8');
      this.data = JSON.parse(content) as FeedbackData;

      // Validate version
      if (this.data.version !== FEEDBACK_VERSION) {
        // For now, just migrate by resetting (future: proper migration)
        this.data = this.createEmptyData();
      }
    } catch {
      // File doesn't exist or is invalid - create empty
      this.data = this.createEmptyData();
    }

    return this.data;
  }

  /**
   * Save feedback data to disk.
   */
  async save(): Promise<void> {
    if (!this.data) {
      return;
    }

    this.data.metadata.lastUpdatedAt = new Date().toISOString();

    // Ensure .arch directory exists
    const archDir = path.dirname(this.feedbackPath);
    await fs.mkdir(archDir, { recursive: true });

    await fs.writeFile(
      this.feedbackPath,
      JSON.stringify(this.data, null, 2),
      'utf-8'
    );
  }

  /**
   * Record violations from validation results.
   */
  async recordViolations(results: ValidationResult[]): Promise<number> {
    await this.load();
    const timestamp = new Date().toISOString();
    let recordedCount = 0;

    for (const result of results) {
      // Record errors
      for (const violation of result.violations) {
        this.addEntry({
          rule: violation.rule,
          value: this.normalizeValue(violation.value),
          severity: violation.severity,
          file: result.file,
          archId: result.archId,
          timestamp,
          wasOverridden: false,
        });
        recordedCount++;
      }

      // Record warnings (including overridden violations)
      for (const warning of result.warnings) {
        const wasOverridden = warning.message.startsWith('[OVERRIDDEN]');
        this.addEntry({
          rule: warning.rule,
          value: this.normalizeValue(warning.value),
          severity: wasOverridden ? 'error' : warning.severity,
          file: result.file,
          archId: result.archId,
          timestamp,
          wasOverridden,
        });
        recordedCount++;
      }
    }

    await this.save();
    return recordedCount;
  }

  /**
   * Get all entries within a time period.
   */
  async getEntries(options: {
    days?: number;
    rule?: ConstraintRule;
    file?: string;
  } = {}): Promise<ViolationEntry[]> {
    await this.load();
    let entries = this.data!.entries;

    // Filter by time period
    if (options.days) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - options.days);
      const cutoffStr = cutoff.toISOString();
      entries = entries.filter((e) => e.timestamp >= cutoffStr);
    }

    // Filter by rule
    if (options.rule) {
      entries = entries.filter((e) => e.rule === options.rule);
    }

    // Filter by file
    if (options.file) {
      entries = entries.filter((e) => e.file === options.file);
    }

    return entries;
  }

  /**
   * Clear entries older than a certain number of days.
   */
  async pruneOldEntries(daysToKeep: number): Promise<number> {
    await this.load();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);
    const cutoffStr = cutoff.toISOString();

    const originalCount = this.data!.entries.length;
    this.data!.entries = this.data!.entries.filter(
      (e) => e.timestamp >= cutoffStr
    );
    const prunedCount = originalCount - this.data!.entries.length;

    if (prunedCount > 0) {
      await this.save();
    }

    return prunedCount;
  }

  /**
   * Clear all feedback data.
   */
  async clear(): Promise<void> {
    this.data = this.createEmptyData();
    await this.save();
  }

  /**
   * Check if feedback file exists.
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.feedbackPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Add an entry to the store.
   */
  private addEntry(entry: ViolationEntry): void {
    if (!this.data) {
      throw new Error('FeedbackStore not loaded');
    }
    this.data.entries.push(entry);
  }

  /**
   * Normalize constraint value to string.
   */
  private normalizeValue(value: unknown): string {
    return formatConstraintValue(value);
  }

  /**
   * Create empty feedback data structure.
   */
  private createEmptyData(): FeedbackData {
    const now = new Date().toISOString();
    return {
      version: FEEDBACK_VERSION,
      entries: [],
      metadata: {
        createdAt: now,
        lastUpdatedAt: now,
        projectRoot: this.projectRoot,
      },
    };
  }
}
