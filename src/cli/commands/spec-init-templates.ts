/**
 * @arch archcodex.cli.data
 *
 * Templates for spec init command.
 * Contains YAML templates for base specs, mixins, and examples.
 */

/**
 * Base specs template - foundational spec types.
 */
export const SPEC_BASE_TEMPLATE = `# SpecCodex Base Specs
#
# Foundational spec types that other specs inherit from.
# These provide common structure and can be extended.

version: "1.0"

# =============================================================================
# SPEC.FUNCTION - Base for any function
# =============================================================================

spec.function:
  # Minimal base - just requires an intent
  intent: "Base function spec"

# =============================================================================
# SPEC.MUTATION - Base for data mutations
# =============================================================================

spec.mutation:
  inherits: spec.function

  security:
    authentication: required

  examples:
    errors:
      - name: "unauthenticated user"
        given: { user: null }
        then: { error: "NOT_AUTHENTICATED" }

# =============================================================================
# SPEC.QUERY - Base for data queries
# =============================================================================

spec.query:
  inherits: spec.function

  security:
    authentication: required

  # Queries typically don't have side effects
  metadata:
    idempotent: true

# =============================================================================
# SPEC.ACTION - Base for external actions (API calls, etc.)
# =============================================================================

spec.action:
  inherits: spec.function

  security:
    authentication: required

  metadata:
    external: true
    retryable: true
`;

/**
 * Mixins template - reusable spec behaviors.
 */
export const SPEC_MIXINS_TEMPLATE = `# SpecCodex Mixins
#
# Reusable behaviors that can be composed into specs.
# Use: mixins: [requires_auth, logs_audit]

version: "1.0"

mixins:
  # ===========================================================================
  # AUTHENTICATION & AUTHORIZATION
  # ===========================================================================

  requires_auth:
    description: "Requires authenticated user"
    examples:
      errors:
        - name: "unauthenticated request"
          given: { user: null }
          then: { error: "NOT_AUTHENTICATED" }

  requires_permission:
    description: "Requires specific permission"
    # Use with variable: mixins: [requires_permission(product.create)]
    examples:
      errors:
        - name: "missing permission"
          given: { user: "@authenticated", permission: false }
          then: { error: "PERMISSION_DENIED" }

  # ===========================================================================
  # RATE LIMITING
  # ===========================================================================

  rate_limited:
    description: "Subject to rate limiting"
    security:
      rate_limit: { requests: 60, window: "15m" }
    examples:
      errors:
        - name: "rate limit exceeded"
          given: { user: "@authenticated", rateLimitExceeded: true }
          then: { error: "RATE_LIMIT_EXCEEDED" }

  rate_limited_strict:
    description: "Strict rate limiting for expensive operations"
    security:
      rate_limit: { requests: 10, window: "1m" }

  # ===========================================================================
  # AUDITING & LOGGING
  # ===========================================================================

  logs_audit:
    description: "Logs to audit trail"
    effects:
      - audit_log: { action: "\${action}", resourceType: "\${resource}" }

  # ===========================================================================
  # VALIDATION
  # ===========================================================================

  validates_ownership:
    description: "Validates user owns the resource"
    examples:
      errors:
        - name: "not owner"
          given: { user: "@authenticated", resourceOwner: "@other_user" }
          then: { error: "NOT_OWNER" }

  # ===========================================================================
  # SOFT DELETE
  # ===========================================================================

  soft_deletable:
    description: "Resource supports soft delete"
    invariants:
      - description: "Soft deleted resources have deletedAt timestamp"
        condition: "!result.isDeleted || result.deletedAt !== undefined"

  # ===========================================================================
  # TIMESTAMPS
  # ===========================================================================

  has_timestamps:
    description: "Resource has createdAt/updatedAt"
    invariants:
      - description: "createdAt is set on creation"
        condition: "result.createdAt !== undefined"
      - description: "updatedAt is updated on modification"
        condition: "result.updatedAt >= result.createdAt"
`;

/**
 * Example spec template - demonstrates all features.
 */
export const SPEC_EXAMPLE_TEMPLATE = `# Example Spec
#
# This file demonstrates SpecCodex features.
# Copy and modify for your own specs.

version: "1.0"

spec.example.greeting:
  # Link to implementation (path#exportName)
  implementation: src/example/greeting.ts#greet

  # === STRATEGIC (WHY) ===
  goal: "Demonstrate SpecCodex features"
  outcomes:
    - "Show all spec fields"
    - "Provide copy-paste template"

  # === OPERATIONAL (WHAT) ===
  intent: "Generate a personalized greeting message"

  # === INPUTS ===
  inputs:
    name:
      type: string
      required: true
      max: 100
      description: "Name to greet"
    formal:
      type: boolean
      default: false
      description: "Use formal greeting"

  # === OUTPUTS ===
  outputs:
    message:
      type: string
      description: "The greeting message"

  # === SECURITY (optional) ===
  # security:
  #   authentication: required
  #   rate_limit: { requests: 60, window: "15m" }

  # === INVARIANTS (DSL syntax - always true) ===
  # Use: { condition: "JS expression" } or { "path": "@assertion" }
  invariants:
    - description: "Message contains the name"
      condition: "result.message.includes(inputs.name)"
    - { "result.message": "@exists" }

  # === EXAMPLES ===
  examples:
    success:
      - name: "informal greeting"
        given: { name: "Alice", formal: false }
        then: { result.message: "Hello, Alice!" }

      - name: "formal greeting"
        given: { name: "Dr. Smith", formal: true }
        then: { result.message: "Good day, Dr. Smith." }

    errors:
      - name: "empty name"
        given: { name: "" }
        then: { error: "INVALID_NAME" }

    boundaries:
      - name: "name at max length"
        given: { name: "@string(100)" }
        then: { result.message: "@contains(@string(100))" }

  # === EFFECTS (for integration tests) ===
  # effects:
  #   - audit_log: { action: "greeting.create" }
`;

/**
 * Config section to add to .arch/config.yaml
 */
export const SPEC_CONFIG_SECTION = `
# SpecCodex Configuration
speccodex:
  # Test output locations
  test_output:
    unit: colocated              # Same directory as spec
    property: tests/property/    # Specific directory
    integration: tests/integration/

  # Test framework
  framework: vitest              # vitest | jest

  # Default coverage mode
  coverage: examples             # examples | full
`;
