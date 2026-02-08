/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for intents list subcommand.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IntentRegistry, IntentDefinition } from '../../../../../src/core/registry/schema.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: Object.assign((s: string) => s, {
      cyan: (s: string) => s,
    }),
    dim: (s: string) => s,
    white: (s: string) => s,
    yellow: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
  },
}));

// Mock registry loader functions
vi.mock('../../../../../src/core/registry/loader.js', () => ({
  getIntentsByCategory: vi.fn(),
  listIntentNames: vi.fn(),
}));

import { listIntents } from '../../../../../src/cli/commands/intents/list.js';
import { getIntentsByCategory, listIntentNames } from '../../../../../src/core/registry/loader.js';

describe('listIntents', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  function createMockRegistry(intents: Record<string, Partial<IntentDefinition>>): IntentRegistry {
    const fullIntents: Record<string, IntentDefinition> = {};
    for (const [name, def] of Object.entries(intents)) {
      fullIntents[name] = {
        description: def.description || 'Test intent',
        category: def.category || 'general',
        requires: def.requires,
        forbids: def.forbids,
        conflicts_with: def.conflicts_with,
      };
    }
    return { intents: fullIntents };
  }

  describe('JSON output', () => {
    it('should output JSON when json flag is true', () => {
      const registry = createMockRegistry({
        'admin-only': { description: 'Admin access', category: 'access' },
        'cli-output': { description: 'CLI output', category: 'output' },
      });

      vi.mocked(getIntentsByCategory).mockReturnValue(
        new Map([
          ['access', ['admin-only']],
          ['output', ['cli-output']],
        ])
      );
      vi.mocked(listIntentNames).mockReturnValue(['admin-only', 'cli-output']);

      listIntents(registry, true);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.total).toBe(2);
      expect(output.byCategory).toEqual({
        access: ['admin-only'],
        output: ['cli-output'],
      });
      expect(output.intents).toBeDefined();
    });

    it('should include all intent data in JSON output', () => {
      const registry = createMockRegistry({
        'test-intent': {
          description: 'Test description',
          category: 'test',
          requires: ['other-intent'],
          forbids: ['bad-intent'],
          conflicts_with: ['conflict-intent'],
        },
      });

      vi.mocked(getIntentsByCategory).mockReturnValue(new Map([['test', ['test-intent']]]));
      vi.mocked(listIntentNames).mockReturnValue(['test-intent']);

      listIntents(registry, true);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.intents['test-intent'].requires).toEqual(['other-intent']);
      expect(output.intents['test-intent'].forbids).toEqual(['bad-intent']);
      expect(output.intents['test-intent'].conflicts_with).toEqual(['conflict-intent']);
    });
  });

  describe('text output', () => {
    it('should show header', () => {
      const registry = createMockRegistry({
        'admin-only': { description: 'Admin access', category: 'access' },
      });

      vi.mocked(getIntentsByCategory).mockReturnValue(new Map([['access', ['admin-only']]]));
      vi.mocked(listIntentNames).mockReturnValue(['admin-only']);

      listIntents(registry, false);

      expect(consoleLogSpy).toHaveBeenCalled();
      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('DEFINED INTENTS'))).toBe(true);
    });

    it('should show message when no intents defined', () => {
      const registry = createMockRegistry({});

      vi.mocked(getIntentsByCategory).mockReturnValue(new Map());
      vi.mocked(listIntentNames).mockReturnValue([]);

      listIntents(registry, false);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('No intents defined'))).toBe(true);
    });

    it('should list intents by category', () => {
      const registry = createMockRegistry({
        'admin-only': { description: 'Admin access', category: 'access' },
        'public-endpoint': { description: 'Public endpoint', category: 'access' },
        'cli-output': { description: 'CLI output', category: 'output' },
      });

      vi.mocked(getIntentsByCategory).mockReturnValue(
        new Map([
          ['access', ['admin-only', 'public-endpoint']],
          ['output', ['cli-output']],
        ])
      );
      vi.mocked(listIntentNames).mockReturnValue(['admin-only', 'public-endpoint', 'cli-output']);

      listIntents(registry, false);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('access'))).toBe(true);
      expect(calls.some((c) => c?.includes('output'))).toBe(true);
    });

    it('should show [req] badge for intents with requires', () => {
      const registry = createMockRegistry({
        'test-intent': {
          description: 'Test',
          category: 'test',
          requires: ['other'],
        },
      });

      vi.mocked(getIntentsByCategory).mockReturnValue(new Map([['test', ['test-intent']]]));
      vi.mocked(listIntentNames).mockReturnValue(['test-intent']);

      listIntents(registry, false);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('[req]'))).toBe(true);
    });

    it('should show [forb] badge for intents with forbids', () => {
      const registry = createMockRegistry({
        'test-intent': {
          description: 'Test',
          category: 'test',
          forbids: ['bad'],
        },
      });

      vi.mocked(getIntentsByCategory).mockReturnValue(new Map([['test', ['test-intent']]]));
      vi.mocked(listIntentNames).mockReturnValue(['test-intent']);

      listIntents(registry, false);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('[forb]'))).toBe(true);
    });

    it('should show [conf] badge for intents with conflicts_with', () => {
      const registry = createMockRegistry({
        'test-intent': {
          description: 'Test',
          category: 'test',
          conflicts_with: ['conflict'],
        },
      });

      vi.mocked(getIntentsByCategory).mockReturnValue(new Map([['test', ['test-intent']]]));
      vi.mocked(listIntentNames).mockReturnValue(['test-intent']);

      listIntents(registry, false);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('[conf]'))).toBe(true);
    });

    it('should show total count', () => {
      const registry = createMockRegistry({
        'intent1': { description: 'Test 1', category: 'test' },
        'intent2': { description: 'Test 2', category: 'test' },
        'intent3': { description: 'Test 3', category: 'other' },
      });

      vi.mocked(getIntentsByCategory).mockReturnValue(
        new Map([
          ['test', ['intent1', 'intent2']],
          ['other', ['intent3']],
        ])
      );
      vi.mocked(listIntentNames).mockReturnValue(['intent1', 'intent2', 'intent3']);

      listIntents(registry, false);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Total: 3 intents'))).toBe(true);
    });

    it('should sort categories alphabetically', () => {
      const registry = createMockRegistry({
        'zebra-intent': { description: 'Zebra', category: 'zebra' },
        'alpha-intent': { description: 'Alpha', category: 'alpha' },
        'middle-intent': { description: 'Middle', category: 'middle' },
      });

      vi.mocked(getIntentsByCategory).mockReturnValue(
        new Map([
          ['zebra', ['zebra-intent']],
          ['alpha', ['alpha-intent']],
          ['middle', ['middle-intent']],
        ])
      );
      vi.mocked(listIntentNames).mockReturnValue(['zebra-intent', 'alpha-intent', 'middle-intent']);

      listIntents(registry, false);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]).filter(Boolean);
      const categoryIndices = {
        alpha: calls.findIndex((c) => c.includes('alpha')),
        middle: calls.findIndex((c) => c.includes('middle')),
        zebra: calls.findIndex((c) => c.includes('zebra')),
      };

      expect(categoryIndices.alpha).toBeLessThan(categoryIndices.middle);
      expect(categoryIndices.middle).toBeLessThan(categoryIndices.zebra);
    });
  });

  describe('default json parameter', () => {
    it('should use text output when json is undefined', () => {
      const registry = createMockRegistry({
        'test': { description: 'Test', category: 'test' },
      });

      vi.mocked(getIntentsByCategory).mockReturnValue(new Map([['test', ['test']]]));
      vi.mocked(listIntentNames).mockReturnValue(['test']);

      listIntents(registry);

      // Text output has multiple console.log calls, JSON has one
      expect(consoleLogSpy.mock.calls.length).toBeGreaterThan(1);
    });
  });
});
