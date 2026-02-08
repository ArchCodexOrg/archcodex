/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for MCP decide handler (decision tree navigation).
 * The handleDecide function lives in context.ts but is tested separately
 * due to its stateful session-based nature.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleDecide } from '../../../../src/mcp/handlers/context.js';

// Mock dependencies
vi.mock('../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../../../src/core/registry/loader.js', () => ({
  loadRegistry: vi.fn(),
}));

vi.mock('../../../../src/core/registry/resolver.js', () => ({
  resolveArchitecture: vi.fn(),
}));

vi.mock('../../../../src/core/arch-tag/parser.js', () => ({
  extractArchId: vi.fn(),
}));

vi.mock('../../../../src/core/session/index.js', () => ({
  getSessionContext: vi.fn(),
}));

vi.mock('../../../../src/core/plan-context/index.js', () => ({
  getPlanContext: vi.fn(),
  formatPlanContextCompact: vi.fn(),
}));

vi.mock('../../../../src/core/validate-plan/index.js', () => ({
  validatePlan: vi.fn(),
  formatValidationResult: vi.fn(),
}));

vi.mock('../../../../src/core/discovery/index.js', () => ({
  loadDecisionTree: vi.fn(),
  startNavigation: vi.fn(),
  getCurrentNode: vi.fn(),
  answerQuestion: vi.fn(),
  isDecisionResult: vi.fn(),
}));

vi.mock('../../../../src/utils/file-system.js', () => ({
  readFile: vi.fn(),
}));

vi.mock('../../../../src/mcp/utils.js', () => ({
  isProjectInitialized: vi.fn(),
  findNearbyProject: vi.fn(),
  normalizeStringList: vi.fn((input: string | string[] | undefined) =>
    Array.isArray(input) ? input : (input ? [input] : undefined)),
}));

vi.mock('../../../../src/core/imports/analyzer.js', () => ({
  ProjectAnalyzer: vi.fn(function () {
    return {
      buildImportGraph: vi.fn(),
      getImporters: vi.fn(),
      getDependents: vi.fn(),
      dispose: vi.fn(),
    };
  }),
}));

import {
  loadDecisionTree,
  startNavigation,
  getCurrentNode,
  answerQuestion,
  isDecisionResult,
} from '../../../../src/core/discovery/index.js';

