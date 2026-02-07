#!/bin/bash
set -e

echo "🚀 Starting automated deployment..."

# 1. Compile the project
echo "📦 Compiling..."
npm run compile

# 2. Package into VSIX
echo "🎁 Packaging VSIX..."
# We use --no-dependencies to skip the slow npm audit/install check
npx @vscode/vsce package --no-dependencies -o jules-bridge-latest.vsix

# 3. Install to Antigravity
echo "🔌 Installing to Antigravity..."
/usr/bin/antigravity --install-extension jules-bridge-latest.vsix --force

echo "✅ Deployment complete! Please reload Antigravity to see the changes."
