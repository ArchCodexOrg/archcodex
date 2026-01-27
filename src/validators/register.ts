/**
 * @arch archcodex.infra.validator-support
 *
 * Validator registration module.
 * Registers all built-in language validators with the registry.
 * Import this module to ensure validators are available before use.
 */

import { validatorRegistry } from './validator-registry.js';
import { TypeScriptValidator } from './typescript.js';
import { PythonValidator } from './python.js';
import { TYPESCRIPT_CAPABILITIES, PYTHON_CAPABILITIES } from './capabilities.js';

validatorRegistry.register('typescript', () => new TypeScriptValidator(),
  ['typescript', 'javascript'], ['.ts', '.tsx', '.js', '.jsx'], TYPESCRIPT_CAPABILITIES);
validatorRegistry.register('python', () => new PythonValidator(),
  ['python'], ['.py'], PYTHON_CAPABILITIES);
