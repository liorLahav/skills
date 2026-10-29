import { Diagram, FileRef, Flow, Review, Status } from './schema';

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
export const LINK_TEXT = '[ file ] [ diff ]';

const OPENERS = ['([', '[(', '[[', '((', '[/', '[\\', '{{', '[', '(', '{', '>'];
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Append "<br/>file · diff" to the first quoted label of node `id`; if it has no quoted label, give it one. */
export function addLinkLine(src: string, id: string): string {
  const re = new RegExp(`(^|[\\s;&>|])(${reEsc(id)})(${OPENERS.map(reEsc).join('|')})"([^"]*)"`, 'm');
  if (re.test(src)) return src.replace(re, (_m, pre, nid, open, label) => `${pre}${nid}${open}"${label}<br/>${LINK_TEXT}"`);
  return `${src}\n  ${id}["${id}<br/>${LINK_TEXT}"]`;
}

type Decision = { chose: string; instead: string; why?: string; ref?: FileRef };

/** Older reviews have no `why` and pack it after a ";" in `instead`; pattern breaks were a separate list. */
function decisionsOf(f: Flow): Decision[] {
  const all: Decision[] = [...(f.decisions || []), ...(f.patterns || []).map(p => ({ chose: p.did, instead: `repo uses ${p.repoUses}`, ref: p.ref }))];
  return all.map(d => {
    if (d.why) return d;
    const [instead, ...why] = String(d.instead).split(';');
    return { ...d, instead: instead.trim(), why: why.join(';').trim() || undefined };
  });
}

const decHtml = (d: Decision) => `<div class="dec"><b>Chose</b><span>${esc(d.chose)} ${links(d.ref)}</span><b>Instead</b><span>${esc(d.instead)}</span>` +
  (d.why ? `<b>Why</b><span>${esc(d.why)}</span>` : '') + `</div>`;

