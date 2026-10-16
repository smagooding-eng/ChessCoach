import React from 'react';

// Site language, two layers:
//  1. Hand-written dictionaries (src/locales/*.ts) for the main public pages in
//     the "native" languages. t('English text') returns the translation, or the
//     English when a string has none yet. Those regions carry translate="no" so
//     Google leaves them alone.
//  2. Google's website translator for everything else (the signed-in app, and
//     every language we don't have a dictionary for). It's driven by the
//     standard googtrans cookie and only loaded when a non-English language is
//     active, so English visitors never download it.
// Changing language reloads the page: the dictionary is picked once at boot and
// Google only reads its cookie on load.

export interface Language { code: string; name: string; native?: boolean }

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', native: true },
  { code: 'es', name: 'Español', native: true },
  { code: 'pt', name: 'Português', native: true },
  { code: 'fr', name: 'Français', native: true },
  { code: 'de', name: 'Deutsch', native: true },
  { code: 'it', name: 'Italiano' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'pl', name: 'Polski' },
  { code: 'ru', name: 'Русский' },
  { code: 'uk', name: 'Українська' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'ro', name: 'Română' },
  { code: 'cs', name: 'Čeština' },
  { code: 'hu', name: 'Magyar' },
  { code: 'el', name: 'Ελληνικά' },
  { code: 'sv', name: 'Svenska' },
  { code: 'ar', name: 'العربية' },
  { code: 'fa', name: 'فارسی' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'bn', name: 'বাংলা' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'th', name: 'ไทย' },
  { code: 'tl', name: 'Filipino' },
  { code: 'zh-CN', name: '简体中文' },
  { code: 'zh-TW', name: '繁體中文' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
];

const STORE = 'cs_lang';
const byCode = new Map(LANGUAGES.map((l) => [l.code.toLowerCase(), l]));

function stored(): string | null {
  try { return localStorage.getItem(STORE); } catch { return null; }
}

/** Match a browser locale ("pt-BR", "zh-Hant-TW") to one of ours. */
function match(locale: string): string | null {
  const l = locale.toLowerCase();
  if (byCode.has(l)) return byCode.get(l)!.code;
  if (l.startsWith('zh')) return /tw|hk|mo|hant/.test(l) ? 'zh-TW' : 'zh-CN';
  if (l === 'fil' || l.startsWith('fil-')) return 'tl';
  const base = l.split('-')[0];
  return byCode.get(base)?.code ?? null;
}

function detect(): string {
  const saved = stored();
  if (saved && byCode.has(saved.toLowerCase())) return byCode.get(saved.toLowerCase())!.code;
  // No choice made yet: follow the browser, so a visitor reading in Spanish
  // lands on Spanish. Crawlers send English and get the original.
  const prefs = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : [];
  for (const p of prefs) { if (!p) continue; const m = match(p); if (m) return m; }
  return 'en';
}

let current = typeof window !== 'undefined' ? detect() : 'en';
let dict: Record<string, string> = {};

export const getLang = () => current;
/** Locale for toLocaleString: the browser's own for English (keeps en-GB dates etc.), else the chosen language. */
export const dateLocale = (): string | undefined => (current === 'en' ? undefined : current);
export const isNativeLang = (code = current) => !!byCode.get(code.toLowerCase())?.native;
export const langChosen = () => !!stored();

