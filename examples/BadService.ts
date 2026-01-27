/**
 * @arch domain.service
 *
 * This service violates several architectural constraints
 */

// VIOLATION: Domain should not import framework code
import express from 'express';
import { Router } from 'express';

// VIOLATION: Naming pattern - doesn't end with 'Service'
export class BadHandler {
  private app: express.Application;
  private router: Router;

  constructor() {
    this.app = express();
    this.router = Router();
  }

  // Too many public methods would trigger max_public_methods warning
  public method1(): void {}
  public method2(): void {}
  public method3(): void {}
  public method4(): void {}
  public method5(): void {}
  public method6(): void {}
  public method7(): void {}
  public method8(): void {}
  public method9(): void {}
  public method10(): void {}
  public method11(): void {}
  public method12(): void {}
}
