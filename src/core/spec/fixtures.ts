/**
 * @arch archcodex.core.domain
 * @intent:spec-infrastructure
 *
 * Fixture system for SpecCodex.
 * Loads project-defined fixtures from .arch/specs/_fixtures.yaml
 * and resolves @fixtureName references in spec examples.
 */
import * as path from 'node:path';
import { loadYaml, fileExists } from '../../utils/index.js';
import { logger } from '../../utils/logger.js';
import { z } from 'zod';

const DEFAULT_FIXTURES_FILE = '.arch/specs/_fixtures.yaml';

// === Fixture Schema ===

export const FixtureParamSchema = z.object({
  type: z.string(),
  required: z.boolean().optional(),
  default: z.unknown().optional(),
  description: z.string().optional(),
});

export const FixtureDefinitionSchema = z.object({
  description: z.string().optional(),
  mode: z.enum(['generate', 'documentation']).default('generate'),
  value: z.unknown().optional(),
  generator: z.string().optional(), // JS expression for dynamic generation
  params: z.record(z.string(), FixtureParamSchema).optional(),
  depends_on: z.array(z.string()).optional(),
  setup: z.string().optional(), // For documentation-only fixtures
});

export type FixtureDefinition = z.infer<typeof FixtureDefinitionSchema>;

export const FixtureRegistrySchema = z.object({
  version: z.string().optional(),
  fixtures: z.record(z.string(), FixtureDefinitionSchema).default({}),
});

export type FixtureRegistry = z.infer<typeof FixtureRegistrySchema>;

// === Built-in Fixtures ===
// These are always available, even without a _fixtures.yaml file

const BUILTIN_FIXTURES: Record<string, FixtureDefinition> = {
  authenticated: {
    description: 'Valid authenticated user with standard permissions',
    mode: 'generate',
    value: {
      id: 'user_test_authenticated',
      email: 'test@example.com',
      permissions: ['read', 'write'],
      role: 'member',
    },
  },
  no_access: {
    description: 'User without any permissions',
    mode: 'generate',
    value: {
      id: 'user_test_no_access',
      email: 'no-access@example.com',
      permissions: [],
      role: 'guest',
    },
  },
  admin_user: {
    description: 'Admin user with full permissions',
    mode: 'generate',
    value: {
      id: 'user_test_admin',
      email: 'admin@example.com',
      permissions: ['read', 'write', 'delete', 'admin'],
      role: 'admin',
    },
  },
};

// === Fixture Context ===

export interface FixtureContext {
  projectRoot: string;
  registry: FixtureRegistry;
  resolved: Map<string, unknown>; // Cache of resolved fixtures
}

// === Fixture Resolution Result ===

export interface FixtureResult {
  success: boolean;
  value?: unknown;
  error?: string;
  mode: 'generate' | 'documentation';
}

/**
 * Load fixtures from project and merge with built-in defaults.
 */
export async function loadFixtures(projectRoot: string): Promise<FixtureRegistry> {
  const fixturesPath = path.resolve(projectRoot, DEFAULT_FIXTURES_FILE);

  // Start with built-in fixtures
  const registry: FixtureRegistry = {
    version: '1.0',
    fixtures: { ...BUILTIN_FIXTURES },
  };

  // Load project fixtures if they exist
  if (await fileExists(fixturesPath)) {
    try {
      const content = await loadYaml<Record<string, unknown>>(fixturesPath);
      if (content) {
        const parsed = FixtureRegistrySchema.safeParse(content);
        if (parsed.success) {
          // Project fixtures override built-ins
          registry.fixtures = { ...registry.fixtures, ...parsed.data.fixtures };
          if (parsed.data.version) {
            registry.version = parsed.data.version;
          }
        }
      }
    } catch (error) {
      logger.warn(`Failed to load fixtures from ${fixturesPath}: ${error}`);
    }
  }

  return registry;
}

/**
 * Create a fixture context for resolving fixture references.
 */
export function createFixtureContext(projectRoot: string, registry: FixtureRegistry): FixtureContext {
  return {
    projectRoot,
    registry,
    resolved: new Map(),
  };
}

/**
 * Resolve a fixture reference.
 *
 * @param name - Fixture name (e.g., "authenticated", "validTaskEntry")
 * @param params - Optional parameters for parameterized fixtures
 * @param context - Fixture context with registry and cache
 * @returns Resolved fixture value or error
 */
