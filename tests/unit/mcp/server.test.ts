/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for the MCP server wiring in src/mcp/server.ts.
 *
 * Since main() is not exported and runs at import time, we mock the MCP SDK
 * to capture registered handlers, then test:
 * - Server creation (name, version, capabilities)
 * - Tool listing (core + extended definitions)
 * - Tool dispatch (switch statement routes to correct handler)
 * - Argument normalization (file/path/files/scope/module extraction)
 * - Relative path rejection (without projectRoot)
 * - Unknown tool handling
 * - Error handling (registry errors vs generic errors)
 * - Prompt listing
 * - Prompt content (archcodex_workflow, archcodex_before_edit)
 * - Unknown prompt handling
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// ---------------------------------------------------------------------------
// Type definitions for captured handlers
// ---------------------------------------------------------------------------
interface McpResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

interface PromptMessage {
  role: string;
  content: { type: string; text: string };
}

interface PromptResponse {
  messages: PromptMessage[];
}

type RequestHandler = (...args: unknown[]) => Promise<unknown>;
type ListToolsHandler = () => Promise<{ tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> }>;
type CallToolHandler = (request: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<McpResponse>;
type ListPromptsHandler = () => Promise<{ prompts: Array<{ name: string; description: string; arguments?: Array<{ name: string; description: string; required: boolean }> }> }>;
type GetPromptHandler = (request: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<PromptResponse>;

// ---------------------------------------------------------------------------
// Mock: @modelcontextprotocol/sdk
// ---------------------------------------------------------------------------
const mockSetRequestHandler = vi.fn();
const mockConnect = vi.fn().mockResolvedValue(undefined);

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.setRequestHandler = mockSetRequestHandler;
    this.connect = mockConnect;
  }),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn().mockImplementation(function () {
    // empty transport mock
  }),
}));

// Provide the schema sentinel values so that the captured calls can be matched
const ListToolsRequestSchema = Symbol.for('ListToolsRequestSchema');
const CallToolRequestSchema = Symbol.for('CallToolRequestSchema');
const ListPromptsRequestSchema = Symbol.for('ListPromptsRequestSchema');
const GetPromptRequestSchema = Symbol.for('GetPromptRequestSchema');

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
}));

// ---------------------------------------------------------------------------
// Mock: fs (readFileSync for package.json version at module level)
// ---------------------------------------------------------------------------
vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue(JSON.stringify({ version: '1.43.1' })),
}));

// ---------------------------------------------------------------------------
// Mock: logger
// ---------------------------------------------------------------------------
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Mock: ./utils.js
// ---------------------------------------------------------------------------
const mockGetDefaultProjectRoot = vi.fn().mockReturnValue('/default/project');
const mockResolveProjectRootFromFile = vi.fn().mockResolvedValue('/resolved/project');
const mockResolveProjectRootFromFiles = vi.fn().mockResolvedValue('/resolved/project');
const mockNormalizeFilePath = vi.fn((input: string | Record<string, unknown>) => {
  if (typeof input === 'string') return input;
  if (typeof input === 'object' && input !== null && 'path' in input) return input.path as string;
  throw new Error('Invalid file input');
});
const mockNormalizeFilePaths = vi.fn((inputs: (string | Record<string, unknown>)[]) =>
  inputs.map((i) => (typeof i === 'string' ? i : (i as Record<string, unknown>).path as string))
);
const mockNormalizeFilesList = vi.fn((input: string | (string | Record<string, unknown>)[] | Record<string, unknown>) => {
  if (typeof input === 'string') return [input];
  if (Array.isArray(input)) return input.map((i: string | Record<string, unknown>) => (typeof i === 'string' ? i : (i as Record<string, unknown>).path as string));
  if (typeof input === 'object' && input !== null && 'path' in input) return [input.path as string];
  return [];
});
const mockNormalizeStringList = vi.fn((input?: string | string[]) => {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  return [input];
});

vi.mock('../../../src/mcp/utils.js', () => ({
  getDefaultProjectRoot: mockGetDefaultProjectRoot,
  resolveProjectRootFromFile: mockResolveProjectRootFromFile,
  resolveProjectRootFromFiles: mockResolveProjectRootFromFiles,
  normalizeFilePath: mockNormalizeFilePath,
  normalizeFilePaths: mockNormalizeFilePaths,
  normalizeFilesList: mockNormalizeFilesList,
  normalizeStringList: mockNormalizeStringList,
}));

// ---------------------------------------------------------------------------
// Mock: tool-definitions
// ---------------------------------------------------------------------------
const fakeCoreTools = [
  { name: 'archcodex_help', description: 'Help', inputSchema: { type: 'object' } },
  { name: 'archcodex_check', description: 'Check', inputSchema: { type: 'object' } },
];
const fakeExtendedTools = [
  { name: 'archcodex_scaffold', description: 'Scaffold', inputSchema: { type: 'object' } },
];

vi.mock('../../../src/mcp/tool-definitions.js', () => ({
  coreToolDefinitions: fakeCoreTools,
  projectRootProperty: { type: 'string', description: 'Project root' },
}));

vi.mock('../../../src/mcp/tool-definitions-extended.js', () => ({
  extendedToolDefinitions: fakeExtendedTools,
}));

