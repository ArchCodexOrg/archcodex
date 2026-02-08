/**
 * @arch archcodex.core.domain
 * @intent:spec-infrastructure
 *
 * UI test generator for SpecCodex.
 * Generates interaction and accessibility tests from spec UI sections.
 *
 * Generates tests for:
 * - Triggers: Menu items, buttons, keyboard shortcuts
 * - Interactions: Multi-step flows, states, optimistic updates
 * - Accessibility: ARIA roles, labels, keyboard navigation
 * - Feedback: Success/error messages, loading states
 */
import type {
  ResolvedSpec,
  UITrigger,
  UIInteraction,
  UIAccessibility,
  UIFeedback,
} from '../schema.js';
import { escapeString } from './shared.js';

/**
 * Supported UI test frameworks.
 */
export type UITestFramework = 'playwright' | 'cypress' | 'testing-library';

/**
 * Options for UI test generation.
 */
export interface UIGeneratorOptions {
  /** Test framework to use */
  framework?: UITestFramework;
  /** Output file path */
  outputPath?: string;
  /** Add regeneration markers */
  markers?: boolean;
  /** Component/page name for the test */
  componentName?: string;
  /** Include accessibility tests using axe-core */
  accessibilityPlugin?: 'axe' | 'none';
  /** Base selector for the component under test */
  baseSelector?: string;
}

/**
 * Result of UI test generation.
 */
export interface UIGeneratorResult {
  valid: boolean;
  testCount: number;
  code: string;
  errors: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
  /** Categories of tests generated */
  categories: {
    trigger: number;
    interaction: number;
    accessibility: number;
    feedback: number;
  };
}

const MARKER_START = '// @speccodex:ui:start - DO NOT EDIT BETWEEN MARKERS';
const MARKER_END = '// @speccodex:ui:end';

/**
 * Generate UI tests from a resolved spec.
 */
export function generateUITests(
  spec: ResolvedSpec,
  options: UIGeneratorOptions = {}
): UIGeneratorResult {
  const {
    framework = 'playwright',
    markers = true,
    accessibilityPlugin = 'axe',
    baseSelector,
  } = options;

  const errors: Array<{ code: string; message: string }> = [];
  const warnings: Array<{ code: string; message: string }> = [];
  const lines: string[] = [];
  const categories = { trigger: 0, interaction: 0, accessibility: 0, feedback: 0 };

  // Check if spec has UI section
  const ui = spec.node.ui;
  if (!ui) {
    return {
      valid: false,
      testCount: 0,
      code: '',
      errors: [{ code: 'NO_UI_SECTION', message: 'Spec has no ui section to generate tests from' }],
      warnings: [],
      categories,
    };
  }

  // Validate spec has intent
  if (!spec.node.intent) {
    return {
      valid: false,
      testCount: 0,
      code: '',
      errors: [{ code: 'INVALID_SPEC', message: 'Spec is missing required field: intent' }],
      warnings: [],
      categories,
    };
  }

  // Derive component name from spec
  const componentName = options.componentName || spec.specId.replace('spec.', '').replace(/\./g, '-');

  // Determine the primary selector:
  // 1. Use explicit baseSelector from options if provided
  // 2. Fall back to trigger.element from the spec
  // 3. Default to [data-testid="target"]
  const triggerElement = ui.trigger?.element;
  const primarySelector = baseSelector || triggerElement || '[data-testid="target"]';

  // Generate imports
  lines.push(generateImports(framework, accessibilityPlugin));
  lines.push('');

  // Start markers
  if (markers) {
    lines.push(MARKER_START);
  }

  // Main describe block
  lines.push(`describe('${componentName} UI', () => {`);

  // Generate trigger tests
  if (ui.trigger) {
    const triggerTests = generateTriggerTests(ui.trigger, framework, primarySelector);
    if (triggerTests.code) {
      lines.push(triggerTests.code);
      categories.trigger = triggerTests.count;
    }
  }

  // Generate interaction tests
  if (ui.interaction) {
    const interactionTests = generateInteractionTests(ui.interaction, framework, primarySelector);
    if (interactionTests.code) {
      lines.push(interactionTests.code);
      categories.interaction = interactionTests.count;
    }
  }

  // Generate accessibility tests
  if (ui.accessibility) {
    const a11yTests = generateAccessibilityTests(ui.accessibility, framework, accessibilityPlugin, primarySelector);
    if (a11yTests.code) {
      lines.push(a11yTests.code);
      categories.accessibility = a11yTests.count;
    }
  }

  // Generate feedback tests
  if (ui.feedback) {
    const feedbackTests = generateFeedbackTests(ui.feedback, framework, primarySelector);
    if (feedbackTests.code) {
      lines.push(feedbackTests.code);
      categories.feedback = feedbackTests.count;
    }
  }

  lines.push('});');

  // End markers
  if (markers) {
    lines.push(MARKER_END);
  }

  const totalTests = categories.trigger + categories.interaction + categories.accessibility + categories.feedback;

  if (totalTests === 0) {
    warnings.push({
      code: 'NO_TESTS_GENERATED',
      message: 'UI section exists but no tests were generated - check section contents',
    });
  }

  return {
    valid: errors.length === 0,
    testCount: totalTests,
    code: lines.join('\n'),
    errors,
    warnings,
    categories,
  };
}

