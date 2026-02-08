/**
 * @arch archcodex.test.script
 *
 * Test generation script for SpecCodex improvements specs.
 * Generates unit, property, and integration tests for all 9 improvement specs.
 *
 * Usage: npx tsx scripts/generate-improvement-tests.ts
 */
import { loadSpecRegistry } from '../src/core/spec/loader.js';
import { resolveSpec } from '../src/core/spec/resolver.js';
import { generateUnitTests } from '../src/core/spec/generators/unit.js';
import { generatePropertyTests } from '../src/core/spec/generators/property.js';
import { generateIntegrationTests } from '../src/core/spec/generators/integration.js';
import * as path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

// The 9 improvement spec IDs
const IMPROVEMENT_SPECS = [
  'spec.speccodex.placeholders.hasItem',
  'spec.speccodex.schema.outputs',
  'spec.speccodex.invariants.structured',
  'spec.speccodex.generate.naming',
  'spec.speccodex.validator.errors',
  'spec.speccodex.verify.schema',
  'spec.speccodex.generate.coverage',
  'spec.speccodex.schema.assertions',
  'spec.speccodex.placeholders.jsonpath',
];

interface GenerationSummary {
  specId: string;
  unit: { valid: boolean; testCount: number; errors: string[] };
  property: { valid: boolean; propertyCount: number; errors: string[] };
  integration: { valid: boolean; effectTests: number; errors: string[] };
}

