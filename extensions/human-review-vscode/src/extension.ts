import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { Review, FileRef, validate } from './schema';
import { renderHtml } from './render';

const REVIEW_GLOB = '.review/review.json';

// Minimal slice of the built-in Git extension API.
interface GitAPI {
  toGitUri(uri: vscode.Uri, ref: string): vscode.Uri;
}

let panel: vscode.WebviewPanel | undefined;
let current: { review: Review; root: vscode.Uri } | undefined;
let status: vscode.StatusBarItem;
let summary: Summary;

/** Activity bar sidebar: where the review stands, plus an Open button. Empty shows the welcome text from package.json. */
class Summary implements vscode.TreeDataProvider<vscode.TreeItem> {
  private changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  constructor(private ctx: vscode.ExtensionContext) {}
  refresh() { this.changed.fire(); }
  getTreeItem(i: vscode.TreeItem) { return i; }
  getChildren(): vscode.TreeItem[] {
    if (!current) return [];
    const rv = current.review;
    const item = (label: string, icon: string, description?: string, command?: vscode.Command) =>
      Object.assign(new vscode.TreeItem(label), { iconPath: new vscode.ThemeIcon(icon), description, command, tooltip: description ? `${label} · ${description}` : label });
    const done = this.ctx.workspaceState.get<string[]>(stateKey(rv), []).length;
    return [
      item(rv.title, 'git-pull-request', `${rv.head} → ${rv.base}`),
      item(`${rv.story?.steps.length ?? 0} steps`, 'list-ordered'),
      item(`${done}/${rv.files.length} files reviewed`, 'checklist'),
      item(`${rv.questions.length} open questions`, 'question'),
      item('Open review', 'preview', undefined, { command: 'humanReview.open', title: 'Open review' }),
    ];
  }
}

export function activate(ctx: vscode.ExtensionContext) {
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.command = 'humanReview.open';
  ctx.subscriptions.push(status);

  summary = new Summary(ctx);
  const view = vscode.window.createTreeView('humanReview.summary', { treeDataProvider: summary });
  // Clicking the activity bar icon goes straight into the review.
  view.onDidChangeVisibility(e => { if (e.visible && current) open(ctx); });
  ctx.subscriptions.push(view);

  ctx.subscriptions.push(
    vscode.commands.registerCommand('humanReview.open', () => open(ctx)),
    vscode.commands.registerCommand('humanReview.clearReviewed', async () => {
      if (!current) return;
      await ctx.workspaceState.update(stateKey(current.review), []);
      sendReviewed(ctx);
      updateStatus(ctx);
    }),
  );

  const watcher = vscode.workspace.createFileSystemWatcher(`**/${REVIEW_GLOB}`);
  const onChange = async (uri: vscode.Uri) => {
    const loaded = await load(uri);
    if (!loaded) return;
    current = loaded;
    updateStatus(ctx);
    if (panel) render(ctx);
    else {
      const pick = await vscode.window.showInformationMessage(`New review ready: ${loaded.review.title}`, 'Open');
      if (pick === 'Open') open(ctx);
    }
  };
  watcher.onDidCreate(onChange);
  watcher.onDidChange(onChange);
  ctx.subscriptions.push(watcher);

  // Show status bar if a review already exists.
  findReview().then(async uri => {
    if (!uri) return;
    const loaded = await load(uri);
    if (loaded) { current = loaded; updateStatus(ctx); }
  });
}

export function deactivate() {}

async function findReview(): Promise<vscode.Uri | undefined> {
  const found = await vscode.workspace.findFiles(REVIEW_GLOB, '**/node_modules/**', 1);
  return found[0];
}

async function load(uri: vscode.Uri): Promise<{ review: Review; root: vscode.Uri } | undefined> {
  try {
    const raw = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
    const data = JSON.parse(raw);
    const errs = validate(data);
    if (errs.length) {
      vscode.window.showErrorMessage(`review.json is invalid: ${errs.slice(0, 3).join('; ')}`);
      return;
    }
    // .review/review.json lives in repo root
    const root = vscode.Uri.joinPath(uri, '..', '..');
    return { review: data as Review, root };
  } catch (e: any) {
    vscode.window.showErrorMessage(`Could not read review.json: ${e?.message ?? e}`);
  }
}

