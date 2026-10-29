# skills

My Claude Code skills, plus the tools that go with them.

| Path | What |
|---|---|
| `skills/human-review/` | Claude Code skill. Explains a branch or PR so a human can review agent-written code fast. Writes `.review/review.json`. |
| `extensions/human-review-vscode/` | VS Code extension. Renders `review.json` as clickable columns (goal, step, flow), with diagrams and one-click file and diff links. Activity bar icon included. |

## human-review

What you get for a change, in three columns you click through, from high level to low level:

1. **Goal**: the outcome the change is for, whether it matches what you asked, and the steps in build order, like a PR stack.
2. **Step**: one thing you could check by hand in the app, why it exists, and which steps it builds on. Its flows are listed below it.
3. **Flow**: why it exists, a diagram where every file shows its job, the key code as file links with a one-line explanation, and the **decisions** the agent made that you did not ask for (chose / instead / why).

Under the steps:
- **Check**: untested logic, every decision, open questions. Each item opens its flow.
- **Details**: service map, full backend flow with sequence diagrams and side effects, frontend UI and state, data models with a reason per field, files.

All text is short and plain. Terms are in [GLOSSARY.md](GLOSSARY.md).

Every file in tables and diagram nodes has **file** (opens at the lines) and **diff** (VS Code diff, merge base vs your working tree) links. Tick files as reviewed; progress is saved per branch.

### Install

**1. Skill (Claude Code)**

Windows (PowerShell):
```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\skills\human-review" | Out-Null
Copy-Item skills\human-review\SKILL.md "$env:USERPROFILE\.claude\skills\human-review\"
```
macOS / Linux:
```bash
mkdir -p ~/.claude/skills/human-review && cp skills/human-review/SKILL.md ~/.claude/skills/human-review/
```
Or per repo: copy into that repo's `.claude/skills/human-review/`.

**2. Extension (VS Code)**

Build it (needs Node 18+):
```bash
cd extensions/human-review-vscode
npm install
npm run vscode:prepublish
npx vsce package --allow-missing-repository
code --install-extension human-review-*.vsix
```
Restart VS Code after install. On Windows, if `code` is not found: in VS Code run `Shell Command: Install 'code' command in PATH`, or use `%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd`.

### Use

1. Check out the branch you want to review.
2. In Claude Code: `run human-review on this branch` (base defaults to `main`; say `against develop` to change it).
3. The skill writes `.review/review.json` and adds `.review/` to `.gitignore`.
4. In VS Code: click the **Human Review** icon in the activity bar, **Review 0/N** in the status bar, or run `Human Review: Open`.
5. Click a step, then a flow. Keys: ↑ ↓ move within a column, → opens the next column, ← or Esc goes back. On a narrow tab only the last 2 columns show, with a breadcrumb. Re-running the skill refreshes the panel.

Commands: `Human Review: Open`, `Human Review: Clear reviewed marks`.

Try it without a real change: open `extensions/human-review-vscode/sample/` as a workspace folder (it contains a sample `.review/review.json`). Links will not resolve since the sample files are not there, but the columns and diagrams render.

### How it fits together

```
Claude Code + skill  --writes-->  .review/review.json  --read by-->  VS Code extension
```

The JSON schema lives in `extensions/human-review-vscode/src/schema.ts` and is copied into the bottom of `SKILL.md`. Change both together.

### Limits

- Diffs compare against the merge base, using VS Code's built-in Git extension.
- Diagram node links need the skill to fill `nodes` and quote node labels.
- Tested by compiling, parsing every diagram (`npm run check`), and simulating the webview. Not yet tested by hand in every VS Code theme.

### Develop

See [CLAUDE.md](CLAUDE.md) for layout, build commands, and what to keep in sync.
