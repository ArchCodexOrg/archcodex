/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../../../../../src/core/config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../../../src/core/registry/loader.js', () => ({
  loadIntentRegistry: vi.fn().mockResolvedValue({ intents: {} }),
}));

vi.mock('../../../../../src/utils/logger.js', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../../src/cli/commands/intents/list.js', () => ({
  listIntents: vi.fn(),
}));

vi.mock('../../../../../src/cli/commands/intents/show.js', () => ({
  showIntent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../../src/cli/commands/intents/usage.js', () => ({
  showUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../../src/cli/commands/intents/validate.js', () => ({
  validateIntents: vi.fn().mockResolvedValue(undefined),
}));

import { createIntentsCommand } from '../../../../../src/cli/commands/intents/index.js';

describe('createIntentsCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a command named intents', () => {
    const cmd = createIntentsCommand();
    expect(cmd.name()).toBe('intents');
  });

  it('should have expected options', () => {
    const cmd = createIntentsCommand();
    const optionNames = cmd.options.map((o) => o.long);
    expect(optionNames).toContain('--list');
    expect(optionNames).toContain('--show');
    expect(optionNames).toContain('--usage');
    expect(optionNames).toContain('--validate');
    expect(optionNames).toContain('--json');
  });
});
