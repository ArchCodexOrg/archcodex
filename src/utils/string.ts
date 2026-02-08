/**
 * @arch archcodex.util
 *
 * String manipulation utilities.
 */

/**
 * Truncate a string to a maximum length, adding ellipsis if truncated.
 *
 * @param str - The string to truncate
 * @param maxLen - Maximum length of the resulting string (including ellipsis)
 * @returns The truncated string with ellipsis, or original if within limit
 */
export function truncateString(str: string, maxLen: number): string {
  if (maxLen < 0) {
    return '';
  }

  if (str.length <= maxLen) {
    return str;
  }

  if (maxLen <= 3) {
    return str.slice(0, maxLen);
  }

  return str.slice(0, maxLen - 3) + '...';
}
