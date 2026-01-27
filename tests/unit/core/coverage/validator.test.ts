/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test.unit
 *
 * Unit tests for CoverageValidator.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CoverageValidator } from '../../../../src/core/coverage/validator.js';
import type { CoverageConstraintConfig } from '../../../../src/core/coverage/types.js';

describe('CoverageValidator', () => {
  let tempDir: string;
  let validator: CoverageValidator;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archcodex-coverage-test-'));
    validator = new CoverageValidator(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // Helper to create test files
  function createFile(relativePath: string, content: string): void {
    const fullPath = path.join(tempDir, relativePath);
    const dir = path.dirname(fullPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  describe('export_names source type', () => {
    it('should discover exported names matching pattern', async () => {
      createFile('src/events/user.ts', `
        export const UserCreatedEvent = { type: 'user.created' };
        export const UserUpdatedEvent = { type: 'user.updated' };
        export const UserDeletedEvent = { type: 'user.deleted' };
        export function helperFunction() {}
      `);

      createFile('src/handlers/user.ts', `
        export function handleUserCreatedEvent() {}
        export function handleUserUpdatedEvent() {}
      `);

      const config: CoverageConstraintConfig = {
        source_type: 'export_names',
        source_pattern: '*Event',
        in_files: 'src/events/**/*.ts',
        target_pattern: 'handle${value}',
        in_target_files: 'src/handlers/**/*.ts',
        severity: 'error',
        archId: 'test.events',
      };

      const result = await validator.validate(config);

      expect(result.totalSources).toBe(3);
      expect(result.coveredSources).toBe(2);
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].value).toBe('UserDeletedEvent');
    });

    it('should report 100% coverage when all sources have handlers', async () => {
      createFile('src/events/all.ts', `
        export const FooEvent = {};
        export const BarEvent = {};
      `);

      createFile('src/handlers/all.ts', `
        function handleFooEvent() {}
        function handleBarEvent() {}
      `);

      const config: CoverageConstraintConfig = {
        source_type: 'export_names',
        source_pattern: '*Event',
        in_files: 'src/events/**/*.ts',
        target_pattern: 'handle${value}',
        in_target_files: 'src/handlers/**/*.ts',
        severity: 'error',
        archId: 'test.events',
      };

      const result = await validator.validate(config);

      expect(result.totalSources).toBe(2);
      expect(result.coveredSources).toBe(2);
      expect(result.coveragePercent).toBe(100);
      expect(result.gaps).toHaveLength(0);
    });
  });

  describe('string_literals source type', () => {
    it('should extract string literals from union type', async () => {
      createFile('src/events/types.ts', `
        export type DomainEventType =
          | "bookmark.created"
          | "bookmark.archived"
          | "bookmark.deleted";
      `);

      createFile('src/handlers/index.ts', `
        const handlers = {
          "bookmark.created": handleCreated,
          "bookmark.deleted": handleDeleted,
        };
      `);

      const config: CoverageConstraintConfig = {
        source_type: 'string_literals',
        source_pattern: 'DomainEventType\\s*=\\s*([^;]+)',
        extract_values: '"([^"]+)"',
        in_files: 'src/events/**/*.ts',
        target_pattern: '"${value}"',
        in_target_files: 'src/handlers/**/*.ts',
        severity: 'error',
        archId: 'test.events',
      };

      const result = await validator.validate(config);

      expect(result.totalSources).toBe(3);
      expect(result.coveredSources).toBe(2);
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].value).toBe('bookmark.archived');
    });

    it('should handle empty source files gracefully', async () => {
      createFile('src/events/empty.ts', '');
      createFile('src/handlers/empty.ts', '');

      const config: CoverageConstraintConfig = {
        source_type: 'string_literals',
        source_pattern: 'EventType\\s*=\\s*([^;]+)',
        in_files: 'src/events/**/*.ts',
        target_pattern: '"${value}"',
        in_target_files: 'src/handlers/**/*.ts',
        severity: 'error',
        archId: 'test.events',
      };

      const result = await validator.validate(config);

      expect(result.totalSources).toBe(0);
      expect(result.coveragePercent).toBe(100); // 0/0 = 100%
      expect(result.gaps).toHaveLength(0);
    });
  });

  describe('file_names source type', () => {
    it('should discover files by basename and find handlers in content', async () => {
      createFile('src/entities/User.ts', 'export class User {}');
      createFile('src/entities/Product.ts', 'export class Product {}');
      createFile('src/entities/Order.ts', 'export class Order {}');

      // Handler files contain the entity name in their content
      createFile('src/queries/user.query.ts', 'export const UserQuery = { entity: "User" };');
      createFile('src/queries/product.query.ts', 'export const ProductQuery = { entity: "Product" };');
      // No Order query file

      const config: CoverageConstraintConfig = {
        source_type: 'file_names',
        source_pattern: '*',
        in_files: 'src/entities/*.ts',
        target_pattern: 'entity: "${value}"',  // Search for entity name in content
        in_target_files: 'src/queries/**/*.ts',
        severity: 'error',
        archId: 'test.entities',
      };

      const result = await validator.validate(config);

      expect(result.totalSources).toBe(3);
      expect(result.coveredSources).toBe(2);
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].value).toBe('Order');
    });
  });

  describe('gap reporting', () => {
    it('should include source file and line in gaps', async () => {
      createFile('src/events/test.ts', `
        // line 1
        // line 2
        export const TestEvent = {};
      `);

      createFile('src/handlers/test.ts', '// empty');

      const config: CoverageConstraintConfig = {
        source_type: 'export_names',
        source_pattern: '*Event',
        in_files: 'src/events/**/*.ts',
        target_pattern: 'handle${value}',
        in_target_files: 'src/handlers/**/*.ts',
        severity: 'error',
        archId: 'test.events',
      };

      const result = await validator.validate(config);

      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0]).toMatchObject({
        value: 'TestEvent',
        sourceFile: 'src/events/test.ts',
        expectedIn: 'src/handlers/**/*.ts',
      });
      expect(result.gaps[0].sourceLine).toBeGreaterThan(0);
    });

    it('should include target pattern with value substituted', async () => {
      createFile('src/events/foo.ts', 'export const FooEvent = {};');
      createFile('src/handlers/foo.ts', '// no handler');

      const config: CoverageConstraintConfig = {
        source_type: 'export_names',
        source_pattern: '*Event',
        in_files: 'src/events/**/*.ts',
        target_pattern: 'case "${value}":',
        in_target_files: 'src/handlers/**/*.ts',
        severity: 'error',
        archId: 'test.events',
      };

      const result = await validator.validate(config);

      expect(result.gaps[0].targetPattern).toBe('case "FooEvent":');
    });
  });

  describe('validateAll', () => {
    it('should validate multiple configs and return results map', async () => {
      createFile('src/events/a.ts', 'export const AEvent = {};');
      createFile('src/events/b.ts', 'export const BEvent = {};');
      createFile('src/handlers/a.ts', 'function handleAEvent() {}');

      const configs: CoverageConstraintConfig[] = [
        {
          source_type: 'export_names',
          source_pattern: 'AEvent',
          in_files: 'src/events/**/*.ts',
          target_pattern: 'handleAEvent',
          in_target_files: 'src/handlers/**/*.ts',
          severity: 'error',
          archId: 'test.a',
        },
        {
          source_type: 'export_names',
          source_pattern: 'BEvent',
          in_files: 'src/events/**/*.ts',
          target_pattern: 'handleBEvent',
          in_target_files: 'src/handlers/**/*.ts',
          severity: 'error',
          archId: 'test.b',
        },
      ];

      const results = await validator.validateAll(configs);

      expect(results.size).toBe(2);

      const resultA = results.get('test.a:AEvent');
      expect(resultA?.coveredSources).toBe(1);
      expect(resultA?.gaps).toHaveLength(0);

      const resultB = results.get('test.b:BEvent');
      expect(resultB?.coveredSources).toBe(0);
      expect(resultB?.gaps).toHaveLength(1);
    });
  });

  describe('union_members source type', () => {
    it('should extract string literals from union type', async () => {
      createFile('src/events/types.ts', `
        export type DomainEventType =
          | "bookmark.created"
          | "bookmark.archived"
          | "bookmark.deleted";
      `);

      createFile('src/handlers/index.ts', `
        const handlers = {
          "bookmark.created": handleCreated,
          "bookmark.deleted": handleDeleted,
        };
      `);

      const config: CoverageConstraintConfig = {
        source_type: 'union_members',
        source_pattern: 'DomainEventType',
        in_files: 'src/events/**/*.ts',
        target_pattern: '"${value}"',
        in_target_files: 'src/handlers/**/*.ts',
        severity: 'error',
        archId: 'test.events',
      };

      const result = await validator.validate(config);

      expect(result.totalSources).toBe(3);
      expect(result.coveredSources).toBe(2);
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].value).toBe('bookmark.archived');
    });

    it('should handle nested union types with parentheses', async () => {
      createFile('src/types.ts', `
        export type Status = ("active" | "inactive") | "pending";
      `);

      createFile('src/handlers.ts', `
        switch (status) {
          case "active": break;
          case "inactive": break;
        }
      `);

      const config: CoverageConstraintConfig = {
        source_type: 'union_members',
        source_pattern: 'Status',
        in_files: 'src/types.ts',
        target_pattern: '"${value}"',
        in_target_files: 'src/handlers.ts',
        severity: 'error',
        archId: 'test.status',
      };

      const result = await validator.validate(config);

      expect(result.totalSources).toBe(3);
      expect(result.coveredSources).toBe(2);
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].value).toBe('pending');
    });

    it('should return empty when type not found', async () => {
      createFile('src/types.ts', `
        export type SomeOtherType = "foo" | "bar";
      `);

      const config: CoverageConstraintConfig = {
        source_type: 'union_members',
        source_pattern: 'NonExistentType',
        in_files: 'src/types.ts',
        target_pattern: '"${value}"',
        in_target_files: 'src/handlers.ts',
        severity: 'error',
        archId: 'test.types',
      };

      const result = await validator.validate(config);

      expect(result.totalSources).toBe(0);
      expect(result.coveragePercent).toBe(100);
    });
  });

  describe('object_keys source type', () => {
    it('should extract keys from object literal', async () => {
      createFile('src/handlers/registry.ts', `
        const handlers = {
          "user.created": handleUserCreated,
          "user.updated": handleUserUpdated,
          "user.deleted": handleUserDeleted,
        };
      `);

      createFile('src/events/types.ts', `
        // Event definitions
        const UserCreated = { type: "user.created" };
        const UserUpdated = { type: "user.updated" };
      `);

      const config: CoverageConstraintConfig = {
        source_type: 'object_keys',
        source_pattern: 'handlers',
        in_files: 'src/handlers/**/*.ts',
        target_pattern: '"${value}"',
        in_target_files: 'src/events/**/*.ts',
        severity: 'error',
        archId: 'test.handlers',
      };

      const result = await validator.validate(config);

      expect(result.totalSources).toBe(3);
      expect(result.coveredSources).toBe(2);
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].value).toBe('user.deleted');
    });

    it('should extract identifier keys from object', async () => {
      createFile('src/config.ts', `
        const config = {
          apiUrl: "https://api.example.com",
          timeout: 5000,
          debug: true,
        };
      `);

      createFile('src/env.ts', `
        // Environment variables
        const API_URL = process.env.apiUrl;
        const TIMEOUT = process.env.timeout;
      `);

      const config: CoverageConstraintConfig = {
        source_type: 'object_keys',
        source_pattern: 'config',
        in_files: 'src/config.ts',
        target_pattern: '${value}',
        in_target_files: 'src/env.ts',
        severity: 'warning',
        archId: 'test.config',
      };

      const result = await validator.validate(config);

      expect(result.totalSources).toBe(3);
      expect(result.coveredSources).toBe(2);
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].value).toBe('debug');
    });

    it('should return empty when object not found', async () => {
      createFile('src/handlers.ts', `
        const otherObject = { foo: 1 };
      `);

      const config: CoverageConstraintConfig = {
        source_type: 'object_keys',
        source_pattern: 'nonExistentObject',
        in_files: 'src/handlers.ts',
        target_pattern: '${value}',
        in_target_files: 'src/handlers.ts',
        severity: 'error',
        archId: 'test.obj',
      };

      const result = await validator.validate(config);

      expect(result.totalSources).toBe(0);
      expect(result.coveragePercent).toBe(100);
    });
  });

  describe('transform parameter', () => {
    it('should apply PascalCase transform to source values', async () => {
      createFile('src/events/types.ts', `
        export type EventType = "user.created" | "user.deleted";
      `);

      createFile('src/handlers/index.ts', `
        function handleUserCreated() {}
        // Note: second handler not implemented yet
      `);

      // The transform converts "user.created" → "handleUserCreated"
      // target_pattern then uses ${value} which is the transformed value
      const config: CoverageConstraintConfig = {
        source_type: 'union_members',
        source_pattern: 'EventType',
        in_files: 'src/events/**/*.ts',
        target_pattern: '${value}',
        transform: 'handle${PascalCase}',
        in_target_files: 'src/handlers/**/*.ts',
        severity: 'error',
        archId: 'test.events',
      };

      const result = await validator.validate(config);

      expect(result.totalSources).toBe(2);
      expect(result.coveredSources).toBe(1);
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].value).toBe('user.deleted');
      expect(result.gaps[0].targetPattern).toBe('handleUserDeleted');
    });

    it('should apply snake_case transform', async () => {
      createFile('src/events.ts', `
        export const UserCreatedEvent = {};
        export const UserDeletedEvent = {};
      `);

      createFile('src/handlers.ts', `
        const user_created_event_handler = () => {};
        // Note: second handler not implemented yet
      `);

      // The transform converts "UserCreatedEvent" → "user_created_event_handler"
      const config: CoverageConstraintConfig = {
        source_type: 'export_names',
        source_pattern: '*Event',
        in_files: 'src/events.ts',
        target_pattern: '${value}',
        transform: '${snake_case}_handler',
        in_target_files: 'src/handlers.ts',
        severity: 'error',
        archId: 'test.events',
      };

      const result = await validator.validate(config);

      expect(result.totalSources).toBe(2);
      expect(result.coveredSources).toBe(1);
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].value).toBe('UserDeletedEvent');
      expect(result.gaps[0].targetPattern).toBe('user_deleted_event_handler');
    });
  });

  describe('edge cases', () => {
    it('should handle non-existent source files', async () => {
      const config: CoverageConstraintConfig = {
        source_type: 'export_names',
        source_pattern: '*Event',
        in_files: 'nonexistent/**/*.ts',
        target_pattern: 'handle${value}',
        in_target_files: 'src/handlers/**/*.ts',
        severity: 'error',
        archId: 'test.events',
      };

      const result = await validator.validate(config);

      expect(result.totalSources).toBe(0);
      expect(result.coveragePercent).toBe(100);
    });

    it('should handle non-existent target files', async () => {
      createFile('src/events/test.ts', 'export const TestEvent = {};');

      const config: CoverageConstraintConfig = {
        source_type: 'export_names',
        source_pattern: '*Event',
        in_files: 'src/events/**/*.ts',
        target_pattern: 'handle${value}',
        in_target_files: 'nonexistent/**/*.ts',
        severity: 'error',
        archId: 'test.events',
      };

      const result = await validator.validate(config);

      expect(result.totalSources).toBe(1);
      expect(result.coveredSources).toBe(0);
      expect(result.gaps).toHaveLength(1);
    });

    it('should handle regex special characters in source values', async () => {
      createFile('src/events/test.ts', `
        export type EventType = "user.created" | "user.updated";
      `);

      createFile('src/handlers/test.ts', `
        const handlers = {
          "user.created": fn1,
          "user.updated": fn2,
        };
      `);

      const config: CoverageConstraintConfig = {
        source_type: 'string_literals',
        source_pattern: 'EventType\\s*=\\s*([^;]+)',
        extract_values: '"([^"]+)"',
        in_files: 'src/events/**/*.ts',
        target_pattern: '"${value}"',
        in_target_files: 'src/handlers/**/*.ts',
        severity: 'error',
        archId: 'test.events',
      };

      const result = await validator.validate(config);

      // The "." in "user.created" should be escaped properly
      expect(result.totalSources).toBe(2);
      expect(result.coveredSources).toBe(2);
      expect(result.gaps).toHaveLength(0);
    });
  });
});
