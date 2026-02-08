/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateConcepts } from '../../../../src/core/discovery/concept-generator.js';
import type { Registry } from '../../../../src/core/registry/schema.js';
import type { ILLMProvider } from '../../../../src/llm/types.js';
import * as fs from '../../../../src/utils/file-system.js';

// Mock file-system module
vi.mock('../../../../src/utils/file-system.js', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockRejectedValue(new Error('Not found')),
  fileExists: vi.fn().mockResolvedValue(false),
}));

describe('concept-generator', () => {
  const mockRegistry: Registry = {
    nodes: {
      'domain.service': { description: 'Domain service' },
      'domain.entity': { description: 'Domain entity' },
      'app.controller': { description: 'HTTP controller' },
    },
    mixins: {},
  };

  const mockProvider: ILLMProvider = {
    name: 'openai',
    isAvailable: () => true,
    verify: vi.fn(),
    generateKeywords: vi.fn(),
    learn: vi.fn(),
    generate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should generate concepts from valid LLM response', async () => {
    const mockResponse = `Here are the concepts:
\`\`\`yaml
concepts:
  business_logic:
    description: "Business logic"
    aliases:
      - "service"
      - "domain"
    architectures:
      - domain.service
      - domain.entity
\`\`\``;

    vi.mocked(mockProvider.generate).mockResolvedValue(mockResponse);

    const result = await generateConcepts('/test', mockRegistry, mockProvider);

    expect(result.success).toBe(true);
    expect(result.conceptCount).toBe(1);
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it('should return error for invalid YAML response', async () => {
    vi.mocked(mockProvider.generate).mockResolvedValue('No yaml here');

    const result = await generateConcepts('/test', mockRegistry, mockProvider);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid YAML response');
  });

  it('should handle provider errors', async () => {
    vi.mocked(mockProvider.generate).mockRejectedValue(new Error('API error'));

    const result = await generateConcepts('/test', mockRegistry, mockProvider);

    expect(result.success).toBe(false);
    expect(result.error).toBe('API error');
  });

  it('should calculate coverage correctly', async () => {
    const mockResponse = `\`\`\`yaml
concepts:
  all_covered:
    description: "All architectures"
    aliases:
      - "all"
    architectures:
      - domain.service
      - domain.entity
      - app.controller
\`\`\``;

    vi.mocked(mockProvider.generate).mockResolvedValue(mockResponse);

    const result = await generateConcepts('/test', mockRegistry, mockProvider);

    expect(result.success).toBe(true);
    expect(result.coverage).toBe(100);
    expect(result.coveredArchs).toBe(3);
    expect(result.totalArchs).toBe(3);
  });
});
