# Human Review

Renders `.review/review.json` (written by the `human-review` Claude Code skill) as a review panel:
start here, service map, backend flow (routes to DB), frontend UI and state, data models with a 4 word why per field, tests, open questions.

- Every file has **file** (opens at the lines) and **diff** (native VS Code diff, merge base vs your working tree) links.
- Left menu, one view at a time: Start here, Service map, each backend's Flow / walkthroughs / Side effects / Files, each frontend's UI / Functions / State / Imports / Files, each data model, Tests, Open questions. `j` / `k` move next / previous; the panel remembers where you were.
- Every file node in a diagram shows its own **file** and **diff** links.
- Tick files as reviewed; progress shows in the status bar, saved per branch.
- Panel refreshes when the skill rewrites the JSON.

Commands: `Human Review: Open`, `Human Review: Clear reviewed marks`.

Skill: copy `skill/human-review/` into `~/.claude/skills/` (or your repo's `.claude/skills/`).