function fill(s: string, vars?: Record<string, string | number>) {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Translate an English UI string; falls back to the English. */
export function t(en: string, vars?: Record<string, string | number>): string {
  return fill(dict[en] ?? en, vars);
}

/** Like t(), but placeholders can be elements: tn('{name} won', { name: <b>X</b> }). */
export function tn(en: string, vars: Record<string, React.ReactNode>): React.ReactNode {
  const s = dict[en] ?? en;
  const parts = s.split(/(\{\w+\})/g);
  return parts.map((p, i) => {
    const m = /^\{(\w+)\}$/.exec(p);
    if (m && m[1] in vars) return React.createElement(React.Fragment, { key: i }, vars[m[1]]);
    return p;
  });
}

/** The dictionary is chosen at boot, so t is stable; this is just for symmetry in components. */
export function useT() { return t; }

/** Props for a region we translate ourselves, so Google doesn't translate it twice. */
export function noGT(): { translate?: 'no' } {
  return current !== 'en' && isNativeLang() ? { translate: 'no' } : {};
}

// ── Google website translator ────────────────────────────────────────────────

function cookieDomains(): (string | null)[] {
  const h = location.hostname;
  const parts = h.split('.');
  const root = parts.length >= 2 && !/^\d+$/.test(parts[parts.length - 1]) ? `.${parts.slice(-2).join('.')}` : null;
  return [null, h.includes('.') ? h : null, root].filter((d, i, a) => a.indexOf(d) === i);
}

function writeGoogCookie(value: string | null) {
  for (const d of cookieDomains()) {
    const dom = d ? `; domain=${d}` : '';
    document.cookie = value
      ? `googtrans=${value}; path=/${dom}; max-age=31536000; SameSite=Lax`
      : `googtrans=; path=/${dom}; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
}

// Google rewrites text nodes (wrapping them in <font>), and React then throws
// "Failed to execute 'removeChild'" when it tries to update a node that's moved.
// This is the widely used guard (facebook/react#11538): skip the operation
// instead of crashing the app.
function guardDomForTranslator() {
  if (typeof Node !== 'function' || (Node.prototype as any).__csGuarded) return;
  (Node.prototype as any).__csGuarded = true;
  const removeChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child) as T;
  };
  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, node: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) return node;
    return insertBefore.call(this, node, ref) as T;
  };
}

function loadGoogleTranslate(code: string) {
  guardDomForTranslator();
  writeGoogCookie(`/en/${code}`);
  if (document.getElementById('cs-gt-script')) return;
  const style = document.createElement('style');
  style.textContent = [
    '#google_translate_element,.goog-te-banner-frame,iframe.skiptranslate,.VIpgJd-ZVi9od-ORHb-OEVmcd,#goog-gt-tt,.goog-te-balloon-frame,.goog-tooltip,.VIpgJd-ZVi9od-aZ2wEe-wOHMyf{display:none!important}',
    'body{top:0!important}',
    '.goog-text-highlight,font[style]{background:none!important;box-shadow:none!important}',
  ].join('\n');
  document.head.appendChild(style);
  const box = document.createElement('div');
  box.id = 'google_translate_element';
  document.body.appendChild(box);
  (window as any).googleTranslateElementInit = () => {
    try {
      const g = (window as any).google;
      new g.translate.TranslateElement({ pageLanguage: 'en', autoDisplay: false }, 'google_translate_element');
    } catch { /* translator unavailable: the page simply stays in English */ }
  };
  const s = document.createElement('script');
  s.id = 'cs-gt-script';
  s.async = true;
  s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
  document.body.appendChild(s);
}

const LOADERS: Record<string, () => Promise<{ default: Record<string, string> }>> = {
  es: () => import('@/locales/es'),
  pt: () => import('@/locales/pt'),
  fr: () => import('@/locales/fr'),
  de: () => import('@/locales/de'),
};

/** Call once before the first render. Never throws; at worst the site stays English. */
export async function initI18n(): Promise<void> {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = current;
  if (current === 'en') { writeGoogCookie(null); return; }
  const loader = LOADERS[current];
  if (loader) {
    try { dict = (await loader()).default; } catch { dict = {}; }
  }
  // Google covers whatever our dictionary doesn't (the app pages), in every language.
  try { loadGoogleTranslate(current); } catch { /* ignore */ }
}

/** Save the choice and reload into it. */
export function setLang(code: string) {
  const lang = byCode.get(code.toLowerCase())?.code ?? 'en';
  try { localStorage.setItem(STORE, lang); } catch { /* private mode: still applies for this load */ }
  writeGoogCookie(lang === 'en' ? null : `/en/${lang}`);
  location.reload();
}
