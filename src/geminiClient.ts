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
    async summarizeWork(diff: string | null, errors: string | null, activeFile: string | null): Promise<string | null> {
        if (!diff && !errors && !activeFile) {
            this.outputChannel.appendLine("Gemini: No context provided (no diff, errors, or active file)");
            return null;
        }

        try {
            this.outputChannel.appendLine(`Gemini: Selecting built-in model...`);

            // Try to find the Gemini 3 Flash model within the IDE
            let models = await vscode.lm.selectChatModels({
                vendor: 'google',
                family: 'gemini-3-flash'
            });

            // Fallback: If not found, try a broader search and log available models
            if (models.length === 0) {
                this.outputChannel.appendLine("Gemini: Preferred model (google/gemini-3-flash) not found. Listing all available models:");
                const allModels = await vscode.lm.selectChatModels({});
                for (const m of allModels) {
                    this.outputChannel.appendLine(` - ID: ${m.id}, Vendor: ${m.vendor}, Family: ${m.family}`);
                }

                // If any google model exists, take the first one as fallback
                const googleModels = allModels.filter(m => m.vendor === 'google');
                if (googleModels.length > 0) {
                    this.outputChannel.appendLine(`Gemini: Falling back to ${googleModels[0].id}`);
                    models = [googleModels[0]];
                }
            }

            if (models.length === 0) {
                this.outputChannel.appendLine("Gemini: No suitable built-in models found.");
                return null;
            }

            const model = models[0];

            const prompt = `You are a developer assistant helping to "handoff" work to an autonomous agent.
Analyze the following workspace state and summarize what the user is currently working on in ONE CONCISE SENTENCE.
The summary will be used as a "mission brief" for the agent.

GIT DIFF SUMMARY:
${diff || 'No changes'}

ACTIVE ERRORS:
${errors || 'No errors'}

ACTIVE FILE:
${activeFile || 'None'}

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
