/** @arch archcodex.test @intent:cli-output */
/**
 * Grader for LLM evaluation results.
 * Automatically scores results based on rubrics and heuristics.
 */

import type {
  RawResult,
  EvaluatedResult,
  Grades,
  Scenario,
} from '../types.js';

/**
 * Grade a raw result against its scenario's expectations.
 */
export function gradeResult(result: RawResult, scenario: Scenario): EvaluatedResult {
  const grades: Grades = {
    completion: false,
    correctness: 0,
    constraintAdherence: false,
    modificationOrder: false,
    layerCompliance: false,
    impactAwareness: 0,
  };

  // 1. Task completion: did it produce code?
  grades.completion = result.codeBlocks.length > 0;

  // 2. Constraint adherence: archcodex_check passed?
  grades.constraintAdherence = result.violations.length === 0;

  // 3. Layer compliance: no layer boundary violations?
  grades.layerCompliance = !result.violations.some(v =>
    v.rule === 'layer_boundary' ||
    v.rule === 'forbid_import' ||
    v.rule.includes('layer')
  );

  // 4. Modification order: check if files mentioned in correct order
  grades.modificationOrder = checkModificationOrder(
    result.responseText,
    scenario.expected.modificationOrder
  );

  // 5. Impact awareness: check for consumer mentions
  grades.impactAwareness = scoreImpactAwareness(
    result.responseText,
    scenario.expected.consumers
  );

  // 6. Correctness: apply rubric
  grades.correctness = applyRubric(result, scenario.expected.rubric);

  // Flag for manual review if:
  // - Hard scenario with low scores
  // - Unexpected violations
  // - Mixed signals (completion but low correctness)
  const needsReview =
    (scenario.difficulty === 'hard' && grades.correctness < 3) ||
    (grades.completion && grades.correctness < 2) ||
    (result.violations.length > 0 && grades.correctness > 2);

  return {
    ...result,
    grades,
    needsReview,
    reviewNotes: needsReview ? generateReviewNotes(grades, scenario) : undefined,
  };
}

/**
 * Check if response mentions files in the expected modification order.
 */
function checkModificationOrder(response: string, expectedOrder: string[]): boolean {
  if (expectedOrder.length === 0) return true;

  const responseLower = response.toLowerCase();

  // Find positions of each expected file mention
  const positions: number[] = [];
  for (const file of expectedOrder) {
    const fileName = file.split('/').pop()?.toLowerCase() ?? file.toLowerCase();
    const pos = responseLower.indexOf(fileName);
    if (pos === -1) {
      // File not mentioned - consider order not followed
      return false;
    }
    positions.push(pos);
  }

  // Check if positions are in ascending order
  for (let i = 1; i < positions.length; i++) {
    if (positions[i] < positions[i - 1]) {
      return false;
    }
  }

  return true;
}

/**
 * Score impact awareness (0-3).
 */
function scoreImpactAwareness(response: string, consumers?: string[]): number {
  if (!consumers || consumers.length === 0) {
    return 3; // No consumers expected, full score
  }

  const responseLower = response.toLowerCase();

  // Check for impact-related keywords
  const impactKeywords = ['impact', 'consumer', 'depend', 'break', 'update', 'affect'];
  const hasImpactAwareness = impactKeywords.some(kw => responseLower.includes(kw));

  // Count how many consumers are mentioned
  let consumersMentioned = 0;
  for (const consumer of consumers) {
    const fileName = consumer.split('/').pop()?.toLowerCase() ?? consumer.toLowerCase();
    if (responseLower.includes(fileName)) {
      consumersMentioned++;
    }
  }

  // Score based on awareness and consumer mentions
  if (consumersMentioned >= consumers.length) {
    return 3; // All consumers mentioned
  } else if (consumersMentioned > 0 && hasImpactAwareness) {
    return 2; // Some consumers + impact awareness
  } else if (hasImpactAwareness) {
    return 1; // Only impact awareness
  }

  return 0; // No awareness
}

/**
 * Apply rubric to score correctness (0-5).
 */
function applyRubric(result: RawResult, rubric: string[]): number {
  if (rubric.length === 0) return 0;

  const response = result.responseText.toLowerCase();
  const codeContent = result.codeBlocks.map(b => b.content.toLowerCase()).join('\n');

  let score = 0;
  const pointsPerItem = 5 / rubric.length;

  for (const criterion of rubric) {
    const criterionLower = criterion.toLowerCase();

    // Extract key concepts from the rubric item
    const keyPhrases = extractKeyPhrases(criterionLower);

    // Check if key concepts appear in response or code
    const matched = keyPhrases.some(phrase =>
      response.includes(phrase) || codeContent.includes(phrase)
    );

    if (matched) {
      score += pointsPerItem;
    }
  }

  return Math.round(score);
}

/**
 * Extract key phrases from a rubric criterion.
 */
function extractKeyPhrases(criterion: string): string[] {
  // Remove common words and extract meaningful phrases
  const stopWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'for', 'on', 'with', 'if', 'no', 'not'];

  const words = criterion
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.includes(w));

  // Return individual words as key phrases
  return words;
}

/**
 * Generate review notes for flagged results.
 */
function generateReviewNotes(grades: Grades, scenario: Scenario): string {
  const notes: string[] = [];

  if (!grades.completion) {
    notes.push('No code produced');
  }

  if (grades.correctness < 3) {
    notes.push(`Low correctness score: ${grades.correctness}/5`);
  }

  if (!grades.modificationOrder) {
    notes.push('Modification order not followed');
  }

  if (!grades.layerCompliance) {
    notes.push('Layer boundary violations detected');
  }

  if (grades.impactAwareness < 2 && scenario.expected.consumers?.length) {
    notes.push('Low impact awareness despite having consumers');
  }

  return notes.join('; ');
}

/**
 * Grade multiple results.
 */
export function gradeResults(
  results: RawResult[],
  getScenario: (id: string) => Scenario | undefined
): EvaluatedResult[] {
  return results.map(result => {
    const scenario = getScenario(result.scenarioId);
    if (!scenario) {
      throw new Error(`Unknown scenario: ${result.scenarioId}`);
    }
    return gradeResult(result, scenario);
  });
}
