/**
 * @arch archcodex.test.unit
 *
 * Tests for UI touchpoint test generation.
 * @see spec.archcodex.uiTouchpoints.testGeneration
 */
import { describe, it, expect } from 'vitest';
import {
  generateTouchpointTests,
  type TouchpointInput,
} from '../../../../../src/core/spec/generators/ui.js';

describe('generateTouchpointTests', () => {
  describe('basic generation', () => {
    it('generates test for each touchpoint', () => {
      const touchpoints: TouchpointInput[] = [
        { component: 'TaskCard', handler: 'handleDuplicate' },
        { component: 'NoteCard', handler: 'handleDuplicate' },
      ];

      const result = generateTouchpointTests(touchpoints);

      expect(result.testCount).toBe(2);
      expect(result.tests).toContain('TaskCard');
      expect(result.tests).toContain('NoteCard');
      expect(result.tests).toContain('handleDuplicate');
    });

    it('generates describe block for touchpoints', () => {
      const touchpoints: TouchpointInput[] = [
        { component: 'TaskCard', location: 'context menu', handler: 'handleDuplicate' },
      ];

      const result = generateTouchpointTests(touchpoints);

      expect(result.tests).toContain('UI Touchpoints');
      expect(result.tests).toContain('context menu');
    });

    it('includes location in test description', () => {
      const touchpoints: TouchpointInput[] = [
        { component: 'TaskCard', location: 'toolbar' },
      ];

      const result = generateTouchpointTests(touchpoints);

      expect(result.tests).toContain('in toolbar');
    });

    it('includes handler in test description', () => {
      const touchpoints: TouchpointInput[] = [
        { component: 'TaskCard', handler: 'handleDelete' },
      ];

      const result = generateTouchpointTests(touchpoints);

      expect(result.tests).toContain('with handleDelete');
    });
  });

  describe('boundary cases', () => {
    it('empty touchpoints returns no tests', () => {
      const result = generateTouchpointTests([]);

      expect(result.testCount).toBe(0);
      expect(result.tests).toBe('');
    });

    it('undefined touchpoints returns no tests', () => {
      const result = generateTouchpointTests(undefined as unknown as TouchpointInput[]);

      expect(result.testCount).toBe(0);
      expect(result.tests).toBe('');
    });
  });

  describe('test count invariant', () => {
    it('test count matches touchpoint count', () => {
      const touchpoints: TouchpointInput[] = [
        { component: 'Comp1' },
        { component: 'Comp2' },
        { component: 'Comp3' },
        { component: 'Comp4' },
        { component: 'Comp5' },
      ];

      const result = generateTouchpointTests(touchpoints);

      expect(result.testCount).toBe(touchpoints.length);
    });
  });

  describe('framework support', () => {
    it('generates Playwright tests by default', () => {
      const touchpoints: TouchpointInput[] = [
        { component: 'TaskCard', handler: 'handleDuplicate' },
      ];

      const result = generateTouchpointTests(touchpoints);

      expect(result.tests).toContain("import { test, expect } from '@playwright/test'");
      expect(result.tests).toContain('async');
      expect(result.tests).toContain('page');
    });

    it('generates Cypress tests when specified', () => {
      const touchpoints: TouchpointInput[] = [
        { component: 'TaskCard' },
      ];

      const result = generateTouchpointTests(touchpoints, { framework: 'cypress' });

      expect(result.tests).toContain('cy.get');
    });

    it('generates Testing Library tests when specified', () => {
      const touchpoints: TouchpointInput[] = [
        { component: 'TaskCard' },
      ];

      const result = generateTouchpointTests(touchpoints, { framework: 'testing-library' });

      expect(result.tests).toContain('screen.getByTestId');
    });
  });

  describe('marker generation', () => {
    it('includes markers by default', () => {
      const touchpoints: TouchpointInput[] = [
        { component: 'TaskCard' },
      ];

      const result = generateTouchpointTests(touchpoints);

      expect(result.tests).toContain('@speccodex:touchpoints:start');
      expect(result.tests).toContain('@speccodex:touchpoints:end');
    });

    it('excludes markers when disabled', () => {
      const touchpoints: TouchpointInput[] = [
        { component: 'TaskCard' },
      ];

      const result = generateTouchpointTests(touchpoints, { markers: false });

      expect(result.tests).not.toContain('@speccodex:touchpoints:start');
    });
  });

  describe('context menu handling', () => {
    it('generates right-click test for context menu location', () => {
      const touchpoints: TouchpointInput[] = [
        { component: 'TaskCard', location: 'context menu', handler: 'handleDuplicate' },
      ];

      const result = generateTouchpointTests(touchpoints);

      expect(result.tests).toContain("button: 'right'");
      expect(result.tests).toContain('menuitem');
    });
  });

  describe('bulk actions handling', () => {
    it('generates toolbar test for bulk actions location', () => {
      const touchpoints: TouchpointInput[] = [
        { component: 'BulkToolbar', location: 'bulk actions', handler: 'handleBulkDuplicate' },
      ];

      const result = generateTouchpointTests(touchpoints);

      expect(result.tests).toContain('data-action');
    });
  });
});
