# Configuration Reference

Complete reference for ArchCodex configuration files.

---

## `.arch/config.yaml`

Main configuration file for ArchCodex settings.

```yaml
version: "1.0"

# Spec analysis settings (for archcodex analyze --deep)
analysis:
  deep_patterns:
    auth_check: ['req\.user\b', 'authenticate\(']
    ownership_check: ['\.userId\s*===?\s*']
    permission_call: "checkPermission\\([^)]*,\\s*['\"]([\\w]+)['\"]\\s*\\)"
    soft_delete_filter: ['deletedAt', 'whereNotDeleted']
    db_query: ['prisma\.\w+\.findMany']
    db_get: ['prisma\.\w+\.findUnique']
  tool_entities: ['archcodex', 'speccodex', 'test']

files:
  scan:
    include: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"]
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.d.ts", "**/*.test.ts"]
  untagged:
    policy: warn  # allow | warn | deny
    require_in:
      - "src/domain/**"
    exempt:
      - "**/*.test.ts"

validation:
  fail_on_warning: false
  max_overrides_per_file: 3
  fail_on_expired_override: true
  missing_why: ignore  # ignore | warning | error
  concurrency: 8  # parallel file validation (default: 75% of CPUs, min 2, max 16)
  exit_codes:
    success: 0
    error: 1
    warning_only: 0

  # Pre-commit settings
  precommit:
    max_errors: null      # null = no limit (default)
    max_warnings: null    # null = no limit (default)
    output_format: human  # human | json | compact
    only_staged_files: false

hydration:
  format: terse           # terse | verbose
  include_why: true
  show_inheritance: false
  max_header_tokens: 500

pointers:
  base_paths:
    arch: ".arch/docs"
    code: "."
    template: ".arch/templates"
  default_extension: ".md"

overrides:
  required_fields: [reason]
  optional_fields: [expires, ticket, approved_by]
  warn_no_expiry: true
  max_expiry_days: 180

intents:
  undefined_intent: warning  # ignore | warning | error

# LLM provider settings
llm:
  default_provider: prompt  # openai | anthropic | prompt
  providers:
    openai:
      base_url: "https://api.openai.com/v1"
      model: "gpt-4o-mini"
      api_key: "${OPENAI_API_KEY}"
      max_tokens: 4096
      temperature: 0.7
    anthropic:
      base_url: "https://api.anthropic.com"
      model: "claude-3-haiku-20240307"
      api_key: "${ANTHROPIC_API_KEY}"

# Discovery settings
discovery:
  auto_sync: false  # Auto-sync index after registry changes

# Health dashboard thresholds
health:
  similarity_threshold: 0.8
  max_inheritance_depth: 4
  low_usage_threshold: 2
  exclude_inherited_similarity: true

# Target detection for require_companion_call
table_detection:
  mode: first_argument  # first_argument | method_chain

# Language-specific validation settings
languages:
  typescript:
    enabled: true
  python:
    enabled: true   # Experimental
  go:
    enabled: true   # Experimental

# Monorepo package boundaries
packages: []

# Inference settings for architecture auto-detection
inference:
  validate_arch_ids: true
  use_builtin_rules: false
  custom_rules: []
```

---

## Configuration Sections

### `files.scan`

File scanning patterns for `check` and `health` commands:

| Option | Default | Description |
|--------|---------|-------------|
| `include` | `["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"]` | Glob patterns for files to include |
| `exclude` | `["**/node_modules/**", "**/dist/**", "**/*.d.ts", "**/*.test.ts", ...]` | Glob patterns for files to exclude |

### `files.untagged`

Controls untagged file handling:

| Option | Values | Description |
|--------|--------|-------------|
| `policy` | `allow`, `warn`, `deny` | What happens when a file lacks `@arch` tag |
| `require_in` | glob patterns | Directories where `@arch` is mandatory |
| `exempt` | glob patterns | Files exempt from tagging requirements |

### `validation`

Validation engine settings:

