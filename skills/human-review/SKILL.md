---
name: human-review
description: Build a visual review of a change so a human can understand it fast. Use when asked to review, explain, or walk through a diff, branch, or PR. Writes .review/review.json for the Human Review VS Code extension (service map, backend routes to DB flow, frontend UI/state, data models with a short reason per field, open questions).
---

# Human Review

Goal: make the human understand the change, not grade it. Assume an agent wrote the code and the human has not read it yet.

Output: `.review/review.json` in the repo root, matching the schema at the bottom. The Human Review VS Code extension renders it and turns every path into clickable file and diff links. Only build an HTML artifact instead if the user asks for one (e.g. reviewing on phone).

Writing rule for every string: clarity over grammar. Fragments fine. Short labels. No filler.

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
- `readFirst`: 3 to 5 `logic` files where real behavior lives, ranked, with line range and one line why.

**serviceMap**: `flowchart LR`, one node per changed service plus DBs/caches, labeled edges.

**backend** (one per backend service)
- Flow diagram shape: `flowchart LR`, one `subgraph` per column, strict outside to inside: `Routes / triggers` (routes as `METHOD /path`, cron, queue consumers) -> `Guards / pipes` -> `Services` -> `Repos / models` -> `Data / outside` (tables, Redis keys, queues, WebSocket, external APIs). Arrow = importer -> imported, labeled WHY.
- `flows`: split into small diagrams, one per flow (a route or a few routes of one feature, a job, a consumer), each in the shape above, max ~12 nodes. Title = short feature name, e.g. `snooze`, `cron wake`.
- `flow`: then the overview, `flowchart LR`, one node per flow (label = title + its routes), edges = what two flows share (`both write tickets`, `snooze sets snoozedUntil, wake reads it`, `same TicketsService`). Only 1 flow, or under ~12 nodes total: skip `flows`, put the full diagram in `flow`.
- `routes`, `sideEffects` (every DB write, cache set/del, event, outbound call), `beforeAfter` for changed behavior.
- `walkthroughs`: `sequenceDiagram` per new/changed route and per background job, with `alt` blocks for error paths (auth, validation, not found, conflict, job failure). Note things like "runs on every instance".

**frontend** (one per frontend service; Angular 14 = state in services with BehaviorSubject, NgRx if present, component fields, reactive forms)
- `ui.tree`: `flowchart TD` of changed components only; `ui.changes`: what the user sees differently.
- `functions`: created/changed, one line each.
- `state.flow`: `flowchart LR` `user action -> method -> state -> components reading it`. `state.notes`: shape before vs after, subscriptions added and how they are cleaned up.
- `apiCalls`, `imports` (labeled WHY edges).

**tests**: one row per changed logic unit. No covering test: omit `test`. `errorPath`: what error paths are tested.

**questions**: everything `unclear: check`, `no usage found`, intent mismatches, and decisions the agent made that the intent did not specify (defaults, limits, concurrency, timezones, error handling). One title + one line + `ref`. Questions, not fixes.

## 5. Diagram rules

- Every arrow labeled. Mermaid ids: letters/digits only.
- Changed/added/unchanged via classDefs, always include these three:
  `classDef chg fill:#dbe4ff,stroke:#2b59c3,color:#10204a`
  `classDef add fill:#d9f2e3,stroke:#1f7a46,color:#0f3320`
  `classDef same fill:#eef0f4,stroke:#9aa3b5,color:#3a4152`
- No `click` lines. Instead fill `nodes`: node id -> FileRef, for EVERY node that is a file (or a route/table that lives in one file). The extension adds a "file · diff" line under each mapped node: file opens it at the lines, diff opens base vs working tree.
- Always quote labels: `TS["TicketsService"]`, `DB[("tickets")]`. Use `<br/>` for line breaks.

## 6. Finish

- Write `.review/review.json`. Make sure `.review/` is in `.gitignore` (add it if missing).
- Validate: parse the JSON, check every `path` exists in the repo (or is a deleted file), every model field has a `why`.
- Reply with one line: what the change is, plus "open Human Review in VS Code".

## Rules

- Explain, do not judge. No fix suggestions unless asked.
- Huge diff (over ~60 files after noise): ask which services to cover, or do start + serviceMap + the 3 most changed services.

## Schema

```ts
type Status = 'added' | 'changed' | 'removed' | 'same';
type Tag = 'logic' | 'glue' | 'types' | 'test' | 'config';
interface FileRef { path: string; startLine?: number; endLine?: number }   // repo relative, 1-based
interface Diagram { mermaid: string; nodes?: Record<string, FileRef> }

interface Review {
  version: 1; title: string;
  base: string; baseSha: string; head: string; headSha: string;
  pr?: { number: number; url: string };
  start: {
    what: string; why: string;
    intent: { matches: boolean; extra: string[]; missing: string[] };
    readFirst: { ref: FileRef; why: string }[];
    size: { files: number; additions: number; deletions: number };
  };
  services: { name: string; path: string; kind: 'backend'|'frontend'|'types'|'infra'|'other'; changed: string }[];
  serviceMap: Diagram;
  backend: {
    service: string; flow: Diagram;   // overview when flows given
    flows?: { title: string; diagram: Diagram }[];
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
