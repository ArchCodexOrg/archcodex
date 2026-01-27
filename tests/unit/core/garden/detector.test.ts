/**
 * @arch archcodex.test.unit
 * @intent:cli-output
 */
import { describe, it, expect } from 'vitest';
import { PatternDetector } from '../../../../src/core/garden/detector.js';

describe('PatternDetector', () => {
  const projectRoot = '/project';

  describe('detectPatterns', () => {
    it('should detect files with common suffixes', () => {
      const detector = new PatternDetector(projectRoot, []);
      const files = [
        { path: '/project/src/components/UserCard.tsx', archId: 'ui.component' },
        { path: '/project/src/components/ProductCard.tsx', archId: 'ui.component' },
        { path: '/project/src/components/OrderCard.tsx', archId: 'ui.component' },
      ];

      const report = detector.analyze(files, { detectPatterns: true, checkConsistency: false, suggestKeywords: false, fix: false, minClusterSize: 2 });

      expect(report.patterns.length).toBeGreaterThan(0);
      // Pattern now includes extension for semantic accuracy
      const cardPattern = report.patterns.find(p => p.pattern === '*Card.tsx');
      expect(cardPattern).toBeDefined();
      expect(cardPattern?.files.length).toBe(3);
      expect(cardPattern?.archId).toBe('ui.component');
    });

    it('should not report patterns with fewer files than minClusterSize', () => {
      const detector = new PatternDetector(projectRoot, []);
      const files = [
        { path: '/project/src/UserCard.tsx', archId: 'ui.component' },
      ];

      const report = detector.analyze(files, { detectPatterns: true, checkConsistency: false, suggestKeywords: false, fix: false, minClusterSize: 2 });

      expect(report.patterns.length).toBe(0);
    });

    it('should suggest keywords based on file names', () => {
      const detector = new PatternDetector(projectRoot, []);
      const files = [
        { path: '/project/src/UserCard.tsx', archId: 'ui.component' },
        { path: '/project/src/ProductCard.tsx', archId: 'ui.component' },
      ];

      const report = detector.analyze(files, { detectPatterns: true, checkConsistency: false, suggestKeywords: false, fix: false, minClusterSize: 2 });

      // Pattern now includes extension for semantic accuracy
      const cardPattern = report.patterns.find(p => p.pattern === '*Card.tsx');
      expect(cardPattern?.suggestedKeywords).toContain('card');
      expect(cardPattern?.suggestedKeywords).toContain('user');
      expect(cardPattern?.suggestedKeywords).toContain('product');
    });
  });

  describe('findInconsistencies', () => {
    it('should detect files with same naming pattern but different @arch tags', () => {
      const detector = new PatternDetector(projectRoot, []);
      const files = [
        { path: '/project/src/services/UserService.ts', archId: 'core.service' },
        { path: '/project/src/services/PaymentService.ts', archId: 'core.service' },
        { path: '/project/src/adapters/NotificationService.ts', archId: 'infra.adapter' },
      ];

      const report = detector.analyze(files, { detectPatterns: false, checkConsistency: true, suggestKeywords: false, fix: false, minClusterSize: 2 });

      expect(report.inconsistencies.length).toBeGreaterThan(0);
      // Pattern now includes extension
      const serviceInconsistency = report.inconsistencies.find(i => i.location.includes('*Service.ts'));
      expect(serviceInconsistency).toBeDefined();
      expect(serviceInconsistency?.dominantArch).toBe('core.service');
      expect(serviceInconsistency?.outliers).toContain('src/adapters/NotificationService.ts');
    });

    it('should not report when all files with same pattern use same @arch', () => {
      const detector = new PatternDetector(projectRoot, []);
      const files = [
        { path: '/project/src/services/UserService.ts', archId: 'core.service' },
        { path: '/project/src/services/PaymentService.ts', archId: 'core.service' },
        { path: '/project/src/services/OrderService.ts', archId: 'core.service' },
      ];

      const report = detector.analyze(files, { detectPatterns: false, checkConsistency: true, suggestKeywords: false, fix: false, minClusterSize: 2 });

      expect(report.inconsistencies.length).toBe(0);
    });

    it('should not flag files in same directory with different architectures (intentional design)', () => {
      const detector = new PatternDetector(projectRoot, []);
      // Different file types in same directory - this is intentional, not an inconsistency
      const files = [
        { path: '/project/src/core/registry/loader.ts', archId: 'core.domain' },
        { path: '/project/src/core/registry/schema.ts', archId: 'core.domain.schema' },
        { path: '/project/src/core/registry/resolver.ts', archId: 'core.domain.resolver' },
      ];

      const report = detector.analyze(files, { detectPatterns: false, checkConsistency: true, suggestKeywords: false, fix: false, minClusterSize: 2 });

      // No inconsistencies - different architectures in same directory is intentional
      expect(report.inconsistencies.length).toBe(0);
    });
  });

  describe('suggestKeywords', () => {
    it('should suggest keywords not already in index', () => {
      const detector = new PatternDetector(projectRoot, [
        { arch_id: 'ui.component', keywords: ['component', 'ui'] },
      ]);
      const files = [
        { path: '/project/src/UserCard.tsx', archId: 'ui.component' },
        { path: '/project/src/ProductCard.tsx', archId: 'ui.component' },
        { path: '/project/src/Avatar.tsx', archId: 'ui.component' },
      ];

      const report = detector.analyze(files, { detectPatterns: false, checkConsistency: false, suggestKeywords: true, fix: false, minClusterSize: 2 });

      expect(report.keywordSuggestions.length).toBeGreaterThan(0);
      const componentSuggestion = report.keywordSuggestions.find(s => s.archId === 'ui.component');
      expect(componentSuggestion).toBeDefined();
      expect(componentSuggestion?.suggestedKeywords).toContain('card');
      expect(componentSuggestion?.suggestedKeywords).not.toContain('component'); // Already in index
    });

    it('should not suggest keywords when index already has them', () => {
      const detector = new PatternDetector(projectRoot, [
        // Include 'react' since semantic detection adds it for .tsx files
        { arch_id: 'ui.component', keywords: ['component', 'ui', 'card', 'user', 'product', 'avatar', 'react'] },
      ]);
      const files = [
        { path: '/project/src/UserCard.tsx', archId: 'ui.component' },
        { path: '/project/src/ProductCard.tsx', archId: 'ui.component' },
      ];

      const report = detector.analyze(files, { detectPatterns: false, checkConsistency: false, suggestKeywords: true, fix: false, minClusterSize: 2 });

      const componentSuggestion = report.keywordSuggestions.find(s => s.archId === 'ui.component');
      expect(componentSuggestion).toBeUndefined();
    });
  });

  describe('semantic categories', () => {
    it('should detect hooks by use* prefix', () => {
      const detector = new PatternDetector(projectRoot, []);
      const files = [
        { path: '/project/src/hooks/useAuth.ts', archId: 'frontend.hook' },
        { path: '/project/src/hooks/useUser.ts', archId: 'frontend.hook' },
      ];

      const report = detector.analyze(files, { detectPatterns: true, checkConsistency: true, suggestKeywords: false, fix: false, minClusterSize: 2 });

      // Should detect use*.ts pattern
      const hookPattern = report.patterns.find(p => p.pattern === 'use*.ts');
      expect(hookPattern).toBeDefined();
      expect(hookPattern?.files.length).toBe(2);
    });

    it('should not flag .tsx and .ts files with same suffix as inconsistent', () => {
      const detector = new PatternDetector(projectRoot, []);
      // EmptyState.tsx is a component, searchState.ts is a utility - different purposes
      const files = [
        { path: '/project/src/EmptyState.tsx', archId: 'frontend.component' },
        { path: '/project/src/searchState.ts', archId: 'frontend.utility' },
      ];

      const report = detector.analyze(files, { detectPatterns: false, checkConsistency: true, suggestKeywords: false, fix: false, minClusterSize: 2 });

      // Should NOT report as inconsistent because they have different extensions
      expect(report.inconsistencies.length).toBe(0);
    });

    it('should infer semantic categories correctly', () => {
      const detector = new PatternDetector(projectRoot, []);

      // New semantic category names (more specific)
      expect(detector.inferSemanticCategory('useAuth.ts')).toBe('react-hook');
      expect(detector.inferSemanticCategory('UserCard.tsx')).toBe('react-component');
      expect(detector.inferSemanticCategory('apiClient.ts')).toBe('utility');
      expect(detector.inferSemanticCategory('searchState.ts')).toBe('utility');
      expect(detector.inferSemanticCategory('random.ts')).toBe('unknown');

      // Additional semantic categories
      expect(detector.inferSemanticCategory('UserService.ts')).toBe('service');
      expect(detector.inferSemanticCategory('UserRepository.ts')).toBe('repository');
      expect(detector.inferSemanticCategory('UserValidator.ts')).toBe('validator');
      expect(detector.inferSemanticCategory('AppConfig.ts')).toBe('config');
      expect(detector.inferSemanticCategory('user.types.ts')).toBe('types');
      expect(detector.inferSemanticCategory('auth.test.ts')).toBe('test');
    });
  });

  describe('summary', () => {
    it('should provide accurate summary statistics', () => {
      const detector = new PatternDetector(projectRoot, []);
      const files = [
        { path: '/project/src/UserCard.tsx', archId: 'ui.component' },
        { path: '/project/src/ProductCard.tsx', archId: 'ui.component' },
        { path: '/project/src/OrderCard.tsx', archId: 'ui.widget' },
      ];

      const report = detector.analyze(files);

      expect(report.summary.filesScanned).toBe(3);
      expect(report.summary.patternsDetected).toBeGreaterThanOrEqual(1);
      expect(report.summary.hasIssues).toBe(true);
    });
  });
});
