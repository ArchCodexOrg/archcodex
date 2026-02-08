/**
 * @arch archcodex.test.unit
 *
 * Tests for UI test generator.
 */
import { describe, it, expect } from 'vitest';
import {
  hasUISection,
} from '../../../../../src/core/spec/generators/ui.js';
import type { ResolvedSpec, UI } from '../../../../../src/core/spec/schema.js';

describe('UI Test Generator', () => {
  const createSpec = (ui?: UI): ResolvedSpec => ({
    specId: 'spec.test.ui',
    inheritanceChain: ['spec.test.ui'],
    appliedMixins: [],
    node: {
      intent: 'Test UI interaction',
      implementation: 'src/components/TestComponent.tsx',
      ui,
    },
  });

  describe('hasUISection', () => {
    it('returns true for spec with UI section', () => {
      const spec = createSpec({
        trigger: { action: 'click', element: '.button' },
      });
      expect(hasUISection(spec)).toBe(true);
    });

    it('returns false for spec without UI section', () => {
      const spec = createSpec();
      expect(hasUISection(spec)).toBe(false);
    });
  });
});
