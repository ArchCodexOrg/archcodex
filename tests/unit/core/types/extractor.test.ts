/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for TypeExtractor - extracting type information from TypeScript files.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TypeExtractor } from '../../../../src/core/types/extractor.js';

describe('TypeExtractor', () => {
  let extractor: TypeExtractor;

  beforeEach(() => {
    extractor = new TypeExtractor();
  });

  afterEach(() => {
    extractor.dispose();
  });

  describe('extractFromFile', () => {
    it('should extract interface definitions', () => {
      const content = `
export interface User {
  id: string;
  name: string;
  email?: string;
  readonly createdAt: Date;
}
      `;

      const types = extractor.extractFromFile('test.ts', content);

      expect(types).toHaveLength(1);
      expect(types[0].name).toBe('User');
      expect(types[0].kind).toBe('interface');
      expect(types[0].isExported).toBe(true);
      expect(types[0].properties).toHaveLength(4);

      const idProp = types[0].properties.find(p => p.name === 'id');
      expect(idProp?.type).toBe('string');
      expect(idProp?.optional).toBe(false);

      const emailProp = types[0].properties.find(p => p.name === 'email');
      expect(emailProp?.optional).toBe(true);

      const createdAtProp = types[0].properties.find(p => p.name === 'createdAt');
      expect(createdAtProp?.readonly).toBe(true);
    });

    it('should extract interface methods', () => {
      const content = `
export interface Repository<T> {
  find(id: string): T | null;
  findAll(): T[];
  save(entity: T): void;
}
      `;

      const types = extractor.extractFromFile('test.ts', content);

      expect(types).toHaveLength(1);
      expect(types[0].methods).toHaveLength(3);

      const findMethod = types[0].methods.find(m => m.name === 'find');
      expect(findMethod?.parameters).toHaveLength(1);
      expect(findMethod?.parameters[0].name).toBe('id');
      expect(findMethod?.parameters[0].type).toBe('string');
    });

    it('should extract interface extends', () => {
      const content = `
interface BaseEntity {
  id: string;
}

export interface User extends BaseEntity {
  name: string;
}
      `;

      const types = extractor.extractFromFile('test.ts', content);
      const userType = types.find(t => t.name === 'User');

      expect(userType?.extends).toEqual(['BaseEntity']);
    });

    it('should extract generic type parameters', () => {
      const content = `
export interface Container<T, K extends string = string> {
  value: T;
  key: K;
}
      `;

      const types = extractor.extractFromFile('test.ts', content);

      expect(types[0].generics).toHaveLength(2);
      expect(types[0].generics?.[0]).toBe('T');
      expect(types[0].generics?.[1]).toContain('K');
    });

    it('should extract type alias with object literal', () => {
      const content = `
export type Config = {
  host: string;
  port: number;
  debug?: boolean;
};
      `;

      const types = extractor.extractFromFile('test.ts', content);

      expect(types).toHaveLength(1);
      expect(types[0].name).toBe('Config');
      expect(types[0].kind).toBe('type');
      expect(types[0].properties).toHaveLength(3);
    });

    it('should not extract non-object type aliases', () => {
      const content = `
export type ID = string;
export type Status = 'active' | 'inactive';
export type Callback = (value: string) => void;
      `;

      const types = extractor.extractFromFile('test.ts', content);

      // These are not object-like types, so they should not be extracted
      expect(types).toHaveLength(0);
    });

    it('should extract enum definitions', () => {
      const content = `
export enum Status {
  Active,
  Inactive,
  Pending
}
      `;

      const types = extractor.extractFromFile('test.ts', content);

      expect(types).toHaveLength(1);
      expect(types[0].name).toBe('Status');
      expect(types[0].kind).toBe('enum');
      expect(types[0].properties).toHaveLength(3);
      expect(types[0].properties.map(p => p.name)).toEqual(['Active', 'Inactive', 'Pending']);
    });

    it('should extract class definitions', () => {
      const content = `
export class UserService {
  public name: string;
  private secret: string;

  public getUser(id: string): User {
    return {} as User;
  }

  private validate(): boolean {
    return true;
  }
}
      `;

      const types = extractor.extractFromFile('test.ts', content);

      expect(types).toHaveLength(1);
      expect(types[0].name).toBe('UserService');
      expect(types[0].kind).toBe('class');

      // Only public properties should be extracted
      expect(types[0].properties).toHaveLength(1);
      expect(types[0].properties[0].name).toBe('name');

      // Only public methods should be extracted
      expect(types[0].methods).toHaveLength(1);
      expect(types[0].methods[0].name).toBe('getUser');
    });

    it('should extract class extends and implements', () => {
      const content = `
interface Serializable {
  serialize(): string;
}

class BaseClass {
  id: string;
}

export class User extends BaseClass implements Serializable {
  name: string;
  serialize(): string { return ''; }
}
      `;

      const types = extractor.extractFromFile('test.ts', content);
      const userClass = types.find(t => t.name === 'User');

      expect(userClass?.extends).toContain('BaseClass');
      expect(userClass?.extends).toContain('Serializable');
    });

    it('should handle multiple types in one file', () => {
      const content = `
export interface Request {
  method: string;
  url: string;
}

export interface Response {
  status: number;
  body: string;
}

export type Options = {
  timeout: number;
};

export enum Method {
  GET,
  POST
}
      `;

      const types = extractor.extractFromFile('test.ts', content);

      expect(types).toHaveLength(4);
      expect(types.map(t => t.name).sort()).toEqual(['Method', 'Options', 'Request', 'Response']);
    });

    it('should include file path and line numbers', () => {
      const content = `
export interface User {
  id: string;
}
      `;

      const types = extractor.extractFromFile('src/models/user.ts', content);

      expect(types[0].file).toBe('src/models/user.ts');
      expect(types[0].line).toBeGreaterThan(0);
      expect(types[0].location.line).toBeGreaterThan(0);
    });

    it('should handle non-exported types', () => {
      const content = `
interface InternalType {
  secret: string;
}

export interface PublicType {
  value: string;
}
      `;

      const types = extractor.extractFromFile('test.ts', content);

      const internalType = types.find(t => t.name === 'InternalType');
      const publicType = types.find(t => t.name === 'PublicType');

      expect(internalType?.isExported).toBe(false);
      expect(publicType?.isExported).toBe(true);
    });
  });

  describe('createStructure', () => {
    it('should create consistent structure signatures', () => {
      const content = `
export interface User {
  name: string;
  age: number;
  email?: string;
}
      `;

      const types = extractor.extractFromFile('test.ts', content);
      const structure = TypeExtractor.createStructure(types[0]);

      expect(structure.propertyCount).toBe(3);
      expect(structure.methodCount).toBe(0);
      expect(structure.propertySignature).toContain('age');
      expect(structure.propertySignature).toContain('email?');
      expect(structure.propertySignature).toContain('name');
    });

    it('should sort properties alphabetically for consistent signatures', () => {
      const content1 = `
export interface TypeA {
  zebra: string;
  apple: number;
}
      `;
      const content2 = `
export interface TypeB {
  apple: number;
  zebra: string;
}
      `;

      const types1 = extractor.extractFromFile('test1.ts', content1);
      const types2 = extractor.extractFromFile('test2.ts', content2);

      const struct1 = TypeExtractor.createStructure(types1[0]);
      const struct2 = TypeExtractor.createStructure(types2[0]);

      expect(struct1.propertySignature).toBe(struct2.propertySignature);
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 1.0 for identical types', () => {
      const content = `
export interface User {
  id: string;
  name: string;
}

export interface Person {
  id: string;
  name: string;
}
      `;

      const types = extractor.extractFromFile('test.ts', content);
      const similarity = TypeExtractor.calculateSimilarity(types[0], types[1]);

      expect(similarity).toBe(1.0);
    });

    it('should return less than 1.0 for similar types', () => {
      const content = `
export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Person {
  id: string;
  name: string;
  phone: string;
}
      `;

      const types = extractor.extractFromFile('test.ts', content);
      const similarity = TypeExtractor.calculateSimilarity(types[0], types[1]);

      expect(similarity).toBeGreaterThan(0.5);
      expect(similarity).toBeLessThan(1.0);
    });

    it('should return low similarity for very different types', () => {
      const content = `
export interface User {
  id: string;
  name: string;
}

export interface Config {
  host: string;
  port: number;
  debug: boolean;
}
      `;

      const types = extractor.extractFromFile('test.ts', content);
      const similarity = TypeExtractor.calculateSimilarity(types[0], types[1]);

      expect(similarity).toBeLessThan(0.5);
    });

    it('should handle empty types', () => {
      const content = `
export interface Empty1 {}
export interface Empty2 {}
      `;

      const types = extractor.extractFromFile('test.ts', content);
      const similarity = TypeExtractor.calculateSimilarity(types[0], types[1]);

      // Both empty, so they're considered identical
      expect(similarity).toBe(1.0);
    });
  });
});
