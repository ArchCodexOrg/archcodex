/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 *
 * Tests for AST-based semantic analyzer.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SemanticAnalyzer } from '../../../../src/core/garden/semantic-analyzer.js';

describe('SemanticAnalyzer', () => {
  let analyzer: SemanticAnalyzer;

  beforeEach(() => {
    analyzer = new SemanticAnalyzer();
  });

  afterEach(() => {
    analyzer.dispose();
  });

  describe('React component detection', () => {
    it('should detect React functional component with JSX', () => {
      const code = `
        import React from 'react';
        export function UserCard({ name }) {
          return <div className="card">{name}</div>;
        }
      `;
      const result = analyzer.analyze('UserCard.tsx', code);
      expect(result.category).toBe('react-component');
      expect(result.confidence).toBe('high');
      expect(result.signals).toContain('contains JSX elements');
    });

    it('should detect React arrow function component', () => {
      const code = `
        import React from 'react';
        export const Button = ({ label }) => <button>{label}</button>;
      `;
      const result = analyzer.analyze('Button.tsx', code);
      expect(result.category).toBe('react-component');
    });

    it('should detect component without React import', () => {
      const code = `
        export function Card() {
          return <div>Content</div>;
        }
      `;
      const result = analyzer.analyze('Card.tsx', code);
      expect(result.category).toBe('react-component');
      expect(result.confidence).toBe('medium'); // Lower confidence without React import
    });
  });

  describe('React hook detection', () => {
    it('should detect custom hook that calls React hooks', () => {
      const code = `
        import { useState, useEffect } from 'react';
        export function useAuth() {
          const [user, setUser] = useState(null);
          useEffect(() => {
            // fetch user
          }, []);
          return user;
        }
      `;
      const result = analyzer.analyze('useAuth.ts', code);
      expect(result.category).toBe('react-hook');
      expect(result.confidence).toBe('high');
      expect(result.signals).toContain('defines function starting with "use"');
      expect(result.signals).toContain('calls React hooks');
    });

    it('should detect arrow function hook', () => {
      const code = `
        import { useState } from 'react';
        export const useCounter = () => {
          const [count, setCount] = useState(0);
          return { count, increment: () => setCount(c => c + 1) };
        };
      `;
      const result = analyzer.analyze('useCounter.ts', code);
      expect(result.category).toBe('react-hook');
    });
  });

  describe('Service detection', () => {
    it('should detect service class with async methods', () => {
      const code = `
        export class UserService {
          constructor(private db: Database) {}

          async findById(id: string) {
            return this.db.find(id);
          }

          async create(data: UserData) {
            return this.db.insert(data);
          }
        }
      `;
      const result = analyzer.analyze('UserService.ts', code);
      expect(result.category).toBe('service');
      expect(result.confidence).toMatch(/high|medium/);
      expect(result.signals.some(s => s.includes('async methods'))).toBe(true);
    });

    it('should detect repository class', () => {
      const code = `
        export class UserRepository {
          async findAll() {
            return [];
          }
          async save(user: User) {
            return user;
          }
        }
      `;
      const result = analyzer.analyze('UserRepository.ts', code);
      expect(result.category).toBe('repository');
    });
  });

  describe('Validator detection', () => {
    it('should detect Zod schema file', () => {
      const code = `
        import { z } from 'zod';
        export const UserSchema = z.object({
          name: z.string(),
          email: z.string().email(),
        });
      `;
      const result = analyzer.analyze('user.schema.ts', code);
      expect(result.category).toBe('validator');
      expect(result.confidence).toBe('high');
      expect(result.signals).toContain('imports zod');
    });

    it('should detect validator class', () => {
      const code = `
        export class EmailValidator {
          validate(email: string): boolean {
            return email.includes('@');
          }
        }
      `;
      const result = analyzer.analyze('EmailValidator.ts', code);
      expect(result.category).toBe('validator');
    });
  });

  describe('Test file detection', () => {
    it('should detect vitest test file', () => {
      const code = `
        import { describe, it, expect } from 'vitest';
        describe('MyModule', () => {
          it('should work', () => {
            expect(true).toBe(true);
          });
        });
      `;
      const result = analyzer.analyze('myModule.test.ts', code);
      expect(result.category).toBe('test');
      expect(result.confidence).toBe('high');
    });

    it('should detect jest test file', () => {
      const code = `
        import { jest } from '@jest/globals';
        describe('test', () => {
          it('works', () => {});
        });
      `;
      const result = analyzer.analyze('component.spec.ts', code);
      expect(result.category).toBe('test');
    });
  });

  describe('Types file detection', () => {
    it('should detect types-only file', () => {
      const code = `
        export interface User {
          id: string;
          name: string;
        }

        export type UserRole = 'admin' | 'user';

        export enum Status {
          Active,
          Inactive,
        }
      `;
      const result = analyzer.analyze('types.ts', code);
      expect(result.category).toBe('types');
      expect(result.confidence).toBe('high');
    });
  });

  describe('Utility file detection', () => {
    it('should detect utility file with exported functions', () => {
      const code = `
        export function formatDate(date: Date): string {
          return date.toISOString();
        }

        export function parseJson(str: string) {
          return JSON.parse(str);
        }
      `;
      const result = analyzer.analyze('utils.ts', code);
      expect(result.category).toBe('utility');
    });
  });

  describe('Config file detection', () => {
    it('should detect config file', () => {
      const code = `
        export const config = {
          apiUrl: 'https://api.example.com',
          timeout: 5000,
          retries: 3,
        };
      `;
      const result = analyzer.analyze('config.ts', code);
      expect(result.category).toBe('config');
    });
  });

  describe('Unknown detection', () => {
    it('should return unknown for ambiguous files', () => {
      const code = `
        const x = 1;
        console.log(x);
      `;
      const result = analyzer.analyze('mystery.ts', code);
      expect(result.category).toBe('unknown');
      expect(result.confidence).toBe('low');
    });
  });
});
