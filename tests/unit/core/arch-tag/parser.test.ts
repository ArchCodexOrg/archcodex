/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import {
  parseArchTags,
  extractArchId,
  extractArchTag,
  hasArchTag,
  hasOverrides,
  extractIntents,
  hasIntents,
  validateOverride,
} from '../../../../src/core/arch-tag/parser.js';

describe('parseArchTags', () => {
  describe('@arch tag extraction', () => {
    it('should extract a simple @arch tag', () => {
      const content = `
/**
 * @arch domain.service
 */
export class MyService {}
`;
      const result = parseArchTags(content);
      expect(result.archTag).not.toBeNull();
      expect(result.archTag?.archId).toBe('domain.service');
      expect(result.archTag?.line).toBe(3);
    });

    it('should extract @arch tag with multiple levels', () => {
      const content = `// @arch archcodex.core.domain.parser`;
      const result = parseArchTags(content);
      expect(result.archTag?.archId).toBe('archcodex.core.domain.parser');
    });

    it('should only take the first @arch tag', () => {
      const content = `
// @arch first.arch
// @arch second.arch
`;
      const result = parseArchTags(content);
      expect(result.archTag?.archId).toBe('first.arch');
    });

    it('should not match @arch without a dot (invalid arch ID)', () => {
      const content = `
/**
 * Extracted @arch tag from a source file.
 */
`;
      const result = parseArchTags(content);
      expect(result.archTag).toBeNull();
    });

    it('should return null for files without @arch tag', () => {
      const content = `export class NoArchTag {}`;
      const result = parseArchTags(content);
      expect(result.archTag).toBeNull();
    });
  });

  describe('@override extraction', () => {
    it('should extract a simple override', () => {
      const content = `
/**
 * @arch domain.service
 * @override forbid_import:http
 * @reason Need HTTP for external API calls
 */
`;
      const result = parseArchTags(content);
      expect(result.overrides).toHaveLength(1);
      expect(result.overrides[0].rule).toBe('forbid_import');
      expect(result.overrides[0].value).toBe('http');
      expect(result.overrides[0].reason).toBe('Need HTTP for external API calls');
    });

    it('should extract override with all metadata', () => {
      const content = `
/**
 * @override max_file_lines:200
 * @reason Legacy code needs refactoring
 * @expires 2025-06-01
 * @ticket ARCH-123
 * @approved_by @teamlead
 */
`;
      const result = parseArchTags(content);
      expect(result.overrides).toHaveLength(1);
      const override = result.overrides[0];
      expect(override.rule).toBe('max_file_lines');
      expect(override.value).toBe('200');
      expect(override.reason).toBe('Legacy code needs refactoring');
      expect(override.expires).toBe('2025-06-01');
      expect(override.ticket).toBe('ARCH-123');
      expect(override.approvedBy).toBe('@teamlead');
    });

    it('should extract multiple overrides', () => {
      const content = `
/**
 * @override forbid_import:fs
 * @reason File system access needed
 */

/**
 * @override max_file_lines:300
 * @reason Complex business logic
 */
`;
      const result = parseArchTags(content);
      expect(result.overrides).toHaveLength(2);
    });
  });
});

describe('extractArchId', () => {
  it('should extract arch ID from content', () => {
    const content = `// @arch domain.payment.processor`;
    expect(extractArchId(content)).toBe('domain.payment.processor');
  });

  it('should return null if no arch tag', () => {
    const content = `export class NoTag {}`;
    expect(extractArchId(content)).toBeNull();
  });
});

describe('hasArchTag', () => {
  it('should return true for content with @arch tag', () => {
    expect(hasArchTag('// @arch some.arch')).toBe(true);
  });

  it('should return false for content without @arch tag', () => {
    expect(hasArchTag('// just a comment')).toBe(false);
  });
});

describe('hasOverrides', () => {
  it('should return true for content with @override', () => {
    expect(hasOverrides('// @override rule:value')).toBe(true);
  });

  it('should return false for content without @override', () => {
    expect(hasOverrides('// no overrides here')).toBe(false);
  });
});

describe('validateOverride', () => {
  const defaultConfig = {
    requiredFields: ['reason'],
    warnNoExpiry: true,
    maxExpiryDays: 90,
    failOnExpired: true,
  };

  it('should pass valid override with all fields', () => {
    // Set expiry within 90 days (maxExpiryDays)
    const validExpiry = new Date();
    validExpiry.setDate(validExpiry.getDate() + 30);
    const override = {
      rule: 'forbid_import',
      value: 'http',
      reason: 'Need for API calls',
      expires: validExpiry.toISOString().split('T')[0],
      line: 1,
    };
    const result = validateOverride(override, defaultConfig);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail if required reason is missing', () => {
    const override = {
      rule: 'forbid_import',
      value: 'http',
      line: 1,
    };
    const result = validateOverride(override, defaultConfig);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Override requires @reason field');
  });

  it('should fail on expired override when failOnExpired is true', () => {
    const override = {
      rule: 'forbid_import',
      value: 'http',
      reason: 'Test',
      expires: '2020-01-01',
      line: 1,
    };
    const result = validateOverride(override, defaultConfig);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('expired'))).toBe(true);
  });

  it('should warn if no expiry date', () => {
    const override = {
      rule: 'forbid_import',
      value: 'http',
      reason: 'Test reason',
      line: 1,
    };
    const result = validateOverride(override, defaultConfig);
    expect(result.warnings).toContain('Override has no expiration date');
  });

  it('should fail if expiry exceeds max days', () => {
    const farFuture = new Date();
    farFuture.setDate(farFuture.getDate() + 365);
    const override = {
      rule: 'forbid_import',
      value: 'http',
      reason: 'Test',
      expires: farFuture.toISOString().split('T')[0],
      line: 1,
    };
    const result = validateOverride(override, defaultConfig);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('exceeds maximum'))).toBe(true);
  });
});

