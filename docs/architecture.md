# Technical Architecture

Overview of ArchCodex internal architecture and multi-language support.

---

## Project Structure

```
.arch/
├── config.yaml        # System configuration
├── registry/          # Architecture definitions (multi-file, recommended)
│   ├── base.yaml
│   ├── _mixins.yaml
│   ├── _intents.yaml
│   ├── cli/
│   │   ├── _index.yaml
│   │   └── command.yaml
│   └── core/
│       ├── _index.yaml
│       └── domain/
│           └── schema.yaml
├── registry.yaml      # Alternative: single-file registry (legacy)
├── index.yaml         # Discovery keywords
├── decision-tree.yaml # Guided architecture selection (optional)
├── patterns.yaml      # Canonical implementations (AI-native)
├── docs/              # Pointer documentation
└── templates/         # Scaffold templates

src/
├── processors/
│   └── payment/
│       └── RefundProcessor.ts  # @arch domain.payment.processor
└── ...
```

---

## Multi-Language Architecture

ArchCodex uses a language-agnostic semantic model, enabling support for multiple languages through a plugin architecture.

### Current Support

| Language | Status | Parser |
|----------|--------|--------|
| TypeScript | Full support | ts-morph |
| JavaScript | Full support | ts-morph |
| Python | Experimental | regex-based (line-by-line) |
| Go | Experimental | regex-based (line-by-line) |
| Java | Planned | — |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Constraint Validators                     │
│  (must_extend, forbid_import, implements, etc.)             │
│  Work against SemanticModel - language agnostic             │
└─────────────────────────────────┬───────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                      SemanticModel                           │
│  ClassInfo[], ImportInfo[], MethodInfo[], DecoratorInfo[]   │
│  Language-agnostic representation of source code            │
└─────────────────────────────────┬───────────────────────────┘
                                  │
         ┌────────────────────────┼────────────────────┐
         ▼                       ▼                    ▼
┌─────────────────────┐ ┌────────────────┐ ┌────────────────┐
│ TypeScriptValidator │ │ PythonValidator│ │  GoValidator   │
│ (ts-morph)          │ │ (regex-based)  │ │ (regex-based)  │
└─────────────────────┘ └────────────────┘ └────────────────┘
```

### SemanticModel

The semantic model provides a language-agnostic representation of source code:

```typescript
interface SemanticModel {
  classes: ClassInfo[];
  imports: ImportInfo[];
  exports: ExportInfo[];
  methods: MethodInfo[];
  decorators: DecoratorInfo[];
  // ...
}
```

Constraint validators work against this model, making them automatically available for any language with a parser plugin.

---

## Language Configuration

Configure language-specific settings in `.arch/config.yaml`:

```yaml
languages:
  typescript:
    enabled: true
  javascript:
    enabled: true
  python:
    enabled: true   # Experimental — regex-based parsing
    skip_constraints: [require_decorator]  # Skip non-applicable constraints
    non_applicable_constraints: skip  # skip | warn
  go:
    enabled: true   # Experimental — regex-based parsing
    skip_constraints: [require_decorator]
    non_applicable_constraints: skip
```

### Options

| Option | Description |
|--------|-------------|
| `enabled` | Enable/disable language support |
| `skip_constraints` | Constraints to skip for this language |
| `non_applicable_constraints` | What to do for non-applicable constraints: `skip` or `warn` |

---

## Source Code Structure

```
src/
├── cli/             # CLI commands and formatters
│   └── commands/    # Individual CLI commands
├── core/            # Core domain logic
│   ├── arch-tag/    # @arch tag parsing
│   ├── config/      # Config loading
│   ├── constraints/ # Constraint validators
│   ├── discovery/   # Architecture discovery
│   ├── graph/       # Architecture graph building
│   ├── health/      # Health metrics analyzer
│   ├── hydration/   # Context injection
│   ├── neighborhood/# Import boundary analysis
│   ├── patterns/    # Pattern registry loading
│   ├── pointers/    # URI resolution
│   ├── registry/    # Registry loading/resolution
│   ├── scaffold/    # Template generation
│   ├── similarity/  # Code duplication detection
│   └── validation/  # Validation engine
├── llm/             # LLM integration
│   ├── providers/   # OpenAI, Anthropic, Prompt providers
│   ├── verifier.ts  # Behavioral verification
│   └── reindexer.ts # Keyword generation
├── security/        # Security utilities
├── utils/           # Shared utilities
└── validators/      # Language-specific validators
    ├── semantic.types.ts    # Language-agnostic semantic model
    ├── capabilities.ts      # Language capability definitions
    ├── validator-registry.ts # Plugin registry for validators
    ├── interface.ts         # ILanguageValidator interface
    ├── typescript.ts        # TypeScript/JavaScript validator
    ├── python.ts            # Python validator (experimental)
    └── go.ts                # Go validator (experimental)
```

---

## Registry Loading

### Single-File vs Multi-File

ArchCodex supports both single-file (`registry.yaml`) and multi-file (`registry/` directory) registries:

```
# Single-file (legacy)
.arch/registry.yaml

# Multi-file (recommended)
.arch/registry/
├── base.yaml
├── _mixins.yaml
├── cli/
│   ├── _index.yaml
│   └── command.yaml
└── ...
```

The loader automatically detects which mode to use. Directory takes precedence if both exist.

### Multi-File Benefits

- **Partial invalidation** - Only reload changed files
- **LLM readability** - Load only relevant architectures
- **Better git diffs** - Changes isolated to specific files
- **Scalability** - Registry can grow without becoming unwieldy

### Dynamic Loading

Load specific architectures for faster validation:

```bash
# Load only CLI architectures
archcodex check src/cli/**/*.ts --registry-pattern "cli/**"

# Auto-resolves parent dependencies
archcodex check src/cli/commands/check.ts --registry .arch/registry/cli/command.yaml
```

---

## Context Hydration

When an LLM agent reads a file via `archcodex read --format ai`, ArchCodex hydrates the output with the full resolved context:

1. **Tag Resolution** — The `@arch` tag is resolved through the inheritance chain (e.g., `domain.payment.processor` → `domain.payment` → `domain` → `base`)
2. **Constraint Flattening** — All inherited and mixin constraints are merged, with `allow_*` rules overriding parent `forbid_*` rules
3. **Hint Aggregation** — Hints from all ancestors and mixins are collected
4. **Pointer Resolution** — Documentation pointers (`doc://`, `file://`) are resolved to content
5. **Intent Application** — `@intent` and `@override` annotations are applied, suppressing matched constraints

The result is a single hydrated header that gives the agent complete architectural context without needing to traverse the registry.

---

## Validation Pipeline

1. **Parse** — Extract semantic model from source file
2. **Resolve** — Flatten architecture with inheritance and mixins
3. **Validate** — Run constraint validators against semantic model
4. **Report** — Generate human/JSON/compact output

### Caching

Results are cached to `.arch/cache/validation.json`:
- Keyed by file content checksum
- Invalidated on registry/config changes
- Optional incremental mode for development

---

## Related Documentation

- [Configuration](configuration.md) - Language settings
- [Constraint Reference](constraint-reference.md) - Available constraints
- [CLI Registry](cli/registry.md) - Registry management
- [Back to README](../README.md)