/**
 * Generate imports for the test file.
 */
function generateImports(framework: UITestFramework, accessibilityPlugin: 'axe' | 'none'): string {
  const lines: string[] = [];

  switch (framework) {
    case 'playwright':
      lines.push(`import { test, expect } from '@playwright/test';`);
      if (accessibilityPlugin === 'axe') {
        lines.push(`import AxeBuilder from '@axe-core/playwright';`);
      }
      break;

    case 'cypress':
      lines.push(`/// <reference types="cypress" />`);
      if (accessibilityPlugin === 'axe') {
        lines.push(`import 'cypress-axe';`);
      }
      break;

    case 'testing-library':
      lines.push(`import { render, screen, fireEvent, waitFor } from '@testing-library/react';`);
      lines.push(`import userEvent from '@testing-library/user-event';`);
      if (accessibilityPlugin === 'axe') {
        lines.push(`import { axe, toHaveNoViolations } from 'jest-axe';`);
        lines.push(`expect.extend(toHaveNoViolations);`);
      }
      break;
  }

  return lines.join('\n');
}

/**
 * Generate trigger tests (menu items, buttons, shortcuts).
 */
function generateTriggerTests(
  trigger: UITrigger,
  framework: UITestFramework,
  baseSelector?: string
): { code: string; count: number } {
  const lines: string[] = [];
  let count = 0;
  const indent = '  ';

  lines.push(`${indent}describe('trigger', () => {`);

  // Test trigger visibility
  if (trigger.location && trigger.label) {
    count++;
    const testFn = framework === 'playwright' ? 'test' : 'it';
    const asyncPrefix = framework === 'playwright' ? 'async ' : '';

    lines.push(`${indent}  ${testFn}('shows ${escapeString(trigger.label)} in ${escapeString(trigger.location)}', ${asyncPrefix}({ page }) => {`);

    if (framework === 'playwright') {
      if (trigger.location === 'context menu') {
        lines.push(`${indent}    // Open context menu`);
        lines.push(`${indent}    await page.locator('${baseSelector || '[data-testid="target"]'}').click({ button: 'right' });`);
        lines.push(`${indent}    `);
        lines.push(`${indent}    // Verify menu item exists`);
        lines.push(`${indent}    await expect(page.getByRole('menuitem', { name: '${escapeString(trigger.label)}' })).toBeVisible();`);
      } else {
        lines.push(`${indent}    await expect(page.getByRole('button', { name: '${escapeString(trigger.label)}' })).toBeVisible();`);
      }
    } else if (framework === 'cypress') {
      if (trigger.location === 'context menu') {
        lines.push(`${indent}    cy.get('${baseSelector || '[data-testid="target"]'}').rightclick();`);
        lines.push(`${indent}    cy.contains('${escapeString(trigger.label)}').should('be.visible');`);
      } else {
        lines.push(`${indent}    cy.contains('button', '${escapeString(trigger.label)}').should('be.visible');`);
      }
    } else {
      lines.push(`${indent}    expect(screen.getByRole('button', { name: '${escapeString(trigger.label)}' })).toBeInTheDocument();`);
    }

    lines.push(`${indent}  });`);
    lines.push('');
  }

  // Test keyboard shortcut
  if (trigger.shortcut) {
    count++;
    const testFn = framework === 'playwright' ? 'test' : 'it';
    const asyncPrefix = framework === 'playwright' ? 'async ' : '';

    lines.push(`${indent}  ${testFn}('${escapeString(trigger.shortcut)} triggers action', ${asyncPrefix}({ page }) => {`);

    const keys = parseShortcut(trigger.shortcut, framework);

    if (framework === 'playwright') {
      lines.push(`${indent}    // Focus target element`);
      lines.push(`${indent}    await page.locator('${baseSelector || '[data-testid="target"]'}').focus();`);
      lines.push(`${indent}    `);
      lines.push(`${indent}    // Press shortcut`);
      lines.push(`${indent}    await page.keyboard.press('${keys}');`);
      lines.push(`${indent}    `);
      lines.push(`${indent}    // Verify action occurred`);
      lines.push(`${indent}    // TODO: Add specific assertion for the action`);
    } else if (framework === 'cypress') {
      lines.push(`${indent}    cy.get('${baseSelector || '[data-testid="target"]'}').focus();`);
      lines.push(`${indent}    cy.get('body').type('${keys}');`);
    } else {
      lines.push(`${indent}    const user = userEvent.setup();`);
      lines.push(`${indent}    await user.keyboard('${keys}');`);
    }

    lines.push(`${indent}  });`);
    lines.push('');
  }

  lines.push(`${indent}});`);
  lines.push('');

  return { code: lines.join('\n'), count };
}

