import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { PromptGenerator } from '../../promptGenerator';
import { Repository } from '../../typings/git';

suite('PromptGenerator Test Suite', () => {
    let sandbox: sinon.SinonSandbox;
    let outputChannelStub: sinon.SinonStubbedInstance<vscode.OutputChannel>;
    let promptGenerator: PromptGenerator;

    setup(() => {
        sandbox = sinon.createSandbox();
        outputChannelStub = {
            append: sandbox.stub(),
            appendLine: sandbox.stub(),
            replace: sandbox.stub(),
            clear: sandbox.stub(),
            show: sandbox.stub() as any,
            hide: sandbox.stub(),
            dispose: sandbox.stub(),
            name: 'Test Channel'
        };
        // Initial setup without Gemini, can be overridden in tests
        promptGenerator = new PromptGenerator(outputChannelStub as unknown as vscode.OutputChannel);

        // Mock vscode.languages.getDiagnostics
        sandbox.stub(vscode.languages, 'getDiagnostics').returns([]);

        // Mock vscode.workspace.openTextDocument
        sandbox.stub(vscode.workspace, 'openTextDocument').resolves({
            getText: () => 'file content',
            uri: vscode.Uri.file('/path/to/file.ts')
        } as unknown as vscode.TextDocument);

        // Mock vscode.commands.executeCommand
        sandbox.stub(vscode.commands, 'executeCommand').resolves([]);
    });

    teardown(() => {
        sandbox.restore();
    });

    test('generatePrompt - basic structure and instructions', async () => {
        const repo = {
            state: {
                workingTreeChanges: [],
                indexChanges: []
            }
        } as unknown as Repository;

        const prompt = await promptGenerator.generatePrompt(repo);

        // Check for XML structure
        assert.ok(prompt.includes('<instruction>'));
        assert.ok(prompt.includes('<workspace_context>'));
        assert.ok(prompt.includes('<mission_brief>'));

        // Check for specific instructions
        assert.ok(prompt.includes('run `git status` and `git diff`'));
    });

    test('generatePrompt - with git changes', async () => {
        const repo = {
            state: {
                workingTreeChanges: [{ uri: vscode.Uri.file('/path/to/modified.ts'), status: 5 }],
                indexChanges: []
            }
        } as unknown as Repository;

        const prompt = await promptGenerator.generatePrompt(repo);
        assert.ok(prompt.includes('<git_diff>'));
        // In the test, relative path might just be the full path if workspaceFolders is empty
        assert.ok(prompt.includes('Modified:'));
        assert.ok(prompt.includes('modified.ts'));
    });

    test('generatePrompt - with active editor', async () => {
        const repo = {
            state: { workingTreeChanges: [], indexChanges: [] }
        } as unknown as Repository;

        const editorStub = {
            document: { 
                uri: vscode.Uri.file('/path/to/active.ts'),
                getText: () => ''
            },
            selection: { active: new vscode.Position(10, 5) }
        } as unknown as vscode.TextEditor;

        const prompt = await promptGenerator.generatePrompt(repo, editorStub);
        assert.ok(prompt.includes('<active_editor>'));
        assert.ok(prompt.includes('Active File: active.ts'));
        assert.ok(prompt.includes('Line 11, Column 6'));
    });

    test('generatePrompt - with selection', async () => {
        const repo = {
            state: { workingTreeChanges: [], indexChanges: [] }
        } as unknown as Repository;

        const editorStub = {
            document: { 
                uri: vscode.Uri.file('/path/to/active.ts'),
                getText: (selection: any) => 'function test() { return true; }'
            },
            selection: { 
                active: new vscode.Position(0, 0),
                isEmpty: false
            }
        } as unknown as vscode.TextEditor;

        const prompt = await promptGenerator.generatePrompt(repo, editorStub);
        assert.ok(prompt.includes('User Selection:'));
        assert.ok(prompt.includes('function test()'));
    });

    test('generatePrompt - AI mission brief from artifacts', async () => {
        const repo = {
            state: { workingTreeChanges: [], indexChanges: [] }
        } as unknown as Repository;

        // Mock a task artifact with an unchecked item
        sandbox.stub(promptGenerator as any, 'getArtifacts').resolves(
            '# Task List\n- [x] Done task\n- [ ] Pending AI Feature\n- [ ] Another task'
        );

        const prompt = await promptGenerator.generatePrompt(repo);
        assert.ok(prompt.includes('<mission_brief>Continue working on: Pending AI Feature</mission_brief>'));
    });

    test('generatePrompt - with diagnostics', async () => {
        const repo = {
            state: { workingTreeChanges: [], indexChanges: [] }
        } as unknown as Repository;

        // Mock Diagnostics
        const diagnostic = new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 10),
            'Error message',
            vscode.DiagnosticSeverity.Error
        );
        const uri = vscode.Uri.file('/path/to/error.ts');
        (vscode.languages.getDiagnostics as sinon.SinonStub).returns([[uri, [diagnostic]]]);

        const prompt = await promptGenerator.generatePrompt(repo);
        assert.ok(prompt.includes('<active_errors>'));
        assert.ok(prompt.includes('File: error.ts Line 1: Error message'));
    });

    test('generatePrompt - with Gemini smart summary', async () => {
        const repo = {
            state: { workingTreeChanges: [], indexChanges: [] }
        } as unknown as Repository;

        const geminiClientStub = {
            summarizeWork: sandbox.stub().resolves('AI generated mission brief')
        };

        // Create a new generator with the stub
        const generatorWithGemini = new PromptGenerator(outputChannelStub as any, geminiClientStub as any);

        // Ensure all context methods return something to avoid catch block
        sandbox.stub(generatorWithGemini as any, 'getArtifacts').resolves(null);
        sandbox.stub(generatorWithGemini as any, 'getDiagnostics').resolves(null);
        sandbox.stub(generatorWithGemini as any, 'getGitDiff').resolves(null);
        sandbox.stub(generatorWithGemini as any, 'getActiveEditorContext').resolves(null);
        sandbox.stub(generatorWithGemini as any, 'getOpenFilesList').resolves([]);

        // Mock withProgress to just run the task
        sandbox.stub(vscode.window, 'withProgress').callsFake((options, task) => {
            return task({ report: () => {} }, new vscode.CancellationTokenSource().token);
        });

        const prompt = await generatorWithGemini.generatePrompt(repo);
        
        if (!prompt.includes('AI generated mission brief')) {
            console.log("PROMPT DEBUG:", prompt);
        }
        
        assert.ok(prompt.includes('<mission_brief>AI generated mission brief</mission_brief>'));
        assert.strictEqual(geminiClientStub.summarizeWork.calledOnce, true);
    });
});
