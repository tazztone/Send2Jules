# Send2Jules Project Roadmap

This document outlines the planned improvements and future features for the Send2Jules VS Code extension.

## Phase 1: Context Enrichment (Highest Priority)
*   [x] **Git Diff Integration**: Automatically include the current `git diff` summary in the generated XML prompt.
*   [x] **Active Symbol Focus**: Utilize the `getDeepSymbolContext` to provide Jules with specific class/method context.
*   [x] **Workspace Structure Overview**: Included a list of all open files in the prompt.

## Phase 2: Workflow & UX Refinement
*   [x] **Enhanced Progress UI**: Replaced status bar text updates with the VS Code `window.withProgress` API for long-running Git and API operations.
*   [x] **Context Menu Integration**: Added "Send to Jules" to Editor and Explorer context menus for faster access.
*   [x] **Selection Support**: Automatically include selected code snippets in the Jules prompt for targeted refactoring.
*   [ ] **Flexible Branch Management**: Add an option to use a persistent `jules-handoff` branch instead of creating a new timestamped branch for every session.
*   [ ] **Interactive Context Filtering**: Allow users to toggle specific context pieces (errors, specific files, diffs) before generating the prompt.
*   [ ] **Multi-Remote Support**: Implement a remote picker for repositories with multiple remotes (e.g., origin vs. upstream).

## Phase 3: Performance & Resiliency
*   [ ] **Context Caching**: Cache the list of Antigravity conversation contexts to improve responsiveness of the QuickPick menu.
*   [ ] **Smart Error Grouping**: Group and prioritize diagnostics in `getDiagnostics` to ensure the most critical errors are never truncated by the prompt budget.
*   [ ] **Dry Run Mode**: Add a command to preview the generated prompt without triggering the Git sync or API flow.

## Phase 4: Quality & Maintenance
*   [ ] **Integration Testing**: Implement integration tests that mock the Jules API and VS Code Git API.
*   [ ] **Automated Cleanup**: Add logic to suggest or perform cleanup of old `wip-jules-*` branches.