/**
 * Generate interaction tests (flows, states, optimistic updates).
 */
function generateInteractionTests(
  interaction: UIInteraction,
  framework: UITestFramework,
  baseSelector?: string
): { code: string; count: number } {
  const lines: string[] = [];
  let count = 0;
  const indent = '  ';

  lines.push(`${indent}describe('interaction', () => {`);

  // Test flow steps
  if (interaction.flow && interaction.flow.length > 0) {
    count++;
    const testFn = framework === 'playwright' ? 'test' : 'it';
    const asyncPrefix = framework === 'playwright' ? 'async ' : '';

    lines.push(`${indent}  ${testFn}('completes interaction flow', ${asyncPrefix}({ page }) => {`);
    lines.push(`${indent}    // Flow steps:`);

    for (const step of interaction.flow) {
      lines.push(`${indent}    // - ${escapeString(step)}`);
    }
    lines.push('');

    if (framework === 'playwright') {
      lines.push(`${indent}    // TODO: Implement flow test steps`);
      lines.push(`${indent}    await page.locator('${baseSelector || '[data-testid="target"]'}').click();`);
    } else if (framework === 'cypress') {
      lines.push(`${indent}    // TODO: Implement flow test steps`);
      lines.push(`${indent}    cy.get('${baseSelector || '[data-testid="target"]'}').click();`);
    } else {
      lines.push(`${indent}    // TODO: Implement flow test steps`);
      lines.push(`${indent}    const user = userEvent.setup();`);
    }

    lines.push(`${indent}  });`);
    lines.push('');
  }

  // Test optimistic updates
  if (interaction.optimistic === true) {
    count++;
    const testFn = framework === 'playwright' ? 'test' : 'it';
    const asyncPrefix = framework === 'playwright' ? 'async ' : '';

    lines.push(`${indent}  ${testFn}('shows optimistic update before network response', ${asyncPrefix}({ page }) => {`);

    if (framework === 'playwright') {
      lines.push(`${indent}    // Slow down network to observe optimistic update`);
      lines.push(`${indent}    await page.route('**/api/**', async route => {`);
      lines.push(`${indent}      await new Promise(r => setTimeout(r, 1000));`);
      lines.push(`${indent}      await route.continue();`);
      lines.push(`${indent}    });`);
      lines.push('');
      lines.push(`${indent}    // Trigger action`);
      lines.push(`${indent}    await page.locator('${baseSelector || '[data-testid="action"]'}').click();`);
      lines.push('');
      lines.push(`${indent}    // Verify optimistic update appears immediately`);
      lines.push(`${indent}    await expect(page.locator('[data-optimistic]')).toBeVisible();`);
    } else if (framework === 'cypress') {
      lines.push(`${indent}    cy.intercept('**/api/**', { delay: 1000 }).as('apiCall');`);
      lines.push(`${indent}    cy.get('${baseSelector || '[data-testid="action"]'}').click();`);
      lines.push(`${indent}    cy.get('[data-optimistic]').should('be.visible');`);
    } else {
      lines.push(`${indent}    // TODO: Mock API delay and verify optimistic state`);
    }

    lines.push(`${indent}  });`);
    lines.push('');
  }

  // Test loading state
  if (interaction.loading) {
    count++;
    const testFn = framework === 'playwright' ? 'test' : 'it';
    const asyncPrefix = framework === 'playwright' ? 'async ' : '';

    lines.push(`${indent}  ${testFn}('shows ${escapeString(interaction.loading)} during loading', ${asyncPrefix}({ page }) => {`);

    if (framework === 'playwright') {
      lines.push(`${indent}    await page.route('**/api/**', async route => {`);
      lines.push(`${indent}      await new Promise(r => setTimeout(r, 500));`);
      lines.push(`${indent}      await route.continue();`);
      lines.push(`${indent}    });`);
      lines.push('');
      lines.push(`${indent}    await page.locator('${baseSelector || '[data-testid="action"]'}').click();`);
      lines.push(`${indent}    await expect(page.locator('[data-loading]')).toBeVisible();`);
    } else if (framework === 'cypress') {
      lines.push(`${indent}    cy.intercept('**/api/**', { delay: 500 }).as('apiCall');`);
      lines.push(`${indent}    cy.get('${baseSelector || '[data-testid="action"]'}').click();`);
      lines.push(`${indent}    cy.get('[data-loading]').should('be.visible');`);
    } else {
      lines.push(`${indent}    // TODO: Test loading state`);
    }

    lines.push(`${indent}  });`);
    lines.push('');
  }

  // Test states
  if (interaction.states) {
    for (const [stateName, stateConfig] of Object.entries(interaction.states)) {
      count++;
      const testFn = framework === 'playwright' ? 'test' : 'it';
      const asyncPrefix = framework === 'playwright' ? 'async ' : '';

      lines.push(`${indent}  ${testFn}('handles ${escapeString(stateName)} state', ${asyncPrefix}({ page }) => {`);
      lines.push(`${indent}    // When: ${escapeString(stateConfig.when)}`);

      if (framework === 'playwright') {
        lines.push(`${indent}    // TODO: Set up ${stateName} state condition`);
        lines.push('');
        lines.push(`${indent}    // Then: verify state assertions`);
        for (const [key, value] of Object.entries(stateConfig.then)) {
          lines.push(`${indent}    // - ${key}: ${JSON.stringify(value)}`);
        }
      }

      lines.push(`${indent}  });`);
      lines.push('');
    }
  }

  // Test sequence
  if (interaction.sequence && interaction.sequence.length > 0) {
    count++;
    const testFn = framework === 'playwright' ? 'test' : 'it';
    const asyncPrefix = framework === 'playwright' ? 'async ' : '';

    lines.push(`${indent}  ${testFn}('follows interaction sequence', ${asyncPrefix}({ page }) => {`);

    for (let i = 0; i < interaction.sequence.length; i++) {
      const step = interaction.sequence[i];
      lines.push(`${indent}    // Step ${i + 1}`);

      if (step.trigger) {
        lines.push(`${indent}    // Trigger: ${JSON.stringify(step.trigger)}`);
      }
      if (step.wait) {
        lines.push(`${indent}    // Wait: ${step.wait}`);
        if (framework === 'playwright') {
          if (step.wait.endsWith('ms')) {
            lines.push(`${indent}    await page.waitForTimeout(${parseInt(step.wait)});`);
          } else {
            lines.push(`${indent}    // TODO: Wait for ${step.wait}`);
          }
        }
      }
      if (step.then) {
        lines.push(`${indent}    // Then: ${JSON.stringify(step.then)}`);
      }
      lines.push('');
    }

    lines.push(`${indent}  });`);
    lines.push('');
  }

  lines.push(`${indent}});`);
  lines.push('');

  return { code: lines.join('\n'), count };
}

