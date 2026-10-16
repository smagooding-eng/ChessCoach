import React from 'react';
import { Globe } from 'lucide-react';
import { LANGUAGES, getLang, setLang, t } from '@/lib/i18n';

// Native <select>: works with every screen reader and gives phones their own
// picker. Language names are written in their own language and marked
// translate="no" so they stay readable whatever the page is translated into.

export function LanguageSelect({ className, style, compact }: { className?: string; style?: React.CSSProperties; compact?: boolean }) {
  const lang = getLang();
  return (
    <label translate="no" className={`notranslate relative inline-flex items-center gap-1.5 ${className ?? ''}`} style={style}>
      <Globe size={compact ? 13 : 15} className="pointer-events-none shrink-0 opacity-80" aria-hidden />
      <span className="sr-only">{t('Language')}</span>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        className="cursor-pointer appearance-none bg-transparent pr-1 outline-none"
        style={{ color: 'inherit', font: 'inherit' }}
      >
        {LANGUAGES.map((l) => <option key={l.code} value={l.code} style={{ color: '#111' }}>{l.name}</option>)}
      </select>
    </label>
  );
}

/** Settings block: the picker plus a plain note on how each language is translated. */
export function LanguageSettings({ text, muted, card, border }: { text: string; muted: string; card: string; border: string }) {
  const lang = getLang();
  const native = LANGUAGES.find((l) => l.code === lang)?.native;
  return (
    <section>
      <h2 className="mb-1 text-sm font-black uppercase tracking-wide" style={{ color: muted }}>{t('Language')}</h2>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3" style={{ background: card, border: `1px solid ${border}` }}>
        <LanguageSelect className="rounded-lg px-3 py-2 text-[14px] font-bold" style={{ color: text, background: 'rgba(255,255,255,.06)', border: `1px solid ${border}` }} />
        <p className="min-w-[12rem] flex-1 text-xs" style={{ color: muted }}>
          {lang === 'en'
            ? 'English is the original. Other languages translate the whole site.'
            : native
              ? t('The main pages are translated by us; the rest of the app is translated automatically by Google.')
              : 'This language is translated automatically by Google, so some wording may be off.'}
        </p>
      </div>
    </section>
  );
}