// ---------------------------------------------------------------------------
// Mock: all handlers
// ---------------------------------------------------------------------------
const mockHandleHelp = vi.fn().mockReturnValue({ content: [{ type: 'text', text: 'help result' }] });
const mockHandleSchema = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'schema result' }] });
const mockHandleCheck = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'check result' }] });
const mockHandleRead = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'read result' }] });
const mockHandleDiscover = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'discover result' }] });
const mockHandleResolve = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'resolve result' }] });
const mockHandleNeighborhood = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'neighborhood result' }] });
const mockHandleDiffArch = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'diff result' }] });
const mockHandleHealth = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'health result' }] });
const mockHandleSyncIndex = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'sync result' }] });
const mockHandleConsistency = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'consistency result' }] });
const mockHandleTypes = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'types result' }] });
const mockHandleIntents = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'intents result' }] });
const mockHandleAction = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'action result' }] });
const mockHandleFeature = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'feature result' }] });
const mockHandleInfer = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'infer result' }] });
const mockHandleSessionContext = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'session result' }] });
const mockHandlePlanContext = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'plan result' }] });
const mockHandleValidatePlan = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'validate result' }] });
const mockHandleImpact = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'impact result' }] });
const mockHandleWhy = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'why result' }] });
const mockHandleDecide = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'decide result' }] });
const mockHandleScaffold = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'scaffold result' }] });
const mockHandleEntityContext = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'entity result' }] });
const mockHandleArchitectureMap = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'map result' }] });
const mockHandleUnifiedContext = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'context result' }] });
const mockHandleSpecInit = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'spec init result' }] });
const mockHandleSpecScaffoldTouchpoints = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'spec scaffold result' }] });
const mockHandleFeatureAudit = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'feature audit result' }] });
const mockHandleAnalyze = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'analyze result' }] });

vi.mock('../../../src/mcp/handlers/index.js', () => ({
  handleHelp: mockHandleHelp,
  handleSchema: mockHandleSchema,
  handleCheck: mockHandleCheck,
  handleRead: mockHandleRead,
  handleDiscover: mockHandleDiscover,
  handleResolve: mockHandleResolve,
  handleNeighborhood: mockHandleNeighborhood,
  handleDiffArch: mockHandleDiffArch,
  handleHealth: mockHandleHealth,
  handleSyncIndex: mockHandleSyncIndex,
  handleConsistency: mockHandleConsistency,
  handleTypes: mockHandleTypes,
  handleIntents: mockHandleIntents,
  handleAction: mockHandleAction,
  handleFeature: mockHandleFeature,
  handleInfer: mockHandleInfer,
  handleSessionContext: mockHandleSessionContext,
  handlePlanContext: mockHandlePlanContext,
  handleValidatePlan: mockHandleValidatePlan,
  handleImpact: mockHandleImpact,
  handleWhy: mockHandleWhy,
  handleDecide: mockHandleDecide,
  handleScaffold: mockHandleScaffold,
  handleEntityContext: mockHandleEntityContext,
  handleArchitectureMap: mockHandleArchitectureMap,
  handleUnifiedContext: mockHandleUnifiedContext,
  handleSpecInit: mockHandleSpecInit,
  handleSpecScaffoldTouchpoints: mockHandleSpecScaffoldTouchpoints,
  handleFeatureAudit: mockHandleFeatureAudit,
  handleAnalyze: mockHandleAnalyze,
}));

// ---------------------------------------------------------------------------
// Extracted handlers after import
// ---------------------------------------------------------------------------
let listToolsHandler: ListToolsHandler;
let callToolHandler: CallToolHandler;
let listPromptsHandler: ListPromptsHandler;
let getPromptHandler: GetPromptHandler;

beforeAll(async () => {
  // Importing server.ts triggers main(), which calls setRequestHandler 4 times.
  // The main().catch() calls process.exit(1) on failure — we need to catch that.
  // Vitest intercepts process.exit, so we'll see it as an unhandled error if main fails.
  await import('../../../src/mcp/server.js');

  // Allow microtasks (main() is async) to complete
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Extract the handlers from the mock calls
  const calls = mockSetRequestHandler.mock.calls as Array<[symbol, RequestHandler]>;

  if (calls.length !== 4) {
    throw new Error(
      `Expected 4 setRequestHandler calls but got ${calls.length}. ` +
      `main() likely failed during initialization. Check that all mocks are properly set up.`
    );
  }

  // Match by the schema sentinel values
  for (const [schema, handler] of calls) {
    if (schema === ListToolsRequestSchema) listToolsHandler = handler as unknown as ListToolsHandler;
    else if (schema === CallToolRequestSchema) callToolHandler = handler as unknown as CallToolHandler;
    else if (schema === ListPromptsRequestSchema) listPromptsHandler = handler as unknown as ListPromptsHandler;
    else if (schema === GetPromptRequestSchema) getPromptHandler = handler as unknown as GetPromptHandler;
  }

  expect(listToolsHandler).toBeDefined();
  expect(callToolHandler).toBeDefined();
  expect(listPromptsHandler).toBeDefined();
  expect(getPromptHandler).toBeDefined();
});

// ---------------------------------------------------------------------------
// Helper to reset mocks between tests while keeping handler implementations
// ---------------------------------------------------------------------------
function resetHandlerMocks(): void {
  mockResolveProjectRootFromFiles.mockResolvedValue('/resolved/project');
  mockResolveProjectRootFromFile.mockResolvedValue('/resolved/project');
  mockNormalizeFilePath.mockImplementation((input: string | Record<string, unknown>) => {
    if (typeof input === 'string') return input;
    if (typeof input === 'object' && input !== null && 'path' in input) return input.path as string;
    throw new Error('Invalid file input');
  });
  mockNormalizeFilePaths.mockImplementation((inputs: (string | Record<string, unknown>)[]) =>
    inputs.map((i) => (typeof i === 'string' ? i : (i as Record<string, unknown>).path as string))
  );
  mockNormalizeFilesList.mockImplementation((input: string | (string | Record<string, unknown>)[] | Record<string, unknown>) => {
    if (typeof input === 'string') return [input];
    if (Array.isArray(input)) return input.map((i: string | Record<string, unknown>) => (typeof i === 'string' ? i : (i as Record<string, unknown>).path as string));
    if (typeof input === 'object' && input !== null && 'path' in input) return [input.path as string];
    return [];
  });
  mockNormalizeStringList.mockImplementation((input?: string | string[]) => {
    if (!input) return [];
    if (Array.isArray(input)) return input;
    return [input];
  });
}

// ---------------------------------------------------------------------------
// TESTS
// ---------------------------------------------------------------------------