/**
 * Generate accessibility tests.
 */
function generateAccessibilityTests(
  accessibility: UIAccessibility,
  framework: UITestFramework,
  accessibilityPlugin: 'axe' | 'none',
  baseSelector?: string
): { code: string; count: number } {
  const lines: string[] = [];
  let count = 0;
  const indent = '  ';

  lines.push(`${indent}describe('accessibility', () => {`);

  // Test ARIA role
  if (accessibility.role) {
    count++;
    const testFn = framework === 'playwright' ? 'test' : 'it';
    const asyncPrefix = framework === 'playwright' ? 'async ' : '';

    lines.push(`${indent}  ${testFn}('has correct ARIA role', ${asyncPrefix}({ page }) => {`);

    // Semantic roles that should be found by getByRole() for better reliability
    // These are common ARIA roles that have implicit or explicit semantic meaning
    const semanticRoles = [
      'button', 'link', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'textbox', 'combobox', // Interactive controls
      'dialog', 'alertdialog', 'alert', 'status', 'log', 'marquee', 'timer', // Live regions
      'menu', 'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio', // Menus
      'listbox', 'option', 'grid', 'gridcell', 'row', 'rowheader', 'columnheader', // Lists/grids
      'tree', 'treeitem', 'treegrid', // Trees
      'tablist', 'tab', 'tabpanel', // Tabs
      'toolbar', 'tooltip', 'progressbar', 'scrollbar', 'searchbox', // Other widgets
      'navigation', 'main', 'region', 'banner', 'contentinfo', 'complementary', 'form', 'search', // Landmarks
    ];
    const isSemanticRole = semanticRoles.includes(accessibility.role);

    if (framework === 'playwright') {
      if (isSemanticRole) {
        // Use getByRole for semantic roles - more robust than attribute checking
        lines.push(`${indent}    await expect(page.getByRole('${escapeString(accessibility.role)}')).toBeVisible();`);
      } else {
        // For custom roles or less common ones, check the attribute on the target element
        lines.push(`${indent}    const element = page.locator('${baseSelector || '[data-testid="target"]'}');`);
        lines.push(`${indent}    await expect(element).toHaveAttribute('role', '${escapeString(accessibility.role)}');`);
      }
    } else if (framework === 'cypress') {
      if (isSemanticRole) {
        lines.push(`${indent}    cy.get('[role="${escapeString(accessibility.role)}"]').should('be.visible');`);
      } else {
        lines.push(`${indent}    cy.get('${baseSelector || '[data-testid="target"]'}').should('have.attr', 'role', '${escapeString(accessibility.role)}');`);
      }
    } else {
      lines.push(`${indent}    expect(screen.getByRole('${escapeString(accessibility.role)}')).toBeInTheDocument();`);
    }

    lines.push(`${indent}  });`);
    lines.push('');
  }

  // Test ARIA label
  if (accessibility.label) {
    count++;
    const testFn = framework === 'playwright' ? 'test' : 'it';
    const asyncPrefix = framework === 'playwright' ? 'async ' : '';

    lines.push(`${indent}  ${testFn}('has accessible label', ${asyncPrefix}({ page }) => {`);

    if (framework === 'playwright') {
      lines.push(`${indent}    const element = page.locator('${baseSelector || '[data-testid="target"]'}');`);
      lines.push(`${indent}    await expect(element).toHaveAccessibleName('${escapeString(accessibility.label)}');`);
    } else if (framework === 'cypress') {
      lines.push(`${indent}    cy.get('${baseSelector || '[data-testid="target"]'}').should('have.attr', 'aria-label', '${escapeString(accessibility.label)}');`);
    } else {
      lines.push(`${indent}    expect(screen.getByLabelText('${escapeString(accessibility.label)}')).toBeInTheDocument();`);
    }

    lines.push(`${indent}  });`);
    lines.push('');
  }

  // Test keyboard navigation
  if (accessibility.keyboardNav && accessibility.keyboardNav.length > 0) {
    for (const nav of accessibility.keyboardNav) {
      count++;
      const testFn = framework === 'playwright' ? 'test' : 'it';
      const asyncPrefix = framework === 'playwright' ? 'async ' : '';

      lines.push(`${indent}  ${testFn}('${escapeString(nav.key)} key ${escapeString(nav.action)}', ${asyncPrefix}({ page }) => {`);

      if (framework === 'playwright') {
        lines.push(`${indent}    await page.locator('${baseSelector || '[data-testid="target"]'}').focus();`);
        lines.push(`${indent}    await page.keyboard.press('${escapeString(nav.key)}');`);
        lines.push(`${indent}    // TODO: Verify ${nav.action} action occurred`);
      } else if (framework === 'cypress') {
        lines.push(`${indent}    cy.get('${baseSelector || '[data-testid="target"]'}').focus().type('{${nav.key.toLowerCase()}}');`);
      } else {
        lines.push(`${indent}    const user = userEvent.setup();`);
        lines.push(`${indent}    await user.keyboard('{${nav.key}}');`);
      }

      lines.push(`${indent}  });`);
      lines.push('');
    }
  }

  // Test focus trap
  if (accessibility.focusTrap === true) {
    count++;
    const testFn = framework === 'playwright' ? 'test' : 'it';
    const asyncPrefix = framework === 'playwright' ? 'async ' : '';

    lines.push(`${indent}  ${testFn}('traps focus within component', ${asyncPrefix}({ page }) => {`);

    if (framework === 'playwright') {
      lines.push(`${indent}    // Tab through all focusable elements`);
      lines.push(`${indent}    const container = page.locator('${baseSelector || '[data-testid="target"]'}');`);
      lines.push(`${indent}    await container.locator(':focus').press('Tab');`);
      lines.push('');
      lines.push(`${indent}    // Verify focus stays within container`);
      lines.push(`${indent}    const focusedElement = page.locator(':focus');`);
      lines.push(`${indent}    await expect(container).toContainElement(focusedElement);`);
    }

    lines.push(`${indent}  });`);
    lines.push('');
  }

  // Test announcements
  if (accessibility.announcements && accessibility.announcements.length > 0) {
    for (const announcement of accessibility.announcements) {
      count++;
      const testFn = framework === 'playwright' ? 'test' : 'it';
      const asyncPrefix = framework === 'playwright' ? 'async ' : '';

      lines.push(`${indent}  ${testFn}('announces "${escapeString(announcement.message)}" when ${escapeString(announcement.when)}', ${asyncPrefix}({ page }) => {`);

      if (framework === 'playwright') {
        const ariaLive = announcement.priority || 'polite';
        lines.push(`${indent}    // TODO: Trigger condition: ${announcement.when}`);
        lines.push('');
        lines.push(`${indent}    // Verify live region announcement`);
        lines.push(`${indent}    await expect(page.locator('[aria-live="${ariaLive}"]')).toContainText('${escapeString(announcement.message)}');`);
      }

      lines.push(`${indent}  });`);
      lines.push('');
    }
  }

  // Automated accessibility scan with axe
  if (accessibilityPlugin === 'axe') {
    count++;
    const testFn = framework === 'playwright' ? 'test' : 'it';
    const asyncPrefix = framework === 'playwright' ? 'async ' : '';

    lines.push(`${indent}  ${testFn}('has no accessibility violations', ${asyncPrefix}({ page }) => {`);

    if (framework === 'playwright') {
      lines.push(`${indent}    const accessibilityScanResults = await new AxeBuilder({ page })`);
      lines.push(`${indent}      .include('${baseSelector || 'body'}')`);
      lines.push(`${indent}      .analyze();`);
      lines.push('');
      lines.push(`${indent}    expect(accessibilityScanResults.violations).toEqual([]);`);
    } else if (framework === 'cypress') {
      lines.push(`${indent}    cy.injectAxe();`);
      lines.push(`${indent}    cy.checkA11y('${baseSelector || 'body'}');`);
    } else {
      lines.push(`${indent}    const { container } = render(<Component />);`);
      lines.push(`${indent}    const results = await axe(container);`);
      lines.push(`${indent}    expect(results).toHaveNoViolations();`);
    }

    lines.push(`${indent}  });`);
    lines.push('');
  }

  lines.push(`${indent}});`);
  lines.push('');

  return { code: lines.join('\n'), count };
}

