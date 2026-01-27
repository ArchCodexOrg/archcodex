/**
 * @arch archcodex.core.engine
 * @intent:ast-analysis
 *
 * SimilarityAnalyzer - detects potential code duplication.
 * Uses structural comparison without reading implementation.
 */
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { Project } from 'ts-morph';
import { extractArchId } from '../arch-tag/parser.js';
import type {
  FileSignature,
  SimilarityMatch,
  SimilarityOptions,
  MatchedAspect,
  ConsistencyIssue,
  ConsistencyOptions,
} from './types.js';

const DEFAULT_OPTIONS: Required<SimilarityOptions> = {
  threshold: 0.5,
  maxResults: 5,
  sameArchOnly: false,
};

/**
 * Analyzes code similarity to detect potential duplicates.
 */
export class SimilarityAnalyzer {
  private projectRoot: string;
  private project: Project;
  private signatureCache: Map<string, FileSignature> = new Map();

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.project = new Project({
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
    });
  }

  /**
   * Find files similar to the given file.
   */
  async findSimilar(
    filePath: string,
    candidatePaths: string[],
    options: SimilarityOptions = {}
  ): Promise<SimilarityMatch[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Get signature of target file
    const targetSig = await this.extractSignature(filePath);
    const matches: SimilarityMatch[] = [];

    for (const candidatePath of candidatePaths) {
      // Skip self
      if (candidatePath === filePath) continue;

      const candidateSig = await this.extractSignature(candidatePath);

      // Skip if sameArchOnly and architectures don't match
      if (opts.sameArchOnly && targetSig.archId !== candidateSig.archId) {
        continue;
      }

      const { similarity, matchedAspects } = this.calculateSimilarity(
        targetSig,
        candidateSig
      );

      if (similarity >= opts.threshold) {
        matches.push({
          file: path.relative(this.projectRoot, candidatePath),
          archId: candidateSig.archId,
          similarity,
          matchedAspects,
        });
      }
    }

    // Sort by similarity (highest first) and limit results
    return matches
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, opts.maxResults);
  }

  /**
   * Find consistency issues between a file and similar files.
   * Reports what methods/exports are missing or extra compared to peers.
   */
  async findInconsistencies(
    filePath: string,
    candidatePaths: string[],
    options: ConsistencyOptions = {}
  ): Promise<ConsistencyIssue[]> {
    const threshold = options.threshold ?? 0.6;
    const sameArchOnly = options.sameArchOnly ?? true;
    const minDiff = options.minDiff ?? 1;

    const targetSig = await this.extractSignature(filePath);
    const issues: ConsistencyIssue[] = [];

    for (const candidatePath of candidatePaths) {
      if (candidatePath === filePath) continue;

      const candidateSig = await this.extractSignature(candidatePath);

      // Skip if sameArchOnly and architectures don't match
      if (sameArchOnly && targetSig.archId !== candidateSig.archId) {
        continue;
      }

      const { similarity } = this.calculateSimilarity(targetSig, candidateSig);

      if (similarity >= threshold) {
        // Find what's missing in target but present in candidate
        const missingMethods = this.difference(candidateSig.methods, targetSig.methods);
        const missingExports = this.difference(candidateSig.exports, targetSig.exports);

        // Find what's extra in target but missing in candidate
        const extraMethods = this.difference(targetSig.methods, candidateSig.methods);
        const extraExports = this.difference(targetSig.exports, candidateSig.exports);

        const totalDiff = missingMethods.length + missingExports.length +
                          extraMethods.length + extraExports.length;

        if (totalDiff >= minDiff) {
          issues.push({
            file: path.relative(this.projectRoot, filePath),
            referenceFile: path.relative(this.projectRoot, candidatePath),
            archId: targetSig.archId,
            similarity,
            missing: { methods: missingMethods, exports: missingExports },
            extra: { methods: extraMethods, exports: extraExports },
          });
        }
      }
    }

    return issues;
  }

  /**
   * Extract signature from a TypeScript file.
   */
  async extractSignature(filePath: string): Promise<FileSignature> {
    // Check cache
    const cached = this.signatureCache.get(filePath);
    if (cached) return cached;

    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.projectRoot, filePath);

    const content = await fs.readFile(absolutePath, 'utf-8');
    const archId = extractArchId(content);

    // Parse with ts-morph
    const sourceFile = this.project.createSourceFile(
      absolutePath,
      content,
      { overwrite: true }
    );

    const exports: string[] = [];
    const methods: string[] = [];
    const classes: string[] = [];
    const importModules: string[] = [];

    // Extract exports
    for (const exportDecl of sourceFile.getExportedDeclarations()) {
      exports.push(...exportDecl[0].split(',').map((s) => s.trim()));
    }

    // Extract classes and their methods
    for (const classDecl of sourceFile.getClasses()) {
      const className = classDecl.getName();
      if (className) {
        classes.push(className);
      }

      for (const method of classDecl.getMethods()) {
        const methodName = method.getName();
        if (methodName && !methodName.startsWith('_')) {
          methods.push(methodName);
        }
      }
    }

    // Extract standalone functions
    for (const func of sourceFile.getFunctions()) {
      const funcName = func.getName();
      if (funcName && !funcName.startsWith('_')) {
        methods.push(funcName);
      }
    }

    // Extract import modules
    for (const importDecl of sourceFile.getImportDeclarations()) {
      const moduleSpec = importDecl.getModuleSpecifierValue();
      // Extract just the module name (last part of path)
      const moduleName = moduleSpec.split('/').pop() || moduleSpec;
      importModules.push(moduleName.replace(/\.js$/, ''));
    }

    const signature: FileSignature = {
      file: path.relative(this.projectRoot, absolutePath),
      archId,
      exports: [...new Set(exports)],
      methods: [...new Set(methods)],
      classes: [...new Set(classes)],
      importModules: [...new Set(importModules)],
      lineCount: content.split('\n').length,
    };

    this.signatureCache.set(filePath, signature);
    return signature;
  }

  /**
   * Calculate similarity between two file signatures.
   * Uses Jaccard similarity on multiple aspects.
   */
  private calculateSimilarity(
    a: FileSignature,
    b: FileSignature
  ): { similarity: number; matchedAspects: MatchedAspect[] } {
    const matchedAspects: MatchedAspect[] = [];

    // Calculate Jaccard similarity for each aspect
    const exportSim = this.jaccardSimilarity(a.exports, b.exports);
    const methodSim = this.jaccardSimilarity(a.methods, b.methods);
    const classSim = this.jaccardSimilarity(a.classes, b.classes);
    const importSim = this.jaccardSimilarity(a.importModules, b.importModules);

    // Record what matched
    const exportMatches = this.intersection(a.exports, b.exports);
    if (exportMatches.length > 0) {
      matchedAspects.push({ type: 'exports', items: exportMatches });
    }

    const methodMatches = this.intersection(a.methods, b.methods);
    if (methodMatches.length > 0) {
      matchedAspects.push({ type: 'methods', items: methodMatches });
    }

    const classMatches = this.intersection(a.classes, b.classes);
    if (classMatches.length > 0) {
      matchedAspects.push({ type: 'classes', items: classMatches });
    }

    const importMatches = this.intersection(a.importModules, b.importModules);
    if (importMatches.length > 0) {
      matchedAspects.push({ type: 'imports', items: importMatches });
    }

    // Weighted average - methods and exports are most important
    const similarity =
      exportSim * 0.35 + methodSim * 0.35 + classSim * 0.15 + importSim * 0.15;

    return { similarity, matchedAspects };
  }

  /**
   * Calculate Jaccard similarity between two sets.
   */
  private jaccardSimilarity(a: string[], b: string[]): number {
    if (a.length === 0 && b.length === 0) return 0;

    const setA = new Set(a.map((s) => s.toLowerCase()));
    const setB = new Set(b.map((s) => s.toLowerCase()));

    const intersection = [...setA].filter((x) => setB.has(x)).length;
    const union = new Set([...setA, ...setB]).size;

    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Get intersection of two arrays.
   */
  private intersection(a: string[], b: string[]): string[] {
    const setB = new Set(b.map((s) => s.toLowerCase()));
    return a.filter((x) => setB.has(x.toLowerCase()));
  }

  /**
   * Get items in a that are not in b.
   */
  private difference(a: string[], b: string[]): string[] {
    const setB = new Set(b.map((s) => s.toLowerCase()));
    return a.filter((x) => !setB.has(x.toLowerCase()));
  }

  /**
   * Dispose resources.
   */
  dispose(): void {
    this.signatureCache.clear();
  }
}

/**
 * Detect potential duplicate files using similarity analysis.
 */
export async function detectDuplicates(
  projectRoot: string,
  files: string[],
  threshold: number
): Promise<Array<{ file: string; matches: SimilarityMatch[] }>> {
  const analyzer = new SimilarityAnalyzer(projectRoot);
  const warnings: Array<{ file: string; matches: SimilarityMatch[] }> = [];
  const alreadyCompared = new Set<string>();

  try {
    for (const file of files) {
      const candidates = files.filter(f => f !== file && !alreadyCompared.has(`${f}:${file}`));
      if (candidates.length === 0) continue;

      const matches = await analyzer.findSimilar(file, candidates, { threshold });
      if (matches.length > 0) {
        warnings.push({ file, matches });
        for (const match of matches) {
          alreadyCompared.add(`${file}:${match.file}`);
        }
      }
    }
  } finally {
    analyzer.dispose();
  }

  return warnings;
}
