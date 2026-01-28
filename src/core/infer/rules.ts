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

  // ===================
  // Python Rules
  // ===================

  // Python test files (high confidence)
  {
    name: 'python-test-file',
    archId: 'base.test',
    confidence: 'high',
    filePattern: /(^test_.*\.py$|_test\.py$)/,
    description: 'Python test file (test_*.py or *_test.py)',
  },
  // Python pytest conftest (high confidence)
  {
    name: 'python-conftest',
    archId: 'base.test.fixtures',
    confidence: 'high',
    filePattern: /conftest\.py$/,
    description: 'Python pytest fixtures (conftest.py)',
  },
  // Python __init__.py barrel files (high confidence)
  {
    name: 'python-init',
    archId: 'base.barrel',
    confidence: 'high',
    filePattern: /__init__\.py$/,
    description: 'Python package init file (__init__.py)',
  },
  // Python type stubs (high confidence)
  {
    name: 'python-stub',
    archId: 'base.types',
    confidence: 'high',
    filePattern: /\.pyi$/,
    description: 'Python type stub file (*.pyi)',
  },
  // FastAPI routes (high confidence)
  {
    name: 'fastapi-router',
    archId: 'api.router',
    confidence: 'high',
    filePattern: /\.py$/,
    contentPatterns: [/from\s+fastapi\s+import/, /@(app|router)\.(get|post|put|delete|patch)\(/],
    matchAll: true,
    description: 'FastAPI router with decorated endpoints',
  },
  // Django models (medium confidence) - before views to avoid pattern collision
  {
    name: 'django-model',
    archId: 'core.model',
    confidence: 'medium',
    filePattern: /models?\.py$/,
    contentPatterns: [/from\s+django\.db\s+import\s+models/, /class\s+\w+\(models\.Model\)/],
    matchAll: true,
    description: 'Django model file',
  },
  // Django views (medium confidence)
  {
    name: 'django-view',
    archId: 'web.view',
    confidence: 'medium',
    filePattern: /views?\.py$/,
    contentPatterns: [/from\s+django/],
    matchAll: true,
    description: 'Django view file',
  },
  // Django serializers (medium confidence)
  {
    name: 'django-serializer',
    archId: 'api.serializer',
    confidence: 'medium',
    filePattern: /serializers?\.py$/,
    contentPatterns: [/from\s+rest_framework/],
    description: 'Django REST Framework serializer',
  },
  // Flask routes (medium confidence)
  // Requires .py extension AND flask import AND route decorator
  {
    name: 'flask-route',
    archId: 'api.router',
    confidence: 'medium',
    filePattern: /\.py$/,
    contentPatterns: [/from\s+flask\s+import/, /@(app|bp|blueprint)\.(route|get|post)\(/],
    matchAll: true,
    description: 'Flask route file with decorated endpoints',
  },
  // Pydantic models/schemas (medium confidence)
  {
    name: 'pydantic-model',
    archId: 'core.schema',
    confidence: 'medium',
    filePattern: /(schema|model)s?\.py$/i,
    contentPatterns: [/from\s+pydantic\s+import/, /class\s+\w+\(BaseModel\)/],
    matchAll: true,
    description: 'Pydantic model/schema file',
  },
  // Python CLI (medium confidence)
  {
    name: 'python-cli',
    archId: 'cli.command',
    confidence: 'medium',
    filePattern: /\.py$/,
    contentPatterns: [/(import\s+click|from\s+click\s+import|import\s+argparse|import\s+typer)/],
    matchAll: true,
    description: 'Python CLI module (click/argparse/typer)',
  },
  // Python utility files (low confidence)
  {
    name: 'python-utility',
    archId: 'base.utility',
    confidence: 'low',
    filePattern: /(utils?|helpers?|lib)\.py$/i,
    description: 'Python utility/helper file',
  },

  // ===================
  // Go Rules
  // ===================

  // Go test files (high confidence)
  {
    name: 'go-test-file',
    archId: 'base.test',
    confidence: 'high',
    filePattern: /_test\.go$/,
    description: 'Go test file (*_test.go)',
  },
  // Go main package (high confidence)
  {
    name: 'go-main',
    archId: 'bin.main',
    confidence: 'high',
    filePattern: /\.go$/,
    contentPatterns: [/^package\s+main\s*$/m, /^func\s+main\s*\(\s*\)/m],
    matchAll: true,
    description: 'Go main package with entry point',
  },
  // Go mock files (high confidence)
  // Matches: mock.go, mocks.go, *_mock.go, mock_*.go, fake.go, fake_*.go, *_fake.go
  {
    name: 'go-mock',
    archId: 'base.test.mock',
    confidence: 'high',
    filePattern: /((mock|fake)s?\.go$|(mock|fake)_.*\.go$|_?(mock|fake)s?\.go$)/i,
    description: 'Go mock/fake implementation file',
  },
  // Go HTTP handlers (medium confidence)
  {
    name: 'go-handler',
    archId: 'api.handler',
    confidence: 'medium',
    filePattern: /(handler|controller)s?\.go$/i,
    contentPatterns: [/func\s+\w+\([^)]*http\.ResponseWriter[^)]*\*http\.Request/],
    description: 'Go HTTP handler file',
  },
  // Go middleware (medium confidence)
  {
    name: 'go-middleware',
    archId: 'api.middleware',
    confidence: 'medium',
    filePattern: /middleware\.go$/i,
    contentPatterns: [/func\s+\w+\([^)]*http\.Handler\)/],
    description: 'Go HTTP middleware',
  },
  // Go repository/store (medium confidence)
  {
    name: 'go-repository',
    archId: 'infra.repository',
    confidence: 'medium',
    filePattern: /(repository|repo|store)\.go$/i,
    description: 'Go repository/data store file',
  },
  // Go service files (low confidence)
  {
    name: 'go-service',
    archId: 'core.service',
    confidence: 'low',
    filePattern: /service\.go$/i,
    description: 'Go service file (*service.go)',
  },
  // Go utility files (low confidence)
  {
    name: 'go-utility',
    archId: 'base.utility',
    confidence: 'low',
    filePattern: /(utils?|helpers?|lib)\.go$/i,
    description: 'Go utility/helper file',
  },
  // Go interface definitions (low confidence)
  {
    name: 'go-interface',
    archId: 'core.interface',
    confidence: 'low',
    filePattern: /(interface|contract)s?\.go$/i,
    contentPatterns: [/type\s+\w+\s+interface\s*\{/],
    description: 'Go interface definitions file',
  },
];

/**
 * Extract filename from a path.
 */
function getFilename(filePath: string): string {
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath;
}

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
  const filename = getFilename(filePath);

  for (const rule of rules) {
    const matchedPatterns: string[] = [];

    // Check file pattern (try full path first, then filename)
    // This supports both path-based patterns (/src\/.*/) and filename patterns (/\.test\.ts$/)
    if (rule.filePattern) {
      const matchesPath = rule.filePattern.test(filePath);
      const matchesFilename = rule.filePattern.test(filename);
      if (!matchesPath && !matchesFilename) {
        // File pattern didn't match
        // If matchAll is true or no contentPatterns, skip
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
        // At least one pattern must match (or filePattern matched)
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
