/**
 * @arch archcodex.test.unit
 */
/**
 * Tests for Python validator against real .py files on disk.
 * These tests exercise the full parseFile path including file I/O,
 * ensuring the validator handles real-world Python source correctly.
 */
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { PythonValidator } from '../../../src/validators/python.js';

const validator = new PythonValidator();

const fixturesDir = path.resolve(__dirname, '../../fixtures/python');

function fixture(name: string): string {
  return path.join(fixturesDir, name);
}

describe('PythonValidator - real .py files', () => {
  describe('http_handler.py', () => {
    it('parses the file from disk', async () => {
      const model = await validator.parseFile(fixture('http_handler.py'));

      expect(model.fileName).toBe('http_handler.py');
      expect(model.extension).toBe('.py');
      expect(model.language).toBe('python');
      expect(model.content).toContain('class Handler');
    });

    it('extracts all imports', async () => {
      const model = await validator.parseFile(fixture('http_handler.py'));

      const specs = model.imports.map(i => i.moduleSpecifier);
      expect(specs).toContain('abc');
      expect(specs).toContain('dataclasses');
      expect(specs).toContain('typing');
      expect(specs).toContain('json');
      expect(specs).toContain('logging');
    });

    it('extracts named imports from abc and typing', async () => {
      const model = await validator.parseFile(fixture('http_handler.py'));

      const abcImport = model.imports.find(i => i.moduleSpecifier === 'abc');
      expect(abcImport).toBeDefined();
      expect(abcImport!.namedImports).toContain('ABC');
      expect(abcImport!.namedImports).toContain('abstractmethod');

      const typingImport = model.imports.find(i => i.moduleSpecifier === 'typing');
      expect(typingImport).toBeDefined();
      expect(typingImport!.namedImports).toContain('List');
      expect(typingImport!.namedImports).toContain('Optional');
      expect(typingImport!.namedImports).toContain('Dict');
    });

    it('detects UserService as an ABC interface', async () => {
      const model = await validator.parseFile(fixture('http_handler.py'));

      const iface = model.interfaces.find(i => i.name === 'UserService');
      expect(iface).toBeDefined();
      expect(iface!.isExported).toBe(true);
      expect(iface!.methods).toHaveLength(4);

      const methodNames = iface!.methods!.map(m => m.name);
      expect(methodNames).toContain('get_user');
      expect(methodNames).toContain('list_users');
      expect(methodNames).toContain('create_user');
      expect(methodNames).toContain('delete_user');
    });

    it('extracts User as a regular class (dataclass)', async () => {
      const model = await validator.parseFile(fixture('http_handler.py'));

      const user = model.classes.find(c => c.name === 'User');
      expect(user).toBeDefined();
      expect(user!.isExported).toBe(true);
      expect(user!.decorators.some(d => d.name === 'dataclass')).toBe(true);
    });

    it('extracts Handler class with method visibility', async () => {
      const model = await validator.parseFile(fixture('http_handler.py'));

      const handler = model.classes.find(c => c.name === 'Handler');
      expect(handler).toBeDefined();
      expect(handler!.isExported).toBe(true);

      const publicMethods = handler!.methods.filter(m => m.visibility === 'public');
      const protectedMethods = handler!.methods.filter(m => m.visibility === 'protected');
      const privateMethods = handler!.methods.filter(m => m.visibility === 'private');

      // __init__, get_user, list_users, create_user are public
      expect(publicMethods.length).toBeGreaterThanOrEqual(4);
      // _validate_request is protected
      expect(protectedMethods.length).toBeGreaterThanOrEqual(1);
      expect(protectedMethods.some(m => m.name === '_validate_request')).toBe(true);
      // __reset_counters is private
      expect(privateMethods.length).toBeGreaterThanOrEqual(1);
      expect(privateMethods.some(m => m.name === '__reset_counters')).toBe(true);
    });

    it('counts Handler method parameters excluding self', async () => {
      const model = await validator.parseFile(fixture('http_handler.py'));

      const handler = model.classes.find(c => c.name === 'Handler')!;
      const init = handler.methods.find(m => m.name === '__init__');
      expect(init).toBeDefined();
      // __init__(self, svc, debug) => 2 params
      expect(init!.parameterCount).toBe(2);

      const getUser = handler.methods.find(m => m.name === 'get_user');
      expect(getUser).toBeDefined();
      // get_user(self, request) => 1 param
      expect(getUser!.parameterCount).toBe(1);
    });

    it('extracts HealthCheck class', async () => {
      const model = await validator.parseFile(fixture('http_handler.py'));

      const hc = model.classes.find(c => c.name === 'HealthCheck');
      expect(hc).toBeDefined();
      expect(hc!.methods).toHaveLength(1);
      expect(hc!.methods[0].name).toBe('check');
    });

    it('extracts top-level functions with visibility', async () => {
      const model = await validator.parseFile(fixture('http_handler.py'));

      const createApp = model.functions.find(f => f.name === 'create_app');
      expect(createApp).toBeDefined();
      expect(createApp!.isExported).toBe(true);
      expect(createApp!.parameterCount).toBe(2);

      const setupLogging = model.functions.find(f => f.name === '_setup_logging');
      expect(setupLogging).toBeDefined();
      expect(setupLogging!.isExported).toBe(false);
      expect(setupLogging!.visibility).toBe('protected');
    });

    it('exports all public classes and functions', async () => {
      const model = await validator.parseFile(fixture('http_handler.py'));

      const exportNames = model.exports.map(e => e.name);
      expect(exportNames).toContain('Handler');
      expect(exportNames).toContain('User');
      expect(exportNames).toContain('HealthCheck');
      expect(exportNames).toContain('create_app');
      expect(exportNames).not.toContain('_setup_logging');
    });

    it('detects function calls', async () => {
      const model = await validator.parseFile(fixture('http_handler.py'));

      expect(model.functionCalls.find(c => c.methodName === 'getLogger')).toBeDefined();
      expect(model.functionCalls.find(c => c.methodName === 'warning')).toBeDefined();
      expect(model.functionCalls.find(c => c.methodName === 'error')).toBeDefined();
      expect(model.functionCalls.find(c => c.methodName === 'info')).toBeDefined();
    });

    it('has reasonable LOC count', async () => {
      const model = await validator.parseFile(fixture('http_handler.py'));

      expect(model.lineCount).toBeGreaterThan(80);
      expect(model.locCount).toBeGreaterThan(40);
      expect(model.locCount).toBeLessThan(model.lineCount);
    });
  });

  describe('repository.py', () => {
    it('parses the file from disk', async () => {
      const model = await validator.parseFile(fixture('repository.py'));

      expect(model.fileName).toBe('repository.py');
      expect(model.language).toBe('python');
    });

    it('extracts imports including threading and sqlite3', async () => {
      const model = await validator.parseFile(fixture('repository.py'));

      const specs = model.imports.map(i => i.moduleSpecifier);
      expect(specs).toContain('abc');
      expect(specs).toContain('dataclasses');
      expect(specs).toContain('typing');
      expect(specs).toContain('threading');
      expect(specs).toContain('sqlite3');
    });

    it('extracts exception classes', async () => {
      const model = await validator.parseFile(fixture('repository.py'));

      const notFound = model.classes.find(c => c.name === 'NotFoundError');
      expect(notFound).toBeDefined();
      expect(notFound!.extends).toBe('Exception');
      expect(notFound!.isExported).toBe(true);

      const duplicate = model.classes.find(c => c.name === 'DuplicateError');
      expect(duplicate).toBeDefined();
      expect(duplicate!.extends).toBe('Exception');

      // _ConnectionError is private
      const connErr = model.classes.find(c => c.name === '_ConnectionError');
      expect(connErr).toBeDefined();
      expect(connErr!.isExported).toBe(false);
    });

    it('extracts Entity as a dataclass', async () => {
      const model = await validator.parseFile(fixture('repository.py'));

      const entity = model.classes.find(c => c.name === 'Entity');
      expect(entity).toBeDefined();
      expect(entity!.decorators.some(d => d.name === 'dataclass')).toBe(true);
    });

    it('detects Repository as an ABC interface with 4 methods', async () => {
      const model = await validator.parseFile(fixture('repository.py'));

      const repo = model.interfaces.find(i => i.name === 'Repository');
      expect(repo).toBeDefined();
      expect(repo!.methods).toHaveLength(4);

      const methodNames = repo!.methods!.map(m => m.name);
      expect(methodNames).toContain('find_by_id');
      expect(methodNames).toContain('find_all');
      expect(methodNames).toContain('save');
      expect(methodNames).toContain('delete');
    });

    it('detects Cacheable as a Protocol interface', async () => {
      const model = await validator.parseFile(fixture('repository.py'));

      const cacheable = model.interfaces.find(i => i.name === 'Cacheable');
      expect(cacheable).toBeDefined();
      expect(cacheable!.methods).toHaveLength(2);
      expect(cacheable!.methods!.map(m => m.name)).toContain('invalidate');
      expect(cacheable!.methods!.map(m => m.name)).toContain('warm');
    });

    it('extracts SQLRepository extending Repository', async () => {
      const model = await validator.parseFile(fixture('repository.py'));

      const sqlRepo = model.classes.find(c => c.name === 'SQLRepository');
      expect(sqlRepo).toBeDefined();
      expect(sqlRepo!.extends).toBe('Repository');
      expect(sqlRepo!.isExported).toBe(true);
    });

    it('extracts SQLRepository methods with correct counts', async () => {
      const model = await validator.parseFile(fixture('repository.py'));

      const sqlRepo = model.classes.find(c => c.name === 'SQLRepository')!;

      // __init__, find_by_id, find_all, save, delete, invalidate, warm, __clear_cache
      expect(sqlRepo.methods.length).toBeGreaterThanOrEqual(8);

      const init = sqlRepo.methods.find(m => m.name === '__init__');
      expect(init).toBeDefined();
      expect(init!.parameterCount).toBe(1); // db, excluding self

      const findById = sqlRepo.methods.find(m => m.name === 'find_by_id');
      expect(findById).toBeDefined();
      expect(findById!.parameterCount).toBe(1); // entity_id

      const clearCache = sqlRepo.methods.find(m => m.name === '__clear_cache');
      expect(clearCache).toBeDefined();
      expect(clearCache!.visibility).toBe('private');
    });

    it('extracts top-level functions', async () => {
      const model = await validator.parseFile(fixture('repository.py'));

      const createRepo = model.functions.find(f => f.name === 'create_repository');
      expect(createRepo).toBeDefined();
      expect(createRepo!.isExported).toBe(true);
      expect(createRepo!.parameterCount).toBe(1);

      const migrate = model.functions.find(f => f.name === '_migrate_schema');
      expect(migrate).toBeDefined();
      expect(migrate!.isExported).toBe(false);
    });

    it('exports public names', async () => {
      const model = await validator.parseFile(fixture('repository.py'));

      const exportNames = model.exports.map(e => e.name);
      expect(exportNames).toContain('NotFoundError');
      expect(exportNames).toContain('DuplicateError');
      expect(exportNames).toContain('Entity');
      expect(exportNames).toContain('SQLRepository');
      expect(exportNames).toContain('create_repository');
      expect(exportNames).not.toContain('_ConnectionError');
      expect(exportNames).not.toContain('_migrate_schema');
    });

    it('detects mutations', async () => {
      const model = await validator.parseFile(fixture('repository.py'));

      const cacheMutations = model.mutations.filter(m => m.rootObject === 'self');
      expect(cacheMutations.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('middleware.py', () => {
    it('parses the file from disk', async () => {
      const model = await validator.parseFile(fixture('middleware.py'));

      expect(model.fileName).toBe('middleware.py');
      expect(model.language).toBe('python');
    });

    it('handles multi-line module docstring for LOC', async () => {
      const model = await validator.parseFile(fixture('middleware.py'));

      // Docstring at top shouldn't count as LOC
      expect(model.locCount).toBeLessThan(model.lineCount);
      expect(model.locCount).toBeGreaterThan(60);
    });

    it('extracts all imports', async () => {
      const model = await validator.parseFile(fixture('middleware.py'));

      const specs = model.imports.map(i => i.moduleSpecifier);
      expect(specs).toContain('abc');
      expect(specs).toContain('typing');
      expect(specs).toContain('time');
      expect(specs).toContain('logging');
      expect(specs).toContain('functools');
    });

    it('uses __all__ for exports', async () => {
      const model = await validator.parseFile(fixture('middleware.py'));

      const exportNames = model.exports.map(e => e.name);
      expect(exportNames).toContain('Middleware');
      expect(exportNames).toContain('LoggingMiddleware');
      expect(exportNames).toContain('AuthMiddleware');
      expect(exportNames).toContain('chain');
      expect(exportNames).toContain('DEFAULT_TIMEOUT');
      // Not in __all__
      expect(exportNames).not.toContain('MAX_RETRIES');
      expect(exportNames).not.toContain('_InternalTracker');
      expect(exportNames).not.toContain('create_logging_middleware');
      expect(exportNames).not.toContain('_reset_internal_state');
    });

    it('detects TokenValidator and RateLimiter as ABC interfaces', async () => {
      const model = await validator.parseFile(fixture('middleware.py'));

      const tv = model.interfaces.find(i => i.name === 'TokenValidator');
      expect(tv).toBeDefined();
      expect(tv!.methods).toHaveLength(2);
      expect(tv!.methods!.map(m => m.name)).toContain('validate');
      expect(tv!.methods!.map(m => m.name)).toContain('refresh');

      const rl = model.interfaces.find(i => i.name === 'RateLimiter');
      expect(rl).toBeDefined();
      expect(rl!.methods).toHaveLength(2);
    });

    it('detects Middleware as an abstract base class (interface)', async () => {
      const model = await validator.parseFile(fixture('middleware.py'));

      const mw = model.interfaces.find(i => i.name === 'Middleware');
      expect(mw).toBeDefined();
    });

    it('extracts LoggingMiddleware extending Middleware', async () => {
      const model = await validator.parseFile(fixture('middleware.py'));

      const logging = model.classes.find(c => c.name === 'LoggingMiddleware');
      expect(logging).toBeDefined();
      expect(logging!.extends).toBe('Middleware');
      expect(logging!.isExported).toBe(true);

      const methodNames = logging!.methods.map(m => m.name);
      expect(methodNames).toContain('__init__');
      expect(methodNames).toContain('process');
      expect(methodNames).toContain('set_verbose');
    });

    it('extracts AuthMiddleware extending Middleware', async () => {
      const model = await validator.parseFile(fixture('middleware.py'));

      const auth = model.classes.find(c => c.name === 'AuthMiddleware');
      expect(auth).toBeDefined();
      expect(auth!.extends).toBe('Middleware');

      const protectedMethods = auth!.methods.filter(m => m.visibility === 'protected');
      expect(protectedMethods.some(m => m.name === '_check_brute_force')).toBe(true);
    });

    it('detects _InternalTracker as non-exported', async () => {
      const model = await validator.parseFile(fixture('middleware.py'));

      const tracker = model.classes.find(c => c.name === '_InternalTracker');
      expect(tracker).toBeDefined();
      expect(tracker!.isExported).toBe(false);
    });

    it('extracts top-level functions with visibility', async () => {
      const model = await validator.parseFile(fixture('middleware.py'));

      const chain = model.functions.find(f => f.name === 'chain');
      expect(chain).toBeDefined();
      expect(chain!.isExported).toBe(true);

      const factory = model.functions.find(f => f.name === 'create_logging_middleware');
      expect(factory).toBeDefined();
      expect(factory!.isExported).toBe(true);

      const reset = model.functions.find(f => f.name === '_reset_internal_state');
      expect(reset).toBeDefined();
      expect(reset!.isExported).toBe(false);
      expect(reset!.visibility).toBe('protected');

      const cached = model.functions.find(f => f.name === '_cached_lookup');
      expect(cached).toBeDefined();
      expect(cached!.decorators.some(d => d.name === 'functools.lru_cache')).toBe(true);
    });

    it('detects function calls', async () => {
      const model = await validator.parseFile(fixture('middleware.py'));

      expect(model.functionCalls.find(c => c.methodName === 'getLogger')).toBeDefined();
      expect(model.functionCalls.find(c => c.methodName === 'monotonic')).toBeDefined();
    });

    it('detects mutations on self properties', async () => {
      const model = await validator.parseFile(fixture('middleware.py'));

      // self._verbose = verbose, self.request_count += 1, etc.
      const selfMutations = model.mutations.filter(m => m.rootObject === 'self');
      expect(selfMutations.length).toBeGreaterThanOrEqual(2);
    });
  });
});
