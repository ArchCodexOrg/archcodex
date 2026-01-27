/**
 * @arch archcodex.infra.barrel
 *
 * Language validator exports barrel file.
 */

// Core types
export * from './semantic.types.js';
export * from './capabilities.js';
export * from './interface.types.js';

// Validator registry
export * from './validator-registry.js';

// Built-in validators
export * from './typescript.js';
export * from './python.js';
export * from './go.js';

// Registration (ensures validators are registered when barrel is imported)
import './register.js';
