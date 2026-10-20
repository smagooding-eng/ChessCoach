// Translates the app's on-screen text from our own dictionaries, without
// touching page code: every text node (and placeholder / aria-label / title /
// alt) whose English text is in the dictionary is swapped for the
// translation, as the page renders and whenever React updates it.
//
// Used for the languages we translate ourselves (es, pt, fr, de) instead of
// Google's translator: better wording, and no fights with React (we only
// change a text node's value, which React tolerates; Google wraps nodes in
// <font>). Anything not in the dictionary stays English. Regions marked
// translate="no" (or .notranslate) are left alone: usernames, moves, and
// sections already rendered with t().

const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'] as const;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'NOSCRIPT', 'SVG']);

let dict: Record<string, string> = {};
let patterns: { re: RegExp; names: string[]; out: string }[] = [];
// What we last wrote into each node, so our own change doesn't loop.
const written = new WeakMap<Node, string>();

function compilePatterns() {
  patterns = [];
  for (const [en, tr] of Object.entries(dict)) {
    if (!en.includes('{')) continue;
    const names: string[] = [];
    const src = en.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{(\w+)\\?\}/g, (_m, n) => { names.push(n); return '(.+?)'; });
    if (!names.length) continue;
    try { patterns.push({ re: new RegExp(`^${src}$`), names, out: tr }); } catch { /* skip */ }
  }
}

function lookup(core: string): string | null {
  const hit = dict[core];
  if (hit !== undefined) return hit;
  for (const p of patterns) {
    const m = p.re.exec(core);
    if (!m) continue;
    let out = p.out;
    p.names.forEach((n, i) => { out = out.split(`{${n}}`).join(dict[m[i + 1]] ?? m[i + 1]); });
    return out;
  }
  return null;
}

/** Translate a raw string, keeping its surrounding whitespace. */
function translate(raw: string): string | null {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw);
  if (!m) return null;
  const core = m[2].replace(/\s+/g, ' ');
  if (core.length < 2 || !/[A-Za-z]/.test(core)) return null;
  const out = lookup(core);
  return out === null || out === core ? null : m[1] + out + m[3];
}

function excluded(el: Element | null): boolean {
  for (let e = el; e; e = e.parentElement) {
    if (SKIP_TAGS.has(e.tagName.toUpperCase())) return true;
    if (e.getAttribute('translate') === 'no' || e.classList.contains('notranslate')) return true;
    if ((e as HTMLElement).isContentEditable) return true;
  }
  return false;
}

function doText(node: Text) {
  const v = node.nodeValue ?? '';
  if (written.get(node) === v) return;
  if (excluded(node.parentElement)) return;
  const out = translate(v);
  if (out !== null) { written.set(node, out); node.nodeValue = out; }
}

function doAttrs(el: Element) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    const key = `${a}`;
    const marker = (el as unknown as Record<string, unknown>)[`__cs_${key}`];
    if (marker === v) continue;
    const out = translate(v);
    if (out !== null) { (el as unknown as Record<string, unknown>)[`__cs_${key}`] = out; el.setAttribute(a, out); }
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) { doText(root as Text); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (excluded(el)) return;
  doAttrs(el);
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => {
      if (n.nodeType === Node.ELEMENT_NODE) {
        const e = n as Element;
        if (SKIP_TAGS.has(e.tagName.toUpperCase()) || e.getAttribute('translate') === 'no' || e.classList.contains('notranslate')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null = tw.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text); else doAttrs(n as Element);
    n = tw.nextNode();
  }
}

let started = false;
/** Start translating the page with this dictionary (call once, after it's loaded). */
export function startDomTranslate(d: Record<string, string>) {
  if (started || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  started = true;
  dict = d;
  compilePatterns();
  const pending = new Set<Node>();
  let scheduled = false;
  const flush = () => {
    scheduled = false;
    const nodes = [...pending];
    pending.clear();
    for (const n of nodes) if (n.isConnected) walk(n);
  };
  const queue = (n: Node) => {
    pending.add(n);
    if (!scheduled) { scheduled = true; queueMicrotask(flush); }
  };
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') queue(m.target);
      else if (m.type === 'attributes') queue(m.target);
      else m.addedNodes.forEach(queue);
    }
  });
  const begin = () => {
    walk(document.body);
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
  };
  if (document.body) begin(); else document.addEventListener('DOMContentLoaded', begin, { once: true });
}
