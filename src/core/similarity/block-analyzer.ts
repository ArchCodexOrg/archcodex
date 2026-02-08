/**
 * @arch archcodex.core.engine
 * @intent:stateless
 * @intent:ast-analysis
 *
 * Block-level code similarity analyzer.
 * Detects similar functions/methods across files.
 */
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { Project, SyntaxKind } from 'ts-morph';

export interface CodeBlock {
  name: string;
  file: string;
  line: number;
  lines: number;
  normalized: string;
  /** Hash for quick filtering before expensive comparison */
  hash: number;
}

export interface BlockMatch {
  block1: Omit<CodeBlock, 'normalized' | 'hash'>;
  block2: Omit<CodeBlock, 'normalized' | 'hash'>;
  similarity: number;
}

export interface BlockAnalysisOptions {
  threshold?: number;
  minLines?: number;
  /** Maximum blocks to compare (default: 5000) - prevents memory issues on large codebases */
  maxBlocks?: number;
  /** Maximum matches to return (default: 200) */
  maxMatches?: number;
}

/**
 * Find similar code blocks (functions/methods) across files.
 */
export async function findSimilarBlocks(
  projectRoot: string,
  files: string[],
  options: BlockAnalysisOptions = {}
): Promise<BlockMatch[]> {
  const threshold = options.threshold ?? 0.8;
  const minLines = options.minLines ?? 5;
  const maxBlocks = options.maxBlocks ?? 5000;
  const maxMatches = options.maxMatches ?? 200;

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  // Extract all code blocks from all files
  const allBlocks: CodeBlock[] = [];

  for (const file of files) {
    // Early exit if we've collected enough blocks
    if (allBlocks.length >= maxBlocks) break;

    const absolutePath = path.isAbsolute(file) ? file : path.resolve(projectRoot, file);
    try {
      const content = await fs.readFile(absolutePath, 'utf-8');
      const sourceFile = project.createSourceFile(absolutePath, content, { overwrite: true });
      const relativePath = path.relative(projectRoot, absolutePath);

      // Extract functions
      for (const func of sourceFile.getFunctions()) {
        if (allBlocks.length >= maxBlocks) break;

        const name = func.getName();
        if (!name) continue;

        const body = func.getBody();
        if (!body) continue;

        const text = body.getText();
        const lines = text.split('\n').length;
        if (lines < minLines) continue;

        const normalized = normalizeCode(text);
        allBlocks.push({
          name,
          file: relativePath,
          line: func.getStartLineNumber(),
          lines,
          normalized,
          hash: simpleHash(normalized),
        });
      }

      // Extract class methods
      for (const classDecl of sourceFile.getClasses()) {
        if (allBlocks.length >= maxBlocks) break;

        const className = classDecl.getName() || 'anonymous';

        for (const method of classDecl.getMethods()) {
          if (allBlocks.length >= maxBlocks) break;

          const methodName = method.getName();
          if (methodName.startsWith('_')) continue; // Skip private by convention

          const body = method.getBody();
          if (!body) continue;

          const text = body.getText();
          const lines = text.split('\n').length;
          if (lines < minLines) continue;

          const normalized = normalizeCode(text);
          allBlocks.push({
            name: `${className}.${methodName}`,
            file: relativePath,
            line: method.getStartLineNumber(),
            lines,
            normalized,
            hash: simpleHash(normalized),
          });
        }
      }

      // Extract arrow functions assigned to variables (const foo = () => {})
      for (const varDecl of sourceFile.getVariableDeclarations()) {
        if (allBlocks.length >= maxBlocks) break;

        const init = varDecl.getInitializer();
        if (!init) continue;

        if (init.getKind() === SyntaxKind.ArrowFunction || init.getKind() === SyntaxKind.FunctionExpression) {
          const name = varDecl.getName();
          const text = init.getText();
          const lines = text.split('\n').length;
          if (lines < minLines) continue;

          const normalized = normalizeCode(text);
          allBlocks.push({
            name,
            file: relativePath,
            line: varDecl.getStartLineNumber(),
            lines,
            normalized,
            hash: simpleHash(normalized),
          });
        }
      }

      // Clean up source file to free memory
      project.removeSourceFile(sourceFile);
    } catch { /* TypeScript parse error */
      // Skip files that can't be parsed
    }
  }

  // Group blocks by hash for faster comparison (similar blocks likely have similar hashes)
  const blocksByHash = new Map<number, CodeBlock[]>();
  for (const block of allBlocks) {
    const existing = blocksByHash.get(block.hash) || [];
    existing.push(block);
    blocksByHash.set(block.hash, existing);
  }

  // Compare blocks - prioritize same-hash comparisons (likely matches)
  const matches: BlockMatch[] = [];
  const seenPairs = new Set<string>();

  // First pass: compare blocks with same hash (high probability of match)
  for (const blocks of blocksByHash.values()) {
    if (blocks.length < 2) continue;

    for (let i = 0; i < blocks.length && matches.length < maxMatches; i++) {
      for (let j = i + 1; j < blocks.length && matches.length < maxMatches; j++) {
        const block1 = blocks[i];
        const block2 = blocks[j];

        if (block1.file === block2.file && block1.name === block2.name) continue;

        const pairKey = makePairKey(block1, block2);
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        const similarity = calculateSimilarity(block1.normalized, block2.normalized);
        if (similarity >= threshold) {
          matches.push(createMatch(block1, block2, similarity));
        }
      }
    }
  }

  // Second pass: compare blocks with similar lengths (if we haven't hit max yet)
  if (matches.length < maxMatches) {
    // Sort blocks by normalized length for efficient comparison
    const sortedBlocks = [...allBlocks].sort((a, b) => a.normalized.length - b.normalized.length);

    for (let i = 0; i < sortedBlocks.length && matches.length < maxMatches; i++) {
      const block1 = sortedBlocks[i];
      const len1 = block1.normalized.length;

      // Only compare with blocks of similar length (within 50% ratio)
      for (let j = i + 1; j < sortedBlocks.length && matches.length < maxMatches; j++) {
        const block2 = sortedBlocks[j];
        const len2 = block2.normalized.length;

        // Length ratio check - if too different, skip (and all subsequent due to sorting)
        if (len2 > len1 * 2) break;

        if (block1.file === block2.file && block1.name === block2.name) continue;
        if (block1.hash === block2.hash) continue; // Already compared in first pass

        const pairKey = makePairKey(block1, block2);
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        const similarity = calculateSimilarity(block1.normalized, block2.normalized);
        if (similarity >= threshold) {
          matches.push(createMatch(block1, block2, similarity));
        }
      }
    }
  }

  // Sort by similarity descending
  return matches.sort((a, b) => b.similarity - a.similarity).slice(0, maxMatches);
}

