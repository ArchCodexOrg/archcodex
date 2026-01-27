/**
 * @arch domain.service
 *
 * User domain service - handles user business logic
 */

import { Logger } from '@/utils/logger';

export interface User {
  id: string;
  name: string;
  email: string;
}

export class UserService {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async findById(id: string): Promise<User | null> {
    this.logger.info('Finding user', { id });
    // Business logic here
    return null;
  }

  async create(data: Omit<User, 'id'>): Promise<User> {
    this.logger.info('Creating user', { email: data.email });
    return {
      id: crypto.randomUUID(),
      ...data,
    };
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    this.logger.info('Updating user', { id });
    return { id, name: data.name ?? '', email: data.email ?? '' };
  }

  async delete(id: string): Promise<void> {
    this.logger.info('Deleting user', { id });
  }
}
