# HumanCode

The AI coding agent that works with you.

AI agents generate billions of lines of code every day. Humans ship faster, but at a cost: ownership. HumanCode gives you multiple agent modes, from pair programming to autonomous coding, so you stay in control.

## Usage

```bash
humancode
```

Press `Tab` to switch between agent modes.

## Agent Modes

HumanCode automatically selects the best mode for your prompt, or you can switch manually with `Tab`.

### Pair

Pair programming partner. Suggests approaches and explains trade-offs but never writes code. Asks guiding questions to develop your thinking and reviews code you write. Best for learning, understanding existing code, and exploring design decisions.

### Debug

Writes code one step at a time and walks you through each change using the debugger. Sets breakpoints, pauses for comprehension questions, and only moves on when you understand. Best for complex refactors, risky changes, and untested code.

### Vibe

Multi-task manager. Parses your prompt into discrete tasks, executes them sequentially with self-review after each one, and presents organized results. Best for requests with multiple distinct tasks or new features spanning several files.

### Claw

Fully autonomous agent. Takes a single prompt, plans, executes, self-reviews against quality standards, writes tests, and commits — all without human checkpoints. Runs in an isolated git worktree for safety. Best for straightforward, well-scoped mechanical tasks.

### Adaptive

Dynamically transitions between modes based on task complexity. Escalates to Debug when things get risky (consecutive test failures, cross-package changes) and de-escalates to Claw when work becomes routine. Selected by default when the assessor isn't confident about which mode fits best.

Demo: 

## Install

### macOS / Linux

```bash
npm i -g humancode
brew install humancode
```

### Windows

```powershell
npm i -g humancode
```

Or download the installer from [GitHub Releases](https://github.com/devinat1/humancode/releases) (`HumanCode-Setup-x64.exe`).

You can also install via [Scoop](https://scoop.sh) or [Chocolatey](https://chocolatey.org):

```powershell
scoop install humancode
choco install humancode
```

## License

MIT
