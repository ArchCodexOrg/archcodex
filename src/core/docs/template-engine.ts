/**
 * @arch archcodex.core.domain
 *
 * Documentation template engine for ArchCodex.
 * Supports customizable templates in .arch/templates/docs/ with Handlebars-style substitution.
 *
 * Template resolution order:
 * 1. Custom template in .arch/templates/docs/{name}.md.hbs
 * 2. Embedded default template
 */
import { readFile, fileExists } from '../../utils/file-system.js';
import * as path from 'node:path';

// ============================================================================
// Types
// ============================================================================

export interface TemplateContext {
  [key: string]: string | string[] | boolean | number | object | undefined;
}

export interface TemplateOptions {
  /** Custom template directory (default: .arch/templates/docs) */
  templateDir?: string;
  /** Template file extension (default: .md.hbs) */
  extension?: string;
}

export interface TemplateResult {
  valid: boolean;
  content: string;
  templateSource: 'custom' | 'default';
  errors: Array<{ code: string; message: string }>;
}

// ============================================================================
// Default Templates
// ============================================================================

const DEFAULT_ADR_TEMPLATE = `# ADR: {{TITLE}}

## Status

{{#if DEPRECATED_FROM}}
**Deprecated** (since {{DEPRECATED_FROM}})
{{#if MIGRATION_GUIDE}}

See [Migration Guide]({{MIGRATION_GUIDE}})
{{/if}}
{{else}}
**Active**
{{/if}}

## Context

{{CONTEXT}}

{{#if INHERITANCE_CHAIN}}
### Inheritance

Inherits from: {{INHERITANCE_CHAIN}}

{{/if}}
{{#if APPLIED_MIXINS}}
### Applied Mixins

{{APPLIED_MIXINS}}

{{/if}}
## Decision

{{#if HAS_CONSTRAINTS}}
Files using this architecture must follow these constraints:

{{CONSTRAINTS_SECTION}}
{{else}}
No specific constraints defined. Inherits base constraints only.
{{/if}}

{{#if FILE_CONVENTIONS}}
### File Conventions

{{FILE_CONVENTIONS}}

{{/if}}
## Consequences

{{#if FORBIDDEN_SECTION}}
### Forbidden

{{FORBIDDEN_SECTION}}

{{/if}}
{{#if REQUIRED_SECTION}}
### Required

{{REQUIRED_SECTION}}

{{/if}}
{{#unless FORBIDDEN_SECTION}}{{#unless REQUIRED_SECTION}}
This architecture has no explicit forbidden or required items.
{{/unless}}{{/unless}}

{{#if HINTS_SECTION}}
## Guidelines

{{HINTS_SECTION}}

{{/if}}
{{#if REFERENCES_SECTION}}
## References

{{REFERENCES_SECTION}}

{{/if}}
{{#if CODE_PATTERN}}
### Code Pattern

\`\`\`typescript
{{CODE_PATTERN}}
\`\`\`

{{/if}}
{{#if INTENTS_SECTION}}
### Intent Annotations

{{INTENTS_SECTION}}

{{/if}}
`;

const DEFAULT_ADR_INDEX_TEMPLATE = `# Architecture Decision Records

This document indexes all Architecture Decision Records (ADRs) for this project.

{{GROUPED_ENTRIES}}

---

*Generated: {{DATE}}*
*Total ADRs: {{TOTAL_COUNT}}*
`;

const DEFAULT_SPEC_API_TEMPLATE = `## {{TITLE}}

> {{INTENT}}

{{#if DESCRIPTION}}
{{DESCRIPTION}}

{{/if}}
{{#if SECURITY_SECTION}}
### Security

{{SECURITY_SECTION}}

{{/if}}
{{#if INPUTS_SECTION}}
### Parameters

{{INPUTS_SECTION}}

{{/if}}
{{#if OUTPUTS_SECTION}}
### Returns

{{OUTPUTS_SECTION}}

{{/if}}
{{#if EXAMPLE_CODE}}
### Example

\`\`\`typescript
{{EXAMPLE_CODE}}
\`\`\`

{{/if}}
{{#if IMPLEMENTATION_PATH}}
### Implementation

Source: [\`{{IMPLEMENTATION_PATH}}\`]({{IMPLEMENTATION_PATH}})

{{/if}}
`;

const DEFAULT_SPEC_EXAMPLES_TEMPLATE = `## Usage Examples

{{#if SETUP_CODE}}
### Setup

\`\`\`typescript
{{SETUP_CODE}}
\`\`\`

{{/if}}
{{EXAMPLES_SECTION}}
`;

const DEFAULT_SPEC_ERRORS_TEMPLATE = `## Error Reference

{{ERROR_TABLE}}
`;

const DEFAULT_SPEC_ALL_TEMPLATE = `# {{TITLE}}

## Table of Contents

{{TOC}}

## API Reference

{{API_SECTION}}

{{#if EXAMPLES_SECTION}}
{{EXAMPLES_SECTION}}

{{/if}}
{{#if ERRORS_SECTION}}
{{ERRORS_SECTION}}

{{/if}}
`;

/** Map of template names to default content */
const DEFAULT_TEMPLATES: Record<string, string> = {
  'adr': DEFAULT_ADR_TEMPLATE,
  'adr-index': DEFAULT_ADR_INDEX_TEMPLATE,
  'spec-api': DEFAULT_SPEC_API_TEMPLATE,
  'spec-examples': DEFAULT_SPEC_EXAMPLES_TEMPLATE,
  'spec-errors': DEFAULT_SPEC_ERRORS_TEMPLATE,
  'spec-all': DEFAULT_SPEC_ALL_TEMPLATE,
};

// ============================================================================
// Template Engine
// ============================================================================

/**
 * Documentation template engine.
 * Loads templates from custom directory or falls back to defaults.
 */
