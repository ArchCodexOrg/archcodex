/**
 * @arch archcodex.util
 *
 * Audit statistics extraction for health analysis.
 */
import type { ConstraintStats, ArchOverrideStats, FileOverrideStats } from './types.js';

/** Audit report shape for stats extraction. */
export interface AuditReportForStats {
  files: Array<{
    filePath: string;
    archId: string | null;
    overrides: Array<{
      rule: string;
      value: string;
    }>;
  }>;
}

/**
 * Find top violated constraints (most overridden).
 */
export function findTopViolatedConstraints(auditReport: AuditReportForStats): ConstraintStats[] {
  const constraintMap = new Map<string, { count: number; files: string[] }>();

  for (const file of auditReport.files) {
    for (const override of file.overrides) {
      const key = `${override.rule}:${override.value}`;
      const existing = constraintMap.get(key) || { count: 0, files: [] };
      existing.count++;
      if (!existing.files.includes(file.filePath)) {
        existing.files.push(file.filePath);
      }
      constraintMap.set(key, existing);
    }
  }

  const sorted = Array.from(constraintMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  return sorted.map(([constraint, data]) => ({
    constraint,
    overrideCount: data.count,
    files: data.files,
  }));
}

/**
 * Find architectures with the most overrides.
 */
export function findTopOverriddenArchitectures(auditReport: AuditReportForStats): ArchOverrideStats[] {
  const archMap = new Map<string, { overrideCount: number; filesWithOverrides: number }>();

  for (const file of auditReport.files) {
    if (!file.archId || file.overrides.length === 0) continue;

    const existing = archMap.get(file.archId) || { overrideCount: 0, filesWithOverrides: 0 };
    existing.overrideCount += file.overrides.length;
    existing.filesWithOverrides++;
    archMap.set(file.archId, existing);
  }

  const sorted = Array.from(archMap.entries())
    .sort((a, b) => b[1].overrideCount - a[1].overrideCount)
    .slice(0, 10);

  return sorted.map(([archId, data]) => ({
    archId,
    overrideCount: data.overrideCount,
    filesWithOverrides: data.filesWithOverrides,
  }));
}

/**
 * Find files with multiple overrides (potential architecture mismatches).
 */
export function findFilesWithMultipleOverrides(auditReport: AuditReportForStats): FileOverrideStats[] {
  return auditReport.files
    .filter(file => file.overrides.length >= 2)
    .map(file => ({
      filePath: file.filePath,
      archId: file.archId,
      overrideCount: file.overrides.length,
    }))
    .sort((a, b) => b.overrideCount - a.overrideCount)
    .slice(0, 10);
}
