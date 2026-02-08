/**
 * @arch archcodex.test
 * @intent:cli-output
 *
 * Tests for the SpecCodex UI test generator.
 */
import { describe, it, expect } from 'vitest';
import { generateUITests, hasUISection, type UIGeneratorOptions } from '../../../src/core/spec/generators/ui.js';
import type { ResolvedSpec } from '../../../src/core/spec/schema.js';

// Helper to create a minimal resolved spec
function createSpec(ui: ResolvedSpec['node']['ui'], intent = 'Test UI component'): ResolvedSpec {
  return {
    specId: 'spec.test.component',
    inheritanceChain: [],
    appliedMixins: [],
    node: {
      intent,
      ui,
    },
  };
}

describe('UI Test Generator', () => {
  describe('generateUITests', () => {
    it('returns error when spec has no UI section', () => {
      const spec = createSpec(undefined);
      const result = generateUITests(spec);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('NO_UI_SECTION');
    });

    it('returns error when spec has no intent', () => {
      const spec: ResolvedSpec = {
        specId: 'spec.test',
        inheritanceChain: [],
        appliedMixins: [],
        node: {
          ui: { trigger: { label: 'Test' } },
        },
      };
      const result = generateUITests(spec);

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_SPEC');
    });

    it('generates trigger tests for context menu items', () => {
      const spec = createSpec({
        trigger: {
          location: 'context menu',
          label: 'Duplicate',
          icon: 'copy',
        },
      });

      const result = generateUITests(spec);

      expect(result.valid).toBe(true);
      expect(result.categories.trigger).toBeGreaterThan(0);
      expect(result.code).toContain('context menu');
      expect(result.code).toContain('Duplicate');
      expect(result.code).toContain("getByRole('menuitem'");
    });

    it('generates trigger tests for keyboard shortcuts', () => {
      const spec = createSpec({
        trigger: {
          shortcut: 'Cmd+D',
        },
      });

      const result = generateUITests(spec);

      expect(result.valid).toBe(true);
      expect(result.categories.trigger).toBeGreaterThan(0);
      expect(result.code).toContain('Cmd+D');
      expect(result.code).toContain("keyboard.press('Meta+D')");
    });

    it('generates interaction tests for flows', () => {
      const spec = createSpec({
        interaction: {
          flow: [
            'User clicks button',
            'Dialog appears',
            'User confirms',
          ],
        },
      });

      const result = generateUITests(spec);

      expect(result.valid).toBe(true);
      expect(result.categories.interaction).toBeGreaterThan(0);
      expect(result.code).toContain('completes interaction flow');
      expect(result.code).toContain('User clicks button');
    });

    it('generates interaction tests for optimistic updates', () => {
      const spec = createSpec({
        interaction: {
          optimistic: true,
        },
      });

      const result = generateUITests(spec);

      expect(result.valid).toBe(true);
      expect(result.categories.interaction).toBeGreaterThan(0);
      expect(result.code).toContain('optimistic update');
      expect(result.code).toContain('[data-optimistic]');
    });

    it('generates interaction tests for loading states', () => {
      const spec = createSpec({
        interaction: {
          loading: 'Inline spinner',
        },
      });

      const result = generateUITests(spec);

      expect(result.valid).toBe(true);
      expect(result.code).toContain('Inline spinner');
      expect(result.code).toContain('[data-loading]');
    });

    it('generates accessibility tests for ARIA roles', () => {
      const spec = createSpec({
        accessibility: {
          role: 'menuitem',
          label: 'Duplicate entry',
        },
      });

      const result = generateUITests(spec);

      expect(result.valid).toBe(true);
      expect(result.categories.accessibility).toBeGreaterThan(0);
      expect(result.code).toContain("'menuitem'");
      expect(result.code).toContain('Duplicate entry');
    });

    it('generates accessibility tests for keyboard navigation', () => {
      const spec = createSpec({
        accessibility: {
          keyboardNav: [
            { key: 'Enter', action: 'activate' },
            { key: 'Escape', action: 'close' },
          ],
        },
      });

      const result = generateUITests(spec);

      expect(result.valid).toBe(true);
      expect(result.categories.accessibility).toBeGreaterThan(0);
      expect(result.code).toContain('Enter key activate');
      expect(result.code).toContain('Escape key close');
    });

    it('generates accessibility tests with axe plugin', () => {
      const spec = createSpec({
        accessibility: {
          role: 'dialog',
        },
      });

      const result = generateUITests(spec, { accessibilityPlugin: 'axe' });

      expect(result.valid).toBe(true);
      expect(result.code).toContain('AxeBuilder');
      expect(result.code).toContain('no accessibility violations');
    });

    it('generates feedback tests for success messages', () => {
      const spec = createSpec({
        feedback: {
          success: 'Entry duplicated successfully',
        },
      });

      const result = generateUITests(spec);

      expect(result.valid).toBe(true);
      expect(result.categories.feedback).toBeGreaterThan(0);
      expect(result.code).toContain('Entry duplicated successfully');
      expect(result.code).toContain('shows success feedback');
    });

    it('generates feedback tests for error messages', () => {
      const spec = createSpec({
        feedback: {
          error: 'Failed to duplicate entry',
        },
      });

      const result = generateUITests(spec);

      expect(result.valid).toBe(true);
      expect(result.categories.feedback).toBeGreaterThan(0);
      expect(result.code).toContain('Failed to duplicate entry');
      expect(result.code).toContain('shows error feedback');
    });

    it('respects framework option for Cypress', () => {
      const spec = createSpec({
        trigger: {
          location: 'toolbar',
          label: 'Save',
        },
      });

      const result = generateUITests(spec, { framework: 'cypress' });

      expect(result.valid).toBe(true);
      expect(result.code).toContain('/// <reference types="cypress"');
      expect(result.code).toContain('cy.contains');
      expect(result.code).not.toContain('@playwright/test');
    });

    it('respects framework option for Testing Library', () => {
      const spec = createSpec({
        trigger: {
          location: 'toolbar',
          label: 'Save',
        },
      });

      const result = generateUITests(spec, { framework: 'testing-library' });

      expect(result.valid).toBe(true);
      expect(result.code).toContain('@testing-library/react');
      expect(result.code).toContain('screen.getByRole');
    });

    it('includes markers by default', () => {
      const spec = createSpec({
        trigger: { label: 'Test' },
      });

      const result = generateUITests(spec);

      expect(result.code).toContain('@speccodex:ui:start');
      expect(result.code).toContain('@speccodex:ui:end');
    });

    it('excludes markers when disabled', () => {
      const spec = createSpec({
        trigger: { label: 'Test' },
      });

      const result = generateUITests(spec, { markers: false });

      expect(result.code).not.toContain('@speccodex:ui:start');
    });

    it('uses custom component name', () => {
      const spec = createSpec({
        trigger: { label: 'Test' },
      });

      const result = generateUITests(spec, { componentName: 'DuplicateEntry' });

      expect(result.code).toContain("describe('DuplicateEntry UI'");
    });

    it('uses base selector when provided', () => {
      const spec = createSpec({
        trigger: {
          location: 'context menu',
          label: 'Edit',
        },
      });

      const result = generateUITests(spec, { baseSelector: '[data-entry]' });

      expect(result.code).toContain('[data-entry]');
    });
  });

  describe('hasUISection', () => {
    it('returns false for spec without UI', () => {
      const spec = createSpec(undefined);
      expect(hasUISection(spec)).toBe(false);
    });

    it('returns false for empty UI object', () => {
      const spec = createSpec({});
      expect(hasUISection(spec)).toBe(false);
    });

    it('returns true for spec with trigger', () => {
      const spec = createSpec({ trigger: { label: 'Test' } });
      expect(hasUISection(spec)).toBe(true);
    });

    it('returns true for spec with interaction', () => {
      const spec = createSpec({ interaction: { optimistic: true } });
      expect(hasUISection(spec)).toBe(true);
    });

    it('returns true for spec with accessibility', () => {
      const spec = createSpec({ accessibility: { role: 'button' } });
      expect(hasUISection(spec)).toBe(true);
    });

    it('returns true for spec with feedback', () => {
      const spec = createSpec({ feedback: { success: 'Done' } });
      expect(hasUISection(spec)).toBe(true);
    });
  });

  describe('complete UI spec', () => {
    it('generates tests for all sections', () => {
      const spec = createSpec({
        trigger: {
          location: 'context menu',
          label: 'Duplicate',
          shortcut: 'Cmd+D',
        },
        interaction: {
          optimistic: true,
          flow: ['Click', 'Wait', 'Done'],
        },
        accessibility: {
          role: 'menuitem',
          label: 'Duplicate entry',
          keyboardNav: [{ key: 'Enter', action: 'activate' }],
        },
        feedback: {
          success: 'Entry duplicated',
          error: 'Failed to duplicate',
        },
      });

      const result = generateUITests(spec);

      expect(result.valid).toBe(true);
      expect(result.categories.trigger).toBeGreaterThan(0);
      expect(result.categories.interaction).toBeGreaterThan(0);
      expect(result.categories.accessibility).toBeGreaterThan(0);
      expect(result.categories.feedback).toBeGreaterThan(0);
      expect(result.testCount).toBeGreaterThan(8);
    });
  });
});
