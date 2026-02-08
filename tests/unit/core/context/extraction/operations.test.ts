/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for operation finder.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fileSystem from '../../../../../src/utils/file-system.js';
import { findOperations } from '../../../../../src/core/context/extraction/operations.js';

// Spy on the file-system module
vi.spyOn(fileSystem, 'globFiles');
vi.spyOn(fileSystem, 'readFile');

const mockGlobFiles = vi.mocked(fileSystem.globFiles);
const mockReadFile = vi.mocked(fileSystem.readFile);

describe('Operation Finder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findOperations', () => {
    it('should find CRUD operations for an entity', async () => {
      mockGlobFiles.mockResolvedValue(['src/todo.service.ts']);
      mockReadFile.mockResolvedValue(`
export function createTodo(data: TodoInput) {
  return db.insert('todos', data);
}

export function getTodo(id: string) {
  return db.get('todos', id);
}

export function updateTodo(id: string, data: Partial<TodoInput>) {
  return db.update('todos', id, data);
}

export function deleteTodo(id: string) {
  return db.delete('todos', id);
}
`);

      const result = await findOperations('/project', 'todo');

      expect(result.entity).toBe('todo');
      expect(result.existingOperations.map(o => o.name)).toContain('createTodo');
      expect(result.existingOperations.map(o => o.name)).toContain('getTodo');
      expect(result.existingOperations.map(o => o.name)).toContain('updateTodo');
      expect(result.existingOperations.map(o => o.name)).toContain('deleteTodo');
    });

    it('should find operations with plural entity name', async () => {
      mockGlobFiles.mockResolvedValue(['src/todos.service.ts']);
      mockReadFile.mockResolvedValue(`
export function listTodos() {
  return db.query('todos').collect();
}

export function findTodos(filter: TodoFilter) {
  return db.query('todos').filter(filter).collect();
}
`);

      const result = await findOperations('/project', 'todos');

      expect(result.existingOperations.map(o => o.name)).toContain('listTodos');
      expect(result.existingOperations.map(o => o.name)).toContain('findTodos');
    });

    it('should find similar operations (duplicate, clone, copy)', async () => {
      mockGlobFiles.mockResolvedValue(['src/template.service.ts']);
      mockReadFile.mockResolvedValue(`
export function duplicateTemplate(id: string) {
  const template = getTemplate(id);
  return createTemplate({ ...template, name: template.name + ' (copy)' });
}

export function cloneProject(id: string) {
  return copyProject(id, { deep: true });
}

export function copyDocument(id: string) {
  const doc = getDocument(id);
  return createDocument({ ...doc });
}
`);

      const result = await findOperations('/project', 'todo');

      expect(result.similarOperations.map(o => o.name)).toContain('duplicateTemplate');
      expect(result.similarOperations.map(o => o.name)).toContain('cloneProject');
      expect(result.similarOperations.map(o => o.name)).toContain('copyDocument');
    });

    it('should include file and line information', async () => {
      mockGlobFiles.mockResolvedValue(['src/todo.service.ts']);
      mockReadFile.mockResolvedValue(`// Line 1
// Line 2
export function createTodo(data: TodoInput) {
  return db.insert('todos', data);
}
`);

      const result = await findOperations('/project', 'todo');

      const createOp = result.existingOperations.find(o => o.name === 'createTodo');
      expect(createOp).toBeDefined();
      expect(createOp!.file).toBe('src/todo.service.ts');
      expect(createOp!.line).toBe(3);
    });

    it('should find async function operations', async () => {
      mockGlobFiles.mockResolvedValue(['src/todo.service.ts']);
      mockReadFile.mockResolvedValue(`
export async function createTodo(data: TodoInput) {
  return await db.insert('todos', data);
}
`);

      const result = await findOperations('/project', 'todo');

      expect(result.existingOperations.map(o => o.name)).toContain('createTodo');
    });

    it('should find arrow function operations', async () => {
      mockGlobFiles.mockResolvedValue(['src/todo.service.ts']);
      mockReadFile.mockResolvedValue(`
export const createTodo = (data: TodoInput) => {
  return db.insert('todos', data);
};

export const getTodo = async (id: string) => {
  return await db.get('todos', id);
};
`);

      const result = await findOperations('/project', 'todo');

      expect(result.existingOperations.map(o => o.name)).toContain('createTodo');
      expect(result.existingOperations.map(o => o.name)).toContain('getTodo');
    });

    it('should find class method operations', async () => {
      mockGlobFiles.mockResolvedValue(['src/todo.repository.ts']);
      mockReadFile.mockResolvedValue(`
class TodoRepository {
  public createTodo(data: TodoInput) {
    return this.db.insert('todos', data);
  }

  async getTodo(id: string) {
    return await this.db.get('todos', id);
  }

  private updateTodoInternal(id: string, data: any) {
    return this.db.update('todos', id, data);
  }
}
`);

      const result = await findOperations('/project', 'todo');

      expect(result.existingOperations.map(o => o.name)).toContain('createTodo');
      expect(result.existingOperations.map(o => o.name)).toContain('getTodo');
      expect(result.existingOperations.map(o => o.name)).toContain('updateTodoInternal');
    });

    it('should return empty results when no files match', async () => {
      mockGlobFiles.mockResolvedValue([]);

      const result = await findOperations('/project', 'nonexistent');

      expect(result.existingOperations).toHaveLength(0);
      expect(result.similarOperations).toHaveLength(0);
    });

    it('should handle files that cannot be read', async () => {
      mockGlobFiles.mockResolvedValue(['src/todo.service.ts', 'src/broken.ts']);
      mockReadFile
        .mockResolvedValueOnce(`export function createTodo() {}`)
        .mockRejectedValueOnce(new Error('Cannot read file'));

      const result = await findOperations('/project', 'todo');

      // Should still return results from readable files
      expect(result.existingOperations.some(o => o.name === 'createTodo')).toBe(true);
    });

    it('should deduplicate similar operations by name and file', async () => {
      mockGlobFiles.mockResolvedValue(['src/service.ts']);
      mockReadFile.mockResolvedValue(`
export function duplicateItem(id: string) {
  // Implementation
}
`);

      const result = await findOperations('/project', 'item');

      // Should deduplicate by name:file
      const dupeCount = result.similarOperations.filter(o => o.name === 'duplicateItem').length;
      expect(dupeCount).toBe(1);
    });

    it('should not match control flow keywords as functions', async () => {
      mockGlobFiles.mockResolvedValue(['src/todo.service.ts']);
      mockReadFile.mockResolvedValue(`
export function getTodo(id: string) {
  if (id) {
    return db.get(id);
  }
  for (const item of items) {
    console.log(item);
  }
}
`);

      const result = await findOperations('/project', 'todo');

      // Should find getTodo (CRUD operation) but not if/for
      const names = result.existingOperations.map(o => o.name);
      expect(names).toContain('getTodo');
      expect(names).not.toContain('if');
      expect(names).not.toContain('for');
    });
  });
});
