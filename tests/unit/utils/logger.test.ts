/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for logger utility.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, logger } from '../../../src/utils/logger.js';

describe('Logger', () => {
  const consoleSpy = {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Reset singleton state
    logger.setLevel('info');
    logger.setPrefix('');
  });

  describe('log levels', () => {
    it('should log debug when level is debug', () => {
      const log = new Logger();
      log.setLevel('debug');

      log.debug('test message');

      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it('should not log debug when level is info', () => {
      const log = new Logger();
      log.setLevel('info');

      log.debug('test message');

      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should log info when level is info', () => {
      const log = new Logger();
      log.setLevel('info');

      log.info('test message');

      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it('should not log info when level is warn', () => {
      const log = new Logger();
      log.setLevel('warn');

      log.info('test message');

      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should log warn when level is warn', () => {
      const log = new Logger();
      log.setLevel('warn');

      log.warn('test message');

      expect(consoleSpy.warn).toHaveBeenCalled();
    });

    it('should not log warn when level is error', () => {
      const log = new Logger();
      log.setLevel('error');

      log.warn('test message');

      expect(consoleSpy.warn).not.toHaveBeenCalled();
    });

    it('should log error when level is error', () => {
      const log = new Logger();
      log.setLevel('error');

      log.error('test message');

      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should not log anything when level is silent', () => {
      const log = new Logger();
      log.setLevel('silent');

      log.debug('debug');
      log.info('info');
      log.warn('warn');
      log.error('error');

      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).not.toHaveBeenCalled();
    });
  });

  describe('prefix', () => {
    it('should include prefix in formatted message', () => {
      const log = new Logger();
      log.setLevel('info');
      log.setPrefix('TestPrefix');

      log.info('test message');

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('TestPrefix')
      );
    });

    it('should not add brackets when no prefix', () => {
      const log = new Logger();
      log.setLevel('info');

      log.info('test message');

      expect(consoleSpy.log).toHaveBeenCalled();
    });
  });

  describe('debug', () => {
    it('should log data object when provided', () => {
      const log = new Logger();
      log.setLevel('debug');

      log.debug('test', { key: 'value' });

      expect(consoleSpy.log).toHaveBeenCalledTimes(2);
    });
  });

  describe('info', () => {
    it('should log data object when provided', () => {
      const log = new Logger();
      log.setLevel('info');

      log.info('test', { key: 'value' });

      expect(consoleSpy.log).toHaveBeenCalledTimes(2);
    });
  });

  describe('warn', () => {
    it('should log data object when provided', () => {
      const log = new Logger();
      log.setLevel('warn');

      log.warn('test', { key: 'value' });

      expect(consoleSpy.warn).toHaveBeenCalledTimes(2);
    });
  });

  describe('error', () => {
    it('should log Error object with stack', () => {
      const log = new Logger();
      log.setLevel('error');
      const error = new Error('test error');

      log.error('test', error);

      expect(consoleSpy.error).toHaveBeenCalledTimes(2);
    });

    it('should log data object when not Error', () => {
      const log = new Logger();
      log.setLevel('error');

      log.error('test', { details: 'something' });

      expect(consoleSpy.error).toHaveBeenCalledTimes(2);
    });
  });

  describe('success', () => {
    it('should log success message with checkmark', () => {
      const log = new Logger();
      log.setLevel('info');

      log.success('done');

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('✓')
      );
    });

    it('should not log when level is silent', () => {
      const log = new Logger();
      log.setLevel('silent');

      log.success('done');

      expect(consoleSpy.log).not.toHaveBeenCalled();
    });
  });

  describe('fail', () => {
    it('should log failure message with cross', () => {
      const log = new Logger();
      log.setLevel('info');

      log.fail('failed');

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('✗')
      );
    });

    it('should not log when level is silent', () => {
      const log = new Logger();
      log.setLevel('silent');

      log.fail('failed');

      expect(consoleSpy.log).not.toHaveBeenCalled();
    });
  });

  describe('child', () => {
    it('should create child logger with prefix', () => {
      const log = new Logger();
      log.setLevel('info');
      log.setPrefix('Parent');

      const child = log.child('Child');
      child.info('test');

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Parent:Child')
      );
    });

    it('should inherit parent log level', () => {
      const log = new Logger();
      log.setLevel('error');

      const child = log.child('Child');
      child.info('test');

      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should handle child without parent prefix', () => {
      const log = new Logger();
      log.setLevel('info');

      const child = log.child('Child');
      child.info('test');

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Child')
      );
    });
  });

  describe('singleton', () => {
    it('should export singleton logger instance', () => {
      expect(logger).toBeInstanceOf(Logger);
    });
  });
});
