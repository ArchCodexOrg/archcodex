/**
 * @arch archcodex.test.unit
 *
 * Tests for formatter-entity — entity formatting functions extracted from formatter.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  formatEntityCompact,
  formatEntityFull,
  shortRelType,
} from '../../../../src/core/unified-context/formatter-entity.js';
import type { UnifiedEntityContext } from '../../../../src/core/unified-context/types.js';

function makeEntityContext(overrides: Partial<UnifiedEntityContext> = {}): UnifiedEntityContext {
  return {
    name: 'User',
    fields: [
      { name: 'id', type: 'string', optional: false, isReference: false },
      { name: 'email', type: 'string', optional: false, isReference: false },
      { name: 'age', type: 'number', optional: true, isReference: false },
    ],
    relationships: [],
    behaviors: [],
    operations: [],
    files: { defines: [], implements: [], orchestrates: [] },
    ...overrides,
  };
}

describe('shortRelType', () => {
  it('maps known relationship types to short form', () => {
    expect(shortRelType('has_many')).toBe('1:N');
    expect(shortRelType('belongs_to')).toBe('N:1');
    expect(shortRelType('many_to_many')).toBe('N:N');
    expect(shortRelType('has_one')).toBe('1:1');
  });

  it('returns unknown types unchanged', () => {
    expect(shortRelType('custom_rel')).toBe('custom_rel');
  });
});

describe('formatEntityCompact', () => {
  it('renders entity header and fields', () => {
    const result = formatEntityCompact(makeEntityContext());
    expect(result).toContain('# Entity: User');
    expect(result).toContain('fields: [id, email, age?]');
  });

  it('filters underscore-prefixed fields', () => {
    const ctx = makeEntityContext({
      fields: [
        { name: '_id', type: 'string', optional: false, isReference: false },
        { name: 'name', type: 'string', optional: false, isReference: false },
      ],
    });
    const result = formatEntityCompact(ctx);
    expect(result).toContain('fields: [name]');
    expect(result).not.toContain('_id');
  });

  it('renders relationships in short form', () => {
    const ctx = makeEntityContext({
      relationships: [
        { name: 'posts', type: 'has_many', target: 'Post', field: 'authorId' },
      ],
    });
    const result = formatEntityCompact(ctx);
    expect(result).toContain('1:N Post via authorId');
  });

  it('renders behaviors', () => {
    const ctx = makeEntityContext({
      behaviors: [{ type: 'soft_delete', fields: ['isDeleted'] }],
    });
    const result = formatEntityCompact(ctx);
    expect(result).toContain('behaviors: soft_delete');
  });

  it('renders operations and similar operations', () => {
    const ctx = makeEntityContext({
      operations: ['create', 'update'],
      similarOperations: ['archive'],
    });
    const result = formatEntityCompact(ctx);
    expect(result).toContain('existing: create, update');
    expect(result).toContain('similar: archive');
  });

  it('renders files grouped by role', () => {
    const ctx = makeEntityContext({
      files: {
        defines: [{ path: 'types.ts', archId: 'a.b', role: 'defines', roleReason: '', breaks: 0 }],
        implements: [{ path: 'service.ts', archId: null, role: 'implements', roleReason: '', breaks: 2 }],
        orchestrates: [],
      },
    });
    const result = formatEntityCompact(ctx);
    expect(result).toContain('DEFINES:');
    expect(result).toContain('types.ts [a.b]');
    expect(result).toContain('IMPLEMENTS:');
    expect(result).toContain('service.ts [no @arch]');
  });

  it('shows message when no files found', () => {
    const result = formatEntityCompact(makeEntityContext());
    expect(result).toContain('(no files found referencing this entity)');
  });
});

describe('formatEntityFull', () => {
  it('renders full entity context in text mode', () => {
    const ctx = makeEntityContext({
      relationships: [
        { name: 'posts', type: 'has_many', target: 'Post' },
      ],
      behaviors: [{ type: 'timestamps', fields: ['createdAt', 'updatedAt'] }],
      operations: ['create'],
    });
    const result = formatEntityFull(ctx);
    expect(result).toContain('Entity: User');
    expect(result).toContain('─ Fields ─');
    expect(result).toContain('id: string');
    expect(result).toContain('age: number (optional)');
    expect(result).toContain('─ Relationships ─');
    expect(result).toContain('posts: has_many → Post');
    expect(result).toContain('─ Detected Behaviors ─');
    expect(result).toContain('timestamps: createdAt, updatedAt field(s)');
    expect(result).toContain('Existing: create');
  });

  it('renders markdown mode with headers and bold', () => {
    const ctx = makeEntityContext({
      fields: [
        { name: 'id', type: 'Id', optional: false, isReference: true, referenceTarget: 'users' },
      ],
    });
    const result = formatEntityFull(ctx, true);
    expect(result).toContain('# Entity: User');
    expect(result).toContain('## Fields');
    expect(result).toContain('- **id**: Id → users');
  });

  it('renders files with break counts', () => {
    const ctx = makeEntityContext({
      files: {
        defines: [],
        implements: [{ path: 'svc.ts', archId: 'x.y', role: 'implements', roleReason: '', breaks: 3 }],
        orchestrates: [],
      },
    });
    const result = formatEntityFull(ctx);
    expect(result).toContain('(breaks: 3)');
  });
});
