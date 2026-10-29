---
name: human-review
description: Build a visual review of a change so a human can understand it fast. Use when asked to review, explain, or walk through a diff, branch, or PR. Writes .review/review.json for the Human Review VS Code extension (goal -> steps in build order -> flows, each with why, key code links and decisions; service map, backend routes to DB flow, frontend UI/state, data models with a short reason per field, open questions).
---

# Human Review

Goal: make the human understand the change, not grade it. Assume an agent wrote the code and the human has not read it yet.

Output: `.review/review.json` in the repo root, matching the schema at the bottom. The Human Review VS Code extension renders it and turns every path into clickable file and diff links. Only build an HTML artifact instead if the user asks for one (e.g. reviewing on phone).

Writing rule for every string: short and plain. Everyday words a reviewer new to this code gets on first read. No code names inside an explanation (they go in titles and links). A term the reader would have to look up: say what it is, in a few words, the first time (`Clerk, the sign-in service`). No filler. Basic dev terms (token, route, header, cache) are fine; compressed phrases are not: no noun lists (`sign-in, approval gate, then token`), no `X, else Y`. Write a short sentence with a verb.
- Bad: `role check, else waiting message`. Good: `Shows the console only to approved salesmen. Everyone else sees: waiting for approval.`
- Bad: `onRequest after Clerk hook`. Good: `then checks the salesman role`.
- Bad: `hookName onRequest | instead: preHandler; 400 before 401`. Good: chose `check sign-in as soon as a request arrives`, instead `Clerk's default, checks later`, why `else bad input answers before "not signed in"`.

## 1. Collect the change

- Base: user given, else `main` (fall back to `master`). `baseSha = git merge-base HEAD <base>`, `headSha = git rev-parse HEAD`, `head = git branch --show-current`.
- `git diff --name-status <baseSha>` for files, `git diff --numstat <baseSha>` for size, `git diff <baseSha>` for content. Includes uncommitted work.
- Intent: PR description (`gh pr view --json title,body,url,number`, skip if none), commit messages, any task/spec file the agent worked from.
- Noise (lock files, generated code, snapshots, build output) goes only in `skipped`, never in diagrams or `files`.
- Group files by service: `apps/*`, `packages/*`, `libs/*`, `services/*`, or repo root.
- Service kind: `backend`, `frontend`, `types`, `infra`, `other`, from package.json deps and contents.
- File tag: `logic`, `glue` (wiring, module registration, re-exports, templates), `types`, `test`, `config`.

## 2. Find relations

Between services: package.json deps, tsconfig paths, HTTP clients and base URLs, shared DTO imports, queues/events. Labels like `types for api`, `frontend for api`, `calls api via HTTP`, `pushes ticket.woke via WebSocket`.

Between files: for every changed file, find every importer (relative paths, tsconfig aliases, package name). Read the usage, label the edge with WHY in max 5 words:
- `types only: <TypeName>`, `calls <fnName>`, `injects <Service>`, `registers <X>`, `extends <Base>`, `uses enum <Name>`, `renders <selector>`.
Never a bare `imports`. Unclear after reading: `unclear: check` (also add to questions).
More than 8 importers: show 8, collapse rest into `+N more (mostly types)`.

## 3. Data models

Every touched model: Postgres entities and migrations, Mongo schemas, Redis keys (pattern, value, TTL, invalidation), DTOs, validation schemas, GraphQL types, shared interfaces, frontend store state, form models.
List EVERY field, with `status` and `why`: max 4 plain words, from real usage (grep it). `createdAt` -> `sort by newest`, `tenantId` -> `isolate customer data`.
No usage found: `why: "no usage found"` and add a question.
Migration: put in the model's `note`: what it adds, defaults, whether existing rows are affected or the table is rewritten.

## 4. Fill the sections

Read the code. Never guess from file names.

**start**
- `what`, `why`: one line each.
- `intent`: `extra` = what the diff does that the intent did not ask; `missing` = asked, not done.
- `readFirst`: 2 to 3 steps to start with, ranked, as `step` (1-based) + one line why: `only code that changes tickets without a user`. No story (tiny diff): 3 to 5 `logic` files as `ref` with line range.

**serviceMap**: `flowchart LR`, one node per changed service plus DBs/caches, labeled edges.

