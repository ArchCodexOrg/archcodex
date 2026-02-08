/**
 * @arch archcodex.cli.mcp.handler
 *
 * MCP tool handlers for intent and action operations (intents, action, feature, infer).
 */
import { resolve } from 'path';
import { loadConfig } from '../../core/config/loader.js';
import {
  loadIntentRegistry,
  getIntentsByCategory,
  listIntentNames,
  suggestIntents,
  loadActionRegistry,
  loadFeatureRegistry,
  matchAction,
  getAction,
  listActionNames,
  findFeatureByAction,
  listFeatureNames,
  getFeature,
} from '../../core/registry/loader.js';
import {
  loadComponentGroupsRegistry,
  expandChecklist,
} from '../../core/registry/component-groups.js';
import { extractIntents, parseArchTags } from '../../core/arch-tag/parser.js';
import { inferArchitecture, buildRulesFromSettings } from '../../core/infer/index.js';
import { patternMatches } from '../../utils/pattern-matcher.js';
import { readFile, globFiles } from '../../utils/file-system.js';
import { loadArchIgnore } from '../../utils/archignore.js';

// ============================================================================
// INTENTS HANDLER
// ============================================================================

export interface IntentsOptions {
  action?: string;
  name?: string;
  file?: string;
  archId?: string;
}

