# Usage Guide

## Basic Workflow

1. **Make Changes**: Work on your code as normal.
2. **Trigger Handoff**: 
   - Click the rocket icon (🚀) in the **status bar**.
   - **Right-click** in the editor and select **"Send to Jules"**.
   - **Right-click** a file or folder in the explorer sidebar and select **"Send to Jules"**.
3. **AI Drafting**: Observe the progress bar while **Gemini 3 Flash Preview** generates a mission brief for you.
4. **Review Prompt**: The `JULES_PROMPT.md` file will open. Review the AI-generated brief and context.
5. **Send**: Click the **"Validate and Send"** button at the top right of the editor.

## Features

### 🚀 Smart Handoff
- **AI Mission Briefing**: Uses Gemini 3 Flash to automatically summarize your uncommitted changes and intent.
- **Context Menu Integration**: Trigger handoffs from anywhere in the IDE for a faster workflow.

### 📝 Intelligent Context Awareness
- **Selection Support**: Highlight a specific code snippet before sending to Jules. The extension will wrap it in a `<user_selection>` block so Jules knows exactly what to focus on.
- **Git Diff Summary**: Automatically includes a list of modified files.
- **Symbol Context**: Identifies the Class or Method your cursor is currently in using LSP.
- **Artifact Integration**: Automatically finds and includes Antigravity `task.md` and `implementation_plan.md`.

### 🔄 Automatic Git Sync
- Automatically stages, commits, and pushes uncommitted changes to a unique WIP branch.
- Uses **window progress notifications** so you can see the sync status in real-time.
- Never affects your main branch.
## Command Palette

- **Send to Jules**: `julesBridge.sendFlow` - Main handoff command
- **Set Jules API Key**: `julesBridge.setApiKey` - Configure or update API key