| Option | Default | Description |
|--------|---------|-------------|
| `fail_on_warning` | `false` | Treat warnings as errors |
| `max_overrides_per_file` | `3` | Maximum overrides allowed per file |
| `fail_on_expired_override` | `true` | Fail if overrides have expired |
| `missing_why` | `ignore` | How to handle `forbid_*` constraints missing `why`: `ignore`, `warning`, `error` |
| `concurrency` | 75% CPUs | Parallel file validation threads |
| `exit_codes.success` | `0` | Exit code for successful validation |
| `exit_codes.error` | `1` | Exit code for errors |
| `exit_codes.warning_only` | `0` | Exit code when only warnings (no errors) |

### `validation.precommit`

Pre-commit hook settings:

| Option | Default | Description |
|--------|---------|-------------|
| `max_errors` | `null` | Fail if errors exceed threshold (null = no limit) |
| `max_warnings` | `null` | Fail if warnings exceed threshold (null = no limit) |
| `output_format` | `human` | Output format: `human`, `json`, `compact` |
| `only_staged_files` | `false` | Only check staged files |
| `include` | `[]` | Include patterns for gradual adoption |
| `exclude` | `[]` | Exclude patterns |

### `hydration`

Context hydration settings:

| Option | Default | Description |
|--------|---------|-------------|
| `format` | `terse` | Hydration format: `terse`, `verbose` |
| `include_why` | `true` | Include `why` explanations |
| `show_inheritance` | `false` | Show inheritance chain in hydrated context |
| `max_header_tokens` | `500` | Maximum tokens in hydrated header |

### `overrides`

Override policy settings:

| Option | Default | Description |
|--------|---------|-------------|
| `required_fields` | `[reason]` | Required fields for overrides |
| `optional_fields` | `[expires, ticket, approved_by]` | Optional override annotation fields |
| `warn_no_expiry` | `true` | Warn if override has no expiry date |
| `max_expiry_days` | `180` | Maximum days for override expiry |

### `llm`

LLM provider settings for `verify` and `reindex` commands:

| Option | Description |
|--------|-------------|
| `default_provider` | Default provider (`prompt`): `openai`, `anthropic`, `prompt` |
| `providers.openai.base_url` | API endpoint (supports OpenAI-compatible APIs) |
| `providers.openai.model` | Model name |
| `providers.openai.api_key` | API key (supports `${ENV_VAR}` syntax) |
| `providers.openai.max_tokens` | Maximum response tokens |
| `providers.openai.temperature` | Response temperature |

### `pointers`

URI resolution settings for `arch://`, `code://`, and `template://` references:

| Option | Default | Description |
|--------|---------|-------------|
| `base_paths.arch` | `.arch/docs` | Base directory for `arch://` URIs |
| `base_paths.code` | `.` | Base directory for `code://` URIs |
| `base_paths.template` | `.arch/templates` | Base directory for `template://` URIs |
| `default_extension` | `.md` | Default file extension for URI resolution |

### `intents`

Intent validation settings:

| Option | Default | Description |
|--------|---------|-------------|
| `undefined_intent` | `warning` | How to handle undefined intents: `ignore`, `warning`, `error` |

### `discovery`

Discovery index settings:

| Option | Default | Description |
|--------|---------|-------------|
| `auto_sync` | `false` | Auto-sync index after registry changes |

### `table_detection`

Target detection for `require_companion_call` constraint:

| Option | Default | Description |
|--------|---------|-------------|
| `mode` | `first_argument` | Detection mode: `first_argument` or `method_chain` |
| `receiver` | *(none)* | For `method_chain` mode: base receiver name (e.g., `prisma`, `db`) |

### `languages`

Per-language validation settings:

| Option | Default | Description |
|--------|---------|-------------|
| `<lang>.enabled` | `true` (TS/JS), `false` (others) | Enable validation for this language |
| `<lang>.skip_constraints` | `[]` | Constraint rules to skip for this language |
| `<lang>.non_applicable_constraints` | `skip` | Behavior for non-applicable constraints: `skip`, `warn` |
| `<lang>.validator_package` | *(none)* | Custom validator package path |

Supported languages: `typescript`, `javascript`, `python`, `go`, `java`

### `packages`

Monorepo package boundary definitions:

| Option | Required | Description |
|--------|----------|-------------|
| `path` | Yes | Package path relative to project root |
| `name` | No | Package name (defaults to path) |
| `can_import` | No | List of packages this package can import from |

### `analysis`

Spec analysis settings for `archcodex analyze` (including `--deep` mode):

