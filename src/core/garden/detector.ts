/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Pattern detector for finding file clusters and inconsistencies.
 * Supports both naming-based heuristics and AST-based semantic analysis.
 */
import * as path from 'path';
import type {
  ClusteredFile,
  FileCluster,
  PatternReport,
  InconsistencyReport,
  GardenReport,
  GardenSummary,
  GardenOptions,
  KeywordSuggestion,
  KeywordCleanupSuggestion,
  KeywordCleanupReason,
  SemanticCategory,
  TypeDuplicateReport,
} from './types.js';
import type { IndexEntry } from '../discovery/schema.js';
import { SemanticAnalyzer } from './semantic-analyzer.js';

/**
 * Stopwords that don't add value for architecture discovery.
 * These are too common, generic, or non-descriptive.
 */
const STOPWORDS = new Set([
  // Common file name fragments
  'index', 'main', 'base', 'common', 'shared', 'default', 'core', 'app',
  'src', 'lib', 'dist', 'build', 'test', 'tests', 'spec', 'mock', 'mocks',
  // Generic programming terms
  'data', 'info', 'item', 'items', 'list', 'array', 'map', 'set', 'get',
  'add', 'remove', 'update', 'delete', 'create', 'read', 'write', 'load',
  'save', 'fetch', 'send', 'post', 'put', 'patch', 'handle', 'process',
  // Common suffixes that are too broad
  'helper', 'helpers', 'util', 'utils', 'utility', 'utilities', 'tool', 'tools',
  'manager', 'handler', 'processor', 'loader', 'factory', 'builder', 'wrapper',
  // Single letters and abbreviations
  'api', 'cli', 'gui', 'web', 'http', 'url', 'uri', 'xml', 'json', 'yaml',
  // Common words with no semantic value
  'the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'will', 'can',
  'has', 'have', 'had', 'not', 'but', 'are', 'was', 'were', 'been', 'being',
  'don', 'doesn', 'didn', 'won', 'wouldn', 'shouldn', 'couldn', 'isn', 'aren',
  'one', 'two', 'all', 'any', 'some', 'each', 'every', 'both', 'few', 'more',
  'new', 'old', 'own', 'same', 'other', 'such', 'only', 'just', 'also', 'well',
  'use', 'used', 'using', 'make', 'made', 'take', 'find', 'give', 'tell', 'call',
  // ArchCodex-specific noise
  'archcodex', 'arch', 'architecture', 'constraint', 'constraints', 'rule', 'rules',
  'file', 'files', 'path', 'paths', 'module', 'modules', 'import', 'imports',
  'export', 'exports', 'type', 'types', 'interface', 'interfaces', 'class', 'classes',
]);

/**
 * Keywords that indicate semantic categories - these ARE valuable.
 */
const SEMANTIC_KEYWORDS = new Set([
  // React patterns
  'component', 'hook', 'context', 'provider', 'consumer', 'reducer', 'action',
  'state', 'props', 'render', 'effect', 'memo', 'ref', 'callback', 'layout',
  // Domain patterns
  'service', 'repository', 'entity', 'aggregate', 'domain', 'model', 'schema',
  'validator', 'validation', 'constraint', 'rule', 'policy', 'strategy',
  // Infrastructure patterns
  'adapter', 'gateway', 'client', 'server', 'middleware', 'interceptor',
  'controller', 'router', 'route', 'endpoint', 'handler',
  // Architecture patterns
  'engine', 'orchestrator', 'coordinator', 'dispatcher', 'observer', 'listener',
  'publisher', 'subscriber', 'event', 'command', 'query', 'saga',
]);

/**
 * Default options for pattern detection.
 */
const DEFAULT_OPTIONS: GardenOptions = {
  detectPatterns: true,
  checkConsistency: true,
  suggestKeywords: true,
  cleanupKeywords: true,
  detectTypeDuplicates: true,
  fix: false,
  minClusterSize: 2,
  useSemanticAnalysis: false,
  maxKeywordUsage: 3,
};

/**
 * Pattern detector that analyzes file naming patterns and @arch consistency.
 * Supports both fast naming-based heuristics and accurate AST-based analysis.
 */
export class PatternDetector {
  private projectRoot: string;
  private indexEntries: IndexEntry[];
  private semanticAnalyzer: SemanticAnalyzer | null = null;

