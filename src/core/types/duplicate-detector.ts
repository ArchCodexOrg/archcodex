/**
 * @arch archcodex.core.domain
 * @intent:stateless
 *
 * Duplicate type detector for finding duplicate/similar type definitions
 * across a codebase.
 */
import * as path from 'node:path';
import { readFile } from '../../utils/file-system.js';
import { TypeExtractor } from './extractor.js';
import type {
  TypeInfo,
  DuplicateMatch,
  DuplicateReport,
  DuplicateGroup,
} from './types.js';

/**
 * Options for duplicate detection.
 */
export interface DuplicateDetectorOptions {
  /** Minimum similarity threshold (0-1) for "similar" types. Default: 0.8 */
  similarityThreshold?: number;
  /** Minimum number of properties to consider for comparison. Default: 2 */
  minProperties?: number;
  /** Only compare exported types. Default: true */
  exportedOnly?: boolean;
  /** Skip comparing classes with interfaces they might implement. Default: true */
  skipImplementations?: boolean;
}

/**
 * Duplicate type detector.
 */
export class DuplicateDetector {
  private projectRoot: string;
  private extractor: TypeExtractor;
  private options: Required<DuplicateDetectorOptions>;

  constructor(projectRoot: string, options: DuplicateDetectorOptions = {}) {
    this.projectRoot = projectRoot;
    this.extractor = new TypeExtractor();
    this.options = {
      similarityThreshold: options.similarityThreshold ?? 0.8,
      minProperties: options.minProperties ?? 2,
      exportedOnly: options.exportedOnly ?? true,
      skipImplementations: options.skipImplementations ?? true,
    };
  }

  /**
   * Scan files for duplicate types.
   */
  async scanFiles(filePaths: string[]): Promise<DuplicateReport> {
    const allTypes: TypeInfo[] = [];
    const BATCH_SIZE = 20; // Process files in batches for parallel I/O

    // Process files in batches for parallel I/O
    for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
      const batch = filePaths.slice(i, i + BATCH_SIZE);

      // Read all files in batch in parallel
      const fileContents = await Promise.all(
        batch.map(async (filePath) => {
          try {
            const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(this.projectRoot, filePath);
            const content = await readFile(absolutePath);
            const relativePath = path.relative(this.projectRoot, absolutePath);
            return { relativePath, content };
          } catch { /* file cannot be read */
            return null;
          }
        })
      );

      // Parse files sequentially (ts-morph is not thread-safe)
      for (const item of fileContents) {
        if (!item) continue;

        try {
          const types = this.extractor.extractFromFile(item.relativePath, item.content);

          // Filter based on options
          const filtered = types.filter(t => {
            if (this.options.exportedOnly && !t.isExported) return false;
            if (t.properties.length < this.options.minProperties && t.methods.length === 0) return false;
            return true;
          });

          allTypes.push(...filtered);
        } catch { /* TypeScript parse error, skip file */
          // Skip files that can't be parsed
        }
      }
    }