/**
 * Generate feedback tests (success, error, loading messages).
 */
function generateFeedbackTests(
  feedback: UIFeedback,
  framework: UITestFramework,
  baseSelector?: string
): { code: string; count: number } {
  const lines: string[] = [];
  let count = 0;
  const indent = '  ';

  lines.push(`${indent}describe('feedback', () => {`);

  // Test success feedback
  if (feedback.success) {
    count++;
    const testFn = framework === 'playwright' ? 'test' : 'it';
    const asyncPrefix = framework === 'playwright' ? 'async ' : '';

    lines.push(`${indent}  ${testFn}('shows success feedback', ${asyncPrefix}({ page }) => {`);

    if (framework === 'playwright') {
      lines.push(`${indent}    // Trigger successful action`);
      lines.push(`${indent}    await page.locator('${baseSelector || '[data-testid="action"]'}').click();`);
      lines.push('');
      lines.push(`${indent}    // Verify success message`);
      lines.push(`${indent}    await expect(page.getByText('${escapeString(feedback.success)}')).toBeVisible();`);
    } else if (framework === 'cypress') {
      lines.push(`${indent}    cy.get('${baseSelector || '[data-testid="action"]'}').click();`);
      lines.push(`${indent}    cy.contains('${escapeString(feedback.success)}').should('be.visible');`);
    } else {
      lines.push(`${indent}    expect(screen.getByText('${escapeString(feedback.success)}')).toBeInTheDocument();`);
    }

    lines.push(`${indent}  });`);
    lines.push('');
  }

  // Test error feedback
  if (feedback.error) {
    count++;
    const testFn = framework === 'playwright' ? 'test' : 'it';
    const asyncPrefix = framework === 'playwright' ? 'async ' : '';

    lines.push(`${indent}  ${testFn}('shows error feedback on failure', ${asyncPrefix}({ page }) => {`);

    if (framework === 'playwright') {
      lines.push(`${indent}    // Mock API to return error`);
      lines.push(`${indent}    await page.route('**/api/**', route => route.fulfill({`);
      lines.push(`${indent}      status: 500,`);
      lines.push(`${indent}      body: JSON.stringify({ error: 'Server error' }),`);
      lines.push(`${indent}    }));`);
      lines.push('');
      lines.push(`${indent}    await page.locator('${baseSelector || '[data-testid="action"]'}').click();`);
      lines.push('');
      lines.push(`${indent}    // Verify error message`);
      lines.push(`${indent}    await expect(page.getByText('${escapeString(feedback.error)}')).toBeVisible();`);
    } else if (framework === 'cypress') {
      lines.push(`${indent}    cy.intercept('**/api/**', { statusCode: 500 }).as('apiError');`);
      lines.push(`${indent}    cy.get('${baseSelector || '[data-testid="action"]'}').click();`);
      lines.push(`${indent}    cy.contains('${escapeString(feedback.error)}').should('be.visible');`);
    } else {
      lines.push(`${indent}    // TODO: Mock error state`);
      lines.push(`${indent}    expect(screen.getByText('${escapeString(feedback.error)}')).toBeInTheDocument();`);
    }

    lines.push(`${indent}  });`);
    lines.push('');
  }

  // Test loading feedback
  if (feedback.loading) {
    count++;
    const testFn = framework === 'playwright' ? 'test' : 'it';
    const asyncPrefix = framework === 'playwright' ? 'async ' : '';

    lines.push(`${indent}  ${testFn}('shows loading indicator', ${asyncPrefix}({ page }) => {`);

    if (framework === 'playwright') {
      lines.push(`${indent}    // Slow down network`);
      lines.push(`${indent}    await page.route('**/api/**', async route => {`);
      lines.push(`${indent}      await new Promise(r => setTimeout(r, 500));`);
      lines.push(`${indent}      await route.continue();`);
      lines.push(`${indent}    });`);
      lines.push('');
      lines.push(`${indent}    await page.locator('${baseSelector || '[data-testid="action"]'}').click();`);

      if (feedback.loading.indicator) {
        lines.push(`${indent}    await expect(page.locator('[data-loading="${feedback.loading.indicator}"]')).toBeVisible();`);
      } else {
        lines.push(`${indent}    await expect(page.locator('[data-loading]')).toBeVisible();`);
      }

      if (feedback.loading.ariaLive) {
        lines.push(`${indent}    await expect(page.locator('[aria-live="${feedback.loading.ariaLive}"]')).toBeVisible();`);
      }
    }

    lines.push(`${indent}  });`);
    lines.push('');
  }

  lines.push(`${indent}});`);
  lines.push('');

  return { code: lines.join('\n'), count };
}