  constructor(projectRoot: string, indexEntries: IndexEntry[] = []) {
    this.projectRoot = projectRoot;
    this.indexEntries = indexEntries;
  }

  /**
   * Initialize semantic analyzer for AST-based detection.
   * Call this before analyze() if using useSemanticAnalysis option.
   */
  initSemanticAnalyzer(): void {
    if (!this.semanticAnalyzer) {
      this.semanticAnalyzer = new SemanticAnalyzer();
    }
  }

  /**
   * Clean up resources (call when done with AST analysis).
   */
  dispose(): void {
    if (this.semanticAnalyzer) {
      this.semanticAnalyzer.dispose();
      this.semanticAnalyzer = null;
    }
  }

  /**
   * Run full garden analysis on a set of files.
   * @param files - Files to analyze with their paths and @arch tags
   * @param options - Analysis options
   * @param fileContents - Optional map of file path to content (required for AST analysis)
   * @param typeDuplicates - Optional pre-computed type duplicates (from external type analysis)
   */
  analyze(
    files: Array<{ path: string; archId: string | null }>,
    options: Partial<GardenOptions> = {},
    fileContents?: Map<string, string>,
    typeDuplicates?: TypeDuplicateReport[]
  ): GardenReport {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Build keyword usage map across all architectures
    const keywordUsageMap = this.buildKeywordUsageMap();

    // Initialize semantic analyzer if AST analysis requested
    if (opts.useSemanticAnalysis && !this.semanticAnalyzer) {
      this.initSemanticAnalyzer();
    }

    const clusteredFiles = this.clusterFiles(files, opts.useSemanticAnalysis, fileContents);

    const patterns: PatternReport[] = opts.detectPatterns
      ? this.detectPatterns(clusteredFiles, opts.minClusterSize, keywordUsageMap, opts.maxKeywordUsage ?? 3)
      : [];

    const inconsistencies: InconsistencyReport[] = opts.checkConsistency
      ? this.findInconsistencies(clusteredFiles)
      : [];

    const keywordSuggestions: KeywordSuggestion[] = opts.suggestKeywords
      ? this.suggestKeywords(clusteredFiles, keywordUsageMap, opts.maxKeywordUsage ?? 3)
      : [];

    const keywordCleanups: KeywordCleanupSuggestion[] = opts.cleanupKeywords
      ? this.analyzeKeywordCleanups(keywordUsageMap, opts.maxKeywordUsage ?? 3)
      : [];

    // Use provided type duplicates or empty array
    const typesDuplicates = typeDuplicates ?? [];

    const summary: GardenSummary = {
      filesScanned: files.length,
      patternsDetected: patterns.length,
      inconsistenciesFound: inconsistencies.length,
      keywordSuggestionCount: keywordSuggestions.length,
      keywordCleanupCount: keywordCleanups.reduce((sum, c) => sum + c.keywordsToRemove.length, 0),
      typeDuplicateCount: typesDuplicates.length,
      hasIssues: inconsistencies.length > 0 ||
                 patterns.some(p => !p.inIndex) ||
                 keywordSuggestions.length > 0 ||
                 keywordCleanups.length > 0 ||
                 typesDuplicates.length > 0,
    };

    return { patterns, inconsistencies, keywordSuggestions, keywordCleanups, typeDuplicates: typesDuplicates, summary };
  }

  /**
   * Convert file paths to clustered file objects.
   * @param files - Files to cluster
   * @param useSemanticAnalysis - Whether to use AST-based semantic analysis
   * @param fileContents - Map of file path to content (required for AST analysis)
   */
  private clusterFiles(
    files: Array<{ path: string; archId: string | null }>,
    useSemanticAnalysis?: boolean,
    fileContents?: Map<string, string>
  ): ClusteredFile[] {
    return files.map(f => {
      const fileName = path.basename(f.path);
      const clusteredFile: ClusteredFile = {
        path: f.path,
        relativePath: path.relative(this.projectRoot, f.path),
        fileName,
        archId: f.archId,
        directory: path.dirname(path.relative(this.projectRoot, f.path)),
      };

      // Use AST-based semantic analysis if enabled and content available
      if (useSemanticAnalysis && this.semanticAnalyzer && fileContents) {
        const content = fileContents.get(f.path);
        if (content) {
          const analysis = this.semanticAnalyzer.analyze(f.path, content);
          clusteredFile.semanticCategory = analysis.category;
          clusteredFile.semanticConfidence = analysis.confidence;
          clusteredFile.semanticSignals = analysis.signals;
        } else {
          // Fall back to naming-based detection
          clusteredFile.semanticCategory = this.inferSemanticCategoryFromName(fileName);
          clusteredFile.semanticConfidence = 'low';
        }
      } else {
        // Use fast naming-based detection
        clusteredFile.semanticCategory = this.inferSemanticCategoryFromName(fileName);
        clusteredFile.semanticConfidence = 'low';
      }

      return clusteredFile;
    });
  }

