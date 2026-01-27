/**
 * @arch archcodex.util
 *
 * Utilities for manipulating @arch tags in source files.
 */

/**
 * Insert an @arch tag into file content.
 * Handles shebangs, 'use strict'/'use client', and existing JSDoc comments.
 */
export function insertArchTag(content: string, archId: string): string {
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
 * Replace an existing @arch tag with a new architecture ID.
 */
export function replaceArchTag(content: string, archId: string): string {
  return content.replace(/(@arch\s+)[\w.]+/, `$1${archId}`);
}
