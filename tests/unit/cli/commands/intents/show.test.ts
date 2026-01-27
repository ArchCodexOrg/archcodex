/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for intents show subcommand.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IntentRegistry, IntentDefinition } from '../../../../../src/core/registry/schema.js';

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: (s: string) => s,
    dim: (s: string) => s,
    cyan: (s: string) => s,
    red: (s: string) => s,
    green: (s: string) => s,
    yellow: (s: string) => s,
    magenta: (s: string) => s,
  },
}));

// Mock registry loader functions
vi.mock('../../../../../src/core/registry/loader.js', () => ({
  listIntentNames: vi.fn(),
}));

import { showIntent } from '../../../../../src/cli/commands/intents/show.js';
import { listIntentNames } from '../../../../../src/core/registry/loader.js';

describe('showIntent', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
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
        requires_intent: def.requires_intent,
      };
    }
    return { intents: fullIntents };
  }

  describe('intent not found', () => {
    it('should exit with error when intent not found', async () => {
      const registry = createMockRegistry({});
      vi.mocked(listIntentNames).mockReturnValue([]);

      await expect(showIntent(registry, 'unknown')).rejects.toThrow('process.exit called');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should show error message in text mode', async () => {
      const registry = createMockRegistry({});
      vi.mocked(listIntentNames).mockReturnValue([]);

      try {
        await showIntent(registry, 'unknown', false);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes("Intent 'unknown' not found"))).toBe(true);
    });

    it('should show similar suggestions when available', async () => {
      const registry = createMockRegistry({
        'admin-only': { description: 'Admin' },
        'admin-write': { description: 'Admin write' },
      });
      vi.mocked(listIntentNames).mockReturnValue(['admin-only', 'admin-write']);

      try {
        await showIntent(registry, 'admin', false);
      } catch {
        // Expected
      }

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Did you mean'))).toBe(true);
    });

    it('should output JSON error when json flag is true', async () => {
      const registry = createMockRegistry({});
      vi.mocked(listIntentNames).mockReturnValue(['admin-only']);

      try {
        await showIntent(registry, 'unknown', true);
      } catch {
        // Expected
      }

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.error).toBe('Intent not found');
      expect(output.name).toBe('unknown');
    });

    it('should include similar intents in JSON error', async () => {
      const registry = createMockRegistry({
        'admin-only': { description: 'Admin' },
      });
      vi.mocked(listIntentNames).mockReturnValue(['admin-only']);

      try {
        await showIntent(registry, 'admin', true);
      } catch {
        // Expected
      }

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.similar).toContain('admin-only');
    });
  });

  describe('JSON output', () => {
    it('should output JSON when json flag is true', async () => {
      const registry = createMockRegistry({
        'admin-only': {
          description: 'Admin access required',
          category: 'access',
        },
      });

      await showIntent(registry, 'admin-only', true);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.name).toBe('admin-only');
      expect(output.description).toBe('Admin access required');
      expect(output.category).toBe('access');
    });

    it('should include all fields in JSON output', async () => {
      const registry = createMockRegistry({
        'complex-intent': {
          description: 'Complex',
          category: 'complex',
          requires: ['pattern1'],
          forbids: ['pattern2'],
          conflicts_with: ['other-intent'],
          requires_intent: ['prerequisite-intent'],
        },
      });

      await showIntent(registry, 'complex-intent', true);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.requires).toEqual(['pattern1']);
      expect(output.forbids).toEqual(['pattern2']);
      expect(output.conflicts_with).toEqual(['other-intent']);
      expect(output.requires_intent).toEqual(['prerequisite-intent']);
    });
  });

  describe('text output', () => {
    it('should show intent name as header', async () => {
      const registry = createMockRegistry({
        'admin-only': { description: 'Admin access' },
      });

      await showIntent(registry, 'admin-only', false);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('@intent:admin-only'))).toBe(true);
    });

    it('should show description', async () => {
      const registry = createMockRegistry({
        'admin-only': { description: 'Admin access required for this endpoint' },
      });

      await showIntent(registry, 'admin-only', false);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Admin access required for this endpoint'))).toBe(true);
    });

    it('should show category', async () => {
      const registry = createMockRegistry({
        'admin-only': { description: 'Admin', category: 'access-control' },
      });

      await showIntent(registry, 'admin-only', false);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('access-control'))).toBe(true);
    });

    it('should show requires patterns', async () => {
      const registry = createMockRegistry({
        'admin-only': {
          description: 'Admin',
          requires: ['authentication-check', 'authorization-check'],
        },
      });

      await showIntent(registry, 'admin-only', false);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Requires:'))).toBe(true);
      expect(calls.some((c) => c?.includes('authentication-check'))).toBe(true);
      expect(calls.some((c) => c?.includes('authorization-check'))).toBe(true);
    });

    it('should show forbids patterns', async () => {
      const registry = createMockRegistry({
        'admin-only': {
          description: 'Admin',
          forbids: ['public-access', 'anonymous-access'],
        },
      });

      await showIntent(registry, 'admin-only', false);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Forbids:'))).toBe(true);
      expect(calls.some((c) => c?.includes('public-access'))).toBe(true);
    });

    it('should show conflicts_with intents', async () => {
      const registry = createMockRegistry({
        'admin-only': {
          description: 'Admin',
          conflicts_with: ['public-endpoint'],
        },
      });

      await showIntent(registry, 'admin-only', false);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Conflicts with:'))).toBe(true);
      expect(calls.some((c) => c?.includes('@intent:public-endpoint'))).toBe(true);
    });

    it('should show requires_intent', async () => {
      const registry = createMockRegistry({
        'admin-write': {
          description: 'Admin write',
          requires_intent: ['admin-only'],
        },
      });

      await showIntent(registry, 'admin-write', false);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Requires intents:'))).toBe(true);
      expect(calls.some((c) => c?.includes('@intent:admin-only'))).toBe(true);
    });

    it('should not show optional sections when empty', async () => {
      const registry = createMockRegistry({
        'simple-intent': {
          description: 'Simple intent',
          // No requires, forbids, conflicts_with, or requires_intent
        },
      });

      await showIntent(registry, 'simple-intent', false);

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c?.includes('Requires:'))).toBe(false);
      expect(calls.some((c) => c?.includes('Forbids:'))).toBe(false);
      expect(calls.some((c) => c?.includes('Conflicts with:'))).toBe(false);
      expect(calls.some((c) => c?.includes('Requires intents:'))).toBe(false);
    });
  });

  describe('default json parameter', () => {
    it('should use text output when json is undefined', async () => {
      const registry = createMockRegistry({
        'test': { description: 'Test' },
      });

      await showIntent(registry, 'test');

      // Text output has multiple console.log calls, JSON has one
      expect(consoleLogSpy.mock.calls.length).toBeGreaterThan(1);
    });
  });
});
