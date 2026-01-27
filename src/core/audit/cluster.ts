/**
 * @arch archcodex.core.domain
 *
 * Override clustering for intent promotion suggestions.
 * Groups overrides by constraint pattern and suggests intent names.
 */
import type { AuditReport, OverrideCluster } from './types.js';

/**
 * Cluster overrides by rule:value pattern.
 * Returns clusters with 2+ files, sorted by file count descending.
 */
export function clusterOverrides(report: AuditReport): OverrideCluster[] {
  // Group overrides by "rule:value" key
  const groups = new Map<string, { files: Set<string>; reasons: Set<string> }>();

  for (const file of report.files) {
    for (const override of file.overrides) {
      const key = `${override.rule}:${override.value}`;
      let group = groups.get(key);
      if (!group) {
        group = { files: new Set(), reasons: new Set() };
        groups.set(key, group);
      }
      group.files.add(file.filePath);
      if (override.reason) {
        group.reasons.add(override.reason);
      }
    }
  }

  // Filter to clusters with 2+ unique files
  const clusters: OverrideCluster[] = [];
  for (const [constraintKey, group] of groups) {
    if (group.files.size < 2) continue;

    const files = Array.from(group.files).sort();
    const commonReasons = Array.from(group.reasons);
    const suggestedIntent = deriveIntentName(constraintKey, commonReasons);
    const escapedKey = constraintKey.includes(' ') ? `"${constraintKey}"` : constraintKey;

    clusters.push({
      constraintKey,
      fileCount: files.length,
      files,
      commonReasons,
      suggestedIntent,
      promoteCommand: `archcodex promote ${escapedKey} --intent ${suggestedIntent} --apply`,
    });
  }

  // Sort by file count descending
  clusters.sort((a, b) => b.fileCount - a.fileCount);
  return clusters;
}

/**
 * Derive a suggested intent name from the constraint key and common reasons.
 */
function deriveIntentName(constraintKey: string, reasons: string[]): string {
  // Try to extract meaningful terms from reasons
  if (reasons.length > 0) {
    const slug = extractKeyTerms(reasons);
    if (slug) return slug;
  }

  // Fallback: derive from the constraint value
  const colonIdx = constraintKey.indexOf(':');
  const value = colonIdx >= 0 ? constraintKey.slice(colonIdx + 1) : constraintKey;
  return `allows-${slugify(value)}`;
}

/**
 * Extract key terms from reason texts and slugify them.
 */
function extractKeyTerms(reasons: string[]): string | null {
  // Combine all reasons, extract 2-3 word phrases
  const combined = reasons.join(' ').toLowerCase();

  // Common meaningful patterns in override reasons
  const patterns: Array<{ regex: RegExp; intent: string }> = [
    { regex: /\bcli\s*(output|command|interface)\b/, intent: 'cli-output' },
    { regex: /\b(console|stdout|stderr)\s*(output|logging)?\b/, intent: 'cli-output' },
    { regex: /\blegacy\s*(code|migration|support)?\b/, intent: 'legacy-support' },
    { regex: /\b(canonical|registry)\s*(loader|infrastructure)?\b/, intent: 'registry-infrastructure' },
    { regex: /\b(entry\s*point|bootstrap|startup)\b/, intent: 'entry-point' },
    { regex: /\b(test|testing|spec)\b/, intent: 'test-infrastructure' },
    { regex: /\b(documentation|docs|examples?)\b/, intent: 'documentation-examples' },
    { regex: /\b(admin|administrative)\b/, intent: 'admin-only' },
    { regex: /\b(debug|debugging)\b/, intent: 'debug-output' },
  ];

  for (const { regex, intent } of patterns) {
    if (regex.test(combined)) {
      return intent;
    }
  }

  // Extract most common noun phrases (simple heuristic)
  const words = combined
    .replace(/[^a-z\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .filter(w => !STOP_WORDS.has(w));

  if (words.length >= 2) {
    return slugify(words.slice(0, 3).join(' '));
  }
  if (words.length === 1) {
    return `allows-${words[0]}`;
  }

  return null;
}

/**
 * Convert a string to a kebab-case slug suitable for intent names.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30);
}

const STOP_WORDS = new Set([
  'need', 'needs', 'this', 'that', 'with', 'from', 'have', 'been',
  'will', 'file', 'files', 'code', 'used', 'uses', 'must', 'should',
  'because', 'since', 'also', 'just', 'only', 'here', 'there',
  'some', 'other', 'each', 'they', 'them', 'their', 'these', 'those',
]);
