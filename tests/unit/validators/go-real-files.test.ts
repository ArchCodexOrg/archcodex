/**
 * @arch archcodex.test.unit
 */
/**
 * Tests for Go validator against real .go files on disk.
 * These tests exercise the full parseFile path including file I/O,
 * ensuring the validator handles real-world Go source correctly.
 */
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { GoValidator } from '../../../src/validators/go.js';

const validator = new GoValidator();

const fixturesDir = path.resolve(__dirname, '../../fixtures/go');

function fixture(name: string): string {
  return path.join(fixturesDir, name);
}

describe('GoValidator - real .go files', () => {
  describe('http_handler.go', () => {
    it('parses the file from disk', async () => {
      const model = await validator.parseFile(fixture('http_handler.go'));

      expect(model.fileName).toBe('http_handler.go');
      expect(model.extension).toBe('.go');
      expect(model.language).toBe('go');
      expect(model.content).toContain('package api');
    });

    it('extracts all imports from grouped import block', async () => {
      const model = await validator.parseFile(fixture('http_handler.go'));

      expect(model.imports.length).toBeGreaterThanOrEqual(5);
      const specs = model.imports.map(i => i.moduleSpecifier);
      expect(specs).toContain('context');
      expect(specs).toContain('encoding/json');
      expect(specs).toContain('fmt');
      expect(specs).toContain('net/http');
      expect(specs).toContain('time');
    });

    it('extracts the UserService interface with 4 methods', async () => {
      const model = await validator.parseFile(fixture('http_handler.go'));

      const iface = model.interfaces.find(i => i.name === 'UserService');
      expect(iface).toBeDefined();
      expect(iface!.isExported).toBe(true);
      expect(iface!.methods).toHaveLength(4);

      const methodNames = iface!.methods!.map(m => m.name);
      expect(methodNames).toContain('GetUser');
      expect(methodNames).toContain('ListUsers');
      expect(methodNames).toContain('CreateUser');
      expect(methodNames).toContain('DeleteUser');
    });

    it('extracts all structs', async () => {
      const model = await validator.parseFile(fixture('http_handler.go'));

      const names = model.classes.map(c => c.name);
      expect(names).toContain('User');
      expect(names).toContain('Handler');
      expect(names).toContain('Logger');
    });

    it('extracts Handler methods with correct visibility', async () => {
      const model = await validator.parseFile(fixture('http_handler.go'));

      const handler = model.classes.find(c => c.name === 'Handler')!;
      expect(handler.methods.length).toBeGreaterThanOrEqual(4);

      const getUser = handler.methods.find(m => m.name === 'GetUser');
      expect(getUser).toBeDefined();
      expect(getUser!.visibility).toBe('public');
      expect(getUser!.parameterCount).toBe(2);

      const healthCheck = handler.methods.find(m => m.name === 'healthCheck');
      expect(healthCheck).toBeDefined();
      expect(healthCheck!.visibility).toBe('private');
    });

    it('extracts Logger methods as private', async () => {
      const model = await validator.parseFile(fixture('http_handler.go'));

      const logger = model.classes.find(c => c.name === 'Logger')!;
      expect(logger.methods.length).toBe(2);
      expect(logger.methods.every(m => m.visibility === 'private')).toBe(true);
    });

    it('extracts the NewHandler constructor function', async () => {
      const model = await validator.parseFile(fixture('http_handler.go'));

      const ctor = model.functions.find(f => f.name === 'NewHandler');
      expect(ctor).toBeDefined();
      expect(ctor!.isExported).toBe(true);
      expect(ctor!.parameterCount).toBe(2);
    });

    it('extracts exported items correctly', async () => {
      const model = await validator.parseFile(fixture('http_handler.go'));

      const exportNames = model.exports.map(e => e.name);
      // Exported types
      expect(exportNames).toContain('UserService');
      expect(exportNames).toContain('User');
      expect(exportNames).toContain('Handler');
      expect(exportNames).toContain('Logger');
      expect(exportNames).toContain('NewHandler');
      expect(exportNames).toContain('MaxPageSize');
      expect(exportNames).toContain('RequestIDKey');

      // Unexported items should NOT be exported
      expect(exportNames).not.toContain('contextKey');
      expect(exportNames).not.toContain('healthCheck');
      expect(exportNames).not.toContain('logError');
    });

    it('detects function calls including json and http', async () => {
      const model = await validator.parseFile(fixture('http_handler.go'));

      expect(model.functionCalls.find(c => c.callee === 'http.Error')).toBeDefined();
      expect(model.functionCalls.find(c => c.methodName === 'Encode')).toBeDefined();
      expect(model.functionCalls.find(c => c.methodName === 'Decode')).toBeDefined();
      expect(model.functionCalls.find(c => c.callee === 'fmt.Fprint')).toBeDefined();
      expect(model.functionCalls.find(c => c.callee === 'fmt.Printf')).toBeDefined();
    });

    it('has reasonable LOC count', async () => {
      const model = await validator.parseFile(fixture('http_handler.go'));

      // The file has ~120 lines, LOC should be less (excluding comments/blanks)
      expect(model.lineCount).toBeGreaterThan(80);
      expect(model.locCount).toBeGreaterThan(50);
      expect(model.locCount).toBeLessThan(model.lineCount);
    });
  });

  describe('repository.go', () => {
    it('parses the file from disk', async () => {
      const model = await validator.parseFile(fixture('repository.go'));

      expect(model.fileName).toBe('repository.go');
      expect(model.language).toBe('go');
    });

    it('extracts sentinel error vars with correct export status', async () => {
      const model = await validator.parseFile(fixture('repository.go'));

      const exportNames = model.exports.map(e => e.name);
      expect(exportNames).toContain('ErrNotFound');
      expect(exportNames).toContain('ErrDuplicate');
      expect(exportNames).toContain('ErrConnection');
      expect(exportNames).not.toContain('errPoolClosed');
    });

    it('extracts the Repository interface with CRUD methods', async () => {
      const model = await validator.parseFile(fixture('repository.go'));

      const repo = model.interfaces.find(i => i.name === 'Repository');
      expect(repo).toBeDefined();
      expect(repo!.methods).toHaveLength(4);

      const methodNames = repo!.methods!.map(m => m.name);
      expect(methodNames).toEqual(['FindByID', 'FindAll', 'Save', 'Delete']);
    });

    it('extracts the Cacheable interface', async () => {
      const model = await validator.parseFile(fixture('repository.go'));

      const cacheable = model.interfaces.find(i => i.name === 'Cacheable');
      expect(cacheable).toBeDefined();
      expect(cacheable!.methods).toHaveLength(2);
      expect(cacheable!.methods!.map(m => m.name)).toEqual(['Invalidate', 'Warm']);
    });

    it('extracts SQLRepository with sync.RWMutex embedding', async () => {
      const model = await validator.parseFile(fixture('repository.go'));

      const sqlRepo = model.classes.find(c => c.name === 'SQLRepository');
      expect(sqlRepo).toBeDefined();
      expect(sqlRepo!.extends).toBe('RWMutex');
      expect(sqlRepo!.isExported).toBe(true);
    });

    it('attaches all 6 methods to SQLRepository', async () => {
      const model = await validator.parseFile(fixture('repository.go'));

      const sqlRepo = model.classes.find(c => c.name === 'SQLRepository')!;
      expect(sqlRepo.methods).toHaveLength(6);

      const methodNames = sqlRepo.methods.map(m => m.name);
      expect(methodNames).toContain('FindByID');
      expect(methodNames).toContain('FindAll');
      expect(methodNames).toContain('Save');
      expect(methodNames).toContain('Delete');
      expect(methodNames).toContain('Invalidate');
      expect(methodNames).toContain('Warm');

      // All exported
      expect(sqlRepo.methods.every(m => m.visibility === 'public')).toBe(true);
    });

    it('extracts Entity struct without embeddings', async () => {
      const model = await validator.parseFile(fixture('repository.go'));

      const entity = model.classes.find(c => c.name === 'Entity');
      expect(entity).toBeDefined();
      expect(entity!.extends).toBeUndefined();
      expect(entity!.methods).toHaveLength(0);
    });

    it('detects NewSQLRepository as exported, newInternalHelper as unexported', async () => {
      const model = await validator.parseFile(fixture('repository.go'));

      const ctor = model.functions.find(f => f.name === 'NewSQLRepository');
      expect(ctor).toBeDefined();
      expect(ctor!.isExported).toBe(true);

      const helper = model.functions.find(f => f.name === 'newInternalHelper');
      expect(helper).toBeDefined();
      expect(helper!.isExported).toBe(false);

      const exportNames = model.exports.map(e => e.name);
      expect(exportNames).toContain('NewSQLRepository');
      expect(exportNames).not.toContain('newInternalHelper');
    });

    it('detects database function calls', async () => {
      const model = await validator.parseFile(fixture('repository.go'));

      expect(model.functionCalls.find(c => c.methodName === 'QueryRowContext')).toBeDefined();
      expect(model.functionCalls.find(c => c.methodName === 'QueryContext')).toBeDefined();
      expect(model.functionCalls.find(c => c.methodName === 'ExecContext')).toBeDefined();
      expect(model.functionCalls.find(c => c.methodName === 'Scan')).toBeDefined();
      expect(model.functionCalls.find(c => c.methodName === 'Close')).toBeDefined();
      expect(model.functionCalls.find(c => c.methodName === 'Next')).toBeDefined();
      expect(model.functionCalls.find(c => c.methodName === 'Err')).toBeDefined();
    });

    it('detects sync lock/unlock calls', async () => {
      const model = await validator.parseFile(fixture('repository.go'));

      expect(model.functionCalls.filter(c => c.methodName === 'Lock').length).toBeGreaterThanOrEqual(3);
      expect(model.functionCalls.filter(c => c.methodName === 'Unlock').length).toBeGreaterThanOrEqual(3);
      expect(model.functionCalls.filter(c => c.methodName === 'RLock').length).toBeGreaterThanOrEqual(1);
      expect(model.functionCalls.filter(c => c.methodName === 'RUnlock').length).toBeGreaterThanOrEqual(1);
    });

    it('detects errors.Is and errors.New calls', async () => {
      const model = await validator.parseFile(fixture('repository.go'));

      expect(model.functionCalls.find(c => c.callee === 'errors.New')).toBeDefined();
      expect(model.functionCalls.find(c => c.callee === 'errors.Is')).toBeDefined();
    });
  });

  describe('middleware.go', () => {
    it('parses the file from disk', async () => {
      const model = await validator.parseFile(fixture('middleware.go'));

      expect(model.fileName).toBe('middleware.go');
      expect(model.language).toBe('go');
    });

    it('handles the multi-line block comment at top of file for LOC', async () => {
      const model = await validator.parseFile(fixture('middleware.go'));

      // Block comment at top shouldn't count as LOC
      expect(model.locCount).toBeLessThan(model.lineCount);
      expect(model.locCount).toBeGreaterThan(60);
    });

    it('extracts imports correctly', async () => {
      const model = await validator.parseFile(fixture('middleware.go'));

      const specs = model.imports.map(i => i.moduleSpecifier);
      expect(specs).toContain('fmt');
      expect(specs).toContain('log');
      expect(specs).toContain('net/http');
      expect(specs).toContain('sync/atomic');
      expect(specs).toContain('time');
    });

    it('extracts exported and unexported const/var declarations', async () => {
      const model = await validator.parseFile(fixture('middleware.go'));

      const exportNames = model.exports.map(e => e.name);
      expect(exportNames).toContain('DefaultTimeout');
      expect(exportNames).toContain('DefaultMaxConns');
      expect(exportNames).toContain('RequestCount');
      expect(exportNames).not.toContain('headerRequestID');
      expect(exportNames).not.toContain('activeConns');
    });

    it('extracts both interfaces', async () => {
      const model = await validator.parseFile(fixture('middleware.go'));

      const tokenValidator = model.interfaces.find(i => i.name === 'TokenValidator');
      expect(tokenValidator).toBeDefined();
      expect(tokenValidator!.methods).toHaveLength(2);
      expect(tokenValidator!.methods!.map(m => m.name)).toEqual(['Validate', 'Refresh']);

      const rateLimiter = model.interfaces.find(i => i.name === 'RateLimiter');
      expect(rateLimiter).toBeDefined();
      expect(rateLimiter!.methods).toHaveLength(2);
    });

    it('extracts struct hierarchy with embeddings', async () => {
      const model = await validator.parseFile(fixture('middleware.go'));

      const base = model.classes.find(c => c.name === 'Base');
      expect(base).toBeDefined();
      expect(base!.extends).toBeUndefined();

      const logging = model.classes.find(c => c.name === 'LoggingMiddleware');
      expect(logging).toBeDefined();
      expect(logging!.extends).toBe('Base');
      expect(logging!.inheritanceChain).toEqual(['LoggingMiddleware', 'Base']);

      const auth = model.classes.find(c => c.name === 'AuthMiddleware');
      expect(auth).toBeDefined();
      expect(auth!.extends).toBe('Base');
    });

    it('attaches methods to correct structs', async () => {
      const model = await validator.parseFile(fixture('middleware.go'));

      const logging = model.classes.find(c => c.name === 'LoggingMiddleware')!;
      expect(logging.methods).toHaveLength(2);
      expect(logging.methods.map(m => m.name)).toContain('Wrap');
      expect(logging.methods.map(m => m.name)).toContain('SetVerbose');

      const auth = model.classes.find(c => c.name === 'AuthMiddleware')!;
      expect(auth.methods).toHaveLength(1);
      expect(auth.methods[0].name).toBe('Wrap');
    });

    it('extracts standalone functions', async () => {
      const model = await validator.parseFile(fixture('middleware.go'));

      const chain = model.functions.find(f => f.name === 'Chain');
      expect(chain).toBeDefined();
      expect(chain!.isExported).toBe(true);

      const newLogging = model.functions.find(f => f.name === 'NewLoggingMiddleware');
      expect(newLogging).toBeDefined();
      expect(newLogging!.isExported).toBe(true);

      const newAuth = model.functions.find(f => f.name === 'NewAuthMiddleware');
      expect(newAuth).toBeDefined();
      expect(newAuth!.isExported).toBe(true);

      const recover = model.functions.find(f => f.name === 'recoverPanic');
      expect(recover).toBeDefined();
      expect(recover!.isExported).toBe(false);
    });

    it('detects mutations (m.verbose = v)', async () => {
      const model = await validator.parseFile(fixture('middleware.go'));

      const verboseMutation = model.mutations.find(m => m.target === 'm.verbose');
      expect(verboseMutation).toBeDefined();
      expect(verboseMutation!.operator).toBe('=');
    });

    it('detects atomic and http function calls', async () => {
      const model = await validator.parseFile(fixture('middleware.go'));

      expect(model.functionCalls.find(c => c.callee === 'atomic.AddInt64')).toBeDefined();
      expect(model.functionCalls.find(c => c.callee === 'http.Error')).toBeDefined();
      expect(model.functionCalls.find(c => c.callee === 'http.HandlerFunc')).toBeDefined();
      expect(model.functionCalls.find(c => c.callee === 'time.Now')).toBeDefined();
      expect(model.functionCalls.find(c => c.callee === 'time.Since')).toBeDefined();
    });

    it('exports only uppercase names', async () => {
      const model = await validator.parseFile(fixture('middleware.go'));

      for (const exp of model.exports) {
        expect(exp.name[0]).toBe(exp.name[0].toUpperCase());
        expect(exp.isDefault).toBe(false);
      }
    });
  });
});