async function open(ctx: vscode.ExtensionContext) {
  if (!current) {
    const uri = await findReview();
    if (!uri) {
      vscode.window.showWarningMessage('No .review/review.json found. Run the human-review skill in Claude Code first.');
      return;
    }
    current = await load(uri);
    if (!current) return;
  }
  if (panel) { panel.reveal(vscode.ViewColumn.Beside); render(ctx); return; }

  panel = vscode.window.createWebviewPanel('humanReview', 'Human Review', vscode.ViewColumn.Beside, {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [vscode.Uri.joinPath(ctx.extensionUri, 'media')],
  });
  panel.onDidDispose(() => { panel = undefined; }, null, ctx.subscriptions);
  panel.webview.onDidReceiveMessage(m => onMessage(ctx, m), null, ctx.subscriptions);
  render(ctx);
}

function render(ctx: vscode.ExtensionContext) {
  if (!panel || !current) return;
  const nonce = crypto.randomBytes(16).toString('base64');
  const mermaidUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(ctx.extensionUri, 'media', 'mermaid.min.js')).toString();
  panel.title = `Review: ${current.review.title}`;
  panel.webview.html = renderHtml(current.review, { cspSource: panel.webview.cspSource, nonce, mermaidUri });
}

async function onMessage(ctx: vscode.ExtensionContext, m: any) {
  if (!current) return;
  switch (m.type) {
    case 'ready': sendReviewed(ctx); break;
    case 'open': await openFile(m.ref as FileRef); break;
    case 'diff': await openDiff(String(m.path)); break;
    case 'toggle': {
      const key = stateKey(current.review);
      const set = new Set<string>(ctx.workspaceState.get<string[]>(key, []));
      m.value ? set.add(m.path) : set.delete(m.path);
      await ctx.workspaceState.update(key, [...set]);
      updateStatus(ctx);
      break;
    }
    case 'error': vscode.window.showWarningMessage(`Diagram failed to render: ${m.message}`); break;
  }
}

function stateKey(r: Review) { return `humanReview.reviewed:${r.head}:${r.baseSha}`; }

function sendReviewed(ctx: vscode.ExtensionContext) {
  if (!panel || !current) return;
  panel.webview.postMessage({ type: 'reviewed', paths: ctx.workspaceState.get<string[]>(stateKey(current.review), []) });
}

function updateStatus(ctx: vscode.ExtensionContext) {
  summary.refresh();
  if (!current) { status.hide(); return; }
  const done = ctx.workspaceState.get<string[]>(stateKey(current.review), []).length;
  status.text = `$(checklist) Review ${done}/${current.review.files.length}`;
  status.tooltip = `${current.review.title}: ${current.review.questions.length} open questions`;
  status.show();
}

function fileUri(path: string) { return vscode.Uri.joinPath(current!.root, ...path.split('/')); }

async function exists(uri: vscode.Uri) {
  try { await vscode.workspace.fs.stat(uri); return true; } catch { return false; }
}

async function openFile(ref: FileRef) {
  const uri = fileUri(ref.path);
  if (!(await exists(uri))) {
    // Deleted file: show it at base.
    if (await gitApi()) return openDiff(ref.path);
    vscode.window.showWarningMessage(`${ref.path} not found`);
    return;
  }
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: false });
  if (ref.startLine) {
    const start = new vscode.Position(Math.max(0, ref.startLine - 1), 0);
    const end = new vscode.Position(Math.max(0, (ref.endLine ?? ref.startLine) - 1), Number.MAX_SAFE_INTEGER);
    editor.selection = new vscode.Selection(start, end);
    editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenter);
  }
}

async function gitApi(): Promise<GitAPI | undefined> {
  const ext = vscode.extensions.getExtension<any>('vscode.git');
  if (!ext) return;
  const exp = ext.isActive ? ext.exports : await ext.activate();
  return exp?.getAPI?.(1);
}

async function openDiff(path: string) {
  const git = await gitApi();
  if (!git || !current) { vscode.window.showWarningMessage('Git extension not available'); return; }
  const rv = current.review;
  const right = fileUri(path);
  const entry = rv.files.find(f => f.path === path);
  const title = `${path.split('/').pop()} (${rv.base} ↔ ${rv.head})`;

  if (entry?.status === 'added') {
    // Nothing at base: diff against an empty doc so it shows as all green.
    return vscode.commands.executeCommand('vscode.diff', await emptyDoc(), right, title + ' [new file]');
  }
  const left = git.toGitUri(right, rv.baseSha);
  if (entry?.status === 'removed' || !(await exists(right))) {
    return vscode.window.showTextDocument(left, { preview: false });
  }
  return vscode.commands.executeCommand('vscode.diff', left, right, title, { viewColumn: vscode.ViewColumn.One });
}

let emptyUri: vscode.Uri | undefined;
async function emptyDoc(): Promise<vscode.Uri> {
  if (!emptyUri) {
    const doc = await vscode.workspace.openTextDocument({ content: '' });
    emptyUri = doc.uri;
  }
  return emptyUri;
}
