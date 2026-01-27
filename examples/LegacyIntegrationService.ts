/**
 * @arch domain.service
 *
 * Example showing override usage
 *
 * @override forbid_import:express
 * @reason Legacy integration - migrating to domain events in Q2
 * @expires 2026-03-01
 * @ticket ARCH-1234
 * @approved_by @tech-lead
 */

// This import would normally be forbidden, but is overridden
import express from 'express';

export class LegacyIntegrationService {
  private expressApp: express.Application;

  constructor() {
    this.expressApp = express();
  }

  // Temporary bridge to legacy system
  getLegacyApp(): express.Application {
    return this.expressApp;
  }
}
