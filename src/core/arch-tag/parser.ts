/**
 * @arch archcodex.core.domain.parser
 */
import type { ArchTag, OverrideTag, IntentAnnotation, ParseResult, ParseError } from './types.js';

// Regex patterns for tag extraction
// Architecture IDs must contain at least one dot (e.g., "domain.service")
// This prevents matching "@arch tag" in descriptive text
// Supports hyphens in IDs (e.g., "frontend.modal-wrapper")
// Extended to capture inline mixins: @arch archId +mixin1 +mixin2
const ARCH_TAG_PATTERN = /@arch\s+([\w-]+\.[\w.-]+)((?:\s+\+[\w-]+)*)/;
// Pattern to extract individual +mixin from the captured group
const INLINE_MIXIN_PATTERN = /\+[\w-]+/g;
const OVERRIDE_PATTERN = /@override\s+(\w+):(.+)/;
const REASON_PATTERN = /@reason\s+(.+)/;
const EXPIRES_PATTERN = /@expires\s+(\d{4}-\d{2}-\d{2})/;
const TICKET_PATTERN = /@ticket\s+(\S+)/;
const APPROVED_BY_PATTERN = /@approved_by\s+(@?\S+)/;
// Semantic intent annotations: @intent:name (e.g., @intent:includes-deleted)
const INTENT_PATTERN = /@intent:([a-z][a-z0-9-]*)/i;
// Placeholder names used in documentation, not real intents
const INTENT_PLACEHOLDERS = new Set(['name', 'example', 'placeholder']);

/**
 * Parse a source file to extract @arch and @override tags.
 * File-level intents are only collected from the file header comment block
 * (the comment block containing @arch). Function-level intents are handled
 * by the TypeScript validator separately.
 */
export function parseArchTags(content: string): ParseResult {
  const lines = content.split('\n');
  const errors: ParseError[] = [];

  let archTag: ArchTag | null = null;
  const overrides: OverrideTag[] = [];
  const intents: IntentAnnotation[] = [];

  // State for tracking multi-line override blocks
  let currentOverride: Partial<OverrideTag> | null = null;
  let overrideStartLine = 0;

  // State for tracking file header comment block
  // File-level intents are only valid within the same comment block as @arch
  let inHeaderComment = false;
  let headerCommentEnded = false;
  let foundArchInComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Track comment blocks to identify file header
    const hasCommentStart = line.includes('/**') || line.includes('/*');
    const hasCommentEnd = line.includes('*/');

    // Start of a comment block
    if (hasCommentStart && !headerCommentEnded) {
      inHeaderComment = true;
    }

    // Look for @arch tag (only take the first one)
    if (!archTag) {
      const archMatch = line.match(ARCH_TAG_PATTERN);
      if (archMatch) {
        // Extract inline mixins from the second capture group (e.g., " +mixin1 +mixin2")
        const inlineMixins: string[] = [];
        if (archMatch[2]) {
          const mixinMatches = archMatch[2].match(INLINE_MIXIN_PATTERN);
          if (mixinMatches) {
            for (const m of mixinMatches) {
              inlineMixins.push(m.slice(1)); // Remove the leading '+'
            }
          }
        }

        archTag = {
          archId: archMatch[1],
          inlineMixins: inlineMixins.length > 0 ? inlineMixins : undefined,
          line: lineNum,
          column: line.indexOf('@arch') + 1,
        };

        // Mark that we found @arch in a comment block
        if (inHeaderComment) {
          foundArchInComment = true;
        }
      }
    }

    // Look for @intent: annotations (semantic patterns)
    // Only collect file-level intents from the header comment block containing @arch
    const intentMatch = line.match(INTENT_PATTERN);
    if (intentMatch) {
      // File-level intent: must be in the same comment block as @arch OR before @arch in header
      const isInHeaderWithArch = inHeaderComment && (foundArchInComment || !archTag);
      if (isInHeaderWithArch || (!headerCommentEnded && !archTag)) {
        const intentName = intentMatch[1].toLowerCase();
        if (!INTENT_PLACEHOLDERS.has(intentName)) {
          intents.push({
            name: intentName,
            line: lineNum,
            column: line.indexOf('@intent:') + 1,
          });
        }
      }
      // Intents outside the header comment are function-level (handled by TypeScript validator)
    }

    // End of comment block
    if (hasCommentEnd && inHeaderComment) {
      inHeaderComment = false;
      // If this comment contained @arch, mark header as ended
      if (foundArchInComment) {
        headerCommentEnded = true;
      }
    }

    // Look for @override start
    const overrideMatch = line.match(OVERRIDE_PATTERN);
    if (overrideMatch) {
      // Save previous override if exists
      if (currentOverride && currentOverride.rule) {
        overrides.push(finalizeOverride(currentOverride, overrideStartLine, errors));
      }

      currentOverride = {
        rule: overrideMatch[1].trim(),
        value: overrideMatch[2].trim(),
      };
      overrideStartLine = lineNum;
      continue;
    }

    // If we're building an override, look for its metadata
    if (currentOverride) {
      // Check for reason
      const reasonMatch = line.match(REASON_PATTERN);
      if (reasonMatch) {
        currentOverride.reason = reasonMatch[1].trim();
        continue;
      }

      // Check for expires
      const expiresMatch = line.match(EXPIRES_PATTERN);
      if (expiresMatch) {
        currentOverride.expires = expiresMatch[1];
        continue;
      }

      // Check for ticket
      const ticketMatch = line.match(TICKET_PATTERN);
      if (ticketMatch) {
        currentOverride.ticket = ticketMatch[1];
        continue;
      }

      // Check for approved_by
      const approvedMatch = line.match(APPROVED_BY_PATTERN);
      if (approvedMatch) {
        currentOverride.approvedBy = approvedMatch[1];
        continue;
      }

      // End of comment block - finalize override
      if (line.includes('*/')) {
        overrides.push(finalizeOverride(currentOverride, overrideStartLine, errors));
        currentOverride = null;
        continue;
      }

      // Non-@ line in comment block - might be continuation of reason
      // For now, we'll just continue
    }

    // Track end of comment blocks
    if (line.includes('*/')) {
      if (currentOverride && currentOverride.rule) {
        overrides.push(finalizeOverride(currentOverride, overrideStartLine, errors));
        currentOverride = null;
      }
    }
  }

  // Handle any remaining override at end of file
  if (currentOverride && currentOverride.rule) {
    overrides.push(finalizeOverride(currentOverride, overrideStartLine, errors));
  }

  return { archTag, overrides, intents, errors };
}

