# skills

My Claude Code skills, plus the tools that go with them.

| Path | What |
|---|---|
| `skills/human-review/` | Claude Code skill. Explains a branch or PR so a human can review agent-written code fast. Writes `.review/review.json`. |
| `extensions/human-review-vscode/` | VS Code extension. Renders `review.json` with a menu, diagrams, and one-click file and diff links. |

## human-review

What you get for a change:

- **Start here**: what, why, does it match the intent, which 3 to 5 files to read first
- **Service map**: changed services and how they relate
- **Backend flow**: routes on the left, DB on the right, every arrow labeled with why one file imports another
- **Walkthroughs**: sequence diagram per route and background job, with error paths
- **Side effects**: every DB write, cache change, event, outbound call
- **Frontend**: UI changes, functions, state flow, imports
- **Data models**: every field with a 4 word reason it exists; `no usage found` is flagged
- **Tests**: which changed logic has a test and which does not
- **Open questions**: things the agent decided that you did not ask for

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
4. In VS Code: click **Review 0/N** in the status bar, or run `Human Review: Open`.
5. Use the left menu, or `j` / `k` to go to the next / previous view. Re-running the skill refreshes the panel.

Commands: `Human Review: Open`, `Human Review: Clear reviewed marks`.

Try it without a real change: open `extensions/human-review-vscode/sample/` as a workspace folder (it contains a sample `.review/review.json`). Links will not resolve since the sample files are not there, but the menu and diagrams render.

### How it fits together

```
Claude Code + skill  --writes-->  .review/review.json  --read by-->  VS Code extension
```

The JSON schema lives in `extensions/human-review-vscode/src/schema.ts` and is copied into the bottom of `SKILL.md`. Change both together.

### Limits

- Diffs compare against the merge base, using VS Code's built-in Git extension.
- Diagram node links need the skill to fill `nodes` and quote node labels.
- Tested by compiling, parsing every diagram, and simulating the webview. Not yet tested by hand in every VS Code theme.