/**
 * Three columns, like Finder: goal and steps | the open step (or Check, Details) | the open flow (or one detail).
 * Every column-2 and column-3 screen is rendered up front as a hidden section; the webview script shows two at a time.
 */
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

  type Section = { id: string; col: 2 | 3; parent?: string; title: string; html: string };
  const sections: Section[] = [];
  const add = (s: Section) => sections.push(s);
  const nav = (id: string, html: string, cls = 'card') => `<button type="button" class="${cls}" data-nav="${esc(id)}">${html}</button>`;
  const lbl = (t: string) => `<div class="lbl">${esc(t)}</div>`;

  const s = rv.start;
  const steps = rv.story?.steps || [];
  const readFirstSteps = new Set(s.readFirst.flatMap(r => r.step ? [r.step] : []));
  const badges = (st: { asked: boolean }, n: number) =>
    (readFirstSteps.has(n) ? ' <span class="chip start">start here</span>' : '') + (st.asked ? '' : ' <span class="chip warn">not asked</span>');
  const stepLinks = (ns: number[]) => ns.map(n => `<a href="#" data-nav="step-${n}">step ${n}</a>`).join(', ');
  const allDecisions = steps.flatMap((st, i) => st.flows.flatMap((f, j) => decisionsOf(f).map(d => ({ d, n: i + 1, m: j + 1, flow: f.title }))));
  const untested = rv.tests.filter(t => !t.test);

  // Column 2: one screen per step, its flows open in column 3.
  steps.forEach((st, i) => {
    const n = i + 1, neededBy = steps.flatMap((x, j) => x.needs.includes(n) ? [j + 1] : []);
    add({ id: `step-${n}`, col: 2, title: `Step ${n}`, html:
      lbl(`Step ${n} of ${steps.length}`) + `<h2>${esc(st.title)}${badges(st, n)}</h2>` +
      `<p><b>Why:</b> ${esc(st.why)}</p>` +
      (st.needs.length || neededBy.length ? `<p class="sub">${st.needs.length ? `Builds on ${stepLinks(st.needs)}. ` : ''}${neededBy.length ? `Needed by ${stepLinks(neededBy)}.` : ''}</p>` : '') +
      lbl('Flows') + st.flows.map((f, j) => nav(`flow-${n}-${j + 1}`,
        `<span class="t">${esc(f.title)}</span><span class="d">${esc(f.why)}</span>` +
        (decisionsOf(f).length ? `<span class="d">${decisionsOf(f).length} decisions</span>` : ''))).join('') });
    st.flows.forEach((f, j) => {
      const decs = decisionsOf(f);
      add({ id: `flow-${n}-${j + 1}`, col: 3, parent: `step-${n}`, title: f.title, html:
        lbl('Flow') + `<h2>${esc(f.title)}</h2><p><b>Why:</b> ${esc(f.why)}</p>` + dg(f.diagram) +
        ((f.core || []).length ? `<h3>Key code</h3>${f.core.map(c => `<div class="kc">${links(c.ref, true)}<span>${esc(c.explain)}</span></div>`).join('')}` : '') +
        (decs.length ? `<h3>Decisions</h3>${decs.map(decHtml).join('')}` : '') });
    });
  });

  add({ id: 'check', col: 2, title: 'Check', html:
    `<h2>Check</h2><p class="sub">What to judge before you approve.</p>` +
    `<h3>No test</h3>` + (untested.length ? `<ul class="ba">${untested.map(t => `<li><code>${esc(t.logic)}</code> <span class="sub">${esc(t.errorPath)}</span></li>`).join('')}</ul>` : '<p class="sub">All changed logic has a test.</p>') +
    (rv.tests.length ? `<details><summary class="sub">All ${rv.tests.length} tests</summary>${table(['Changed logic', 'Test', 'Error path'], rv.tests.map(t =>
      [`<code>${esc(t.logic)}</code>`, t.test ? `${esc(t.test.name)} ${links(t.test.ref)}` : '<b>none</b>', esc(t.errorPath)]), i => rv.tests[i].test ? '' : 'gap')}</details>` : '') +
    `<h3>Decisions</h3>` + (allDecisions.length ? allDecisions.map(x =>
      `<div class="decw"><a href="#" data-nav="flow-${x.n}-${x.m}">Step ${x.n} · ${esc(x.flow)}</a>${decHtml(x.d)}</div>`).join('') : '<p class="sub">None.</p>') +
    `<h3>Open questions</h3>` + (rv.questions.length ? `<ol class="q">${rv.questions.map(q =>
      `<li><div><b>${esc(q.title)}</b> ${esc(q.detail)}</div>${q.ref ? `<div class="src">${links(q.ref, true)}</div>` : ''}</li>`).join('')}</ol>` : '<p class="sub">None.</p>') });

  // Details: lookup screens, not needed to follow the change.
  const details: Section[] = [];
  const detail = (id: string, title: string, desc: string, html: string) => details.push({ id: `d-${id}`, col: 3, parent: 'details', title, html: `<h2>${esc(title)}</h2>${html}`, desc } as Section & { desc: string });
  detail('map', 'Service map', 'which services changed and how they connect', dg(rv.serviceMap) +
    table(['Service', 'Kind', 'What changed'], rv.services.map(x => [`<code>${esc(x.path)}</code>`, esc(x.kind), esc(x.changed)])));
  rv.backend.forEach((b, i) => detail(`be-${i}`, `Backend · ${b.service}`, 'all routes to data, sequences, side effects',
    `<p class="sub">Left = outside (routes, jobs). Right = data. Arrow = imports, label = why.</p>${dg(b.flow)}` +
    (b.routes.length ? `<h3>Routes</h3>${table(['Route', '', 'Purpose', 'Auth'], b.routes.map(r => [`<code>${esc(r.route)}</code>`, chip(r.status), esc(r.purpose), esc(r.auth)]))}` : '') +
    b.walkthroughs.map(w => `<h3>${esc(w.title)}</h3>${dg(w.diagram)}`).join('') +
    (b.sideEffects.length ? `<h3>Side effects</h3>${table(['What', 'Where', 'When'], b.sideEffects.map(x => [esc(x.what), esc(x.where), esc(x.when)]))}` : '') +
    (b.beforeAfter.length ? `<h3>Before vs after</h3><ul class="ba">${b.beforeAfter.map(x => `<li><b>${esc(x.subject)}.</b> before: ${esc(x.before)}. after: ${esc(x.after)}.</li>`).join('')}</ul>` : '')));
  rv.frontend.forEach((f, i) => detail(`fe-${i}`, `Frontend · ${f.service}`, 'UI, functions, state, imports',
    `<h3>UI</h3>${dg(f.ui.tree)}<ul class="ba">${f.ui.changes.map(c => `<li><b>${esc(c.component)}:</b> ${esc(c.change)}</li>`).join('')}</ul>` +
    (f.functions.length ? `<h3>Functions</h3>${table(['Function', 'Where', 'Does', ''], f.functions.map(x => [`<code>${esc(x.name)}</code>`, esc(x.where), esc(x.does), links(x.ref)]))}` : '') +
    `<h3>State</h3>${dg(f.state.flow)}` + (f.state.notes.length ? `<ul class="ba">${f.state.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : '') +
    (f.apiCalls.length ? `<h3>API calls</h3><ul class="ba">${f.apiCalls.map(a => `<li><code>${esc(a)}</code></li>`).join('')}</ul>` : '') +
    `<h3>Imports</h3>${dg(f.imports)}`));
  const order: Record<string, number> = { added: 0, changed: 1, removed: 2, same: 3 };
  if (rv.models.length) detail('models', 'Data models', `${rv.models.length} models, why each field exists`, rv.models.map(m => {
    const fields = [...m.fields].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
    return `<h3>${esc(m.name)} <span class="sub">${esc(m.kind)}</span> ${links(m.ref)}</h3>${dg(m.diagram)}` +
      table(['Field', 'Type', 'Status', 'Why', ''], fields.map(x => [`<code>${esc(x.name)}</code>`, esc(x.type), chip(x.status), `<b>${esc(x.why)}</b>`, links(x.ref)]),
        i => (fields[i].why === 'no usage found' ? 'gap ' : '') + (fields[i].status === 'removed' ? 'gone' : '')) +
      (m.note ? `<p class="sub">${esc(m.note)}</p>` : '');
  }).join(''));
  const services = [...new Set(rv.files.map(f => f.service))];
  detail('files', 'Files', `<span data-files>0/${rv.files.length}</span> reviewed`, `<p class="sub">Tick a file when you have reviewed it. Saved per branch.</p>` +
    services.map(svc => `<h3>${esc(svc)}</h3><div class="files">${rv.files.filter(f => f.service === svc).map(f => `
      <div class="file">
        <label class="rev"><input type="checkbox" data-review="${esc(f.path)}" aria-label="Mark ${esc(f.path)} reviewed"></label>
        <div class="fbody">
          <div class="top"><span class="path">${esc(f.path)}</span>${chip(f.status)}<span class="chip tag-${esc(f.tag)}">${esc(f.tag)}</span>${links({ path: f.path })}</div>
          <div class="what">${esc(f.what)}</div>
        </div>
      </div>`).join('')}</div>`).join('') +
    (rv.skipped.length ? `<p class="sub mono">skipped: ${rv.skipped.map(esc).join(', ')}</p>` : ''));
  add({ id: 'details', col: 2, title: 'Details', html: `<h2>Details</h2><p class="sub">Look things up. Not needed to follow the change.</p>` +
    details.map(d => nav(d.id, `<span class="t">${esc(d.title)}</span><span class="d">${(d as Section & { desc: string }).desc}</span>`)).join('') });
  sections.push(...details);

  // Column 1: always the top level.
  const intent = s.intent;
  const col1 = lbl('Goal') + `<h2>${esc(rv.story?.goal || s.what)}</h2>` +
    (rv.story ? `<p class="sub">${esc(s.what)}</p>` : '') +
    `<div class="intent">${intent.missing.length ? `<div><b>Asked, not done:</b> ${intent.missing.map(esc).join('; ')}</div>` : ''}` +
    (intent.extra.length ? `<div class="sub"><b>Not asked:</b> ${intent.extra.map(esc).join('; ')}</div>` : '') +
    (!intent.missing.length && !intent.extra.length ? '<div class="sub">Matches what was asked.</div>' : '') + `</div>` +
    `<div class="meta">${s.size.files} files · +${s.size.additions} / −${s.size.deletions}</div>` +
    (s.readFirst.some(r => r.ref && !r.step) ? lbl('Read first') + `<ol class="read">${s.readFirst.filter(r => r.ref && !r.step).map(r =>
      `<li>${links(r.ref, true)}<div class="sub">${esc(r.why)}</div></li>`).join('')}</ol>` : '') +
    (steps.length ? lbl('Steps, in build order') + steps.map((st, i) => nav(`step-${i + 1}`,
      `<span class="t"><span class="n">${i + 1}</span>${esc(st.title)}${badges(st, i + 1)}</span><span class="d">${esc(st.why)}</span>`)).join('') : '') +
    lbl('Then') +
    nav('check', `<span class="t">Check</span><span class="d">${untested.length} untested · ${allDecisions.length} decisions · ${rv.questions.length} questions</span>`) +
    nav('details', `<span class="t">Details</span><span class="d">service map, backend, frontend, data, files · <span data-files>0/${rv.files.length}</span> reviewed</span>`);

  const secHtml = sections.map(x =>
    `<section data-sec="${esc(x.id)}" data-col="${x.col}" data-parent="${esc(x.parent || '')}" data-title="${esc(x.title)}" hidden>${x.html}</section>`);

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
<nav class="crumb" id="crumb" aria-label="Where you are"></nav>
<div class="cols" id="cols">
  <div class="col c1" data-c="1">${col1}<div class="keys">↑ ↓ move · → open · ← or Esc back</div></div>
  <div class="col c2" data-c="2"><p class="sub hint" id="hint2">Pick a step.</p>${secHtml.filter((_, i) => sections[i].col === 2).join('')}</div>
  <div class="col c3" data-c="3"><p class="sub hint" id="hint3">Pick a flow.</p>${secHtml.filter((_, i) => sections[i].col === 3).join('')}</div>
</div>
<script nonce="${o.nonce}" src="${o.mermaidUri}"></script>
<script nonce="${o.nonce}">
(function(){
  const vscode = acquireVsCodeApi();
  const DIAGRAMS = ${JSON.stringify(diagrams).replace(/</g, '\\u003c')};
  const LINK_RE = new RegExp(${JSON.stringify(String.raw`\[\s*file\s*\]\s*\[\s*diff\s*\]`)});
  const SECS = {};
  document.querySelectorAll('section[data-sec]').forEach(s => { SECS[s.dataset.sec] = s; });
  const cols = document.getElementById('cols');
  const colEl = n => cols.querySelector('.c' + n);
  let st = Object.assign({ c2: null, c3: null, focus: 1 }, (vscode.getState() || {}).nav);
  if (st.c2 && !SECS[st.c2]) st = { c2: null, c3: null, focus: 1 };
  if (st.c3 && !SECS[st.c3]) st.c3 = null;

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
          const mm = t.nodeValue.match(LINK_RE);
          if (!mm) continue;
          const span = document.createElement('span');
          span.className = 'nl';
          const f = document.createElement('a'); f.href = '#'; f.textContent = 'file'; f.dataset.open = JSON.stringify(ref);
          const d = document.createElement('a'); d.href = '#'; d.textContent = 'diff'; d.dataset.diff = ref.path;
          span.append(f, d);
          const before = t.nodeValue.slice(0, mm.index), after = t.nodeValue.slice(mm.index + mm[0].length);
          t.replaceWith(before, span, after);
          break;
        }
      });
    });
  }

  // Diagrams render only when their section is first shown (Mermaid cannot size hidden elements).
  let queue = Promise.resolve();
  function renderDiagrams(sec){
    if (!window.mermaid || !sec) return;
    const pres = Array.from(sec.querySelectorAll('pre.mermaid:not([data-processed])'));
    if (!pres.length) return;
    queue = queue.then(() => mermaid.run({ nodes: pres }))
      .then(() => wireNodeLinks(sec))
      .catch(err => vscode.postMessage({type:'error', message: String(err && err.message || err)}));
  }

  function apply(){
    for (const id in SECS) SECS[id].hidden = id !== st.c2 && id !== st.c3;
    document.getElementById('hint2').hidden = !!st.c2;
    document.getElementById('hint3').hidden = !!st.c3;
    document.getElementById('hint3').textContent = st.c2 === 'details' ? 'Pick a detail.' : 'Pick a flow.';
    cols.classList.toggle('has-c2', !!st.c2);
    cols.classList.toggle('has-c3', !!st.c3);
    document.querySelectorAll('.card[data-nav]').forEach(b => {
      const on = b.dataset.nav === st.c2 || b.dataset.nav === st.c3;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    document.querySelectorAll('.col').forEach(c => c.classList.toggle('focus', +c.dataset.c === st.focus));
    const parts = [['Goal', null]];
    if (st.c2) parts.push([SECS[st.c2].dataset.title, st.c2]);
    if (st.c3) parts.push([SECS[st.c3].dataset.title, st.c3]);
    document.getElementById('crumb').innerHTML = parts.map(([t, id], i) => i === parts.length - 1
      ? '<b>' + esc(t) + '</b>' : '<a href="#" data-crumb="' + (id || '') + '">' + esc(t) + '</a>').join(' › ');
    renderDiagrams(SECS[st.c2]); renderDiagrams(SECS[st.c3]);
    vscode.setState(Object.assign({}, vscode.getState(), { nav: st }));
  }
  function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // Open a section where it lives: column 2 replaces the step, column 3 also shows its parent.
  function open(id, focus){
    const sec = SECS[id];
    if (!sec) return;
    if (sec.dataset.col === '2') { if (st.c2 !== id) colEl(2).scrollTop = 0; st.c2 = id; st.c3 = null; st.focus = focus || 1; }
    else { st.c2 = sec.dataset.parent; if (st.c3 !== id) colEl(3).scrollTop = 0; st.c3 = id; st.focus = focus || 2; }
    apply();
  }
  function back(){
    if (st.c3) { st.c3 = null; st.focus = 2; }
    else if (st.c2) { st.c2 = null; st.focus = 1; }
    apply();
  }
  // Cards the arrow keys move through in a column.
  function cardsIn(n){
    if (n === 1) return Array.from(colEl(1).querySelectorAll('.card[data-nav]'));
    const sec = SECS[st.c2];
    return sec ? Array.from(sec.querySelectorAll('.card[data-nav]')) : [];
  }

  document.addEventListener('click', e => {
    const c = e.target.closest('[data-crumb]');
    if (c) { e.preventDefault(); if (!c.dataset.crumb) { st = { c2: null, c3: null, focus: 1 }; apply(); } else open(c.dataset.crumb); return; }
    const n = e.target.closest('[data-nav]');
    if (n) { e.preventDefault(); const col = n.closest('.col'); open(n.dataset.nav, col ? +col.dataset.c : undefined); return; }
    const a = e.target.closest('[data-open],[data-diff]');
    if (!a) return;
    e.preventDefault();
    if (a.dataset.open) vscode.postMessage({type:'open', ref: JSON.parse(a.dataset.open)});
    else vscode.postMessage({type:'diff', path: a.dataset.diff});
  });

  document.addEventListener('keydown', e => {
    if ((e.target instanceof Element && e.target.closest('input,textarea,select,summary')) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (st.focus === 3) return;   // column 3 scrolls
      const cards = cardsIn(st.focus), cur = st.focus === 1 ? st.c2 : st.c3;
      if (!cards.length) return;
      e.preventDefault();
      const i = cards.findIndex(b => b.dataset.nav === cur);
      const next = cards[i < 0 ? 0 : Math.max(0, Math.min(cards.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      open(next.dataset.nav, st.focus);
      next.scrollIntoView({ block: 'nearest' });
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (st.focus === 1 && st.c2) { st.focus = 2; if (!st.c3) { const c = cardsIn(2)[0]; if (c) return open(c.dataset.nav, 2); } apply(); }
      else if (st.focus === 2 && st.c3) { st.focus = 3; apply(); }
    }
    if (e.key === 'ArrowLeft' || e.key === 'Escape') { e.preventDefault(); back(); }
  });

  const boxes = () => Array.from(document.querySelectorAll('[data-review]'));
  function progress(){
    const b = boxes(), done = b.filter(x => x.checked).length;
    document.getElementById('prog').textContent = done + '/' + b.length + ' files reviewed';
    b.forEach(x => x.closest('.file').classList.toggle('done', x.checked));
    document.querySelectorAll('[data-files]').forEach(el => { el.textContent = done + '/' + b.length; el.classList.toggle('done', b.length > 0 && done === b.length); });
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
  if (window.mermaid) mermaid.initialize({ startOnLoad:false, securityLevel:'loose', theme: dark ? 'dark' : 'default', flowchart:{ htmlLabels:true, useMaxWidth:false }, sequence:{ useMaxWidth:false } }); // natural size; .dg scrolls instead of shrinking text
  progress();
  apply();
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
--hover:var(--vscode-list-hoverBackground,var(--surface));--sel:var(--vscode-list-inactiveSelectionBackground,var(--surface));
--focus:var(--vscode-focusBorder,var(--link));--mono:var(--vscode-editor-font-family,monospace)}
*{box-sizing:border-box}
[hidden]{display:none!important}
html,body{height:100%}
body{background:var(--bg);color:var(--fg);font-family:var(--vscode-font-family);font-size:13.5px;line-height:1.55;margin:0;padding:0;display:flex;flex-direction:column;overflow:hidden}
h1{font-size:16px;margin:0}h2{font-size:17px;line-height:1.35;margin:0 0 8px}
h3{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600;margin:18px 0 6px}
header{flex:none;border-bottom:1px solid var(--line);display:flex;gap:12px;align-items:center;justify-content:space-between;padding:8px 16px}
.prog{font-family:var(--mono);font-size:12px;color:var(--muted);white-space:nowrap}
.meta{font-family:var(--mono);font-size:12px;color:var(--muted);display:flex;gap:14px;flex-wrap:wrap}
.crumb{display:none;flex:none;padding:6px 16px;border-bottom:1px solid var(--line);font-size:12px;color:var(--muted)}
.crumb a{color:var(--muted)}.crumb b{color:var(--fg);font-weight:500}
.cols{flex:1;min-height:0;display:grid;grid-template-columns:minmax(220px,300px) minmax(240px,340px) minmax(0,1fr)}
.col{min-width:0;overflow:auto;padding:14px 14px 40px;border-right:1px solid var(--line)}
.col:last-child{border-right:0}
.col.focus{box-shadow:inset 0 2px 0 var(--focus)}
.lbl{font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin:14px 0 6px}
.lbl:first-child{margin-top:0}
.intent{display:grid;gap:2px;margin:6px 0}
.card{display:grid;gap:2px;width:100%;text-align:left;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:9px 12px;margin:0 0 6px;color:var(--fg);font:inherit;cursor:pointer}
.card:hover{background:var(--hover)}
.card.on{background:var(--sel);border-color:var(--focus)}
.card:focus-visible{outline:1px solid var(--focus);outline-offset:-1px}
.card .t{font-weight:600}.card .n{color:var(--muted);font-weight:500;margin-right:8px}
.card .d{color:var(--muted);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.keys{font-size:11px;color:var(--muted);margin-top:18px}
.hint{margin-top:4px}
@media (max-width:900px){
  .crumb{display:block}
  .cols{grid-template-columns:minmax(0,2fr) minmax(0,3fr)}
  .cols.has-c3 .c1{display:none}
  .cols:not(.has-c3) .c3{display:none}
}
@media (max-width:560px){
  .cols,.cols.has-c3{grid-template-columns:minmax(0,1fr)}
  .cols.has-c2 .c1,.cols.has-c3 .c2{display:none}
  .cols:not(.has-c2) .c2{display:none}
}
a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline}
code,.mono{font-family:var(--mono);font-size:.92em}
.sub{color:var(--muted)}
ol.read{margin:0;padding-left:18px;display:grid;gap:6px}
.links{font-family:var(--mono);font-size:12px;white-space:nowrap;display:inline-flex;gap:4px;align-items:center}
.links a{display:inline-block;padding:1px 8px;border:1px solid var(--line);border-radius:4px;line-height:1.6}
.links a:hover{background:var(--hover);text-decoration:none}
.chip{font-family:var(--mono);font-size:10.5px;padding:0 6px;border-radius:999px;border:1px solid var(--line);color:var(--muted);white-space:nowrap;font-weight:400}
.chip.added{color:var(--add);border-color:var(--add)}.chip.changed{color:var(--chg);border-color:var(--chg)}.chip.removed{color:var(--del);border-color:var(--del)}
.chip.tag-logic{color:var(--fg);border-color:var(--fg)}
.chip.warn{color:var(--warn);border-color:var(--warn)}.chip.start{color:var(--add);border-color:var(--add)}
.dg{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:12px;overflow:auto;min-width:0;margin:10px 0}
.dg pre.mermaid{margin:0;background:transparent;color:var(--fg)}
.dg foreignObject{overflow:visible}
.dg .nl{font:inherit;font-size:.9em;white-space:nowrap;display:inline-flex;gap:6px;margin-top:3px}
.dg .nl a{color:#1d4ed8;background:rgba(255,255,255,.85);border:1px solid #1d4ed8;border-radius:4px;padding:0 5px;line-height:1.5;text-decoration:none;cursor:pointer}
.dg .nl a:hover{background:#1d4ed8;color:#fff}
.kc{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;padding:7px 10px;margin:0 0 6px;border:1px solid var(--line);border-radius:8px}
.dec{display:grid;grid-template-columns:64px minmax(0,1fr);gap:2px 10px;padding:7px 10px;margin:4px 0 8px;border:1px solid var(--line);border-left:3px solid var(--warn);border-radius:6px}
.dec b{color:var(--muted);font-weight:500}
.decw>a{font-size:12px}
.tbl{overflow-x:auto;border:1px solid var(--line);border-radius:8px;margin:6px 0}
table{border-collapse:collapse;width:100%}
th,td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:500}
tr:last-child td{border-bottom:none}
tr.gap td{background:color-mix(in srgb,var(--warn) 14%,transparent)}
tr.gone td:first-child{text-decoration:line-through;color:var(--muted)}
details summary{cursor:pointer;margin:6px 0}
.files{border:1px solid var(--line);border-radius:8px}
.file{display:flex;gap:10px;padding:8px 12px;border-bottom:1px solid var(--line)}
.file:last-child{border-bottom:none}
.file.done{opacity:.55}
.fbody{display:grid;gap:2px;min-width:0}
.file .top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.file .path{font-family:var(--mono);font-size:12.5px;overflow-wrap:anywhere}
.file .what{color:var(--muted)}
.rev{padding-top:2px}
[data-files].done{color:var(--add)}
ul.ba{margin:0;padding-left:18px;display:grid;gap:4px}
.q{margin:0;padding-left:18px;display:grid;gap:8px}
.q li{padding-left:2px}
.q .src{font-size:12px}
`;