export class DocTemplateEngine {
  private projectRoot: string;
  private templateDir: string;
  private extension: string;
  private templateCache: Map<string, string> = new Map();

  constructor(projectRoot: string, options: TemplateOptions = {}) {
    this.projectRoot = projectRoot;
    this.templateDir = options.templateDir || '.arch/templates/docs';
    this.extension = options.extension || '.md.hbs';
  }

  /**
   * Render a template with the given context.
   */
  async render(templateName: string, context: TemplateContext): Promise<TemplateResult> {
    try {
      // Try to load custom template
      const customPath = path.resolve(
        this.projectRoot,
        this.templateDir,
        `${templateName}${this.extension}`
      );

      let template: string;
      let templateSource: 'custom' | 'default';

      if (await fileExists(customPath)) {
        template = await this.loadTemplate(customPath);
        templateSource = 'custom';
      } else if (DEFAULT_TEMPLATES[templateName]) {
        template = DEFAULT_TEMPLATES[templateName];
        templateSource = 'default';
      } else {
        return {
          valid: false,
          content: '',
          templateSource: 'default',
          errors: [{ code: 'TEMPLATE_NOT_FOUND', message: `Template '${templateName}' not found` }],
        };
      }

      // Render template
      const content = this.applyTemplate(template, context);

      return {
        valid: true,
        content,
        templateSource,
        errors: [],
      };
    } catch (error) {
      return {
        valid: false,
        content: '',
        templateSource: 'default',
        errors: [{
          code: 'RENDER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        }],
      };
    }
  }

  /**
   * Load template from file with caching.
   */
  private async loadTemplate(filePath: string): Promise<string> {
    if (this.templateCache.has(filePath)) {
      return this.templateCache.get(filePath)!;
    }

    const content = await readFile(filePath);
    this.templateCache.set(filePath, content);
    return content;
  }

  /**
   * Apply Handlebars-style substitution to template.
   * Supports:
   * - {{VARIABLE}} - Simple substitution
   * - {{#if VAR}}...{{/if}} - Conditional blocks
   * - {{#unless VAR}}...{{/unless}} - Inverse conditional
   * - {{#each ARRAY}}...{{/each}} - Array iteration (limited)
   */
  private applyTemplate(template: string, context: TemplateContext): string {
    let result = template;

    // Process {{#if VAR}}...{{else}}...{{/if}} blocks
    result = this.processConditionals(result, context);

    // Process {{#unless VAR}}...{{/unless}} blocks
    result = this.processUnless(result, context);

    // Process simple variable substitutions
    result = this.processVariables(result, context);

    // Clean up any remaining unmatched conditionals
    result = result.replace(/\{\{#(?:if|unless|each)[^}]*\}\}[\s\S]*?\{\{\/(?:if|unless|each)\}\}/g, '');

    // Clean up excessive blank lines
    result = result.replace(/\n{3,}/g, '\n\n');

    return result.trim() + '\n';
  }

  /**
   * Process {{#if VAR}}...{{else}}...{{/if}} blocks.
   */
  private processConditionals(template: string, context: TemplateContext): string {
    // Match {{#if VAR}}...{{else}}...{{/if}} or {{#if VAR}}...{{/if}}
    const ifPattern = /\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;

    return template.replace(ifPattern, (_, varName: string, ifContent: string, elseContent: string = '') => {
      const value = context[varName];
      const isTruthy = value !== undefined && value !== null && value !== false && value !== '' &&
        !(Array.isArray(value) && value.length === 0);

      if (isTruthy) {
        return this.processConditionals(ifContent, context);
      } else {
        return this.processConditionals(elseContent, context);
      }
    });
  }

  /**
   * Process {{#unless VAR}}...{{/unless}} blocks.
   */
  private processUnless(template: string, context: TemplateContext): string {
    const unlessPattern = /\{\{#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g;

    return template.replace(unlessPattern, (_, varName: string, content: string) => {
      const value = context[varName];
      const isFalsy = value === undefined || value === null || value === false || value === '' ||
        (Array.isArray(value) && value.length === 0);

      return isFalsy ? this.processUnless(content, context) : '';
    });
  }

  /**
   * Process simple {{VARIABLE}} substitutions.
   */
  private processVariables(template: string, context: TemplateContext): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, varName: string) => {
      const value = context[varName];
      if (value === undefined || value === null) {
        return '';
      }
      if (Array.isArray(value)) {
        return value.join('\n');
      }
      return String(value);
    });
  }

  /**
   * Check if a custom template exists.
   */
  async hasCustomTemplate(templateName: string): Promise<boolean> {
    const customPath = path.resolve(
      this.projectRoot,
      this.templateDir,
      `${templateName}${this.extension}`
    );
    return fileExists(customPath);
  }

  /**
   * List available templates (both custom and default).
   */
  async listTemplates(): Promise<Array<{ name: string; source: 'custom' | 'default' }>> {
    const templates: Array<{ name: string; source: 'custom' | 'default' }> = [];

    // Add defaults
    for (const name of Object.keys(DEFAULT_TEMPLATES)) {
      const hasCustom = await this.hasCustomTemplate(name);
      templates.push({
        name,
        source: hasCustom ? 'custom' : 'default',
      });
    }

    return templates;
  }

  /**
   * Clear template cache (useful for watch mode).
   */
  clearCache(): void {
    this.templateCache.clear();
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get all default templates.
 */
export function getDefaultTemplates(): Record<string, string> {
  return { ...DEFAULT_TEMPLATES };
}

/**
 * Create a template engine instance.
 */
export function createTemplateEngine(
  projectRoot: string,
  options?: TemplateOptions
): DocTemplateEngine {
  return new DocTemplateEngine(projectRoot, options);
}