describe('@intent annotation extraction', () => {
  describe('parseArchTags', () => {
    it('should extract a single @intent annotation', () => {
      const content = `
/**
 * @arch domain.query
 * @intent:includes-deleted
 */
export const listTrash = query({});
`;
      const result = parseArchTags(content);
      expect(result.intents).toHaveLength(1);
      expect(result.intents[0].name).toBe('includes-deleted');
      expect(result.intents[0].line).toBe(4);
    });

    it('should extract multiple @intent annotations', () => {
      const content = `
/**
 * @arch domain.endpoint
 * @intent:admin-only
 * @intent:includes-deleted
 */
`;
      const result = parseArchTags(content);
      expect(result.intents).toHaveLength(2);
      expect(result.intents.map(i => i.name)).toContain('admin-only');
      expect(result.intents.map(i => i.name)).toContain('includes-deleted');
    });

    it('should normalize intent names to lowercase', () => {
      const content = `// @intent:AdminOnly`;
      const result = parseArchTags(content);
      expect(result.intents[0].name).toBe('adminonly');
    });

    it('should handle intent with hyphenated names', () => {
      const content = `// @intent:system-internal-use`;
      const result = parseArchTags(content);
      expect(result.intents[0].name).toBe('system-internal-use');
    });

    it('should return empty array if no intents', () => {
      const content = `// @arch some.arch`;
      const result = parseArchTags(content);
      expect(result.intents).toHaveLength(0);
    });
  });

  describe('extractIntents', () => {
    it('should extract all intent names from content', () => {
      const content = `
@intent:admin-only
@intent:public-endpoint
@intent:includes-deleted
`;
      const intents = extractIntents(content);
      expect(intents).toHaveLength(3);
      expect(intents).toContain('admin-only');
      expect(intents).toContain('public-endpoint');
      expect(intents).toContain('includes-deleted');
    });

    it('should return empty array if no intents', () => {
      const content = `// no intents here`;
      expect(extractIntents(content)).toHaveLength(0);
    });
  });

  describe('hasIntents', () => {
    it('should return true for content with @intent', () => {
      expect(hasIntents('// @intent:admin-only')).toBe(true);
    });

    it('should return false for content without @intent', () => {
      expect(hasIntents('// @override rule:value')).toBe(false);
    });
  });
});

describe('inline mixin extraction', () => {
  describe('parseArchTags', () => {
    it('should extract a single inline mixin', () => {
      const content = `
/**
 * @arch convex.mutation +profile-counts
 */
export const updateProfile = mutation({});
`;
      const result = parseArchTags(content);
      expect(result.archTag).not.toBeNull();
      expect(result.archTag?.archId).toBe('convex.mutation');
      expect(result.archTag?.inlineMixins).toEqual(['profile-counts']);
    });

    it('should extract multiple inline mixins', () => {
      const content = `
/**
 * @arch convex.mutation +profile-counts +sidebar-cache +tested
 */
`;
      const result = parseArchTags(content);
      expect(result.archTag?.archId).toBe('convex.mutation');
      expect(result.archTag?.inlineMixins).toEqual(['profile-counts', 'sidebar-cache', 'tested']);
    });

    it('should return undefined inlineMixins when none specified', () => {
      const content = `// @arch domain.service`;
      const result = parseArchTags(content);
      expect(result.archTag?.archId).toBe('domain.service');
      expect(result.archTag?.inlineMixins).toBeUndefined();
    });

    it('should handle hyphenated mixin names', () => {
      const content = `// @arch some.arch +my-mixin-name`;
      const result = parseArchTags(content);
      expect(result.archTag?.inlineMixins).toEqual(['my-mixin-name']);
    });

    it('should handle underscored mixin names', () => {
      const content = `// @arch some.arch +my_mixin_name`;
      const result = parseArchTags(content);
      expect(result.archTag?.inlineMixins).toEqual(['my_mixin_name']);
    });
  });

  describe('extractArchTag', () => {
    it('should extract archId and inlineMixins', () => {
      const content = `// @arch convex.query +cache-invalidation +tested`;
      const result = extractArchTag(content);
      expect(result).not.toBeNull();
      expect(result?.archId).toBe('convex.query');
      expect(result?.inlineMixins).toEqual(['cache-invalidation', 'tested']);
    });

    it('should return undefined inlineMixins when none specified', () => {
      const content = `// @arch domain.service`;
      const result = extractArchTag(content);
      expect(result?.archId).toBe('domain.service');
      expect(result?.inlineMixins).toBeUndefined();
    });

    it('should return null if no arch tag', () => {
      const content = `export class NoTag {}`;
      expect(extractArchTag(content)).toBeNull();
    });
  });

  describe('extractArchId (backward compatibility)', () => {
    it('should still work with inline mixins (returns only archId)', () => {
      const content = `// @arch convex.mutation +profile-counts +sidebar-cache`;
      expect(extractArchId(content)).toBe('convex.mutation');
    });
  });
});