/**
 * Parse keyboard shortcut into framework-specific format.
 */
function parseShortcut(shortcut: string, framework: UITestFramework): string {
  // Convert Cmd/Ctrl modifiers
  let keys = shortcut
    .replace(/Cmd\+/gi, framework === 'cypress' ? '{cmd}' : 'Meta+')
    .replace(/Ctrl\+/gi, framework === 'cypress' ? '{ctrl}' : 'Control+')
    .replace(/Alt\+/gi, framework === 'cypress' ? '{alt}' : 'Alt+')
    .replace(/Shift\+/gi, framework === 'cypress' ? '{shift}' : 'Shift+');

  // For testing-library, use different format
  if (framework === 'testing-library') {
    keys = shortcut
      .replace(/Cmd\+/gi, '{Meta>}')
      .replace(/Ctrl\+/gi, '{Control>}')
      .replace(/Alt\+/gi, '{Alt>}')
      .replace(/Shift\+/gi, '{Shift>}');
  }

  return keys;
}

/**
 * Check if a spec has UI tests worth generating.
 */
export function hasUISection(spec: ResolvedSpec): boolean {
  return !!spec.node.ui && (
    !!spec.node.ui.trigger ||
    !!spec.node.ui.interaction ||
    !!spec.node.ui.accessibility ||
    !!spec.node.ui.feedback ||
    !!spec.node.ui.touchpoints
  );
}

