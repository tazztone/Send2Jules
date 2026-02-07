/**
 * Antigravity Jules Bridge Extension
 * 
 * This VS Code extension enables seamless handoff of development work to the Jules autonomous agent.
 * It provides intelligent context awareness by:
 * - Detecting and syncing uncommitted Git changes
 * - Reading Antigravity conversation artifacts (task.md, implementation_plan.md)
 * - Analyzing workspace state (open files, cursor position, git diff)
 * - Generating context-rich prompts for Jules
 * - Creating Jules sessions via the Google Jules API
 * 
 * Architecture:
 * - extension.ts: Main extension entry point and command registration
 * - gitContext.ts: Git repository detection and WIP commit management
 * - promptGenerator.ts: Intelligent prompt generation from workspace context
 * - julesClient.ts: Jules API client for session creation
 * - secrets.ts: Secure API key storage using VS Code SecretStorage
 * 
 * @module extension
 */

import * as vscode from 'vscode';
import { JulesClient } from './julesClient';
import { GitContextManager } from './gitContext';
import { SecretsManager } from './secrets';
import { PromptGenerator } from './promptGenerator';
import { AntigravityDetector } from './antigravityDetector';
import { GeminiClient } from './geminiClient';
import { ProjectNotInitializedError, ValidationError, ApiError, ConfigurationError, SecurityError } from './errors';
import { UI_CONFIG, MESSAGES, URLS, PATHS } from './constants';
import { validateUrl } from './validators';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Status bar item that displays the "Send to Jules" button
 */
let statusBarItem: vscode.StatusBarItem;

/**
 * Context for a pending Jules session
 */
interface PendingSessionContext {
    repoDetails: {
        owner: string;
        name: string;
        branch: string;
    };
    promptFilePath: string;
}

let pendingSessionContext: PendingSessionContext | undefined;

/**
 * Extension activation function called by VS Code when the extension is activated.
 * 
 * This function:
 * 1. Initializes core managers (Git, Secrets, Jules Client, Prompt Generator, Gemini Client)
 * 2. Creates a status bar button for quick access
 * 3. Registers commands
 * 
 * @param context - VS Code extension context for managing subscriptions and lifecycle
 */