/**
 * Create a unique key for a pair of blocks (order-independent).
 */
function makePairKey(block1: CodeBlock, block2: CodeBlock): string {
  const key1 = `${block1.file}:${block1.name}:${block1.line}`;
  const key2 = `${block2.file}:${block2.name}:${block2.line}`;
  return key1 < key2 ? `${key1}|${key2}` : `${key2}|${key1}`;
}

/**
 * Create a match result from two blocks.
 */
function createMatch(block1: CodeBlock, block2: CodeBlock, similarity: number): BlockMatch {
  return {
    block1: { name: block1.name, file: block1.file, line: block1.line, lines: block1.lines },
    block2: { name: block2.name, file: block2.file, line: block2.line, lines: block2.lines },
    similarity,
  };
}

/**
 * Simple hash function for quick filtering.
 * Blocks with same hash are likely similar.
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

/**
 * Normalize code for comparison.
 * Removes whitespace, comments, and standardizes identifiers.
 */
function normalizeCode(code: string): string {
  return code
    // Remove single-line comments
    .replace(/\/\/[^\n]*/g, '')
    // Remove multi-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Remove leading/trailing whitespace
    .trim()
    // Lowercase for case-insensitive comparison
    .toLowerCase();
}

/**
 * Calculate similarity between two normalized code strings.
 * Uses a combination of token overlap and sequence similarity.
 */
function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  // Token-based Jaccard similarity
  const tokensA = new Set(a.split(/\s+|[.,;(){}[\]]/));
  const tokensB = new Set(b.split(/\s+|[.,;(){}[\]]/));

  const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  const jaccard = union === 0 ? 0 : intersection / union;

  // Length similarity (penalize very different lengths)
  const lengthRatio = Math.min(a.length, b.length) / Math.max(a.length, b.length);

  // Combine metrics
  return jaccard * 0.7 + lengthRatio * 0.3;
}