async function main() {
  console.log('='.repeat(80));
  console.log('SpecCodex Test Generation - Improvements Specs');
  console.log('='.repeat(80));
  console.log('');

  // Load the spec registry
  console.log('Loading spec registry...');
  const registry = await loadSpecRegistry(PROJECT_ROOT);
  console.log(`  Found ${Object.keys(registry.nodes).length} specs`);
  console.log(`  Found ${Object.keys(registry.mixins).length} mixins`);
  console.log('');

  const summaries: GenerationSummary[] = [];

  for (const specId of IMPROVEMENT_SPECS) {
    console.log('-'.repeat(80));
    console.log(`\n📋 ${specId}\n`);

    // Check if spec exists
    if (!registry.nodes[specId]) {
      console.log(`  ❌ Spec not found in registry\n`);
      summaries.push({
        specId,
        unit: { valid: false, testCount: 0, errors: ['SPEC_NOT_FOUND'] },
        property: { valid: false, propertyCount: 0, errors: ['SPEC_NOT_FOUND'] },
        integration: { valid: false, effectTests: 0, errors: ['SPEC_NOT_FOUND'] },
      });
      continue;
    }

    // Resolve the spec
    const resolved = resolveSpec(registry, specId);
    if (!resolved.valid || !resolved.spec) {
      console.log(`  ❌ Failed to resolve spec: ${resolved.errors.map(e => e.message).join(', ')}\n`);
      summaries.push({
        specId,
        unit: { valid: false, testCount: 0, errors: resolved.errors.map(e => e.code) },
        property: { valid: false, propertyCount: 0, errors: resolved.errors.map(e => e.code) },
        integration: { valid: false, effectTests: 0, errors: resolved.errors.map(e => e.code) },
      });
      continue;
    }

    const summary: GenerationSummary = {
      specId,
      unit: { valid: false, testCount: 0, errors: [] },
      property: { valid: false, propertyCount: 0, errors: [] },
      integration: { valid: false, effectTests: 0, errors: [] },
    };

    // Generate unit tests
    console.log('  📝 Unit Tests:');
    const unitResult = generateUnitTests(resolved.spec, {
      framework: 'vitest',
      markers: true,
      coverage: 'full',
    });
    summary.unit = {
      valid: unitResult.valid,
      testCount: unitResult.testCount,
      errors: unitResult.errors.map(e => e.code),
    };

    if (unitResult.valid) {
      console.log(`     ✅ Generated ${unitResult.testCount} tests`);
      if (unitResult.coverageStats) {
        console.log(`        - From examples: ${unitResult.coverageStats.fromExamples}`);
        console.log(`        - Generated: ${unitResult.coverageStats.generated}`);
        console.log(`        - Enum coverage: ${unitResult.coverageStats.enumCoverage}`);
        console.log(`        - Boundary coverage: ${unitResult.coverageStats.boundaryCoverage}`);
      }
      if (unitResult.warnings.length > 0) {
        console.log(`     ⚠️  Warnings: ${unitResult.warnings.map(w => w.message).join(', ')}`);
      }
      console.log('');
      console.log('     --- Generated Unit Test Code ---');
      console.log(indent(unitResult.code, '     '));
      console.log('     --- End Unit Test Code ---');
    } else {
      console.log(`     ❌ Failed: ${unitResult.errors.map(e => e.message).join(', ')}`);
    }

    // Generate property tests
    console.log('');
    console.log('  🔬 Property Tests:');
    const propertyResult = generatePropertyTests(resolved.spec, {
      numRuns: 100,
      markers: true,
    });
    summary.property = {
      valid: propertyResult.valid,
      propertyCount: propertyResult.propertyCount,
      errors: propertyResult.errors.map(e => e.code),
    };

    if (propertyResult.valid) {
      console.log(`     ✅ Generated ${propertyResult.propertyCount} property tests`);
      console.log('');
      console.log('     --- Generated Property Test Code ---');
      console.log(indent(propertyResult.code, '     '));
      console.log('     --- End Property Test Code ---');
    } else {
      console.log(`     ⏭️  Skipped: ${propertyResult.errors.map(e => e.message).join(', ')}`);
    }

    // Generate integration tests
    console.log('');
    console.log('  🔗 Integration Tests:');
    const integrationResult = generateIntegrationTests(resolved.spec, {
      framework: 'vitest',
      markers: true,
    });
    summary.integration = {
      valid: integrationResult.valid,
      effectTests: integrationResult.effectTests,
      errors: integrationResult.errors.map(e => e.code),
    };

    if (integrationResult.valid) {
      console.log(`     ✅ Generated ${integrationResult.effectTests} effect tests`);
      console.log('');
      console.log('     --- Generated Integration Test Code ---');
      console.log(indent(integrationResult.code, '     '));
      console.log('     --- End Integration Test Code ---');
    } else {
      console.log(`     ⏭️  Skipped: ${integrationResult.errors.map(e => e.message).join(', ')}`);
    }

    summaries.push(summary);
    console.log('');
  }

  // Print summary
  console.log('='.repeat(80));
  console.log('\n📊 GENERATION SUMMARY\n');
  console.log('='.repeat(80));

  let totalUnit = 0;
  let totalProperty = 0;
  let totalIntegration = 0;

  console.log('');
  console.log('| Spec | Unit | Property | Integration |');
  console.log('|------|------|----------|-------------|');
  for (const s of summaries) {
    const shortId = s.specId.replace('spec.speccodex.', '');
    const unitStr = s.unit.valid ? `✅ ${s.unit.testCount}` : '❌';
    const propStr = s.property.valid ? `✅ ${s.property.propertyCount}` : '⏭️';
    const intStr = s.integration.valid ? `✅ ${s.integration.effectTests}` : '⏭️';
    console.log(`| ${shortId.padEnd(24)} | ${unitStr.padEnd(4)} | ${propStr.padEnd(8)} | ${intStr.padEnd(11)} |`);

    if (s.unit.valid) totalUnit += s.unit.testCount;
    if (s.property.valid) totalProperty += s.property.propertyCount;
    if (s.integration.valid) totalIntegration += s.integration.effectTests;
  }
  console.log('');
  console.log(`Total: ${totalUnit} unit tests, ${totalProperty} property tests, ${totalIntegration} integration tests`);
  console.log(`Grand total: ${totalUnit + totalProperty + totalIntegration} tests generated`);
  console.log('');
}

function indent(text: string, prefix: string): string {
  return text.split('\n').map(line => prefix + line).join('\n');
}

main().catch(console.error);
