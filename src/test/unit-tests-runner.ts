import * as mock from 'mock-require';
import * as sinon from 'sinon';

// Mock vscode module
const vscodeMock = {
    window: {
        createOutputChannel: () => ({
            append: () => { },
            appendLine: () => { },
            replace: () => { },
            clear: () => { },
            show: () => { },
            hide: () => { },
            dispose: () => { },
            name: 'Mock Channel'
        }),
        showInformationMessage: () => { },
        showErrorMessage: () => { },
        withProgress: (options: any, task: any) => task(),
        activeTextEditor: undefined,
        tabGroups: { all: [] }
    },
    workspace: {
        workspaceFolders: [],
        getConfiguration: () => ({
            get: () => { },
            update: () => { }
        }),
        openTextDocument: () => { }
    },
    extensions: {
        getExtension: () => { }
    },
    languages: {
        getDiagnostics: () => { }
    },
    commands: {
        getCommands: () => { },
        registerCommand: () => { },
        executeCommand: () => { }
    },
    Uri: {
        file: (path: string) => ({ fsPath: path, scheme: 'file', toString: () => `file://${path}` }),
        parse: (path: string) => ({ fsPath: path, scheme: 'file', toString: () => path })
    },
    Position: class {
        constructor(public line: number, public character: number) { }
    },
    Range: class {
        public start: any;
        public end: any;
        constructor(arg1: any, arg2: any, arg3?: any, arg4?: any) {
            if (typeof arg1 === 'number' && typeof arg2 === 'number' && typeof arg3 === 'number' && typeof arg4 === 'number') {
                this.start = { line: arg1, character: arg2 };
                this.end = { line: arg3, character: arg4 };
            } else {
                this.start = arg1;
                this.end = arg2;
            }
        }
    },
    Diagnostic: class {
        constructor(public range: any, public message: string, public severity: number) { }
    },
    DiagnosticSeverity: {
        Error: 0,
        Warning: 1,
        Information: 2,
        Hint: 3
    },
    SymbolKind: {
        Class: 4,
        Method: 5,
        Function: 11
    },
    OutputChannel: class { }
};

mock('vscode', vscodeMock);
