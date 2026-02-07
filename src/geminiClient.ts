import * as vscode from 'vscode';
import { SecretsManager } from './secrets';

/**
 * Client for interacting with the built-in Antigravity Gemini models for intelligent drafting.
 */
export class GeminiClient {
    constructor(private secrets: SecretsManager, private outputChannel: vscode.OutputChannel) { }

    /**
     * Generate a smart summary of the current work based on Git diff and diagnostics.
     * Leverages the internal IDE model via vscode.lm API.
     */
    async summarizeWork(diff: string | null, errors: string | null, activeFile: string | null, openFiles: string[]): Promise<string | null> {
        this.outputChannel.appendLine(`Gemini: Context Snapshot - Diff: ${diff ? (diff.length + ' chars') : 'none'}, Errors: ${errors ? 'present' : 'none'}, File: ${activeFile || 'none'}, Open Files: ${openFiles.length}`);

        if (!diff && !errors && !activeFile && openFiles.length === 0) {
            this.outputChannel.appendLine("Gemini: No context provided (no diff, errors, active file, or open files)");
            return null;
        }

        try {
            this.outputChannel.appendLine(`Gemini: Selecting built-in model...`);
            this.outputChannel.appendLine(`Gemini: IDE Name: ${vscode.env.appName}, Version: ${vscode.version}`);

            // Try to find the Gemini 3 Flash model within the IDE
            let models: vscode.LanguageModelChat[] = [];
            
            this.outputChannel.appendLine(`Gemini: Querying for all available chat models...`);
            let allModels: vscode.LanguageModelChat[] = [];
            try {
                allModels = await vscode.lm.selectChatModels({});
            } catch (e) {
                this.outputChannel.appendLine(`Gemini: vscode.lm.selectChatModels error: ${e}`);
            }

            if (allModels.length === 0) {
                this.outputChannel.appendLine("Gemini: [IMPORTANT] No models returned. This usually means permissions are missing.");
                this.outputChannel.appendLine("Gemini: Action Required: Look for a 'Allow Extension' toast in the bottom right, or run 'Antigravity: Manage Extension Permissions'.");
            } else {
                this.outputChannel.appendLine(`Gemini: Inspecting ${allModels.length} registered models...`);
                
                // 1. Strict Priority: Gemini 3 Flash (any vendor/id variation)
                models = allModels.filter(m => 
                    (m.id.toLowerCase().includes('gemini-3') || m.family.toLowerCase().includes('gemini-3'))
                );

                if (models.length > 0) {
                    this.outputChannel.appendLine(`Gemini: Found ${models.length} Gemini 3 model(s).`);
                } else {
                    this.outputChannel.appendLine("Gemini: No Gemini 3 models found. Diagnostics for all available models:");
                    for (const m of allModels) {
                        this.outputChannel.appendLine(` - ID: ${m.id}, Vendor: ${m.vendor}, Family: ${m.family}, Name: ${m.name}`);
                    }
                    
                    // 2. Loose Filter: Any Google/Antigravity model that isn't explicitly Gemini 1.5
                    const broadMatch = allModels.find(m => 
                        (m.vendor.toLowerCase() === 'google' || m.vendor.toLowerCase() === 'antigravity') &&
                        (m.family.toLowerCase().includes('gemini') || m.family.toLowerCase().includes('flash')) &&
                        !m.family.toLowerCase().includes('1.5') && !m.id.toLowerCase().includes('1.5')
                    );

                    if (broadMatch) {
                        this.outputChannel.appendLine(`Gemini: Found broad match (non-1.5): ${broadMatch.id}`);
                        models = [broadMatch];
                    }
                }
            }

            if (models.length === 0) {
                this.outputChannel.appendLine("Gemini: No suitable Gemini 3 or compatible models found.");
                return null;
            }

            const model = models[0];
            this.outputChannel.appendLine(`Gemini: Using model: ${model.id} (${model.vendor})`);

            const prompt = `You are a developer assistant helping to "handoff" work to an autonomous agent.
Analyze the following workspace state and summarize what the user is currently working on in ONE CONCISE SENTENCE.
The summary will be used as a "mission brief" for the agent.

GIT DIFF SUMMARY:
${diff || 'No changes'}

ACTIVE ERRORS:
${errors || 'No errors'}

ACTIVE FILE:
${activeFile || 'None'}

OPEN FILES:
${openFiles.join('\n') || 'None'}

RESPONSE FORMAT: Just the sentence. No preamble. No "Here is a summary".
EXAMPLE: "Refactoring the login logic in auth.ts to support JWT validation."`;

            const request = await model.sendRequest([
                vscode.LanguageModelChatMessage.User(prompt)
            ], {}, new vscode.CancellationTokenSource().token);

            let responseText = '';
            for await (const fragment of request.text) {
                responseText += fragment;
            }

            const summary = responseText.trim();
            if (!summary) {
                this.outputChannel.appendLine("Gemini: IDE model returned empty response");
                return null;
            }

            this.outputChannel.appendLine(`Gemini: Successfully generated summary: "${summary}"`);
            return summary;

        } catch (e: any) {
            this.outputChannel.appendLine(`Gemini Internal Request Failed: ${e.message}`);
            return null;
        }
    }
}