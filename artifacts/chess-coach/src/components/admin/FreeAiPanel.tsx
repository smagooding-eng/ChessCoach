import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

// Free AI keys for admin work (SEO articles and translations, marketing copy,
// outreach drafts and searches, bulk puzzle explanations), so those stop
// using paid OpenAI credits. Players' features keep their current AI.

type Provider = 'gemini' | 'groq';
type Status = Record<Provider, { set: boolean; fromEnv: boolean; model: string | null; keyHint: string | null }>;

const INFO: Record<Provider, { name: string; url: string; note: string }> = {
  gemini: { name: 'Google Gemini', url: 'https://aistudio.google.com/apikey', note: 'Best quality, and the only free one that can search the web (club and backlink searches). Google may use what is sent on the free tier to improve its products; only admin content is sent.' },
  groq: { name: 'Groq', url: 'https://console.groq.com/keys', note: 'Very fast open models. Used when Gemini is not set or hits its daily limit. No web search.' },
};

const CARD = { background: '#0D1516', border: '1px solid rgba(255,255,255,.08)' };
const INPUT = { background: '#121B1D', color: '#F5F7F6', border: '1px solid rgba(255,255,255,.10)' };

export function FreeAiPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [keys, setKeys] = useState<Record<Provider, string>>({ gemini: '', groq: '' });
  const [busy, setBusy] = useState<Provider | null>(null);
  const [msg, setMsg] = useState<{ p: Provider; ok: boolean; text: string } | null>(null);

  useEffect(() => {
    apiFetch('/api/admin/free-ai', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setStatus(d)).catch(() => {});
  }, []);

  const save = async (p: Provider) => {
    setBusy(p); setMsg(null);
    try {
      const r = await apiFetch('/api/admin/free-ai', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: p, key: keys[p] }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not save');
      setStatus(d.status); setKeys((k) => ({ ...k, [p]: '' }));
      setMsg({ p, ok: true, text: `Working. Using ${d.model}.` });
    } catch (e) { setMsg({ p, ok: false, text: e instanceof Error ? e.message : 'Could not save' }); }
    finally { setBusy(null); }
  };
  const remove = async (p: Provider) => {
    setBusy(p); setMsg(null);
    const r = await apiFetch(`/api/admin/free-ai/${p}`, { method: 'DELETE', credentials: 'include' }).catch(() => null);
    const d = r?.ok ? await r.json() : null;
    if (d?.status) setStatus(d.status);
    setBusy(null);
  };

  const anySet = !!status && (status.gemini.set || status.groq.set);
  return (
    <div className="rounded-2xl p-5 mb-4" style={CARD}>
      <h2 className="text-sm font-bold">Free AI for admin work</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        SEO articles and translations, marketing copy, outreach drafts and searches, and bulk puzzle explanations use these free keys instead of OpenAI.
        Players' features (game reviews, courses, the coach) are unchanged. If the free limit runs out, those admin jobs pause until the next day instead of spending credits.
      </p>
      <p className="mt-2 text-xs font-bold" style={{ color: anySet ? '#81B64C' : '#F5C542' }}>
        {status ? (anySet ? 'On: admin AI is free.' : 'Off: admin AI still uses OpenAI. Add a key below.') : 'Checking…'}
      </p>
      <div className="mt-3 space-y-3">
        {(['gemini', 'groq'] as Provider[]).map((p) => {
          const st = status?.[p];
          return (
            <div key={p} className="rounded-xl p-3" style={{ background: '#121B1D', border: '1px solid rgba(255,255,255,.06)' }}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-bold">{INFO[p].name}</p>
                <a href={INFO[p].url} target="_blank" rel="noreferrer" className="text-[11.5px] font-bold underline" style={{ color: '#81B64C' }}>Get a free key</a>
              </div>
              <p className="mt-1 text-[11.5px] text-muted-foreground">{INFO[p].note}</p>
              {st?.set ? (
                <div className="mt-2 flex items-center justify-between gap-2 text-[12px]">
                  <span>Key {st.keyHint} · {st.model ?? 'picking a model'}{st.fromEnv ? ' · from the server settings' : ''}</span>
                  {!st.fromEnv && <button onClick={() => remove(p)} disabled={busy === p} className="rounded-lg px-2.5 py-1 text-[11.5px] font-bold disabled:opacity-50" style={INPUT}>Remove</button>}
                </div>
              ) : (
                <div className="mt-2 flex gap-2">
                  <input type="password" autoComplete="off" value={keys[p]} onChange={(e) => setKeys((k) => ({ ...k, [p]: e.target.value }))}
                    placeholder={p === 'gemini' ? 'Paste your Gemini API key' : 'Paste your Groq API key'} className="min-w-0 flex-1 rounded-lg px-3 py-2 text-[12.5px]" style={INPUT} />
                  <button onClick={() => save(p)} disabled={busy === p || keys[p].trim().length < 10} className="rounded-lg px-3 py-2 text-[12.5px] font-extrabold disabled:opacity-50" style={{ background: '#81B64C', color: '#06110A' }}>
                    {busy === p ? 'Testing…' : 'Save'}
                  </button>
                </div>
              )}
              {msg?.p === p && <p className="mt-1.5 text-[11.5px] font-semibold" style={{ color: msg.ok ? '#81B64C' : '#FF6B6B' }}>{msg.text}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
