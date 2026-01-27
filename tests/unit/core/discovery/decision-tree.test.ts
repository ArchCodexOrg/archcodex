/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  validateDecisionTree,
  startNavigation,
  getCurrentNode,
  answerQuestion,
  isDecisionResult,
  type DecisionTree,
} from '../../../../src/core/discovery/decision-tree.js';
import {
  loadDecisionTree,
  getDecisionTreePath,
  decisionTreeExists,
} from '../../../../src/core/discovery/loader.js';

describe('decision-tree', () => {
  describe('validateDecisionTree', () => {
    it('should pass for valid tree', () => {
      const tree: DecisionTree = {
        version: '1.0',
        start: 'q1',
        nodes: {
          q1: { type: 'question', text: 'Is this X?', yes: 'r1', no: 'r2' },
          r1: { type: 'result', arch_id: 'arch.a' },
          r2: { type: 'result', arch_id: 'arch.b' },
        },
      };

      const errors = validateDecisionTree(tree);
      expect(errors).toHaveLength(0);
    });

    it('should detect missing start node', () => {
      const tree: DecisionTree = {
        version: '1.0',
        start: 'missing',
        nodes: {
          q1: { type: 'question', text: 'Is this X?', yes: 'r1', no: 'r2' },
          r1: { type: 'result', arch_id: 'arch.a' },
          r2: { type: 'result', arch_id: 'arch.b' },
        },
      };

      const errors = validateDecisionTree(tree);
      expect(errors).toContain("Start node 'missing' does not exist");
    });

    it('should detect broken references', () => {
      const tree: DecisionTree = {
        version: '1.0',
        start: 'q1',
        nodes: {
          q1: { type: 'question', text: 'Is this X?', yes: 'missing1', no: 'missing2' },
        },
      };

      const errors = validateDecisionTree(tree);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('missing1'))).toBe(true);
      expect(errors.some(e => e.includes('missing2'))).toBe(true);
    });

    it('should detect unreachable nodes', () => {
      const tree: DecisionTree = {
        version: '1.0',
        start: 'q1',
        nodes: {
          q1: { type: 'question', text: 'Is this X?', yes: 'r1', no: 'r1' },
          r1: { type: 'result', arch_id: 'arch.a' },
          r2: { type: 'result', arch_id: 'arch.unreachable' }, // Unreachable
        },
      };

      const errors = validateDecisionTree(tree);
      expect(errors.some(e => e.includes('r2') && e.includes('unreachable'))).toBe(true);
    });
  });

  describe('navigation', () => {
    const tree: DecisionTree = {
      version: '1.0',
      start: 'q1',
      nodes: {
        q1: { type: 'question', text: 'Is this CLI?', examples: 'commands', yes: 'r_cli', no: 'q2' },
        q2: { type: 'question', text: 'Is this core logic?', yes: 'r_core', no: 'r_util' },
        r_cli: { type: 'result', arch_id: 'cli.command', why: 'CLI handlers' },
        r_core: { type: 'result', arch_id: 'core.domain', why: 'Core logic' },
        r_util: { type: 'result', arch_id: 'util', why: 'Utility' },
      },
    };

    it('should start at the first question', () => {
      const state = startNavigation(tree);

      expect(state.currentNodeId).toBe('q1');
      expect(state.path).toHaveLength(0);
    });

    it('should get current node', () => {
      const state = startNavigation(tree);
      const node = getCurrentNode(tree, state);

      expect(node?.type).toBe('question');
      if (node?.type === 'question') {
        expect(node.text).toBe('Is this CLI?');
      }
    });

    it('should navigate to result on yes', () => {
      const state = startNavigation(tree);
      const result = answerQuestion(tree, state, 'yes');

      expect(isDecisionResult(result)).toBe(true);
      if (isDecisionResult(result)) {
        expect(result.archId).toBe('cli.command');
        expect(result.why).toBe('CLI handlers');
        expect(result.path).toHaveLength(1);
        expect(result.path[0].answer).toBe('yes');
      }
    });

    it('should navigate to next question on no', () => {
      const state = startNavigation(tree);
      const nextState = answerQuestion(tree, state, 'no');

      expect(isDecisionResult(nextState)).toBe(false);
      if (!isDecisionResult(nextState)) {
        expect(nextState.currentNodeId).toBe('q2');
        expect(nextState.path).toHaveLength(1);
      }
    });

    it('should track full path through tree', () => {
      let state = startNavigation(tree);

      // Answer no to first question
      state = answerQuestion(tree, state, 'no') as typeof state;
      expect(state.currentNodeId).toBe('q2');

      // Answer no to second question
      const result = answerQuestion(tree, state, 'no');
      expect(isDecisionResult(result)).toBe(true);

      if (isDecisionResult(result)) {
        expect(result.archId).toBe('util');
        expect(result.path).toHaveLength(2);
        expect(result.path[0].question).toBe('Is this CLI?');
        expect(result.path[0].answer).toBe('no');
        expect(result.path[1].question).toBe('Is this core logic?');
        expect(result.path[1].answer).toBe('no');
      }
    });
  });
});

describe('decision-tree loader', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `archcodex-tree-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(join(testDir, '.arch'), { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('loadDecisionTree', () => {
    it('should return null when no file exists', async () => {
      const tree = await loadDecisionTree(testDir);
      expect(tree).toBeNull();
    });

    it('should load valid tree from file', async () => {
      const treeContent = `
version: "1.0"
start: q1
nodes:
  q1:
    type: question
    text: "Is this a service?"
    yes: r1
    no: r2
  r1:
    type: result
    arch_id: domain.service
  r2:
    type: result
    arch_id: util
`;
      await writeFile(join(testDir, '.arch', 'decision-tree.yaml'), treeContent);

      const tree = await loadDecisionTree(testDir);

      expect(tree).not.toBeNull();
      expect(tree?.start).toBe('q1');
      expect(Object.keys(tree?.nodes || {})).toHaveLength(3);
    });

    it('should throw on invalid tree structure', async () => {
      const invalidTree = `
version: "1.0"
start: missing_node
nodes:
  q1:
    type: question
    text: "Question?"
    yes: r1
    no: r2
`;
      await writeFile(join(testDir, '.arch', 'decision-tree.yaml'), invalidTree);

      await expect(loadDecisionTree(testDir)).rejects.toThrow('Invalid decision tree');
    });
  });

  describe('getDecisionTreePath', () => {
    it('should return correct path', () => {
      const path = getDecisionTreePath('/project');

      expect(path).toContain('.arch');
      expect(path).toContain('decision-tree.yaml');
    });
  });

  describe('decisionTreeExists', () => {
    it('should return false when tree does not exist', async () => {
      const exists = await decisionTreeExists(testDir);
      expect(exists).toBe(false);
    });

    it('should return true when tree exists', async () => {
      await writeFile(
        join(testDir, '.arch', 'decision-tree.yaml'),
        'version: "1.0"\nstart: q1\nnodes:\n  q1:\n    type: result\n    arch_id: test'
      );

      const exists = await decisionTreeExists(testDir);
      expect(exists).toBe(true);
    });
  });
});