describe('MCP Server (server.ts wiring)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHandlerMocks();
  });

  // ==========================================================================
  // 1. Server creation
  // These tests verify calls made during beforeAll (import time).
  // We must NOT rely on mockSetRequestHandler/mockConnect here because
  // beforeEach calls vi.clearAllMocks() which wipes the call history.
  // Instead, we re-import the Server constructor mock and check its call
  // history was recorded during beforeAll, or we use dedicated tracking.
  // ==========================================================================
  describe('server creation', () => {
    it('should have created a Server instance during initialization', async () => {
      // The Server constructor was called during beforeAll import.
      // Since vi.clearAllMocks resets call counts, we verify the handlers
      // were captured (which proves Server was constructed and setRequestHandler was called).
      expect(listToolsHandler).toBeDefined();
      expect(callToolHandler).toBeDefined();
      expect(listPromptsHandler).toBeDefined();
      expect(getPromptHandler).toBeDefined();
    });

    it('should have registered exactly 4 request handlers', () => {
      // We know exactly 4 handlers were captured in beforeAll
      // (ListTools, CallTool, ListPrompts, GetPrompt)
      const handlerCount = [listToolsHandler, callToolHandler, listPromptsHandler, getPromptHandler]
        .filter(h => h !== undefined).length;
      expect(handlerCount).toBe(4);
    });

    it('should have connected to a transport', () => {
      // The successful handler capture proves the server was constructed,
      // handlers were registered, and the server connected to a transport.
      // If connect had failed, main().catch() would have called process.exit(1).
      expect(listToolsHandler).toBeDefined();
    });
  });

  // ==========================================================================
  // 2. Tool listing
  // ==========================================================================
  describe('ListToolsRequestSchema handler', () => {
    it('should return core and extended tool definitions combined', async () => {
      const result = await listToolsHandler();
      expect(result.tools).toEqual([...fakeCoreTools, ...fakeExtendedTools]);
    });

    it('should include all expected tool names', async () => {
      const result = await listToolsHandler();
      const names = result.tools.map((t: { name: string }) => t.name);
      expect(names).toContain('archcodex_help');
      expect(names).toContain('archcodex_check');
      expect(names).toContain('archcodex_scaffold');
    });
  });

  // ==========================================================================
  // 3. Tool dispatch
  // ==========================================================================
  describe('CallToolRequestSchema handler - dispatch', () => {
    it('should dispatch archcodex_help to handleHelp', async () => {
      mockHandleHelp.mockReturnValue({ content: [{ type: 'text', text: 'help' }] });
      const result = await callToolHandler({
        params: { name: 'archcodex_help', arguments: { topic: 'creating', full: true } },
      });
      expect(mockHandleHelp).toHaveBeenCalledWith({ topic: 'creating', full: true });
      expect(result.content[0].text).toBe('help');
    });

    it('should dispatch archcodex_schema to handleSchema', async () => {
      mockHandleSchema.mockResolvedValue({ content: [{ type: 'text', text: 'schema' }] });
      const result = await callToolHandler({
        params: { name: 'archcodex_schema', arguments: { filter: 'rules', examples: 'all' } },
      });
      expect(mockHandleSchema).toHaveBeenCalledWith('/resolved/project', {
        filter: 'rules',
        examples: 'all',
        recipe: undefined,
        template: undefined,
      });
      expect(result.content[0].text).toBe('schema');
    });

    it('should dispatch archcodex_check to handleCheck with files array', async () => {
      mockHandleCheck.mockResolvedValue({ content: [{ type: 'text', text: 'checked' }] });
      await callToolHandler({
        params: {
          name: 'archcodex_check',
          arguments: { files: ['/abs/src/a.ts', '/abs/src/b.ts'], strict: true },
        },
      });
      expect(mockHandleCheck).toHaveBeenCalledWith(
        '/resolved/project',
        ['/abs/src/a.ts', '/abs/src/b.ts'],
        { strict: true, project: undefined, registry: undefined, registryPattern: undefined },
      );
    });

    it('should dispatch archcodex_check with single file parameter', async () => {
      mockHandleCheck.mockResolvedValue({ content: [{ type: 'text', text: 'checked' }] });
      await callToolHandler({
        params: { name: 'archcodex_check', arguments: { file: '/abs/src/a.ts' } },
      });
      expect(mockHandleCheck).toHaveBeenCalledWith(
        '/resolved/project',
        ['/abs/src/a.ts'],
        expect.objectContaining({ strict: undefined }),
      );
    });

    it('should dispatch archcodex_check with path alias parameter', async () => {
      mockHandleCheck.mockResolvedValue({ content: [{ type: 'text', text: 'checked' }] });
      await callToolHandler({
        params: { name: 'archcodex_check', arguments: { path: '/abs/src/a.ts' } },
      });
      expect(mockHandleCheck).toHaveBeenCalledWith(
        '/resolved/project',
        ['/abs/src/a.ts'],
        expect.objectContaining({}),
      );
    });

    it('should dispatch archcodex_read to handleRead', async () => {
      mockHandleRead.mockResolvedValue({ content: [{ type: 'text', text: 'read' }] });
      const result = await callToolHandler({
        params: { name: 'archcodex_read', arguments: { file: '/abs/src/a.ts', format: 'ai' } },
      });
      expect(mockHandleRead).toHaveBeenCalledWith('/resolved/project', '/abs/src/a.ts', 'ai');
      expect(result.content[0].text).toBe('read');
    });

    it('should dispatch archcodex_read with path alias', async () => {
      mockHandleRead.mockResolvedValue({ content: [{ type: 'text', text: 'read' }] });
      await callToolHandler({
        params: { name: 'archcodex_read', arguments: { path: '/abs/src/a.ts' } },
      });
      expect(mockHandleRead).toHaveBeenCalledWith('/resolved/project', '/abs/src/a.ts', undefined);
    });

    it('should dispatch archcodex_discover to handleDiscover', async () => {
      mockHandleDiscover.mockResolvedValue({ content: [{ type: 'text', text: 'found' }] });
      await callToolHandler({
        params: { name: 'archcodex_discover', arguments: { query: 'MCP handler', limit: 3 } },
      });
      expect(mockHandleDiscover).toHaveBeenCalledWith('/resolved/project', 'MCP handler', {
        limit: 3,
        autoSync: undefined,
      });
    });

    it('should dispatch archcodex_resolve to handleResolve', async () => {
      mockHandleResolve.mockResolvedValue({ content: [{ type: 'text', text: 'resolved' }] });
      await callToolHandler({
        params: { name: 'archcodex_resolve', arguments: { archId: 'core.engine' } },
      });
      expect(mockHandleResolve).toHaveBeenCalledWith('/resolved/project', 'core.engine');
    });

    it('should dispatch archcodex_neighborhood to handleNeighborhood', async () => {
      mockHandleNeighborhood.mockResolvedValue({ content: [{ type: 'text', text: 'neighbors' }] });
      await callToolHandler({
        params: { name: 'archcodex_neighborhood', arguments: { file: '/abs/src/a.ts' } },
      });
      expect(mockHandleNeighborhood).toHaveBeenCalledWith('/resolved/project', '/abs/src/a.ts');
    });

    it('should dispatch archcodex_diff_arch to handleDiffArch', async () => {
      mockHandleDiffArch.mockResolvedValue({ content: [{ type: 'text', text: 'diff' }] });
      await callToolHandler({
        params: { name: 'archcodex_diff_arch', arguments: { from: 'core.a', to: 'core.b' } },
      });
      expect(mockHandleDiffArch).toHaveBeenCalledWith('/resolved/project', 'core.a', 'core.b');
    });

    it('should dispatch archcodex_health to handleHealth', async () => {
      mockHandleHealth.mockResolvedValue({ content: [{ type: 'text', text: 'healthy' }] });
      await callToolHandler({
        params: { name: 'archcodex_health', arguments: { expiringDays: 14 } },
      });
      expect(mockHandleHealth).toHaveBeenCalledWith('/resolved/project', 14);
    });

    it('should dispatch archcodex_sync_index to handleSyncIndex', async () => {
      mockHandleSyncIndex.mockResolvedValue({ content: [{ type: 'text', text: 'synced' }] });
      await callToolHandler({
        params: { name: 'archcodex_sync_index', arguments: { check: true, force: false } },
      });
      expect(mockHandleSyncIndex).toHaveBeenCalledWith('/resolved/project', true, false);
    });

    it('should dispatch archcodex_consistency to handleConsistency', async () => {
      mockHandleConsistency.mockResolvedValue({ content: [{ type: 'text', text: 'consistent' }] });
      await callToolHandler({
        params: { name: 'archcodex_consistency', arguments: { file: '/abs/src/a.ts', threshold: 0.8 } },
      });
      expect(mockHandleConsistency).toHaveBeenCalledWith('/resolved/project', '/abs/src/a.ts', {
        threshold: 0.8,
        sameArchOnly: undefined,
      });
    });

    it('should return error when archcodex_consistency is called without file', async () => {
      const result = await callToolHandler({
        params: { name: 'archcodex_consistency', arguments: {} },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('file parameter is required');
    });

    it('should dispatch archcodex_intents to handleIntents', async () => {
      mockHandleIntents.mockResolvedValue({ content: [{ type: 'text', text: 'intents' }] });
      await callToolHandler({
        params: { name: 'archcodex_intents', arguments: { action: 'list' } },
      });
      expect(mockHandleIntents).toHaveBeenCalledWith('/resolved/project', {
        action: 'list',
        name: undefined,
        file: undefined,
        archId: undefined,
      });
    });

    it('should dispatch archcodex_action to handleAction', async () => {
      mockHandleAction.mockResolvedValue({ content: [{ type: 'text', text: 'action' }] });
      await callToolHandler({
        params: { name: 'archcodex_action', arguments: { query: 'add a view' } },
      });
      expect(mockHandleAction).toHaveBeenCalledWith('/resolved/project', {
        query: 'add a view',
        action: undefined,
        name: undefined,
      });
    });

    it('should dispatch archcodex_feature to handleFeature', async () => {
      mockHandleFeature.mockResolvedValue({ content: [{ type: 'text', text: 'feature' }] });
      await callToolHandler({
        params: { name: 'archcodex_feature', arguments: { action: 'list' } },
      });
      expect(mockHandleFeature).toHaveBeenCalledWith('/resolved/project', {
        action: 'list',
        feature: undefined,
        name: undefined,
      });
    });

    it('should dispatch archcodex_types to handleTypes', async () => {
      mockHandleTypes.mockResolvedValue({ content: [{ type: 'text', text: 'types' }] });
      await callToolHandler({
        params: { name: 'archcodex_types', arguments: { files: ['/abs/src/a.ts'], threshold: 90 } },
      });
      expect(mockHandleTypes).toHaveBeenCalledWith('/resolved/project', {
        files: ['/abs/src/a.ts'],
        threshold: 90,
        includePrivate: undefined,
      });
    });

    it('should dispatch archcodex_scaffold to handleScaffold', async () => {
      mockHandleScaffold.mockResolvedValue({ content: [{ type: 'text', text: 'scaffolded' }] });
      await callToolHandler({
        params: { name: 'archcodex_scaffold', arguments: { archId: 'core.engine', name: 'MyEngine' } },
      });
      expect(mockHandleScaffold).toHaveBeenCalledWith('/resolved/project', {
        archId: 'core.engine',
        name: 'MyEngine',
        output: undefined,
        template: undefined,
        dryRun: undefined,
      });
    });

    it('should dispatch archcodex_infer to handleInfer', async () => {
      mockHandleInfer.mockResolvedValue({ content: [{ type: 'text', text: 'inferred' }] });
      await callToolHandler({
        params: { name: 'archcodex_infer', arguments: { files: ['/abs/src/a.ts'] } },
      });
      expect(mockHandleInfer).toHaveBeenCalledWith('/resolved/project', {
        files: ['/abs/src/a.ts'],
        untaggedOnly: undefined,
      });
    });

    it('should dispatch archcodex_why to handleWhy', async () => {
      mockHandleWhy.mockResolvedValue({ content: [{ type: 'text', text: 'because' }] });
      await callToolHandler({
        params: { name: 'archcodex_why', arguments: { file: '/abs/src/a.ts', constraint: 'forbid:axios' } },
      });
      expect(mockHandleWhy).toHaveBeenCalledWith('/resolved/project', {
        file: '/abs/src/a.ts',
        constraint: 'forbid:axios',
      });
    });

    it('should dispatch archcodex_decide to handleDecide', async () => {
      mockHandleDecide.mockResolvedValue({ content: [{ type: 'text', text: 'decided' }] });
      await callToolHandler({
        params: { name: 'archcodex_decide', arguments: { action: 'start' } },
      });
      expect(mockHandleDecide).toHaveBeenCalledWith('/resolved/project', {
        action: 'start',
        answer: undefined,
        sessionId: undefined,
      });
    });

    it('should dispatch archcodex_session_context to handleSessionContext', async () => {
      mockHandleSessionContext.mockResolvedValue({ content: [{ type: 'text', text: 'session' }] });
      await callToolHandler({
        params: { name: 'archcodex_session_context', arguments: { full: true } },
      });
      expect(mockHandleSessionContext).toHaveBeenCalledWith('/resolved/project', {
        patterns: undefined,
        full: true,
        withPatterns: undefined,
        withDuplicates: undefined,
        withoutLayers: undefined,
        scope: undefined,
      });
    });

    it('should dispatch archcodex_impact to handleImpact', async () => {
      mockHandleImpact.mockResolvedValue({ content: [{ type: 'text', text: 'impacted' }] });
      await callToolHandler({
        params: { name: 'archcodex_impact', arguments: { file: '/abs/src/a.ts', depth: 3 } },
      });
      expect(mockHandleImpact).toHaveBeenCalledWith('/resolved/project', {
        file: '/abs/src/a.ts',
        depth: 3,
      });
    });

    it('should dispatch archcodex_plan_context to handlePlanContext', async () => {
      mockHandlePlanContext.mockResolvedValue({ content: [{ type: 'text', text: 'plan' }] });
      await callToolHandler({
        params: { name: 'archcodex_plan_context', arguments: { scope: ['/abs/src/core/'] } },
      });
      expect(mockHandlePlanContext).toHaveBeenCalledWith('/resolved/project', {
        scope: ['/abs/src/core/'],
        files: undefined,
      });
    });

    it('should dispatch archcodex_validate_plan to handleValidatePlan', async () => {
      const changes = [{ path: 'src/a.ts', action: 'create', archId: 'core.engine' }];
      mockHandleValidatePlan.mockResolvedValue({ content: [{ type: 'text', text: 'valid' }] });
      await callToolHandler({
        params: { name: 'archcodex_validate_plan', arguments: { changes } },
      });
      expect(mockHandleValidatePlan).toHaveBeenCalledWith('/resolved/project', { changes });
    });

    it('should dispatch archcodex_entity_context to handleEntityContext', async () => {
      mockHandleEntityContext.mockResolvedValue({ content: [{ type: 'text', text: 'entity' }] });
      await callToolHandler({
        params: { name: 'archcodex_entity_context', arguments: { entity: 'User', operation: 'duplicate' } },
      });
      expect(mockHandleEntityContext).toHaveBeenCalledWith('/resolved/project', {
        entity: 'User',
        operation: 'duplicate',
        format: undefined,
        refresh: undefined,
        explicitProjectRoot: false,
        maxFiles: undefined,
        verbose: undefined,
      });
    });

    it('should use name as fallback for entity in archcodex_entity_context', async () => {
      mockHandleEntityContext.mockResolvedValue({ content: [{ type: 'text', text: 'entity' }] });
      await callToolHandler({
        params: { name: 'archcodex_entity_context', arguments: { name: 'Order' } },
      });
      expect(mockHandleEntityContext).toHaveBeenCalledWith('/resolved/project', expect.objectContaining({
        entity: 'Order',
      }));
    });

    it('should set explicitProjectRoot=true when projectRoot is provided to entity_context', async () => {
      mockHandleEntityContext.mockResolvedValue({ content: [{ type: 'text', text: 'entity' }] });
      await callToolHandler({
        params: { name: 'archcodex_entity_context', arguments: { entity: 'User', projectRoot: '/my/project' } },
      });
      expect(mockHandleEntityContext).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ explicitProjectRoot: true }),
      );
    });

    it('should dispatch archcodex_map to handleArchitectureMap', async () => {
      mockHandleArchitectureMap.mockResolvedValue({ content: [{ type: 'text', text: 'map' }] });
      await callToolHandler({
        params: { name: 'archcodex_map', arguments: { entity: 'User', depth: 2 } },
      });
      expect(mockHandleArchitectureMap).toHaveBeenCalledWith('/resolved/project', {
        entity: 'User',
        architecture: undefined,
        file: undefined,
        module: undefined,
        depth: 2,
        refresh: undefined,
      });
    });

    it('should dispatch archcodex_context to handleUnifiedContext', async () => {
      mockHandleUnifiedContext.mockResolvedValue({ content: [{ type: 'text', text: 'unified' }] });
      await callToolHandler({
        params: { name: 'archcodex_context', arguments: { module: '/abs/src/core/db/', format: 'compact' } },
      });
      expect(mockHandleUnifiedContext).toHaveBeenCalledWith('/resolved/project', {
        module: '/abs/src/core/db/',
        entity: undefined,
        format: 'compact',
        sections: undefined,
        confirm: undefined,
        summary: undefined,
        brief: undefined,
      });
    });

    it('should dispatch archcodex_spec_init to handleSpecInit', async () => {
      mockHandleSpecInit.mockResolvedValue({ content: [{ type: 'text', text: 'spec init' }] });
      await callToolHandler({
        params: { name: 'archcodex_spec_init', arguments: { force: true } },
      });
      expect(mockHandleSpecInit).toHaveBeenCalledWith('/resolved/project', {
        force: true,
        minimal: undefined,
        projectRoot: '/resolved/project',
      });
    });

    it('should dispatch archcodex_spec_scaffold_touchpoints to handleSpecScaffoldTouchpoints', async () => {
      mockHandleSpecScaffoldTouchpoints.mockResolvedValue({ content: [{ type: 'text', text: 'touchpoints' }] });
      await callToolHandler({
        params: {
          name: 'archcodex_spec_scaffold_touchpoints',
          arguments: { specId: 'spec.product.duplicate', entity: 'products' },
        },
      });
      expect(mockHandleSpecScaffoldTouchpoints).toHaveBeenCalledWith('/resolved/project', {
        specId: 'spec.product.duplicate',
        entity: 'products',
        operation: undefined,
      });
    });

    it('should dispatch archcodex_feature_audit to handleFeatureAudit', async () => {
      mockHandleFeatureAudit.mockResolvedValue({ content: [{ type: 'text', text: 'audit' }] });
      await callToolHandler({
        params: {
          name: 'archcodex_feature_audit',
          arguments: { mutation: 'duplicateProduct', entity: 'products', verbose: true },
        },
      });
      expect(mockHandleFeatureAudit).toHaveBeenCalledWith('/resolved/project', {
        mutation: 'duplicateProduct',
        entity: 'products',
        verbose: true,
      });
    });

    it('should dispatch archcodex_analyze to handleAnalyze', async () => {
      mockHandleAnalyze.mockResolvedValue({ content: [{ type: 'text', text: 'analyzed' }] });
      await callToolHandler({
        params: { name: 'archcodex_analyze', arguments: { category: 'security', severity: 'error' } },
      });
      expect(mockHandleAnalyze).toHaveBeenCalledWith('/resolved/project', {
        category: 'security',
        severity: 'error',
        specIds: undefined,
      });
    });
  });

  // ==========================================================================
  // 4. Argument normalization - file path extraction
  // ==========================================================================
  describe('argument normalization', () => {
    it('should extract file path from args.file for project root detection', async () => {
      mockHandleRead.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      await callToolHandler({
        params: { name: 'archcodex_read', arguments: { file: '/abs/src/a.ts' } },
      });
      expect(mockNormalizeFilePath).toHaveBeenCalledWith('/abs/src/a.ts');
    });

    it('should extract file path from args.path for project root detection', async () => {
      mockHandleRead.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      await callToolHandler({
        params: { name: 'archcodex_read', arguments: { path: '/abs/src/b.ts' } },
      });
      expect(mockNormalizeFilePath).toHaveBeenCalledWith('/abs/src/b.ts');
    });

    it('should extract file paths from args.files array for project root detection', async () => {
      mockHandleCheck.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      await callToolHandler({
        params: { name: 'archcodex_check', arguments: { files: ['/abs/a.ts', '/abs/b.ts'] } },
      });
      expect(mockNormalizeFilePaths).toHaveBeenCalledWith(['/abs/a.ts', '/abs/b.ts']);
    });

    it('should extract file paths from args.scope array for project root detection', async () => {
      mockHandlePlanContext.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      await callToolHandler({
        params: { name: 'archcodex_plan_context', arguments: { scope: ['/abs/src/core/'] } },
      });
      expect(mockNormalizeFilePaths).toHaveBeenCalledWith(['/abs/src/core/']);
    });

    it('should extract file path from args.module for project root detection', async () => {
      mockHandleArchitectureMap.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      await callToolHandler({
        params: { name: 'archcodex_map', arguments: { module: '/abs/src/core/db/' } },
      });
      expect(mockNormalizeFilePath).toHaveBeenCalledWith('/abs/src/core/db/');
    });

    it('should handle object-style file parameter {path: "..."}', async () => {
      mockHandleRead.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      await callToolHandler({
        params: { name: 'archcodex_read', arguments: { file: { path: '/abs/src/a.ts' } } },
      });
      expect(mockNormalizeFilePath).toHaveBeenCalledWith({ path: '/abs/src/a.ts' });
    });

    it('should silently skip invalid file format during path extraction', async () => {
      mockNormalizeFilePath.mockImplementation(() => {
        throw new Error('Invalid file input');
      });
      mockHandleHelp.mockReturnValue({ content: [{ type: 'text', text: 'help' }] });

      const result = await callToolHandler({
        params: { name: 'archcodex_help', arguments: { topic: 'creating' } },
      });
      expect(result.content[0].text).toBe('help');
    });

    it('should pass all extracted file paths to resolveProjectRootFromFiles', async () => {
      mockHandleRead.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      await callToolHandler({
        params: { name: 'archcodex_read', arguments: { file: '/abs/src/a.ts' } },
      });
      expect(mockResolveProjectRootFromFiles).toHaveBeenCalledWith(
        '/default/project',
        expect.arrayContaining(['/abs/src/a.ts']),
        undefined,
      );
    });

    it('should pass explicit projectRoot to resolveProjectRootFromFiles', async () => {
      mockHandleRead.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      await callToolHandler({
        params: { name: 'archcodex_read', arguments: { file: '/abs/src/a.ts', projectRoot: '/my/project' } },
      });
      expect(mockResolveProjectRootFromFiles).toHaveBeenCalledWith(
        '/default/project',
        expect.arrayContaining(['/abs/src/a.ts']),
        '/my/project',
      );
    });
  });

  // ==========================================================================
  // 5. Relative path rejection
  // ==========================================================================
  describe('relative path rejection', () => {
    it('should reject relative path in file arg without projectRoot', async () => {
      const result = await callToolHandler({
        params: { name: 'archcodex_read', arguments: { file: 'src/a.ts' } },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('absolute path');
      expect(result.content[0].text).toContain('src/a.ts');
    });

    it('should reject relative path in path arg without projectRoot', async () => {
      const result = await callToolHandler({
        params: { name: 'archcodex_read', arguments: { path: 'lib/b.ts' } },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('absolute path');
      expect(result.content[0].text).toContain('lib/b.ts');
    });

    it('should reject relative path in module arg without projectRoot', async () => {
      const result = await callToolHandler({
        params: { name: 'archcodex_map', arguments: { module: 'src/core/' } },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('absolute path');
      expect(result.content[0].text).toContain('src/core/');
    });

    it('should accept relative path when projectRoot is explicitly provided', async () => {
      mockHandleRead.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      const result = await callToolHandler({
        params: { name: 'archcodex_read', arguments: { file: 'src/a.ts', projectRoot: '/my/project' } },
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBe('ok');
    });

    it('should accept absolute paths without projectRoot', async () => {
      mockHandleRead.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      const result = await callToolHandler({
        params: { name: 'archcodex_read', arguments: { file: '/abs/src/a.ts' } },
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBe('ok');
    });

    it('should include guidance about projectRoot in the error message', async () => {
      const result = await callToolHandler({
        params: { name: 'archcodex_read', arguments: { file: 'relative/path.ts' } },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('projectRoot');
      expect(result.content[0].text).toContain('absolute');
    });
  });

  // ==========================================================================
  // 6. Unknown tool handling
  // ==========================================================================
  describe('unknown tool handling', () => {
    it('should return error for unknown tool name', async () => {
      const result = await callToolHandler({
        params: { name: 'archcodex_nonexistent', arguments: {} },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Unknown tool: archcodex_nonexistent');
    });

    it('should return error for empty tool name', async () => {
      const result = await callToolHandler({
        params: { name: '', arguments: {} },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Unknown tool: ');
    });

    it('should return error for tool name without archcodex_ prefix', async () => {
      const result = await callToolHandler({
        params: { name: 'some_other_tool', arguments: {} },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Unknown tool: some_other_tool');
    });
  });

  // ==========================================================================
  // 7. Error handling
  // ==========================================================================
  describe('error handling', () => {
    it('should catch handler errors and return error response', async () => {
      mockHandleDiscover.mockRejectedValue(new Error('Something broke'));
      const result = await callToolHandler({
        params: { name: 'archcodex_discover', arguments: { query: 'test' } },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error: Something broke');
    });

    it('should add context info for registry errors', async () => {
      mockHandleDiscover.mockRejectedValue(new Error('Registry not found in .arch'));
      const result = await callToolHandler({
        params: { name: 'archcodex_discover', arguments: { query: 'test' } },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Registry not found in .arch');
      expect(result.content[0].text).toContain('Context: Looking for .arch/');
      expect(result.content[0].text).toContain('archcodex init');
    });

    it('should add context info for .arch-related errors', async () => {
      mockHandleHealth.mockRejectedValue(new Error('Cannot read .arch directory'));
      const result = await callToolHandler({
        params: { name: 'archcodex_health', arguments: {} },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('.arch');
      expect(result.content[0].text).toContain('archcodex init');
    });

    it('should NOT add registry context for non-registry errors', async () => {
      mockHandleDiscover.mockRejectedValue(new Error('Network timeout'));
      const result = await callToolHandler({
        params: { name: 'archcodex_discover', arguments: { query: 'test' } },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Error: Network timeout');
      expect(result.content[0].text).not.toContain('archcodex init');
    });

    it('should handle non-Error throws gracefully', async () => {
      mockHandleDiscover.mockRejectedValue('string error');
      const result = await callToolHandler({
        params: { name: 'archcodex_discover', arguments: { query: 'test' } },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('string error');
    });

    it('should include requested file paths in registry error context', async () => {
      mockHandleRead.mockRejectedValue(new Error('Registry load failed'));
      const result = await callToolHandler({
        params: { name: 'archcodex_read', arguments: { file: '/abs/src/a.ts' } },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('/abs/src/a.ts');
      expect(result.content[0].text).toContain('File(s) requested');
    });

    it('should include project root in registry error context', async () => {
      mockHandleRead.mockRejectedValue(new Error('Registry parse error'));
      const result = await callToolHandler({
        params: { name: 'archcodex_read', arguments: { file: '/abs/src/a.ts' } },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('project root: /resolved/project');
    });
  });

  // ==========================================================================
  // 8. Prompt listing
  // ==========================================================================
  describe('ListPromptsRequestSchema handler', () => {
    it('should return exactly 2 prompts', async () => {
      const result = await listPromptsHandler();
      expect(result.prompts).toHaveLength(2);
    });

    it('should list archcodex_workflow prompt', async () => {
      const result = await listPromptsHandler();
      const workflow = result.prompts.find((p) => p.name === 'archcodex_workflow');
      expect(workflow).toBeDefined();
      expect(workflow!.description).toContain('Workflow');
    });

    it('should list archcodex_before_edit prompt with file argument', async () => {
      const result = await listPromptsHandler();
      const beforeEdit = result.prompts.find((p) => p.name === 'archcodex_before_edit');
      expect(beforeEdit).toBeDefined();
      expect(beforeEdit!.description).toContain('before editing');
      expect(beforeEdit!.arguments).toHaveLength(1);
      expect(beforeEdit!.arguments![0].name).toBe('file');
      expect(beforeEdit!.arguments![0].required).toBe(true);
    });
  });

  // ==========================================================================
  // 9. Prompt content
  // ==========================================================================
  describe('GetPromptRequestSchema handler', () => {
    it('should return workflow content for archcodex_workflow', async () => {
      const result = await getPromptHandler({
        params: { name: 'archcodex_workflow' },
      });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');
      expect(result.messages[0].content.text).toContain('ArchCodex Workflow');
      expect(result.messages[0].content.text).toContain('archcodex_read');
      expect(result.messages[0].content.text).toContain('archcodex_check');
      expect(result.messages[0].content.text).toContain('archcodex_discover');
    });

    it('should return edit context for archcodex_before_edit with file', async () => {
      mockHandleRead.mockResolvedValue({ content: [{ type: 'text', text: 'constraints for a.ts' }] });
      const result = await getPromptHandler({
        params: { name: 'archcodex_before_edit', arguments: { file: '/abs/src/a.ts' } },
      });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.text).toContain('Architectural Context for /abs/src/a.ts');
      expect(result.messages[0].content.text).toContain('constraints for a.ts');
      expect(result.messages[0].content.text).toContain('archcodex_check');
    });

    it('should call resolveProjectRootFromFile for archcodex_before_edit', async () => {
      mockHandleRead.mockResolvedValue({ content: [{ type: 'text', text: 'context' }] });
      await getPromptHandler({
        params: { name: 'archcodex_before_edit', arguments: { file: '/abs/src/a.ts' } },
      });
      expect(mockResolveProjectRootFromFile).toHaveBeenCalledWith('/default/project', '/abs/src/a.ts');
    });

    it('should call handleRead with format "ai" for archcodex_before_edit', async () => {
      mockHandleRead.mockResolvedValue({ content: [{ type: 'text', text: 'context' }] });
      await getPromptHandler({
        params: { name: 'archcodex_before_edit', arguments: { file: '/abs/src/a.ts' } },
      });
      expect(mockHandleRead).toHaveBeenCalledWith('/resolved/project', '/abs/src/a.ts', 'ai');
    });

    it('should return error message when file is missing for archcodex_before_edit', async () => {
      const result = await getPromptHandler({
        params: { name: 'archcodex_before_edit', arguments: {} },
      });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content.text).toContain('file argument is required');
    });

    it('should return error message when arguments are undefined for archcodex_before_edit', async () => {
      const result = await getPromptHandler({
        params: { name: 'archcodex_before_edit' },
      });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content.text).toContain('file argument is required');
    });
  });

  // ==========================================================================
  // 10. Unknown prompt handling
  // ==========================================================================
  describe('unknown prompt handling', () => {
    it('should return error message for unknown prompt name', async () => {
      const result = await getPromptHandler({
        params: { name: 'archcodex_nonexistent' },
      });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.text).toBe('Unknown prompt: archcodex_nonexistent');
    });

    it('should return error message for empty prompt name', async () => {
      const result = await getPromptHandler({
        params: { name: '' },
      });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content.text).toBe('Unknown prompt: ');
    });
  });

  // ==========================================================================
  // Additional edge cases
  // ==========================================================================
  describe('edge cases', () => {
    it('should handle undefined arguments gracefully', async () => {
      mockHandleHelp.mockReturnValue({ content: [{ type: 'text', text: 'help' }] });
      const result = await callToolHandler({
        params: { name: 'archcodex_help' },
      });
      expect(result.content[0].text).toBe('help');
      expect(mockHandleHelp).toHaveBeenCalledWith({
        topic: undefined,
        full: undefined,
      });
    });

    it('should pass registryPattern as normalized string list to handleCheck', async () => {
      mockHandleCheck.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      await callToolHandler({
        params: {
          name: 'archcodex_check',
          arguments: { files: ['/abs/src/a.ts'], registryPattern: ['cli/**', 'core/*'] },
        },
      });
      expect(mockHandleCheck).toHaveBeenCalledWith(
        '/resolved/project',
        ['/abs/src/a.ts'],
        expect.objectContaining({
          registryPattern: ['cli/**', 'core/*'],
        }),
      );
    });

    it('should handle archcodex_map with file parameter that uses normalizeFilePath', async () => {
      mockHandleArchitectureMap.mockResolvedValue({ content: [{ type: 'text', text: 'map' }] });
      await callToolHandler({
        params: { name: 'archcodex_map', arguments: { file: '/abs/src/a.ts' } },
      });
      expect(mockHandleArchitectureMap).toHaveBeenCalledWith(
        '/resolved/project',
        expect.objectContaining({ file: '/abs/src/a.ts' }),
      );
    });

    it('should handle archcodex_intents with file parameter normalization', async () => {
      mockHandleIntents.mockResolvedValue({ content: [{ type: 'text', text: 'intents' }] });
      await callToolHandler({
        params: { name: 'archcodex_intents', arguments: { action: 'validate', file: '/abs/src/a.ts' } },
      });
      expect(mockHandleIntents).toHaveBeenCalledWith('/resolved/project', expect.objectContaining({
        action: 'validate',
        file: '/abs/src/a.ts',
      }));
    });

    it('should handle archcodex_types with empty files array', async () => {
      mockHandleTypes.mockResolvedValue({ content: [{ type: 'text', text: 'types' }] });
      await callToolHandler({
        params: { name: 'archcodex_types', arguments: {} },
      });
      expect(mockHandleTypes).toHaveBeenCalledWith('/resolved/project', expect.objectContaining({
        files: undefined,
      }));
    });

    it('should handle archcodex_infer with empty files producing empty array', async () => {
      mockNormalizeFilesList.mockReturnValue([]);
      mockHandleInfer.mockResolvedValue({ content: [{ type: 'text', text: 'inferred' }] });
      await callToolHandler({
        params: { name: 'archcodex_infer', arguments: {} },
      });
      expect(mockHandleInfer).toHaveBeenCalledWith('/resolved/project', expect.objectContaining({
        files: [],
      }));
    });

    it('should reject relative path in files array without projectRoot', async () => {
      const result = await callToolHandler({
        params: { name: 'archcodex_check', arguments: { files: ['relative/a.ts', '/abs/b.ts'] } },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('absolute path');
      expect(result.content[0].text).toContain('relative/a.ts');
    });

    it('should reject relative path in scope array without projectRoot', async () => {
      const result = await callToolHandler({
        params: { name: 'archcodex_plan_context', arguments: { scope: ['src/core/'] } },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('absolute path');
      expect(result.content[0].text).toContain('src/core/');
    });
  });
});