| Option | Default | Description |
|--------|---------|-------------|
| `deep_patterns.auth_check` | `[]` | Regex patterns to detect auth checks in code (e.g., `ctx\.userId`, `req\.user`) |
| `deep_patterns.ownership_check` | `[]` | Regex patterns to detect ownership verification (e.g., `\.userId\s*===`) |
| `deep_patterns.permission_call` | `""` | Regex with capture group for permission checks (e.g., `checkPermission\([^)]*,\s*['"](\w+)['"]\)`) |
| `deep_patterns.soft_delete_filter` | `[]` | Regex patterns to detect soft-delete filtering (e.g., `deletedAt`, `whereNotDeleted`) |
| `deep_patterns.db_query` | `[]` | Regex patterns to detect database query calls (e.g., `prisma\.\w+\.findMany`) |
| `deep_patterns.db_get` | `[]` | Regex patterns to detect single-record fetches (e.g., `prisma\.\w+\.findUnique`) |
| `tool_entities` | `["archcodex", "speccodex", "test"]` | Entity namespaces excluded from CMP-4 CRUD coverage checks |

Deep patterns default to empty arrays, which disables the corresponding deep-analysis rules (SEC-10 through SEC-14). Configure them for your framework to enable spec-to-code verification.

**Example — Express/Prisma project:**

```yaml
analysis:
  deep_patterns:
    auth_check: ['req\.user\b', 'req\.session\.userId', 'authenticate\(']
    ownership_check: ['\.userId\s*===?\s*', 'belongsTo\(']
    permission_call: "checkPermission\\([^)]*,\\s*['\"]([\\w]+)['\"]\\s*\\)"
    soft_delete_filter: ['deletedAt', 'whereNotDeleted']
    db_query: ['prisma\.\w+\.findMany', '\.where\(']
    db_get: ['prisma\.\w+\.findUnique']
  tool_entities: ['internal', 'test']
```

**Example — Convex project:**

```yaml
analysis:
  deep_patterns:
    auth_check: ['ctx\.userId\b', 'ctx\.user\b', 'makeAuth(?:Query|Mutation|Action)', 'requireAuth']
    ownership_check: ['\.userId\s*[!=]==?\s*', 'canAccess\w*\(']
    permission_call: "canAccess\\w*\\([^)]*,\\s*['\"]([\\w]+)['\"]\\s*\\)"
    soft_delete_filter: ['isDeleted', 'deletedFilter', "\.eq\\s*\\(\\s*['\"]isDeleted['\"]"]
    db_query: ['ctx\.db\.query\s*\(', '\.filter\s*\(']
    db_get: ['ctx\.db\.get\s*\(']
```

**Example — Django project:**

```yaml
analysis:
  deep_patterns:
    auth_check: ['request\.user', '@login_required', 'IsAuthenticated']
    ownership_check: ['\.owner\s*==', 'user=request\.user']
    permission_call: "has_perm\\(['\"]([\\w.]+)['\"]\\)"
    soft_delete_filter: ['is_deleted=False', 'exclude\\(is_deleted=True\\)']
    db_query: ['\.objects\.filter\(', '\.objects\.all\(']
    db_get: ['\.objects\.get\(']
```

**Which rules are affected:**

| Rule | Patterns Used | Description |
|------|---------------|-------------|
| SEC-10 | `auth_check` | Auth required but code never checks user identity |
| SEC-11 | `ownership_check`, `db_get` | Owner-scoped invariant without ownership check |
| SEC-13 | `permission_call` | Permission drift between spec and code |
| SEC-14 | `soft_delete_filter`, `db_query` | Query without soft-delete filter |

### `health`

Health dashboard bloat detection thresholds:

| Option | Default | Description |
|--------|---------|-------------|
| `similarity_threshold` | `0.8` | Minimum Jaccard similarity (0-1) to flag architectures as similar |
| `max_inheritance_depth` | `4` | Maximum inheritance chain depth before flagging |
| `low_usage_threshold` | `2` | Maximum files to consider "low usage" |
| `exclude_inherited_similarity` | `true` | Compare only direct constraints (not inherited) for similarity |

Example:

```yaml
health:
  similarity_threshold: 0.9      # Only flag very similar architectures
  max_inheritance_depth: 5       # Allow deeper inheritance chains
  low_usage_threshold: 1         # Only flag single-file architectures
  exclude_inherited_similarity: true  # Ignore shared parent constraints
```

