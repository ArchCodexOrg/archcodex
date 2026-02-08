/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Extended tests for documentation generator - targeting uncovered branches.
 */
import { describe, it, expect } from 'vitest';
import {
  generateApiDocs,
  generateExampleDocs,
  generateErrorDocs,
  generateAllDocs,
} from '../../../../../src/core/spec/generators/docs.js';
import type { ResolvedSpec } from '../../../../../src/core/spec/schema.js';

describe('Documentation Generator - extended coverage', () => {
  const createSpec = (overrides: Partial<ResolvedSpec['node']> = {}): ResolvedSpec => ({
    specId: 'spec.test.docs',
    inheritanceChain: ['spec.test.docs'],
    appliedMixins: [],
    node: {
      intent: 'Test documentation generation',
      ...overrides,
    },
  });

  describe('generateApiDocs - extended', () => {
    it('returns error when intent is missing', () => {
      const spec: ResolvedSpec = {
        specId: 'spec.test',
        inheritanceChain: [],
        appliedMixins: [],
        node: {},
      };

      const result = generateApiDocs(spec);

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('MISSING_INTENT');
    });

    it('includes description when present', () => {
      const spec = createSpec({
        description: 'This is a detailed description of the spec.',
      });

      const result = generateApiDocs(spec);

      expect(result.valid).toBe(true);
      expect(result.markdown).toContain('This is a detailed description of the spec.');
    });

    it('includes security section with authentication required', () => {
      const spec = createSpec({
        security: {
          authentication: 'required',
        },
      });

      const result = generateApiDocs(spec);

      expect(result.markdown).toContain('Security');
      expect(result.markdown).toContain('Required');
      expect(result.markdown).toContain('User must be authenticated');
      expect(result.sections).toContain('security');
    });

    it('includes security section with optional authentication', () => {
      const spec = createSpec({
        security: {
          authentication: 'optional',
        },
      });

      const result = generateApiDocs(spec);

      expect(result.markdown).toContain('Optional');
    });

    it('includes security section with no authentication', () => {
      const spec = createSpec({
        security: {
          authentication: 'none',
        },
      });

      const result = generateApiDocs(spec);

      expect(result.markdown).toContain('None required');
    });

    it('includes rate limit in security section', () => {
      const spec = createSpec({
        security: {
          rate_limit: { requests: 100, window: '15m' },
        },
      });

      const result = generateApiDocs(spec);

      expect(result.markdown).toContain('Rate limit');
      expect(result.markdown).toContain('100 requests per 15m');
    });

    it('includes permissions in security section', () => {
      const spec = createSpec({
        security: {
          permissions: ['admin', 'editor'],
        },
      });

      const result = generateApiDocs(spec);

      expect(result.markdown).toContain('Permissions');
      expect(result.markdown).toContain('admin, editor');
    });

    it('formats enum input field type', () => {
      const spec = createSpec({
        inputs: {
          status: { type: 'enum', values: ['active', 'inactive', 'pending'] },
        },
      });

      const result = generateApiDocs(spec);

      expect(result.markdown).toContain('enum:');
      expect(result.markdown).toContain('active');
    });

    it('formats id input field type with table', () => {
      const spec = createSpec({
        inputs: {
          projectId: { type: 'id', table: 'projects', required: true },
        },
      });

      const result = generateApiDocs(spec);

      expect(result.markdown).toContain('id<projects>');
    });

    it('formats array input field type', () => {
      const spec = createSpec({
        inputs: {
          tags: { type: 'array', items: { type: 'string' } },
        },
      });

      const result = generateApiDocs(spec);

      expect(result.markdown).toContain('string[]');
    });

    it('shows required marker for required fields', () => {
      const spec = createSpec({
        inputs: {
          name: { type: 'string', required: true, description: 'The name' },
        },
      });

      const result = generateApiDocs(spec);

      expect(result.sections).toContain('parameters');
    });

    it('formats field description with constraints', () => {
      const spec = createSpec({
        inputs: {
          title: {
            type: 'string',
            required: true,
            description: 'Title of item',
            max: 200,
            min: 1,
          },
        },
      });

      const result = generateApiDocs(spec);

      expect(result.markdown).toContain('Title of item');
      expect(result.markdown).toContain('max: 200');
      expect(result.markdown).toContain('min: 1');
    });

    it('formats field with validate constraint', () => {
      const spec = createSpec({
        inputs: {
          url: {
            type: 'string',
            description: 'URL',
            validate: 'isUrl',
          },
        },
      });

      const result = generateApiDocs(spec);

      expect(result.markdown).toContain('validate: isUrl');
    });

    it('formats field with pattern constraint', () => {
      const spec = createSpec({
        inputs: {
          code: {
            type: 'string',
            pattern: '^[A-Z]{3}$',
          },
        },
      });

      const result = generateApiDocs(spec);

      expect(result.markdown).toContain('pattern:');
    });

    it('includes outputs section with enum', () => {
      const spec = createSpec({
        outputs: {
          status: { type: 'enum', values: ['ok', 'error'] },
        },
      });

      const result = generateApiDocs(spec);

      expect(result.sections).toContain('returns');
    });

    it('includes outputs section with optional fields', () => {
      const spec = createSpec({
        outputs: {
          meta: { type: 'object', description: 'Metadata', optional: true },
        },
      });

      const result = generateApiDocs(spec);

      expect(result.markdown).toContain('*(optional)*');
    });

    it('includes output id type with table', () => {
      const spec = createSpec({
        outputs: {
          id: { type: 'id', table: 'bookmarks' },
        },
      });

      const result = generateApiDocs(spec);

      expect(result.markdown).toContain('id<bookmarks>');
    });

    it('includes output array type', () => {
      const spec = createSpec({
        outputs: {
          items: { type: 'array', items: { type: 'number' } },
        },
      });

      const result = generateApiDocs(spec);

      expect(result.markdown).toContain('number[]');
    });

    it('includes examples when includeExamples is true', () => {
      const spec = createSpec({
        examples: {
          success: [
            { name: 'basic', given: { name: 'Test' }, then: { success: true } },
          ],
        },
      });

      const result = generateApiDocs(spec, { includeExamples: true });

      expect(result.sections).toContain('examples');
      expect(result.markdown).toContain('Example');
    });

    it('includes implementation link', () => {
      const spec = createSpec({
        implementation: 'src/services/user.ts#createUser',
      });

      const result = generateApiDocs(spec, { linkToImplementation: true });

      expect(result.markdown).toContain('Implementation');
      expect(result.markdown).toContain('src/services/user.ts#createUser');
    });

    it('formats title from spec ID', () => {
      const spec: ResolvedSpec = {
        specId: 'spec.products.create',
        inheritanceChain: [],
        appliedMixins: [],
        node: { intent: 'Create a product' },
      };

      const result = generateApiDocs(spec);

      expect(result.markdown).toContain('Create Products');
    });

    it('formats single-part title', () => {
      const spec: ResolvedSpec = {
        specId: 'spec.validate',
        inheritanceChain: [],
        appliedMixins: [],
        node: { intent: 'Validate input' },
      };

      const result = generateApiDocs(spec);

      expect(result.markdown).toContain('Validate');
    });
  });

  describe('generateExampleDocs - extended', () => {
    it('returns error when no success examples', () => {
      const spec = createSpec({});

      const result = generateExampleDocs(spec);

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('NO_EXAMPLES');
    });

    it('includes setup code for vanilla framework', () => {
      const spec = createSpec({
        examples: {
          success: [{ name: 'test', given: { name: 'Test' }, then: {} }],
        },
      });

      const result = generateExampleDocs(spec, { includeSetup: true });

      expect(result.markdown).toContain('Setup');
      expect(result.markdown).toContain('import');
    });

    it('includes setup code for convex framework', () => {
      const spec = createSpec({
        examples: {
          success: [{ name: 'test', given: { name: 'Test' }, then: {} }],
        },
      });

      const result = generateExampleDocs(spec, { includeSetup: true, framework: 'convex' });

      expect(result.markdown).toContain('useMutation');
    });

    it('includes setup code for nextjs framework', () => {
      const spec = createSpec({
        examples: {
          success: [{ name: 'test', given: { name: 'Test' }, then: {} }],
        },
      });

      const result = generateExampleDocs(spec, { includeSetup: true, framework: 'nextjs' });

      expect(result.markdown).toContain("'use client'");
    });

    it('generates convex example code', () => {
      const spec = createSpec({
        examples: {
          success: [{ name: 'create', given: { title: 'Test' }, then: {} }],
        },
      });

      const result = generateExampleDocs(spec, { framework: 'convex' });

      expect(result.markdown).toContain('await docs(');
      expect(result.markdown).not.toContain('ctx,');
    });

    it('generates vanilla example code with ctx', () => {
      const spec = createSpec({
        examples: {
          success: [{ name: 'create', given: { title: 'Test' }, then: {} }],
        },
      });

      const result = generateExampleDocs(spec);

      expect(result.markdown).toContain('ctx,');
    });

    it('handles example without name', () => {
      const spec = createSpec({
        examples: {
          success: [{ given: { name: 'Test' }, then: {} }],
        },
      });

      const result = generateExampleDocs(spec);

      expect(result.markdown).toContain('### Example');
    });

    it('filters << anchor and user keys from example given', () => {
      const spec = createSpec({
        examples: {
          success: [{
            name: 'test',
            given: { '<<': 'ref', user: '@authenticated', title: 'Test' },
            then: {},
          }],
        },
      });

      const result = generateExampleDocs(spec);

      expect(result.markdown).toContain('title');
      expect(result.markdown).not.toContain('<<');
    });

    it('handles empty given in example', () => {
      const spec = createSpec({
        examples: {
          success: [{ name: 'empty', then: {} }],
        },
      });

      const result = generateExampleDocs(spec);

      expect(result.valid).toBe(true);
    });

    it('generates multiple examples', () => {
      const spec = createSpec({
        examples: {
          success: [
            { name: 'first', given: { a: '1' }, then: {} },
            { name: 'second', given: { b: '2' }, then: {} },
          ],
        },
      });

      const result = generateExampleDocs(spec);

      expect(result.exampleCount).toBe(2);
      expect(result.markdown).toContain('### first');
      expect(result.markdown).toContain('### second');
    });
  });

  describe('generateErrorDocs - extended', () => {
    it('returns error when no error examples', () => {
      const spec = createSpec({});

      const result = generateErrorDocs(spec);

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('NO_ERROR_EXAMPLES');
    });

    it('generates HTTP codes by default', () => {
      const spec = createSpec({
        examples: {
          errors: [
            { name: 'not found', given: { id: 'invalid' }, then: { error: 'NOT_FOUND' } },
          ],
        },
      });

      const result = generateErrorDocs(spec);

      expect(result.markdown).toContain('HTTP');
      expect(result.markdown).toContain('404');
    });

    it('omits HTTP codes when includeHttpCodes is false', () => {
      const spec = createSpec({
        examples: {
          errors: [
            { name: 'not found', given: {}, then: { error: 'NOT_FOUND' } },
          ],
        },
      });

      const result = generateErrorDocs(spec, { includeHttpCodes: false });

      expect(result.markdown).not.toContain('HTTP');
    });

    it('extracts error code from error.code path', () => {
      const spec = createSpec({
        examples: {
          errors: [
            { name: 'invalid', given: {}, then: { 'error.code': 'INVALID_INPUT' } },
          ],
        },
      });

      const result = generateErrorDocs(spec);

      expect(result.markdown).toContain('INVALID_INPUT');
      expect(result.markdown).toContain('400');
    });

    it('extracts error code from result.error path', () => {
      const spec = createSpec({
        examples: {
          errors: [
            { name: 'error', given: {}, then: { 'result.error': 'RATE_LIMITED' } },
          ],
        },
      });

      const result = generateErrorDocs(spec);

      expect(result.markdown).toContain('RATE_LIMITED');
      expect(result.markdown).toContain('429');
    });

    it('derives error code from example name when no then error', () => {
      const spec = createSpec({
        examples: {
          errors: [
            { name: 'empty title', given: { title: '' }, then: {} },
          ],
        },
      });

      const result = generateErrorDocs(spec);

      expect(result.markdown).toContain('EMPTY_INPUT');
    });

    it('derives INVALID_INPUT from name containing invalid', () => {
      const spec = createSpec({
        examples: {
          errors: [
            { name: 'invalid email format', given: {}, then: {} },
          ],
        },
      });

      const result = generateErrorDocs(spec);

      expect(result.markdown).toContain('INVALID_INPUT');
    });

    it('derives NOT_FOUND from name', () => {
      const spec = createSpec({
        examples: {
          errors: [
            { name: 'bookmark not found', given: {}, then: {} },
          ],
        },
      });

      const result = generateErrorDocs(spec);

      expect(result.markdown).toContain('NOT_FOUND');
    });

    it('derives NOT_AUTHENTICATED from name', () => {
      const spec = createSpec({
        examples: {
          errors: [
            { name: 'not authenticated user', given: {}, then: {} },
          ],
        },
      });

      const result = generateErrorDocs(spec);

      expect(result.markdown).toContain('NOT_AUTHENTICATED');
    });

    it('derives PERMISSION_DENIED from name with permission', () => {
      const spec = createSpec({
        examples: {
          errors: [
            { name: 'no permission to edit', given: {}, then: {} },
          ],
        },
      });

      const result = generateErrorDocs(spec);

      expect(result.markdown).toContain('PERMISSION_DENIED');
    });

    it('derives INVALID_LENGTH from name with too long', () => {
      const spec = createSpec({
        examples: {
          errors: [
            { name: 'title too long', given: {}, then: {} },
          ],
        },
      });

      const result = generateErrorDocs(spec);

      expect(result.markdown).toContain('INVALID_LENGTH');
    });

    it('falls back to UNKNOWN_ERROR when no pattern matches', () => {
      const spec = createSpec({
        examples: {
          errors: [
            { name: 'weird situation', given: {}, then: {} },
          ],
        },
      });

      const result = generateErrorDocs(spec);

      expect(result.markdown).toContain('UNKNOWN_ERROR');
    });

    it('derives cause from null user given', () => {
      const spec = createSpec({
        examples: {
          errors: [
            { name: 'unauthorized error', given: { user: null }, then: { error: 'NOT_AUTHENTICATED' } },
          ],
        },
      });

      const result = generateErrorDocs(spec);

      expect(result.markdown).toContain('User not authenticated');
    });

    it('derives cause from @no_access user', () => {
      const spec = createSpec({
        examples: {
          errors: [
            { name: 'forbidden error', given: { user: '@no_access' }, then: { error: 'PERMISSION_DENIED' } },
          ],
        },
      });

      const result = generateErrorDocs(spec);

      expect(result.markdown).toContain('User lacks permission');
    });

    it('derives cause from @string placeholder', () => {
      // Name must contain 'error' to skip the "use name" shortcut and reach condition logic
      const spec = createSpec({
        examples: {
          errors: [
            { name: 'length error', given: { title: '@string(5000)' }, then: { error: 'INVALID_LENGTH' } },
          ],
        },
      });

      const result = generateErrorDocs(spec);

      expect(result.markdown).toContain('5000 characters');
    });

    it('derives cause from null given value', () => {
      // Name must contain 'error' to skip the "use name" shortcut and reach condition logic
      const spec = createSpec({
        examples: {
          errors: [
            { name: 'missing error', given: { title: null }, then: { error: 'MISSING_FIELD' } },
          ],
        },
      });

      const result = generateErrorDocs(spec);

      expect(result.markdown).toContain('Title is missing');
    });

    it('shows - for unrecognized HTTP code', () => {
      const spec = createSpec({
        examples: {
          errors: [
            { name: 'custom error', given: {}, then: { error: 'CUSTOM_ERROR' } },
          ],
        },
      });

      const result = generateErrorDocs(spec);

      expect(result.markdown).toContain('| - |');
    });

    it('generates resolution for known error codes', () => {
      const spec = createSpec({
        examples: {
          errors: [
            { name: 'not found', given: {}, then: { error: 'NOT_FOUND' } },
          ],
        },
      });

      const result = generateErrorDocs(spec);

      expect(result.markdown).toContain('Verify the resource exists');
    });

    it('generates resolution for INVALID pattern', () => {
      const spec = createSpec({
        examples: {
          errors: [
            { name: 'bad', given: {}, then: { error: 'INVALID_EMAIL' } },
          ],
        },
      });

      const result = generateErrorDocs(spec);

      expect(result.markdown).toContain('Check input format');
    });

    it('generates resolution for TOO_LONG pattern', () => {
      const spec = createSpec({
        examples: {
          errors: [
            { name: 'long', given: {}, then: { error: 'TITLE_TOO_LONG' } },
          ],
        },
      });

      const result = generateErrorDocs(spec);

      expect(result.markdown).toContain('Reduce input length');
    });

    it('generates resolution for PERMISSION pattern', () => {
      const spec = createSpec({
        examples: {
          errors: [
            { name: 'denied', given: {}, then: { error: 'NO_PERMISSION_EDIT' } },
          ],
        },
      });

      const result = generateErrorDocs(spec);

      expect(result.markdown).toContain('Request appropriate access');
    });

    it('generates generic resolution for unknown codes', () => {
      const spec = createSpec({
        examples: {
          errors: [
            { name: 'error', given: {}, then: { error: 'SOMETHING_WENT_WRONG' } },
          ],
        },
      });

      const result = generateErrorDocs(spec);

      expect(result.markdown).toContain('Check error details');
    });
  });

  describe('generateAllDocs - extended', () => {
    it('returns error when intent is missing', () => {
      const spec: ResolvedSpec = {
        specId: 'spec.test',
        inheritanceChain: [],
        appliedMixins: [],
        node: {},
      };

      const result = generateAllDocs(spec);

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('MISSING_INTENT');
    });

    it('generates multiple files in outputMode multiple', () => {
      const spec = createSpec({
        inputs: { name: { type: 'string' } },
        examples: {
          success: [{ name: 'ok', given: { name: 'Test' }, then: {} }],
          errors: [{ name: 'bad', given: {}, then: { error: 'NOT_FOUND' } }],
        },
      });

      const result = generateAllDocs(spec, { outputMode: 'multiple' });

      expect(result.valid).toBe(true);
      expect(result.files).toBeDefined();
      expect(result.files!.length).toBeGreaterThanOrEqual(2);
      expect(result.files!.some(f => f.name === 'api.md')).toBe(true);
      expect(result.files!.some(f => f.name === 'examples.md')).toBe(true);
      expect(result.files!.some(f => f.name === 'errors.md')).toBe(true);
    });

    it('generates combined doc with TOC', () => {
      const spec = createSpec({
        inputs: { name: { type: 'string' } },
        examples: {
          success: [{ name: 'ok', given: {}, then: {} }],
          errors: [{ name: 'bad', given: {}, then: { error: 'NOT_FOUND' } }],
        },
      });

      const result = generateAllDocs(spec);

      expect(result.markdown).toContain('Table of Contents');
      expect(result.markdown).toContain('API Reference');
      expect(result.markdown).toContain('Usage Examples');
      expect(result.markdown).toContain('Error Reference');
    });

    it('skips TOC when includeToc is false', () => {
      const spec = createSpec({
        inputs: { name: { type: 'string' } },
      });

      const result = generateAllDocs(spec, { includeToc: false });

      expect(result.markdown).not.toContain('Table of Contents');
    });

    it('respects sections filter', () => {
      const spec = createSpec({
        inputs: { name: { type: 'string' } },
        examples: {
          success: [{ name: 'ok', given: {}, then: {} }],
        },
      });

      const result = generateAllDocs(spec, { sections: ['api'] });

      expect(result.markdown).toContain('API Reference');
      expect(result.markdown).not.toContain('Usage Examples');
    });

    it('generates multiple mode without errors section', () => {
      const spec = createSpec({
        inputs: { name: { type: 'string' } },
        examples: {
          success: [{ name: 'ok', given: {}, then: {} }],
        },
      });

      const result = generateAllDocs(spec, { outputMode: 'multiple' });

      expect(result.files).toBeDefined();
      expect(result.files!.some(f => f.name === 'errors.md')).toBe(false);
    });
  });
});
