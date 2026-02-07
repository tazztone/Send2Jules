# Installation & Configuration

## Prerequisites

1. **Antigravity IDE**: This extension **only works in Antigravity IDE**
   - Download from [Antigravity](https://antigravity.google/)
   - Will not activate in regular VS Code
2. **Git**: A workspace with a Git repository
3. **Jules API Access**:
   - A Google Cloud Project with Jules API enabled
   - Jules API Key ([Get one here](https://jules.google.com/settings))
4. **GitHub Integration**:
   - Jules GitHub App installed for your repositories ([Configure here](https://jules.google.com/))

## Install Extension (Developers)

If you are modifying the extension, you can use the automated deployment script to install your changes into Antigravity:

1. **Build and Install**:
   ```bash
   npm run deploy
   ```
   This command compiles the code, packages it as a `.vsix`, and force-installs it into your local Antigravity instance.
2. **Reload Antigravity**: Click the "Reload Required" notification in the IDE.

## Configure API Key

1. Run command: `Jules Bridge: Set Jules API Key` (Cmd/Ctrl+Shift+P)
2. Enter your Jules API key
3. The key is securely stored in your OS keychain.
4. **Note**: The same key is used for both the Jules Agent and the **Gemini 3 Flash Preview** drafting features.

## Configuration Settings

Open VS Code settings and search for "Jules Bridge":

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `julesBridge.autoPush` | boolean | `true` | Automatically commit and push WIP changes before sending to Jules |
