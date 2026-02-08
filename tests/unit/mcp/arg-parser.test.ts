/**
 * @arch archcodex.test.unit
 *
 * Tests for the MCP argument parser - type-safe extraction of arguments
 * from the Record<string, unknown> provided by MCP tool calls.
 */
import { describe, it, expect } from 'vitest';
import {
  getString,
  getStringRequired,
  getStringWithFallback,
  getBoolean,
  getNumber,
  getStringArray,
  getArray,
  getRaw,
  hasArg,
} from '../../../src/mcp/arg-parser.js';

// ---------------------------------------------------------------------------
// getString
// ---------------------------------------------------------------------------
describe('getString', () => {
  it('should return a string value when present', () => {
    expect(getString({ name: 'hello' }, 'name')).toBe('hello');
  });

  it('should return undefined for missing key', () => {
    expect(getString({ other: 'value' }, 'name')).toBeUndefined();
  });

  it('should return undefined for undefined args', () => {
    expect(getString(undefined, 'name')).toBeUndefined();
  });

  it('should return undefined for null value', () => {
    expect(getString({ name: null }, 'name')).toBeUndefined();
  });

  it('should return undefined for undefined value', () => {
    expect(getString({ name: undefined }, 'name')).toBeUndefined();
  });

  it('should return undefined for non-string value (number)', () => {
    expect(getString({ name: 42 }, 'name')).toBeUndefined();
  });

  it('should return undefined for non-string value (boolean)', () => {
    expect(getString({ name: true }, 'name')).toBeUndefined();
  });

  it('should return undefined for non-string value (object)', () => {
    expect(getString({ name: { path: '/file.ts' } }, 'name')).toBeUndefined();
  });

  it('should return undefined for non-string value (array)', () => {
    expect(getString({ name: ['a', 'b'] }, 'name')).toBeUndefined();
  });

  it('should return empty string when value is empty string', () => {
    expect(getString({ name: '' }, 'name')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// getStringRequired
// ---------------------------------------------------------------------------
describe('getStringRequired', () => {
  it('should return the string value when present', () => {
    expect(getStringRequired({ id: 'abc' }, 'id')).toBe('abc');
  });

  it('should throw for missing key', () => {
    expect(() => getStringRequired({}, 'id')).toThrow('Required string argument "id"');
  });

  it('should throw for undefined args', () => {
    expect(() => getStringRequired(undefined, 'id')).toThrow('Required string argument "id"');
  });

  it('should throw for non-string value', () => {
    expect(() => getStringRequired({ id: 123 }, 'id')).toThrow('Required string argument "id"');
  });

  it('should throw for null value', () => {
    expect(() => getStringRequired({ id: null }, 'id')).toThrow('Required string argument "id"');
  });
});

// ---------------------------------------------------------------------------
// getStringWithFallback
// ---------------------------------------------------------------------------
describe('getStringWithFallback', () => {
  it('should return primary key value when present', () => {
    expect(getStringWithFallback({ entity: 'User', name: 'Order' }, 'entity', 'name')).toBe('User');
  });

  it('should return fallback key value when primary is missing', () => {
    expect(getStringWithFallback({ name: 'Order' }, 'entity', 'name')).toBe('Order');
  });

  it('should return undefined when neither key is present', () => {
    expect(getStringWithFallback({ other: 'value' }, 'entity', 'name')).toBeUndefined();
  });

  it('should return undefined for undefined args', () => {
    expect(getStringWithFallback(undefined, 'entity', 'name')).toBeUndefined();
  });

  it('should skip non-string primary and use fallback', () => {
    expect(getStringWithFallback({ entity: 42, name: 'Order' }, 'entity', 'name')).toBe('Order');
  });
});

// ---------------------------------------------------------------------------
// getBoolean
// ---------------------------------------------------------------------------
describe('getBoolean', () => {
  it('should return true when value is true', () => {
    expect(getBoolean({ flag: true }, 'flag')).toBe(true);
  });

  it('should return false when value is false', () => {
    expect(getBoolean({ flag: false }, 'flag')).toBe(false);
  });

  it('should return undefined for missing key (no default)', () => {
    expect(getBoolean({}, 'flag')).toBeUndefined();
  });

  it('should return undefined for undefined args (no default)', () => {
    expect(getBoolean(undefined, 'flag')).toBeUndefined();
  });

  it('should return undefined for null value (no default)', () => {
    expect(getBoolean({ flag: null }, 'flag')).toBeUndefined();
  });

  it('should return default value for missing key', () => {
    expect(getBoolean({}, 'flag', false)).toBe(false);
    expect(getBoolean({}, 'flag', true)).toBe(true);
  });

  it('should return default value for null value', () => {
    expect(getBoolean({ flag: null }, 'flag', true)).toBe(true);
  });

  it('should return default value for non-boolean value', () => {
    expect(getBoolean({ flag: 'yes' }, 'flag', false)).toBe(false);
  });

  it('should return actual boolean over default', () => {
    expect(getBoolean({ flag: true }, 'flag', false)).toBe(true);
    expect(getBoolean({ flag: false }, 'flag', true)).toBe(false);
  });

  it('should return undefined for non-boolean value (no default)', () => {
    expect(getBoolean({ flag: 'true' }, 'flag')).toBeUndefined();
    expect(getBoolean({ flag: 1 }, 'flag')).toBeUndefined();
    expect(getBoolean({ flag: 0 }, 'flag')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getNumber
// ---------------------------------------------------------------------------
describe('getNumber', () => {
  it('should return a number value when present', () => {
    expect(getNumber({ limit: 10 }, 'limit')).toBe(10);
  });

  it('should return 0 when value is 0', () => {
    expect(getNumber({ limit: 0 }, 'limit')).toBe(0);
  });

  it('should return negative numbers', () => {
    expect(getNumber({ offset: -5 }, 'offset')).toBe(-5);
  });

  it('should return float numbers', () => {
    expect(getNumber({ threshold: 0.85 }, 'threshold')).toBe(0.85);
  });

  it('should return undefined for missing key', () => {
    expect(getNumber({}, 'limit')).toBeUndefined();
  });

  it('should return undefined for undefined args', () => {
    expect(getNumber(undefined, 'limit')).toBeUndefined();
  });

  it('should return undefined for null value', () => {
    expect(getNumber({ limit: null }, 'limit')).toBeUndefined();
  });

  it('should return undefined for NaN', () => {
    expect(getNumber({ limit: NaN }, 'limit')).toBeUndefined();
  });

  it('should return undefined for non-number value (string)', () => {
    expect(getNumber({ limit: '10' }, 'limit')).toBeUndefined();
  });

  it('should return undefined for non-number value (boolean)', () => {
    expect(getNumber({ limit: true }, 'limit')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getStringArray
// ---------------------------------------------------------------------------
describe('getStringArray', () => {
  it('should return string array when present', () => {
    expect(getStringArray({ tags: ['a', 'b', 'c'] }, 'tags')).toEqual(['a', 'b', 'c']);
  });

  it('should return empty array for empty array value', () => {
    expect(getStringArray({ tags: [] }, 'tags')).toEqual([]);
  });

  it('should filter out non-string elements', () => {
    expect(getStringArray({ tags: ['a', 42, 'b', true, 'c'] }, 'tags')).toEqual(['a', 'b', 'c']);
  });

  it('should return undefined for missing key', () => {
    expect(getStringArray({}, 'tags')).toBeUndefined();
  });

  it('should return undefined for undefined args', () => {
    expect(getStringArray(undefined, 'tags')).toBeUndefined();
  });

  it('should return undefined for null value', () => {
    expect(getStringArray({ tags: null }, 'tags')).toBeUndefined();
  });

  it('should return undefined for non-array value (string)', () => {
    expect(getStringArray({ tags: 'single' }, 'tags')).toBeUndefined();
  });

  it('should return undefined for non-array value (number)', () => {
    expect(getStringArray({ tags: 42 }, 'tags')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getArray
// ---------------------------------------------------------------------------
describe('getArray', () => {
  it('should return typed array when present', () => {
    const changes = [{ path: 'a.ts', action: 'create' }];
    expect(getArray<{ path: string; action: string }>({ changes }, 'changes')).toEqual(changes);
  });

  it('should return empty array for empty array value', () => {
    expect(getArray<string>({ items: [] }, 'items')).toEqual([]);
  });

  it('should return undefined for missing key', () => {
    expect(getArray<string>({}, 'items')).toBeUndefined();
  });

  it('should return undefined for undefined args', () => {
    expect(getArray<string>(undefined, 'items')).toBeUndefined();
  });

  it('should return undefined for null value', () => {
    expect(getArray<string>({ items: null }, 'items')).toBeUndefined();
  });

  it('should return undefined for non-array value', () => {
    expect(getArray<string>({ items: 'not-array' }, 'items')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getRaw
// ---------------------------------------------------------------------------
describe('getRaw', () => {
  it('should return string value as-is', () => {
    expect(getRaw({ file: '/path.ts' }, 'file')).toBe('/path.ts');
  });

  it('should return object value as-is', () => {
    const obj = { path: '/file.ts', format: 'ai' };
    expect(getRaw({ file: obj }, 'file')).toBe(obj);
  });

  it('should return array value as-is', () => {
    const arr = ['/a.ts', '/b.ts'];
    expect(getRaw({ files: arr }, 'files')).toBe(arr);
  });

  it('should return undefined for missing key', () => {
    expect(getRaw({}, 'file')).toBeUndefined();
  });

  it('should return undefined for undefined args', () => {
    expect(getRaw(undefined, 'file')).toBeUndefined();
  });

  it('should return null when value is null', () => {
    expect(getRaw({ file: null }, 'file')).toBeNull();
  });

  it('should return boolean values', () => {
    expect(getRaw({ flag: true }, 'flag')).toBe(true);
    expect(getRaw({ flag: false }, 'flag')).toBe(false);
  });

  it('should return number values', () => {
    expect(getRaw({ count: 42 }, 'count')).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// hasArg
// ---------------------------------------------------------------------------
describe('hasArg', () => {
  it('should return true when key has a string value', () => {
    expect(hasArg({ name: 'hello' }, 'name')).toBe(true);
  });

  it('should return true when key has a boolean value', () => {
    expect(hasArg({ flag: false }, 'flag')).toBe(true);
  });

  it('should return true when key has a number value (including 0)', () => {
    expect(hasArg({ count: 0 }, 'count')).toBe(true);
  });

  it('should return true when key has an empty string value', () => {
    expect(hasArg({ name: '' }, 'name')).toBe(true);
  });

  it('should return true when key has an array value', () => {
    expect(hasArg({ items: [] }, 'items')).toBe(true);
  });

  it('should return true when key has an object value', () => {
    expect(hasArg({ data: {} }, 'data')).toBe(true);
  });

  it('should return false for missing key', () => {
    expect(hasArg({ other: 'value' }, 'name')).toBe(false);
  });

  it('should return false for undefined args', () => {
    expect(hasArg(undefined, 'name')).toBe(false);
  });

  it('should return false for null value', () => {
    expect(hasArg({ name: null }, 'name')).toBe(false);
  });

  it('should return false for undefined value', () => {
    expect(hasArg({ name: undefined }, 'name')).toBe(false);
  });
});
