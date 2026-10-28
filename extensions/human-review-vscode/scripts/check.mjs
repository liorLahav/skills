// Parse every Mermaid diagram in a review.json and render the panel HTML.
// Usage: npm run check [-- path/to/review.json]   (default: the sample). Run `npm run compile` first.
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { JSDOM } from 'jsdom';

const req = createRequire(import.meta.url);
const fs = req('fs');
const dom = new JSDOM('');
// Mermaid's parser needs a DOM (DOMPurify, Element checks).
for (const k of ['window', 'document', 'Element', 'HTMLElement', 'Node', 'DOMParser', 'navigator']) globalThis[k] ??= k === 'window' ? dom.window : dom.window[k];
const { default: mermaid } = await import(pathToFileURL(req.resolve('mermaid')).href);
const { renderHtml } = req('../out/render.js');
const { validate } = req('../out/schema.js');

const file = process.argv[2] || new URL('../sample/.review/review.json', import.meta.url);
const rv = JSON.parse(fs.readFileSync(file, 'utf8'));
const errs = validate(rv);

const diagrams = [];
const walk = (x, p) => {
  if (!x || typeof x !== 'object') return;
  if (typeof x.mermaid === 'string') diagrams.push([p, x.mermaid]);
  for (const k in x) walk(x[k], `${p}.${k}`);
};
walk(rv, '$');
for (const [p, src] of diagrams) {
  try { await mermaid.parse(src); } catch (e) { errs.push(`${p}: ${String(e.message).split('\n')[0]}`); }
}
renderHtml(rv, { mermaidUri: '', cspSource: '', nonce: '' });

for (const e of errs) console.error('FAIL', e);
console.log(`${diagrams.length} diagrams, ${errs.length} errors`);
process.exit(errs.length ? 1 : 0);
