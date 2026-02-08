/**
 * @arch archcodex.core.domain
 *
 * Intent health analysis - detects intent usage and validation issues.
 */
import { loadArchIgnore } from '../../utils/archignore.js';
import { loadIntentRegistry, listIntentNames } from '../registry/loader.js';
import type { ScanResult } from './scanner.js';
import type { UnifiedHealthScanner } from './scanner.js';
import type { IntentHealth } from './types.js';
import type { IntentRegistry } from '../registry/schema.js';

/**
 * Analyzes intent health metrics (usage, validation, conflicts).
 */
export class IntentAnalyzer {
  constructor(private projectRoot: string) {}

  async analyze(
    scanResult: ScanResult,
    scanner: UnifiedHealthScanner,
    options?: { skipFunctionLevel?: boolean }
  ): Promise<IntentHealth> {
    // Try loading intent registry (continue even if it fails)
    let intentRegistry: IntentRegistry | null = null;
    let registryError: string | undefined;
    try {
      intentRegistry = await loadIntentRegistry(this.projectRoot);
    } catch (error) {
      registryError = error instanceof Error ? error.message : 'Failed to load intent registry';
    }

    const definedIntents = intentRegistry ? new Set(listIntentNames(intentRegistry)) : new Set<string>();

    // === Optimization: Early exit if no intents are defined in registry ===
    if (definedIntents.size === 0 && !registryError) {
      return this.analyzeFileIntentsOnly(scanResult);
    }

    // Full intent analysis (optionally including function-level intents)
    return this.analyzeFull(scanResult, scanner, intentRegistry, definedIntents, registryError, options?.skipFunctionLevel);
  }

  private async analyzeFileIntentsOnly(scanResult: ScanResult): Promise<IntentHealth> {
    const archIgnore = await loadArchIgnore(this.projectRoot);
    const filteredFiles = archIgnore.filter(Array.from(scanResult.files.keys()));

    let filesWithIntents = 0;
    let totalIntents = 0;
    const usedIntents = new Set<string>();

    for (const filePath of filteredFiles) {
      const metadata = scanResult.files.get(filePath);
      if (!metadata) continue;

      const fileIntentCount = metadata.intents.length;
      if (fileIntentCount > 0) {
        filesWithIntents++;
        totalIntents += fileIntentCount;
        metadata.intents.forEach((i) => usedIntents.add(i));
      }
    }

    const intentCoveragePercent = filteredFiles.length > 0
      ? Math.round((filesWithIntents / filteredFiles.length) * 100)
      : 0;

    // All used intents are undefined since no intents are defined in the registry
    const undefinedIntents = Array.from(usedIntents).sort();

    return {
      totalFiles: filteredFiles.length,
      filesWithIntents,
      totalIntents,
      fileLevelIntents: totalIntents,
      functionLevelIntents: 0,
      uniqueIntents: usedIntents.size,
      undefinedIntents,
      unusedIntents: [],
      validationIssues: undefinedIntents.length,
      intentCoveragePercent,
      registryError: undefined,
    };
  }

  private async analyzeFull(
    scanResult: ScanResult,
    scanner: UnifiedHealthScanner,
    intentRegistry: IntentRegistry | null,
    definedIntents: Set<string>,
    registryError: string | undefined,
    skipFunctionLevel?: boolean
  ): Promise<IntentHealth> {
    const usedIntents = new Set<string>();
    const undefinedIntents = new Set<string>();
    let filesWithIntents = 0;
    let totalIntents = 0;
    let fileLevelIntents = 0;
    let functionLevelIntents = 0;
    let validationIssues = 0;

    const archIgnore = await loadArchIgnore(this.projectRoot);
    const filteredFiles = archIgnore.filter(Array.from(scanResult.files.keys()));

    for (const filePath of filteredFiles) {
      const metadata = scanResult.files.get(filePath);
      if (!metadata) continue;

      const fileHeaderIntents = metadata.intents;
      const fileHeaderIntentSet = new Set(fileHeaderIntents);

      // Track function-level intents for TS files (lazy parsing)
      // Only parse AST if file has more @intent: occurrences than file-level intents
      // (indicating function/method-level intent annotations exist)
      let funcIntentCount = 0;
      const intentOccurrences = skipFunctionLevel ? 0 : (metadata.content.match(/@intent:/g) || []).length;
      const mayHaveFunctionIntents = intentOccurrences > fileHeaderIntents.length;
      if (mayHaveFunctionIntents && (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) && definedIntents.size > 0) {
        try {
          const model = await scanner.parseSemanticModel(metadata);

          // Count function intents
          for (const func of model.functions) {
            if (func.intents?.length) {
              for (const intentName of func.intents) {
                if (!fileHeaderIntentSet.has(intentName)) {
                  funcIntentCount++;
                  usedIntents.add(intentName);
                  if (intentRegistry && !definedIntents.has(intentName)) {
                    undefinedIntents.add(intentName);
                  }
                }
              }
            }
          }

          // Count method intents
          for (const cls of model.classes) {
            for (const method of cls.methods) {
              if (method.intents?.length) {
                for (const intentName of method.intents) {
                  if (!fileHeaderIntentSet.has(intentName)) {
                    funcIntentCount++;
                    usedIntents.add(intentName);
                    if (intentRegistry && !definedIntents.has(intentName)) {
                      undefinedIntents.add(intentName);
                    }
                  }
                }
              }
            }
          }
        } catch { /* TypeScript parse failed */
          // TypeScript parsing failed, ignore function-level intents
        }
      }

      // Add file-level intents
      for (const intent of fileHeaderIntents) {
        usedIntents.add(intent);
        if (intentRegistry && !definedIntents.has(intent)) {
          undefinedIntents.add(intent);
        }
      }

      const fileIntentCount = fileHeaderIntents.length;
      const totalFileIntents = fileIntentCount + funcIntentCount;

      if (totalFileIntents > 0) {
        filesWithIntents++;
        totalIntents += totalFileIntents;
        fileLevelIntents += fileIntentCount;
        functionLevelIntents += funcIntentCount;

        // Check for conflicts within the file (only if we have a registry)
        if (intentRegistry) {
          const allIntentNames = new Set([...fileHeaderIntents]);
          for (const intentName of allIntentNames) {
            const definition = intentRegistry.intents[intentName];
            if (definition?.conflicts_with) {
              for (const conflicting of definition.conflicts_with) {
                if (allIntentNames.has(conflicting)) {
                  validationIssues++;
                }
              }
            }
          }
        }
      }
    }

    // Find unused defined intents (only if we have a registry)
    const unusedIntents = intentRegistry
      ? Array.from(definedIntents).filter((i) => !usedIntents.has(i))
      : [];

    // Add undefined intents to validation issues (only if we have a registry)
    if (intentRegistry) {
      validationIssues += undefinedIntents.size;
    }

    const intentCoveragePercent = filteredFiles.length > 0
      ? Math.round((filesWithIntents / filteredFiles.length) * 100)
      : 0;

    return {
      totalFiles: filteredFiles.length,
      filesWithIntents,
      totalIntents,
      fileLevelIntents,
      functionLevelIntents,
      uniqueIntents: usedIntents.size,
      undefinedIntents: Array.from(undefinedIntents).sort(),
      unusedIntents: unusedIntents.sort(),
      validationIssues,
      intentCoveragePercent,
      registryError,
    };
  }
}
