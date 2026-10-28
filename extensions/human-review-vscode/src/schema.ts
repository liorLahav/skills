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
    readFirst: { ref: FileRef; why: string }[];
    size: { files: number; additions: number; deletions: number };
  };

  services: { name: string; path: string; kind: ServiceKind; changed: string }[];
  serviceMap: Diagram;

  backend: {
    service: string;
    flow: Diagram;
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
