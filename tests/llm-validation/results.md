# LLM Validation Test Results

## Summary Table

| Test | Model | Context | Correct Behavior? | Key Observation |
|------|-------|---------|-------------------|-----------------|
| **1. Modification Order** | Haiku | No | ✓ Mostly | Guessed types first (reasonable) |
| | Haiku | Yes | ✓ Yes | Referenced DEFINES→IMPLEMENTS→ORCHESTRATES |
| | Opus | No | ✓ Mostly | Figured out correct order |
| | Opus | Yes | ✓ Yes | Used exact 🔴 impact numbers |
| **2. Layer Boundary** | Haiku | No | ✗ **VIOLATED** | Directly imported from manager.js |
| | Haiku | Yes | ✓ Yes | "CLI should not reach into core/db" |
| | Opus | No | ✗ **VIOLATED** | Used better-sqlite3 directly |
| | Opus | Yes | ✓ Yes | Explained barrel export pattern |
| **3. Impact Awareness** | Haiku | No | Partial | Found files via grep, no impact # |
| | Haiku | Yes | ✓ Yes | Cited 🔴4 breaks, listed consumers |
| | Opus | No | Partial | Found files, noted tooling gap |
| | Opus | Yes | ✓ Yes | Cited 🔴4 breaks, full file list |

## Key Findings

### Test 2 (Layer Boundary) Shows Clear Differentiation

**Without context**, both models suggested imports that violate layer rules:
- Haiku: `import { getDbSync } from '../../core/db/manager.js'`
- Opus: `import Database from 'better-sqlite3'`

**With context**, both models correctly identified the violation:
- Haiku: "CLI layer is separated from the core layer"
- Opus: "CLI should use the public API exposed by the barrel"

### What Context Provides

| Without Context | With Context |
|-----------------|--------------|
| Guess at file order | Exact modification order with rationale |
| No impact awareness | 🔴N impact indicators |
| No layer rules | Explicit CAN/CANNOT import lists |
| Grep for usages | Pre-computed consumer list |
| Generic TypeScript patterns | Project-specific constraints |

### Model Comparison

**Haiku**:
- Without context: Confidently suggested wrong patterns
- With context: Followed rules correctly

**Opus**:
- Without context: Often acknowledged uncertainty ("I'd have no way of knowing")
- With context: Detailed analysis with full justification

## Conclusion

The unified context provides value regardless of model capability:
- **Haiku** needs the guardrails - without them it confidently suggests violations
- **Opus** benefits from the specificity - reduces exploration time and provides certainty

The most significant improvement was **Test 2 (Layer Boundaries)** where 100% of models without context violated the rules, while 100% with context respected them.
