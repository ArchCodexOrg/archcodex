/** @arch archcodex.test.unit */
import { describe, it, expect } from 'vitest';
import {
  ACTION_PATTERNS,
  ACTION_WORDS,
  STOP_WORDS,
  NON_ENTITY_WORDS,
  extractTaskInfo,
  type ActionType,
} from '../../../../src/core/unified-context/task-keywords.js';

describe('task-keywords', () => {
  describe('ACTION_PATTERNS', () => {
    it('maps add variants to add action type', () => {
      expect(ACTION_PATTERNS['add']).toBe('add');
      expect(ACTION_PATTERNS['create']).toBe('add');
      expect(ACTION_PATTERNS['implement']).toBe('add');
      expect(ACTION_PATTERNS['build']).toBe('add');
      expect(ACTION_PATTERNS['new']).toBe('add');
    });

    it('maps modify variants to modify action type', () => {
      expect(ACTION_PATTERNS['update']).toBe('modify');
      expect(ACTION_PATTERNS['change']).toBe('modify');
      expect(ACTION_PATTERNS['modify']).toBe('modify');
      expect(ACTION_PATTERNS['edit']).toBe('modify');
    });

    it('maps refactor variants to refactor action type', () => {
      expect(ACTION_PATTERNS['refactor']).toBe('refactor');
      expect(ACTION_PATTERNS['restructure']).toBe('refactor');
      expect(ACTION_PATTERNS['reorganize']).toBe('refactor');
      expect(ACTION_PATTERNS['extract']).toBe('refactor');
      expect(ACTION_PATTERNS['move']).toBe('refactor');
    });

    it('maps delete variants to delete action type', () => {
      expect(ACTION_PATTERNS['delete']).toBe('delete');
      expect(ACTION_PATTERNS['remove']).toBe('delete');
      expect(ACTION_PATTERNS['drop']).toBe('delete');
    });

    it('maps fix variants to fix action type', () => {
      expect(ACTION_PATTERNS['fix']).toBe('fix');
      expect(ACTION_PATTERNS['bug']).toBe('fix');
      expect(ACTION_PATTERNS['repair']).toBe('fix');
      expect(ACTION_PATTERNS['patch']).toBe('fix');
    });
  });

  describe('ACTION_WORDS', () => {
    it('is a Set containing all ACTION_PATTERNS keys', () => {
      expect(ACTION_WORDS).toBeInstanceOf(Set);
      expect(ACTION_WORDS.has('add')).toBe(true);
      expect(ACTION_WORDS.has('create')).toBe(true);
      expect(ACTION_WORDS.has('update')).toBe(true);
      expect(ACTION_WORDS.has('refactor')).toBe(true);
      expect(ACTION_WORDS.has('delete')).toBe(true);
      expect(ACTION_WORDS.has('fix')).toBe(true);
    });

    it('has same size as ACTION_PATTERNS', () => {
      expect(ACTION_WORDS.size).toBe(Object.keys(ACTION_PATTERNS).length);
    });
  });

  describe('STOP_WORDS', () => {
    it('contains expected articles and prepositions', () => {
      expect(STOP_WORDS.has('the')).toBe(true);
      expect(STOP_WORDS.has('a')).toBe(true);
      expect(STOP_WORDS.has('an')).toBe(true);
      expect(STOP_WORDS.has('to')).toBe(true);
      expect(STOP_WORDS.has('for')).toBe(true);
      expect(STOP_WORDS.has('in')).toBe(true);
    });

    it('contains common verbs', () => {
      expect(STOP_WORDS.has('is')).toBe(true);
      expect(STOP_WORDS.has('are')).toBe(true);
      expect(STOP_WORDS.has('have')).toBe(true);
      expect(STOP_WORDS.has('do')).toBe(true);
    });

    it('contains pronouns', () => {
      expect(STOP_WORDS.has('it')).toBe(true);
      expect(STOP_WORDS.has('this')).toBe(true);
      expect(STOP_WORDS.has('that')).toBe(true);
    });
  });

  describe('NON_ENTITY_WORDS', () => {
    it('contains capitalized verbs that should not be entities', () => {
      expect(NON_ENTITY_WORDS.has('Add')).toBe(true);
      expect(NON_ENTITY_WORDS.has('Create')).toBe(true);
      expect(NON_ENTITY_WORDS.has('Update')).toBe(true);
      expect(NON_ENTITY_WORDS.has('Delete')).toBe(true);
    });

    it('contains common capitalized words', () => {
      expect(NON_ENTITY_WORDS.has('The')).toBe(true);
      expect(NON_ENTITY_WORDS.has('This')).toBe(true);
      expect(NON_ENTITY_WORDS.has('Users')).toBe(true);
    });
  });

  describe('extractTaskInfo', () => {
    describe('action type detection', () => {
      it('extracts add action type from task description', () => {
        const result = extractTaskInfo('add new user authentication');
        expect(result.actionType).toBe('add');
      });

      it('extracts modify action type from task description', () => {
        const result = extractTaskInfo('update the order status field');
        expect(result.actionType).toBe('modify');
      });

      it('extracts refactor action type from task description', () => {
        const result = extractTaskInfo('refactor database connection logic');
        expect(result.actionType).toBe('refactor');
      });

      it('extracts delete action type from task description', () => {
        const result = extractTaskInfo('remove deprecated API endpoint');
        expect(result.actionType).toBe('delete');
      });

      it('extracts fix action type from task description', () => {
        const result = extractTaskInfo('fix authentication bug in login');
        expect(result.actionType).toBe('fix');
      });

      it('returns unknown for no matching action', () => {
        const result = extractTaskInfo('the system should handle errors');
        expect(result.actionType).toBe('unknown');
      });

      it('detects action from first 5 words only', () => {
        const result = extractTaskInfo('configure the system to add new features');
        expect(result.actionType).toBe('add');
      });
    });

    describe('keyword extraction', () => {
      it('extracts keywords filtering stop words', () => {
        const result = extractTaskInfo('add profile authentication to the system');
        expect(result.keywords).toContain('profile');
        expect(result.keywords).toContain('authentication');
        expect(result.keywords).toContain('system');
        expect(result.keywords).not.toContain('the');
        expect(result.keywords).not.toContain('to');
      });

      it('filters out action words from keywords', () => {
        const result = extractTaskInfo('add new create endpoint');
        expect(result.keywords).not.toContain('add');
        expect(result.keywords).not.toContain('create');
        expect(result.keywords).toContain('endpoint');
      });

      it('filters out short words (less than 3 characters)', () => {
        const result = extractTaskInfo('add a new user to db');
        expect(result.keywords).not.toContain('a');
        expect(result.keywords).not.toContain('to');
        expect(result.keywords).not.toContain('db');
      });

      it('deduplicates keywords', () => {
        const result = extractTaskInfo('add order validation for order authentication');
        const orderCount = result.keywords.filter(k => k === 'order').length;
        expect(orderCount).toBe(1);
      });

      it('extracts multiple keywords', () => {
        const result = extractTaskInfo('create order processing pipeline');
        expect(result.keywords).toContain('order');
        expect(result.keywords).toContain('processing');
        expect(result.keywords).toContain('pipeline');
      });
    });

    describe('entity extraction', () => {
      it('extracts PascalCase entities', () => {
        const result = extractTaskInfo('add OrderProcessor to handle UserData');
        expect(result.entities).toContain('OrderProcessor');
        expect(result.entities).toContain('UserData');
      });

      it('filters out NON_ENTITY_WORDS', () => {
        const result = extractTaskInfo('Add new feature for Users processing');
        expect(result.entities).not.toContain('Add');
        expect(result.entities).not.toContain('Users');
      });

      it('extracts entities from middle of sentence', () => {
        const result = extractTaskInfo('update the OrderStatus field in database');
        expect(result.entities).toContain('OrderStatus');
      });

      it('deduplicates entities', () => {
        const result = extractTaskInfo('update OrderProcessor and improve OrderProcessor');
        const count = result.entities.filter(e => e === 'OrderProcessor').length;
        expect(count).toBe(1);
      });

      it('handles tasks with no entities', () => {
        const result = extractTaskInfo('add new authentication logic');
        expect(result.entities).toEqual([]);
      });

      it('extracts multiple single-word PascalCase entities', () => {
        const result = extractTaskInfo('connect Customer and Order tables');
        expect(result.entities).toContain('Customer');
        expect(result.entities).toContain('Order');
      });
    });

    describe('complete extraction', () => {
      it('extracts all components from complex task', () => {
        const result = extractTaskInfo('refactor UserAuthentication handler to improve security');

        expect(result.actionType).toBe('refactor');
        expect(result.keywords).toContain('handler');
        expect(result.keywords).toContain('improve');
        expect(result.keywords).toContain('security');
        expect(result.entities).toContain('UserAuthentication');
      });

      it('handles empty task description', () => {
        const result = extractTaskInfo('');
        expect(result.actionType).toBe('unknown');
        expect(result.keywords).toEqual([]);
        expect(result.entities).toEqual([]);
      });

      it('handles task with only stop words', () => {
        const result = extractTaskInfo('the a to for in');
        expect(result.actionType).toBe('unknown');
        expect(result.keywords).toEqual([]);
        expect(result.entities).toEqual([]);
      });
    });
  });
});
