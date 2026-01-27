/**
 * @arch archcodex.core.domain
 *
 * Architecture inference rules based on file content patterns.
 */
import type { InferenceRuleConfig, InferenceSettings } from '../config/schema.js';

export interface InferenceResult {
  archId: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  matchedPatterns: string[];
}

export interface InferenceRule {
  name: string;
  archId: string;
  confidence: 'high' | 'medium' | 'low';
  /** Check file name/path */
  filePattern?: RegExp;
  /** Check file content with regex */
  contentPatterns?: RegExp[];
  /** All patterns must match (AND) vs any pattern (OR) */
  matchAll?: boolean;
  /** Description of what this rule detects */
  description: string;
}

/**
 * Default inference rules for common patterns.
 * Rules are checked in order - first match wins.
 */
export const DEFAULT_RULES: InferenceRule[] = [
  // React Hooks (high confidence)
  {
    name: 'react-hook',
    archId: 'frontend.hook',
    confidence: 'high',
    filePattern: /^use[A-Z].*\.(ts|tsx)$/,
    contentPatterns: [/export\s+(const|function)\s+use[A-Z]/],
    description: 'React hook (use* naming convention)',
  },
  // React Context (high confidence)
  {
    name: 'react-context',
    archId: 'frontend.context',
    confidence: 'high',
    contentPatterns: [/createContext\s*[<(]/],
    description: 'React Context provider (createContext call)',
  },
  // Barrel/Index files (high confidence)
  {
    name: 'barrel-file',
    archId: 'base.barrel',
    confidence: 'high',
    filePattern: /^index\.(ts|js)$/,
    contentPatterns: [/^export\s+(\*|{)/m],
    description: 'Barrel file (index.ts with re-exports only)',
  },
  // Convex mutations (high confidence)
  {
    name: 'convex-mutation',
    archId: 'convex.mutation',
    confidence: 'high',
    contentPatterns: [/export\s+const\s+\w+\s*=\s*mutation\s*\(/],
    description: 'Convex mutation',
  },
  // Convex queries (high confidence)
  {
    name: 'convex-query',
    archId: 'convex.query',
    confidence: 'high',
    contentPatterns: [/export\s+const\s+\w+\s*=\s*query\s*\(/],
    description: 'Convex query',
  },
  // Convex actions (high confidence)
  {
    name: 'convex-action',
    archId: 'convex.action',
    confidence: 'high',
    contentPatterns: [/export\s+const\s+\w+\s*=\s*action\s*\(/],
    description: 'Convex action',
  },
  // React Components - .tsx with JSX (medium confidence)
  {
    name: 'react-component',
    archId: 'frontend.component',
    confidence: 'medium',
    filePattern: /\.(tsx|jsx)$/,
    contentPatterns: [/return\s*\(?\s*</, /export\s+(default\s+)?(function|const)/],
    matchAll: true,
    description: 'React component (.tsx with JSX return)',
  },
  // TypeScript types file (medium confidence)
  {
    name: 'types-file',
    archId: 'base.types',
    confidence: 'medium',
    filePattern: /\.types?\.(ts|tsx)$/,
    description: 'Type definitions file (*.types.ts)',
  },
  // Test files (high confidence)
  {
    name: 'test-file',
    archId: 'base.test',
    confidence: 'high',
    filePattern: /\.(test|spec)\.(ts|tsx|js|jsx)$/,
    description: 'Test file',
  },
  // Utility/Helper files (low confidence)
  {
    name: 'utility-file',
    archId: 'base.utility',
    confidence: 'low',
    filePattern: /(utils?|helpers?|lib)\.(ts|js)$/i,
    description: 'Utility/helper file',
  },
  // Service files (low confidence)
  {
    name: 'service-file',
    archId: 'core.service',
    confidence: 'low',
    filePattern: /[Ss]ervice\.(ts|js)$/,
    description: 'Service file (*Service.ts)',
  },
  // Schema files (medium confidence)
  {
    name: 'schema-file',
    archId: 'core.schema',
    confidence: 'medium',
    filePattern: /schema\.(ts|js)$/i,
    contentPatterns: [/z\.(object|string|number|array|enum)/],
    description: 'Zod schema file',
  },
];

/**
 * Infer architecture from file content and path.
 * @param filePath - Relative file path (e.g., 'src/cli/commands/check.ts')
 * @param content - File content
 * @param customRules - Optional custom rules (defaults to DEFAULT_RULES)
 */
export function inferArchitecture(
  filePath: string,
  content: string,
  customRules?: InferenceRule[]
): InferenceResult | null {
  const rules = customRules || DEFAULT_RULES;

  for (const rule of rules) {
    const matchedPatterns: string[] = [];

    // Check file pattern (matches against full relative path)
    if (rule.filePattern) {
      if (!rule.filePattern.test(filePath)) {
        if (rule.matchAll || !rule.contentPatterns?.length) continue;
      } else {
        matchedPatterns.push(`path: ${rule.filePattern.source}`);
      }
    }

    // Check content patterns
    if (rule.contentPatterns?.length) {
      const contentMatches = rule.contentPatterns.filter(p => p.test(content));

      if (rule.matchAll) {
        // All patterns must match
        if (contentMatches.length !== rule.contentPatterns.length) continue;
      } else {
        // At least one pattern must match
        if (contentMatches.length === 0 && !matchedPatterns.length) continue;
      }

      matchedPatterns.push(...contentMatches.map(p => `content: ${p.source}`));
    }

    // If we have matches, return the result
    if (matchedPatterns.length > 0) {
      return {
        archId: rule.archId,
        confidence: rule.confidence,
        reason: rule.description,
        matchedPatterns,
      };
    }
  }

  return null;
}

/**
 * Check if content is a barrel file (only exports, no logic).
 */
export function isBarrelFile(content: string): boolean {
  const lines = content.split('\n').filter(line => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*');
  });

  // All non-empty, non-comment lines should be exports
  return lines.every(line => /^\s*export\s+/.test(line));
}

/**
 * Convert config-based inference rules (string patterns) to runtime rules (RegExp).
 * Content patterns use 's' (dotAll) flag so . matches newlines for multiline content.
 */
export function parseConfigRules(configRules: InferenceRuleConfig[]): InferenceRule[] {
  return configRules.map(rule => ({
    name: rule.name,
    archId: rule.archId,
    confidence: rule.confidence,
    filePattern: rule.filePattern ? new RegExp(rule.filePattern) : undefined,
    contentPatterns: rule.contentPatterns?.map(p => new RegExp(p, 's')),
    matchAll: rule.matchAll,
    description: rule.description,
  }));
}

/**
 * Build the rules array based on inference settings.
 * By default, only custom rules are used (use_builtin_rules: false).
 * Set use_builtin_rules: true to include standard React/Convex/etc rules.
 */
export function buildRulesFromSettings(settings?: InferenceSettings): InferenceRule[] {
  const customRules = settings?.custom_rules?.length
    ? parseConfigRules(settings.custom_rules)
    : [];

  // If not using built-in rules, only use custom rules
  if (!settings?.use_builtin_rules) {
    return customRules;
  }

  // If using built-in rules, merge based on prepend_custom setting
  const prependCustom = settings.prepend_custom !== false; // Default to true

  return prependCustom
    ? [...customRules, ...DEFAULT_RULES]
    : [...DEFAULT_RULES, ...customRules];
}