// === Touchpoint Test Generation ===
// @see spec.archcodex.uiTouchpoints.testGeneration in .arch/specs/archcodex/ui-touchpoints.spec.yaml

/**
 * Touchpoint input for test generation.
 */
export interface TouchpointInput {
  /** Component name or path */
  component: string;
  /** UI location (e.g., 'context menu', 'toolbar') */
  location?: string;
  /** Handler function name */
  handler?: string;
}

/**
 * Result of touchpoint test generation.
 */
export interface TouchpointTestResult {
  /** Generated test code */
  tests: string;
  /** Number of tests generated */
  testCount: number;
}

/**
 * Generate verification tests for UI touchpoints.
 * Creates tests that verify each touchpoint component is wired to its handler.
 *
 * @param touchpoints - Array of touchpoint definitions
 * @param options - Test generation options
 * @returns Generated test code and count
 *
 * @example
 * const result = generateTouchpointTests([
 *   { component: 'ProductCard', handler: 'handleDuplicate' },
 *   { component: 'ProductListItem', handler: 'handleDuplicate' },
 * ]);
 * // result.testCount === 2
 * // result.tests contains verification code
 */
export function generateTouchpointTests(
  touchpoints: TouchpointInput[],
  options: { framework?: UITestFramework; markers?: boolean } = {}
): TouchpointTestResult {
  const { framework = 'playwright', markers = true } = options;

  // Handle empty touchpoints per spec invariant
  if (!touchpoints || touchpoints.length === 0) {
    return { tests: '', testCount: 0 };
  }

  const lines: string[] = [];

  // Generate imports
  lines.push(generateImports(framework, 'none'));
  lines.push('');

  // Start markers
  if (markers) {
    lines.push('// @speccodex:touchpoints:start - DO NOT EDIT BETWEEN MARKERS');
  }

  // Main describe block
  lines.push(`describe('UI Touchpoints', () => {`);

  // Generate test for each touchpoint
  for (const touchpoint of touchpoints) {
    const testCode = generateSingleTouchpointTest(touchpoint, framework);
    lines.push(testCode);
  }

  lines.push('});');

  // End markers
  if (markers) {
    lines.push('// @speccodex:touchpoints:end');
  }

  return {
    tests: lines.join('\n'),
    testCount: touchpoints.length,
  };
}

