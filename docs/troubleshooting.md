# Troubleshooting

## Common Issues

### "This extension requires the Antigravity IDE"
**Cause**: The extension detected that it's running in regular VS Code instead of Antigravity IDE.
**Solution**:
1. Download and install [Antigravity IDE](https://deepmind.google/technologies/antigravity/)
2. Open your project in Antigravity IDE instead of VS Code
3. The extension will automatically activate in Antigravity

**Why?** This extension relies on Antigravity-specific features:
- Access to `~/.gemini/antigravity/brain/` conversation artifacts
- Antigravity agent context and infrastructure
- Integration with Antigravity's task management system

### "Open a file in a Git repository to use Jules"
**Cause**: No Git repository detected in the workspace.
**Solution**: Open a folder that contains a `.git` directory.

### "Jules does not have access to owner/repo"
**Cause**: The repository is not initialized in Jules.
**Solution**:
1. Visit [Jules Repository Settings](https://jules.google.com/settings/repositories)
2. Install and configure the Jules GitHub App for your repository
3. Grant necessary permissions

### "API Error 401: Unauthorized"
**Cause**: Invalid or missing API key.
**Solution**:
1. Run `Jules Bridge: Set Jules API Key` command
2. Enter a valid API key from [Jules Settings](https://jules.google.com/settings)
3. Verify your Google Cloud Project has Jules API enabled

### "No remote configured for this repository"
**Cause**: The Git repository doesn't have a remote named "origin".
**Solution**:
```bash
git remote add origin git@github.com:username/repo.git
# or
git remote add origin https://github.com/username/repo.git
```

### "Gemini 3 Flash Preview is drafting..." takes too long or fails
**Cause**: Network issues or API quota limits on your Gemini/Jules API key.
**Solution**:
- Check your internet connection.
- If it fails, the extension will automatically fall back to a manual placeholder or artifact-based task. You can still proceed without the AI summary.

### Unit tests fail with "Attempted to wrap getExtension which is already stubbed"
**Cause**: This happens when running `npm run test:unit` due to Sinon conflicts in the global Node environment.
**Solution**:
- Ensure you are using the latest `src/test/unit-tests-runner.ts`.
- If the issue persists, run the full integration tests in Antigravity using `npm test`.

### Git push fails in WSL
**Cause**: Path conversion issues or credential manager missing in WSL.
**Solution**:
- Ensure your Git credentials are configured in the WSL environment.
- The extension uses a "batch staging" strategy to be more reliable in WSL environments.

### Auto-generated prompt is too generic
**Cause**: Not enough context available (no uncommitted changes, artifacts not open, etc.).
**Solution**:
- Make some uncommitted changes to provide diff context.
- **Highlight code**: Select a specific block of code before clicking "Send to Jules" to provide targeted context.
- Open relevant `task.md` or `implementation_plan.md` files from `~/.gemini/antigravity/brain/`.
- Position cursor in the code you're working on.

### Conversation context picker is empty
**Cause**: No Antigravity agent conversations found in `~/.gemini/antigravity/brain/`.
**Solution**: This is expected if you haven't used Antigravity agent before. The extension will still work but won't have artifact context.