export function resolveFixture(
  name: string,
  params: Record<string, unknown> = {},
  context: FixtureContext
): FixtureResult {
  const fixture = context.registry.fixtures[name];

  if (!fixture) {
    return {
      success: false,
      error: `Unknown fixture: @${name}`,
      mode: 'documentation',
    };
  }

  // Check if already resolved (with same params)
  const cacheKey = `${name}:${JSON.stringify(params)}`;
  if (context.resolved.has(cacheKey)) {
    return {
      success: true,
      value: context.resolved.get(cacheKey),
      mode: fixture.mode,
    };
  }

  // Documentation-only fixtures don't generate values
  if (fixture.mode === 'documentation') {
    return {
      success: true,
      value: `@${name}`, // Return as-is for documentation
      mode: 'documentation',
    };
  }

  // Resolve dependencies first
  if (fixture.depends_on) {
    for (const dep of fixture.depends_on) {
      const depResult = resolveFixture(dep, {}, context);
      if (!depResult.success) {
        return {
          success: false,
          error: `Failed to resolve dependency @${dep}: ${depResult.error}`,
          mode: fixture.mode,
        };
      }
    }
  }

  // Resolve the fixture value
  let value: unknown;

  if (fixture.generator) {
    // Dynamic generation via JS expression
    try {
      // Create a safe evaluation context with resolved dependencies
      const evalContext: Record<string, unknown> = {
        params,
        Date,
        Math,
        JSON,
      };

      // Add resolved dependencies to context
      if (fixture.depends_on) {
        for (const dep of fixture.depends_on) {
          evalContext[dep] = context.resolved.get(`${dep}:{}`);
        }
      }

      // Simple expression evaluation (no eval, just template substitution)
      value = substituteTemplateVars(fixture.generator, evalContext);
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate fixture @${name}: ${error}`,
        mode: fixture.mode,
      };
    }
  } else if (fixture.value !== undefined) {
    // Static value with parameter substitution
    value = substituteParams(fixture.value, params);
  } else {
    return {
      success: false,
      error: `Fixture @${name} has no value or generator`,
      mode: fixture.mode,
    };
  }

  // Cache the resolved value
  context.resolved.set(cacheKey, value);

  return {
    success: true,
    value,
    mode: fixture.mode,
  };
}

/**
 * Check if a fixture is documentation-only (no test generation).
 */
export function isDocumentationOnly(fixture: FixtureDefinition): boolean {
  return fixture.mode === 'documentation';
}

/**
 * Check if a string is a fixture reference (starts with @ and matches fixture name pattern).
 */
export function isFixtureReference(value: string): boolean {
  // Match @fixtureName or @fixtureName({ params })
  return /^@[a-zA-Z][a-zA-Z0-9_]*(?:\([^)]*\))?$/.test(value);
}

/**
 * Parse a fixture reference to extract name and params.
 */
export function parseFixtureReference(value: string): { name: string; params: Record<string, unknown> } | null {
  const match = value.match(/^@([a-zA-Z][a-zA-Z0-9_]*)(?:\((\{.*\})\))?$/);
  if (!match) {
    return null;
  }

  const name = match[1];
  let params: Record<string, unknown> = {};

  if (match[2]) {
    try {
      // Parse JSON params
      params = JSON.parse(match[2].replace(/'/g, '"'));
    } catch { /* malformed JSON parameters */
      // Invalid params, return null
      return null;
    }
  }

  return { name, params };
}

/**
 * List all available fixtures.
 */
export function listFixtures(registry: FixtureRegistry): Array<{
  name: string;
  description?: string;
  mode: 'generate' | 'documentation';
  hasParams: boolean;
}> {
  return Object.entries(registry.fixtures).map(([name, fixture]) => ({
    name,
    description: fixture.description,
    mode: fixture.mode,
    hasParams: !!fixture.params && Object.keys(fixture.params).length > 0,
  }));
}

/**
 * Get the default fixtures file template.
 */
export function getFixturesTemplate(): string {
  return `# SpecCodex Fixtures
# Define reusable test fixtures for spec examples
#
# Usage in specs:
#   given: { user: "@authenticated", entry: "@validEntry" }

version: "1.0"

fixtures:
  # User fixtures (built-in, can be overridden)
  # authenticated:
  #   description: "Valid authenticated user"
  #   mode: generate
  #   value:
  #     id: "user_test_authenticated"
  #     permissions: ["read", "write"]

  # Example: Domain-specific fixtures
  # validEntry:
  #   description: "Pre-existing valid entry for tests"
  #   mode: generate
  #   depends_on: [authenticated]
  #   value:
  #     _id: "entry_test_valid"
  #     title: "Test Entry"
  #     userId: "\${authenticated.id}"

  # Example: Documentation-only fixture
  # archivedEntry:
  #   description: "Entry that has been archived"
  #   mode: documentation
  #   setup: "Archive an entry via API before test"

  # Example: Parameterized fixture
  # userWithPermission:
  #   description: "User with specific permission"
  #   mode: generate
  #   params:
  #     permission: { type: string, required: true }
  #   value:
  #     id: "user_test_custom"
  #     permissions: ["\${permission}"]
`;
}

// === Helper Functions ===

/**
 * Substitute parameters into a value (recursive).
 */
function substituteParams(value: unknown, params: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    // Replace ${param} with actual value
    return value.replace(/\$\{([^}]+)\}/g, (_, key) => {
      const val = params[key];
      return val !== undefined ? String(val) : `\${${key}}`;
    });
  }

  if (Array.isArray(value)) {
    return value.map(item => substituteParams(item, params));
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = substituteParams(v, params);
    }
    return result;
  }

  return value;
}

/**
 * Simple template variable substitution (no eval).
 */
function substituteTemplateVars(template: string, _context: Record<string, unknown>): unknown {
  // For now, just return the template as-is
  // Full generator support would require more complex parsing
  return template;
}
