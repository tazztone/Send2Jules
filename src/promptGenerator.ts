/**
 * Prompt Generator Module
 * 
 * This module is responsible for generating intelligent, context-aware prompts for Jules
 * by analyzing the current workspace state and combining multiple sources of information:
 * 
 * **Context Sources:**
 * - Git diff analysis (modified, added, deleted files)
 * - Active editor cursor position and selected text
 * - Open files and tabs
 * - Antigravity agent artifacts (task.md, implementation_plan.md)
 * - Function/class context detection
 * 
 * **Artifact Discovery:**
 * The module scans `~/.gemini/antigravity/brain/` for conversation contexts created
 * by Antigravity agents, allowing users to continue from a specific conversation's state.
 * 
 * @module promptGenerator
 */

import * as vscode from 'vscode';
import { Repository } from './typings/git';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { validatePathInBrainDirectory } from './validators';
import { CODE_ANALYSIS, GitStatus, PATHS, LOG_PREFIX, VALIDATION } from './constants';
import { GeminiClient } from './geminiClient';

/**
 * Summary of Git repository changes including modified, added, and deleted files.
 * Used to generate context about what the user is currently working on.
 */
export interface DiffSummary {
    /** List of files that have been modified */
    modifiedFiles: string[];
    /** List of files that have been added */
    addedFiles: string[];
    /** List of files that have been deleted */
    deletedFiles: string[];
    /** Total number of changes across all categories */
    totalChanges: number;
}

/**
 * PromptGenerator class that orchestrates the creation of intelligent prompts
 * for Jules based on comprehensive workspace analysis.
 */
export class PromptGenerator {
    private outputChannel: vscode.OutputChannel;
    private geminiClient?: GeminiClient;

    constructor(outputChannel: vscode.OutputChannel, geminiClient?: GeminiClient) {
        this.outputChannel = outputChannel;
        this.geminiClient = geminiClient;
    }

    /**
     * Get list of available conversation contexts from the Antigravity brain directory.
     * 
     * Scans `~/.gemini/antigravity/brain/` for conversation folders and extracts:
     * - Conversation ID (folder name)
     * - Human-readable title from task.md or implementation_plan.md
     * - Last modified time for sorting
     * 
     * @returns Array of conversation contexts sorted by most recent first
     */
    async getAvailableContexts(): Promise<{ name: string; title: string; path: string; time: number }[]> {
        try {
            const homeDir = os.homedir();
            if (!homeDir) return [];

            const brainDir = path.join(homeDir, ...PATHS.BRAIN_PATH_SEGMENTS);
            try {
                await fs.access(brainDir);
            } catch {
                return [];
            }

            const entries = await fs.readdir(brainDir, { withFileTypes: true });
            const dirs = entries.filter(e => e.isDirectory());

            // PERFORMANCE: Load metadata in parallel with Promise.allSettled
            const contexts = await Promise.allSettled(
                dirs.map(d => this.loadContextMetadata(brainDir, d.name))
            );

            // Filter out failed loads and extract values
            const validContexts = contexts
                .filter((result): result is PromiseFulfilledResult<{ name: string; title: string; path: string; time: number }> =>
                    result.status === 'fulfilled'
                )
                .map(result => result.value);

            return validContexts.sort((a, b) => b.time - a.time);
        } catch (error) {
            this.outputChannel.appendLine(`Error listing contexts: ${error}`);
            return [];
        }
    }

    /**
     * Load metadata for a single context directory
     * @private
     */
    private async loadContextMetadata(
        brainDir: string,
        dirName: string
    ): Promise<{ name: string; title: string; path: string; time: number }> {
        const fullPath = path.join(brainDir, dirName);
        const stats = await fs.stat(fullPath);

        // Try to extract title from artifacts
        const title = await this.extractContextTitle(fullPath, dirName);

        return {
            name: dirName,
            title: title,
            path: fullPath,
            time: stats.mtimeMs
        };
    }

