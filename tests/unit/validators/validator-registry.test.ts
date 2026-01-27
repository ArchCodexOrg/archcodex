/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * Tests for validator registry.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validatorRegistry } from '../../../src/validators/validator-registry.js';
import type { ILanguageValidator } from '../../../src/validators/interface.types.js';
import type { SemanticModel } from '../../../src/validators/semantic.types.js';

// Create mock validator
function createMockValidator(): ILanguageValidator {
  return {
    supportedLanguages: ['typescript'],
    supportedExtensions: ['.ts', '.tsx'],
    capabilities: {
      hasClassInheritance: true,
      hasInterfaces: true,
      hasDecorators: true,
      hasVisibilityModifiers: true,
    },
    parseFile: vi.fn().mockResolvedValue({} as SemanticModel),
    dispose: vi.fn(),
  };
}

describe('ValidatorRegistry', () => {
  beforeEach(() => {
    validatorRegistry.clear();
  });

  describe('register', () => {
    it('should register a validator with factory', () => {
      const mockValidator = createMockValidator();
      const factory = () => mockValidator;

      validatorRegistry.register(
        'typescript',
        factory,
        ['typescript'],
        ['.ts', '.tsx']
      );

      expect(validatorRegistry.isSupported('.ts')).toBe(true);
      expect(validatorRegistry.isSupported('.tsx')).toBe(true);
    });

    it('should map extensions to validator ID', () => {
      const factory = () => createMockValidator();

      validatorRegistry.register(
        'test-validator',
        factory,
        ['typescript'],
        ['.custom']
      );

      expect(validatorRegistry.getRegisteredValidators()).toContain('test-validator');
    });

    it('should use provided capabilities', () => {
      const factory = () => createMockValidator();
      const customCaps = {
        hasClassInheritance: false,
        hasInterfaces: false,
        hasDecorators: false,
        hasVisibilityModifiers: false,
      };

      validatorRegistry.register(
        'no-caps',
        factory,
        ['typescript'],
        ['.nocaps'],
        customCaps
      );

      const caps = validatorRegistry.getCapabilitiesForExtension('.nocaps');
      expect(caps?.hasClassInheritance).toBe(false);
    });
  });

  describe('getForExtension', () => {
    it('should return validator for registered extension', () => {
      const mockValidator = createMockValidator();
      validatorRegistry.register(
        'typescript',
        () => mockValidator,
        ['typescript'],
        ['.ts']
      );

      const validator = validatorRegistry.getForExtension('.ts');

      expect(validator).toBe(mockValidator);
    });

    it('should return null for unregistered extension', () => {
      const validator = validatorRegistry.getForExtension('.unknown');

      expect(validator).toBeNull();
    });

    it('should be case-insensitive', () => {
      const mockValidator = createMockValidator();
      validatorRegistry.register(
        'typescript',
        () => mockValidator,
        ['typescript'],
        ['.ts']
      );

      expect(validatorRegistry.getForExtension('.TS')).toBe(mockValidator);
      expect(validatorRegistry.getForExtension('.Ts')).toBe(mockValidator);
    });

    it('should lazily instantiate validator', () => {
      const mockValidator = createMockValidator();
      const factory = vi.fn(() => mockValidator);

      validatorRegistry.register(
        'lazy',
        factory,
        ['typescript'],
        ['.lazy']
      );

      // Factory not called until getForExtension
      expect(factory).not.toHaveBeenCalled();

      validatorRegistry.getForExtension('.lazy');
      expect(factory).toHaveBeenCalledTimes(1);

      // Second call reuses instance
      validatorRegistry.getForExtension('.lazy');
      expect(factory).toHaveBeenCalledTimes(1);
    });
  });

  describe('getById', () => {
    it('should return validator by ID', () => {
      const mockValidator = createMockValidator();
      validatorRegistry.register(
        'my-validator',
        () => mockValidator,
        ['typescript'],
        ['.ts']
      );

      const validator = validatorRegistry.getById('my-validator');

      expect(validator).toBe(mockValidator);
    });

    it('should return null for unregistered ID', () => {
      const validator = validatorRegistry.getById('nonexistent');

      expect(validator).toBeNull();
    });
  });

  describe('getCapabilitiesForExtension', () => {
    it('should return capabilities for extension', () => {
      const factory = () => createMockValidator();
      validatorRegistry.register(
        'typescript',
        factory,
        ['typescript'],
        ['.ts']
      );

      const caps = validatorRegistry.getCapabilitiesForExtension('.ts');

      expect(caps?.hasClassInheritance).toBe(true);
      expect(caps?.hasInterfaces).toBe(true);
    });

    it('should return null for unregistered extension', () => {
      const caps = validatorRegistry.getCapabilitiesForExtension('.unknown');

      expect(caps).toBeNull();
    });
  });

  describe('isSupported', () => {
    it('should return true for registered extension', () => {
      validatorRegistry.register(
        'test',
        () => createMockValidator(),
        ['typescript'],
        ['.test']
      );

      expect(validatorRegistry.isSupported('.test')).toBe(true);
    });

    it('should return false for unregistered extension', () => {
      expect(validatorRegistry.isSupported('.nope')).toBe(false);
    });

    it('should be case-insensitive', () => {
      validatorRegistry.register(
        'test',
        () => createMockValidator(),
        ['typescript'],
        ['.test']
      );

      expect(validatorRegistry.isSupported('.TEST')).toBe(true);
    });
  });

  describe('getSupportedExtensions', () => {
    it('should return all registered extensions', () => {
      validatorRegistry.register(
        'test1',
        () => createMockValidator(),
        ['typescript'],
        ['.ts', '.tsx']
      );
      validatorRegistry.register(
        'test2',
        () => createMockValidator(),
        ['javascript'],
        ['.js']
      );

      const extensions = validatorRegistry.getSupportedExtensions();

      expect(extensions).toContain('.ts');
      expect(extensions).toContain('.tsx');
      expect(extensions).toContain('.js');
    });

    it('should return empty array when no validators registered', () => {
      const extensions = validatorRegistry.getSupportedExtensions();

      expect(extensions).toEqual([]);
    });
  });

  describe('getRegisteredValidators', () => {
    it('should return all validator IDs', () => {
      validatorRegistry.register(
        'validator-a',
        () => createMockValidator(),
        ['typescript'],
        ['.a']
      );
      validatorRegistry.register(
        'validator-b',
        () => createMockValidator(),
        ['javascript'],
        ['.b']
      );

      const ids = validatorRegistry.getRegisteredValidators();

      expect(ids).toContain('validator-a');
      expect(ids).toContain('validator-b');
    });
  });

  describe('disposeAll', () => {
    it('should dispose all instantiated validators', () => {
      const mockValidator1 = createMockValidator();
      const mockValidator2 = createMockValidator();

      validatorRegistry.register(
        'val1',
        () => mockValidator1,
        ['typescript'],
        ['.v1']
      );
      validatorRegistry.register(
        'val2',
        () => mockValidator2,
        ['typescript'],
        ['.v2']
      );

      // Instantiate both
      validatorRegistry.getForExtension('.v1');
      validatorRegistry.getForExtension('.v2');

      validatorRegistry.disposeAll();

      expect(mockValidator1.dispose).toHaveBeenCalled();
      expect(mockValidator2.dispose).toHaveBeenCalled();
    });

    it('should not throw when no validators instantiated', () => {
      validatorRegistry.register(
        'val',
        () => createMockValidator(),
        ['typescript'],
        ['.v']
      );

      expect(() => validatorRegistry.disposeAll()).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should remove all registrations', () => {
      validatorRegistry.register(
        'test',
        () => createMockValidator(),
        ['typescript'],
        ['.test']
      );

      validatorRegistry.clear();

      expect(validatorRegistry.isSupported('.test')).toBe(false);
      expect(validatorRegistry.getRegisteredValidators()).toEqual([]);
    });

    it('should dispose validators before clearing', () => {
      const mockValidator = createMockValidator();
      validatorRegistry.register(
        'test',
        () => mockValidator,
        ['typescript'],
        ['.test']
      );

      // Instantiate
      validatorRegistry.getForExtension('.test');

      validatorRegistry.clear();

      expect(mockValidator.dispose).toHaveBeenCalled();
    });
  });
});