export async function activate(context: vscode.ExtensionContext) {
    // Initialize Output Channel
    const outputChannel = vscode.window.createOutputChannel("Jules Bridge");
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine("Jules Bridge Extension Activating...");

    // ============================================================
    // INITIALIZE MANAGERS
    // ============================================================
    let secrets: SecretsManager | undefined;
    let gitManager: GitContextManager | undefined;
    let julesClient: JulesClient | undefined;
    let geminiClient: GeminiClient | undefined;
    let promptGenerator: PromptGenerator | undefined;

    try {
        secrets = new SecretsManager(context);
        gitManager = new GitContextManager(outputChannel);
        julesClient = new JulesClient(secrets);
        geminiClient = new GeminiClient(secrets);
        promptGenerator = new PromptGenerator(outputChannel, geminiClient);
        outputChannel.appendLine("Managers initialized successfully.");
    } catch (error) {
        outputChannel.appendLine(`[ERROR] Manager initialization failed: ${error}`);
        // We continue to register commands so they exist in the UI
    }

    // ============================================================
    // ANTIGRAVITY ENVIRONMENT VALIDATION
    // ============================================================
    const antigravityDetector = new AntigravityDetector();
    const isAntigravity = antigravityDetector.isAntigravityEnvironment();
    
    if (!isAntigravity) {
        const warningMessage = antigravityDetector.getWarningMessage();
        outputChannel.appendLine(`[WARNING] ${warningMessage}`);
        
        // Log detection details for troubleshooting
        const details = antigravityDetector.getDetectionDetails();
        outputChannel.appendLine(`Detection details: ${JSON.stringify(details, null, 2)}`);
        
        // Show warning but don't return early - allow commands to be registered
        // so we don't get 'command not found' errors.
        vscode.window.showWarningMessage(warningMessage, MESSAGES.LEARN_MORE).then(selection => {
            if (selection === MESSAGES.LEARN_MORE) {
                try {
                    validateUrl(URLS.ANTIGRAVITY_INFO, ['deepmind.google']);
                    vscode.env.openExternal(vscode.Uri.parse(URLS.ANTIGRAVITY_INFO));
                } catch (error) {
                    outputChannel.appendLine(`[SECURITY] URL validation failed: ${error}`);
                }
            }
        });
    }

    // Initialize UI
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, UI_CONFIG.STATUS_BAR_PRIORITY);
    statusBarItem.command = 'julesBridge.sendFlow';
    statusBarItem.text = UI_CONFIG.STATUS_BAR_TEXT.DEFAULT;
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Helper to update status bar state
    const updateStatusBar = (state: 'default' | 'pending' | 'syncing' | 'drafting' | 'sending') => {
        if (!statusBarItem) return;
        switch (state) {
            case 'default':
                statusBarItem.text = UI_CONFIG.STATUS_BAR_TEXT.DEFAULT;
                statusBarItem.command = 'julesBridge.sendFlow';
                statusBarItem.tooltip = 'Start a new Jules session';
                break;
            case 'pending':
                statusBarItem.text = '$(rocket) Validate and Send';
                statusBarItem.command = 'julesBridge.submitPrompt';
                statusBarItem.tooltip = 'Submit the current prompt to Jules';
                break;
            case 'syncing':
                statusBarItem.text = UI_CONFIG.STATUS_BAR_TEXT.SYNCING;
                break;
            case 'drafting':
                statusBarItem.text = UI_CONFIG.STATUS_BAR_TEXT.DRAFTING;
                break;
            case 'sending':
                statusBarItem.text = UI_CONFIG.STATUS_BAR_TEXT.SENDING;
                break;
        }
    };

    // Reset status bar when prompt file is closed
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => {
        if (pendingSessionContext && doc.uri.fsPath === pendingSessionContext.promptFilePath) {
            pendingSessionContext = undefined;
            updateStatusBar('default');
        }
    }));

    /**
     * Command: julesBridge.setApiKey
     * 
     * Prompts the user to enter their Jules API key and stores it securely
     * in the OS keychain via VS Code's SecretStorage API.
     */
    context.subscriptions.push(vscode.commands.registerCommand('julesBridge.setApiKey', async () => {
        if (!secrets) {
            vscode.window.showErrorMessage("Secrets Manager failed to initialize. Check Output for details.");
            return;
        }
        await secrets.promptAndStoreKey();
    }));

    /**
     * Command: julesBridge.sendFlow
     * 
     * Main handoff command that executes the following workflow:
     */
    context.subscriptions.push(vscode.commands.registerCommand('julesBridge.sendFlow', async () => {
        if (!gitManager || !promptGenerator) {
            vscode.window.showErrorMessage("Extension components failed to initialize. Check Output for details.");
            return;
        }

        try {
            outputChannel.appendLine("Command 'sendFlow' triggered");

            // 1. Validate Git State
            const repoDetails = await gitManager.getRepositoryDetails();
            if (!repoDetails) {
                vscode.window.showErrorMessage(MESSAGES.NO_GIT_REPO);
                return;
            }

            // 2. Handle Dirty State
            if (repoDetails.isDirty) {
                const config = vscode.workspace.getConfiguration('julesBridge');
                const autoPush = config.get('autoPush');

                if (autoPush) {
                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: "Syncing changes to Jules...",
                        cancellable: false
                    }, async () => {
                        await gitManager!.pushWipChanges(repoDetails.repo);
                    });
                } else {
                    const choice = await vscode.window.showWarningMessage(
                        MESSAGES.UNCOMMITTED_CHANGES,
                        MESSAGES.PUSH_CONTINUE,
                        MESSAGES.CANCEL
                    );
                    if (choice === MESSAGES.PUSH_CONTINUE) {
                        await vscode.window.withProgress({
                            location: vscode.ProgressLocation.Notification,
                            title: "Syncing changes to Jules...",
                            cancellable: false
                        }, async () => {
                            await gitManager!.pushWipChanges(repoDetails.repo);
                        });
                    } else {
                        return;
                    }
                }
            }

            // 3. Select Conversation Context
            const availableContexts = await promptGenerator.getAvailableContexts();
            let selectedContextPath: string | undefined;

            if (availableContexts.length > 1) {
                const items = availableContexts.map(ctx => {
                    const date = new Date(ctx.time);
                    return {
                        label: ctx.title,
                        description: date.toLocaleString(),
                        detail: ctx.name,
                        path: ctx.path
                    };
                });

                items.unshift({
                    label: MESSAGES.LATEST_CONTEXT_LABEL,
                    description: MESSAGES.LATEST_CONTEXT_DESCRIPTION,
                    detail: "",
                    path: "" 
                });

                const selection = await vscode.window.showQuickPick(items, {
                    placeHolder: MESSAGES.CONTEXT_PICKER_PLACEHOLDER,
                    title: MESSAGES.CONTEXT_PICKER_TITLE
                });

                if (!selection) return; 

                if (selection.path) {
                    selectedContextPath = selection.path;
                }
            }

            // 4. Auto-generate context-aware prompt
            const autoPrompt = await promptGenerator.generatePrompt(
                repoDetails.repo,
                vscode.window.activeTextEditor,
                selectedContextPath
            );

            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                throw new Error('No workspace folder open');
            }

            const promptFilePath = path.join(workspaceFolders[0].uri.fsPath, PATHS.JULES_PROMPT_FILE);
            fs.writeFileSync(promptFilePath, autoPrompt, 'utf8');

            const document = await vscode.workspace.openTextDocument(promptFilePath);
            await vscode.window.showTextDocument(document);

            pendingSessionContext = {
                repoDetails: {
                    owner: repoDetails.owner,
                    name: repoDetails.name,
                    branch: repoDetails.branch
                },
                promptFilePath
            };

            vscode.window.showInformationMessage(MESSAGES.PROMPT_OPENED);
            updateStatusBar('pending');

        } catch (error: any) {
            outputChannel.appendLine(`Error: ${error.message}`);
            if (error.stack) outputChannel.appendLine(error.stack);

            if (error instanceof ProjectNotInitializedError) {
                const selection = await vscode.window.showErrorMessage(
                    MESSAGES.PROJECT_NOT_INITIALIZED(error.owner, error.repo),
                    MESSAGES.CONFIGURE_JULES,
                    MESSAGES.CANCEL
                );
                if (selection === MESSAGES.CONFIGURE_JULES) {
                    try {
                        validateUrl(URLS.JULES_SETTINGS, ['jules.google.com']);
                        vscode.env.openExternal(vscode.Uri.parse(URLS.JULES_SETTINGS));
                    } catch (urlError) {
                        outputChannel.appendLine(`[SECURITY] URL validation failed: ${urlError}`);
                    }
                }
            } else if (error instanceof ValidationError) {
                vscode.window.showErrorMessage(
                    `Validation Error: ${error.message}${error.field ? ` (${error.field})` : ''}`
                );
            } else if (error instanceof ApiError) {
                vscode.window.showErrorMessage(
                    `Jules API Error: ${error.message}`
                );
            } else if (error instanceof ConfigurationError) {
                const selection = await vscode.window.showErrorMessage(
                    error.message,
                    'Set API Key',
                    MESSAGES.CANCEL
                );
                if (selection === 'Set API Key') {
                    await vscode.commands.executeCommand('julesBridge.setApiKey');
                }
            } else if (error instanceof SecurityError) {
                vscode.window.showErrorMessage(
                    `Security Error: ${error.message}`
                );
                outputChannel.appendLine(`[SECURITY] ${error.violationType}: ${error.message}`);
            } else {
                vscode.window.showErrorMessage(MESSAGES.HANDOFF_FAILED(error.message));
            }
        } finally {
            if (!pendingSessionContext) {
                updateStatusBar('default');
            }
        }
    }));

    /**
     * Command: julesBridge.submitPrompt
     */
    context.subscriptions.push(vscode.commands.registerCommand('julesBridge.submitPrompt', async () => {
        if (!julesClient) {
            vscode.window.showErrorMessage("Jules Client failed to initialize. Check Output for details.");
            return;
        }

        const currentContext = pendingSessionContext;
        if (!currentContext) {
            vscode.window.showErrorMessage(MESSAGES.NO_PENDING_SESSION);
            return;
        }

        try {
            outputChannel.appendLine("Command 'submitPrompt' triggered");

            if (!fs.existsSync(currentContext.promptFilePath)) {
                throw new Error('Prompt file not found');
            }
            const userPrompt = fs.readFileSync(currentContext.promptFilePath, 'utf8');

            const session = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Creating Jules Session...",
                cancellable: false
            }, async () => {
                return await julesClient!.createSession(
                    currentContext.repoDetails.owner,
                    currentContext.repoDetails.name,
                    currentContext.repoDetails.branch,
                    userPrompt
                );
            });

            vscode.window.showInformationMessage(
                MESSAGES.SESSION_STARTED(session.name),
                MESSAGES.OPEN_DASHBOARD
            ).then(selection => {
                if (selection === MESSAGES.OPEN_DASHBOARD) {
                    try {
                        const sessionUrl = URLS.JULES_SESSION(session.id);
                        validateUrl(sessionUrl, ['jules.google.com']);
                        vscode.env.openExternal(vscode.Uri.parse(sessionUrl));
                    } catch (error) {
                        outputChannel.appendLine(`[SECURITY] Invalid session URL: ${error}`);
                        vscode.window.showErrorMessage('Invalid session ID received from API');
                    }
                }
            });

            for (const editor of vscode.window.visibleTextEditors) {
                if (editor.document.uri.fsPath === currentContext.promptFilePath) {
                    await vscode.window.showTextDocument(editor.document);
                    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                }
            }

            try {
                fs.unlinkSync(currentContext.promptFilePath);
            } catch (e) {
                outputChannel.appendLine(`Warning: Could not delete prompt file: ${e}`);
            }

            pendingSessionContext = undefined;

        } catch (error: any) {
            outputChannel.appendLine(`Error: ${error.message}`);
            if (error.stack) outputChannel.appendLine(error.stack);

            if (error instanceof ProjectNotInitializedError) {
                const selection = await vscode.window.showErrorMessage(
                    MESSAGES.PROJECT_NOT_INITIALIZED(error.owner, error.repo),
                    MESSAGES.CONFIGURE_JULES,
                    MESSAGES.CANCEL
                );
                if (selection === MESSAGES.CONFIGURE_JULES) {
                    try {
                        validateUrl(URLS.JULES_SETTINGS, ['jules.google.com']);
                        vscode.env.openExternal(vscode.Uri.parse(URLS.JULES_SETTINGS));
                    } catch (urlError) {
                        outputChannel.appendLine(`[SECURITY] URL validation failed: ${urlError}`);
                    }
                }
            } else if (error instanceof ValidationError) {
                vscode.window.showErrorMessage(
                    `Validation Error: ${error.message}${error.field ? ` (${error.field})` : ''}`
                );
            } else if (error instanceof ApiError) {
                vscode.window.showErrorMessage(
                    `Jules API Error: ${error.message}`
                );
            } else if (error instanceof ConfigurationError) {
                const selection = await vscode.window.showErrorMessage(
                    error.message,
                    'Set API Key',
                    MESSAGES.CANCEL
                );
                if (selection === 'Set API Key') {
                    await vscode.commands.executeCommand('julesBridge.setApiKey');
                }
            } else if (error instanceof SecurityError) {
                vscode.window.showErrorMessage(
                    `Security Error: ${error.message}`
                );
                outputChannel.appendLine(`[SECURITY] ${error.violationType}: ${error.message}`);
            } else {
                vscode.window.showErrorMessage(MESSAGES.HANDOFF_FAILED(error.message));
            }
        } finally {
            updateStatusBar('default');
        }
    }));
}

