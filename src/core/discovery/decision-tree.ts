/**
 * @arch archcodex.core.domain
 */
import { z } from 'zod';

/**
 * A result node that recommends an architecture.
 */
export const ResultNodeSchema = z.object({
  type: z.literal('result'),
  arch_id: z.string(),
  why: z.string().optional(),
});

/**
 * A question node with yes/no branches.
 */
export const QuestionNodeSchema = z.object({
  type: z.literal('question'),
  text: z.string(),
  examples: z.string().optional(),
  yes: z.string(), // Node ID to go to on "yes"
  no: z.string(),  // Node ID to go to on "no"
});

/**
 * A node in the decision tree (either a question or a result).
 */
export const DecisionNodeSchema = z.discriminatedUnion('type', [
  QuestionNodeSchema,
  ResultNodeSchema,
]);

/**
 * Complete decision tree schema.
 */
export const DecisionTreeSchema = z.object({
  version: z.string().default('1.0'),
  description: z.string().optional(),
  start: z.string(), // Starting node ID
  nodes: z.record(z.string(), DecisionNodeSchema),
});

// Type exports
export type ResultNode = z.infer<typeof ResultNodeSchema>;
export type QuestionNode = z.infer<typeof QuestionNodeSchema>;
export type DecisionNode = z.infer<typeof DecisionNodeSchema>;
export type DecisionTree = z.infer<typeof DecisionTreeSchema>;

/**
 * Current state while navigating the tree.
 */
export interface TreeNavigationState {
  currentNodeId: string;
  path: Array<{
    nodeId: string;
    question: string;
    answer: 'yes' | 'no';
  }>;
}

/**
 * Result of evaluating the decision tree.
 */
export interface DecisionResult {
  archId: string;
  why?: string;
  path: TreeNavigationState['path'];
}

/**
 * Validate that a decision tree has valid structure.
 */
export function validateDecisionTree(tree: DecisionTree): string[] {
  const errors: string[] = [];
  const nodeIds = new Set(Object.keys(tree.nodes));

  // Check start node exists
  if (!nodeIds.has(tree.start)) {
    errors.push(`Start node '${tree.start}' does not exist`);
  }

  // Check all references are valid
  for (const [nodeId, node] of Object.entries(tree.nodes)) {
    if (node.type === 'question') {
      if (!nodeIds.has(node.yes)) {
        errors.push(`Node '${nodeId}' references non-existent 'yes' target '${node.yes}'`);
      }
      if (!nodeIds.has(node.no)) {
        errors.push(`Node '${nodeId}' references non-existent 'no' target '${node.no}'`);
      }
    }
  }

  // Check for unreachable nodes
  const reachable = new Set<string>();
  const toVisit = [tree.start];
  while (toVisit.length > 0) {
    const nodeId = toVisit.pop()!;
    if (reachable.has(nodeId)) continue;
    reachable.add(nodeId);

    const node = tree.nodes[nodeId];
    if (node?.type === 'question') {
      toVisit.push(node.yes, node.no);
    }
  }

  for (const nodeId of nodeIds) {
    if (!reachable.has(nodeId)) {
      errors.push(`Node '${nodeId}' is unreachable from start`);
    }
  }

  return errors;
}

/**
 * Get the starting state for tree navigation.
 */
export function startNavigation(tree: DecisionTree): TreeNavigationState {
  return {
    currentNodeId: tree.start,
    path: [],
  };
}

/**
 * Get the current node.
 */
export function getCurrentNode(tree: DecisionTree, state: TreeNavigationState): DecisionNode | undefined {
  return tree.nodes[state.currentNodeId];
}

/**
 * Answer the current question and move to the next node.
 */
export function answerQuestion(
  tree: DecisionTree,
  state: TreeNavigationState,
  answer: 'yes' | 'no'
): TreeNavigationState | DecisionResult {
  const currentNode = tree.nodes[state.currentNodeId];

  if (!currentNode || currentNode.type !== 'question') {
    throw new Error(`Cannot answer: current node is not a question`);
  }

  const nextNodeId = answer === 'yes' ? currentNode.yes : currentNode.no;
  const nextNode = tree.nodes[nextNodeId];

  const newPath = [
    ...state.path,
    {
      nodeId: state.currentNodeId,
      question: currentNode.text,
      answer,
    },
  ];

  if (!nextNode) {
    throw new Error(`Next node '${nextNodeId}' not found`);
  }

  if (nextNode.type === 'result') {
    return {
      archId: nextNode.arch_id,
      why: nextNode.why,
      path: newPath,
    };
  }

  return {
    currentNodeId: nextNodeId,
    path: newPath,
  };
}

/**
 * Check if a result is a final decision.
 */
export function isDecisionResult(result: TreeNavigationState | DecisionResult): result is DecisionResult {
  return 'archId' in result;
}
