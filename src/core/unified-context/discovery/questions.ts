/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Clarifying question generator for query refinement.
 * Generates targeted questions based on detected keywords and ambiguity.
 */

import type { ClarifyingQuestion, RankedModule } from './types.js';

/**
 * Layer-based question templates.
 */
const LAYER_QUESTIONS: Record<string, ClarifyingQuestion> = {
  fullStack: {
    id: 'layer',
    question: 'What layer is this feature in?',
    category: 'layer',
    options: [
      {
        id: 'frontend',
        label: 'Frontend (UI/Components)',
        boostKeywords: ['component', 'ui', 'page', 'view', 'form'],
        boostPaths: ['src/app', 'src/components', 'components', 'pages', 'app'],
      },
      {
        id: 'backend',
        label: 'Backend (API/Database)',
        boostKeywords: ['api', 'mutation', 'query', 'action', 'handler', 'service'],
        boostPaths: ['convex', 'api', 'server', 'lib', 'services'],
      },
      {
        id: 'both',
        label: 'Both (Full-stack)',
        boostKeywords: [],
        boostPaths: [],
      },
    ],
  },
};

/**
 * Resource type detection patterns.
 */
const RESOURCE_PATTERNS: Record<string, { singular: string; plural: string; keywords: string[] }> = {
  project: { singular: 'Project', plural: 'Projects', keywords: ['project', 'projects', 'workspace'] },
  article: { singular: 'Article', plural: 'Articles', keywords: ['article', 'articles', 'post', 'posts'] },
  document: { singular: 'Document', plural: 'Documents', keywords: ['document', 'documents', 'doc', 'docs', 'page', 'pages'] },
  file: { singular: 'File', plural: 'Files', keywords: ['file', 'files', 'upload', 'attachment'] },
  collection: { singular: 'Collection', plural: 'Collections', keywords: ['collection', 'collections', 'folder', 'group'] },
  order: { singular: 'Order', plural: 'Orders', keywords: ['order', 'orders', 'invoice', 'purchase', 'checkout'] },
  user: { singular: 'User', plural: 'Users', keywords: ['user', 'users', 'member', 'account', 'profile'] },
  tag: { singular: 'Tag', plural: 'Tags', keywords: ['tag', 'tags', 'label', 'category'] },
};

/**
 * Action type question templates.
 */
const ACTION_QUESTIONS: Record<string, ClarifyingQuestion> = {
  scope: {
    id: 'scope',
    question: 'What\'s the scope of this change?',
    category: 'scope',
    options: [
      {
        id: 'ui-only',
        label: 'UI only (component/styling)',
        boostKeywords: ['component', 'style', 'css', 'tailwind', 'ui'],
        boostPaths: ['components', 'ui', 'styles'],
      },
      {
        id: 'logic-only',
        label: 'Logic only (no UI changes)',
        boostKeywords: ['hook', 'util', 'helper', 'service', 'lib'],
        boostPaths: ['hooks', 'utils', 'lib', 'helpers'],
      },
      {
        id: 'data-only',
        label: 'Data/Schema only',
        boostKeywords: ['schema', 'type', 'interface', 'model', 'mutation', 'query'],
        boostPaths: ['convex', 'types', 'schema', 'models'],
      },
      {
        id: 'full',
        label: 'Full feature (UI + Logic + Data)',
        boostKeywords: [],
        boostPaths: [],
      },
    ],
  },
};

/**
 * Model targeting question.
 */
export const MODEL_QUESTION: ClarifyingQuestion = {
  id: 'model',
  question: 'Which LLM will run this task?',
  category: 'scope',
  options: [
    {
      id: 'haiku',
      label: 'Haiku (fast, needs explicit instructions)',
      boostKeywords: [],
      boostPaths: [],
    },
    {
      id: 'sonnet',
      label: 'Sonnet (balanced, recommended)',
      boostKeywords: [],
      boostPaths: [],
    },
    {
      id: 'opus',
      label: 'Opus (powerful, understands hints)',
      boostKeywords: [],
      boostPaths: [],
    },
  ],
};

/**
 * Entity context question - shown when entities are detected in task.
 */
export const ENTITY_CONTEXT_QUESTION: ClarifyingQuestion = {
  id: 'entity-context',
  question: 'Include entity schemas in prompt?',
  category: 'scope',
  options: [
    {
      id: 'yes',
      label: 'Yes (fields, relationships, existing operations)',
      boostKeywords: [],
      boostPaths: [],
    },
    {
      id: 'no',
      label: 'No (just module context)',
      boostKeywords: [],
      boostPaths: [],
    },
  ],
};

/**
 * Options for question generation.
 */
export interface QuestionOptions {
  /** Include the model targeting question */
  includeModelQuestion?: boolean;
  /** Entities detected in the task (triggers entity context question) */
  detectedEntities?: string[];
}

/**
 * Generate clarifying questions based on detected keywords and module suggestions.
 */
