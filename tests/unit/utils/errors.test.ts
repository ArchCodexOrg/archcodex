/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for error classes and codes.
 */
import { describe, it, expect } from 'vitest';
import {
  ArchCodexError,
  ConfigError,
  RegistryError,
  ValidationError,
  OverrideError,
  SystemError,
  SecurityError,
  ErrorCodes,
} from '../../../src/utils/errors.js';

describe('ArchCodexError', () => {
  it('should create error with code and message', () => {
    const error = new ArchCodexError('E001', 'Test error message');

    expect(error.code).toBe('E001');
    expect(error.message).toBe('Test error message');
    expect(error.name).toBe('ArchCodexError');
  });

  it('should include optional details', () => {
    const details = { file: 'test.ts', line: 10 };
    const error = new ArchCodexError('E001', 'Test error', details);

    expect(error.details).toEqual(details);
  });

  it('should be instance of Error', () => {
    const error = new ArchCodexError('E001', 'Test');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ArchCodexError);
  });

  it('should have stack trace', () => {
    const error = new ArchCodexError('E001', 'Test');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('ArchCodexError');
  });

  describe('toJSON', () => {
    it('should serialize error to JSON', () => {
      const error = new ArchCodexError('E001', 'Test error', { key: 'value' });
      const json = error.toJSON();

      expect(json.name).toBe('ArchCodexError');
      expect(json.code).toBe('E001');
      expect(json.message).toBe('Test error');
      expect(json.details).toEqual({ key: 'value' });
    });

    it('should handle undefined details', () => {
      const error = new ArchCodexError('E001', 'Test');
      const json = error.toJSON();

      expect(json.details).toBeUndefined();
    });
  });
});

describe('ConfigError', () => {
  it('should create error with correct name', () => {
    const error = new ConfigError('S001', 'Config error');

    expect(error.name).toBe('ConfigError');
    expect(error.code).toBe('S001');
    expect(error).toBeInstanceOf(ArchCodexError);
  });

  it('should include details', () => {
    const error = new ConfigError('S001', 'Config error', { path: '.arch/config.yaml' });

    expect(error.details).toEqual({ path: '.arch/config.yaml' });
  });
});

describe('RegistryError', () => {
  it('should create error with correct name', () => {
    const error = new RegistryError('S005', 'Registry error');

    expect(error.name).toBe('RegistryError');
    expect(error.code).toBe('S005');
    expect(error).toBeInstanceOf(ArchCodexError);
  });

  it('should include details', () => {
    const error = new RegistryError('S005', 'Invalid registry', { archId: 'test.arch' });

    expect(error.details).toEqual({ archId: 'test.arch' });
  });
});

describe('ValidationError', () => {
  it('should create error with correct name', () => {
    const error = new ValidationError('E003', 'Forbidden import');

    expect(error.name).toBe('ValidationError');
    expect(error.code).toBe('E003');
    expect(error).toBeInstanceOf(ArchCodexError);
  });

  it('should include details', () => {
    const error = new ValidationError('E003', 'Forbidden import', { module: 'axios' });

    expect(error.details).toEqual({ module: 'axios' });
  });
});

describe('OverrideError', () => {
  it('should create error with correct name', () => {
    const error = new OverrideError('O002', 'Missing reason');

    expect(error.name).toBe('OverrideError');
    expect(error.code).toBe('O002');
    expect(error).toBeInstanceOf(ArchCodexError);
  });

  it('should include details', () => {
    const error = new OverrideError('O003', 'Override expired', { expiry: '2024-01-01' });

    expect(error.details).toEqual({ expiry: '2024-01-01' });
  });
});

describe('SystemError', () => {
  it('should create error with correct name', () => {
    const error = new SystemError('S001', 'Parse error');

    expect(error.name).toBe('SystemError');
    expect(error.code).toBe('S001');
    expect(error).toBeInstanceOf(ArchCodexError);
  });

  it('should include details', () => {
    const error = new SystemError('S001', 'Parse error', { file: 'test.yaml' });

    expect(error.details).toEqual({ file: 'test.yaml' });
  });
});

describe('SecurityError', () => {
  it('should create error with correct name', () => {
    const error = new SecurityError('SEC001', 'Path traversal');

    expect(error.name).toBe('SecurityError');
    expect(error.code).toBe('SEC001');
    expect(error).toBeInstanceOf(ArchCodexError);
  });

  it('should include details', () => {
    const error = new SecurityError('SEC001', 'Path traversal', { path: '../../../etc/passwd' });

    expect(error.details).toEqual({ path: '../../../etc/passwd' });
  });
});

describe('ErrorCodes', () => {
  describe('validation errors', () => {
    it('should have E001 for MUST_EXTEND', () => {
      expect(ErrorCodes.MUST_EXTEND).toBe('E001');
    });

    it('should have E003 for FORBID_IMPORT', () => {
      expect(ErrorCodes.FORBID_IMPORT).toBe('E003');
    });

    it('should have E010 for MAX_FILE_LINES', () => {
      expect(ErrorCodes.MAX_FILE_LINES).toBe('E010');
    });

    it('should have E021 for FORBID_PATTERN', () => {
      expect(ErrorCodes.FORBID_PATTERN).toBe('E021');
    });
  });

  describe('intent errors', () => {
    it('should have I001 for UNDEFINED_INTENT', () => {
      expect(ErrorCodes.UNDEFINED_INTENT).toBe('I001');
    });

    it('should have I002 for INTENT_PATTERN_VIOLATION', () => {
      expect(ErrorCodes.INTENT_PATTERN_VIOLATION).toBe('I002');
    });
  });

  describe('override errors', () => {
    it('should have O001 for OVERRIDE_INVALID_SYNTAX', () => {
      expect(ErrorCodes.OVERRIDE_INVALID_SYNTAX).toBe('O001');
    });

    it('should have O003 for OVERRIDE_EXPIRED', () => {
      expect(ErrorCodes.OVERRIDE_EXPIRED).toBe('O003');
    });
  });

  describe('system errors', () => {
    it('should have S001 for PARSE_ERROR', () => {
      expect(ErrorCodes.PARSE_ERROR).toBe('S001');
    });

    it('should have S002 for UNKNOWN_ARCH', () => {
      expect(ErrorCodes.UNKNOWN_ARCH).toBe('S002');
    });

    it('should have S005 for INVALID_REGISTRY', () => {
      expect(ErrorCodes.INVALID_REGISTRY).toBe('S005');
    });
  });

  describe('security errors', () => {
    it('should have SEC001 for PATH_TRAVERSAL', () => {
      expect(ErrorCodes.PATH_TRAVERSAL).toBe('SEC001');
    });

    it('should have SEC002 for SANDBOX_VIOLATION', () => {
      expect(ErrorCodes.SANDBOX_VIOLATION).toBe('SEC002');
    });
  });
});
