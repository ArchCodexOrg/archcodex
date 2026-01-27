/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test.unit
 *
 * Tests for DuplicateDetector - finding duplicate types across a codebase.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DuplicateDetector } from '../../../../src/core/types/duplicate-detector.js';
import * as fileSystem from '../../../../src/utils/file-system.js';

// Mock file system
vi.mock('../../../../src/utils/file-system.js', () => ({
  readFile: vi.fn(),
}));

describe('DuplicateDetector', () => {
  let detector: DuplicateDetector;
  const mockReadFile = vi.mocked(fileSystem.readFile);

  beforeEach(() => {
    detector = new DuplicateDetector('/project');
    vi.clearAllMocks();
  });

  afterEach(() => {
    detector.dispose();
  });

  describe('scanFiles', () => {
    it('should detect exact duplicate types', async () => {
      const file1Content = `
export interface User {
  id: string;
  name: string;
}
      `;
      const file2Content = `
export interface User {
  id: string;
  name: string;
}
      `;

      mockReadFile.mockImplementation(async (path: string) => {
        if (path.includes('file1')) return file1Content;
        if (path.includes('file2')) return file2Content;
        throw new Error('File not found');
      });

      const report = await detector.scanFiles(['/project/file1.ts', '/project/file2.ts']);

      expect(report.totalTypes).toBe(2);
      expect(report.exactDuplicates).toBe(1);
      expect(report.groups.some(g => g.duplicates.some(d => d.matchType === 'exact'))).toBe(true);
    });

    it('should detect renamed duplicates (same structure, different name)', async () => {
      const file1Content = `
export interface User {
  id: string;
  name: string;
  email: string;
}
      `;
      const file2Content = `
export interface Person {
  id: string;
  name: string;
  email: string;
}
      `;

      mockReadFile.mockImplementation(async (path: string) => {
        if (path.includes('file1')) return file1Content;
        if (path.includes('file2')) return file2Content;
        throw new Error('File not found');
      });

      const report = await detector.scanFiles(['/project/file1.ts', '/project/file2.ts']);

      expect(report.totalTypes).toBe(2);
      expect(report.renamedDuplicates).toBeGreaterThan(0);

      const renamedGroup = report.groups.find(g =>
        g.duplicates.some(d => d.matchType === 'renamed')
      );
      expect(renamedGroup).toBeDefined();
    });

    it('should detect similar types above threshold', async () => {
      const file1Content = `
export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
}
      `;
      const file2Content = `
export interface Contact {
  id: string;
  name: string;
  email: string;
  address: string;
}
      `;

      mockReadFile.mockImplementation(async (path: string) => {
        if (path.includes('file1')) return file1Content;
        if (path.includes('file2')) return file2Content;
        throw new Error('File not found');
      });

      // Lower threshold to catch this case
      const lowThresholdDetector = new DuplicateDetector('/project', {
        similarityThreshold: 0.6,
      });

      try {
        const report = await lowThresholdDetector.scanFiles(['/project/file1.ts', '/project/file2.ts']);

        expect(report.totalTypes).toBe(2);
        expect(report.similarTypes).toBeGreaterThan(0);
      } finally {
        lowThresholdDetector.dispose();
      }
    });

    it('should filter by minimum properties', async () => {
      const content = `
export interface TooSmall {
  id: string;
}

export interface BigEnough {
  id: string;
  name: string;
  email: string;
}
      `;

      mockReadFile.mockResolvedValue(content);

      const report = await detector.scanFiles(['/project/file.ts']);

      // TooSmall should be filtered out (only 1 property)
      expect(report.totalTypes).toBe(1);
    });

    it('should filter non-exported types when exportedOnly is true', async () => {
      const content = `
interface InternalType {
  secret: string;
  key: string;
}

export interface PublicType {
  value: string;
  data: string;
}
      `;

      mockReadFile.mockResolvedValue(content);

      const report = await detector.scanFiles(['/project/file.ts']);

      // Only PublicType should be included
      expect(report.totalTypes).toBe(1);
    });

    it('should include non-exported types when exportedOnly is false', async () => {
      const content = `
interface InternalType {
  secret: string;
  key: string;
}

export interface PublicType {
  value: string;
  data: string;
}
      `;

      mockReadFile.mockResolvedValue(content);

      const privateDetector = new DuplicateDetector('/project', {
        exportedOnly: false,
      });

      try {
        const report = await privateDetector.scanFiles(['/project/file.ts']);
        expect(report.totalTypes).toBe(2);
      } finally {
        privateDetector.dispose();
      }
    });

    it('should skip files that cannot be read', async () => {
      const validContent = `
export interface ValidType {
  id: string;
  name: string;
}
      `;

      mockReadFile.mockImplementation(async (path: string) => {
        if (path.includes('valid')) return validContent;
        throw new Error('File not found');
      });

      const report = await detector.scanFiles([
        '/project/valid.ts',
        '/project/missing.ts',
      ]);

      // Should still process valid file
      expect(report.totalTypes).toBe(1);
    });

    it('should provide suggestions for duplicates', async () => {
      const file1Content = `
export interface Config {
  host: string;
  port: number;
}
      `;
      const file2Content = `
export interface Config {
  host: string;
  port: number;
}
      `;

      mockReadFile.mockImplementation(async (path: string) => {
        if (path.includes('file1')) return file1Content;
        if (path.includes('file2')) return file2Content;
        throw new Error('File not found');
      });

      const report = await detector.scanFiles(['/project/file1.ts', '/project/file2.ts']);

      const duplicateGroup = report.groups.find(g =>
        g.duplicates.some(d => d.matchType === 'exact')
      );

      expect(duplicateGroup?.suggestion).toBeDefined();
      expect(duplicateGroup?.suggestion).toContain('Consolidate');
    });
  });

  describe('scanFile', () => {
    it('should find duplicates of types in target file', async () => {
      const targetContent = `
export interface User {
  id: string;
  name: string;
}
      `;
      const otherContent = `
export interface User {
  id: string;
  name: string;
}
      `;

      mockReadFile.mockImplementation(async (path: string) => {
        if (path.includes('target')) return targetContent;
        if (path.includes('other')) return otherContent;
        throw new Error('File not found');
      });

      const matches = await detector.scanFile(
        '/project/target.ts',
        ['/project/target.ts', '/project/other.ts']
      );

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].similarity).toBe(1.0);
    });

    it('should not compare target file with itself', async () => {
      const content = `
export interface UniqueType {
  id: string;
  name: string;
}
      `;

      mockReadFile.mockResolvedValue(content);

      const matches = await detector.scanFile(
        '/project/file.ts',
        ['/project/file.ts']
      );

      expect(matches).toHaveLength(0);
    });

    it('should report missing and extra properties for similar types', async () => {
      const targetContent = `
export interface User {
  id: string;
  name: string;
  email: string;
}
      `;
      const otherContent = `
export interface User {
  id: string;
  name: string;
  phone: string;
}
      `;

      mockReadFile.mockImplementation(async (path: string) => {
        if (path.includes('target')) return targetContent;
        if (path.includes('other')) return otherContent;
        throw new Error('File not found');
      });

      const lowThresholdDetector = new DuplicateDetector('/project', {
        similarityThreshold: 0.6,
      });

      try {
        const matches = await lowThresholdDetector.scanFile(
          '/project/target.ts',
          ['/project/target.ts', '/project/other.ts']
        );

        expect(matches.length).toBeGreaterThan(0);
        // email is in target but not in other = extra
        // phone is in other but not in target = missing
        const match = matches[0];
        expect(match.extraProperties).toContain('email');
        expect(match.missingProperties).toContain('phone');
      } finally {
        lowThresholdDetector.dispose();
      }
    });

    it('should report type differences for properties with same name but different types', async () => {
      const targetContent = `
export interface Config {
  port: number;
  debug: boolean;
}
      `;
      const otherContent = `
export interface Config {
  port: string;
  debug: boolean;
}
      `;

      mockReadFile.mockImplementation(async (path: string) => {
        if (path.includes('target')) return targetContent;
        if (path.includes('other')) return otherContent;
        throw new Error('File not found');
      });

      const matches = await detector.scanFile(
        '/project/target.ts',
        ['/project/target.ts', '/project/other.ts']
      );

      expect(matches.length).toBeGreaterThan(0);
      const typeDiff = matches[0].typeDifferences.find(d => d.name === 'port');
      expect(typeDiff).toBeDefined();
      expect(typeDiff?.expected).toBe('string');
      expect(typeDiff?.actual).toBe('number');
    });
  });

  describe('options', () => {
    it('should use default options when not provided', () => {
      const defaultDetector = new DuplicateDetector('/project');
      // Just verify it doesn't throw
      expect(defaultDetector).toBeDefined();
      defaultDetector.dispose();
    });

    it('should respect custom similarity threshold', async () => {
      const file1Content = `
export interface TypeA {
  a: string;
  b: string;
  c: string;
  d: string;
}
      `;
      const file2Content = `
export interface TypeB {
  a: string;
  b: string;
  e: string;
  f: string;
}
      `;

      mockReadFile.mockImplementation(async (path: string) => {
        if (path.includes('file1')) return file1Content;
        if (path.includes('file2')) return file2Content;
        throw new Error('File not found');
      });

      // With high threshold (0.8), these should not match
      const highThreshold = new DuplicateDetector('/project', { similarityThreshold: 0.8 });
      const highReport = await highThreshold.scanFiles(['/project/file1.ts', '/project/file2.ts']);
      highThreshold.dispose();

      // With low threshold (0.4), these should match
      const lowThreshold = new DuplicateDetector('/project', { similarityThreshold: 0.4 });
      const lowReport = await lowThreshold.scanFiles(['/project/file1.ts', '/project/file2.ts']);
      lowThreshold.dispose();

      expect(lowReport.similarTypes).toBeGreaterThanOrEqual(highReport.similarTypes);
    });

    it('should respect custom minProperties', async () => {
      const content = `
export interface Small {
  id: string;
  name: string;
}

export interface Large {
  id: string;
  name: string;
  email: string;
  phone: string;
}
      `;

      mockReadFile.mockResolvedValue(content);

      // With minProperties=3, Small should be filtered
      const strictDetector = new DuplicateDetector('/project', { minProperties: 3 });
      const report = await strictDetector.scanFiles(['/project/file.ts']);
      strictDetector.dispose();

      expect(report.totalTypes).toBe(1);
    });
  });
});
