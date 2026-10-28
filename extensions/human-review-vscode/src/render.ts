import { Diagram, FileRef, Review, Status } from './schema';

export interface RenderOpts {
  cspSource: string;
  nonce: string;
  mermaidUri: string;
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const attr = (o: unknown) => esc(JSON.stringify(o));

function refLabel(r: FileRef) {
  const name = r.path.split('/').pop();
  return r.startLine ? `${name}:${r.startLine}${r.endLine ? '-' + r.endLine : ''}` : name;
}

/** "file" opens at the lines, "diff" opens base vs working tree. */
function links(r?: FileRef, withLabel = false) {
  if (!r) return '';
  return `<span class="links">${withLabel ? `<code>${esc(refLabel(r))}</code> ` : ''}` +
    `<a href="#" data-open="${attr(r)}">file</a> · <a href="#" data-diff="${esc(r.path)}">diff</a></span>`;
}

const chip = (s: Status | string) => `<span class="chip ${esc(s)}">${esc(s)}</span>`;

function table(head: string[], rows: string[][], rowClass?: (i: number) => string) {
  return `<div class="tbl"><table><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>` +
    rows.map((r, i) => `<tr class="${rowClass ? rowClass(i) : ''}">${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') +
    `</table></div>`;
}

/** Placeholder line added under mapped node labels. Mermaid sizes the node for it; the webview swaps it for real links. */
export const LINK_TEXT = 'file · diff';

const OPENERS = ['([', '[(', '[[', '((', '[/', '[\\', '{{', '[', '(', '{', '>'];
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Append "<br/>file · diff" to the first quoted label of node `id`; if it has no quoted label, give it one. */
export function addLinkLine(src: string, id: string): string {
  const re = new RegExp(`(^|[\\s;&>|])(${reEsc(id)})(${OPENERS.map(reEsc).join('|')})"([^"]*)"`, 'm');
  if (re.test(src)) return src.replace(re, (_m, pre, nid, open, label) => `${pre}${nid}${open}"${label}<br/>${LINK_TEXT}"`);
  return `${src}\n  ${id}["${id}<br/>${LINK_TEXT}"]`;
}

