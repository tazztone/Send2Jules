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
            
            try {
                models = await vscode.lm.selectChatModels({
                    vendor: 'google',
                    family: 'gemini-3-flash'
                });
            } catch (e) {
                this.outputChannel.appendLine(`Gemini: vscode.lm.selectChatModels failed: ${e}`);
            }

            // Fallback: If not found, try a broader search and log available models
            if (models.length === 0) {
                this.outputChannel.appendLine("Gemini: Preferred model not found via standard API. Searching for Antigravity-specific models...");
                
                try {
                    const allModels = await vscode.lm.selectChatModels({});
                    if (allModels.length > 0) {
                        this.outputChannel.appendLine(`Gemini: Found ${allModels.length} models via broad search:`);
                        for (const m of allModels) {
                            this.outputChannel.appendLine(` - ID: ${m.id}, Vendor: ${m.vendor}, Family: ${m.family}`);
                        }
                        // Use the first available model
                        models = [allModels[0]];
                    }
                } catch (e) {
                    this.outputChannel.appendLine(`Gemini: Broad search failed: ${e}`);
                }
            }

            // Deep Fallback: Check for google.antigravity extension specifically
            if (models.length === 0) {
                const agExt = vscode.extensions.getExtension('google.antigravity');
                this.outputChannel.appendLine(`Gemini: google.antigravity extension state: ${agExt ? 'Found (' + (agExt.isActive ? 'Active' : 'Inactive') + ')' : 'Not Found'}`);
                
                if (agExt && !agExt.isActive) {
                    this.outputChannel.appendLine("Gemini: Activating google.antigravity...");
                    await agExt.activate();
                }
                
                // Re-try selection after activation
                try {
                    models = await vscode.lm.selectChatModels({});
                } catch (e) {}
            }

            if (models.length === 0) {
                this.outputChannel.appendLine("Gemini: No suitable built-in models found. Check 'Proposed APIs' or 'Allow Extension' popups.");
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