/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for config schema Zod validation.
 */
import { describe, it, expect } from 'vitest';
import {
  ConfigSchema,
  UntaggedPolicySchema,
  FileScanPatternsSchema,
  FilePoliciesSchema,
  ExitCodesSchema,
  MissingWhyBehaviorSchema,
  ValidationSettingsSchema,
  HydrationFormatSchema,
  HydrationSettingsSchema,
  PointerBasePathsSchema,
  PointerSettingsSchema,
  OverrideSettingsSchema,
  OutputFormatSchema,
  PrecommitSettingsSchema,
  LLMProviderTypeSchema,
  LLMProviderConfigSchema,
  LLMSettingsSchema,
  ConstraintRuleRefSchema,
  NonApplicableConstraintBehaviorSchema,
  LanguageSettingsSchema,
  LanguagesConfigSchema,
  PackageConfigSchema,
  PackagesConfigSchema,
  LayerConfigSchema,
  LayersConfigSchema,
  InferenceRuleConfigSchema,
  InferenceSettingsSchema,
  UndefinedIntentBehaviorSchema,
  IntentSettingsSchema,
  DiscoverySettingsSchema,
  TableDetectionModeSchema,
  TableDetectionSettingsSchema,
  HealthConfigSchema,
  AnalysisDeepPatternsSchema,
  AnalysisConfigSchema,
} from '../../../../src/core/config/schema.js';

describe('UntaggedPolicySchema', () => {
  it('should accept valid values', () => {
    expect(UntaggedPolicySchema.parse('allow')).toBe('allow');
    expect(UntaggedPolicySchema.parse('warn')).toBe('warn');
    expect(UntaggedPolicySchema.parse('deny')).toBe('deny');
  });

  it('should reject invalid values', () => {
    expect(() => UntaggedPolicySchema.parse('ignore')).toThrow();
    expect(() => UntaggedPolicySchema.parse('')).toThrow();
    expect(() => UntaggedPolicySchema.parse(42)).toThrow();
  });
});

describe('FileScanPatternsSchema', () => {
  it('should provide default include patterns', () => {
    const result = FileScanPatternsSchema.parse({});
    expect(result.include).toContain('**/*.ts');
    expect(result.include).toContain('**/*.py');
    expect(result.include).toContain('**/*.go');
  });

  it('should provide default exclude patterns', () => {
    const result = FileScanPatternsSchema.parse({});
    expect(result.exclude).toContain('**/node_modules/**');
    expect(result.exclude).toContain('**/dist/**');
    expect(result.exclude).toContain('**/*.d.ts');
    expect(result.exclude).toContain('**/*.test.ts');
  });

  it('should allow overriding include patterns', () => {
    const result = FileScanPatternsSchema.parse({
      include: ['**/*.rs'],
    });
    expect(result.include).toEqual(['**/*.rs']);
  });

  it('should allow overriding exclude patterns', () => {
    const result = FileScanPatternsSchema.parse({
      exclude: ['**/vendor/**'],
    });
    expect(result.exclude).toEqual(['**/vendor/**']);
  });
});

describe('FilePoliciesSchema', () => {
  it('should parse empty object and apply defaults', () => {
    const result = FilePoliciesSchema.parse({});
    expect(result.scan).toBeDefined();
    expect(result.untagged).toBeDefined();
    expect(result.untagged.policy).toBe('warn');
  });

  it('should accept custom untagged policy', () => {
    const result = FilePoliciesSchema.parse({
      untagged: { policy: 'deny' },
    });
    expect(result.untagged.policy).toBe('deny');
  });
});

describe('ExitCodesSchema', () => {
  it('should provide defaults', () => {
    const result = ExitCodesSchema.parse({});
    expect(result.success).toBe(0);
    expect(result.error).toBe(1);
    expect(result.warning_only).toBe(0);
  });

  it('should accept custom exit codes', () => {
    const result = ExitCodesSchema.parse({ error: 2, warning_only: 1 });
    expect(result.error).toBe(2);
    expect(result.warning_only).toBe(1);
  });
});

