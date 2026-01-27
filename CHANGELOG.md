# Changelog

All notable changes to ArchCodex will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- GitHub Actions CI/CD workflow
- ESLint flat config for contributors
- CONTRIBUTING.md with development guidelines
- LICENSE file (MIT)

## [1.38.0] - 2026-01-27

### Added
- Python language validator — regex-based parsing (experimental)
- Go language validator — regex-based parsing (experimental)
- Multi-language validation support (mixed TypeScript/Python/Go projects)
- Test fixtures for Python and Go validators

## [1.37.0] - 2025-01-25

### Added
- `require_companion_file` constraint for enforcing barrel exports and tests
- Template extraction from override to remove need for per-file overrides
- Documentation for `require_companion_file` and `require_companion_call` constraints

## [1.36.0] - 2025-01-24

### Added
- Multi-file registry support (`migrate-registry` command)
- Session context priming for AI agents (`session-context` command)
- Plan context bundling (`plan-context` command)
- Pre-flight validation (`validate-plan` command)

### Changed
- Default to compact output format for session-context

## [1.35.0] - 2025-01-23

### Added
- Code similarity analysis (`similarity scan`, `similarity blocks`)
- Type consistency analysis (`types` command)
- Impact analysis for refactoring (`impact` command)

## [1.34.0] - 2025-01-22

### Added
- Health dashboard (`health` command) with metrics for override debt and coverage
- Architecture visualization (`graph` command) with Mermaid/Graphviz output
- Watch mode (`watch` command) for continuous validation
- Constraint explanation (`why` command)

## [1.33.0] - 2025-01-21

### Added
- Semantic discovery with concepts (`concepts.yaml`)
- LLM-enhanced keyword generation (`garden --llm --concepts`)
- Action-based discovery (`action` command)
- Multi-file feature scaffolding (`feature` command)

## [1.32.0] - 2025-01-20

### Added
- Function-level intent annotations (granular `@intent:` on functions)
- Intent validation and usage reporting (`intents` command)
- Schema exploration (`schema` command) for rules, mixins, conditions

## [1.31.0] - 2025-01-19

### Added
- Behavioral verification via LLM (`verify` command)
- Auto-indexing for discovery (`reindex` command)
- AI-optimized read format (`read --format ai`)
- Reference implementations in architectures

## [1.30.0] - 2025-01-18

### Added
- Pre-commit hook integration with thresholds
- Gradual adoption support with `--include`/`--exclude` patterns
- Compact output format for CI

### Changed
- `missing_why` validation for undocumented constraints

## [1.2.0] - 2025-01-15

### Added
- Behavioral verification (`verify` command) - hybrid LLM/static analysis
- Auto-indexing (`reindex` command) - generate discovery keywords
- `.archignore` file support - gitignore syntax for exclusions
- Hints with examples - `example:` field pointing to reference files

### Changed
- Improved hydration with `--format ai` for minimal output
- Enhanced constraint error messages with `alternative` suggestions

### Security
- Path traversal protection for pointer URIs
- Validation of `@approved_by` and `@ticket` override fields

## [1.1.0] - 2025-01-10

### Added
- Inheritance and mixin system for architectures
- Override protocol with `@expires` and `@reason` fields
- Context hydration for LLM agents
- Discovery system with keyword matching

### Changed
- Improved constraint resolution algorithm (Child > Mixin > Parent)

## [1.0.0] - 2025-01-01

### Added
- Initial release
- Core constraint validation engine
- `@arch` tag parsing
- Basic constraints: `forbid_import`, `require_import`, `max_file_lines`
- CLI commands: `check`, `read`, `discover`, `scaffold`
- YAML-based registry format
- TypeScript/JavaScript support via ts-morph

