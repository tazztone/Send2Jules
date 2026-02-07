# Architecture & Internals

## How It Works

The extension follows a 7-step workflow when you click "Send to Jules":

### 1️⃣ Validate Git State
- Detects Git repository from active file or workspace folder
- Extracts repository details (owner, name, branch)

### 2️⃣ Handle Dirty State (Progress: "Syncing changes...")
If uncommitted changes are detected:
- **Auto Mode** (`autoPush: true`): Automatically creates WIP commit and pushes
- **Manual Mode** (`autoPush: false`): Prompts user for confirmation

**WIP Commit Strategy:**
1. Stage all working tree changes
2. Create commit: "WIP: Auto-save for Jules Handover [timestamp]"
3. Create new branch: `wip-jules-[timestamp]`
4. Push branch to remote with upstream tracking

### 3️⃣ Select Conversation Context
- Scans `~/.gemini/antigravity/brain/` for previous Antigravity conversations
- Option to auto-select the latest conversation

### 4️⃣ AI-Driven Mission Briefing (Progress: "Gemini 3 Flash Preview is drafting...")
- Calls **Gemini 3 Flash Preview** to analyze the Git diff, active file, and errors.
- Generates a high-quality "Mission Brief" summary (e.g., "Implementing JWT validation in auth.ts").
- If AI fails, falls back to parsing `task.md` for the first unchecked task.

### 5️⃣ Generate Intelligent Prompt
Combines multiple context sources into a rich XML prompt:
- **Git Diff Summary**: List of modified/added/deleted files.
- **Active Editor**: File name, cursor position, and LSP symbol context (Class/Method).
- **Selection Support**: Explicitly includes any code highlighted by the user.
- **Artifact Content**: Formatted `task.md` and `implementation_plan.md` content.
- **Open Files**: List of all open tabs for workspace overview.

### 6️⃣ Commission Agent (Progress: "Creating Jules Session...")
- Calls Jules API: `POST https://jules.googleapis.com/v1alpha/sessions`
- Payload includes the context-rich prompt and repository details.

### 7️⃣ Provide Feedback
- Shows success notification with session name and link to dashboard.

## Module Overview

```
┌─────────────────────────────────────────────────────────────┐
|                      extension.ts                            |
|                  (Main Entry Point)                          |
|  - Command & Menu registration                               |
|  - window.withProgress orchestration                         |
└─────────────────────────────────────────────────────────────┘
                           |
        ┌──────────────────┼──────────────────┬─────────────┐
        │                  │                  │             │
        ▼                  ▼                  ▼             ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
| gitContext.ts|  |promptGenera- |  | julesClient  |  | secrets.ts   |
| - Git detection|  | tor.ts       |  | .ts          |  | - Security   |
| - WIP branches |  | - Prompt gen |  | - Jules API  |  └──────────────┘
└──────────────┘  | - Selection  |  └──────────────┘         |
                  └──────────────┘                           ▼
                           |                      ┌──────────────────┐
                           ▼                      |  geminiClient.ts |
                  ┌────────────────┐              | - Gemini 3 Flash |
                  |  Validators.ts |              | - Smart Briefing |
                  └────────────────┘              └──────────────────┘
```

## Artifact File Discovery

The extension reads Antigravity agent artifacts from:
```
~/.gemini/antigravity/brain/
  ├── <conversation-id-1>/
  │   ├── task.md                    # Current task checklist
  │   ├── implementation_plan.md     # Implementation plan
  │   └── ...
  ├── <conversation-id-2>/
  │   ├── task.md
  │   ├── implementation_plan.md
  │   └── ...
  └── ...
```

These artifacts are:
1. **Detected**: By checking file paths containing `/.gemini/antigravity/brain/`
2. **Read**: If open in VS Code tabs or found in selected conversation directory
3. **Formatted**: With headers like `--- CURRENT TASK CHECKLIST ---`
4. **Included**: In the prompt sent to Jules
