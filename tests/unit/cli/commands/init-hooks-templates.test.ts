/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for init-hooks template exports.
 */
import { describe, it, expect } from 'vitest';
import {
  SESSION_START_HOOK,
  PRE_READ_HOOK,
  PRE_WRITE_HOOK,
  REMINDER_HOOK,
  PLAN_MODE_HOOK,
  POST_WRITE_HOOK,
  HOOKS_SETTINGS,
  HOOK_FILES,
} from '../../../../src/cli/commands/init-hooks-templates.js';

describe('init-hooks-templates', () => {
  it('should export SESSION_START_HOOK as a non-empty string', () => {
    expect(typeof SESSION_START_HOOK).toBe('string');
    expect(SESSION_START_HOOK.length).toBeGreaterThan(0);
  });

  it('should export PRE_READ_HOOK as a non-empty string', () => {
    expect(typeof PRE_READ_HOOK).toBe('string');
    expect(PRE_READ_HOOK.length).toBeGreaterThan(0);
  });

  it('should export PRE_WRITE_HOOK as a non-empty string', () => {
    expect(typeof PRE_WRITE_HOOK).toBe('string');
    expect(PRE_WRITE_HOOK.length).toBeGreaterThan(0);
  });

  it('should export REMINDER_HOOK as a non-empty string', () => {
    expect(typeof REMINDER_HOOK).toBe('string');
    expect(REMINDER_HOOK.length).toBeGreaterThan(0);
  });

  it('should export PLAN_MODE_HOOK as a non-empty string', () => {
    expect(typeof PLAN_MODE_HOOK).toBe('string');
    expect(PLAN_MODE_HOOK.length).toBeGreaterThan(0);
  });

  it('should export POST_WRITE_HOOK as a non-empty string', () => {
    expect(typeof POST_WRITE_HOOK).toBe('string');
    expect(POST_WRITE_HOOK.length).toBeGreaterThan(0);
  });

  it('should export HOOKS_SETTINGS as an object', () => {
    expect(typeof HOOKS_SETTINGS).toBe('object');
    expect(HOOKS_SETTINGS).not.toBeNull();
  });

  it('should export HOOK_FILES as a record of filename to template content', () => {
    expect(typeof HOOK_FILES).toBe('object');
    const keys = Object.keys(HOOK_FILES);
    expect(keys.length).toBeGreaterThan(0);
    for (const value of Object.values(HOOK_FILES)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('hook templates that run archcodex should contain {{CMD}} placeholder', () => {
    // Only hooks that actually execute archcodex commands need {{CMD}}
    const hooksThatNeedCmd = [
      'archcodex-session-start.sh',
      'archcodex-pre-read.sh',
      'archcodex-pre-write.sh',
      'post-write-archcodex.sh'
    ];

    for (const [filename, content] of Object.entries(HOOK_FILES)) {
      if (hooksThatNeedCmd.includes(filename)) {
        expect(content).toContain('{{CMD}}');
      } else {
        // Reminder and plan-mode hooks only output static text
        expect(content).not.toContain('{{CMD}}');
      }
    }
  });

  it('hook templates should start with shebang', () => {
    for (const content of Object.values(HOOK_FILES)) {
      expect(content.startsWith('#!/')).toBe(true);
    }
  });

  it('HOOK_FILES should have six entries', () => {
    const keys = Object.keys(HOOK_FILES);
    expect(keys).toHaveLength(6);
  });

  it('HOOK_FILES keys should match expected filenames', () => {
    const keys = Object.keys(HOOK_FILES);
    expect(keys).toContain('archcodex-session-start.sh');
    expect(keys).toContain('archcodex-pre-read.sh');
    expect(keys).toContain('archcodex-pre-write.sh');
    expect(keys).toContain('archcodex-reminder.sh');
    expect(keys).toContain('archcodex-plan-mode.sh');
    expect(keys).toContain('post-write-archcodex.sh');
  });

  it('HOOKS_SETTINGS should have SessionStart section', () => {
    expect(HOOKS_SETTINGS).toHaveProperty('SessionStart');
    expect(Array.isArray(HOOKS_SETTINGS.SessionStart)).toBe(true);
  });

  it('HOOKS_SETTINGS should have PreToolUse section', () => {
    expect(HOOKS_SETTINGS).toHaveProperty('PreToolUse');
    expect(Array.isArray(HOOKS_SETTINGS.PreToolUse)).toBe(true);
  });

  it('HOOKS_SETTINGS should have PostToolUse section', () => {
    expect(HOOKS_SETTINGS).toHaveProperty('PostToolUse');
    expect(Array.isArray(HOOKS_SETTINGS.PostToolUse)).toBe(true);
  });

  it('SESSION_START_HOOK should mention archcodex command', () => {
    expect(SESSION_START_HOOK).toContain('archcodex');
  });

  it('PRE_READ_HOOK should check for src/ files', () => {
    expect(PRE_READ_HOOK).toContain('src/');
  });

  it('PRE_WRITE_HOOK should check for @arch tag', () => {
    expect(PRE_WRITE_HOOK).toContain('@arch');
  });

  it('POST_WRITE_HOOK should run archcodex check', () => {
    expect(POST_WRITE_HOOK).toContain('check');
  });

  it('POST_WRITE_HOOK should handle JSON output', () => {
    expect(POST_WRITE_HOOK).toContain('--json');
  });

  it('PLAN_MODE_HOOK should mention plan-context', () => {
    expect(PLAN_MODE_HOOK).toContain('plan-context');
  });

  it('all hook templates should handle exit codes', () => {
    for (const content of Object.values(HOOK_FILES)) {
      expect(content).toContain('exit 0');
    }
  });

  it('PRE_READ_HOOK should skip node_modules', () => {
    expect(PRE_READ_HOOK).toContain('node_modules');
  });

  it('HOOKS_SETTINGS PreToolUse should have matchers', () => {
    const preToolUse = HOOKS_SETTINGS.PreToolUse;
    for (const entry of preToolUse) {
      expect(entry).toHaveProperty('matcher');
      expect(entry).toHaveProperty('hooks');
    }
  });

  it('HOOKS_SETTINGS PostToolUse should target Write and Edit', () => {
    const postToolUse = HOOKS_SETTINGS.PostToolUse;
    expect(postToolUse[0].matcher).toContain('Write');
    expect(postToolUse[0].matcher).toContain('Edit');
  });
});
