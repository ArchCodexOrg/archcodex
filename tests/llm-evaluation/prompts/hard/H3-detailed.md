Refactor the entity context module (src/core/context/) to use the unified context infrastructure (src/core/unified-context/).

Currently there's duplication between:
- src/core/context/synthesizer.ts - synthesizeContext()
- src/core/unified-context/synthesizer.ts - synthesizeUnifiedEntityContext()

Goal: Consolidate so that entity context uses the unified infrastructure.

Requirements:
1. Identify shared code and patterns
2. Plan migration without breaking existing callers
3. Maintain backward compatibility (existing API should still work)
4. Document any deprecations
5. Update types if needed

Show the modification order and explain your approach.
