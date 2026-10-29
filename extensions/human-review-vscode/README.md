# Human Review

Renders `.review/review.json` (written by the `human-review` Claude Code skill) as a review panel:
three columns you click through: goal and steps | the open step and its flows | the open flow (why, diagram, key code links, decisions). Under the steps: Check (untested logic, decisions, questions) and Details (service map, backend, frontend, data models, files).

- Every file has **file** (opens at the lines) and **diff** (native VS Code diff, merge base vs your working tree) links.
- Keys: ↑ ↓ within a column, → open the next column, ← or Esc back. Narrow tab: last 2 columns plus a breadcrumb. The panel remembers where you were.
- Activity bar icon: sidebar with title, steps, files reviewed, questions; opening it opens the panel.
- Every file node in a diagram shows its own **file** and **diff** links.
- Tick files as reviewed (Details → Files); progress shows in the header, sidebar and status bar, saved per branch.
- Panel refreshes when the skill rewrites the JSON.

Commands: `Human Review: Open`, `Human Review: Clear reviewed marks`.

Skill: copy `skill/human-review/` into `~/.claude/skills/` (or your repo's `.claude/skills/`).
