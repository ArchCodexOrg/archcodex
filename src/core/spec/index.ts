/**
 * @arch archcodex.core.barrel
 *
 * SpecCodex - Specification by Example for code and test generation.
 */

// Schema exports
export {
  InputFieldSchema,
  OutputFieldSchema,
  SecuritySchema,
  InvariantSchema,
  ExampleSchema,
  BoundaryExampleSchema,
  EffectSchema,
  MixinRefSchema,
  SpecNodeSchema,
  MixinDefinitionSchema,
  BaseSpecRegistrySchema,
  MixinRegistrySchema,
  SpecRegistrySchema,
  type InputField,
  type OutputField,
  type Security,
  type Invariant,
  type Example,
  type BoundaryExample,
  type Effect,
  type MixinRef,
  type SpecNode,
  type MixinDefinition,
  type BaseSpecRegistry,
  type MixinRegistry,
  type SpecRegistry,
  type ParsedSpec,
  type ResolvedSpec,
  type SpecValidationError,
  type SpecParseResult,
  type SpecResolveResult,
} from './schema.js';

// Loader exports
export {
  loadSpecRegistry,
  loadSpecFile,
  findSpec,
  specRegistryExists,
  getSpecsDir,
  listSpecIds,
  listSpecMixinIds,
  hasSpec,
  hasSpecMixin,
} from './loader.js';

// Resolver exports
export {
  resolveSpec,
  formatSpecForLLM,
  getSpecAncestors,
  getSpecDependents,
  type SpecResolveOptions,
} from './resolver.js';

// Validator exports
export {
  validateSpecRegistry,
  validateSpec,
  formatValidationSummary,
  type SpecValidationResult,
  type SpecValidateOptions,
} from './validator.js';

// Placeholder exports
export {
  isPlaceholder,
  expandPlaceholder,
  expandPlaceholders,
  isPlaceholderError,
  assertionToExpect,
  listPlaceholders,
  type PlaceholderContext,
  type PlaceholderResult,
  type PlaceholderError,
} from './placeholders.js';

// Generator exports
export {
  generateUnitTests,
  extractManualCode,
  mergeWithExisting,
  type UnitGeneratorOptions,
  type UnitGeneratorResult,
  generatePropertyTests,
  type PropertyGeneratorOptions,
  type PropertyGeneratorResult,
  generateIntegrationTests,
  type IntegrationGeneratorOptions,
  type IntegrationGeneratorResult,
  generateApiDocs,
  generateExampleDocs,
  generateErrorDocs,
  generateAllDocs,
  type DocGeneratorOptions,
  type DocGeneratorResult,
  generateUITests,
  hasUISection,
  parseImplementationPath,
  type UITestFramework,
  type UIGeneratorOptions,
  type UIGeneratorResult,
} from './generators/index.js';

// Verifier exports
export {
  verifyImplementation,
  inferImplementationPath,
  formatVerifyResult,
  type VerifyOptions,
  type VerifyResult,
  type DriftItem,
} from './verifier.js';

// Schema documentation exports
export {
  getSpecSchema,
  formatSchemaDoc,
  type SchemaFilter,
  type SchemaDocsOptions,
  type SchemaDocsResult,
} from './schema-docs.js';

// Drift detection exports
export {
  findUnwiredSpecs, formatUnwiredReport,
  type FindUnwiredOptions, type FindUnwiredResult, type UnwiredSpec, type WiringCoverage,
  findUndocumentedImplementations, formatUndocumentedReport,
  type FindUndocumentedOptions, type FindUndocumentedResult, type UndocumentedFile, type UndocumentedSummary,
  generateDriftReport, formatDriftReport,
  type DriftReportOptions, type DriftReportResult, type DriftReportSummary,
  type DriftIssue, type IssueType, type IssueSeverity,
} from './drift/index.js';

// Fixture exports
export {
  FixtureParamSchema,
  FixtureDefinitionSchema,
  FixtureRegistrySchema,
  loadFixtures,
  createFixtureContext,
  resolveFixture,
  isDocumentationOnly,
  isFixtureReference,
  parseFixtureReference,
  listFixtures,
  getFixturesTemplate,
  type FixtureDefinition,
  type FixtureRegistry,
  type FixtureContext,
  type FixtureResult,
} from './fixtures.js';

// Scaffold touchpoints exports
export {
  generateTouchpointsFromEntity,
  generateTouchpointsFromMatch,
  generateTouchpointsFromRegistry,
  deriveHandlerName,
  extractOperationFromSpecId,
  generateTouchpointsYaml,
  generateSpecWithTouchpoints,
  type UITouchpoint,
  type ScaffoldTouchpointsResult,
  type ScaffoldTouchpointsOptions,
} from './scaffold-touchpoints.js';

// Inferrer and enrichment exports
export {
  inferSpec, inferSpecUpdate,
  type InferOptions, type InferResult, type InferUpdateOptions, type InferUpdateResult,
  type DetectedPattern, type TypeMapping, type MergeReport,
  type CodeContext, type EnrichmentRequest, type EnrichedSections,
} from './inferrer.js';
export { gatherCodeContext } from './infer-context.js';
export { buildEnrichmentPrompt, parseEnrichmentResponse, mergeEnrichedSections } from './infer-prompts.js';