  /**
   * Detect naming patterns in file names.
   */
  detectPatterns(
    files: ClusteredFile[],
    minClusterSize: number = 2,
    keywordUsageMap: Map<string, Set<string>> = new Map(),
    maxKeywordUsage: number = 3
  ): PatternReport[] {
    const clusters = this.groupByPattern(files);
    const reports: PatternReport[] = [];

    for (const [pattern, cluster] of clusters) {
      if (cluster.files.length < minClusterSize) continue;

      const archId = cluster.isConsistent ? cluster.dominantArch : null;
      const inIndex = archId ? this.isInIndex(archId, pattern) : false;
      const fileNames = cluster.files.map(f =>
        path.basename(f.fileName, path.extname(f.fileName))
      );

      // Get semantic categories from files
      const semanticCategories = new Set(
        cluster.files.map(f => f.semanticCategory).filter(Boolean)
      );

      reports.push({
        pattern,
        files: cluster.files.map(f => f.relativePath),
        archId,
        inIndex,
        suggestedKeywords: this.generateKeywordsFromFileNames(
          fileNames,
          keywordUsageMap,
          maxKeywordUsage,
          archId ?? '',
          semanticCategories
        ),
      });
    }

    return reports;
  }

  /**
   * Find files with inconsistent @arch usage based on naming patterns.
   *
   * Only checks pattern-based consistency (e.g., all *Card.tsx files should use
   * the same architecture). Directory-based checks are intentionally excluded
   * because different architectures in the same directory is often intentional
   * design (e.g., constraint validators alongside a constraint registry).
   *
   * Also considers semantic category: files with different semantic categories
   * (e.g., hook vs utility) are not flagged as inconsistent even if they share
   * a similar name suffix.
   */
  findInconsistencies(files: ClusteredFile[]): InconsistencyReport[] {
    const reports: InconsistencyReport[] = [];

    // Check by naming pattern - files with the same naming pattern should use
    // the same architecture (e.g., UserCard.tsx and ProductCard.tsx)
    const byPattern = this.groupByPattern(files);
    for (const [pattern, cluster] of byPattern) {
      if (cluster.files.length < 2 || cluster.isConsistent) continue;

      // Skip if files have different semantic categories (not a real inconsistency)
      const categories = new Set(cluster.files.map(f => f.semanticCategory).filter(Boolean));
      if (categories.size > 1) continue;

      const outliers = cluster.files
        .filter(f => f.archId !== cluster.dominantArch && f.archId !== null)
        .map(f => f.relativePath);

      if (outliers.length > 0) {
        reports.push({
          location: `pattern: ${pattern}`,
          files: cluster.files.map(f => ({ path: f.relativePath, archId: f.archId })),
          dominantArch: cluster.dominantArch,
          outliers,
        });
      }
    }

    return reports;
  }