describe('MissingWhyBehaviorSchema', () => {
  it('should accept valid values', () => {
    expect(MissingWhyBehaviorSchema.parse('ignore')).toBe('ignore');
    expect(MissingWhyBehaviorSchema.parse('warning')).toBe('warning');
    expect(MissingWhyBehaviorSchema.parse('error')).toBe('error');
  });

  it('should reject invalid values', () => {
    expect(() => MissingWhyBehaviorSchema.parse('skip')).toThrow();
  });
});

describe('ValidationSettingsSchema', () => {
  it('should provide defaults for empty object', () => {
    const result = ValidationSettingsSchema.parse({});
    expect(result.fail_on_warning).toBe(false);
    expect(result.max_overrides_per_file).toBe(3);
    expect(result.fail_on_expired_override).toBe(true);
    expect(result.missing_why).toBe('ignore');
  });

  it('should accept concurrency within range', () => {
    const result = ValidationSettingsSchema.parse({ concurrency: 8 });
    expect(result.concurrency).toBe(8);
  });

  it('should reject concurrency outside range', () => {
    expect(() => ValidationSettingsSchema.parse({ concurrency: 0 })).toThrow();
    expect(() => ValidationSettingsSchema.parse({ concurrency: 65 })).toThrow();
  });

  it('should reject negative max_overrides_per_file', () => {
    expect(() => ValidationSettingsSchema.parse({ max_overrides_per_file: -1 })).toThrow();
  });
});

describe('HydrationFormatSchema', () => {
  it('should accept valid formats', () => {
    expect(HydrationFormatSchema.parse('terse')).toBe('terse');
    expect(HydrationFormatSchema.parse('verbose')).toBe('verbose');
  });

  it('should reject invalid formats', () => {
    expect(() => HydrationFormatSchema.parse('compact')).toThrow();
  });
});

describe('HydrationSettingsSchema', () => {
  it('should provide defaults', () => {
    const result = HydrationSettingsSchema.parse({});
    expect(result.format).toBe('terse');
    expect(result.include_why).toBe(true);
    expect(result.show_inheritance).toBe(false);
    expect(result.max_header_tokens).toBe(500);
  });

  it('should reject max_header_tokens below minimum', () => {
    expect(() => HydrationSettingsSchema.parse({ max_header_tokens: 50 })).toThrow();
  });

  it('should accept valid max_header_tokens', () => {
    const result = HydrationSettingsSchema.parse({ max_header_tokens: 200 });
    expect(result.max_header_tokens).toBe(200);
  });
});

describe('PointerBasePathsSchema', () => {
  it('should provide defaults', () => {
    const result = PointerBasePathsSchema.parse({});
    expect(result.arch).toBe('.arch/docs');
    expect(result.code).toBe('.');
    expect(result.template).toBe('.arch/templates');
  });
});

describe('PointerSettingsSchema', () => {
  it('should provide defaults', () => {
    const result = PointerSettingsSchema.parse({});
    expect(result.default_extension).toBe('.md');
  });
});

describe('OverrideSettingsSchema', () => {
  it('should provide defaults', () => {
    const result = OverrideSettingsSchema.parse({});
    expect(result.required_fields).toEqual(['reason']);
    expect(result.optional_fields).toContain('expires');
    expect(result.optional_fields).toContain('ticket');
    expect(result.warn_no_expiry).toBe(true);
    expect(result.max_expiry_days).toBe(180);
  });

  it('should reject max_expiry_days below 1', () => {
    expect(() => OverrideSettingsSchema.parse({ max_expiry_days: 0 })).toThrow();
  });
});

