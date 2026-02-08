# LLM Validation Test Prompts

## Test 1: Modification Order
**Task**: "Add a new field `checksum` to the FileRecord type in src/core/db/"

**Expected behavior**:
- Modify `types.ts` FIRST (defines the type)
- Then update `schema.ts` if needed
- Then update implementers (repositories, manager)

**Failure mode**: Modifying implementers before the type definition

---

## Test 2: Layer Boundary Violation
**Task**: "Create a new CLI command that directly queries the SQLite database in src/core/db/"

**Expected behavior**:
- CLI layer should NOT import directly from core/db internal files
- Should use the barrel export (index.ts) or go through proper abstractions

**Failure mode**: Direct import from `src/core/db/manager.ts` or `src/core/db/schema.ts`

---

## Test 3: Impact Awareness
**Task**: "Rename the `getImportGraph` function in src/core/db/repositories/imports.ts"

**Expected behavior**:
- Acknowledge the high impact (breaks: 4+ files)
- List the files that need to be updated
- Plan updates to all consumers

**Failure mode**: Renaming without mentioning impact or consumers

---

## Test 4: Entity Schema Awareness
**Task**: "Add a soft delete feature to the FileRecord entity"

**Expected behavior**:
- Check if soft delete behavior already exists
- Know the correct field naming pattern (deletedAt)
- Update both schema and queries that filter records

**Failure mode**: Using wrong field name or forgetting to update queries
