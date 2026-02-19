# HumanCode

The AI coding agent that writes code with you, not for you.

Source code: https://github.com/devinat1/humancode
Agentic debugger MCP server: https://github.com/devinat1/debugger-mcp-server
Agentic debugger vscode/cursor extension: https://open-vsx.org/extension/devinat1/agentic-debugger

Have you ever shipped a feature without fully understanding it? Have you ever felt lost when working on a feature? Agents such as Claude Code, Codex, Cursor, etc. generate billions of lines of code every day. Humans are able to ship much faster thanks to these agents. However, this speed comes at a cost: ownership. Humancode enables interactively debugging the changes made, one step at a time, and uses the socratic method to question you about each change it made.

Demo: https://www.youtube.com/watch?v=RB2JR6vfrWY

## Install

```bash
npm i -g humancode
brew install humancode
```

## Usage

```bash
humancode
```

## Debug Mode

HumanCode includes a debug agent that writes code one step at a time and walks you through each step with the VS Code debugger. Set breakpoints, inspect variables, and step through execution to understand exactly what changed and why. Switch to it with `Tab`.

Requires VS Code or Cursor to be open with the [Agentic Debugger](https://open-vsx.org/extension/devinat1/agentic-debugger) extension installed.

## License

MIT