describe('OutputFormatSchema', () => {
  it('should accept valid formats', () => {
    expect(OutputFormatSchema.parse('human')).toBe('human');
    expect(OutputFormatSchema.parse('json')).toBe('json');
    expect(OutputFormatSchema.parse('compact')).toBe('compact');
  });

  it('should reject invalid formats', () => {
    expect(() => OutputFormatSchema.parse('xml')).toThrow();
  });
});

describe('PrecommitSettingsSchema', () => {
  it('should provide defaults', () => {
    const result = PrecommitSettingsSchema.parse({});
    expect(result.max_errors).toBeNull();
    expect(result.max_warnings).toBeNull();
    expect(result.output_format).toBe('human');
    expect(result.only_staged_files).toBe(false);
    expect(result.include).toEqual([]);
    expect(result.exclude).toEqual([]);
  });

  it('should accept numeric thresholds', () => {
    const result = PrecommitSettingsSchema.parse({ max_errors: 5, max_warnings: 10 });
    expect(result.max_errors).toBe(5);
    expect(result.max_warnings).toBe(10);
  });

  it('should reject negative max_errors', () => {
    expect(() => PrecommitSettingsSchema.parse({ max_errors: -1 })).toThrow();
  });
});

describe('LLMProviderTypeSchema', () => {
  it('should accept valid providers', () => {
    expect(LLMProviderTypeSchema.parse('openai')).toBe('openai');
    expect(LLMProviderTypeSchema.parse('anthropic')).toBe('anthropic');
    expect(LLMProviderTypeSchema.parse('prompt')).toBe('prompt');
  });

  it('should reject invalid providers', () => {
    expect(() => LLMProviderTypeSchema.parse('google')).toThrow();
  });
});

describe('LLMProviderConfigSchema', () => {
  it('should accept empty object (all optional)', () => {
    const result = LLMProviderConfigSchema.parse({});
    expect(result.base_url).toBeUndefined();
    expect(result.model).toBeUndefined();
  });

  it('should accept full config', () => {
    const result = LLMProviderConfigSchema.parse({
      base_url: 'https://api.openai.com/v1',
      model: 'gpt-4',
      api_key: 'sk-test',
      max_tokens: 4096,
      temperature: 0.7,
    });
    expect(result.model).toBe('gpt-4');
    expect(result.temperature).toBe(0.7);
  });

  it('should reject temperature out of range', () => {
    expect(() => LLMProviderConfigSchema.parse({ temperature: -0.1 })).toThrow();
    expect(() => LLMProviderConfigSchema.parse({ temperature: 2.1 })).toThrow();
  });

  it('should reject max_tokens below 1', () => {
    expect(() => LLMProviderConfigSchema.parse({ max_tokens: 0 })).toThrow();
  });
});

describe('LLMSettingsSchema', () => {
  it('should provide defaults', () => {
    const result = LLMSettingsSchema.parse({});
    expect(result.default_provider).toBe('prompt');
    expect(result.providers).toEqual({});
  });
});

describe('ConstraintRuleRefSchema', () => {
  it('should accept all valid constraint rules', () => {
    const validRules = [
      'must_extend', 'implements', 'forbid_import', 'require_import',
      'allow_import', 'require_decorator', 'forbid_decorator',
      'naming_pattern', 'location_pattern', 'max_public_methods',
      'max_file_lines', 'require_test_file', 'importable_by',
      'forbid_circular_deps',
    ];
    for (const rule of validRules) {
      expect(ConstraintRuleRefSchema.parse(rule)).toBe(rule);
    }
  });

  it('should reject unknown rules', () => {
    expect(() => ConstraintRuleRefSchema.parse('custom_rule')).toThrow();
  });
});

describe('NonApplicableConstraintBehaviorSchema', () => {
  it('should accept valid values', () => {
    expect(NonApplicableConstraintBehaviorSchema.parse('skip')).toBe('skip');
    expect(NonApplicableConstraintBehaviorSchema.parse('warn')).toBe('warn');
  });

  it('should reject invalid values', () => {
    expect(() => NonApplicableConstraintBehaviorSchema.parse('error')).toThrow();
  });
});