  /**
   * Suggest keywords based on file usage.
   * Filters out stopwords and keywords that appear in too many architectures.
   */
  suggestKeywords(
    files: ClusteredFile[],
    keywordUsageMap: Map<string, Set<string>>,
    maxKeywordUsage: number
  ): KeywordSuggestion[] {
    const suggestions: KeywordSuggestion[] = [];
    const byArch = new Map<string, ClusteredFile[]>();

    // Group files by @arch tag
    for (const file of files) {
      if (!file.archId) continue;
      const group = byArch.get(file.archId) || [];
      group.push(file);
      byArch.set(file.archId, group);
    }

    // For each architecture, check if file-derived keywords are in index
    for (const [archId, archFiles] of byArch) {
      const indexEntry = this.indexEntries.find(e => e.arch_id === archId);
      const currentKeywords = indexEntry?.keywords || [];

      const fileNames = archFiles.map(f =>
        path.basename(f.fileName, path.extname(f.fileName))
      );

      // Get semantic categories from files for better keyword hints
      const semanticCategories = new Set(
        archFiles.map(f => f.semanticCategory).filter(Boolean)
      );

      const derivedKeywords = this.generateKeywordsFromFileNames(
        fileNames,
        keywordUsageMap,
        maxKeywordUsage,
        archId,
        semanticCategories
      );

      // Find keywords not already in index
      const newKeywords = derivedKeywords.filter(
        k => !currentKeywords.some(ck => ck.toLowerCase() === k.toLowerCase())
      );

      if (newKeywords.length > 0) {
        suggestions.push({
          archId,
          currentKeywords,
          suggestedKeywords: newKeywords,
          basedOnFiles: archFiles.map(f => f.relativePath),
        });
      }
    }

    return suggestions;
  }

  /**
   * Build a map of keyword -> set of arch_ids that use it.
   */
  private buildKeywordUsageMap(): Map<string, Set<string>> {
    const usageMap = new Map<string, Set<string>>();

    for (const entry of this.indexEntries) {
      if (!entry.keywords) continue;

      for (const keyword of entry.keywords) {
        const normalized = keyword.toLowerCase();
        const archs = usageMap.get(normalized) || new Set<string>();
        archs.add(entry.arch_id);
        usageMap.set(normalized, archs);
      }
    }

    return usageMap;
  }

  /**
   * Analyze existing keywords and suggest cleanups.
   */
  analyzeKeywordCleanups(
    keywordUsageMap: Map<string, Set<string>>,
    maxKeywordUsage: number
  ): KeywordCleanupSuggestion[] {
    const cleanups: KeywordCleanupSuggestion[] = [];

    for (const entry of this.indexEntries) {
      if (!entry.keywords || entry.keywords.length === 0) continue;

      const keywordsToRemove: KeywordCleanupSuggestion['keywordsToRemove'] = [];

      for (const keyword of entry.keywords) {
        const normalized = keyword.toLowerCase();
        const reason = this.getKeywordCleanupReason(
          normalized,
          keywordUsageMap,
          maxKeywordUsage
        );

        if (reason) {
          keywordsToRemove.push({
            keyword,
            reason,
            usedByCount: keywordUsageMap.get(normalized)?.size,
          });
        }
      }

      if (keywordsToRemove.length > 0) {
        cleanups.push({
          archId: entry.arch_id,
          keywordsToRemove,
          currentCount: entry.keywords.length,
          afterCleanupCount: entry.keywords.length - keywordsToRemove.length,
        });
      }
    }

    return cleanups;
  }

  /**
   * Determine if a keyword should be cleaned up and why.
   */
  private getKeywordCleanupReason(
    keyword: string,
    keywordUsageMap: Map<string, Set<string>>,
    maxKeywordUsage: number
  ): KeywordCleanupReason | null {
    // Check if it's a stopword
    if (STOPWORDS.has(keyword)) {
      return 'stopword';
    }

    // Check if too short (less than 4 characters, unless it's a semantic keyword)
    if (keyword.length < 4 && !SEMANTIC_KEYWORDS.has(keyword)) {
      return 'too_short';
    }

    // Check if used by too many architectures
    const usageCount = keywordUsageMap.get(keyword)?.size ?? 0;
    if (usageCount > maxKeywordUsage && !SEMANTIC_KEYWORDS.has(keyword)) {
      return 'too_common';
    }

    // Check for non-descriptive patterns (file paths, config patterns, etc.)
    if (this.isNonDescriptiveKeyword(keyword)) {
      return 'non_descriptive';
    }

    return null;
  }

  /**
   * Check if a keyword is non-descriptive (file path fragment, regex pattern, etc.)
   */
  private isNonDescriptiveKeyword(keyword: string): boolean {
    // Contains path separators
    if (keyword.includes('/') || keyword.includes('\\')) {
      return true;
    }
    // Looks like a regex pattern
    if (/^[*.[\](){}|?+^\\$]+$/.test(keyword)) {
      return true;
    }
    // Contains special regex/glob characters mixed with text
    if (/[*[\](){}]/.test(keyword) && keyword.length < 10) {
      return true;
    }
    // Looks like a file extension
    if (/^\.[a-z]+$/i.test(keyword)) {
      return true;
    }
    // Very long (probably a sentence fragment or file path)
    if (keyword.length > 30) {
      return true;
    }
    // Contains numbers mixed with text in a way that suggests a version or ID
    if (/\d{3,}/.test(keyword)) {
      return true;
    }
    return false;
  }