export async function handleIntents(projectRoot: string, options: IntentsOptions = {}) {
  const intentRegistry = await loadIntentRegistry(projectRoot);
  const action = options.action || 'list';

  switch (action) {
    case 'list': {
      const categories = getIntentsByCategory(intentRegistry);
      const intentNames = listIntentNames(intentRegistry);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            total: intentNames.length,
            byCategory: Object.fromEntries(categories),
            intents: Object.fromEntries(
              Object.entries(intentRegistry.intents).map(([name, def]) => [
                name,
                {
                  description: def.description,
                  category: def.category,
                  hasRequires: (def.requires?.length ?? 0) > 0,
                  hasForbids: (def.forbids?.length ?? 0) > 0,
                  hasConflicts: (def.conflicts_with?.length ?? 0) > 0,
                },
              ])
            ),
          }, null, 2),
        }],
      };
    }

    case 'show': {
      if (!options.name) {
        return {
          content: [{ type: 'text', text: 'Error: name is required for "show" action' }],
          isError: true,
        };
      }

      const definition = intentRegistry.intents[options.name];
      if (!definition) {
        const available = listIntentNames(intentRegistry);
        const similar = available.filter(n => n.includes(options.name!) || options.name!.includes(n));
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Intent not found',
              name: options.name,
              similar,
            }, null, 2),
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ name: options.name, ...definition }, null, 2),
        }],
      };
    }

    case 'usage': {
      const config = await loadConfig(projectRoot);
      const patterns = config.files?.scan?.include || ['**/*.ts', '**/*.tsx'];
      const exclude = config.files?.scan?.exclude || ['**/node_modules/**', '**/dist/**'];
      const archIgnore = await loadArchIgnore(projectRoot);

      let files = await globFiles(patterns, {
        cwd: projectRoot,
        ignore: exclude,
        absolute: true,
      });
      files = archIgnore.filter(files);

      const usage = new Map<string, string[]>();
      const undefinedIntents = new Map<string, string[]>();

      for (const filePath of files) {
        try {
          const content = await readFile(filePath);
          const intents = extractIntents(content);
          const relativePath = filePath.replace(projectRoot + '/', '');

          for (const intent of intents) {
            if (intentRegistry.intents[intent]) {
              if (!usage.has(intent)) usage.set(intent, []);
              usage.get(intent)!.push(relativePath);
            } else {
              if (!undefinedIntents.has(intent)) undefinedIntents.set(intent, []);
              undefinedIntents.get(intent)!.push(relativePath);
            }
          }
        } catch { /* file unreadable, skip */ }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            defined: Object.fromEntries(
              Array.from(usage.entries()).map(([k, v]) => [k, { files: v, count: v.length }])
            ),
            undefined: Object.fromEntries(
              Array.from(undefinedIntents.entries()).map(([k, v]) => [k, { files: v, count: v.length }])
            ),
          }, null, 2),
        }],
      };
    }

    case 'validate': {
      const config = await loadConfig(projectRoot);
      const patterns = config.files?.scan?.include || ['**/*.ts', '**/*.tsx'];
      const exclude = config.files?.scan?.exclude || ['**/node_modules/**', '**/dist/**'];
      const archIgnore = await loadArchIgnore(projectRoot);

      let files: string[];
      if (options.file) {
        files = [resolve(projectRoot, options.file)];
      } else {
        files = await globFiles(patterns, {
          cwd: projectRoot,
          ignore: exclude,
          absolute: true,
        });
        files = archIgnore.filter(files);
      }

      interface ValidationIssue {
        file: string;
        intent: string;
        type: 'undefined' | 'missing_pattern' | 'forbidden_pattern' | 'conflict';
        message: string;
      }

      const issues: ValidationIssue[] = [];
      let totalIntents = 0;

      for (const filePath of files) {
        try {
          const content = await readFile(filePath);
          const intents = extractIntents(content);
          const relativePath = filePath.replace(projectRoot + '/', '');

          for (const intentName of intents) {
            totalIntents++;
            const definition = intentRegistry.intents[intentName];

            if (!definition) {
              issues.push({
                file: relativePath,
                intent: intentName,
                type: 'undefined',
                message: `Unknown intent '@intent:${intentName}'`,
              });
              continue;
            }

            if (definition.requires) {
              for (const pattern of definition.requires) {
                if (!patternMatches(pattern, content)) {
                  issues.push({
                    file: relativePath,
                    intent: intentName,
                    type: 'missing_pattern',
                    message: `Intent '@intent:${intentName}' requires pattern '${pattern}'`,
                  });
                }
              }
            }

            if (definition.forbids) {
              for (const pattern of definition.forbids) {
                if (patternMatches(pattern, content)) {
                  issues.push({
                    file: relativePath,
                    intent: intentName,
                    type: 'forbidden_pattern',
                    message: `Intent '@intent:${intentName}' forbids pattern '${pattern}'`,
                  });
                }
              }
            }

            if (definition.conflicts_with) {
              for (const conflicting of definition.conflicts_with) {
                if (intents.includes(conflicting)) {
                  issues.push({
                    file: relativePath,
                    intent: intentName,
                    type: 'conflict',
                    message: `Intent '@intent:${intentName}' conflicts with '@intent:${conflicting}'`,
                  });
                }
              }
            }
          }
        } catch { /* file unreadable, skip */ }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            totalIntents,
            issueCount: issues.length,
            passed: issues.length === 0,
            issues,
          }, null, 2),
        }],
      };
    }

    case 'suggest': {
      if (!options.file && !options.archId) {
        return {
          content: [{ type: 'text', text: 'Error: file or archId is required for "suggest" action' }],
          isError: true,
        };
      }

      const suggestions = suggestIntents(intentRegistry, {
        filePath: options.file,
        archId: options.archId,
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            file: options.file,
            archId: options.archId,
            suggestions: suggestions.map(s => ({
              intent: s.name,
              reason: s.reason,
              matchedPattern: s.matchedPattern,
              description: s.description,
              category: s.category,
            })),
          }, null, 2),
        }],
      };
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown action: ${action}. Use list, show, usage, validate, or suggest.` }],
        isError: true,
      };
  }
}

// ============================================================================
// ACTION HANDLER
// ============================================================================

export interface ActionToolOptions {
  query?: string;
  action?: string;
  name?: string;
}

export async function handleAction(projectRoot: string, options: ActionToolOptions = {}) {
  const actionRegistry = await loadActionRegistry(projectRoot);
  const featureRegistry = await loadFeatureRegistry(projectRoot);
  const componentGroupsRegistry = await loadComponentGroupsRegistry(projectRoot);
  const action = options.action || 'match';

  switch (action) {
    case 'list': {
      const actionNames = listActionNames(actionRegistry);

      if (actionNames.length === 0) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              actions: [],
              hint: 'Create .arch/registry/_actions.yaml to define actions',
            }, null, 2),
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            actions: actionNames.map(name => ({
              name,
              description: actionRegistry.actions[name].description,
              aliases: actionRegistry.actions[name].aliases,
              architecture: actionRegistry.actions[name].architecture,
            })),
          }, null, 2),
        }],
      };
    }

    case 'show': {
      if (!options.name) {
        return {
          content: [{ type: 'text', text: 'Error: name is required for "show" action' }],
          isError: true,
        };
      }

      const actionDef = getAction(actionRegistry, options.name);
      if (!actionDef) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Action not found',
              name: options.name,
              available: listActionNames(actionRegistry),
            }, null, 2),
          }],
          isError: true,
        };
      }

      // Check for linked feature
      const linkedFeature = findFeatureByAction(featureRegistry, options.name);

      // Expand checklist with component groups
      const expandedChecklist = expandChecklist(
        actionDef.checklist,
        componentGroupsRegistry,
        actionDef.triggers
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            name: options.name,
            description: actionDef.description,
            aliases: actionDef.aliases,
            architecture: actionDef.architecture,
            intents: actionDef.intents,
            triggers: actionDef.triggers,
            suggestedPath: actionDef.suggested_path,
            filePattern: actionDef.file_pattern,
            testPattern: actionDef.test_pattern,
            checklist: expandedChecklist,
            linkedFeature: linkedFeature ? {
              components: linkedFeature.components.map(c => ({
                role: c.role,
                architecture: c.architecture,
                path: c.path,
                optional: c.optional,
              })),
              checklist: linkedFeature.checklist,
            } : undefined,
          }, null, 2),
        }],
      };
    }

    case 'match':
    default: {
      if (!options.query) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              hint: 'Provide a query describing what you want to do',
              examples: ['add a view', 'create endpoint', 'add validation rule'],
              available: listActionNames(actionRegistry),
            }, null, 2),
          }],
        };
      }

      const matches = matchAction(actionRegistry, options.query);

      if (matches.length === 0) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              query: options.query,
              matches: [],
              hint: 'No matching actions found. Try different words or use action: "list" to see available actions.',
              available: listActionNames(actionRegistry),
            }, null, 2),
          }],
        };
      }

      // Return the best match with full details, and summaries of other matches
      const bestMatch = matches[0];
      const linkedFeature = findFeatureByAction(featureRegistry, bestMatch.name);

      // Expand checklist with component groups
      const expandedChecklist = expandChecklist(
        bestMatch.action.checklist,
        componentGroupsRegistry,
        bestMatch.action.triggers
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            query: options.query,
            bestMatch: {
              name: bestMatch.name,
              score: Math.round(bestMatch.score * 100) + '%',
              matchType: bestMatch.matchType,
              description: bestMatch.action.description,
              architecture: bestMatch.action.architecture,
              intents: bestMatch.action.intents,
              checklist: expandedChecklist,
              suggestedPath: bestMatch.action.suggested_path,
              filePattern: bestMatch.action.file_pattern,
              testPattern: bestMatch.action.test_pattern,
              linkedFeature: linkedFeature ? {
                components: linkedFeature.components.length,
                roles: linkedFeature.components.map(c => c.role),
              } : undefined,
            },
            otherMatches: matches.slice(1, 5).map(m => ({
              name: m.name,
              score: Math.round(m.score * 100) + '%',
              description: m.action.description,
            })),
          }, null, 2),
        }],
      };
    }
  }
}

// ============================================================================
// FEATURE HANDLER
// ============================================================================

export interface FeatureToolOptions {
  action?: string;
  feature?: string;
  name?: string;
}

export async function handleFeature(projectRoot: string, options: FeatureToolOptions = {}) {
  const featureRegistry = await loadFeatureRegistry(projectRoot);
  const action = options.action || 'list';

  switch (action) {
    case 'list': {
      const featureNames = listFeatureNames(featureRegistry);

      if (featureNames.length === 0) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              features: [],
              hint: 'Create .arch/registry/_features.yaml to define feature templates',
            }, null, 2),
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            features: featureNames.map(name => ({
              name,
              description: featureRegistry.features[name].description,
              components: featureRegistry.features[name].components.length,
              roles: featureRegistry.features[name].components.map(c => c.role),
            })),
          }, null, 2),
        }],
      };
    }

    case 'show': {
      if (!options.feature) {
        return {
          content: [{ type: 'text', text: 'Error: feature is required for "show" action' }],
          isError: true,
        };
      }

      const featureDef = getFeature(featureRegistry, options.feature);
      if (!featureDef) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Feature not found',
              name: options.feature,
              available: listFeatureNames(featureRegistry),
            }, null, 2),
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            name: options.feature,
            description: featureDef.description,
            components: featureDef.components.map(c => ({
              role: c.role,
              architecture: c.architecture,
              path: c.path,
              template: c.template,
              optional: c.optional,
            })),
            sharedVariables: featureDef.shared_variables,
            checklist: featureDef.checklist,
          }, null, 2),
        }],
      };
    }

    case 'preview': {
      if (!options.feature || !options.name) {
        return {
          content: [{ type: 'text', text: 'Error: feature and name are required for "preview" action' }],
          isError: true,
        };
      }

      const featureDef = getFeature(featureRegistry, options.feature);
      if (!featureDef) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Feature not found',
              name: options.feature,
              available: listFeatureNames(featureRegistry),
            }, null, 2),
          }],
          isError: true,
        };
      }

      // Preview file paths with variable substitution
      const files = featureDef.components.map(c => ({
        role: c.role,
        path: c.path.replace(/\$\{name\}/g, options.name!).replace(/\$\{name:kebab\}/g, toKebabCase(options.name!)),
        architecture: c.architecture,
        optional: c.optional,
      }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            feature: options.feature,
            name: options.name,
            files,
            checklist: featureDef.checklist,
            hint: 'Use archcodex feature CLI command to create these files',
          }, null, 2),
        }],
      };
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown action: ${action}. Use: list, show, preview` }],
        isError: true,
      };
  }
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