    // Find duplicates
    return this.findDuplicates(allTypes);
  }

  /**
   * Scan a specific file for types that duplicate types in other files.
   */
  async scanFile(targetFile: string, allFiles: string[]): Promise<DuplicateMatch[]> {
    const matches: DuplicateMatch[] = [];

    // Extract types from target file
    const absoluteTarget = path.isAbsolute(targetFile) ? targetFile : path.resolve(this.projectRoot, targetFile);
    const targetContent = await readFile(absoluteTarget);
    const relativeTarget = path.relative(this.projectRoot, absoluteTarget);
    const targetTypes = this.extractor.extractFromFile(relativeTarget, targetContent);

    // Extract types from other files
    const otherTypes: TypeInfo[] = [];
    for (const filePath of allFiles) {
      if (filePath === targetFile || filePath === relativeTarget) continue;

      try {
        const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(this.projectRoot, filePath);
        const content = await readFile(absolutePath);
        const relativePath = path.relative(this.projectRoot, absolutePath);

        const types = this.extractor.extractFromFile(relativePath, content);
        otherTypes.push(...types.filter(t => !this.options.exportedOnly || t.isExported));
      } catch { /* file read or parse error */
        // Skip files that can't be read/parsed
      }
    }

    // Compare target types against other types
    for (const targetType of targetTypes) {
      if (this.options.exportedOnly && !targetType.isExported) continue;
      if (targetType.properties.length < this.options.minProperties && targetType.methods.length === 0) continue;

      for (const otherType of otherTypes) {
        const match = this.compareTypes(targetType, otherType);
        if (match) {
          matches.push(match);
        }
      }
    }

    return matches;
  }

  /**
   * Find all duplicate groups.
   */
  private findDuplicates(types: TypeInfo[]): DuplicateReport {
    const structureMap = new Map<string, TypeInfo[]>();
    const exactDuplicates: DuplicateGroup[] = [];
    const renamedDuplicates: DuplicateGroup[] = [];
    const similarGroups: DuplicateGroup[] = [];

    // Group by structure signature for exact/renamed detection
    for (const type of types) {
      // Use cached structure (computed during extraction)
      const structure = type._cachedStructure ?? TypeExtractor.createStructure(type);
      const key = `${structure.propertySignature}|${structure.methodSignature}`;

      if (!structureMap.has(key)) {
        structureMap.set(key, []);
      }
      structureMap.get(key)!.push(type);
    }

    // Process groups with same structure
    for (const [, group] of structureMap) {
      if (group.length < 2) continue;

      // Check if same name (exact duplicate) or different names (renamed)
      const byName = new Map<string, TypeInfo[]>();
      for (const type of group) {
        if (!byName.has(type.name)) {
          byName.set(type.name, []);
        }
        byName.get(type.name)!.push(type);
      }

      // Same name = exact duplicates
      for (const [, sameNameTypes] of byName) {
        if (sameNameTypes.length >= 2) {
          const [canonical, ...dupes] = sameNameTypes.sort((a, b) => a.file.localeCompare(b.file));
          exactDuplicates.push({
            canonical,
            duplicates: dupes.map(d => ({
              type: d,
              reference: canonical,
              similarity: 1.0,
              matchType: 'exact' as const,
              missingProperties: [],
              extraProperties: [],
              typeDifferences: [],
            })),
            suggestion: `Consolidate into single definition at ${canonical.file}:${canonical.line}`,
          });
        }
      }

      // Different names but same structure = renamed duplicates
      if (byName.size >= 2) {
        const allNameTypes = Array.from(byName.values()).flat();
        const [canonical, ...dupes] = allNameTypes.sort((a, b) => a.file.localeCompare(b.file));

        // Filter out implementation pairs
        const filteredDupes = dupes.filter(d => {
          if (d.name === canonical.name) return false;
          if (this.options.skipImplementations && this.isImplementationPair(canonical, d)) {
            return false;
          }
          return true;
        });

        if (filteredDupes.length > 0) {
          renamedDuplicates.push({
            canonical,
            duplicates: filteredDupes.map(d => ({
              type: d,
              reference: canonical,
              similarity: 1.0,
              matchType: 'renamed' as const,
              missingProperties: [],
              extraProperties: [],
              typeDifferences: [],
            })),
            suggestion: `Consider consolidating ${[canonical.name, ...filteredDupes.map(d => d.name)].join(', ')} into a single type`,
          });
        }
      }
    }

    // Find similar types (not exact matches)
    const processedPairs = new Set<string>();
    for (let i = 0; i < types.length; i++) {
      for (let j = i + 1; j < types.length; j++) {
        const type1 = types[i];
        const type2 = types[j];

        // Skip if already found as exact or renamed (use cached structures)
        const struct1 = type1._cachedStructure ?? TypeExtractor.createStructure(type1);
        const struct2 = type2._cachedStructure ?? TypeExtractor.createStructure(type2);
        const key1 = `${struct1.propertySignature}|${struct1.methodSignature}`;
        const key2 = `${struct2.propertySignature}|${struct2.methodSignature}`;
        if (key1 === key2) continue;

        // Skip class-interface pairs (implementation relationships)
        if (this.options.skipImplementations && this.isImplementationPair(type1, type2)) {
          continue;
        }

        // Skip if already processed
        const pairKey = [type1.file + ':' + type1.name, type2.file + ':' + type2.name].sort().join('|');
        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        const similarity = TypeExtractor.calculateSimilarity(type1, type2);
        if (similarity >= this.options.similarityThreshold) {
          const match = this.compareTypes(type1, type2);
          if (match) {
            similarGroups.push({
              canonical: type1,
              duplicates: [{
                type: type2,
                reference: type1,
                similarity,
                matchType: 'similar',
                missingProperties: match.missingProperties,
                extraProperties: match.extraProperties,
                typeDifferences: match.typeDifferences,
              }],
              suggestion: `${type1.name} and ${type2.name} are ${Math.round(similarity * 100)}% similar - consider consolidating`,
            });
          }
        }
      }
    }

    return {
      totalTypes: types.length,
      exactDuplicates: exactDuplicates.reduce((sum, g) => sum + g.duplicates.length, 0),
      renamedDuplicates: renamedDuplicates.reduce((sum, g) => sum + g.duplicates.length, 0),
      similarTypes: similarGroups.length,
      groups: [...exactDuplicates, ...renamedDuplicates, ...similarGroups],
    };
  }

  /**
   * Compare two types and return match info if similar.
   */
  private compareTypes(type1: TypeInfo, type2: TypeInfo): DuplicateMatch | null {
    const similarity = TypeExtractor.calculateSimilarity(type1, type2);

    if (similarity < this.options.similarityThreshold) {
      return null;
    }

    const props1 = new Map(type1.properties.map(p => [p.name, p]));
    const props2 = new Map(type2.properties.map(p => [p.name, p]));

    const missingProperties: string[] = [];
    const extraProperties: string[] = [];
    const typeDifferences: Array<{ name: string; expected: string; actual: string }> = [];

    // Find missing in type1 (present in type2)
    for (const [name, prop2] of props2) {
      const prop1 = props1.get(name);
      if (!prop1) {
        missingProperties.push(name);
      } else if (prop1.type !== prop2.type) {
        typeDifferences.push({
          name,
          expected: prop2.type,
          actual: prop1.type,
        });
      }
    }

    // Find extra in type1 (not in type2)
    for (const name of props1.keys()) {
      if (!props2.has(name)) {
        extraProperties.push(name);
      }
    }

    // Determine match type
    let matchType: 'exact' | 'renamed' | 'similar';
    if (similarity === 1.0) {
      matchType = type1.name === type2.name ? 'exact' : 'renamed';
    } else {
      matchType = 'similar';
    }

    return {
      type: type1,
      reference: type2,
      similarity,
      matchType,
      missingProperties,
      extraProperties,
      typeDifferences,
    };
  }

  /**
   * Check if two types are in an implementation relationship.
   * Returns true if one is a class and the other is an interface it might implement,
   * or if both are sibling implementations of the same pattern.
   */
  private isImplementationPair(type1: TypeInfo, type2: TypeInfo): boolean {
    // Check if both are clearly implementations of the same base pattern
    // This catches sibling implementations like ForbidImportValidator, RequireImportValidator
    const suffixes = ['Validator', 'Formatter', 'Provider', 'Handler', 'Service', 'Repository', 'Analyzer', 'Engine'];
    for (const suffix of suffixes) {
      if (type1.name.endsWith(suffix) && type2.name.endsWith(suffix)) {
        // Both are implementations with same suffix - likely sibling implementations
        return true;
      }
    }

    // Check if one is a class and the other is an interface
    const classType = type1.kind === 'class' ? type1 : (type2.kind === 'class' ? type2 : null);
    const interfaceType = type1.kind === 'interface' ? type1 : (type2.kind === 'interface' ? type2 : null);

    if (classType && interfaceType) {
      // Check if the class explicitly implements the interface
      if (classType.extends?.includes(interfaceType.name)) {
        return true;
      }

      // Check if interface name starts with 'I' and class name matches the rest
      // e.g., IFormatter -> Formatter, JsonFormatter, HumanFormatter
      if (interfaceType.name.startsWith('I') && interfaceType.name.length > 1) {
        const baseName = interfaceType.name.substring(1);
        if (classType.name === baseName || classType.name.endsWith(baseName)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.extractor.dispose();
  }
}
