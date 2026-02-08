/**
 * @arch archcodex.core.domain
 * @intent:spec-infrastructure
 *
 * Integration test generator for SpecCodex.
 * Generates integration tests from spec effects.
 *
 * Based on spec.speccodex.generate.integration:
 * - Each effect → verification code
 * - audit_log effects → verify log table entries
 * - database effects → verify row state
 * - Tests include proper setup and teardown
 */
import type { ResolvedSpec, Effect } from '../schema.js';
import { resolveImplementation } from '../resolver.js';
import {
  escapeString,
  extractExampleInput,
  extractExampleOutput,
  expandValue,
  specIdToFunctionName,
  generateAssertionsFromThen,
  suggestImportPath,
  isConvexArchitecture,
} from './shared.js';

/**
 * Options for integration test generation.
 */
export interface IntegrationGeneratorOptions {
  /** Test framework to use */
  framework?: 'vitest' | 'jest';
  /** Path to test setup helpers */
  setupHelpers?: string;
  /** Add regeneration markers */
  markers?: boolean;
  /** Import path for the function under test */
  importPath?: string;
  /** Function name to test */
  functionName?: string;
  /** Output file path (for calculating relative imports) */
  outputPath?: string;
}

/**
 * Result of integration test generation.
 */
export interface IntegrationGeneratorResult {
  valid: boolean;
  effectTests: number;
  code: string;
  errors: Array<{ code: string; message: string }>;
}

const MARKER_START = '// @speccodex:integration:start - DO NOT EDIT BETWEEN MARKERS';
const MARKER_END = '// @speccodex:integration:end';

/**
 * Effect handler type for generating test code.
 */
type EffectHandler = (effect: Effect, spec: ResolvedSpec, indent: string, isConvex: boolean) => string[];

/**
 * Registry of effect handlers.
 */
const EFFECT_HANDLERS: Record<string, EffectHandler> = {
  audit_log: generateAuditLogTest,
  database: generateDatabaseTest,
  embedding: generateEmbeddingTest,
  cache: generateCacheTest,
  notification: generateNotificationTest,
  webhook: generateWebhookTest,
  scheduler: generateSchedulerTest,
  metrics: generateMetricsTest,
};

/**
 * Generate integration tests from a resolved spec.
 */
export function generateIntegrationTests(
  spec: ResolvedSpec,
  options: IntegrationGeneratorOptions = {}
): IntegrationGeneratorResult {
  const {
    framework = 'vitest',
    setupHelpers,
    markers = true,
  } = options;

  // Auto-resolve implementation if not explicitly provided
  let { importPath, functionName } = options;
  if (!importPath || !functionName) {
    const resolved = resolveImplementation(spec, options.outputPath);
    if (resolved) {
      importPath = importPath || resolved.importPath;
      functionName = functionName || resolved.functionName;
    }
  }

  const errors: Array<{ code: string; message: string }> = [];
  const lines: string[] = [];

  const node = spec.node;

  // Check for effects
  const effects = node.effects || [];
  if (effects.length === 0) {
    return {
      valid: false,
      effectTests: 0,
      code: '',
      errors: [{ code: 'NO_EFFECTS', message: 'Spec has no effects to generate integration tests from' }],
    };
  }

  // Validate spec has intent
  if (!node.intent) {
    return {
      valid: false,
      effectTests: 0,
      code: '',
      errors: [{ code: 'INVALID_SPEC', message: 'Spec is missing required field: intent' }],
    };
  }

  let effectTests = 0;

  // Detect architecture for pattern selection
  const isConvex = isConvexArchitecture(node.architectures);

  // Generate imports
  lines.push(generateImports(framework, setupHelpers, importPath, functionName, spec.specId, effects, node.architectures, isConvex));
  lines.push('');

  // Start markers
  if (markers) {
    lines.push(MARKER_START);
  }

  // Main describe block
  const describeName = functionName || spec.specId.replace('spec.', '');
  lines.push(`describe('${describeName} integration', () => {`);

  // Generate setup and teardown
  lines.push(...generateSetupTeardown(effects, '  ', isConvex));
  lines.push('');

  // Generate effect tests
  lines.push('  describe(\'effects\', () => {');
  for (const effect of effects) {
    const testCode = generateEffectTest(effect, spec, isConvex);
    lines.push(testCode);
    effectTests++;
  }
  lines.push('  });');

  lines.push('});');

  // End markers
  if (markers) {
    lines.push(MARKER_END);
  }

  return {
    valid: true,
    effectTests,
    code: lines.join('\n'),
    errors,
  };
}

