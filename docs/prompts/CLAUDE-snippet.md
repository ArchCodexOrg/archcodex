# CLAUDE.md Snippet for Unified Context

Copy this to your project's CLAUDE.md:

---

```markdown
## Before Modifying Code

**Call this FIRST:**
```
archcodex_context { "projectRoot": "/absolute/path/to/project", "module": "src/path/to/module/" }
```

> **Note:** Always use absolute paths. The `projectRoot` tells ArchCodex where to find the `.arch/` directory and SQLite database.

**Follow the output:**

| Section | What It Tells You |
|---------|-------------------|
| **1. Modification Order** | DEFINES first → IMPLEMENTS → ORCHESTRATES last |
| **2. Boundaries** | CAN/CANNOT import - never violate these |
| **3. Entity Schemas** | Field names, behaviors (soft_delete = filter by deletedAt) |
| **4. Impact** | External consumers that break if you change exports |
| **5. ArchCodex** | Constraints + validation command to run after |

**🔴N = N files break if you change this file. High numbers need careful planning.**

**After changes:** Run the validation command shown in section 5.
```

---

## Even Shorter Version

```markdown
## Architecture

Before modifying `src/module/`:
```
archcodex_context { "projectRoot": "/path/to/project", "module": "src/module/" }
```

- Modify in order: DEFINES → IMPLEMENTS → ORCHESTRATES
- 🔴N = impact (files that break)
- Respect CAN/CANNOT imports
- Validate after: `archcodex_check { "projectRoot": "/path/to/project", "files": ["src/**/*.ts"] }`
```