    /**
     * Extract human-readable title from context artifacts
     * @private
     */
    private async extractContextTitle(contextPath: string, fallbackName: string): Promise<string> {
        // Try task.md first
        const title = await this.tryExtractTitleFromFile(
            path.join(contextPath, 'task.md')
        );
        if (title) return title;

        // Fallback to implementation_plan.md
        const planTitle = await this.tryExtractTitleFromFile(
            path.join(contextPath, 'implementation_plan.md')
        );
        if (planTitle) return planTitle;

        // Final fallback to directory name
        return fallbackName;
    }

    /**
     * Try to extract title from a markdown file
     * PERFORMANCE: Only reads first 1KB to avoid loading large files
     * @private
     */
    private async tryExtractTitleFromFile(filePath: string): Promise<string | null> {
        try {
            // PERFORMANCE: Read only first 1KB to find the title
            const fileHandle = await fs.open(filePath, 'r');
            const buffer = Buffer.alloc(CODE_ANALYSIS.TITLE_READ_SIZE);
            await fileHandle.read(buffer, 0, CODE_ANALYSIS.TITLE_READ_SIZE, 0);
            await fileHandle.close();

            const content = buffer.toString('utf-8');
            const lines = content.split('\n');

            for (const line of lines) {
                if (line.startsWith('# ')) {
                    const candidate = line.substring(2).trim();
                    // Skip generic titles
                    if (candidate && !['Tasks', 'Task', 'Implementation Plan'].includes(candidate)) {
                        return candidate;
                    }
                }
            }
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Generate an intelligent prompt based on current workspace context.
     * 
     * This is the main entry point that combines multiple context sources:
     * 1. Active errors (diagnostics)
     * 2. Antigravity artifacts (task.md, implementation_plan.md)
     * 3. Git diff summary
     * 4. Active editor context (file, cursor, symbol)
     * 
     * The generated prompt uses an XML structure to provide clear context to Jules.
     * 
     * @param repo - Git repository object
     * @param activeEditor - Currently active text editor
     * @param contextPath - Specific conversation context path to use (optional, defaults to latest)
     * @returns Generated prompt string ready for Jules API
     */
    async generatePrompt(
        repo: Repository, 
        activeEditor?: vscode.TextEditor, 
        contextPath?: string
    ): Promise<string> {
        try {
            // Execute context gathering in parallel
            const [errors, artifacts, diff, activeFileContext, openFiles] = await Promise.all([
                this.getDiagnostics().catch(e => { this.outputChannel.appendLine(`Diag error: ${e}`); return null; }),
                this.getArtifacts(contextPath).catch(e => { this.outputChannel.appendLine(`Artifact error: ${e}`); return null; }),
                this.getGitDiff(repo).catch(e => { this.outputChannel.appendLine(`Git error: ${e}`); return null; }),
                this.getActiveEditorContext(activeEditor).catch(e => { this.outputChannel.appendLine(`Editor error: ${e}`); return null; }),
                this.getOpenFilesList().catch(e => { this.outputChannel.appendLine(`Files error: ${e}`); return []; })
            ]);

            // Optional: Use Gemini to generate a smart summary if client is available
            let smartSummary: string | undefined;
            if (this.geminiClient) {
                try {
                    smartSummary = await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: "Gemini 3 Flash Preview is drafting your mission brief..."
                    }, async () => {
                        return await this.geminiClient!.summarizeWork(
                            diff, 
                            errors, 
                            activeEditor?.document.fileName || null
                        ) || undefined;
                    });
                } catch (e) {
                    this.outputChannel.appendLine(`Smart summary generation failed: ${e}`);
                }
            }

            // Assemble XML parts
            return this.assemblePrompt(errors, artifacts, diff, activeFileContext, openFiles, smartSummary);
        } catch (error: any) {
            this.outputChannel.appendLine(`Error generating prompt: ${error}`);
            return `<instruction>Continue working on this project</instruction>
<workspace_context>
</workspace_context>
<mission_brief>[Describe your task here...]</mission_brief>`;
        }
    }

