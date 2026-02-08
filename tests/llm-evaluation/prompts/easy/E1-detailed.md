Add a new field called `checksum` to the FileRecord type in the src/core/db/ directory.

This field should:
- Be of type `string`
- Be optional (files may not have checksums yet)
- Store a SHA-256 hash of the file contents

Make sure to:
1. Find the correct type definition file
2. Add the field to the appropriate interface
3. Follow the existing patterns in the codebase
4. Respect any architectural constraints that apply to this module