describe('LanguageSettingsSchema', () => {
  it('should provide defaults', () => {
    const result = LanguageSettingsSchema.parse({});
    expect(result.enabled).toBe(true);
    expect(result.skip_constraints).toEqual([]);
    expect(result.non_applicable_constraints).toBe('skip');
  });

  it('should accept skip_constraints with valid rules', () => {
    const result = LanguageSettingsSchema.parse({
      skip_constraints: ['require_decorator', 'max_public_methods'],
    });
    expect(result.skip_constraints).toEqual(['require_decorator', 'max_public_methods']);
  });

  it('should reject skip_constraints with invalid rules', () => {
    expect(() => LanguageSettingsSchema.parse({
      skip_constraints: ['nonexistent_rule'],
    })).toThrow();
  });
});

describe('LanguagesConfigSchema', () => {
  it('should provide defaults with TS/JS enabled and others disabled', () => {
    const result = LanguagesConfigSchema.parse({});
    expect(result.typescript.enabled).toBe(true);
    expect(result.javascript.enabled).toBe(true);
    expect(result.python.enabled).toBe(false);
    expect(result.go.enabled).toBe(false);
    expect(result.java.enabled).toBe(false);
  });

  it('should allow enabling python', () => {
    const result = LanguagesConfigSchema.parse({
      python: { enabled: true },
    });
    expect(result.python.enabled).toBe(true);
  });
});

describe('PackageConfigSchema', () => {
  it('should parse minimal package', () => {
    const result = PackageConfigSchema.parse({ path: 'packages/core' });
    expect(result.path).toBe('packages/core');
    expect(result.can_import).toEqual([]);
    expect(result.name).toBeUndefined();
  });

  it('should parse full package', () => {
    const result = PackageConfigSchema.parse({
      path: 'packages/ui',
      can_import: ['packages/core', 'packages/utils'],
      name: '@app/ui',
    });
    expect(result.can_import).toEqual(['packages/core', 'packages/utils']);
    expect(result.name).toBe('@app/ui');
  });

  it('should reject missing path', () => {
    expect(() => PackageConfigSchema.parse({})).toThrow();
  });
});

describe('PackagesConfigSchema', () => {
  it('should default to empty array', () => {
    const result = PackagesConfigSchema.parse([]);
    expect(result).toEqual([]);
  });

  it('should parse array of packages', () => {
    const result = PackagesConfigSchema.parse([
      { path: 'pkg/a' },
      { path: 'pkg/b', can_import: ['pkg/a'] },
    ]);
    expect(result).toHaveLength(2);
  });
});

describe('LayerConfigSchema', () => {
  it('should parse minimal layer', () => {
    const result = LayerConfigSchema.parse({
      name: 'core',
      paths: ['src/core/**'],
    });
    expect(result.name).toBe('core');
    expect(result.paths).toEqual(['src/core/**']);
    expect(result.can_import).toEqual([]);
    expect(result.exclude).toEqual([]);
  });

  it('should parse full layer', () => {
    const result = LayerConfigSchema.parse({
      name: 'cli',
      paths: ['src/cli/**'],
      can_import: ['core', 'utils'],
      exclude: ['**/*.test.ts'],
    });
    expect(result.can_import).toEqual(['core', 'utils']);
    expect(result.exclude).toEqual(['**/*.test.ts']);
  });

  it('should reject missing name', () => {
    expect(() => LayerConfigSchema.parse({ paths: ['src/**'] })).toThrow();
  });

  it('should reject missing paths', () => {
    expect(() => LayerConfigSchema.parse({ name: 'core' })).toThrow();
  });
});

describe('LayersConfigSchema', () => {
  it('should default to empty array', () => {
    const result = LayersConfigSchema.parse([]);
    expect(result).toEqual([]);
  });
});