export function generateQuestions(
  keywords: string[],
  modules: RankedModule[],
  actionType: string,
  options: QuestionOptions = {}
): ClarifyingQuestion[] {
  const questions: ClarifyingQuestion[] = [];

  // Detect if we have both frontend and backend modules
  const hasFrontend = modules.some(m =>
    m.path.includes('app') ||
    m.path.includes('component') ||
    m.path.includes('page')
  );
  const hasBackend = modules.some(m =>
    m.path.includes('convex') ||
    m.path.includes('api') ||
    m.path.includes('server')
  );

  if (hasFrontend && hasBackend) {
    questions.push(LAYER_QUESTIONS.fullStack);
  }

  // Detect multiple resource types in keywords
  const detectedResources = detectResources(keywords);
  if (detectedResources.length > 1) {
    questions.push(generateResourceQuestion(detectedResources));
  }

  // Add scope question for add/modify actions
  if (actionType === 'add' || actionType === 'modify') {
    questions.push(ACTION_QUESTIONS.scope);
  }

  // Add entity context question if entities were detected
  if (options.detectedEntities && options.detectedEntities.length > 0) {
    questions.push(ENTITY_CONTEXT_QUESTION);
  }

  // Add model question if requested (always last)
  if (options.includeModelQuestion) {
    questions.push(MODEL_QUESTION);
  }

  // Limit to 4 questions max (special questions don't count toward limit)
  const specialQuestions = (options.includeModelQuestion ? 1 : 0) +
                           (options.detectedEntities?.length ? 1 : 0);
  const maxQuestions = 3 + specialQuestions;
  return questions.slice(0, maxQuestions);
}

/**
 * Detect resource types mentioned in keywords.
 */
function detectResources(keywords: string[]): string[] {
  const detected: string[] = [];
  const keywordSet = new Set(keywords.map(k => k.toLowerCase()));

  for (const [resourceType, pattern] of Object.entries(RESOURCE_PATTERNS)) {
    if (pattern.keywords.some(k => keywordSet.has(k))) {
      detected.push(resourceType);
    }
  }

  return detected;
}

/**
 * Generate a resource type question dynamically.
 */
function generateResourceQuestion(resources: string[]): ClarifyingQuestion {
  const options = resources.map(resourceType => {
    const pattern = RESOURCE_PATTERNS[resourceType];
    return {
      id: resourceType,
      label: pattern.plural,
      boostKeywords: pattern.keywords,
      boostPaths: [resourceType, pattern.plural.toLowerCase()],
    };
  });

  // Add "all" option
  options.push({
    id: 'all',
    label: 'All of the above',
    boostKeywords: [],
    boostPaths: [],
  });

  return {
    id: 'resource',
    question: 'Which resource is this primarily about?',
    category: 'resource',
    options,
  };
}

/**
 * Format clarifying questions for CLI display.
 */
export function formatQuestions(questions: ClarifyingQuestion[]): string {
  const lines: string[] = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    lines.push(`\n${i + 1}. ${q.question}`);
    for (let j = 0; j < q.options.length; j++) {
      lines.push(`   ${String.fromCharCode(97 + j)}) ${q.options[j].label}`);
    }
  }

  return lines.join('\n');
}

/** Scope selection type */
export type ScopeSelection = 'ui-only' | 'logic-only' | 'data-only' | 'full';

/**
 * Parsed answer result including optional model and scope selection.
 */
export interface ParsedAnswers {
  boostKeywords: string[];
  boostPaths: string[];
  /** Selected model if model question was answered */
  selectedModel?: 'haiku' | 'sonnet' | 'opus';
  /** Selected scope if scope question was answered */
  selectedScope?: ScopeSelection;
  /** Whether to include entity context */
  includeEntityContext?: boolean;
}

/**
 * Parse user's answer to questions.
 */
export function parseAnswers(
  questions: ClarifyingQuestion[],
  input: string
): ParsedAnswers {
  const boostKeywords: string[] = [];
  const boostPaths: string[] = [];
  let selectedModel: ParsedAnswers['selectedModel'];
  let selectedScope: ParsedAnswers['selectedScope'];
  let includeEntityContext: boolean | undefined;

  // Input format: "a,b,c,d" - one letter per question in order, "x" to skip
  const answers = input.toLowerCase().split(',').map(s => s.trim());

  for (let qIndex = 0; qIndex < Math.min(answers.length, questions.length); qIndex++) {
    const answer = answers[qIndex];

    // Skip if "x" or empty
    if (!answer || answer === 'x') continue;

    // Parse option letter
    const optIndex = answer.charCodeAt(0) - 97;
    if (optIndex < 0 || optIndex > 25) continue;

    const question = questions[qIndex];
    if (optIndex >= 0 && optIndex < question.options.length) {
      const option = question.options[optIndex];

      // Check if this is a special question
      if (question.id === 'model') {
        selectedModel = option.id as ParsedAnswers['selectedModel'];
      } else if (question.id === 'scope') {
        selectedScope = option.id as ScopeSelection;
        boostKeywords.push(...option.boostKeywords);
        boostPaths.push(...option.boostPaths);
      } else if (question.id === 'entity-context') {
        includeEntityContext = option.id === 'yes';
      } else {
        boostKeywords.push(...option.boostKeywords);
        boostPaths.push(...option.boostPaths);
      }
    }
  }

  return { boostKeywords, boostPaths, selectedModel, selectedScope, includeEntityContext };
}