/**
 * Generate a single touchpoint verification test.
 */
function generateSingleTouchpointTest(
  touchpoint: TouchpointInput,
  framework: UITestFramework
): string {
  const lines: string[] = [];
  const indent = '  ';
  const testFn = framework === 'playwright' ? 'test' : 'it';
  const asyncPrefix = framework === 'playwright' ? 'async ' : '';

  // Build test description
  const locationInfo = touchpoint.location ? ` in ${touchpoint.location}` : '';
  const handlerInfo = touchpoint.handler ? ` with ${touchpoint.handler}` : '';
  const testName = `${touchpoint.component}${locationInfo}${handlerInfo} is wired`;

  lines.push(`${indent}${testFn}('${escapeString(testName)}', ${asyncPrefix}({ page }) => {`);

  if (framework === 'playwright') {
    // Generate component-specific test based on location
    if (touchpoint.location === 'context menu') {
      lines.push(`${indent}  // Open context menu on ${touchpoint.component}`);
      lines.push(`${indent}  await page.locator('[data-testid="${touchpoint.component}"]').click({ button: 'right' });`);
      lines.push('');

      if (touchpoint.handler) {
        lines.push(`${indent}  // Verify handler is accessible`);
        lines.push(`${indent}  const menuItem = page.getByRole('menuitem').filter({ hasText: /${touchpoint.handler.replace('handle', '')}/i });`);
        lines.push(`${indent}  await expect(menuItem).toBeVisible();`);
      }
    } else if (touchpoint.location === 'bulk actions' || touchpoint.location === 'toolbar') {
      lines.push(`${indent}  // Verify toolbar/bulk action is available`);
      lines.push(`${indent}  await page.locator('[data-testid="${touchpoint.component}"]').waitFor();`);

      if (touchpoint.handler) {
        lines.push(`${indent}  const action = page.locator('[data-testid="${touchpoint.component}"] [data-action="${touchpoint.handler}"]');`);
        lines.push(`${indent}  await expect(action).toBeVisible();`);
      }
    } else {
      // Generic component wiring test
      lines.push(`${indent}  // Verify ${touchpoint.component} is rendered`);
      lines.push(`${indent}  await expect(page.locator('[data-testid="${touchpoint.component}"]')).toBeVisible();`);

      if (touchpoint.handler) {
        lines.push('');
        lines.push(`${indent}  // Verify handler is wired (component should respond to action)`);
        lines.push(`${indent}  // TODO: Add specific assertion for ${touchpoint.handler}`);
      }
    }
  } else if (framework === 'cypress') {
    lines.push(`${indent}  cy.get('[data-testid="${touchpoint.component}"]').should('exist');`);
    if (touchpoint.handler) {
      lines.push(`${indent}  // TODO: Verify ${touchpoint.handler} is wired`);
    }
  } else {
    // testing-library
    lines.push(`${indent}  expect(screen.getByTestId('${touchpoint.component}')).toBeInTheDocument();`);
    if (touchpoint.handler) {
      lines.push(`${indent}  // TODO: Verify ${touchpoint.handler} is wired`);
    }
  }

  lines.push(`${indent}});`);
  lines.push('');

  return lines.join('\n');
}
