/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Integration tests for conditional constraints in the validation engine.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { ValidationEngine } from '../../../../src/core/validation/engine.js';
import type { Config } from '../../../../src/core/config/schema.js';
import type { Registry } from '../../../../src/core/registry/schema.js';

describe('Conditional Constraints Integration', () => {
  let tmpDir: string;

  const config: Config = {
    version: '1.0',
    paths: { registry: '.arch/registry.yaml', docs: '.arch/docs' },
    validation: {
      fail_on_expired_override: true,
      treat_warnings_as_errors: false,
      max_overrides_per_file: 3,
    },
    files: { untagged: { policy: 'allow' } },
    overrides: {
      required_fields: ['reason'],
      warn_no_expiry: true,
      max_expiry_days: 90,
    },
  };

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'archcodex-conditional-'));
    await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('has_decorator condition', () => {
    it('should apply constraint when class has decorator', async () => {
      // Registry with conditional constraint
      const registry: Registry = {
        nodes: {
          'test.controller': {
            rationale: 'Test architecture',
            constraints: [
              {
                rule: 'require_decorator',
                value: '@Authenticated',
                severity: 'error',
                when: {
                  has_decorator: '@HttpHandler',
                },
              },
            ],
          },
        },
        mixins: {},
      };

      // File with @HttpHandler decorator but missing @Authenticated
      const fileContent = `/**
 * @arch test.controller
 */
@HttpHandler
export class UserController {
  getUser() {}
}
`;
      const filePath = path.join(tmpDir, 'src/user.controller.ts');
      await fs.writeFile(filePath, fileContent);

      const engine = new ValidationEngine(tmpDir, config, registry);
      const result = await engine.validateFile('src/user.controller.ts');
      engine.dispose();

      // Should fail because class has @HttpHandler but not @Authenticated
      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].message).toContain('@Authenticated');
    });

    it('should skip constraint when class does not have decorator', async () => {
      // Registry with conditional constraint
      const registry: Registry = {
        nodes: {
          'test.controller': {
            rationale: 'Test architecture',
            constraints: [
              {
                rule: 'require_decorator',
                value: '@Authenticated',
                severity: 'error',
                when: {
                  has_decorator: '@HttpHandler',
                },
              },
            ],
          },
        },
        mixins: {},
      };

      // File without @HttpHandler decorator (so constraint shouldn't apply)
      const fileContent = `/**
 * @arch test.controller
 */
export class HealthCheckController {
  check() {}
}
`;
      const filePath = path.join(tmpDir, 'src/health.controller.ts');
      await fs.writeFile(filePath, fileContent);

      const engine = new ValidationEngine(tmpDir, config, registry);
      const result = await engine.validateFile('src/health.controller.ts');
      engine.dispose();

      // Should pass because condition is not met (no @HttpHandler)
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('has_import condition', () => {
    it('should apply constraint when file has import', async () => {
      const registry: Registry = {
        nodes: {
          'test.service': {
            rationale: 'Test architecture',
            constraints: [
              {
                rule: 'forbid_import',
                value: ['axios'],
                severity: 'error',
                when: {
                  has_import: 'express',
                },
              },
            ],
          },
        },
        mixins: {},
      };

      // File with express import and forbidden axios import
      const fileContent = `/**
 * @arch test.service
 */
import express from 'express';
import axios from 'axios';

export class ApiService {}
`;
      const filePath = path.join(tmpDir, 'src/api.service.ts');
      await fs.writeFile(filePath, fileContent);

      const engine = new ValidationEngine(tmpDir, config, registry);
      const result = await engine.validateFile('src/api.service.ts');
      engine.dispose();

      // Should fail because file has express (condition met) and uses axios
      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.message.includes('axios'))).toBe(true);
    });

    it('should skip constraint when file does not have import', async () => {
      const registry: Registry = {
        nodes: {
          'test.service': {
            rationale: 'Test architecture',
            constraints: [
              {
                rule: 'forbid_import',
                value: ['axios'],
                severity: 'error',
                when: {
                  has_import: 'express',
                },
              },
            ],
          },
        },
        mixins: {},
      };

      // File without express import (condition not met)
      const fileContent = `/**
 * @arch test.service
 */
import axios from 'axios';

export class DataService {}
`;
      const filePath = path.join(tmpDir, 'src/data.service.ts');
      await fs.writeFile(filePath, fileContent);

      const engine = new ValidationEngine(tmpDir, config, registry);
      const result = await engine.validateFile('src/data.service.ts');
      engine.dispose();

      // Should pass because condition is not met (no express import)
      expect(result.passed).toBe(true);
    });
  });

  describe('extends condition', () => {
    it('should apply constraint when class extends base', async () => {
      const registry: Registry = {
        nodes: {
          'test.repository': {
            rationale: 'Test architecture',
            constraints: [
              {
                rule: 'require_decorator',
                value: '@Repository',
                severity: 'error',
                when: {
                  extends: 'BaseRepository',
                },
              },
            ],
          },
        },
        mixins: {},
      };

      // File extending BaseRepository but missing @Repository
      const fileContent = `/**
 * @arch test.repository
 */
export class UserRepository extends BaseRepository {
  findById() {}
}
`;
      const filePath = path.join(tmpDir, 'src/user.repository.ts');
      await fs.writeFile(filePath, fileContent);

      const engine = new ValidationEngine(tmpDir, config, registry);
      const result = await engine.validateFile('src/user.repository.ts');
      engine.dispose();

      // Should fail because class extends BaseRepository but lacks @Repository
      expect(result.passed).toBe(false);
      expect(result.violations[0].message).toContain('@Repository');
    });
  });

  describe('file_matches condition', () => {
    it('should apply constraint when file path matches pattern', async () => {
      const registry: Registry = {
        nodes: {
          'test.api': {
            rationale: 'Test architecture',
            constraints: [
              {
                rule: 'max_file_lines',
                value: 10,
                severity: 'error',
                when: {
                  file_matches: '*.controller.ts',
                },
              },
            ],
          },
        },
        mixins: {},
      };

      // Controller file that exceeds 10 lines
      const fileContent = `/**
 * @arch test.api
 */
// Line 3
// Line 4
// Line 5
// Line 6
// Line 7
// Line 8
// Line 9
// Line 10
// Line 11
// Line 12
export class LongController {}
`;
      const filePath = path.join(tmpDir, 'src/long.controller.ts');
      await fs.writeFile(filePath, fileContent);

      const engine = new ValidationEngine(tmpDir, config, registry);
      const result = await engine.validateFile('src/long.controller.ts');
      engine.dispose();

      // Should fail because file matches pattern and exceeds line limit
      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.rule === 'max_file_lines')).toBe(true);
    });

    it('should skip constraint when file path does not match', async () => {
      const registry: Registry = {
        nodes: {
          'test.api': {
            rationale: 'Test architecture',
            constraints: [
              {
                rule: 'max_file_lines',
                value: 10,
                severity: 'error',
                when: {
                  file_matches: '*.controller.ts',
                },
              },
            ],
          },
        },
        mixins: {},
      };

      // Service file (not controller) - constraint should not apply
      const fileContent = `/**
 * @arch test.api
 */
// Line 3
// Line 4
// Line 5
// Line 6
// Line 7
// Line 8
// Line 9
// Line 10
// Line 11
// Line 12
export class LongService {}
`;
      const filePath = path.join(tmpDir, 'src/long.service.ts');
      await fs.writeFile(filePath, fileContent);

      const engine = new ValidationEngine(tmpDir, config, registry);
      const result = await engine.validateFile('src/long.service.ts');
      engine.dispose();

      // Should pass because file doesn't match *.controller.ts pattern
      expect(result.passed).toBe(true);
    });
  });

  describe('implements condition', () => {
    it('should apply constraint when class implements interface', async () => {
      const registry: Registry = {
        nodes: {
          'test.service': {
            rationale: 'Test architecture',
            constraints: [
              {
                rule: 'require_decorator',
                value: '@Injectable',
                severity: 'error',
                when: {
                  implements: 'IService',
                },
              },
            ],
          },
        },
        mixins: {},
      };

      // File implementing IService but missing @Injectable
      const fileContent = `/**
 * @arch test.service
 */
export class UserService implements IService {
  execute() {}
}
`;
      const filePath = path.join(tmpDir, 'src/user.svc.ts');
      await fs.writeFile(filePath, fileContent);

      const engine = new ValidationEngine(tmpDir, config, registry);
      const result = await engine.validateFile('src/user.svc.ts');
      engine.dispose();

      // Should fail because class implements IService but lacks @Injectable
      expect(result.passed).toBe(false);
      expect(result.violations[0].message).toContain('@Injectable');
    });
  });
});
