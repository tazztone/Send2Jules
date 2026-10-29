# Antigravity Jules Bridge [DEPRECATED]

> [!WARNING]
> **DEPRECATION NOTICE: Jules Wind-Down**
> As part of Google's unification of agentic coding efforts into [Google Antigravity](https://deepmind.google/technologies/antigravity/), Google Jules is winding down:
> - **November 11, 2026**: Jules transitions to read-only mode (finish existing sessions).
> - **December 31, 2026**: Jules winds down permanently and will no longer be included in Google AI plans.
>
> This extension and repository are **deprecated**. We recommend running workflows directly in Google Antigravity, which supports long-running agents, multi-agent parallel execution, and scheduled tasks.

> [!IMPORTANT]
> **Antigravity IDE Required**: This extension was designed exclusively for the [Antigravity IDE](https://antigravity.google/) and will not function in regular VS Code.

A VS Code extension that enables seamless handoff of development work to the [Jules autonomous agent](https://jules.google.com). This extension intelligently captures your current workspace context—including uncommitted changes, open files, cursor position, and Antigravity conversation artifacts—to provide Jules with rich context for continuing your work.

## ✨ Features

- **🚀 One-Click Handoff**: Instantly send your work to Jules via Status Bar or Context Menu.
- **✨ AI-Driven Drafting**: Uses **Gemini 3 Flash Preview** to automatically summarize your changes into a mission brief.
- **📝 Intelligent Context**: Captures git diffs, cursor position, code selections, and open files.
- **🔄 Automatic Git Sync**: Handles WIP commits and branches automatically with real-time progress.
- **🗂️ Conversation Awareness**: Integrates with Antigravity agent conversation artifacts.
- **🔒 Secure**: API keys stored safely in OS keychain.

## 📚 Documentation

Detailed documentation is available in the `docs/` directory:

- [**Installation & Setup**](docs/setup.md): Prerequisites, installation, and configuration.
- [**Usage Guide**](docs/usage.md): How to use the extension and its features.
- [**Troubleshooting**](docs/troubleshooting.md): Common issues and solutions.
- [**Architecture**](docs/architecture.md): How it works under the hood.
- [**Security**](docs/security.md): Privacy and security details.

## 🔗 Quick Links

- [Jules Dashboard](https://jules.google.com)
- [Jules API Documentation](https://jules.google.com/docs)
- [Google Antigravity](https://deepmind.google/technologies/antigravity/)

## 📄 License

Apache License 2.0

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.
