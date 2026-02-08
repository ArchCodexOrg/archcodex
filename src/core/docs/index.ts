/**
 * @arch archcodex.core.barrel
 *
 * Documentation generators barrel file.
 */

// ADR Generator
export {
  generateAdr,
  generateAllAdrs,
  type AdrGeneratorOptions,
  type AdrGeneratorResult,
  type AllAdrsOptions,
  type AllAdrsResult,
} from './adr-generator.js';

// Template Engine
export {
  DocTemplateEngine,
  createTemplateEngine,
  getDefaultTemplates,
  type TemplateContext,
  type TemplateOptions,
  type TemplateResult,
} from './template-engine.js';