/**
 * Finalize an override tag, validating required fields.
 */
function finalizeOverride(
  partial: Partial<OverrideTag>,
  line: number,
  errors: ParseError[]
): OverrideTag {
  const override: OverrideTag = {
    rule: partial.rule || '',
    value: partial.value || '',
    reason: partial.reason,
    expires: partial.expires,
    ticket: partial.ticket,
    approvedBy: partial.approvedBy,
    line,
  };

  // Validate
  if (!override.rule) {
    errors.push({
      message: 'Override missing rule name',
      line,
    });
  }

  if (!override.value) {
    errors.push({
      message: 'Override missing value',
      line,
    });
  }

  return override;
}

/**
 * Extract just the @arch tag from content (fast path).
 * Returns only the archId, not inline mixins.
 */
export function extractArchId(content: string): string | null {
  const match = content.match(ARCH_TAG_PATTERN);
  return match ? match[1] : null;
}

/**
 * Extract the full @arch tag including inline mixins (fast path).
 * Returns { archId, inlineMixins } or null if no tag found.
 */
export function extractArchTag(content: string): { archId: string; inlineMixins?: string[] } | null {
  const match = content.match(ARCH_TAG_PATTERN);
  if (!match) return null;

  const inlineMixins: string[] = [];
  if (match[2]) {
    const mixinMatches = match[2].match(INLINE_MIXIN_PATTERN);
    if (mixinMatches) {
      for (const m of mixinMatches) {
        inlineMixins.push(m.slice(1)); // Remove the leading '+'
      }
    }
  }

  return {
    archId: match[1],
    inlineMixins: inlineMixins.length > 0 ? inlineMixins : undefined,
  };
}

/**
 * Check if content has an @arch tag.
 */
export function hasArchTag(content: string): boolean {
  return ARCH_TAG_PATTERN.test(content);
}

/**
 * Check if content has any @override tags.
 */
export function hasOverrides(content: string): boolean {
  return OVERRIDE_PATTERN.test(content);
}

/**
 * Extract all @intent: annotations from content (fast path).
 */
export function extractIntents(content: string): string[] {
  const globalPattern = /@intent:([a-z][a-z0-9-]*)/gi;
  const matches = content.matchAll(globalPattern);
  return Array.from(matches, m => m[1].toLowerCase())
    .filter(name => !INTENT_PLACEHOLDERS.has(name));
}

/**
 * Check if content has any @intent: annotations.
 */
export function hasIntents(content: string): boolean {
  return INTENT_PATTERN.test(content);
}

/**
 * Validate an override tag against config requirements.
 */
export function validateOverride(
  override: OverrideTag,
  config: {
    requiredFields: string[];
    warnNoExpiry: boolean;
    maxExpiryDays: number;
    failOnExpired: boolean;
  }
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  for (const field of config.requiredFields) {
    if (field === 'reason' && !override.reason) {
      errors.push('Override requires @reason field');
    }
  }

  // Check expiry
  if (override.expires) {
    const expiryDate = new Date(override.expires);
    const now = new Date();

    if (isNaN(expiryDate.getTime())) {
      errors.push(`Invalid expiry date format: ${override.expires}`);
    } else if (expiryDate < now) {
      if (config.failOnExpired) {
        errors.push(`Override expired on ${override.expires}`);
      } else {
        warnings.push(`Override expired on ${override.expires}`);
      }
    } else {
      // Check max expiry days
      const daysDiff = Math.ceil(
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysDiff > config.maxExpiryDays) {
        errors.push(
          `Override expiry exceeds maximum of ${config.maxExpiryDays} days`
        );
      }
    }
  } else if (config.warnNoExpiry) {
    warnings.push('Override has no expiration date');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