---

## Inference Configuration

The `inference` section configures `archcodex infer` and `archcodex bootstrap`:

```yaml
inference:
  validate_arch_ids: true    # Warn if inferred archId not in registry
  use_builtin_rules: false   # Don't include React/Convex/etc defaults
  prepend_custom: true       # Check custom rules first
  custom_rules:
    - name: my-service
      archId: myapp.domain.service
      confidence: high
      filePattern: "Service\\.ts$"
      contentPatterns:
        - "@Injectable"
        - "class.*Service"
      matchAll: true
      description: "NestJS service classes"
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `validate_arch_ids` | `true` | Warn if inferred architecture doesn't exist |
| `use_builtin_rules` | `false` | Include built-in rules for React, Convex, etc. |
| `prepend_custom` | `true` | Check custom rules before built-in rules |
| `custom_rules` | `[]` | Custom inference rules |

### Custom Rule Properties

| Property | Required | Description |
|----------|----------|-------------|
| `name` | Yes | Unique rule identifier |
| `archId` | Yes | Architecture ID to assign when matched |
| `confidence` | No | `high`, `medium`, or `low` (default: `medium`) |
| `filePattern` | No | Regex to match **full relative path** |
| `contentPatterns` | No | Array of regexes to match file content |
| `matchAll` | No | If `true`, all patterns must match (AND) |
| `description` | Yes | Human-readable description |

### Example Custom Rules

```yaml
custom_rules:
  # React hooks
  - name: react-hook
    archId: frontend.hook
    confidence: high
    filePattern: "^use[A-Z].*\\.(ts|tsx)$"
    contentPatterns:
      - "export.*function.*use[A-Z]"
    description: "React hook files"

  # NestJS controllers
  - name: nestjs-controller
    archId: backend.controller
    confidence: high
    filePattern: "Controller\\.ts$"
    contentPatterns:
      - "@Controller"
      - "class.*Controller"
    matchAll: true
    description: "NestJS controller classes"

  # Zod schemas
  - name: zod-schema
    archId: core.schema
    confidence: medium
    filePattern: "schema\\.ts$"
    contentPatterns:
      - "z\\.(object|string|number)"
    description: "Zod validation schemas"
```

---

## `.archconfig`

Store API keys securely (automatically added to `.gitignore`):

```bash
# ~/.archconfig or .archconfig in project root
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
```

**Lookup order:**
1. Project root `.archconfig`
2. Home directory `~/.archconfig`

**API key priority:**
1. `api_key` in `.arch/config.yaml`
2. `.archconfig` file
3. Environment variables

---

## `.archignore`

Exclude files from validation (uses gitignore syntax):

```gitignore
# Build artifacts
dist/
build/

# Dependencies
node_modules/

# Type definitions
*.d.ts

# Test files
**/*.test.ts
**/*.spec.ts

# Generated files
*.generated.ts

# Example files
examples/
```

### Default Patterns

Always ignored (even without `.archignore`):
- `node_modules/`
- `dist/`
- `build/`
- `coverage/`
- `.git/`
- `*.d.ts`

---

## Architecture Fields

Fields available in architecture definitions:

| Field | Required | Description |
|-------|----------|-------------|
| `description` | No | Brief description of the architecture |
| `rationale` | **Yes** | Why it exists, when to use it, when NOT to use it |
| `kind` | No | File intent: `implementation` (default), `organizational`, `definition` |
| `inherits` | No | Parent architecture to extend |
| `mixins` | No | Reusable trait sets to compose |
| `constraints` | No | Enforceable rules |
| `exclude_constraints` | No | Remove inherited constraints |
| `hints` | No | Advisory guidance for LLMs |
| `pointers` | No | References to documentation |
| `version` | No | Current version of this architecture |
| `deprecated_from` | No | Version from which this architecture is deprecated |
| `migration_guide` | No | Pointer URI to migration guide |
| `code_pattern` | No | Code template showing expected structure |
| `singleton` | No | If `true`, only one file can use this architecture |

### AI-native Fields

| Field | Description |
|-------|-------------|
| `reference_implementations` | Example files for golden samples |
| `file_pattern` | Naming pattern for scaffolded files (`${name}`, `${layer}`) |
| `default_path` | Default output directory for scaffolding |

### Example Architecture

```yaml
domain.payment.processor:
  description: "Payment processors"
  rationale: |
    Use for payment transaction handling.
    Don't use for: General utilities or non-payment business logic.

  inherits: domain.payment
  mixins: [tested, srp]

  # AI-native fields
  code_pattern: |
    export class ${Name}Processor extends BaseProcessor {
      async process(tx: Transaction): Promise<Result> {
        await this.checkPermission(tx.userId);
        // ... processing logic
      }
    }
  reference_implementations:
    - src/payment/CardProcessor.ts
  file_pattern: "${name}Processor.ts"
  default_path: "src/payment"

  constraints:
    - rule: forbid_import
      value: [axios, http]
      severity: error
      why: "Use ApiClient for PCI-compliant logging"
      alternative: "src/core/api/client"

  hints:
    - "Redact CVV/PAN before logging"
    - text: "Use structured error handling"
      example: "arch://payment/examples/error-handling"
