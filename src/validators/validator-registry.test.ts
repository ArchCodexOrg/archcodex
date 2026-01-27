/**
 * @arch archcodex.test
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validatorRegistry, type ILanguageValidator } from './validator-registry.js';
import type { LanguageCapabilities, SemanticModel, SupportedLanguage } from './semantic.types.js';

// Mock validator for testing
const createMockValidator = (): ILanguageValidator => ({
  supportedLanguages: ['typescript'] as SupportedLanguage[],
  supportedExtensions: ['.ts'],
  capabilities: { hasClassInheritance: true, hasInterfaces: true, hasDecorators: true, hasVisibilityModifiers: true },
  parseFile: vi.fn().mockResolvedValue({} as SemanticModel),
  dispose: vi.fn(),
});

describe('ValidatorRegistry', () => {
  beforeEach(() => {
    validatorRegistry.clear();
  });

  describe('register', () => {
    it('registers a validator', () => {
      const factory = createMockValidator;
      const caps: LanguageCapabilities = { hasClassInheritance: true, hasInterfaces: true, hasDecorators: true, hasVisibilityModifiers: true };

      validatorRegistry.register('test', factory, ['typescript'], ['.ts', '.tsx'], caps);

      expect(validatorRegistry.isSupported('.ts')).toBe(true);
      expect(validatorRegistry.isSupported('.tsx')).toBe(true);
    });
  });

  describe('getForExtension', () => {
    it('returns validator for registered extension', () => {
      validatorRegistry.register('test', createMockValidator, ['typescript'], ['.ts']);

      const validator = validatorRegistry.getForExtension('.ts');
      expect(validator).not.toBeNull();
    });

    it('returns null for unregistered extension', () => {
      expect(validatorRegistry.getForExtension('.py')).toBeNull();
    });

    it('is case insensitive', () => {
      validatorRegistry.register('test', createMockValidator, ['typescript'], ['.ts']);
      expect(validatorRegistry.getForExtension('.TS')).not.toBeNull();
    });
  });

  describe('getById', () => {
    it('returns validator by ID', () => {
      validatorRegistry.register('myvalidator', createMockValidator, ['typescript'], ['.ts']);
      expect(validatorRegistry.getById('myvalidator')).not.toBeNull();
    });

    it('returns null for unknown ID', () => {
      expect(validatorRegistry.getById('unknown')).toBeNull();
    });

    it('lazily instantiates validators', () => {
      const factory = vi.fn(createMockValidator);
      validatorRegistry.register('lazy', factory, ['typescript'], ['.ts']);

      expect(factory).not.toHaveBeenCalled();
      validatorRegistry.getById('lazy');
      expect(factory).toHaveBeenCalledTimes(1);
      validatorRegistry.getById('lazy');
      expect(factory).toHaveBeenCalledTimes(1); // Still only once
    });
  });

  describe('getSupportedExtensions', () => {
    it('returns all registered extensions', () => {
      validatorRegistry.register('test', createMockValidator, ['typescript'], ['.ts', '.tsx']);
      const exts = validatorRegistry.getSupportedExtensions();
      expect(exts).toContain('.ts');
      expect(exts).toContain('.tsx');
    });
  });

  describe('disposeAll', () => {
    it('disposes all instantiated validators', () => {
      const mockValidator = createMockValidator();
      validatorRegistry.register('test', () => mockValidator, ['typescript'], ['.ts']);
      validatorRegistry.getById('test'); // Instantiate

      validatorRegistry.disposeAll();
      expect(mockValidator.dispose).toHaveBeenCalled();
    });
  });
});