/**
 * Generate imports section.
 */
function generateImports(
  framework: 'vitest' | 'jest',
  setupHelpers: string | undefined,
  importPath: string | undefined,
  functionName: string | undefined,
  specId: string,
  effects: Effect[],
  architectures?: string[],
  isConvex = false
): string {
  const lines: string[] = [];

  // Framework imports
  if (framework === 'vitest') {
    if (isConvex) {
      lines.push(`import { describe, it, expect, beforeEach, afterEach } from 'vitest';`);
    } else {
      lines.push(`import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';`);
    }
  }
  // Jest uses globals

  // Setup helpers import (Convex only)
  if (isConvex) {
    if (setupHelpers) {
      lines.push(`import { createTestContext, cleanupTestContext } from '${setupHelpers}';`);
    } else {
      lines.push(`// TODO: Import test setup helpers`);
      lines.push(`// import { createTestContext, cleanupTestContext } from './test-helpers';`);
    }
  }

  // Function import
  if (importPath && functionName) {
    lines.push(`import { ${functionName} } from '${importPath}';`);
  } else {
    // Generate a suggested import based on spec context
    const suggestedFn = specIdToFunctionName(specId);
    const suggestedPath = suggestImportPath(specId, architectures);
    lines.push(`// TODO: Verify import path matches your project structure`);
    lines.push(`import { ${suggestedFn} } from '${suggestedPath}';`);
  }

  // Effect-specific imports (Convex helpers)
  if (isConvex) {
    const effectTypes = new Set(effects.map(e => Object.keys(e)[0]));

    if (effectTypes.has('audit_log')) {
      lines.push(`// import { queryAuditLogs } from './audit-helpers';`);
    }
    if (effectTypes.has('embedding')) {
      lines.push(`// import { waitForEmbedding } from './embedding-helpers';`);
    }
    if (effectTypes.has('cache')) {
      lines.push(`// import { getCacheState } from './cache-helpers';`);
    }
    if (effectTypes.has('metrics')) {
      lines.push(`// import { getMetricsClient } from './metrics-helpers';`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate setup and teardown blocks.
 */
function generateSetupTeardown(effects: Effect[], indent: string, isConvex = false): string[] {
  const lines: string[] = [];
  const effectTypes = new Set(effects.map(e => Object.keys(e)[0]));

  if (isConvex) {
    // Convex: real test context with database
    lines.push(`${indent}let ctx: ReturnType<typeof createTestContext>;`);
    lines.push(`${indent}let result: unknown;`);
    lines.push('');
    lines.push(`${indent}beforeEach(async () => {`);
    lines.push(`${indent}  ctx = createTestContext();`);
    lines.push(`${indent}  // TODO: Set up test fixtures`);

    if (effectTypes.has('audit_log')) {
      lines.push(`${indent}  // Clear audit logs before test`);
    }
    if (effectTypes.has('cache')) {
      lines.push(`${indent}  // Clear cache state before test`);
    }

    lines.push(`${indent}});`);
    lines.push('');
    lines.push(`${indent}afterEach(async () => {`);
    lines.push(`${indent}  await cleanupTestContext(ctx);`);
    lines.push(`${indent}});`);
  } else {
    // Standard: mock-based setup
    lines.push(`${indent}let result: unknown;`);

    // Declare mock variables for each effect type
    if (effectTypes.has('database')) {
      lines.push(`${indent}let mockDb: { insert: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };`);
    }
    if (effectTypes.has('audit_log')) {
      lines.push(`${indent}let mockLogger: ReturnType<typeof vi.fn>;`);
    }
    if (effectTypes.has('cache')) {
      lines.push(`${indent}let mockCache: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; invalidate: ReturnType<typeof vi.fn> };`);
    }
    if (effectTypes.has('notification')) {
      lines.push(`${indent}let mockNotifier: ReturnType<typeof vi.fn>;`);
    }
    if (effectTypes.has('webhook')) {
      lines.push(`${indent}let mockWebhook: ReturnType<typeof vi.fn>;`);
    }
    if (effectTypes.has('scheduler')) {
      lines.push(`${indent}let mockScheduler: { schedule: ReturnType<typeof vi.fn> };`);
    }
    if (effectTypes.has('embedding')) {
      lines.push(`${indent}let mockEmbedding: ReturnType<typeof vi.fn>;`);
    }
    if (effectTypes.has('metrics')) {
      lines.push(`${indent}let mockMetrics: { increment: ReturnType<typeof vi.fn>; gauge: ReturnType<typeof vi.fn>; histogram: ReturnType<typeof vi.fn> };`);
    }

    lines.push('');
    lines.push(`${indent}beforeEach(() => {`);
    lines.push(`${indent}  vi.clearAllMocks();`);

    if (effectTypes.has('database')) {
      lines.push(`${indent}  mockDb = { insert: vi.fn(), update: vi.fn(), delete: vi.fn(), query: vi.fn(), get: vi.fn() };`);
    }
    if (effectTypes.has('audit_log')) {
      lines.push(`${indent}  mockLogger = vi.fn();`);
    }
    if (effectTypes.has('cache')) {
      lines.push(`${indent}  mockCache = { get: vi.fn(), set: vi.fn(), invalidate: vi.fn() };`);
    }
    if (effectTypes.has('notification')) {
      lines.push(`${indent}  mockNotifier = vi.fn();`);
    }
    if (effectTypes.has('webhook')) {
      lines.push(`${indent}  mockWebhook = vi.fn();`);
    }
    if (effectTypes.has('scheduler')) {
      lines.push(`${indent}  mockScheduler = { schedule: vi.fn() };`);
    }
    if (effectTypes.has('embedding')) {
      lines.push(`${indent}  mockEmbedding = vi.fn();`);
    }
    if (effectTypes.has('metrics')) {
      lines.push(`${indent}  mockMetrics = { increment: vi.fn(), gauge: vi.fn(), histogram: vi.fn() };`);
    }

    lines.push(`${indent}});`);
  }

  return lines;
}

/**
 * Generate a test for an effect.
 */
function generateEffectTest(effect: Effect, spec: ResolvedSpec, isConvex = false): string {
  const lines: string[] = [];
  const indent = '    ';

  // Get effect type
  const effectType = Object.keys(effect)[0];

  // Get handler or use generic
  const handler = EFFECT_HANDLERS[effectType] || generateGenericEffectTest;
  const testLines = handler(effect, spec, indent, isConvex);

  lines.push(...testLines);

  return lines.join('\n');
}

/**
 * Generate audit_log effect test.
 */
function generateAuditLogTest(effect: Effect, spec: ResolvedSpec, indent: string, isConvex = false): string[] {
  const lines: string[] = [];
  const config = effect.audit_log as { action?: string; resourceType?: string };

  const specParts = spec.specId.replace('spec.', '').split('.');
  const derivedAction = specParts.join('.');
  const derivedResourceType = specParts[0] || 'resource';

  const action = config?.action || derivedAction;
  const resourceType = config?.resourceType || derivedResourceType;

  const fnName = specIdToFunctionName(spec.specId);
  const testName = `logs audit entry for ${action}`;

  const exampleInput = extractExampleInput(spec);
  const inputCode = exampleInput ? expandValue(exampleInput) : '{}';

  lines.push(`${indent}it('${escapeString(testName)}', async () => {`);

  if (isConvex) {
    lines.push(`${indent}  // Act`);
    lines.push(`${indent}  result = await ${fnName}(ctx, ${inputCode});`);
    lines.push('');
    lines.push(`${indent}  // Assert audit log entry`);
    lines.push(`${indent}  const auditLog = await ctx.db.query('auditLogs')`);
    lines.push(`${indent}    .filter(q => q.eq(q.field('action'), '${action}'))`);
    lines.push(`${indent}    .first();`);
    lines.push('');
    lines.push(`${indent}  expect(auditLog).toBeDefined();`);
    lines.push(`${indent}  expect(auditLog?.action).toBe('${action}');`);
    if (resourceType !== 'unknown') {
      lines.push(`${indent}  expect(auditLog?.resourceType).toBe('${resourceType}');`);
    }
    lines.push(`${indent}  expect(auditLog?.userId).toBe(ctx.userId);`);
  } else {
    lines.push(`${indent}  // Act`);
    lines.push(`${indent}  result = await ${fnName}(${inputCode});`);
    lines.push('');
    lines.push(`${indent}  // Assert audit log was called`);
    lines.push(`${indent}  expect(mockLogger).toHaveBeenCalledWith(`);
    lines.push(`${indent}    expect.objectContaining({ action: '${action}'${resourceType !== 'unknown' ? `, resourceType: '${resourceType}'` : ''} })`);
    lines.push(`${indent}  );`);
  }

  lines.push(`${indent}});`);
  lines.push('');
  return lines;
}

/**
 * Generate database effect test.
 */
function generateDatabaseTest(effect: Effect, spec: ResolvedSpec, indent: string, isConvex = false): string[] {
  const lines: string[] = [];
  const config = effect.database as { table?: string; operation?: string; fields?: string[] };

  const specParts = spec.specId.replace('spec.', '').split('.');
  const derivedTable = specParts[0] ? `${specParts[0]}s` : 'items';
  const actionName = specParts[specParts.length - 1] || '';
  const derivedOperation = actionName.includes('create') ? 'insert' :
    actionName.includes('update') || actionName.includes('edit') ? 'update' :
    actionName.includes('delete') || actionName.includes('remove') ? 'delete' : 'insert';

  const table = config?.table || derivedTable;
  const operation = config?.operation || derivedOperation;

  const fnName = specIdToFunctionName(spec.specId);
  const testName = `${operation}s record in ${table}`;

  const exampleInput = extractExampleInput(spec);
  const inputCode = exampleInput ? expandValue(exampleInput) : '{}';
  const expectedOutput = extractExampleOutput(spec);

  lines.push(`${indent}it('${escapeString(testName)}', async () => {`);

  if (isConvex) {
    // Convex: real database assertions
    if (operation === 'insert') {
      lines.push(`${indent}  // Arrange - count before`);
      lines.push(`${indent}  const countBefore = await ctx.db.query('${table}').collect().then(r => r.length);`);
      lines.push('');
      lines.push(`${indent}  // Act`);
      lines.push(`${indent}  result = await ${fnName}(ctx, ${inputCode});`);
      lines.push('');
      lines.push(`${indent}  // Assert - record created`);
      lines.push(`${indent}  const countAfter = await ctx.db.query('${table}').collect().then(r => r.length);`);
      lines.push(`${indent}  expect(countAfter).toBe(countBefore + 1);`);
      lines.push('');
      lines.push(`${indent}  // Verify record contents`);
      lines.push(`${indent}  const record = await ctx.db.get(result._id);`);
      lines.push(`${indent}  expect(record).toBeDefined();`);
    } else if (operation === 'update') {
      lines.push(`${indent}  // Arrange - create record to update`);
      lines.push(`${indent}  const existingId = await ctx.db.insert('${table}', ${inputCode});`);
      lines.push('');
      lines.push(`${indent}  // Act`);
      lines.push(`${indent}  result = await ${fnName}(ctx, { id: existingId, ...${inputCode} });`);
      lines.push('');
      lines.push(`${indent}  // Assert - record updated`);
      lines.push(`${indent}  const record = await ctx.db.get(existingId);`);
      lines.push(`${indent}  expect(record).toBeDefined();`);
    } else if (operation === 'delete') {
      lines.push(`${indent}  // Arrange - create record to delete`);
      lines.push(`${indent}  const existingId = await ctx.db.insert('${table}', ${inputCode});`);
      lines.push('');
      lines.push(`${indent}  // Act`);
      lines.push(`${indent}  result = await ${fnName}(ctx, { id: existingId });`);
      lines.push('');
      lines.push(`${indent}  // Assert - record deleted (or soft-deleted)`);
      lines.push(`${indent}  const record = await ctx.db.get(existingId);`);
      lines.push(`${indent}  // For soft delete:`);
      lines.push(`${indent}  expect(record?.isDeleted).toBe(true);`);
      lines.push(`${indent}  // For hard delete:`);
      lines.push(`${indent}  // expect(record).toBeNull();`);
    }

    if (expectedOutput) {
      lines.push('');
      lines.push(`${indent}  // Verify specific fields from spec`);
      const assertions = generateAssertionsFromThen(expectedOutput, `${indent}  `);
      lines.push(...assertions);
    }
  } else {
    // Standard: mock-based verification
    lines.push(`${indent}  // Act`);
    lines.push(`${indent}  result = await ${fnName}(${inputCode});`);
    lines.push('');
    lines.push(`${indent}  // Assert - database ${operation} was called`);
    lines.push(`${indent}  expect(mockDb.${operation}).toHaveBeenCalledWith(`);
    lines.push(`${indent}    '${table}',`);
    lines.push(`${indent}    expect.objectContaining(${inputCode})`);
    lines.push(`${indent}  );`);
  }

  lines.push(`${indent}});`);
  lines.push('');
  return lines;
}

/**
 * Generate embedding effect test.
 */
function generateEmbeddingTest(effect: Effect, spec: ResolvedSpec, indent: string, isConvex = false): string[] {
  const lines: string[] = [];
  const config = effect.embedding as string | { timing?: string };
  const isAsyncEmbed = config === 'generated_async' ||
    (typeof config === 'object' && config?.timing === 'async');

  const fnName = specIdToFunctionName(spec.specId);
  const testName = isAsyncEmbed ? 'schedules embedding generation' : 'generates embedding';

  const exampleInput = extractExampleInput(spec);
  const inputCode = exampleInput ? expandValue(exampleInput) : '{}';

  lines.push(`${indent}it('${escapeString(testName)}', async () => {`);

  if (isConvex) {
    lines.push(`${indent}  // Act`);
    lines.push(`${indent}  result = await ${fnName}(ctx, ${inputCode});`);
    lines.push('');
    if (isAsyncEmbed) {
      lines.push(`${indent}  // Assert - embedding job scheduled`);
      lines.push(`${indent}  const scheduledJobs = await ctx.scheduler.getScheduledJobs();`);
      lines.push(`${indent}  const embeddingJob = scheduledJobs.find(j => j.type === 'generateEmbedding');`);
      lines.push(`${indent}  expect(embeddingJob).toBeDefined();`);
      lines.push(`${indent}  expect(embeddingJob?.args.resourceId).toBe(result._id);`);
    } else {
      lines.push(`${indent}  // Assert - embedding generated synchronously`);
      lines.push(`${indent}  const record = await ctx.db.get(result._id);`);
      lines.push(`${indent}  expect(record?.embedding).toBeDefined();`);
      lines.push(`${indent}  expect(Array.isArray(record?.embedding)).toBe(true);`);
    }
  } else {
    lines.push(`${indent}  // Act`);
    lines.push(`${indent}  result = await ${fnName}(${inputCode});`);
    lines.push('');
    lines.push(`${indent}  // Assert - embedding generation was triggered`);
    lines.push(`${indent}  expect(mockEmbedding).toHaveBeenCalled();`);
  }

  lines.push(`${indent}});`);
  lines.push('');
  return lines;
}

/**
 * Generate cache effect test.
 */
function generateCacheTest(effect: Effect, spec: ResolvedSpec, indent: string, isConvex = false): string[] {
  const lines: string[] = [];
  const config = effect.cache as {
    invalidated?: string;
    invalidates?: string[];
    updated?: string;
    ttl?: string;
    key?: string;
  };

  const fnName = specIdToFunctionName(spec.specId);
  const exampleInput = extractExampleInput(spec);
  const inputCode = exampleInput ? expandValue(exampleInput) : '{}';

  // Determine the cache keys involved
  const cacheKeys = config?.invalidates || (config?.invalidated ? [config.invalidated] : []);
  const cacheAction = config?.updated ? 'updated' : 'invalidated';

  if (isConvex) {
    // Convex: real cache operations
    if (config?.invalidates && Array.isArray(config.invalidates)) {
      const testName = `invalidates cache keys: ${cacheKeys.join(', ')}`;
      lines.push(`${indent}it('${escapeString(testName)}', async () => {`);
      lines.push(`${indent}  // Arrange - populate cache`);
      for (const key of cacheKeys) {
        lines.push(`${indent}  await ctx.cache.set('${key}', { data: 'cached' });`);
      }
      lines.push('');
      lines.push(`${indent}  // Act`);
      lines.push(`${indent}  result = await ${fnName}(ctx, ${inputCode});`);
      lines.push('');
      lines.push(`${indent}  // Assert - caches invalidated`);
      for (const key of cacheKeys) {
        lines.push(`${indent}  expect(await ctx.cache.get('${key}')).toBeNull();`);
      }
      lines.push(`${indent}});`);
    } else if (config?.invalidated) {
      const testName = `invalidates ${config.invalidated} cache`;
      lines.push(`${indent}it('${escapeString(testName)}', async () => {`);
      lines.push(`${indent}  // Arrange - populate cache`);
      lines.push(`${indent}  await ctx.cache.set('${config.invalidated}', { data: 'cached' });`);
      lines.push('');
      lines.push(`${indent}  // Act`);
      lines.push(`${indent}  result = await ${fnName}(ctx, ${inputCode});`);
      lines.push('');
      lines.push(`${indent}  // Assert - cache invalidated`);
      lines.push(`${indent}  const cachedValue = await ctx.cache.get('${config.invalidated}');`);
      lines.push(`${indent}  expect(cachedValue).toBeNull();`);
      lines.push(`${indent}});`);
    } else if (config?.updated) {
      const testName = `updates ${config.updated} cache`;
      lines.push(`${indent}it('${escapeString(testName)}', async () => {`);
      lines.push(`${indent}  // Act`);
      lines.push(`${indent}  result = await ${fnName}(ctx, ${inputCode});`);
      lines.push('');
      lines.push(`${indent}  // Assert - cache updated`);
      lines.push(`${indent}  const cachedValue = await ctx.cache.get('${config.updated}');`);
      lines.push(`${indent}  expect(cachedValue).toBeDefined();`);
      lines.push(`${indent}});`);
    } else if (config?.ttl || config?.key) {
      const cacheKey = config.key || 'default';
      const ttl = config.ttl || '5m';
      const testName = `sets cache with TTL ${ttl}`;
      lines.push(`${indent}it('${escapeString(testName)}', async () => {`);
      lines.push(`${indent}  // Act`);
      lines.push(`${indent}  result = await ${fnName}(ctx, ${inputCode});`);
      lines.push('');
      lines.push(`${indent}  // Assert - cache is set`);
      lines.push(`${indent}  // TODO: Verify cache key '${cacheKey}' is set with TTL ${ttl}`);
      lines.push(`${indent}  expect(result).toBeDefined();`);
      lines.push(`${indent}});`);
    }
  } else {
    // Standard: mock-based verification
    const targetKey = config?.invalidated || config?.updated || config?.key || 'cache';
    const testName = config?.invalidated || config?.invalidates
      ? `invalidates ${targetKey} cache`
      : `updates ${targetKey} cache`;

    lines.push(`${indent}it('${escapeString(testName)}', async () => {`);
    lines.push(`${indent}  // Act`);
    lines.push(`${indent}  result = await ${fnName}(${inputCode});`);
    lines.push('');
    lines.push(`${indent}  // Assert - cache ${cacheAction}`);
    if (config?.invalidated || config?.invalidates) {
      lines.push(`${indent}  expect(mockCache.invalidate).toHaveBeenCalledWith('${targetKey}');`);
    } else {
      lines.push(`${indent}  expect(mockCache.set).toHaveBeenCalled();`);
    }
    lines.push(`${indent}});`);
  }

  lines.push('');
  return lines;
}

/**
 * Generate notification effect test.
 */
function generateNotificationTest(effect: Effect, spec: ResolvedSpec, indent: string, isConvex = false): string[] {
  const lines: string[] = [];
  const config = effect.notification as { type?: string; channel?: string };
  const type = config?.type || 'unknown';
  const channel = config?.channel || 'email';

  const fnName = specIdToFunctionName(spec.specId);
  const testName = `sends ${type} notification via ${channel}`;

  const exampleInput = extractExampleInput(spec);
  const inputCode = exampleInput ? expandValue(exampleInput) : '{}';

  lines.push(`${indent}it('${escapeString(testName)}', async () => {`);

  if (isConvex) {
    lines.push(`${indent}  // Act`);
    lines.push(`${indent}  result = await ${fnName}(ctx, ${inputCode});`);
    lines.push('');
    lines.push(`${indent}  // Assert - notification sent`);
    lines.push(`${indent}  const notifications = await ctx.notifications.getSent();`);
    lines.push(`${indent}  const notification = notifications.find(n => n.type === '${type}');`);
    lines.push(`${indent}  expect(notification).toBeDefined();`);
    lines.push(`${indent}  expect(notification?.channel).toBe('${channel}');`);
  } else {
    lines.push(`${indent}  // Act`);
    lines.push(`${indent}  result = await ${fnName}(${inputCode});`);
    lines.push('');
    lines.push(`${indent}  // Assert - notification was sent`);
    lines.push(`${indent}  expect(mockNotifier).toHaveBeenCalledWith(`);
    lines.push(`${indent}    expect.objectContaining({ type: '${type}', channel: '${channel}' })`);
    lines.push(`${indent}  );`);
  }

  lines.push(`${indent}});`);
  lines.push('');
  return lines;
}

/**
 * Generate webhook effect test.
 */
function generateWebhookTest(effect: Effect, spec: ResolvedSpec, indent: string, isConvex = false): string[] {
  const lines: string[] = [];
  const config = effect.webhook as { url?: string; event?: string };
  const event = config?.event || 'unknown.event';

  const fnName = specIdToFunctionName(spec.specId);
  const testName = `triggers ${event} webhook`;

  const exampleInput = extractExampleInput(spec);
  const inputCode = exampleInput ? expandValue(exampleInput) : '{}';

  lines.push(`${indent}it('${escapeString(testName)}', async () => {`);

  if (isConvex) {
    lines.push(`${indent}  // Act`);
    lines.push(`${indent}  result = await ${fnName}(ctx, ${inputCode});`);
    lines.push('');
    lines.push(`${indent}  // Assert - webhook triggered`);
    lines.push(`${indent}  const webhookCalls = await ctx.webhooks.getCalls();`);
    lines.push(`${indent}  const webhookCall = webhookCalls.find(w => w.event === '${event}');`);
    lines.push(`${indent}  expect(webhookCall).toBeDefined();`);
  } else {
    lines.push(`${indent}  // Act`);
    lines.push(`${indent}  result = await ${fnName}(${inputCode});`);
    lines.push('');
    lines.push(`${indent}  // Assert - webhook was triggered`);
    lines.push(`${indent}  expect(mockWebhook).toHaveBeenCalledWith(`);
    lines.push(`${indent}    expect.objectContaining({ event: '${event}' })`);
    lines.push(`${indent}  );`);
  }

  lines.push(`${indent}});`);
  lines.push('');
  return lines;
}

/**
 * Generate scheduler effect test.
 */
function generateSchedulerTest(effect: Effect, spec: ResolvedSpec, indent: string, isConvex = false): string[] {
  const lines: string[] = [];
  const config = effect.scheduler as { job?: string; delay?: string };

  const specParts = spec.specId.replace('spec.', '').split('.');
  const derivedJob = specParts[0] ? `process${specParts[0].charAt(0).toUpperCase()}${specParts[0].slice(1)}` : 'processItem';
  const job = config?.job || derivedJob;

  const fnName = specIdToFunctionName(spec.specId);
  const testName = `schedules ${job} job`;

  const exampleInput = extractExampleInput(spec);
  const inputCode = exampleInput ? expandValue(exampleInput) : '{}';

  lines.push(`${indent}it('${escapeString(testName)}', async () => {`);

  if (isConvex) {
    lines.push(`${indent}  // Act`);
    lines.push(`${indent}  result = await ${fnName}(ctx, ${inputCode});`);
    lines.push('');
    lines.push(`${indent}  // Assert - job scheduled`);
    lines.push(`${indent}  const scheduledJobs = await ctx.scheduler.getScheduledJobs();`);
    lines.push(`${indent}  const job = scheduledJobs.find(j => j.type === '${job}');`);
    lines.push(`${indent}  expect(job).toBeDefined();`);
    if (config?.delay) {
      lines.push(`${indent}  // Verify delay`);
      lines.push(`${indent}  expect(job?.scheduledFor).toBeGreaterThan(Date.now());`);
    }
  } else {
    lines.push(`${indent}  // Act`);
    lines.push(`${indent}  result = await ${fnName}(${inputCode});`);
    lines.push('');
    lines.push(`${indent}  // Assert - job was scheduled`);
    lines.push(`${indent}  expect(mockScheduler.schedule).toHaveBeenCalledWith(`);
    lines.push(`${indent}    '${job}',`);
    lines.push(`${indent}    expect.any(Object)`);
    lines.push(`${indent}  );`);
  }

  lines.push(`${indent}});`);
  lines.push('');
  return lines;
}

/**
 * Generate metrics effect test.
 */
function generateMetricsTest(effect: Effect, spec: ResolvedSpec, indent: string, isConvex = false): string[] {
  const lines: string[] = [];
  const config = effect.metrics as { counter?: string; gauge?: string; histogram?: string; labels?: Record<string, string>; value?: string };

  const fnName = specIdToFunctionName(spec.specId);
  const metricType = config?.counter ? 'counter' : config?.gauge ? 'gauge' : 'histogram';
  const metricName = config?.counter || config?.gauge || config?.histogram || 'unknown_metric';
  const testName = `records ${metricName} ${metricType}`;

  const exampleInput = extractExampleInput(spec);
  const inputCode = exampleInput ? expandValue(exampleInput) : '{}';

  lines.push(`${indent}it('${escapeString(testName)}', async () => {`);

  if (isConvex) {
    if (metricType === 'counter') {
      lines.push(`${indent}  // Arrange - get counter before`);
      lines.push(`${indent}  const countBefore = await ctx.metrics.getCounter('${metricName}');`);
      lines.push('');
    }
    lines.push(`${indent}  // Act`);
    lines.push(`${indent}  result = await ${fnName}(ctx, ${inputCode});`);
    lines.push('');
    lines.push(`${indent}  // Assert - ${metricType} recorded`);
    if (metricType === 'counter') {
      lines.push(`${indent}  const countAfter = await ctx.metrics.getCounter('${metricName}');`);
      lines.push(`${indent}  expect(countAfter).toBeGreaterThan(countBefore);`);
    } else if (metricType === 'gauge') {
      lines.push(`${indent}  const gaugeValue = await ctx.metrics.getGauge('${metricName}');`);
      lines.push(`${indent}  expect(gaugeValue).toBeDefined();`);
    } else {
      lines.push(`${indent}  const histogramSamples = await ctx.metrics.getHistogram('${metricName}');`);
      lines.push(`${indent}  expect(histogramSamples.length).toBeGreaterThan(0);`);
    }
    if (config?.labels && Object.keys(config.labels).length > 0) {
      lines.push('');
      lines.push(`${indent}  // Verify labels`);
      for (const [label, value] of Object.entries(config.labels)) {
        lines.push(`${indent}  expect(await ctx.metrics.getLabel('${metricName}', '${label}')).toBe('${value}');`);
      }
    }
  } else {
    lines.push(`${indent}  // Act`);
    lines.push(`${indent}  result = await ${fnName}(${inputCode});`);
    lines.push('');
    lines.push(`${indent}  // Assert - ${metricType} was recorded`);
    lines.push(`${indent}  expect(mockMetrics.${metricType === 'counter' ? 'increment' : metricType}).toHaveBeenCalledWith(`);
    lines.push(`${indent}    '${metricName}'${config?.labels ? `,\n${indent}    expect.objectContaining(${JSON.stringify(config.labels)})` : ''}`);
    lines.push(`${indent}  );`);
  }

  lines.push(`${indent}});`);
  lines.push('');
  return lines;
}

/**
 * Generate generic effect test for unknown effect types.
 */
function generateGenericEffectTest(effect: Effect, spec: ResolvedSpec, indent: string, isConvex = false): string[] {
  const lines: string[] = [];
  const effectType = Object.keys(effect)[0];
  const config = effect[effectType];

  const fnName = specIdToFunctionName(spec.specId);
  const testName = `produces ${effectType} effect`;

  const exampleInput = extractExampleInput(spec);
  const inputCode = exampleInput ? expandValue(exampleInput) : '{}';

  lines.push(`${indent}it('${escapeString(testName)}', async () => {`);
  lines.push(`${indent}  // Act`);
  if (isConvex) {
    lines.push(`${indent}  result = await ${fnName}(ctx, ${inputCode});`);
  } else {
    lines.push(`${indent}  result = await ${fnName}(${inputCode});`);
  }
  lines.push('');
  lines.push(`${indent}  // Assert - ${effectType} effect`);
  lines.push(`${indent}  // Config: ${JSON.stringify(config)}`);
  lines.push(`${indent}  expect(result).toBeDefined();`);
  lines.push(`${indent}});`);
  lines.push('');
  return lines;
}

// escapeString is imported from ./shared.js
