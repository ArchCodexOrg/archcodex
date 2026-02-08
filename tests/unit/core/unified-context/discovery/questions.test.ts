/**
 * @arch archcodex.test.unit
 *
 * Tests for clarifying question generation and parsing.
 */
import { describe, it, expect } from 'vitest';
import {
  generateQuestions,
  parseAnswers,
  formatQuestions,
  MODEL_QUESTION,
  ENTITY_CONTEXT_QUESTION,
} from '../../../../../src/core/unified-context/discovery/questions.js';
import type { RankedModule, ClarifyingQuestion } from '../../../../../src/core/unified-context/discovery/types.js';

describe('questions', () => {
  const makeModule = (path: string, confidence = 50): RankedModule => ({
    path,
    confidence,
    signals: [{ type: 'path', score: 0.5, reason: 'test' }],
    primaryReason: 'test',
    fileCount: 1,
  });

  describe('generateQuestions', () => {
    it('adds layer question when both frontend and backend modules exist', () => {
      const modules = [
        makeModule('src/components/orders/'),
        makeModule('src/api/orders/'),
      ];
      const questions = generateQuestions(['order'], modules, 'add');

      const layerQ = questions.find(q => q.id === 'layer');
      expect(layerQ).toBeDefined();
    });

    it('omits layer question when only one layer present', () => {
      const modules = [makeModule('src/api/orders/')];
      const questions = generateQuestions(['order'], modules, 'add');

      const layerQ = questions.find(q => q.id === 'layer');
      expect(layerQ).toBeUndefined();
    });

    it('adds resource question when multiple resource types detected', () => {
      const questions = generateQuestions(
        ['article', 'document'],
        [makeModule('src/mod/')],
        'add',
      );

      const resourceQ = questions.find(q => q.id === 'resource');
      expect(resourceQ).toBeDefined();
      expect(resourceQ!.options.length).toBeGreaterThanOrEqual(3); // 2 resources + "All"
    });

    it('adds scope question for add actions', () => {
      const questions = generateQuestions(
        ['order'],
        [makeModule('src/mod/')],
        'add',
      );

      const scopeQ = questions.find(q => q.id === 'scope');
      expect(scopeQ).toBeDefined();
    });

    it('omits scope question for non-add/modify actions', () => {
      const questions = generateQuestions(
        ['order'],
        [makeModule('src/mod/')],
        'fix',
      );

      const scopeQ = questions.find(q => q.id === 'scope');
      expect(scopeQ).toBeUndefined();
    });

    it('adds model question when requested', () => {
      const questions = generateQuestions(
        ['order'],
        [makeModule('src/mod/')],
        'add',
        { includeModelQuestion: true },
      );

      const modelQ = questions.find(q => q.id === 'model');
      expect(modelQ).toBeDefined();
    });

    it('adds entity context question when entities detected', () => {
      const questions = generateQuestions(
        ['order'],
        [makeModule('src/mod/')],
        'add',
        { detectedEntities: ['Order'] },
      );

      const entityQ = questions.find(q => q.id === 'entity-context');
      expect(entityQ).toBeDefined();
    });
  });

  describe('parseAnswers', () => {
    it('extracts boost keywords and paths from selected options', () => {
      const questions: ClarifyingQuestion[] = [{
        id: 'layer',
        question: 'What layer?',
        category: 'layer',
        options: [
          { id: 'frontend', label: 'Frontend', boostKeywords: ['component'], boostPaths: ['src/components'] },
          { id: 'backend', label: 'Backend', boostKeywords: ['api'], boostPaths: ['convex'] },
        ],
      }];

      const result = parseAnswers(questions, 'a');
      expect(result.boostKeywords).toContain('component');
      expect(result.boostPaths).toContain('src/components');
    });

    it('skips questions answered with x', () => {
      const questions: ClarifyingQuestion[] = [{
        id: 'scope',
        question: 'Scope?',
        category: 'scope',
        options: [
          { id: 'ui', label: 'UI', boostKeywords: ['ui'], boostPaths: ['components'] },
        ],
      }];

      const result = parseAnswers(questions, 'x');
      expect(result.boostKeywords).toHaveLength(0);
      expect(result.boostPaths).toHaveLength(0);
    });

    it('handles multiple comma-separated answers', () => {
      const questions: ClarifyingQuestion[] = [
        {
          id: 'layer',
          question: 'Layer?',
          category: 'layer',
          options: [
            { id: 'frontend', label: 'Frontend', boostKeywords: ['component'], boostPaths: ['src'] },
          ],
        },
        {
          id: 'scope',
          question: 'Scope?',
          category: 'scope',
          options: [
            { id: 'ui', label: 'UI', boostKeywords: ['style'], boostPaths: ['styles'] },
          ],
        },
      ];

      const result = parseAnswers(questions, 'a,a');
      expect(result.boostKeywords).toContain('component');
      expect(result.selectedScope).toBe('ui');
    });

    it('extracts selectedModel from model question', () => {
      const questions: ClarifyingQuestion[] = [MODEL_QUESTION];
      const result = parseAnswers(questions, 'b'); // sonnet
      expect(result.selectedModel).toBe('sonnet');
    });

    it('extracts includeEntityContext from entity-context question', () => {
      const questions: ClarifyingQuestion[] = [ENTITY_CONTEXT_QUESTION];
      const result = parseAnswers(questions, 'a'); // yes
      expect(result.includeEntityContext).toBe(true);
    });

    it('handles out-of-range option letter gracefully', () => {
      const questions: ClarifyingQuestion[] = [{
        id: 'test',
        question: 'Test?',
        category: 'scope',
        options: [
          { id: 'a', label: 'Only option', boostKeywords: [], boostPaths: [] },
        ],
      }];

      const result = parseAnswers(questions, 'z');
      expect(result.boostKeywords).toHaveLength(0);
    });
  });

  describe('formatQuestions', () => {
    it('formats questions with numbered list and lettered options', () => {
      const questions: ClarifyingQuestion[] = [{
        id: 'test',
        question: 'What layer?',
        category: 'layer',
        options: [
          { id: 'a', label: 'Frontend', boostKeywords: [], boostPaths: [] },
          { id: 'b', label: 'Backend', boostKeywords: [], boostPaths: [] },
        ],
      }];

      const output = formatQuestions(questions);
      expect(output).toContain('1. What layer?');
      expect(output).toContain('a) Frontend');
      expect(output).toContain('b) Backend');
    });

    it('handles multiple questions', () => {
      const questions: ClarifyingQuestion[] = [
        {
          id: 'q1',
          question: 'First?',
          category: 'layer',
          options: [{ id: 'a', label: 'A', boostKeywords: [], boostPaths: [] }],
        },
        {
          id: 'q2',
          question: 'Second?',
          category: 'scope',
          options: [{ id: 'b', label: 'B', boostKeywords: [], boostPaths: [] }],
        },
      ];

      const output = formatQuestions(questions);
      expect(output).toContain('1. First?');
      expect(output).toContain('2. Second?');
    });
  });
});
