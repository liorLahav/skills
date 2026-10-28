# CLAUDE.md

Claude Code skills plus the tools that render their output. See README.md for what each one does and how to use it.

## Layout

- `skills/<name>/SKILL.md`: the skill itself. One file per skill.
- `extensions/human-review-vscode/`: VS Code extension that renders `.review/review.json` written by the `human-review` skill.
  - `src/schema.ts`: the JSON contract. `src/render.ts`: builds the webview HTML (menu, views, Mermaid, file/diff links). `src/extension.ts`: panel, status bar, file/diff commands, reviewed marks.
  - `sample/.review/review.json`: sample review, used by `npm run check` and for trying the panel.
  - `scripts/check.mjs`: parses every Mermaid diagram in a review.json and renders the panel HTML.

## The contract (keep in sync)

The review.json shape lives in 3 places. Change them together:
1. `extensions/human-review-vscode/src/schema.ts`
2. the `## Schema` block at the bottom of `skills/human-review/SKILL.md`
3. `extensions/human-review-vscode/sample/.review/review.json`

New fields should be optional, so review.json files written by older skill versions still render.

## Commands (in `extensions/human-review-vscode/`)

```bash
npm install
npm run compile                     # tsc -> out/
npm run check                       # sample; or: npm run check -- path/to/review.json
npm run vscode:prepublish && npx vsce package --allow-missing-repository
code --install-extension human-review-<version>.vsix --force
```

Bump `version` in `package.json` for every change you install, then run `npm install` so `package-lock.json` matches.
Installed skill copy: `~/.claude/skills/human-review/SKILL.md`. Copy it again after editing the skill.

## Gotchas

- Mermaid cannot size hidden elements: diagrams render only when their view is first shown (`renderDiagrams` in render.ts).
- Diagrams render at natural size (`useMaxWidth:false`); `.dg` scrolls. Do not let them shrink to fit, text gets unreadable.
- Node file/diff links: render.ts adds a `[ file ] [ diff ]` placeholder line to mapped node labels, the webview swaps it for real links. Only for flowcharts, only for ids in `nodes`.
- Webview CSP: scripts need the nonce. No external URLs; Mermaid is copied into `media/` by `scripts/copy-mermaid.js`.
- Mermaid's parser needs a DOM in Node: `check.mjs` sets up jsdom globals.
- Story core snippets are not stored in review.json: `extension.ts` reads the lines from the working tree on each render (`snippetPaths` in render.ts). Line ranges can drift if the file changes after the review was written.