    /**
     * Get Git diff summary for the current repository.
     */
    private async getGitDiff(repo: Repository): Promise<string | null> {
        try {
            const changes = [
                ...repo.state.workingTreeChanges,
                ...repo.state.indexChanges
            ];

            if (changes.length === 0) return null;

            const summary = changes.map(change => {
                const status = this.getGitStatusString(change.status);
                const filePath = change.uri.fsPath;
                // Try to make path relative to workspace
                let displayPath = filePath;
                if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                    const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
                    if (filePath.startsWith(rootPath)) {
                        displayPath = path.relative(rootPath, filePath);
                    }
                }
                return `${status}: ${displayPath}`;
            }).join('\n');

            return `Modified Files:\n${summary}`;
        } catch (e) {
            return null;
        }
    }

    private getGitStatusString(status: number): string {
        switch (status) {
            case GitStatus.INDEX_MODIFIED: return 'Modified (staged)';
            case GitStatus.MODIFIED: return 'Modified';
            case GitStatus.INDEX_ADDED: return 'Added (staged)';
            case GitStatus.UNTRACKED: return 'Untracked';
            case GitStatus.INDEX_DELETED: return 'Deleted (staged)';
            case GitStatus.DELETED: return 'Deleted';
            default: return 'Changed';
        }
    }

    /**
     * Get context about the active editor.
     */
    private async getActiveEditorContext(editor?: vscode.TextEditor): Promise<string | null> {
        if (!editor) return null;

        const fileName = this.getFileName(editor.document.uri);
        const position = editor.selection.active;
        const symbolContext = await this.getDeepSymbolContext(editor);
        const selectedText = editor.document.getText(editor.selection);
        
        let context = `Active File: ${fileName}\nCursor Position: Line ${position.line + 1}, Column ${position.character + 1}`;
        if (symbolContext) {
            context += `\nSymbol Context: ${symbolContext}`;
        }

        if (selectedText && selectedText.trim().length > 0) {
            // Limit selection size
            const displaySelection = selectedText.length > 2000 
                ? selectedText.substring(0, 1900) + "\n\n[... Selection truncated ...]"
                : selectedText;
            context += `\n\nUser Selection:\n\"\"\"\n${displaySelection}\n\"\"\"`;
        }

        return context;
    }

    /**
     * Get deep symbol context using LSP.
     * Returns a breadcrumb string: "Class: UserManager > Method: validateSession"
     */
    private async getDeepSymbolContext(editor: vscode.TextEditor): Promise<string | null> {
        try {
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                editor.document.uri
            );

            if (!symbols || symbols.length === 0) return null;

            const position = editor.selection.active;
            return this.findDeepestSymbol(symbols, position);
        } catch (e) {
            return null;
        }
    }

    private findDeepestSymbol(symbols: vscode.DocumentSymbol[], position: vscode.Position, parentChain: string[] = []): string | null {
        for (const symbol of symbols) {
            if (symbol.range.contains(position)) {
                const kindName = vscode.SymbolKind[symbol.kind];
                const name = symbol.name;
                const currentChain = [...parentChain, `${kindName}: ${name}`];

                if (symbol.children && symbol.children.length > 0) {
                    const childResult = this.findDeepestSymbol(symbol.children, position, currentChain);
                    if (childResult) return childResult;
                }
                return currentChain.join(' > ');
            }
        }
        return null;
    }

    /**
     * Get active diagnostics (errors).
     */
    private async getDiagnostics(): Promise<string | null> {
        const diagnostics = vscode.languages.getDiagnostics();
        const errors: string[] = [];

        for (const [uri, diags] of diagnostics) {
            for (const diag of diags) {
                if (diag.severity === vscode.DiagnosticSeverity.Error) {
                    const fileName = this.getFileName(uri);
                    errors.push(`File: ${fileName} Line ${diag.range.start.line + 1}: ${diag.message}`);
                }
            }
        }

        return errors.length > 0 ? errors.join('\n') : null;
    }

    /**
     * Check if a URI points to an Antigravity artifact file.
     */
    private isArtifactFile(uri: vscode.Uri): boolean {
        const filePath = uri.fsPath;
        const isArtifact = (
            filePath.includes(path.sep + path.join(...PATHS.BRAIN_PATH_SEGMENTS) + path.sep) &&
            PATHS.ARTIFACTS.some(artifact => filePath.endsWith(path.sep + artifact))
        );
        return isArtifact;
    }

    /**
     * Read and format artifact file content with a header.
     */
    private async readArtifactFile(uri: vscode.Uri, fileName: string): Promise<string | null> {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const content = document.getText();

            if (!content || content.trim().length === 0) {
                return null;
            }

            const header = fileName === 'task.md' ? 'CURRENT TASK CHECKLIST' : 'IMPLEMENTATION PLAN';
            return `--- ${header} ---\n${content.trim()}`;
        } catch (error) {
            this.outputChannel.appendLine(`Error reading artifact ${fileName}: ${error}`);
            return null;
        }
    }

    /**
     * Get list of all open files in tab groups.
     */
    private async getOpenFilesList(): Promise<string[]> {
        const fileNames: string[] = [];
        const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);

        for (const tab of tabs) {
            if (tab.input && typeof tab.input === 'object' && tab.input !== null && 'uri' in tab.input) {
                const uri = (tab.input as any).uri as vscode.Uri;
                fileNames.push(this.getFileName(uri));
            }
        }

        return [...new Set(fileNames)];
    }

    /**
     * Get artifacts content.
     */
    private async getArtifacts(specificContextPath?: string): Promise<string | null> {
        try {
            const artifactContent: string[] = [];
            const processedArtifactPaths = new Set<string>();

            const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);

            for (const tab of tabs) {
                if (tab.input && typeof tab.input === 'object' && tab.input !== null && 'uri' in tab.input) {
                    const uri = (tab.input as any).uri as vscode.Uri;
                    const fullPath = uri.fsPath;
                    const fileName = this.getFileName(uri);

                    if (this.isArtifactFile(uri)) {
                        if (specificContextPath && !fullPath.startsWith(specificContextPath)) {
                            continue;
                        }

                        const content = await this.readArtifactFile(uri, fileName);
                        if (content) {
                            artifactContent.push(content);
                            processedArtifactPaths.add(fullPath);
                        }
                    }
                }
            }

            const filesystemArtifacts = await this.findArtifactFiles(specificContextPath);
            for (const artifact of filesystemArtifacts) {
                if (!processedArtifactPaths.has(artifact.path)) {
                    artifactContent.push(artifact.content);
                }
            }

            return artifactContent.length > 0 ? artifactContent.join('\n\n') : null;
        } catch (error) {
            this.outputChannel.appendLine(`Error getting artifacts: ${error}`);
            return null;
        }
    }

    /**
     * Find artifact files in the .gemini directory.
     */
    private async findArtifactFiles(specificContextPath?: string): Promise<{ name: string; content: string; path: string }[]> {
        try {
            let targetDir = specificContextPath;

            if (!targetDir) {
                const contexts = await this.getAvailableContexts();
                if (contexts.length === 0) return [];
                targetDir = contexts[0].path;
            }

            const homeDir = os.homedir();
            if (!homeDir) {
                this.outputChannel.appendLine(`${LOG_PREFIX.SECURITY} Could not determine home directory`);
                return [];
            }

            const brainDir = path.join(homeDir, ...PATHS.BRAIN_PATH_SEGMENTS);
            const resolvedBrainDir = path.resolve(brainDir);

            try {
                validatePathInBrainDirectory(targetDir, resolvedBrainDir);
            } catch (error) {
                this.outputChannel.appendLine(`${LOG_PREFIX.SECURITY} Path validation failed: ${error}`);
                return [];
            }

            const artifacts: { name: string; content: string; path: string }[] = [];

            for (const fileName of PATHS.ARTIFACTS) {
                const filePath = path.join(targetDir, fileName);

                try {
                    validatePathInBrainDirectory(filePath, resolvedBrainDir);
                } catch (error) {
                    this.outputChannel.appendLine(`${LOG_PREFIX.SECURITY} File path outside brain directory: ${filePath}`);
                    continue;
                }

                try {
                    await fs.access(filePath, fs.constants.R_OK);
                    const uri = vscode.Uri.file(filePath);
                    const content = await this.readArtifactFile(uri, fileName);
                    if (content) {
                        artifacts.push({ name: fileName, content, path: filePath });
                    }
                } catch (error: any) {
                    if (error.code !== 'ENOENT' && error.code !== 'EACCES') {
                        this.outputChannel.appendLine(`Unexpected error accessing ${fileName}: ${error.code}`);
                    }
                }
            }

            return artifacts;
        } catch (error) {
            this.outputChannel.appendLine(`Error finding artifact files: ${error}`);
            return [];
        }
    }

    /**
     * Extract file name from URI.
     */
    private getFileName(uri: vscode.Uri): string {
        const parts = uri.fsPath.split(/[\\/]/);
        return parts[parts.length - 1];
    }

    /**
     * Summarize the current intent based on artifacts and workspace state.
     */
    private summarizeCurrentIntent(
        artifacts: string | null, 
        activeFileContext: string | null, 
        diff: string | null,
        smartSummary?: string
    ): string {
        // Priority 1: AI-generated smart summary
        if (smartSummary) return smartSummary;

        const placeholder = "[Describe your task here...]";
        
        // Strategy 2: Look for first unchecked task in task.md
        if (artifacts) {
            const taskMatch = artifacts.match(/- \[ \] (.*)/);
            if (taskMatch && taskMatch[1]) {
                return `Continue working on: ${taskMatch[1].trim()}`;
            }
        }

        // Strategy 3: Infer from active file and diff
        if (activeFileContext && diff) {
            const fileMatch = activeFileContext.match(/Active File: (.*)/);
            if (fileMatch && fileMatch[1]) {
                const fileName = fileMatch[1];
                if (diff.includes(fileName)) {
                    return `Finish implementation of changes in ${fileName}`;
                }
            }
        }

        return placeholder;
    }

    /**
     * Assemble the final prompt XML with budget management.
     */
    private assemblePrompt(
        errors: string | null, 
        artifacts: string | null, 
        diff: string | null, 
        activeFileContext: string | null, 
        openFiles: string[],
        smartSummary?: string
    ): string {
        const instruction = "You are an expert software engineer. You are working on a WIP branch. Please run `git status` and `git diff` to understand the changes and the current state of the code. Analyze the workspace context and complete the mission brief.";
        const missionBrief = this.summarizeCurrentIntent(artifacts, activeFileContext, diff, smartSummary);

        const maxLen = VALIDATION.PROMPT_MAX_LENGTH;

        const baseStart = `<instruction>${instruction}</instruction>\n<workspace_context>\n`;
        const baseEnd = `</workspace_context>\n<mission_brief>${missionBrief}</mission_brief>`;

        // Calculate available budget for context
        let currentLen = baseStart.length + baseEnd.length;
        let remainingBudget = maxLen - currentLen;

        // Sections
        let activeFileStr = activeFileContext ? `<active_editor>\n${activeFileContext}\n</active_editor>\n` : "";
        let openFilesStr = openFiles.length > 0 ? `<open_files>\n${openFiles.join('\n')}\n</open_files>\n` : "";
        let gitDiffStr = diff ? `<git_diff>\n${diff}\n</git_diff>\n` : "";
        let activeErrorsStr = errors ? `<active_errors>\n${errors}\n</active_errors>\n` : "";
        let artifactsStr = artifacts ? `<artifacts>\n${artifacts}\n</artifacts>\n` : "";

        // Assemble with priority
        const sections = [
            { name: 'Active Editor', content: activeFileStr },
            { name: 'Artifacts', content: artifactsStr },
            { name: 'Active Errors', content: activeErrorsStr },
            { name: 'Git Diff', content: gitDiffStr },
            { name: 'Open Files', content: openFilesStr }
        ];

        let finalContext = "";

        for (const section of sections) {
            if (section.content.length <= remainingBudget) {
                finalContext += section.content;
                remainingBudget -= section.content.length;
            } else if (remainingBudget > 500) {
                // Partial truncate for large sections like Git Diff or Artifacts
                const tagName = section.content.match(/^<(\w+)>/)?.[1] || "context";
                finalContext += section.content.substring(0, remainingBudget - 50) + `\n[... Truncated ...]\n</${tagName}>\n`;
                remainingBudget = 0;
                break;
            }
        }

        return `${baseStart}${finalContext}${baseEnd}`;
    }
}
