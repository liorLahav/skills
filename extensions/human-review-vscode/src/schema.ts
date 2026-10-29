// Contract between the human-review skill (writes .review/review.json) and this extension (renders it).
// Keep in sync with the schema block in SKILL.md.

export type Status = 'added' | 'changed' | 'removed' | 'same';
export type Tag = 'logic' | 'glue' | 'types' | 'test' | 'config';
export type ServiceKind = 'backend' | 'frontend' | 'types' | 'infra' | 'other';

/** Repo-relative path, optional 1-based line range. */
export interface FileRef {
  path: string;
  startLine?: number;
  endLine?: number;
}

/** Mermaid source plus which node ids open which file. The extension adds the click handlers. */
export interface Diagram {
  mermaid: string;
  nodes?: Record<string, FileRef>;
}

/** Lowest level of the story. Files only appear as diagram nodes, labeled with their job in this flow. */
export interface Flow {
  title: string;             // entry point: "PATCH /tickets/:id/snooze", "cron every 1 min", "Snooze button"
  summary?: string;          // card line: what it does, under ~10 plain words
  why: string;               // which part of the step it delivers
  diagram?: Diagram;
  core: { ref: FileRef; explain: string }[];   // key code: 1-3 places the logic lives; panel shows the name + file/diff links, not the code
  decisions: { chose: string; instead: string; why?: string; ref?: FileRef }[];   // choices the intent did not ask for, incl. ignoring a repo pattern
  patterns?: { did: string; repoUses: string; ref?: FileRef }[];   // older reviews only; shown as decisions
}

export interface Review {
  version: 1;
  title: string;
  base: string;            // e.g. "main"
  baseSha: string;         // merge-base sha, diffs are against this
  head: string;            // branch name
  headSha: string;
  pr?: { number: number; url: string };

  start: {
    what: string;
    why: string;
    intent: { matches: boolean; extra: string[]; missing: string[] };
    readFirst: { step?: number; ref?: FileRef; why: string }[];   // step (1-based) with story, else ref
    size: { files: number; additions: number; deletions: number };
  };

  /** High to low: goal -> steps (build order, like a PR stack) -> flows. Each level's why is its parent. */
  story?: {
    goal: string;
    steps: {
      title: string;         // one thing you could check by hand, no code names
      summary?: string;      // card line: what it does, under ~10 plain words
      why: string;           // which ask it serves, or which later step needs it
      needs: number[];       // 1-based numbers of earlier steps it builds on
      asked: boolean;        // false = not in the intent
      flows: Flow[];
    }[];
  };

  services: { name: string; path: string; kind: ServiceKind; changed: string }[];
  serviceMap: Diagram;

  backend: {
    service: string;
    flow: Diagram;           // full routes -> data diagram; per-flow diagrams live in story
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
    apiCalls: string[];
    imports: Diagram;
  }[];

  models: {
    name: string;
    kind: string;            // "Postgres entity", "DTO", "Redis key", "store state", ...
    ref?: FileRef;
    diagram?: Diagram;
    fields: { name: string; type: string; status: Status; why: string; ref?: FileRef }[];
    note?: string;
  }[];

  tests: { logic: string; test?: { name: string; ref: FileRef }; errorPath: string }[];

  questions: { title: string; detail: string; ref?: FileRef }[];

  files: { path: string; service: string; status: Status; tag: Tag; what: string }[];
  skipped: string[];
}

/** Cheap shape check so a bad file gives a clear error instead of a blank panel. */
export function validate(x: any): string[] {
  const errs: string[] = [];
  const need = (cond: boolean, msg: string) => { if (!cond) errs.push(msg); };
  need(x && typeof x === 'object', 'root is not an object');
  if (errs.length) return errs;
  need(x.version === 1, 'version must be 1');
  for (const k of ['title', 'base', 'baseSha', 'head', 'headSha']) need(typeof x[k] === 'string', `${k} must be a string`);
  need(x.start && typeof x.start.what === 'string', 'start.what missing');
  for (const k of ['services', 'backend', 'frontend', 'models', 'tests', 'questions', 'files', 'skipped'])
    need(Array.isArray(x[k]), `${k} must be an array`);
  need(x.serviceMap && typeof x.serviceMap.mermaid === 'string', 'serviceMap.mermaid missing');
  return errs;
}