// ============================================================================
// INFER HANDLER
// ============================================================================

export interface InferOptions {
  files: string[];
  untaggedOnly?: boolean;
}

export async function handleInfer(projectRoot: string, options: InferOptions) {
  const { files, untaggedOnly } = options;

  if (!files || files.length === 0) {
    return {
      content: [{ type: 'text', text: 'Error: files is required' }],
      isError: true,
    };
  }

  const config = await loadConfig(projectRoot);
  const inferenceSettings = config.inference;
  const rules = buildRulesFromSettings(inferenceSettings);

  // Load intent registry
  let intentRegistry = null;
  try {
    intentRegistry = await loadIntentRegistry(projectRoot);
  } catch { /* intent registry optional */ }

  // Resolve files
  const resolvedFiles: string[] = [];
  for (const pattern of files) {
    if (pattern.includes('*')) {
      resolvedFiles.push(...await globFiles(pattern, {
        cwd: projectRoot,
        absolute: false,
        ignore: ['node_modules/**', 'dist/**', 'build/**'],
      }));
    } else {
      resolvedFiles.push(pattern);
    }
  }

  const results: Array<{
    file: string;
    currentArch: string | null;
    suggestedArch: string | null;
    confidence: string | null;
    reason: string | null;
    suggestedIntents?: Array<{ name: string; reason: string }>;
  }> = [];

  for (const file of resolvedFiles) {
    const content = await readFile(resolve(projectRoot, file));
    const tags = parseArchTags(content);
    const currentArch = tags.archTag?.archId || null;

    // Skip if untaggedOnly and file has tag
    if (untaggedOnly && currentArch) {
      continue;
    }

    const suggestion = inferArchitecture(file, content, rules);

    // Get intent suggestions
    let intents: Array<{ name: string; reason: string }> = [];
    if (intentRegistry) {
      intents = suggestIntents(intentRegistry, {
        filePath: file,
        archId: suggestion?.archId,
      }).map(s => ({ name: s.name, reason: s.reason }));
    }

    results.push({
      file,
      currentArch,
      suggestedArch: suggestion?.archId || null,
      confidence: suggestion?.confidence || null,
      reason: suggestion?.reason || null,
      suggestedIntents: intents.length > 0 ? intents : undefined,
    });
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        filesAnalyzed: resolvedFiles.length,
        results,
      }, null, 2),
    }],
  };
}
