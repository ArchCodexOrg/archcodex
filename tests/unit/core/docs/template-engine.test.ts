/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for documentation template engine.
 * Covers rendering, conditionals, unless blocks, variables, caching,
 * error handling, custom templates, and all template types.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'node:path';

// Mock file-system utilities
vi.mock('../../../../src/utils/file-system.js', () => ({
  readFile: vi.fn().mockResolvedValue(''),
  fileExists: vi.fn().mockResolvedValue(false),
}));

import {
  DocTemplateEngine,
  getDefaultTemplates,
  createTemplateEngine,
} from '../../../../src/core/docs/template-engine.js';
import { readFile, fileExists } from '../../../../src/utils/file-system.js';

describe('Template Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fileExists).mockResolvedValue(false);
    vi.mocked(readFile).mockResolvedValue('');
  });

  describe('getDefaultTemplates', () => {
    it('returns object with templates', () => {
      const templates = getDefaultTemplates();

      expect(typeof templates).toBe('object');
      expect(templates).toBeDefined();
    });

    it('includes adr template', () => {
      const templates = getDefaultTemplates();

      expect(templates.adr).toBeDefined();
    });

    it('includes adr-index template', () => {
      const templates = getDefaultTemplates();

      expect(templates['adr-index']).toBeDefined();
    });

    it('includes spec-api template', () => {
      const templates = getDefaultTemplates();

      expect(templates['spec-api']).toBeDefined();
    });

    it('includes spec-examples template', () => {
      const templates = getDefaultTemplates();

      expect(templates['spec-examples']).toBeDefined();
    });

    it('includes spec-errors template', () => {
      const templates = getDefaultTemplates();

      expect(templates['spec-errors']).toBeDefined();
    });

    it('includes spec-all template', () => {
      const templates = getDefaultTemplates();

      expect(templates['spec-all']).toBeDefined();
    });

    it('returns a new object (not a reference)', () => {
      const a = getDefaultTemplates();
      const b = getDefaultTemplates();

      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe('createTemplateEngine', () => {
    it('creates template engine instance', () => {
      const engine = createTemplateEngine('/test');

      expect(engine).toBeDefined();
      expect(engine).toBeInstanceOf(DocTemplateEngine);
    });

    it('accepts custom options', () => {
      const engine = createTemplateEngine('/test', {
        templateDir: 'custom/templates',
        extension: '.html.hbs',
      });

      expect(engine).toBeInstanceOf(DocTemplateEngine);
    });
  });

  describe('DocTemplateEngine', () => {
    describe('render', () => {
      it('renders template with context', async () => {
        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', {
          TITLE: 'Test ADR',
          CONTEXT: 'This is a test context',
        });

        expect(result.valid).toBe(true);
        expect(result.content).toContain('Test ADR');
        expect(result.content).toContain('This is a test context');
      });

      it('handles minimal context', async () => {
        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', {
          TITLE: 'Test ADR',
        });

        expect(result.valid).toBe(true);
        expect(result.content).toBeDefined();
      });

      it('uses default template when custom not found', async () => {
        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', {
          TITLE: 'Test',
        });

        expect(result.templateSource).toBe('default');
      });

      it('returns error when template name is not found', async () => {
        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('nonexistent-template', {
          TITLE: 'Test',
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('TEMPLATE_NOT_FOUND');
        expect(result.errors[0].message).toContain('nonexistent-template');
      });

      it('uses custom template when available', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('# Custom: {{TITLE}}');

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', {
          TITLE: 'Custom ADR',
        });

        expect(result.valid).toBe(true);
        expect(result.templateSource).toBe('custom');
        expect(result.content).toContain('Custom ADR');
      });

      it('caches loaded custom templates', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('# Cached: {{TITLE}}');

        const engine = new DocTemplateEngine('/test');

        await engine.render('adr', { TITLE: 'First' });
        await engine.render('adr', { TITLE: 'Second' });

        // readFile should only be called once due to caching
        expect(readFile).toHaveBeenCalledTimes(1);
      });

      it('handles render errors gracefully', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockRejectedValue(new Error('Permission denied'));

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', { TITLE: 'Test' });

        expect(result.valid).toBe(false);
        expect(result.errors[0].code).toBe('RENDER_ERROR');
        expect(result.errors[0].message).toContain('Permission denied');
      });

      it('handles non-Error throws gracefully', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockRejectedValue('string error');

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', { TITLE: 'Test' });

        expect(result.valid).toBe(false);
        expect(result.errors[0].code).toBe('RENDER_ERROR');
        expect(result.errors[0].message).toBe('Unknown error');
      });
    });

    describe('variable substitution', () => {
      it('replaces simple variables', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('Hello {{NAME}}!');

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', { NAME: 'World' });

        expect(result.content).toContain('Hello World!');
      });

      it('replaces undefined variables with empty string', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('Hello {{NAME}}!');

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', {});

        expect(result.content).toContain('Hello !');
      });

      it('replaces null variables with empty string', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('Value: {{VALUE}}');

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', { VALUE: undefined });

        expect(result.content).toContain('Value:');
      });

      it('joins arrays with newlines', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('Items:\n{{ITEMS}}');

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', { ITEMS: ['one', 'two', 'three'] });

        expect(result.content).toContain('one\ntwo\nthree');
      });

      it('converts numbers to string', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('Count: {{COUNT}}');

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', { COUNT: 42 });

        expect(result.content).toContain('Count: 42');
      });

      it('converts booleans to string', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('Active: {{ACTIVE}}');

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', { ACTIVE: true });

        expect(result.content).toContain('Active: true');
      });

      it('handles variables with whitespace around name', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('Hello {{ NAME }}!');

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', { NAME: 'World' });

        expect(result.content).toContain('Hello World!');
      });
    });

    describe('conditional blocks (if/else/endif)', () => {
      it('renders if block when variable is truthy', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('{{#if SHOW}}Visible{{/if}}');

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', { SHOW: true });

        expect(result.content).toContain('Visible');
      });

      it('hides if block when variable is falsy', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('{{#if SHOW}}Visible{{/if}}');

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', { SHOW: false });

        expect(result.content).not.toContain('Visible');
      });

      it('hides if block when variable is undefined', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('{{#if SHOW}}Visible{{/if}}');

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', {});

        expect(result.content).not.toContain('Visible');
      });

      it('hides if block when variable is empty string', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('{{#if SHOW}}Visible{{/if}}');

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', { SHOW: '' });

        expect(result.content).not.toContain('Visible');
      });

      it('hides if block when variable is empty array', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('{{#if ITEMS}}Has Items{{/if}}');

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', { ITEMS: [] });

        expect(result.content).not.toContain('Has Items');
      });

      it('shows if block when variable is non-empty array', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('{{#if ITEMS}}Has Items{{/if}}');

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', { ITEMS: ['one'] });

        expect(result.content).toContain('Has Items');
      });

      it('renders else block when variable is falsy', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('{{#if SHOW}}Yes{{else}}No{{/if}}');

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', { SHOW: false });

        expect(result.content).toContain('No');
        expect(result.content).not.toContain('Yes');
      });

      it('renders if block (not else) when variable is truthy', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('{{#if SHOW}}Yes{{else}}No{{/if}}');

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', { SHOW: true });

        expect(result.content).toContain('Yes');
        expect(result.content).not.toContain('No');
      });

      it('handles non-nested if blocks', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue(
          '{{#if A}}ShowA{{/if}} {{#if B}}ShowB{{/if}}'
        );

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', { A: true, B: true });

        expect(result.content).toContain('ShowA');
        expect(result.content).toContain('ShowB');
      });

      it('hides one block when only one variable is truthy', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue(
          '{{#if A}}ShowA{{/if}} {{#if B}}ShowB{{/if}}'
        );

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', { A: true, B: false });

        expect(result.content).toContain('ShowA');
        expect(result.content).not.toContain('ShowB');
      });
    });

    describe('unless blocks', () => {
      it('renders unless block when variable is falsy', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('{{#unless HIDDEN}}Visible{{/unless}}');

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', { HIDDEN: false });

        expect(result.content).toContain('Visible');
      });

      it('hides unless block when variable is truthy', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('{{#unless HIDDEN}}Visible{{/unless}}');

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', { HIDDEN: true });

        expect(result.content).not.toContain('Visible');
      });

      it('renders unless block when variable is undefined', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('{{#unless HIDDEN}}Visible{{/unless}}');

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', {});

        expect(result.content).toContain('Visible');
      });

      it('renders unless block when variable is empty string', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('{{#unless HIDDEN}}Visible{{/unless}}');

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', { HIDDEN: '' });

        expect(result.content).toContain('Visible');
      });

      it('renders unless block when variable is empty array', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('{{#unless ITEMS}}No Items{{/unless}}');

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', { ITEMS: [] });

        expect(result.content).toContain('No Items');
      });

      it('handles non-nested unless blocks', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue(
          '{{#unless A}}NoA{{/unless}} {{#unless B}}NoB{{/unless}}'
        );

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', {});

        expect(result.content).toContain('NoA');
        expect(result.content).toContain('NoB');
      });
    });

    describe('ADR template specifics', () => {
      it('renders deprecated status', async () => {
        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', {
          TITLE: 'Old Pattern',
          DEPRECATED_FROM: '2024-01-01',
          CONTEXT: 'Legacy approach',
        });

        expect(result.content).toContain('Deprecated');
        expect(result.content).toContain('2024-01-01');
      });

      it('renders active status when not deprecated', async () => {
        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', {
          TITLE: 'Active Pattern',
          CONTEXT: 'Current approach',
        });

        expect(result.content).toContain('Active');
      });

      it('renders constraints section when present', async () => {
        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', {
          TITLE: 'Constrained',
          CONTEXT: 'Has constraints',
          HAS_CONSTRAINTS: true,
          CONSTRAINTS_SECTION: '- No direct DB access',
        });

        expect(result.content).toContain('No direct DB access');
      });

      it('renders no-constraints message when absent', async () => {
        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', {
          TITLE: 'Unconstrained',
          CONTEXT: 'No constraints',
        });

        expect(result.content).toContain('No specific constraints');
      });

      it('renders hints section', async () => {
        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', {
          TITLE: 'With Hints',
          CONTEXT: 'Hints present',
          HINTS_SECTION: '- Prefer composition',
        });

        expect(result.content).toContain('Guidelines');
        expect(result.content).toContain('Prefer composition');
      });

      it('renders code pattern section', async () => {
        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', {
          TITLE: 'With Pattern',
          CONTEXT: 'Pattern present',
          CODE_PATTERN: 'export function example() {}',
        });

        expect(result.content).toContain('Code Pattern');
        expect(result.content).toContain('export function example()');
      });

      it('renders forbidden section', async () => {
        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', {
          TITLE: 'With Forbidden',
          CONTEXT: 'Forbidden present',
          FORBIDDEN_SECTION: '- No console.log',
        });

        expect(result.content).toContain('Forbidden');
        expect(result.content).toContain('No console.log');
      });

      it('renders required section', async () => {
        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', {
          TITLE: 'With Required',
          CONTEXT: 'Required present',
          REQUIRED_SECTION: '- Must import commander',
        });

        expect(result.content).toContain('Required');
        expect(result.content).toContain('Must import commander');
      });

      it('renders inheritance chain', async () => {
        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', {
          TITLE: 'Inherited',
          CONTEXT: 'Has inheritance',
          INHERITANCE_CHAIN: 'archcodex.core > archcodex.core.engine',
        });

        expect(result.content).toContain('Inheritance');
        expect(result.content).toContain('archcodex.core');
      });

      it('renders applied mixins', async () => {
        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', {
          TITLE: 'With Mixins',
          CONTEXT: 'Has mixins',
          APPLIED_MIXINS: '- mixin_a\n- mixin_b',
        });

        expect(result.content).toContain('Applied Mixins');
        expect(result.content).toContain('mixin_a');
      });

      it('renders file conventions', async () => {
        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', {
          TITLE: 'With Conventions',
          CONTEXT: 'Has conventions',
          FILE_CONVENTIONS: '- PascalCase filenames',
        });

        expect(result.content).toContain('File Conventions');
      });

      it('renders references section', async () => {
        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', {
          TITLE: 'With Refs',
          CONTEXT: 'Has references',
          REFERENCES_SECTION: '- See docs/architecture.md',
        });

        expect(result.content).toContain('References');
      });

      it('renders intents section', async () => {
        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', {
          TITLE: 'With Intents',
          CONTEXT: 'Has intents',
          INTENTS_SECTION: '- @intent:stateless',
        });

        expect(result.content).toContain('Intent Annotations');
      });
    });

    describe('other template types', () => {
      it('renders adr-index template', async () => {
        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr-index', {
          GROUPED_ENTRIES: '## Core\n- ADR 1\n- ADR 2',
          DATE: '2024-01-15',
          TOTAL_COUNT: '5',
        });

        expect(result.valid).toBe(true);
        expect(result.content).toContain('Architecture Decision Records');
        expect(result.content).toContain('Core');
        expect(result.content).toContain('Total ADRs: 5');
      });

      it('renders spec-api template', async () => {
        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('spec-api', {
          TITLE: 'createUser',
          INTENT: 'Create a new user',
          INPUTS_SECTION: '| name | string | required |',
          OUTPUTS_SECTION: '| user | User |',
        });

        expect(result.valid).toBe(true);
        expect(result.content).toContain('createUser');
        expect(result.content).toContain('Parameters');
        expect(result.content).toContain('Returns');
      });

      it('renders spec-api template with optional sections', async () => {
        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('spec-api', {
          TITLE: 'secureAction',
          INTENT: 'A secure action',
          DESCRIPTION: 'Detailed description here',
          SECURITY_SECTION: '- Requires auth token',
          EXAMPLE_CODE: 'const result = await secureAction(args);',
          IMPLEMENTATION_PATH: 'src/actions/secure.ts',
        });

        expect(result.content).toContain('Security');
        expect(result.content).toContain('Example');
        expect(result.content).toContain('Implementation');
      });

      it('renders spec-examples template', async () => {
        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('spec-examples', {
          SETUP_CODE: 'const client = createClient();',
          EXAMPLES_SECTION: '### Example 1\nDo something',
        });

        expect(result.valid).toBe(true);
        expect(result.content).toContain('Usage Examples');
        expect(result.content).toContain('Setup');
        expect(result.content).toContain('createClient');
      });

      it('renders spec-examples without setup code', async () => {
        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('spec-examples', {
          EXAMPLES_SECTION: '### Example 1\nDo something',
        });

        expect(result.valid).toBe(true);
        expect(result.content).not.toContain('Setup');
      });

      it('renders spec-errors template', async () => {
        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('spec-errors', {
          ERROR_TABLE: '| NOT_FOUND | Resource not found |',
        });

        expect(result.valid).toBe(true);
        expect(result.content).toContain('Error Reference');
        expect(result.content).toContain('NOT_FOUND');
      });

      it('renders spec-all template', async () => {
        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('spec-all', {
          TITLE: 'Full Spec',
          TOC: '- API\n- Examples\n- Errors',
          API_SECTION: '## API Content',
          EXAMPLES_SECTION: '## Examples Content',
          ERRORS_SECTION: '## Errors Content',
        });

        expect(result.valid).toBe(true);
        expect(result.content).toContain('Full Spec');
        expect(result.content).toContain('Table of Contents');
        expect(result.content).toContain('API Content');
        expect(result.content).toContain('Examples Content');
        expect(result.content).toContain('Errors Content');
      });

      it('renders spec-all without optional sections', async () => {
        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('spec-all', {
          TITLE: 'Minimal Spec',
          TOC: '- API',
          API_SECTION: '## API Content',
        });

        expect(result.valid).toBe(true);
        expect(result.content).toContain('API Content');
      });
    });

    describe('hasCustomTemplate', () => {
      it('returns true when custom template exists', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);

        const engine = new DocTemplateEngine('/test');
        const result = await engine.hasCustomTemplate('adr');

        expect(result).toBe(true);
      });

      it('returns false when custom template does not exist', async () => {
        vi.mocked(fileExists).mockResolvedValue(false);

        const engine = new DocTemplateEngine('/test');
        const result = await engine.hasCustomTemplate('adr');

        expect(result).toBe(false);
      });
    });

    describe('listTemplates', () => {
      it('lists all default templates', async () => {
        vi.mocked(fileExists).mockResolvedValue(false);

        const engine = new DocTemplateEngine('/test');
        const templates = await engine.listTemplates();

        const defaultTemplates = getDefaultTemplates();
        expect(templates.length).toBe(Object.keys(defaultTemplates).length);
        expect(templates.every(t => t.source === 'default')).toBe(true);
      });

      it('marks templates as custom when custom files exist', async () => {
        // Return true for all fileExists calls (all templates have custom versions)
        vi.mocked(fileExists).mockResolvedValue(true);

        const engine = new DocTemplateEngine('/test');
        const templates = await engine.listTemplates();

        expect(templates.every(t => t.source === 'custom')).toBe(true);
      });

      it('includes template names', async () => {
        vi.mocked(fileExists).mockResolvedValue(false);

        const engine = new DocTemplateEngine('/test');
        const templates = await engine.listTemplates();

        const names = templates.map(t => t.name);
        expect(names).toContain('adr');
        expect(names).toContain('adr-index');
        expect(names).toContain('spec-api');
      });
    });

    describe('clearCache', () => {
      it('clears template cache so templates are re-read', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('# Template V1: {{TITLE}}');

        const engine = new DocTemplateEngine('/test');

        await engine.render('adr', { TITLE: 'First' });
        expect(readFile).toHaveBeenCalledTimes(1);

        // Clear cache
        engine.clearCache();

        // After clearing, readFile should be called again
        vi.mocked(readFile).mockResolvedValue('# Template V2: {{TITLE}}');
        const result = await engine.render('adr', { TITLE: 'Second' });

        expect(readFile).toHaveBeenCalledTimes(2);
        expect(result.content).toContain('Template V2');
      });
    });

    describe('custom template directory and extension', () => {
      it('uses custom template directory', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('# Custom Dir: {{TITLE}}');

        const engine = new DocTemplateEngine('/test', {
          templateDir: 'custom/dir',
        });
        const result = await engine.render('adr', { TITLE: 'Test' });

        expect(result.valid).toBe(true);
        expect(result.templateSource).toBe('custom');
        // fileExists should be called with custom dir path
        expect(fileExists).toHaveBeenCalledWith(
          expect.stringContaining('custom/dir')
        );
      });

      it('uses custom extension', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('# Custom Ext: {{TITLE}}');

        const engine = new DocTemplateEngine('/test', {
          extension: '.html.hbs',
        });
        const result = await engine.render('adr', { TITLE: 'Test' });

        expect(result.valid).toBe(true);
        // fileExists should be called with custom extension
        expect(fileExists).toHaveBeenCalledWith(
          expect.stringContaining('.html.hbs')
        );
      });
    });

    describe('cleanup of excessive blank lines', () => {
      it('collapses triple+ blank lines to double', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('Line 1\n\n\n\n\nLine 2');

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', {});

        // Should not have more than 2 consecutive newlines
        expect(result.content).not.toMatch(/\n{3,}/);
      });

      it('trims and adds trailing newline', async () => {
        vi.mocked(fileExists).mockResolvedValue(true);
        vi.mocked(readFile).mockResolvedValue('  Content  ');

        const engine = new DocTemplateEngine('/test');
        const result = await engine.render('adr', {});

        expect(result.content).toMatch(/\n$/);
        expect(result.content).not.toMatch(/^\s/);
      });
    });
  });
});
