/**
 * @arch archcodex.barrel
 *
 * ArchCodex - The Architectural Compiler for LLM Agents
 * Main library exports barrel file.
 */

// Configuration
export * from './core/config/index.js';

// Registry
export * from './core/registry/index.js';

// Arch Tag Parsing
export * from './core/arch-tag/index.js';

// Validation
export * from './core/validation/index.js';

// Constraints
export * from './core/constraints/index.js';

// Validators
export * from './validators/index.js';

// Utilities
export * from './utils/index.js';

// CLI
export { createCli } from './cli/index.js';
