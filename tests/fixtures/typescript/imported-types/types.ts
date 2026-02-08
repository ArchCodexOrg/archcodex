/**
 * Test fixture: type definitions imported by main.ts
 */

export interface UserResult {
  valid: boolean;
  errors: string[];
  userId: string;
}

export interface UserInput {
  name: string;
  email: string;
  age?: number;
}

export type StatusCode = 'active' | 'inactive' | 'suspended';
