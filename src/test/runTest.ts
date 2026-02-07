import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');

        // The path to test runner
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        // Path to the Antigravity executable found on the system
        const vscodeExecutablePath = '/usr/bin/antigravity';

        // Run the integration test using Antigravity
        await runTests({ 
            vscodeExecutablePath,
            extensionDevelopmentPath, 
            extensionTestsPath 
        });
    } catch (err) {
        console.error('Failed to run tests');
        process.exit(1);
    }
}

main();