export function renderHtml(rv: Review, o: RenderOpts): string {
  const diagrams: Record<string, Record<string, FileRef>> = {};
  let dgCount = 0;

  const dg = (d?: Diagram) => {
    if (!d || !d.mermaid) return '';
    const id = String(dgCount++);
    let src = d.mermaid.trim();
    const isFlow = /^(flowchart|graph)\b/.test(src);
    if (d.nodes && isFlow) {
      diagrams[id] = d.nodes;
      for (const n of Object.keys(d.nodes)) src = addLinkLine(src, n);
    }
    return `<div class="dg" data-dg="${id}"><pre class="mermaid">${esc(src)}</pre></div>`;
  };

  const s = rv.start;
  type View = { id: string; group: string; label: string; badge?: string; html: string };
  const views: View[] = [];
  const add = (v: View) => views.push(v);

  add({ id: 'start', group: 'Overview', label: 'Start here', html: `
    <div class="card">
      <dl class="kv">
        <dt>What</dt><dd>${esc(s.what)}</dd>
        <dt>Why</dt><dd>${esc(s.why)}</dd>
        <dt>Intent</dt><dd>${(s.intent.extra.length ? `<div><b>Not asked:</b> ${s.intent.extra.map(esc).join('; ')}</div>` : '') +
          (s.intent.missing.length ? `<div><b>Asked, missing:</b> ${s.intent.missing.map(esc).join('; ')}</div>` : '') || 'matches'}</dd>
        <dt>Read first</dt><dd><ol class="read">${s.readFirst.map(r =>
          `<li>${links(r.ref, true)}<div class="sub">${esc(r.why)}</div></li>`).join('')}</ol></dd>
        <dt>Size</dt><dd class="mono">${s.size.files} files · +${s.size.additions} / −${s.size.deletions} · ${rv.services.map(x => esc(x.name)).join(', ')}</dd>
        <dt>Questions</dt><dd><a href="#" data-go="questions">${rv.questions.length} open</a></dd>
      </dl>
    </div>` });

  add({ id: 'services', group: 'Overview', label: 'Service map', html:
    dg(rv.serviceMap) +
    table(['Service', 'Kind', 'What changed'], rv.services.map(x => [`<code>${esc(x.path)}</code>`, esc(x.kind), esc(x.changed)])) });

  const fileList = (service: string) => {
    const fs = rv.files.filter(f => f.service === service);
    if (!fs.length) return '';
    return `<div class="files">${fs.map(f => `
      <div class="file" data-path="${esc(f.path)}">
        <label class="rev"><input type="checkbox" data-review="${esc(f.path)}" aria-label="Mark ${esc(f.path)} reviewed"></label>
        <div class="fbody">
          <div class="top"><span class="path">${esc(f.path)}</span>${chip(f.status)}<span class="chip tag-${esc(f.tag)}">${esc(f.tag)}</span>${links({ path: f.path })}</div>
          <div class="what">${esc(f.what)}</div>
        </div>
      </div>`).join('')}</div>`;
  };
  const addFiles = (service: string, group: string) => {
    const n = rv.files.filter(f => f.service === service).length;
    if (n) add({ id: `files-${service}`, group, label: 'Files', badge: `<span data-files="${esc(service)}">0/${n}</span>`, html: fileList(service) });
  };

  for (const b of rv.backend) {
    const g = `Backend · ${b.service}`;
    add({ id: `be-${b.service}-flow`, group: g, label: 'Flow', html:
      `<p class="sub">Left = outside (routes, jobs). Right = data. Arrow = imports, label = why.</p>${dg(b.flow)}` +
      (b.routes.length ? `<h3>Routes</h3>${table(['Route', '', 'Purpose', 'Auth'], b.routes.map(r => [`<code>${esc(r.route)}</code>`, chip(r.status), esc(r.purpose), esc(r.auth)]))}` : '') });
    b.walkthroughs.forEach((w, i) => add({ id: `be-${b.service}-wt-${i}`, group: g, label: w.title, html: dg(w.diagram) }));
    if (b.sideEffects.length || b.beforeAfter.length) add({ id: `be-${b.service}-effects`, group: g, label: 'Side effects', html:
      (b.sideEffects.length ? table(['What', 'Where', 'When'], b.sideEffects.map(x => [esc(x.what), esc(x.where), esc(x.when)])) : '') +
      (b.beforeAfter.length ? `<h3>Before vs after</h3><ul class="ba">${b.beforeAfter.map(x =>
        `<li><b>${esc(x.subject)}.</b> before: ${esc(x.before)}. after: ${esc(x.after)}.</li>`).join('')}</ul>` : '') });
    addFiles(b.service, g);
  }

  for (const f of rv.frontend) {
    const g = `Frontend · ${f.service}`;
    add({ id: `fe-${f.service}-ui`, group: g, label: 'UI', html:
      `<div class="cols">${dg(f.ui.tree)}<ul class="ba">${f.ui.changes.map(c => `<li><b>${esc(c.component)}:</b> ${esc(c.change)}</li>`).join('')}</ul></div>` });
    if (f.functions.length) add({ id: `fe-${f.service}-fn`, group: g, label: 'Functions', html:
      table(['Function', 'Where', 'Does', ''], f.functions.map(x => [`<code>${esc(x.name)}</code>`, esc(x.where), esc(x.does), links(x.ref)])) });
    add({ id: `fe-${f.service}-state`, group: g, label: 'State', html: dg(f.state.flow) +
      (f.state.notes.length ? `<ul class="ba">${f.state.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : '') +
      (f.apiCalls.length ? `<h3>API calls</h3><ul class="ba">${f.apiCalls.map(a => `<li><code>${esc(a)}</code></li>`).join('')}</ul>` : '') });
    add({ id: `fe-${f.service}-imports`, group: g, label: 'Imports', html: dg(f.imports) });
    addFiles(f.service, g);
  }

  for (const x of rv.services.filter(x => !rv.backend.some(b => b.service === x.name) && !rv.frontend.some(f => f.service === x.name)))
    addFiles(x.name, `${x.name} · ${x.kind}`);

  const order: Record<string, number> = { added: 0, changed: 1, removed: 2, same: 3 };
  for (const m of rv.models) {
    const fields = [...m.fields].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
    const gaps = fields.filter(x => x.why === 'no usage found').length;
    add({ id: `model-${m.name}`, group: 'Data models', label: m.name, badge: gaps ? `<span class="warnb">${gaps}</span>` : undefined, html:
      `<p class="sub">${esc(m.kind)} ${links(m.ref)}</p>${dg(m.diagram)}` +
      table(['Field', 'Type', 'Status', 'Why', ''], fields.map(x => [`<code>${esc(x.name)}</code>`, esc(x.type), chip(x.status), `<b>${esc(x.why)}</b>`, links(x.ref)]),
        i => (fields[i].why === 'no usage found' ? 'gap ' : '') + (fields[i].status === 'removed' ? 'gone' : '')) +
      (m.note ? `<p class="sub">${esc(m.note)}</p>` : '') });
  }

  const untested = rv.tests.filter(t => !t.test).length;
  add({ id: 'tests', group: 'Check', label: 'Tests', badge: untested ? `<span class="warnb">${untested}</span>` : undefined, html:
    table(['Changed logic', 'Test', 'Error path'], rv.tests.map(t =>
      [`<code>${esc(t.logic)}</code>`, t.test ? `${esc(t.test.name)} ${links(t.test.ref)}` : '<b>none</b>', esc(t.errorPath)]),
      i => rv.tests[i].test ? '' : 'gap') +
    `<p class="sub">Highlighted rows have no test. Green CI only covers what is listed here.</p>` });
  add({ id: 'questions', group: 'Check', label: 'Open questions', badge: rv.questions.length ? `<span class="warnb">${rv.questions.length}</span>` : undefined, html:
    `<ol class="q">${rv.questions.map(q => `<li><div><b>${esc(q.title)}</b> ${esc(q.detail)}</div>${q.ref ? `<div class="src">${links(q.ref, true)}</div>` : ''}</li>`).join('')}</ol>` +
    (rv.skipped.length ? `<p class="sub mono">skipped: ${rv.skipped.map(esc).join(', ')}</p>` : '') });

  // Menu grouped in view order.
  const groups: string[] = [];
  for (const v of views) if (!groups.includes(v.group)) groups.push(v.group);
  const menu = groups.map(g => `<div class="mg"><div class="mgt">${esc(g)}</div>${views.filter(v => v.group === g).map(v =>
    `<button type="button" class="mi" data-go="${esc(v.id)}"><span>${esc(v.label)}</span>${v.badge ?? ''}</button>`).join('')}</div>`).join('');

  const viewsHtml = views.map((v, i) => `
    <div class="view" data-view="${esc(v.id)}" hidden>
      <div class="crumb">${esc(v.group)}</div>
      <h2>${esc(v.label)}</h2>
      ${v.html}
      <div class="pager">
        ${i > 0 ? `<button type="button" data-go="${esc(views[i - 1].id)}">← ${esc(views[i - 1].label)}</button>` : '<span></span>'}
        ${i < views.length - 1 ? `<button type="button" data-go="${esc(views[i + 1].id)}">${esc(views[i + 1].label)} →</button>` : ''}
      </div>
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${o.cspSource} data:; style-src ${o.cspSource} 'unsafe-inline'; font-src ${o.cspSource}; script-src 'nonce-${o.nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(rv.title)}</title>
<style>${CSS}</style></head>
<body>
<header>
  <div><h1>${esc(rv.title)}</h1>
  <div class="meta"><span>${rv.pr ? `PR #${rv.pr.number} · ` : ''}${esc(rv.head)} → ${esc(rv.base)}</span><span>base ${esc(rv.baseSha.slice(0, 8))} · head ${esc(rv.headSha.slice(0, 8))}</span></div></div>
  <span class="prog" id="prog"></span>
</header>
<div class="layout">
  <aside class="menu" aria-label="Review sections">${menu}<div class="keys">j / k: next / previous</div></aside>
  <main>${viewsHtml}</main>
</div>
<script nonce="${o.nonce}" src="${o.mermaidUri}"></script>
<script nonce="${o.nonce}">
(function(){
  const vscode = acquireVsCodeApi();
  const DIAGRAMS = ${JSON.stringify(diagrams).replace(/</g, '\\u003c')};
  const LINK_TEXT = ${JSON.stringify(LINK_TEXT)};
  const ORDER = Array.from(document.querySelectorAll('.view')).map(v => v.dataset.view);

  // In every mapped node, replace the "file · diff" placeholder with two real links.
  function wireNodeLinks(root){
    root.querySelectorAll('.dg[data-dg]').forEach(box => {
      const map = DIAGRAMS[box.dataset.dg];
      if (!map) return;
      box.querySelectorAll('g.node').forEach(g => {
        const domId = g.getAttribute('data-id') || g.id || '';
        const nodeId = Object.keys(map).find(n => new RegExp('(^|-)flowchart-' + n.replace(/[.*+?^$()|[\\]\\\\]/g, '\\\\$&') + '-\\\\d+$').test(domId));
        if (!nodeId) return;
        const ref = map[nodeId];
        const walker = document.createTreeWalker(g, NodeFilter.SHOW_TEXT);
        let t;
        while ((t = walker.nextNode())) {
          if (!t.nodeValue.includes(LINK_TEXT)) continue;
          const span = document.createElement('span');
          span.className = 'nl';
          const f = document.createElement('a'); f.href = '#'; f.textContent = 'file'; f.dataset.open = JSON.stringify(ref);
          const d = document.createElement('a'); d.href = '#'; d.textContent = 'diff'; d.dataset.diff = ref.path;
          span.append(f, ' · ', d);
          const [before, after] = t.nodeValue.split(LINK_TEXT);
          t.replaceWith(before, span, after);
          break;
        }
      });
    });
  }

  // Diagrams render only when their view is first shown (Mermaid cannot size hidden elements).
  let queue = Promise.resolve();
  function renderDiagrams(view){
    if (!window.mermaid) return;
    const pres = Array.from(view.querySelectorAll('pre.mermaid:not([data-processed])'));
    if (!pres.length) return;
    queue = queue.then(() => mermaid.run({ nodes: pres }))
      .then(() => wireNodeLinks(view))
      .catch(err => vscode.postMessage({type:'error', message: String(err && err.message || err)}));
  }

  function show(id){
    if (!ORDER.includes(id)) id = ORDER[0];
    document.querySelectorAll('.view').forEach(v => { v.hidden = v.dataset.view !== id; });
    document.querySelectorAll('.mi').forEach(b => {
      const on = b.dataset.go === id;
      b.classList.toggle('on', on);
      if (on) { b.setAttribute('aria-current', 'page'); b.scrollIntoView({block:'nearest'}); } else b.removeAttribute('aria-current');
    });
    const view = document.querySelector('.view[data-view="' + CSS.escape(id) + '"]');
    renderDiagrams(view);
    document.querySelector('main').scrollTop = 0;
    window.scrollTo(0, 0);
    vscode.setState(Object.assign({}, vscode.getState(), { view: id }));
  }

  document.addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if (go) { e.preventDefault(); show(go.dataset.go); return; }
    const a = e.target.closest('[data-open],[data-diff]');
    if (!a) return;
    e.preventDefault();
    if (a.dataset.open) vscode.postMessage({type:'open', ref: JSON.parse(a.dataset.open)});
    else vscode.postMessage({type:'diff', path: a.dataset.diff});
  });

  document.addEventListener('keydown', e => {
    if ((e.target instanceof Element && e.target.closest('input,textarea,select')) || e.metaKey || e.ctrlKey || e.altKey) return;
    const cur = ORDER.indexOf((vscode.getState() || {}).view);
    if (e.key === 'j') show(ORDER[Math.min(ORDER.length - 1, cur + 1)]);
    if (e.key === 'k') show(ORDER[Math.max(0, cur - 1)]);
  });

  const boxes = () => Array.from(document.querySelectorAll('[data-review]'));
  function progress(){
    const b = boxes(); const done = b.filter(x => x.checked).length;
    document.getElementById('prog').textContent = done + '/' + b.length + ' files reviewed';
    b.forEach(x => x.closest('.file').classList.toggle('done', x.checked));
    document.querySelectorAll('[data-files]').forEach(el => {
      const list = document.querySelector('.view[data-view="files-' + CSS.escape(el.dataset.files) + '"]');
      const all = list ? list.querySelectorAll('[data-review]') : [];
      const d = Array.from(all).filter(x => x.checked).length;
      el.textContent = d + '/' + all.length;
      el.classList.toggle('done', all.length > 0 && d === all.length);
    });
  }
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset && t.dataset.review) { vscode.postMessage({type:'toggle', path:t.dataset.review, value:t.checked}); progress(); }
  });
  window.addEventListener('message', e => {
    const m = e.data;
    if (m.type === 'reviewed') { const set = new Set(m.paths); boxes().forEach(x => x.checked = set.has(x.dataset.review)); progress(); }
  });

  const dark = document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast');
  if (window.mermaid) mermaid.initialize({ startOnLoad:false, securityLevel:'loose', theme: dark ? 'dark' : 'default', flowchart:{ htmlLabels:true } });
  progress();
  show((vscode.getState() || {}).view || ORDER[0]);
  vscode.postMessage({type:'ready'});
})();
</script>
</body></html>`;
}

const CSS = `
:root{--bg:var(--vscode-editor-background);--fg:var(--vscode-foreground);--muted:var(--vscode-descriptionForeground);
--line:var(--vscode-panel-border,rgba(128,128,128,.3));--surface:var(--vscode-editorWidget-background);--link:var(--vscode-textLink-foreground);
--add:var(--vscode-gitDecoration-addedResourceForeground,#3fb950);--chg:var(--vscode-gitDecoration-modifiedResourceForeground,#d29922);
--del:var(--vscode-gitDecoration-deletedResourceForeground,#f85149);--warn:var(--vscode-editorWarning-foreground,#cca700);
--mono:var(--vscode-editor-font-family,monospace)}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--fg);font-family:var(--vscode-font-family);font-size:13.5px;line-height:1.55;margin:0;padding:0}
h1{font-size:18px;margin:0}h2{font-size:17px;margin:0}
header{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);display:flex;gap:12px;align-items:center;justify-content:space-between;padding:10px 20px}
.prog{font-family:var(--mono);font-size:12px;color:var(--muted);white-space:nowrap}
.layout{display:grid;grid-template-columns:230px minmax(0,1fr);min-height:calc(100vh - 60px)}
.menu{position:sticky;top:60px;align-self:start;max-height:calc(100vh - 60px);overflow-y:auto;border-right:1px solid var(--line);padding:12px 8px 24px;display:flex;flex-direction:column;gap:14px}
.mgt{font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);padding:0 8px 4px}
.mi{display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;text-align:left;background:none;border:0;border-radius:5px;color:var(--fg);font:inherit;padding:4px 8px;cursor:pointer}
.mi:hover{background:var(--vscode-list-hoverBackground,var(--surface))}
.mi.on{background:var(--vscode-list-activeSelectionBackground,var(--surface));color:var(--vscode-list-activeSelectionForeground,var(--fg))}
.mi:focus-visible,.pager button:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}
.mi span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mi [data-files],.warnb{font-family:var(--mono);font-size:10.5px;color:var(--muted);flex:none}
.warnb{color:var(--warn)}
.mi [data-files].done{color:var(--add)}
.keys{font-size:11px;color:var(--muted);padding:0 8px}
main{min-width:0;padding:16px 24px 48px}
.view{max-width:1000px;display:flex;flex-direction:column;gap:12px}
.crumb{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}
.pager{display:flex;justify-content:space-between;gap:8px;margin-top:16px;padding-top:12px;border-top:1px solid var(--line)}
.pager button{background:var(--vscode-button-secondaryBackground,var(--surface));color:var(--vscode-button-secondaryForeground,var(--fg));border:0;border-radius:4px;padding:5px 12px;font:inherit;cursor:pointer}
.pager button:hover{background:var(--vscode-button-secondaryHoverBackground,var(--surface))}
@media (max-width:640px){.layout{grid-template-columns:1fr}.menu{position:static;max-height:none;border-right:0;border-bottom:1px solid var(--line);flex-direction:row;flex-wrap:wrap}.mg{min-width:160px}.keys{display:none}main{padding:16px}}
a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline}
h2 .k{font-family:var(--mono);color:var(--link);font-size:12px}
h3{font-size:14px;margin:10px 0 0}
code,.mono{font-family:var(--mono);font-size:.92em}
.sub{color:var(--muted)}
.meta{font-family:var(--mono);font-size:12px;color:var(--muted);display:flex;gap:14px;flex-wrap:wrap}
.card{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:14px}
.kv{display:grid;grid-template-columns:100px 1fr;gap:6px 14px;margin:0}
.kv dt{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);padding-top:2px}.kv dd{margin:0;min-width:0}
ol.read{margin:0;padding-left:18px;display:grid;gap:6px}
.links{font-family:var(--mono);font-size:12px;white-space:nowrap}
.chip{font-family:var(--mono);font-size:10.5px;padding:0 6px;border-radius:999px;border:1px solid var(--line);color:var(--muted);white-space:nowrap}
.chip.added{color:var(--add);border-color:var(--add)}.chip.changed{color:var(--chg);border-color:var(--chg)}.chip.removed{color:var(--del);border-color:var(--del)}
.chip.tag-logic{color:var(--fg);border-color:var(--fg)}
.dg{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:12px;overflow-x:auto;min-width:0}
.dg pre.mermaid{margin:0;background:transparent;color:var(--fg)}
.dg .nl{font-family:var(--mono);font-size:11px;white-space:nowrap}
.dg .nl a{color:#2b59c3;text-decoration:underline}
.tbl{overflow-x:auto;border:1px solid var(--line);border-radius:8px}
table{border-collapse:collapse;width:100%}
th,td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:500}
tr:last-child td{border-bottom:none}
tr.gap td{background:color-mix(in srgb,var(--warn) 14%,transparent)}
tr.gone td:first-child{text-decoration:line-through;color:var(--muted)}
.files{border:1px solid var(--line);border-radius:8px}
.file{display:flex;gap:10px;padding:8px 12px;border-bottom:1px solid var(--line)}
.file:last-child{border-bottom:none}
.file.done{opacity:.55}
.fbody{display:grid;gap:2px;min-width:0}
.file .top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.file .path{font-family:var(--mono);font-size:12.5px;overflow-wrap:anywhere}
.file .what{color:var(--muted)}
.rev{padding-top:2px}
ul.ba{margin:0;padding-left:18px;display:grid;gap:4px}
.q{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.q li{border:1px solid var(--line);border-left:3px solid var(--warn);border-radius:6px;padding:8px 12px;display:grid;gap:4px}
.q .src{font-size:12px}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;align-items:center}
.cols>*{min-width:0}
`;
