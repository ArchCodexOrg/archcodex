/**
 * @arch archcodex.core.barrel
 *
 * Barrel exports for simulate module.
 */
export { SimulationAnalyzer, formatRegistryChanges } from './analyzer.js';
export type {
  SimulationResult,
  SimulationOptions,
  SimulationSummary,
  SimulationInput,
  FileImpact,
  RiskLevel,
  ImpactType,
  FormattedChanges,
  FormattedArchChange,
  FormattedConstraintChange,
} from './types.js';