  /**
   * Group files by naming pattern suffix.
   */
  private groupByPattern(files: ClusteredFile[]): Map<string, FileCluster> {
    const groups = new Map<string, ClusteredFile[]>();

    for (const file of files) {
      const pattern = this.extractPattern(file.fileName);
      if (!pattern) continue;

      const group = groups.get(pattern) || [];
      group.push(file);
      groups.set(pattern, group);
    }

    // Convert to FileCluster
    const clusters = new Map<string, FileCluster>();
    for (const [pattern, patternFiles] of groups) {
      const archCounts = this.countArchTags(patternFiles);
      const dominant = this.findDominantArch(archCounts);
      const uniqueArchs = Object.keys(archCounts).filter(a => a !== 'null');

      clusters.set(pattern, {
        pattern,
        files: patternFiles,
        archTagCounts: archCounts,
        isConsistent: uniqueArchs.length <= 1,
        dominantArch: dominant,
      });
    }

    return clusters;
  }

  /**
   * Extract naming pattern from file name.
   * Considers both naming convention AND file extension for semantic accuracy.
   *
   * Examples:
   * - useAuth.ts → use*.ts (hook pattern)
   * - UserCard.tsx → *Card.tsx (component pattern)
   * - searchState.ts → *State.ts (utility pattern, different from *State.tsx)
   */
  private extractPattern(fileName: string): string | null {
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);

    // React hooks: use* prefix is always a hook (regardless of extension)
    if (baseName.startsWith('use') && baseName.length > 3) {
      return `use*${ext}`;
    }

    // Match PascalCase suffix (last capitalized word)
    // Include extension to differentiate *State.tsx (component) from *State.ts (utility)
    const match = baseName.match(/([A-Z][a-z0-9]+)$/);
    if (match && baseName !== match[1]) {
      return `*${match[1]}${ext}`;
    }

    // Match snake_case suffix
    const snakeMatch = baseName.match(/_([a-z]+)$/);
    if (snakeMatch) {
      return `*_${snakeMatch[1]}${ext}`;
    }