```

### Architecture Versioning

```yaml
domain.legacy.payment:
  version: "1.5"
  deprecated_from: "1.0"
  migration_guide: "arch://payment/v2-migration"
  description: "Legacy payment architecture"
  rationale: "Do not use for new code. Migrate to domain.payment.processor"
```

Files using deprecated architectures show warnings in `archcodex read` output.

---

## Mixins

Mixins are reusable constraint bundles that can be composed into architectures.

### Defining Mixins

Mixins are defined in `.arch/registry/_mixins.yaml`:

```yaml
mixins:
  tested:
    description: "Requires companion test file"
    rationale: "Ensure code has test coverage"
    constraints:
      - rule: require_test_file
        value: ["*.test.ts", "*.spec.ts"]

  srp:
    description: "Single Responsibility Principle"
    rationale: "Classes should have one reason to change"
    constraints:
      - rule: max_public_methods
        value: 7
        why: "Limit class surface area"

  pure:
    description: "Pure functions only"
    rationale: "Utilities should be stateless and side-effect free"
    constraints:
      - rule: forbid_import
        value: [fs, path, http]
        why: "No I/O in pure functions"
```

### Using Mixins

**In registry definitions:**

```yaml
domain.payment.processor:
  inherits: domain.payment
  mixins: [tested, srp]
```

**Inline in source files:**

```typescript
/**
 * @arch domain.payment +tested +srp
 */
```

Inline mixins (`+mixin`) are equivalent to `mixins: [mixin]` in the registry.

### Inline Mixin Governance

Mixins can specify how they may be used via the `inline` field:

| Mode | Meaning |
|------|---------|
| `allowed` | (default) Can use inline (`+mixin`) or in registry `mixins:[]` |
| `only` | Must use inline; warns if placed in registry `mixins:[]` |
| `forbidden` | Must be in registry `mixins:[]`; warns if used inline |

**Example definitions:**

```yaml
mixins:
  # Team-wide standard - must be in registry
  core-tested:
    inline: forbidden
    rationale: "Testing requirements should be centrally managed"
    constraints:
      - rule: require_test_file
        value: ["*.test.ts"]

  # Per-file exception - must be inline
  quick-fix:
    inline: only
    rationale: "Per-file technical debt marker, don't pollute registry"
    constraints:
      - rule: max_file_lines
        value: 500
        severity: warning

  # Either works (default)
  srp:
    inline: allowed
    constraints:
      - rule: max_public_methods
        value: 7
```

**Warning when violated:**

```
E027 mixin_inline_forbidden: Mixin 'core-tested' has inline:'forbidden'
     but is used inline (+core-tested). Move to registry mixins:[] instead.
```

Use `archcodex schema <mixin-name>` to see inline mode for any mixin.

### Mixin Fields

| Field | Required | Description |
|-------|----------|-------------|
| `description` | No | Brief description of the mixin |
| `rationale` | No | Why it exists, when to use it |
| `constraints` | No | Constraint rules to apply |
| `hints` | No | Advisory guidance for LLMs |
| `inline` | No | Inline governance: `allowed`, `only`, `forbidden` |

---

## Related Documentation

- [Constraint Reference](constraint-reference.md) - All constraint rules
- [CLI Registry](cli/registry.md) - Registry management commands
- [Back to README](../README.md)
