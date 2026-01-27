/**
 * @arch archcodex.core.barrel
 *
 * Coverage validation module exports.
 */
export { CoverageValidator } from './validator.js';
export {
  applyTransform,
  toPascalCase,
  toCamelCase,
  toSnakeCase,
  toUpperCase,
  toKebabCase,
} from './transforms.js';
export type {
  CoverageSourceType,
  CoverageSource,
  CoverageMatch,
  CoverageGap,
  CoverageConstraintConfig,
  CoverageValidationResult,
} from './types.js';