    return null;
  }

  /**
   * Count occurrences of each @arch tag.
   */
  private countArchTags(files: ClusteredFile[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const file of files) {
      const key = file.archId || 'null';
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }

  /**
   * Find the most common @arch tag.
   */
  private findDominantArch(counts: Record<string, number>): string | null {
    let maxCount = 0;
    let dominant: string | null = null;

    for (const [arch, count] of Object.entries(counts)) {
      if (arch !== 'null' && count > maxCount) {
        maxCount = count;
        dominant = arch;
      }
    }

    return dominant;
  }

  /**
   * Check if an architecture has relevant keywords in the index.
   */
  private isInIndex(archId: string, pattern: string): boolean {
    const entry = this.indexEntries.find(e => e.arch_id === archId);
    if (!entry?.keywords) return false;

    // Extract the suffix word from pattern (*Card.tsx -> card, use*.ts -> hook)
    // Strip extension and leading pattern chars
    const withoutExt = pattern.replace(/\.(ts|tsx|js|jsx)$/, '');

    // Handle hook pattern specially
    if (withoutExt.startsWith('use*')) {
      return entry.keywords.some(k => k.toLowerCase() === 'hook' || k.toLowerCase() === 'hooks');
    }

    const suffix = withoutExt.replace(/^\*_?/, '').toLowerCase();
    return entry.keywords.some(k => k.toLowerCase().includes(suffix));
  }

  /**
   * Generate keywords from file names with quality filtering.
   * Filters out stopwords, too-common keywords, and non-descriptive terms.
   */
  private generateKeywordsFromFileNames(
    fileNames: string[],
    keywordUsageMap: Map<string, Set<string>>,
    maxKeywordUsage: number,
    currentArchId: string,
    semanticCategories: Set<SemanticCategory | undefined>
  ): string[] {
    const keywords = new Set<string>();

    // Add semantic category hints (these are always valuable)
    for (const category of semanticCategories) {
      if (category && category !== 'unknown') {
        // Map semantic categories to discovery keywords
        const categoryKeywords = this.getKeywordsForSemanticCategory(category);
        for (const kw of categoryKeywords) {
          keywords.add(kw);
        }
      }
    }

    for (const name of fileNames) {
      // Detect hooks by use* prefix
      if (/^use[A-Z]/.test(name)) {
        keywords.add('hook');
      }

      // Split PascalCase: UserCard -> user, card
      const words = name
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(/\s+/);

      for (const word of words) {
        // Skip if too short (min 4 chars unless it's a semantic keyword)
        if (word.length < 4 && !SEMANTIC_KEYWORDS.has(word)) {
          continue;
        }

        // Skip stopwords
        if (STOPWORDS.has(word)) {
          continue;
        }

        // Skip if used by too many architectures (unless it's a semantic keyword)
        const usedBy = keywordUsageMap.get(word);
        if (usedBy && usedBy.size > maxKeywordUsage) {
          // Only skip if not already used by current architecture
          if (!usedBy.has(currentArchId) && !SEMANTIC_KEYWORDS.has(word)) {
            continue;
          }
        }

        // Skip non-descriptive patterns
        if (this.isNonDescriptiveKeyword(word)) {
          continue;
        }

        keywords.add(word);
      }
    }

    // Prioritize semantic keywords first, then others
    const sorted = Array.from(keywords).sort((a, b) => {
      const aIsSemantic = SEMANTIC_KEYWORDS.has(a) ? 0 : 1;
      const bIsSemantic = SEMANTIC_KEYWORDS.has(b) ? 0 : 1;
      return aIsSemantic - bIsSemantic;
    });

    return sorted.slice(0, 5); // Limit to 5 high-quality keywords
  }

  /**
   * Get discovery keywords for a semantic category.
   */
  private getKeywordsForSemanticCategory(category: SemanticCategory): string[] {
    switch (category) {
      case 'react-component':
        return ['component', 'react'];
      case 'react-hook':
        return ['hook', 'react'];
      case 'service':
        return ['service'];
      case 'repository':
        return ['repository', 'data access'];
      case 'validator':
        return ['validator', 'validation'];
      case 'utility':
        return [];  // Too generic
      case 'test':
        return [];  // Test files don't need discovery keywords
      case 'types':
        return [];  // Type files don't need discovery keywords
      case 'config':
        return [];  // Config files don't need discovery keywords
      default:
        return [];
    }
  }

  /**
   * Infer semantic category from file name and extension (fast, naming-based).
   * Returns a hint about what type of module this likely is.
   * @deprecated Use AST-based analysis via useSemanticAnalysis option for accuracy
   */
  inferSemanticCategory(fileName: string): SemanticCategory {
    return this.inferSemanticCategoryFromName(fileName);
  }

  /**
   * Fast naming-based semantic category inference.
   * Less accurate than AST analysis but much faster.
   */
  private inferSemanticCategoryFromName(fileName: string): SemanticCategory {
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);

    // Test file patterns (check early)
    if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(fileName)) {
      return 'test';
    }

    // Types-only file patterns (check before hook detection)
    if (/\.types?\.(ts|tsx)$/.test(fileName) || /\.d\.ts$/.test(fileName)) {
      return 'types';
    }

    // use* prefix = React hook (must be followed by uppercase letter)
    // This prevents 'user.ts' from matching
    if (/^use[A-Z]/.test(baseName)) {
      return 'react-hook';
    }

    // .tsx with PascalCase = likely React component
    if (ext === '.tsx' && /^[A-Z]/.test(baseName)) {
      return 'react-component';
    }

    // Service/Repository patterns
    if (/Service$/i.test(baseName)) {
      return 'service';
    }
    if (/Repository$/i.test(baseName)) {
      return 'repository';
    }

    // Validator patterns
    if (/Validator$/i.test(baseName) || /Schema$/i.test(baseName)) {
      return 'validator';
    }

    // Config patterns
    if (/Config|Constants?$/i.test(baseName)) {
      return 'config';
    }

    // .ts with common utility suffixes
    const utilityPatterns = /^(.*)(Utils?|Helper|Client|Api|State)$/i;
    if (ext === '.ts' && utilityPatterns.test(baseName)) {
      return 'utility';
    }

    return 'unknown';
  }
}