**story**: the main part. The change from high level to low level, cut like a PR stack. Each level is why the level below exists: the reader goes down for how, up for why.
- `goal`: one line, the outcome the change is for, from the intent. Not a feature list.
- `steps`: 2 to 7, in build order, like stacked PRs. A step = one thing you could check by hand in the app (`Agent can snooze a ticket`, `Snoozed tickets come back when due`), no code names. Groundwork several steps need (columns, migrations, shared types) is its own first step. Over 7: ask which part to cover.
  - `why`: why the step is in the change at all, NOT what it does. Which part of the goal it serves and what is broken without it (`without it snoozed tickets never come back`), or which later steps need it (`steps 2 to 4 store and read this`). From the intent, PR body, commits.
  - `summary`: the line on the step's card: what it does, under ~10 plain words, a full short sentence: `Server turns away anyone not approved.` Not the why.
  - `needs`: earlier step numbers it builds on. `asked`: false when the intent did not ask for it (`why`: `not asked: <likely reason>`, add a question).
- `flows` per step: each entry point that delivers it: route (`PATCH /tickets/:id/snooze`), job (`cron every 1 min`), consumer, UI action (`Snooze button`), migration. The flow is the lowest level; files only appear inside its diagram.
  - `summary`: the line on the flow's card, under ~10 plain words: `Sign-in page, waiting screen, then the console.`
  - `why`: one plain sentence, which part of the step it delivers: `Signs the salesman in, waits for approval, then sends proof of sign-in on every server call.`
  - `diagram`: `flowchart TD`, top to bottom in the order things happen (it sits in a narrow column; no column subgraphs), only this flow's files, max ~10 nodes. Every file node label = code name, then one or two short plain sentences on what it does in THIS flow (about 15 words max): `TS["TicketsService<br/>Finds tickets that are due, clears their snooze, and tells the inbox."]`. Every arrow = what happens next, plain, max 6 words: `then checks the role`, not a hook or function name. Fill `nodes` for every file node (the panel uses them to link steps that share a file).
  - `core` (shown as Key code): 1 to 3 places where the real logic of this flow lives, as `ref` with exact `startLine`/`endLine`. The panel shows only the file name and lines with file/diff links, not the code. `explain`: one short plain line, what happens there: `finds due tickets, clears them in one update`.
  - `decisions`: choices the intent did not ask for: defaults, limits, timing, concurrency, error handling, timezones. Also where the agent wrote its own way and the repo already has one (grep before claiming). Three short plain parts, max ~10 words each: `chose` `polls every minute`; `instead` `a delayed job per ticket`; `why` `simpler, but up to 1 min late`. Pattern break: `chose` `own date math`; `instead` `the repo's date-fns helpers`; `why` (the agent's likely reason, or `no reason found`). `ref` where it happens.
- Every changed `logic`/`types` file must be a node in at least one flow. A file that fits no step is a missing step (often `asked: false`).

**Backend diagram shape** (only for `backend.flow` in Details; story flows are top to bottom, see above): `flowchart LR`, one `subgraph` per column, strict outside to inside: `Routes / triggers` (routes as `METHOD /path`, cron, queue consumers) -> `Guards / pipes` -> `Services` -> `Repos / models` -> `Data / outside` (tables, Redis keys, queues, WebSocket, external APIs). Arrow = importer -> imported, labeled WHY. Frontend flows: `UI action -> component -> store/service -> API call`.
Columns only fit a flow that enters at a route/trigger and ends at data. Prompt, docs or config changes, or a flow that starts outside (an external system's event or failure, `calendar read failed`): no column subgraphs; draw what happens in order, left to right, first event leftmost. Never let arrows run right to left; if they would, the columns are wrong for this flow.

**backend** (one per backend service, reference for the whole picture)
- `flow`: the full diagram of all changed routes to data, backend diagram shape.
- `routes`, `sideEffects` (every DB write, cache set/del, event, outbound call), `beforeAfter` for changed behavior.
- `walkthroughs`: `sequenceDiagram` per new/changed route and per background job, with `alt` blocks for error paths (auth, validation, not found, conflict, job failure). Note things like "runs on every instance".

**frontend** (one per frontend service; Angular 14 = state in services with BehaviorSubject, NgRx if present, component fields, reactive forms)
- `ui.tree`: `flowchart TD` of changed components only; `ui.changes`: what the user sees differently.
- `functions`: created/changed, one line each.
- `state.flow`: `flowchart LR` `user action -> method -> state -> components reading it`. `state.notes`: shape before vs after, subscriptions added and how they are cleaned up.
- `apiCalls`, `imports` (labeled WHY edges).

**tests**: one row per changed logic unit. No covering test: omit `test`. `errorPath`: what error paths are tested.

**questions**: everything `unclear: check`, `no usage found`, intent mismatches, `asked: false` steps. Agent decisions go in the flow's `decisions`, not here. One title + one line + `ref`. Questions, not fixes.

## 5. Diagram rules

- Every arrow labeled. Mermaid ids: letters/digits only.
- Arrows point the way things happen: first thing left (or top). Read each diagram's source once, first node to last, before writing it; a valid JSON is not a readable diagram.
- Changed/added/unchanged via classDefs, always include these three:
  `classDef chg fill:#dbe4ff,stroke:#2b59c3,color:#10204a`
  `classDef add fill:#d9f2e3,stroke:#1f7a46,color:#0f3320`
  `classDef same fill:#eef0f4,stroke:#9aa3b5,color:#3a4152`
- No `click` lines. Instead fill `nodes`: node id -> FileRef, for EVERY node that is a file (or a route/table that lives in one file). The extension adds a "file · diff" line under each mapped node: file opens it at the lines, diff opens base vs working tree.
- Always quote labels: `TS["TicketsService"]`, `DB[("tickets")]`. Use `<br/>` for line breaks.

## 6. Finish

- Write `.review/review.json`. Make sure `.review/` is in `.gitignore` (add it if missing).
- Validate: parse the JSON, check every `path` exists in the repo (or is a deleted file), every model field has a `why`, every `core` ref has `startLine`/`endLine` that cover the logic it explains, every decision has `chose`, `instead` and `why`, `needs` only point to earlier steps, every changed logic/types file is a node in some flow.
- Reply with one line: what the change is, plus "open Human Review in VS Code".

## Rules

- Explain, do not judge. No fix suggestions unless asked.
- Huge diff (over ~60 files after noise): ask which services to cover, or do start + serviceMap + story + the 3 most changed services.

## Schema

```ts
type Status = 'added' | 'changed' | 'removed' | 'same';
type Tag = 'logic' | 'glue' | 'types' | 'test' | 'config';
interface FileRef { path: string; startLine?: number; endLine?: number }   // repo relative, 1-based
interface Diagram { mermaid: string; nodes?: Record<string, FileRef> }
interface Flow {
  title: string; summary: string; why: string; diagram?: Diagram;
  core: { ref: FileRef; explain: string }[];   // key code: refs only
  decisions: { chose: string; instead: string; why: string; ref?: FileRef }[];   // includes pattern breaks
}

interface Review {
  version: 1; title: string;
  base: string; baseSha: string; head: string; headSha: string;
  pr?: { number: number; url: string };
  start: {
    what: string; why: string;
    intent: { matches: boolean; extra: string[]; missing: string[] };
    readFirst: { step?: number; ref?: FileRef; why: string }[];   // step with story, else ref
    size: { files: number; additions: number; deletions: number };
  };
  story?: {
    goal: string;
    steps: { title: string; summary: string; why: string; needs: number[]; asked: boolean; flows: Flow[] }[];
  };
  services: { name: string; path: string; kind: 'backend'|'frontend'|'types'|'infra'|'other'; changed: string }[];
  serviceMap: Diagram;
  backend: {
    service: string; flow: Diagram;
    routes: { route: string; status: Status; purpose: string; auth: string }[];
    walkthroughs: { title: string; diagram: Diagram }[];
    sideEffects: { what: string; where: string; when: string }[];
    beforeAfter: { subject: string; before: string; after: string }[];
  }[];
  frontend: {
    service: string;
    ui: { tree: Diagram; changes: { component: string; change: string }[] };
    functions: { name: string; where: string; ref?: FileRef; does: string }[];
    state: { flow: Diagram; notes: string[] };
    apiCalls: string[]; imports: Diagram;
  }[];
  models: {
    name: string; kind: string; ref?: FileRef; diagram?: Diagram;
    fields: { name: string; type: string; status: Status; why: string; ref?: FileRef }[];
    note?: string;
  }[];
  tests: { logic: string; test?: { name: string; ref: FileRef }; errorPath: string }[];
  questions: { title: string; detail: string; ref?: FileRef }[];
  files: { path: string; service: string; status: Status; tag: Tag; what: string }[];
  skipped: string[];
}
```