describe('MCP Decide Handler', () => {
  const projectRoot = '/test/project';

  const mockTree = {
    description: 'Architecture decision tree',
    start: 'q1',
    nodes: {
      q1: { type: 'question' as const, text: 'Does it handle HTTP?', yes: 'q2', no: 'r1', examples: ['REST', 'GraphQL'] },
      q2: { type: 'question' as const, text: 'Is it a middleware?', yes: 'r2', no: 'r3' },
      r1: { type: 'result' as const, arch_id: 'core.service', why: 'Internal service without HTTP' },
      r2: { type: 'result' as const, arch_id: 'http.middleware', why: 'HTTP middleware pattern' },
      r3: { type: 'result' as const, arch_id: 'http.handler', why: 'HTTP request handler' },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadDecisionTree).mockResolvedValue(mockTree);
    vi.mocked(isDecisionResult).mockReturnValue(false);
  });

  describe('when no decision tree exists', () => {
    it('should return error when no decision tree found', async () => {
      vi.mocked(loadDecisionTree).mockResolvedValue(null);

      const result = await handleDecide(projectRoot, {});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('No decision tree found');
      expect(parsed.hint).toContain('decision-tree.yaml');
    });
  });

  describe('show-tree action', () => {
    it('should return full tree structure', async () => {
      const result = await handleDecide(projectRoot, { action: 'show-tree' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.description).toBe('Architecture decision tree');
      expect(parsed.start).toBe('q1');
      expect(parsed.nodes).toBeDefined();
      expect(parsed.nodes.q1.type).toBe('question');
      expect(parsed.nodes.q1.text).toBe('Does it handle HTTP?');
      expect(parsed.nodes.r1.type).toBe('result');
      expect(parsed.nodes.r1.archId).toBe('core.service');
    });

    it('should include examples for question nodes', async () => {
      const result = await handleDecide(projectRoot, { action: 'show-tree' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.nodes.q1.examples).toEqual(['REST', 'GraphQL']);
    });

    it('should include why for result nodes', async () => {
      const result = await handleDecide(projectRoot, { action: 'show-tree' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.nodes.r1.why).toBe('Internal service without HTTP');
    });
  });

  describe('start action', () => {
    it('should start a new session and return first question', async () => {
      const mockState = { currentNode: 'q1' };
      vi.mocked(startNavigation).mockReturnValue(mockState);
      vi.mocked(getCurrentNode).mockReturnValue({
        type: 'question',
        text: 'Does it handle HTTP?',
        yes: 'q2',
        no: 'r1',
        examples: ['REST', 'GraphQL'],
      });

      const result = await handleDecide(projectRoot, { action: 'start' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.type).toBe('question');
      expect(parsed.sessionId).toBeDefined();
      expect(parsed.sessionId).toMatch(/^decide-/);
      expect(parsed.questionNumber).toBe(1);
      expect(parsed.text).toBe('Does it handle HTTP?');
      expect(parsed.examples).toEqual(['REST', 'GraphQL']);
      expect(parsed.path).toEqual([]);
    });

    it('should start a new session when no sessionId provided', async () => {
      const mockState = { currentNode: 'q1' };
      vi.mocked(startNavigation).mockReturnValue(mockState);
      vi.mocked(getCurrentNode).mockReturnValue({
        type: 'question',
        text: 'Does it handle HTTP?',
        yes: 'q2',
        no: 'r1',
      });

      const result = await handleDecide(projectRoot, {});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.type).toBe('question');
      expect(parsed.sessionId).toBeDefined();
    });
  });

  describe('answer action', () => {
    it('should return error when session not found', async () => {
      const result = await handleDecide(projectRoot, {
        action: 'answer',
        sessionId: 'nonexistent-session',
        answer: true,
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('Session not found');
      expect(parsed.hint).toContain('Start a new session');
    });

    it('should return error when answer is missing', async () => {
      // First start a session to get a valid session ID
      const mockState = { currentNode: 'q1' };
      vi.mocked(startNavigation).mockReturnValue(mockState);
      vi.mocked(getCurrentNode).mockReturnValue({
        type: 'question',
        text: 'Does it handle HTTP?',
        yes: 'q2',
        no: 'r1',
      });

      const startResult = await handleDecide(projectRoot, { action: 'start' });
      const startParsed = JSON.parse(startResult.content[0].text);
      const sessionId = startParsed.sessionId;

      // Answer without providing answer value
      const result = await handleDecide(projectRoot, {
        action: 'answer',
        sessionId,
        answer: undefined,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('answer is required');
    });

    it('should advance to next question when answering', async () => {
      // Start a session
      const mockState = { currentNode: 'q1' };
      vi.mocked(startNavigation).mockReturnValue(mockState);
      vi.mocked(getCurrentNode)
        .mockReturnValueOnce({
          type: 'question',
          text: 'Does it handle HTTP?',
          yes: 'q2',
          no: 'r1',
        })
        // Second call inside the answer flow - records the current question
        .mockReturnValueOnce({
          type: 'question',
          text: 'Does it handle HTTP?',
          yes: 'q2',
          no: 'r1',
        })
        // Third call - the next question node
        .mockReturnValueOnce({
          type: 'question',
          text: 'Is it a middleware?',
          yes: 'r2',
          no: 'r3',
        });

      const startResult = await handleDecide(projectRoot, { action: 'start' });
      const sessionId = JSON.parse(startResult.content[0].text).sessionId;

      // Mock answer advancing to next question
      const nextState = { currentNode: 'q2' };
      vi.mocked(answerQuestion).mockReturnValue(nextState);
      vi.mocked(isDecisionResult).mockReturnValue(false);

      const result = await handleDecide(projectRoot, {
        action: 'answer',
        sessionId,
        answer: true,
      });

      expect(answerQuestion).toHaveBeenCalledWith(mockTree, mockState, 'yes');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.type).toBe('question');
      expect(parsed.questionNumber).toBe(2);
      expect(parsed.text).toBe('Is it a middleware?');
      expect(parsed.path).toHaveLength(1);
      expect(parsed.path[0].question).toBe('Does it handle HTTP?');
      expect(parsed.path[0].answer).toBe(true);
    });

    it('should return result when decision is reached via isDecisionResult', async () => {
      // Start a session
      const mockState = { currentNode: 'q1' };
      vi.mocked(startNavigation).mockReturnValue(mockState);
      vi.mocked(getCurrentNode).mockReturnValue({
        type: 'question',
        text: 'Does it handle HTTP?',
        yes: 'q2',
        no: 'r1',
      });

      const startResult = await handleDecide(projectRoot, { action: 'start' });
      const sessionId = JSON.parse(startResult.content[0].text).sessionId;

      // Mock answer returning a DecisionResult
      const decisionResult = { archId: 'core.service', why: 'Internal service without HTTP' };
      vi.mocked(answerQuestion).mockReturnValue(decisionResult);
      vi.mocked(isDecisionResult).mockReturnValue(true);

      const result = await handleDecide(projectRoot, {
        action: 'answer',
        sessionId,
        answer: false,
      });

      expect(answerQuestion).toHaveBeenCalledWith(mockTree, mockState, 'no');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.type).toBe('result');
      expect(parsed.archId).toBe('core.service');
      expect(parsed.why).toBe('Internal service without HTTP');
      expect(parsed.scaffoldCommand).toContain('core.service');
    });

    it('should return result when next node is a result node', async () => {
      // Start a session
      const mockState = { currentNode: 'q2' };
      vi.mocked(startNavigation).mockReturnValue(mockState);
      vi.mocked(getCurrentNode)
        .mockReturnValueOnce({
          type: 'question',
          text: 'Is it a middleware?',
          yes: 'r2',
          no: 'r3',
        })
        // Called inside the answer flow to record current question
        .mockReturnValueOnce({
          type: 'question',
          text: 'Is it a middleware?',
          yes: 'r2',
          no: 'r3',
        })
        // Called for next node - result
        .mockReturnValueOnce({
          type: 'result',
          arch_id: 'http.handler',
          why: 'HTTP request handler',
        });

      const startResult = await handleDecide(projectRoot, { action: 'start' });
      const sessionId = JSON.parse(startResult.content[0].text).sessionId;

      const nextState = { currentNode: 'r3' };
      vi.mocked(answerQuestion).mockReturnValue(nextState);
      vi.mocked(isDecisionResult).mockReturnValue(false);

      const result = await handleDecide(projectRoot, {
        action: 'answer',
        sessionId,
        answer: false,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.type).toBe('result');
      expect(parsed.archId).toBe('http.handler');
      expect(parsed.why).toBe('HTTP request handler');
      expect(parsed.scaffoldCommand).toContain('http.handler');
    });

    it('should convert boolean answer true to yes', async () => {
      const mockState = { currentNode: 'q1' };
      vi.mocked(startNavigation).mockReturnValue(mockState);
      vi.mocked(getCurrentNode).mockReturnValue({
        type: 'question',
        text: 'Does it handle HTTP?',
        yes: 'q2',
        no: 'r1',
      });

      const startResult = await handleDecide(projectRoot, { action: 'start' });
      const sessionId = JSON.parse(startResult.content[0].text).sessionId;

      const decisionResult = { archId: 'http.middleware', why: 'test' };
      vi.mocked(answerQuestion).mockReturnValue(decisionResult);
      vi.mocked(isDecisionResult).mockReturnValue(true);

      await handleDecide(projectRoot, {
        action: 'answer',
        sessionId,
        answer: true,
      });

      expect(answerQuestion).toHaveBeenCalledWith(mockTree, mockState, 'yes');
    });

    it('should convert boolean answer false to no', async () => {
      const mockState = { currentNode: 'q1' };
      vi.mocked(startNavigation).mockReturnValue(mockState);
      vi.mocked(getCurrentNode).mockReturnValue({
        type: 'question',
        text: 'Does it handle HTTP?',
        yes: 'q2',
        no: 'r1',
      });

      const startResult = await handleDecide(projectRoot, { action: 'start' });
      const sessionId = JSON.parse(startResult.content[0].text).sessionId;

      const decisionResult = { archId: 'core.service', why: 'test' };
      vi.mocked(answerQuestion).mockReturnValue(decisionResult);
      vi.mocked(isDecisionResult).mockReturnValue(true);

      await handleDecide(projectRoot, {
        action: 'answer',
        sessionId,
        answer: false,
      });

      expect(answerQuestion).toHaveBeenCalledWith(mockTree, mockState, 'no');
    });
  });

  describe('invalid action', () => {
    it('should return error for unknown action when sessionId is provided', async () => {
      // With an unknown action and a sessionId, it skips the start block
      // and the answer block, falling through to the invalid action error.
      const result = await handleDecide(projectRoot, {
        action: 'unknown',
        sessionId: 'some-session',
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('Invalid action');
      expect(parsed.hint).toContain('start');
      expect(parsed.hint).toContain('answer');
      expect(parsed.hint).toContain('show-tree');
    });

    it('should start a new session when action is unknown but no sessionId', async () => {
      // Without a sessionId, the condition `action === 'start' || !sessionId`
      // is true, so it starts a new session regardless of the action value.
      const mockState = { currentNode: 'q1' };
      vi.mocked(startNavigation).mockReturnValue(mockState);
      vi.mocked(getCurrentNode).mockReturnValue({
        type: 'question',
        text: 'Does it handle HTTP?',
        yes: 'q2',
        no: 'r1',
      });

      const result = await handleDecide(projectRoot, { action: 'unknown' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.type).toBe('question');
      expect(parsed.sessionId).toBeDefined();
    });
  });
});
