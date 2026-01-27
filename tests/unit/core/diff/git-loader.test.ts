/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
/**
 * @arch archcodex.test
 *
 * Tests for git-loader utilities.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promisify } from 'util';

// Store mock behavior that can be changed per test
let mockExecBehavior: {
  error: Error | null | string;
  stdout: string;
  stderr: string;
} = { error: new Error('not mocked'), stdout: '', stderr: '' };

// Mock child_process.exec with proper promisify support
// The key is adding util.promisify.custom to make promisify(exec) return { stdout, stderr }
vi.mock('child_process', () => {
  const mockExec = vi.fn((cmd, opts, callback) => {
    if (typeof opts === 'function') {
      callback = opts;
    }
    if (callback) {
      process.nextTick(() => callback(mockExecBehavior.error, mockExecBehavior.stdout, mockExecBehavior.stderr));
    }
    return { pid: 12345 };
  });

  // Add custom promisify behavior that returns { stdout, stderr }
  (mockExec as any)[promisify.custom] = (cmd: string, opts?: any) => {
    return new Promise((resolve, reject) => {
      process.nextTick(() => {
        if (mockExecBehavior.error) {
          reject(mockExecBehavior.error);
        } else {
          resolve({ stdout: mockExecBehavior.stdout, stderr: mockExecBehavior.stderr });
        }
      });
    });
  };

  return {
    exec: mockExec,
  };
});

// Mock the registry schema to avoid complex validation
vi.mock('../../../../src/core/registry/schema.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../../src/core/registry/schema.js')>();
  return {
    ...original,
    RegistrySchema: {
      parse: vi.fn((data) => {
        // Simple validation - just return the data as-is
        return {
          architectures: data?.architectures || {},
          mixins: data?.mixins || {},
        };
      }),
    },
  };
});

// Mock yaml utility
vi.mock('../../../../src/utils/yaml.js', () => ({
  parseYaml: vi.fn((content: string) => {
    // Return whatever structure was "sent" via stdout
    return {
      architectures: {
        base: { description: 'Base architecture', rationale: 'Test rationale' },
      },
      mixins: {},
    };
  }),
}));

// Import after mock setup
import { parseGitRange, loadRegistryFromRef, gitRefExists, getShortHash } from '../../../../src/core/diff/git-loader.js';

// Helper to set mock behavior
function setExecSuccess(stdout: string) {
  mockExecBehavior = { error: null, stdout, stderr: '' };
}

function setExecError(error: Error | string) {
  mockExecBehavior = { error: typeof error === 'string' ? new Error(error) : error, stdout: '', stderr: '' };
}

describe('git-loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock behavior to error state
    mockExecBehavior = { error: new Error('not mocked'), stdout: '', stderr: '' };
  });

  describe('parseGitRange', () => {
    it('should parse double-dot notation', () => {
      const result = parseGitRange('main..feature');
      expect(result).toEqual({ from: 'main', to: 'feature' });
    });

    it('should parse double-dot with tags', () => {
      const result = parseGitRange('v1.0..v2.0');
      expect(result).toEqual({ from: 'v1.0', to: 'v2.0' });
    });

    it('should default to HEAD when to is missing', () => {
      const result = parseGitRange('main..');
      expect(result).toEqual({ from: 'main', to: 'HEAD' });
    });

    it('should default to HEAD when from is missing', () => {
      const result = parseGitRange('..feature');
      expect(result).toEqual({ from: 'HEAD', to: 'feature' });
    });

    it('should parse single ref as from with HEAD as to', () => {
      const result = parseGitRange('main');
      expect(result).toEqual({ from: 'main', to: 'HEAD' });
    });

    it('should handle HEAD~n notation', () => {
      const result = parseGitRange('HEAD~3');
      expect(result).toEqual({ from: 'HEAD~3', to: 'HEAD' });
    });

    it('should handle commit hashes', () => {
      const result = parseGitRange('abc123');
      expect(result).toEqual({ from: 'abc123', to: 'HEAD' });
    });

    it('should handle commit hash ranges', () => {
      const result = parseGitRange('abc123..def456');
      expect(result).toEqual({ from: 'abc123', to: 'def456' });
    });

    it('should handle branch names with slashes', () => {
      const result = parseGitRange('origin/main..feature/my-branch');
      expect(result).toEqual({ from: 'origin/main', to: 'feature/my-branch' });
    });

    it('should handle HEAD^n notation', () => {
      const result = parseGitRange('HEAD^2');
      expect(result).toEqual({ from: 'HEAD^2', to: 'HEAD' });
    });

    it('should handle both dots empty as HEAD to HEAD', () => {
      const result = parseGitRange('..');
      expect(result).toEqual({ from: 'HEAD', to: 'HEAD' });
    });
  });

  describe('loadRegistryFromRef', () => {
    it('should reject invalid git ref format', async () => {
      await expect(loadRegistryFromRef('/project', '$(evil)')).rejects.toThrow("Invalid git ref format: '$(evil)'");
    });

    it('should reject refs with backticks', async () => {
      await expect(loadRegistryFromRef('/project', '`whoami`')).rejects.toThrow("Invalid git ref format");
    });

    it('should reject refs with semicolons', async () => {
      await expect(loadRegistryFromRef('/project', 'main;rm -rf /')).rejects.toThrow("Invalid git ref format");
    });

    it('should reject invalid registry path format', async () => {
      await expect(loadRegistryFromRef('/project', 'main', '../../../etc/passwd')).rejects.toThrow('Invalid registry path format');
    });

    it('should reject absolute paths', async () => {
      await expect(loadRegistryFromRef('/project', 'main', '/etc/passwd')).rejects.toThrow('Invalid registry path format');
    });

    it('should reject paths with special characters', async () => {
      await expect(loadRegistryFromRef('/project', 'main', 'file;rm -rf /')).rejects.toThrow('Invalid registry path format');
    });

    it('should reject Windows absolute paths', async () => {
      await expect(loadRegistryFromRef('/project', 'main', 'C:\\Windows\\System32')).rejects.toThrow('Invalid registry path format');
    });

    it('should reject paths with embedded parent traversal', async () => {
      await expect(loadRegistryFromRef('/project', 'main', 'path/../../../etc/passwd')).rejects.toThrow('Invalid registry path format');
    });

    it('should load and parse registry from valid ref', async () => {
      setExecSuccess('architectures:\n  base:\n    description: "Base"\nmixins: {}');

      const result = await loadRegistryFromRef('/project', 'main');
      expect(result.architectures.base).toBeDefined();
    });

    it('should use custom registry path', async () => {
      setExecSuccess('architectures: {}\nmixins: {}');

      // Should not throw - if it loads successfully, the custom path was used
      const result = await loadRegistryFromRef('/project', 'main', '.arch/custom.yaml');
      expect(result).toBeDefined();
    });

    it('should handle file not found error', async () => {
      setExecError('path does not exist in main');

      await expect(loadRegistryFromRef('/project', 'main')).rejects.toThrow("does not exist at ref 'main'");
    });

    it('should handle file exists on disk error', async () => {
      setExecError('path exists on disk but not in ref');

      await expect(loadRegistryFromRef('/project', 'main')).rejects.toThrow("does not exist at ref 'main'");
    });

    it('should handle unknown revision error', async () => {
      setExecError('unknown revision');

      await expect(loadRegistryFromRef('/project', 'nonexistent')).rejects.toThrow("Unknown git ref: 'nonexistent'");
    });

    it('should handle bad revision error', async () => {
      setExecError('bad revision');

      await expect(loadRegistryFromRef('/project', 'bad')).rejects.toThrow("Unknown git ref: 'bad'");
    });

    it('should handle not a git repository error', async () => {
      setExecError('not a git repository');

      await expect(loadRegistryFromRef('/project', 'main')).rejects.toThrow('Not a git repository');
    });

    it('should handle generic git errors', async () => {
      setExecError('some other git error');

      await expect(loadRegistryFromRef('/project', 'main')).rejects.toThrow('Failed to load registry from main: some other git error');
    });

    it('should rethrow non-Error exceptions', async () => {
      // Set raw string error (not Error object)
      mockExecBehavior = { error: 'string error' as any, stdout: '', stderr: '' };

      await expect(loadRegistryFromRef('/project', 'main')).rejects.toBe('string error');
    });
  });

  describe('gitRefExists', () => {
    it('should return false for invalid ref format', async () => {
      const result = await gitRefExists('/project', '$(evil)');
      expect(result).toBe(false);
    });

    it('should return false for refs with pipes', async () => {
      const result = await gitRefExists('/project', 'main | cat /etc/passwd');
      expect(result).toBe(false);
    });

    it('should return true for existing ref', async () => {
      setExecSuccess('abc123def456');

      const result = await gitRefExists('/project', 'main');
      expect(result).toBe(true);
    });

    it('should return false for non-existing ref', async () => {
      setExecError('unknown revision');

      const result = await gitRefExists('/project', 'nonexistent');
      expect(result).toBe(false);
    });

    it('should return true for valid tag ref', async () => {
      setExecSuccess('abc123');

      const result = await gitRefExists('/project', 'v1.0.0');
      expect(result).toBe(true);
    });

    it('should return true for HEAD~n notation', async () => {
      setExecSuccess('abc123');

      const result = await gitRefExists('/project', 'HEAD~5');
      expect(result).toBe(true);
    });
  });

  describe('getShortHash', () => {
    it('should return original ref for invalid format', async () => {
      const result = await getShortHash('/project', '$(evil)');
      expect(result).toBe('$(evil)');
    });

    it('should return original ref for refs with newlines', async () => {
      const result = await getShortHash('/project', 'main\necho pwned');
      expect(result).toBe('main\necho pwned');
    });

    it('should return short hash for valid ref', async () => {
      setExecSuccess('abc1234\n');

      const result = await getShortHash('/project', 'main');
      expect(result).toBe('abc1234');
    });

    it('should return original ref on error', async () => {
      setExecError('error');

      const result = await getShortHash('/project', 'main');
      expect(result).toBe('main');
    });

    it('should trim whitespace from hash', async () => {
      setExecSuccess('  def5678  \n');

      const result = await getShortHash('/project', 'feature/branch');
      expect(result).toBe('def5678');
    });

    it('should handle HEAD ref', async () => {
      setExecSuccess('a1b2c3d\n');

      const result = await getShortHash('/project', 'HEAD');
      expect(result).toBe('a1b2c3d');
    });
  });

  describe('isValidGitRef (tested via public functions)', () => {
    it('should accept alphanumeric refs', async () => {
      setExecSuccess('hash');

      expect(await gitRefExists('/project', 'main')).toBe(true);
      expect(await gitRefExists('/project', 'feature123')).toBe(true);
    });

    it('should accept refs with dots', async () => {
      setExecSuccess('hash');

      expect(await gitRefExists('/project', 'v1.2.3')).toBe(true);
    });

    it('should accept refs with dashes', async () => {
      setExecSuccess('hash');

      expect(await gitRefExists('/project', 'feature-branch')).toBe(true);
    });

    it('should accept refs with underscores', async () => {
      setExecSuccess('hash');

      expect(await gitRefExists('/project', 'feature_branch')).toBe(true);
    });

    it('should accept refs with slashes', async () => {
      setExecSuccess('hash');

      expect(await gitRefExists('/project', 'origin/main')).toBe(true);
      expect(await gitRefExists('/project', 'feature/my-branch')).toBe(true);
    });

    it('should reject refs with spaces', async () => {
      expect(await gitRefExists('/project', 'branch name')).toBe(false);
    });

    it('should reject refs with dollar signs', async () => {
      expect(await gitRefExists('/project', '$HOME')).toBe(false);
    });

    it('should reject empty refs', async () => {
      expect(await gitRefExists('/project', '')).toBe(false);
    });
  });

  describe('isValidRegistryPath (tested via loadRegistryFromRef)', () => {
    it('should accept valid relative paths', async () => {
      setExecSuccess('content');

      // Should not throw for valid paths
      await loadRegistryFromRef('/project', 'main', '.arch/registry.yaml');
      await loadRegistryFromRef('/project', 'main', 'config/arch.yaml');
    });

    it('should reject paths starting with slash', async () => {
      await expect(loadRegistryFromRef('/project', 'main', '/absolute/path.yaml'))
        .rejects.toThrow('Invalid registry path format');
    });

    it('should reject parent directory traversal', async () => {
      await expect(loadRegistryFromRef('/project', 'main', '../outside.yaml'))
        .rejects.toThrow('Invalid registry path format');
    });

    it('should reject paths with backticks', async () => {
      await expect(loadRegistryFromRef('/project', 'main', 'file`whoami`.yaml'))
        .rejects.toThrow('Invalid registry path format');
    });

    it('should reject paths with dollar signs', async () => {
      await expect(loadRegistryFromRef('/project', 'main', 'file$HOME.yaml'))
        .rejects.toThrow('Invalid registry path format');
    });
  });
});
