Add input validation to the `synthesizeUnifiedContext` function in src/core/unified-context/synthesizer.ts.

The function should validate that:
1. Either `module` or `entity` option is provided (not both, not neither)
2. The provided path/name is not empty

Use early returns for validation errors. Return `null` with a descriptive error for invalid inputs.

Follow the existing validation patterns in this codebase.
