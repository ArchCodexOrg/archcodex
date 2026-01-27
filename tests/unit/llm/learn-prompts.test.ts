/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import {
  buildLearnPrompt,
  parseLearnResponse,
  buildLearnInstructions,
  formatLearnPromptForDisplay,
} from '../../../src/llm/learn-prompts.js';

describe('learn-prompts', () => {
  describe('buildLearnPrompt', () => {
    it('should build a prompt from skeleton YAML', () => {
      const request = {
        skeletonYaml: 'files: 10\ndirectories:\n  - src/',
      };

      const prompt = buildLearnPrompt(request);

      expect(prompt).toContain('PROJECT SKELETON:');
      expect(prompt).toContain('files: 10');
      expect(prompt).toContain('INSTRUCTIONS:');
    });

    it('should include user hints if provided', () => {
      const request = {
        skeletonYaml: 'files: 10',
        userHints: 'This is a CLI tool',
      };

      const prompt = buildLearnPrompt(request);

      expect(prompt).toContain('USER REQUIREMENTS: This is a CLI tool');
    });

    it('should include existing registry if provided', () => {
      const request = {
        skeletonYaml: 'files: 10',
        existingRegistry: 'base:\n  description: Base rules',
      };

      const prompt = buildLearnPrompt(request);

      expect(prompt).toContain('EXISTING REGISTRY');
      expect(prompt).toContain('base:');
    });
  });

  describe('parseLearnResponse', () => {
    it('should extract YAML from code block', () => {
      const content = '```yaml\nbase:\n  description: Test\n```';

      const result = parseLearnResponse(content, 'TestProvider');

      expect(result.registryYaml).toContain('base:');
      expect(result.explanation).toContain('TestProvider');
    });

    it('should handle plain YAML response', () => {
      const content = 'base:\n  description: Test';

      const result = parseLearnResponse(content, 'TestProvider');

      expect(result.registryYaml).toBe('base:\n  description: Test');
    });

    it('should strip preamble before YAML', () => {
      const content = 'Here is the registry:\n\nbase:\n  description: Test';

      const result = parseLearnResponse(content, 'TestProvider');

      expect(result.registryYaml).toBe('base:\n  description: Test');
    });

    it('should include migrate-registry in suggestions', () => {
      const content = 'base:\n  description: Test';

      const result = parseLearnResponse(content, 'TestProvider');

      expect(result.suggestions.some((s) => s.includes('migrate-registry'))).toBe(true);
    });

    it('should return confidence of 0.7', () => {
      const content = 'base:\n  description: Test';

      const result = parseLearnResponse(content, 'TestProvider');

      expect(result.confidence).toBe(0.7);
    });
  });

  describe('buildLearnInstructions', () => {
    it('should return instructions for learn request', () => {
      const request = {
        skeletonYaml: 'files: 10',
      };

      const instructions = buildLearnInstructions(request);

      expect(instructions).toContain('registry.yaml');
      expect(instructions).toContain('base architecture');
    });

    it('should include user hints if provided', () => {
      const request = {
        skeletonYaml: 'files: 10',
        userHints: 'Focus on CLI layer',
      };

      const instructions = buildLearnInstructions(request);

      expect(instructions).toContain('Focus on CLI layer');
    });
  });

  describe('formatLearnPromptForDisplay', () => {
    it('should format prompt with headers', () => {
      const request = {
        skeletonYaml: 'files: 10',
      };

      const formatted = formatLearnPromptForDisplay(request);

      expect(formatted).toContain('ARCHCODEX LEARN REQUEST');
      expect(formatted).toContain('PROJECT SKELETON');
      expect(formatted).toContain('INSTRUCTIONS');
    });
  });
});
