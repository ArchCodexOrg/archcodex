/**
 * @arch archcodex.test.script
 *
 * Run drift detection on the ArchCodex spec registry.
 * Usage: npx tsx scripts/run-drift.ts
 */
import { loadSpecRegistry } from '../src/core/spec/loader.js';
import { findUnwiredSpecs, formatUnwiredReport } from '../src/core/spec/drift/unwired.js';
import * as path from 'node:path';

async function main() {
  const projectRoot = path.resolve(import.meta.dirname, '..');
  const registry = await loadSpecRegistry(projectRoot);
  const result = findUnwiredSpecs(registry);
  console.log(formatUnwiredReport(result));
}

main().catch(console.error);