describe('InferenceRuleConfigSchema', () => {
  it('should parse minimal rule', () => {
    const result = InferenceRuleConfigSchema.parse({
      name: 'react-component',
      archId: 'app.component',
      description: 'React components',
    });
    expect(result.name).toBe('react-component');
    expect(result.archId).toBe('app.component');
    expect(result.confidence).toBe('medium');
  });

  it('should parse full rule', () => {
    const result = InferenceRuleConfigSchema.parse({
      name: 'convex-mutation',
      archId: 'backend.mutation',
      confidence: 'high',
      filePattern: 'convex/.*\\.ts$',
      contentPatterns: ['makeMutation', 'v\\.object'],
      matchAll: true,
      description: 'Convex mutations',
    });
    expect(result.confidence).toBe('high');
    expect(result.matchAll).toBe(true);
    expect(result.contentPatterns).toHaveLength(2);
  });

  it('should reject missing required fields', () => {
    expect(() => InferenceRuleConfigSchema.parse({ name: 'test' })).toThrow();
    expect(() => InferenceRuleConfigSchema.parse({ archId: 'x' })).toThrow();
  });

  it('should reject invalid confidence', () => {
    expect(() => InferenceRuleConfigSchema.parse({
      name: 'test',
      archId: 'x',
      description: 'y',
      confidence: 'very-high',
    })).toThrow();
  });
});

describe('InferenceSettingsSchema', () => {
  it('should provide defaults', () => {
    const result = InferenceSettingsSchema.parse({});
    expect(result.use_builtin_rules).toBe(false);
    expect(result.prepend_custom).toBe(true);
    expect(result.validate_arch_ids).toBe(true);
  });
});

describe('UndefinedIntentBehaviorSchema', () => {
  it('should accept valid values', () => {
    expect(UndefinedIntentBehaviorSchema.parse('ignore')).toBe('ignore');
    expect(UndefinedIntentBehaviorSchema.parse('warning')).toBe('warning');
    expect(UndefinedIntentBehaviorSchema.parse('error')).toBe('error');
  });

  it('should reject invalid values', () => {
    expect(() => UndefinedIntentBehaviorSchema.parse('skip')).toThrow();
  });
});

describe('IntentSettingsSchema', () => {
  it('should provide defaults', () => {
    const result = IntentSettingsSchema.parse({});
    expect(result.undefined_intent).toBe('warning');
  });
});

describe('DiscoverySettingsSchema', () => {
  it('should provide defaults', () => {
    const result = DiscoverySettingsSchema.parse({});
    expect(result.auto_sync).toBe(false);
  });
});

describe('TableDetectionModeSchema', () => {
  it('should accept valid modes', () => {
    expect(TableDetectionModeSchema.parse('first_argument')).toBe('first_argument');
    expect(TableDetectionModeSchema.parse('method_chain')).toBe('method_chain');
  });

  it('should reject invalid modes', () => {
    expect(() => TableDetectionModeSchema.parse('auto')).toThrow();
  });
});

describe('TableDetectionSettingsSchema', () => {
  it('should provide defaults', () => {
    const result = TableDetectionSettingsSchema.parse({});
    expect(result.mode).toBe('first_argument');
    expect(result.receiver).toBeUndefined();
  });

  it('should accept receiver for method_chain mode', () => {
    const result = TableDetectionSettingsSchema.parse({
      mode: 'method_chain',
      receiver: 'prisma',
    });
    expect(result.receiver).toBe('prisma');
  });
});

describe('HealthConfigSchema', () => {
  it('should provide defaults', () => {
    const result = HealthConfigSchema.parse({});
    expect(result.similarity_threshold).toBe(0.8);
    expect(result.max_inheritance_depth).toBe(4);
    expect(result.low_usage_threshold).toBe(2);
    expect(result.exclude_inherited_similarity).toBe(true);
  });

  it('should reject similarity_threshold out of range', () => {
    expect(() => HealthConfigSchema.parse({ similarity_threshold: -0.1 })).toThrow();
    expect(() => HealthConfigSchema.parse({ similarity_threshold: 1.1 })).toThrow();
  });

  it('should reject max_inheritance_depth below 1', () => {
    expect(() => HealthConfigSchema.parse({ max_inheritance_depth: 0 })).toThrow();
  });
});

