/**
 * @arch archcodex.core.domain
 *
 * SpecCodex test generators barrel file.
 */

// Unit test generator
export {
  generateUnitTests,
  extractManualCode,
  mergeWithExisting,
  type UnitGeneratorOptions,
  type UnitGeneratorResult,
} from './unit.js';

// Property-based test generator
export {
  generatePropertyTests,
  type PropertyGeneratorOptions,
  type PropertyGeneratorResult,
} from './property.js';

// Integration test generator
export {
  generateIntegrationTests,
  type IntegrationGeneratorOptions,
  type IntegrationGeneratorResult,
} from './integration.js';

// Signature extractor for implementation-aware generation
export {
  extractFunctionSignature,
  parseImplementationPath,
  generateImportStatement,
  generateFunctionCall,
  type ExtractedSignature,
  type ExtractedParameter,
  type SignatureExtractorOptions,
} from './signature-extractor.js';

// Documentation generator
export {
  generateApiDocs,
  generateExampleDocs,
  generateErrorDocs,
  generateAllDocs,
  type DocGeneratorOptions,
  type DocGeneratorResult,
} from './docs.js';

// UI test generator
export {
  generateUITests,
  hasUISection,
  type UITestFramework,
  type UIGeneratorOptions,
  type UIGeneratorResult,
} from './ui.js';

// Shared utilities
export {
  toValidIdentifier,
  specIdToFunctionName,
  extractExampleInput,
  extractExampleOutput,
  generateAssertionsFromThen,
  generateOutputSchemaAssertions,
  deriveTestName,
  suggestImportPath,
  type PlaceholderContext,
} from './shared.js';

