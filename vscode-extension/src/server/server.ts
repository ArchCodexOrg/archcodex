/**
 * @arch extension.server.entry
 *
 * ArchCodex Language Server
 *
 * Provides real-time validation diagnostics for ArchCodex architectural constraints.
 */
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  DidChangeConfigurationNotification,
  CodeActionParams,
  CodeAction,
  Diagnostic,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ValidatorService } from './validator-service.js';
import { getCodeActionsForDiagnostic } from './code-actions.js';

// Create a connection for the server using Node's IPC as transport
const connection = createConnection(ProposedFeatures.all);

// Create a text document manager
const documents = new TextDocuments<TextDocument>(TextDocument);

// Validator service instance
let validatorService: ValidatorService | null = null;

// Debounce timers per document
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 300;

// Store diagnostics per document for code actions
const documentDiagnostics = new Map<string, Diagnostic[]>();

// Configuration
interface ArchCodexSettings {
  enable: boolean;
  configPath: string;
  validateOnSave: boolean;
  severityFilter: 'all' | 'errors' | 'warnings';
}

const defaultSettings: ArchCodexSettings = {
  enable: true,
  configPath: '.arch/config.yaml',
  validateOnSave: true,
  severityFilter: 'all',
};

let globalSettings: ArchCodexSettings = defaultSettings;
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let projectRoot: string | null = null;

connection.onInitialize(async (params: InitializeParams): Promise<InitializeResult> => {
  const capabilities = params.capabilities;

  hasConfigurationCapability = !!(
    capabilities.workspace && capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && capabilities.workspace.workspaceFolders
  );

  // Get project root from workspace folders
  if (params.workspaceFolders && params.workspaceFolders.length > 0) {
    const workspaceUri = params.workspaceFolders[0].uri;
    projectRoot = workspaceUri.startsWith('file://')
      ? workspaceUri.slice(7)
      : workspaceUri;
  } else if (params.rootUri) {
    projectRoot = params.rootUri.startsWith('file://')
      ? params.rootUri.slice(7)
      : params.rootUri;
  }

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // Tell the client we support code actions
      codeActionProvider: true,
    },
  };

  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }

  return result;
});

connection.onInitialized(async () => {
  if (hasConfigurationCapability) {
    // Register for configuration changes
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }

  // Initialize the validator service
  await initializeValidator();
});

async function initializeValidator(): Promise<void> {
  if (!projectRoot) {
    connection.console.error('No project root found');
    return;
  }

  try {
    validatorService = new ValidatorService({
      projectRoot,
      configPath: globalSettings.configPath,
    });
    await validatorService.initialize();
    connection.console.log('ArchCodex validator initialized');
  } catch (error) {
    connection.console.error(
      `Failed to initialize ArchCodex: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

connection.onDidChangeConfiguration(async (change) => {
  if (hasConfigurationCapability) {
    const settings = await connection.workspace.getConfiguration({
      section: 'archcodex',
    });
    globalSettings = {
      enable: settings?.enable ?? defaultSettings.enable,
      configPath: settings?.configPath ?? defaultSettings.configPath,
      validateOnSave: settings?.validateOnSave ?? defaultSettings.validateOnSave,
      severityFilter: settings?.severityFilter ?? defaultSettings.severityFilter,
    };
  } else {
    globalSettings = change.settings?.archcodex ?? defaultSettings;
  }

  // Re-initialize if config path changed
  if (validatorService) {
    await validatorService.reload();
  }
});

// Validate a document with debounce
function validateDocumentDebounced(textDocument: TextDocument): void {
  const uri = textDocument.uri;

  // Clear existing timer
  const existingTimer = debounceTimers.get(uri);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Set new timer
  const timer = setTimeout(() => {
    debounceTimers.delete(uri);
    validateDocument(textDocument);
  }, DEBOUNCE_MS);

  debounceTimers.set(uri, timer);
}

// Validate a document immediately
async function validateDocument(textDocument: TextDocument): Promise<void> {
  if (!globalSettings.enable) {
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
    return;
  }

  if (!validatorService || !validatorService.isInitialized()) {
    return;
  }

  // Convert URI to file path
  const filePath = textDocument.uri.startsWith('file://')
    ? textDocument.uri.slice(7)
    : textDocument.uri;

  // Skip non-TypeScript/JavaScript files
  if (!filePath.match(/\.(ts|tsx|js|jsx)$/)) {
    return;
  }

  try {
    let diagnostics = await validatorService.validateFile(filePath);

    // Apply severity filter
    if (globalSettings.severityFilter === 'errors') {
      diagnostics = diagnostics.filter(d => d.severity === 1);
    } else if (globalSettings.severityFilter === 'warnings') {
      diagnostics = diagnostics.filter(d => d.severity === 2);
    }

    // Store diagnostics for code actions
    documentDiagnostics.set(textDocument.uri, diagnostics);
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
  } catch (error) {
    connection.console.error(
      `Validation error for ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// Handle document save
documents.onDidSave((event: { document: TextDocument }) => {
  if (globalSettings.validateOnSave) {
    validateDocumentDebounced(event.document);
  }
});

// Handle document open - validate immediately
documents.onDidOpen((event) => {
  validateDocument(event.document);
});

// Clear diagnostics when document is closed
documents.onDidClose((event) => {
  const uri = event.document.uri;

  // Clear any pending timer
  const timer = debounceTimers.get(uri);
  if (timer) {
    clearTimeout(timer);
    debounceTimers.delete(uri);
  }

  // Clear stored diagnostics
  documentDiagnostics.delete(uri);

  connection.sendDiagnostics({ uri, diagnostics: [] });
});

// Watch for .arch/ file changes
connection.onDidChangeWatchedFiles(async (_change) => {
  connection.console.log('Configuration files changed, reloading...');
  if (validatorService) {
    try {
      await validatorService.reload();
      // Re-validate all open documents
      documents.all().forEach((doc) => {
        validateDocument(doc);
      });
    } catch (error) {
      connection.console.error(
        `Failed to reload configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
});

// Handle code action requests
connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  const actions: CodeAction[] = [];

  // Get diagnostics for this document
  const diagnostics = documentDiagnostics.get(params.textDocument.uri) || [];

  // Find diagnostics that overlap with the requested range
  for (const diagnostic of diagnostics) {
    if (rangesOverlap(diagnostic.range, params.range)) {
      const diagnosticActions = getCodeActionsForDiagnostic(diagnostic, document);
      actions.push(...diagnosticActions);
    }
  }

  return actions;
});

/**
 * Check if two ranges overlap.
 */
function rangesOverlap(
  a: { start: { line: number; character: number }; end: { line: number; character: number } },
  b: { start: { line: number; character: number }; end: { line: number; character: number } }
): boolean {
  // Check if one range is entirely before the other
  if (a.end.line < b.start.line || b.end.line < a.start.line) {
    return false;
  }
  if (a.end.line === b.start.line && a.end.character < b.start.character) {
    return false;
  }
  if (b.end.line === a.start.line && b.end.character < a.start.character) {
    return false;
  }
  return true;
}

// Handle shutdown
connection.onShutdown(() => {
  // Clear all debounce timers
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer);
  }
  debounceTimers.clear();

  // Clear diagnostics cache
  documentDiagnostics.clear();

  // Dispose validator
  if (validatorService) {
    validatorService.dispose();
    validatorService = null;
  }
});

// Make the text document manager listen on the connection
documents.listen(connection);

// Start the connection
connection.listen();
