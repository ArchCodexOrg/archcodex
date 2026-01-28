/**
 * @arch archcodex.util
 *
 * Utilities for manipulating @arch tags in source files.
 * Supports TypeScript/JavaScript, Python, and Go comment syntax.
 */

/** Supported languages for @arch tag insertion */
export type ArchTagLanguage = 'typescript' | 'javascript' | 'python' | 'go';

/**
 * Detect language from file extension.
 */
export function detectLanguageFromExtension(filePath: string): ArchTagLanguage {
  const ext = filePath.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'py':
      return 'python';
    case 'go':
      return 'go';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'ts':
    case 'tsx':
    case 'mts':
    case 'cts':
    default:
      return 'typescript';
  }
}

/**
 * Insert an @arch tag into file content.
 * Handles shebangs, 'use strict'/'use client', and existing comments.
 *
 * @param content - The file content
 * @param archId - The architecture ID to insert
 * @param filePath - Optional file path for language detection (defaults to TypeScript)
 */
export function insertArchTag(
  content: string,
  archId: string,
  filePath?: string
): string {
  const language = filePath ? detectLanguageFromExtension(filePath) : 'typescript';

  switch (language) {
    case 'python':
      return insertPythonArchTag(content, archId);
    case 'go':
      return insertGoArchTag(content, archId);
    default:
      return insertTypeScriptArchTag(content, archId);
  }
}

/**
 * Insert @arch tag for TypeScript/JavaScript files.
 * Uses JSDoc block comment syntax.
 */
function insertTypeScriptArchTag(content: string, archId: string): string {
  const tag = `/**\n * @arch ${archId}\n */\n`;

  // Handle shebang
  if (content.startsWith('#!')) {
    const idx = content.indexOf('\n');
    if (idx !== -1) return content.slice(0, idx + 1) + tag + content.slice(idx + 1);
  }

  // Handle 'use strict' or 'use client'
  const useMatch = content.match(/^(['"]use (?:strict|client)['"];?\n)/);
  if (useMatch) return useMatch[0] + tag + content.slice(useMatch[0].length);

  // Handle existing JSDoc - insert @arch into it
  const jsdocMatch = content.match(/^\/\*\*[\s\S]*?\*\/\n?/);
  if (jsdocMatch) {
    const doc = jsdocMatch[0];
    const i = doc.lastIndexOf('*/');
    return doc.slice(0, i) + ` * @arch ${archId}\n ` + doc.slice(i) + content.slice(doc.length);
  }

  return tag + content;
}

/**
 * Insert @arch tag for Python files.
 * Uses hash comment syntax: # @arch id
 * Respects shebangs, encoding declarations, and docstrings.
 */
function insertPythonArchTag(content: string, archId: string): string {
  const tag = `# @arch ${archId}\n`;
  let insertIndex = 0;

  // Handle shebang (#!/usr/bin/env python)
  if (content.startsWith('#!')) {
    const idx = content.indexOf('\n');
    if (idx !== -1) insertIndex = idx + 1;
  }

  // Handle encoding declaration (# -*- coding: utf-8 -*-) after shebang
  const afterShebang = content.slice(insertIndex);
  const encodingMatch = afterShebang.match(/^#.*?coding[=:]\s*[\w-]+.*?\n/);
  if (encodingMatch) {
    insertIndex += encodingMatch[0].length;
  }

  // Check if there's already an @arch comment
  const afterHeaders = content.slice(insertIndex);
  const existingArchMatch = afterHeaders.match(/^#\s*@arch\s+[\w.]+\n?/);
  if (existingArchMatch) {
    // Replace existing @arch tag
    return (
      content.slice(0, insertIndex) +
      tag +
      afterHeaders.slice(existingArchMatch[0].length)
    );
  }

  // Insert after headers, before module docstring or code
  return content.slice(0, insertIndex) + tag + content.slice(insertIndex);
}

/**
 * Insert @arch tag for Go files.
 * Uses line comment syntax: // @arch id
 * Respects build tags and package documentation.
 */
function insertGoArchTag(content: string, archId: string): string {
  const tag = `// @arch ${archId}\n`;
  let insertIndex = 0;

  // Handle build tags (//go:build, // +build)
  const buildTagMatch = content.match(/^(\/\/go:build.*\n|\/\/ \+build.*\n)+/);
  if (buildTagMatch) {
    insertIndex = buildTagMatch[0].length;
    // Build tags require a blank line after them
    if (!content.slice(insertIndex).startsWith('\n')) {
      insertIndex = buildTagMatch[0].length;
    }
  }

  // Check if there's already an @arch comment
  const afterBuildTags = content.slice(insertIndex);
  const existingArchMatch = afterBuildTags.match(/^\/\/\s*@arch\s+[\w.]+\n?/);
  if (existingArchMatch) {
    // Replace existing @arch tag
    return (
      content.slice(0, insertIndex) +
      tag +
      afterBuildTags.slice(existingArchMatch[0].length)
    );
  }

  // Insert after build tags, before package doc or package declaration
  return content.slice(0, insertIndex) + tag + content.slice(insertIndex);
}

/**
 * Replace an existing @arch tag with a new architecture ID.
 * Works across all supported languages (the @arch pattern is the same).
 */
export function replaceArchTag(content: string, archId: string): string {
  return content.replace(/(@arch\s+)[\w.]+/, `$1${archId}`);
}

/**
 * Check if content already has an @arch tag.
 */
export function hasArchTag(content: string): boolean {
  return /@arch\s+[\w.]+/.test(content);
}

/**
 * Extract the @arch ID from content, if present.
 */
export function extractArchId(content: string): string | null {
  const match = content.match(/@arch\s+([\w.]+)/);
  return match ? match[1] : null;
}