describe('AnalysisDeepPatternsSchema', () => {
  it('should provide empty defaults', () => {
    const result = AnalysisDeepPatternsSchema.parse({});
    expect(result.auth_check).toEqual([]);
    expect(result.ownership_check).toEqual([]);
    expect(result.permission_call).toBe('');
    expect(result.soft_delete_filter).toEqual([]);
    expect(result.db_query).toEqual([]);
    expect(result.db_get).toEqual([]);
  });

  it('should accept custom patterns', () => {
    const result = AnalysisDeepPatternsSchema.parse({
      auth_check: ['isAuthenticated', 'requireAuth'],
      permission_call: 'checkPermission',
    });
    expect(result.auth_check).toEqual(['isAuthenticated', 'requireAuth']);
    expect(result.permission_call).toBe('checkPermission');
  });
});

describe('AnalysisConfigSchema', () => {
  it('should provide defaults', () => {
    const result = AnalysisConfigSchema.parse({});
    expect(result.tool_entities).toEqual(['archcodex', 'speccodex', 'test']);
  });
});

describe('ConfigSchema (full)', () => {
  it('should parse empty object with all defaults', () => {
    const result = ConfigSchema.parse({});

    expect(result.version).toBe('1.0');
    expect(result.files).toBeDefined();
    expect(result.validation).toBeDefined();
    expect(result.hydration).toBeDefined();
    expect(result.pointers).toBeDefined();
    expect(result.overrides).toBeDefined();
    expect(result.llm).toBeDefined();
    expect(result.languages).toBeDefined();
    expect(result.packages).toEqual([]);
    expect(result.layers).toEqual([]);
    expect(result.inference).toBeDefined();
    expect(result.intents).toBeDefined();
    expect(result.discovery).toBeDefined();
    expect(result.table_detection).toBeDefined();
    expect(result.health).toBeDefined();
    expect(result.analysis).toBeDefined();
  });

  it('should handle null/undefined sub-objects via withDefaults', () => {
    const result = ConfigSchema.parse({
      files: null,
      validation: undefined,
      packages: null,
      layers: undefined,
    });

    expect(result.files).toBeDefined();
    expect(result.validation).toBeDefined();
    expect(result.packages).toEqual([]);
    expect(result.layers).toEqual([]);
  });

  it('should accept a realistic config', () => {
    const config = {
      version: '1.0',
      validation: {
        fail_on_warning: true,
        concurrency: 4,
      },
      hydration: {
        format: 'verbose',
        max_header_tokens: 1000,
      },
      languages: {
        python: { enabled: true },
      },
      layers: [
        { name: 'core', paths: ['src/core/**'], can_import: ['utils'] },
        { name: 'utils', paths: ['src/utils/**'] },
      ],
      health: {
        similarity_threshold: 0.75,
      },
    };

    const result = ConfigSchema.parse(config);
    expect(result.validation.fail_on_warning).toBe(true);
    expect(result.hydration.format).toBe('verbose');
    expect(result.languages.python.enabled).toBe(true);
    expect(result.layers).toHaveLength(2);
    expect(result.health.similarity_threshold).toBe(0.75);
  });

  it('should reject invalid top-level fields in nested schemas', () => {
    expect(() => ConfigSchema.parse({
      validation: { concurrency: 100 },
    })).toThrow();
  });

  it('should preserve optional registry field', () => {
    const result = ConfigSchema.parse({ registry: '.arch/my-registry/' });
    expect(result.registry).toBe('.arch/my-registry/');
  });

  it('should leave registry undefined when not provided', () => {
    const result = ConfigSchema.parse({});
    expect(result.registry).toBeUndefined();
  });
});
