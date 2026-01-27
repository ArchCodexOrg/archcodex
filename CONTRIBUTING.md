# Contributing to ArchCodex

Thank you for your interest in contributing to ArchCodex! This document provides guidelines and information for contributors.

## Development Setup

### Prerequisites

- Node.js 18 or higher
- npm 9 or higher
- Git

### Getting Started

1. **Fork and clone the repository**

   ```bash
   git clone https://github.com/YOUR_USERNAME/archcodex.git
   cd archcodex
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Build the project**

   ```bash
   npm run build
   ```

4. **Run tests**

   ```bash
   npm test
   ```

## Code Style

### TypeScript

- We use TypeScript with strict mode enabled
- All source files should have an `@arch` tag declaring their architectural constraints (enforced based on the project's `files.untagged.policy` setting)
- Run `npm run typecheck` to verify types

### Linting & Formatting

- ESLint for linting: `npm run lint`
- Prettier for formatting: `npm run format`
- Fix linting issues: `npm run lint:fix`

### Architecture Compliance

- All source files must pass `npm run check`
- Use `archcodex discover` to find the appropriate architecture for new files
- See [CLAUDE.md](CLAUDE.md) for detailed architectural guidelines

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run tests with CI thresholds (80% coverage required)
npm run test:ci
```

### Writing Tests

- Tests live in `tests/` directory, mirroring the `src/` structure
- Use Vitest as the test framework
- Aim for 80% code coverage
- Test files should be named `*.test.ts`

### Test Structure

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('ModuleName', () => {
  describe('functionName', () => {
    it('should do something specific', () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

## Making Changes

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation changes
- `refactor/description` - Code refactoring
- `test/description` - Test additions/changes

### Commit Messages

Write clear, concise commit messages that explain what and why:

```
Add constraint validation for require_companion_call

Implements the require_companion_call constraint to enforce
paired operations (e.g., cache.set must be followed by cache.save).
```

### Pull Request Process

1. **Create a feature branch** from `main`
2. **Make your changes** following the code style guidelines
3. **Write/update tests** for your changes
4. **Run the full validation suite**:
   ```bash
   npm run validate
   ```
5. **Push your branch** and create a Pull Request
6. **Fill out the PR template** with a clear description
7. **Address review feedback** promptly

### PR Requirements

- All CI checks must pass
- Coverage thresholds must be met (80%)
- At least one approving review
- No unresolved conversations

## Project Structure

```
.arch/              # Architecture definitions
├── config.yaml     # ArchCodex configuration
├── registry/       # Architecture definitions (multi-file)
├── index.yaml      # Discovery keywords
└── patterns.yaml   # Canonical implementations

src/
├── cli/            # CLI commands
├── core/           # Core domain logic
├── llm/            # LLM integrations
├── mcp/            # MCP server
├── utils/          # Utilities
└── validators/     # Language validators

tests/
├── unit/           # Unit tests
├── integration/    # Integration tests
└── fixtures/       # Test fixtures
```

## Architecture Overview

ArchCodex follows a layered architecture:

- **CLI Layer** (`src/cli/`) - Command handlers and formatters
- **Core Layer** (`src/core/`) - Domain logic, validation engine, constraint handling
- **Infrastructure Layer** (`src/mcp/`, `src/llm/`) - External integrations
- **Utility Layer** (`src/utils/`) - Shared utilities

See [docs/architecture.md](docs/architecture.md) for detailed documentation.

## Getting Help

- **Documentation**: See the [docs/](docs/) directory
- **Issues**: Check existing issues or create a new one
- **Discussions**: Use GitHub Discussions for questions

## License

By contributing to ArchCodex, you agree that your contributions will be licensed under the MIT License.
