import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useLocation } from 'wouter';
import { Loader2, ArrowRight, Crosshair, BookOpen, ChevronRight, Globe } from 'lucide-react';
import { Chess } from 'chess.js';
import { apiFetch } from '@/lib/api';
import { setPageMeta } from '@/lib/pageMeta';
import { useUser } from '@/hooks/use-user';
import { RD, DIFFICULTY_BADGE } from '@/lib/redesignTheme';
import { QuickSignup, GoogleMark } from '@/components/QuickSignup';
import { FenThumb } from '@/components/FenThumb';
import { getLang, LANGUAGES } from '@/lib/i18n';

// Public, search-friendly pages: /play-chess-online, /chess-for-kids, ...,
// their translations at /es/..., and the opening and trap pages. Open to
// everyone and indexable. The same text is put into the page's HTML before
// the app loads (see /api/page on Vercel), so search engines and AI tools
// that don't run JavaScript read the same thing people see.

interface SeoLink { label: string; href: string }
interface SeoPage {
  key: string; lang: string; path: string; title: string; description: string; h1: string; intro: string;
  sections: { h: string; p: string; links?: SeoLink[] }[]; faq: { q: string; a: string }[]; cta: SeoLink;
  alternates: { lang: string; path: string }[]; related: SeoLink[];
}

// Where each page's button goes once someone is signed in.
const IN_APP: Record<string, string> = {
  home: '/', 'play-chess-online': '/live', 'chess-for-kids': '/kids', 'learn-chess': '/beginner', 'chess-puzzles': '/puzzles',
  'chess-tournaments': '/tournaments', 'chess-game-analysis': '/games', 'scout-chess-opponent': '/opponents', pricing: '/subscription',
};
// Pages a visitor can open without an account: the button goes straight there.
const OPEN_TO_VISITORS = new Set(['/kids', '/beginner', '/tournaments']);
export const SEO_KEYS = Object.keys(IN_APP).filter((k) => k !== 'home' && k !== 'pricing');
const LANG_LABEL = new Map(LANGUAGES.map((l) => [l.code, l.name]));
const isRtl = (l: string) => l === 'ar' || l === 'fa';

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[18px] p-4 ${className}`} style={{ background: RD.card, border: `1px solid ${RD.border}` }}>{children}</section>;
}

function TopBar() {
  const { isAuthenticated } = useUser();
  return (
    <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 pt-4">
      <Link href="/" className="text-[15px] font-black" style={{ color: RD.text }}>ChessScout<span style={{ color: RD.green }}>.net</span></Link>
      {!isAuthenticated && <a href={`${import.meta.env.BASE_URL}setup?signup=login`} className="text-[13px] font-bold" style={{ color: RD.muted }}>Sign in</a>}
    </div>
  );
}

/** The page's main button: one-tap signup for visitors (then straight to `inApp`), a plain link for members. */
function CtaButton({ label, inApp, title }: { label: string; inApp: string; title: string }) {
  const { isAuthenticated } = useUser();
  const [open, setOpen] = useState(false);
  if (isAuthenticated || OPEN_TO_VISITORS.has(inApp)) {
    return (
      <Link href={inApp} className="inline-flex items-center gap-2 rounded-[14px] px-5 py-3 text-[15px] font-extrabold" style={{ background: RD.green, color: '#FFFFFF' }}>
        {label} <ArrowRight size={16} />
      </Link>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2.5 rounded-[14px] px-5 py-3 text-[15px] font-extrabold"
        style={{ background: '#FFFFFF', color: '#1F1F1F' }}>
        <GoogleMark /> {label}
      </button>
      <QuickSignup open={open} onClose={() => setOpen(false)} title={title} returnTo={inApp === '/' ? null : inApp} />
    </>
  );
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return href.startsWith('/') && !href.startsWith('/setup')
    ? <Link href={href} className="inline-flex items-center gap-1 font-bold" style={{ color: RD.green }}>{children} <ChevronRight size={14} /></Link>
    : <a href={href.startsWith('/') ? `${import.meta.env.BASE_URL}${href.slice(1)}` : href} className="inline-flex items-center gap-1 font-bold" style={{ color: RD.green }}>{children} <ChevronRight size={14} /></a>;
}

function useFaqLd(faq: { q: string; a: string }[] | undefined) {
  useEffect(() => {
    if (!faq?.length) return;
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.dataset.cs = 'seo-faq';
    el.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
    document.head.appendChild(el);
    return () => { el.remove(); };
  }, [faq]);
}

function Spinner() {
  return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: RD.green }} /></div>;
}

/** One of the search-friendly pages, in the language from the address (or the visitor's own when it has one). */
export function SeoLanding({ pageKey, lang }: { pageKey?: string; lang?: string }) {
  const params = useParams<{ key?: string }>();
  const [location] = useLocation();
  const key = pageKey ?? params.key ?? location.replace(/^\//, '').split('/')[0];
  const want = lang ?? getLang();
  const [page, setPage] = useState<SeoPage | null | undefined>(undefined);
  useEffect(() => {
    setPage(undefined);
    apiFetch(`/api/public/seo/page/${encodeURIComponent(key)}?lang=${encodeURIComponent(want)}`)
      .then((r) => (r.ok ? r.json() : null)).then((d) => setPage(d?.page ?? null)).catch(() => setPage(null));
  }, [key, want]);
  useEffect(() => {
    if (!page) return;
    // Canonical: the address for the language actually shown.
    setPageMeta(page.title, page.description, page.path);
  }, [page]);
  useFaqLd(page?.faq);

  if (page === undefined) return <><TopBar /><Spinner /></>;
  if (!page) return <><TopBar /><p className="py-16 text-center text-sm" style={{ color: RD.muted }}>This page isn't available right now.</p></>;
  const others = page.alternates.filter((a) => a.lang !== page.lang);
  return (
    <div dir={isRtl(page.lang) ? 'rtl' : undefined} lang={page.lang} translate={page.lang === want ? 'no' : undefined}>
      <TopBar />
      <main className="mx-auto w-full max-w-3xl space-y-3 px-4 pb-28 pt-5 md:pb-12">
        <h1 className="text-[28px] font-black leading-tight sm:text-[34px]" style={{ color: RD.text }}>{page.h1}</h1>
        <p className="text-[15px] leading-relaxed" style={{ color: RD.muted }}>{page.intro}</p>
        <div className="pt-1"><CtaButton label={page.cta.label} inApp={IN_APP[page.key] ?? '/'} title={page.h1} /></div>
        <div className="grid gap-3 pt-2 sm:grid-cols-2">
          {page.sections.map((s) => (
            <Card key={s.h}>
              <h2 className="text-[16px] font-extrabold" style={{ color: RD.text }}>{s.h}</h2>
              <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: RD.muted }}>{s.p}</p>
              {s.links?.length ? <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">{s.links.map((l) => <A key={l.href} href={l.href}>{l.label}</A>)}</div> : null}
            </Card>
          ))}
        </div>
        {page.faq.length > 0 && (
          <Card>
            {page.faq.map((f) => (
              <div key={f.q} className="py-2">
                <h3 className="text-[14.5px] font-extrabold" style={{ color: RD.text }}>{f.q}</h3>
                <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: RD.muted }}>{f.a}</p>
              </div>
            ))}
          </Card>
        )}
        <Card className="text-center">
          <p className="text-[16px] font-extrabold" style={{ color: RD.text }}>{page.h1}</p>
          <div className="mt-3"><CtaButton label={page.cta.label} inApp={IN_APP[page.key] ?? '/'} title={page.h1} /></div>
        </Card>
        {page.related.length > 0 && (
          <nav className="flex flex-wrap gap-x-5 gap-y-2 px-1 pt-1 text-[13.5px]">
            {page.related.map((r) => <A key={r.href} href={r.href}>{r.label}</A>)}
          </nav>
        )}
        {others.length > 0 && (
          <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pt-2 text-[12px]" style={{ color: RD.muted }}>
            <Globe size={13} />
            {others.map((a) => <a key={a.lang} href={a.path} hrefLang={a.lang} className="underline" style={{ color: RD.muted }}>{LANG_LABEL.get(a.lang) ?? a.lang}</a>)}
          </nav>
        )}
      </main>
    </div>
  );
}

// ── Openings ──────────────────────────────────────────────────────────────
type Tally = { games: number; wins: number; draws: number; losses: number };
interface OpeningSummary { slug: string; name: string; games: number; players: number; asWhite: Tally; asBlack: Tally; moves: string | null }
interface OpeningDetail extends OpeningSummary {
  note: string | null;
  topPlayers: { slug: string; name: string; title: string | null; color: 'white' | 'black'; games: number; score: number }[];
}
const score = (t: Tally) => (t.games ? Math.round(((t.wins + t.draws * 0.5) / t.games) * 100) : 0);

export function ChessOpeningsIndex() {
  const [list, setList] = useState<OpeningSummary[] | null>(null);
  useEffect(() => {
    setPageMeta('Chess Openings: What Top Players Play & How They Score | ChessScout', 'The chess openings top Chess.com players and grandmasters choose most, and how they score with each as White and Black, from their real games.', '/chess-openings');
    apiFetch('/api/public/openings').then((r) => (r.ok ? r.json() : { openings: [] })).then((d) => setList(d.openings ?? [])).catch(() => setList([]));
  }, []);
  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-3xl space-y-3 px-4 pb-28 pt-5 md:pb-12">
        <h1 className="text-[28px] font-black leading-tight" style={{ color: RD.text }}>Chess openings top players actually play</h1>
        <p className="text-[14.5px] leading-relaxed" style={{ color: RD.muted }}>Built from the real recent games of top Chess.com players and grandmasters: how often each opening is chosen, and how they score with it as White and as Black. Score means wins plus half the draws.</p>
        {list === null ? <Spinner /> : list.length === 0 ? (
          <p className="py-8 text-center text-sm" style={{ color: RD.muted }}>Opening pages are being built — check back soon.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {list.map((o) => (
              <Link key={o.slug} href={`/chess-openings/${o.slug}`} className="flex items-center gap-3 rounded-[16px] px-3.5 py-3" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[14.5px]" style={{ color: RD.text }}>{o.name}</b>
                  <span className="block truncate text-[12px]" style={{ color: RD.muted }}>{o.moves ? `${o.moves} · ` : ''}{o.games.toLocaleString()} games · {o.players} players</span>
                </span>
                <ArrowRight size={16} style={{ color: RD.muted }} />
              </Link>
            ))}
          </div>
        )}
        <Card className="text-center">
          <p className="text-[15px] font-extrabold" style={{ color: RD.text }}>Drill your own openings</p>
          <p className="mt-1 text-[13px]" style={{ color: RD.muted }}>The Opening Trainer is free: practice the lines you play until they're automatic.</p>
          <div className="mt-3"><CtaButton label="Train openings free" inApp="/openings" title="Train your openings free" /></div>
        </Card>
      </main>
    </>
  );
}

export function ChessOpeningPage() {
  const { slug } = useParams<{ slug: string }>();
  const [o, setO] = useState<OpeningDetail | null | undefined>(undefined);
  useEffect(() => {
    setO(undefined);
    apiFetch(`/api/public/openings/${encodeURIComponent(slug)}`).then((r) => (r.ok ? r.json() : null)).then((d) => setO(d?.opening ?? null)).catch(() => setO(null));
  }, [slug]);
  useEffect(() => {
    if (o) setPageMeta(`${o.name}: How Top Players Score With It | ChessScout`, `${o.name}${o.moves ? ` (${o.moves})` : ''}: how top Chess.com players and grandmasters score with it as White and Black, and who plays it most, from ${o.games.toLocaleString()} real games.`, `/chess-openings/${o.slug}`);
  }, [o]);
  if (o === undefined) return <><TopBar /><Spinner /></>;
  if (!o) return <><TopBar /><p className="py-16 text-center text-sm" style={{ color: RD.muted }}>We don't have a page for that opening yet. <Link href="/chess-openings" className="underline">See all openings</Link></p></>;
  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-3xl space-y-3 px-4 pb-28 pt-5 md:pb-12">
        <p className="text-[13px]"><Link href="/chess-openings" style={{ color: RD.muted }}>Chess openings</Link></p>
        <h1 className="text-[28px] font-black leading-tight" style={{ color: RD.text }}>{o.name}</h1>
        {o.moves && <p className="text-[15px] font-bold" style={{ color: RD.green }}>{o.moves}</p>}
        {o.note && <p className="text-[14.5px] leading-relaxed" style={{ color: RD.muted }}>{o.note}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {([['As White', o.asWhite], ['As Black', o.asBlack]] as const).map(([label, t]) => (
            <Card key={label}>
              <h2 className="text-[15px] font-extrabold" style={{ color: RD.text }}>{label}</h2>
              {t.games ? (
                <p className="mt-1 text-[13.5px]" style={{ color: RD.muted }}>
                  <b className="text-[22px]" style={{ color: RD.text }}>{score(t)}%</b> score in {t.games.toLocaleString()} games ({t.wins} wins, {t.draws} draws, {t.losses} losses)
                </p>
              ) : <p className="mt-1 text-[13.5px]" style={{ color: RD.muted }}>Not played with this color by players on our list.</p>}
            </Card>
          ))}
        </div>
        <Card>
          <h2 className="text-[15px] font-extrabold" style={{ color: RD.text }}>Who plays it most</h2>
          <div className="mt-2 divide-y" style={{ borderColor: RD.border }}>
            {o.topPlayers.map((p) => (
              <Link key={`${p.slug}-${p.color}`} href={`/players/${p.slug}`} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
                <span className="min-w-0 truncate font-bold" style={{ color: RD.text }}>{p.title ? `${p.title} ` : ''}{p.name}</span>
                <span className="shrink-0 tabular-nums" style={{ color: RD.muted }}>{p.color === 'white' ? 'White' : 'Black'} · {p.games} games · {p.score}%</span>
              </Link>
            ))}
          </div>
        </Card>
        <Card className="text-center">
          <p className="text-[15px] font-extrabold" style={{ color: RD.text }}>Facing the {o.name}?</p>
          <p className="mt-1 text-[13px]" style={{ color: RD.muted }}>Scout your opponent to see if they play it, then drill your answer in the Opening Trainer. Both are free.</p>
          <div className="mt-3"><CtaButton label="Scout my opponent free" inApp="/opponents" title="Scout your opponent free" /></div>
        </Card>
        <p className="px-1 text-[11.5px] leading-relaxed" style={{ color: RD.muted }}>From the recent public Chess.com games of {o.players} players on our <Link href="/players" className="underline">top players list</Link>, updated about once a week. Score = wins plus half the draws.</p>
      </main>
    </>
  );
}

// ── Traps ─────────────────────────────────────────────────────────────────
interface PublicTrap {
  id?: number; slug: string; name: string; category: string; difficulty: string; trapSide: string; summary: string;
  explanation?: string; startingFen?: string; moves?: string[]; moveNotes?: string[]; criticalMoveIndex?: number; safeMoves?: string[];
}

function Difficulty({ d }: { d: string }) {
  const b = DIFFICULTY_BADGE[d] ?? DIFFICULTY_BADGE.beginner;
  return <span className="rounded-full px-2 py-0.5 text-[11px] font-bold capitalize" style={{ background: b.bg, color: b.fg }}>{d}</span>;
}

export function ChessTrapsIndex() {
  const [list, setList] = useState<PublicTrap[] | null>(null);
  useEffect(() => {
    setPageMeta('Chess Opening Traps: Learn, Set & Avoid Them | ChessScout', 'Classic chess opening traps explained move by move: how each one works, the move that falls for it, and the safe reply. Practice them free.', '/chess-traps');
    apiFetch('/api/public/traps').then((r) => (r.ok ? r.json() : { traps: [] })).then((d) => setList(d.traps ?? [])).catch(() => setList([]));
  }, []);
  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-3xl space-y-3 px-4 pb-28 pt-5 md:pb-12">
        <h1 className="text-[28px] font-black leading-tight" style={{ color: RD.text }}>Chess opening traps</h1>
        <p className="text-[14.5px] leading-relaxed" style={{ color: RD.muted }}>The traps players fall into most, explained move by move: how each one works, the move that falls for it, and the safe reply. Practice setting them and avoiding them, free.</p>
        {list === null ? <Spinner /> : (
          <div className="grid gap-2 sm:grid-cols-2">
            {list.map((t) => (
              <Link key={t.slug} href={`/chess-traps/${t.slug}`} className="flex items-center gap-3 rounded-[16px] px-3.5 py-3" style={{ background: RD.card, border: `1px solid ${RD.border}` }}>
                <Crosshair size={18} style={{ color: RD.green }} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[14.5px]" style={{ color: RD.text }}>{t.name}</b>
                  <span className="block truncate text-[12px]" style={{ color: RD.muted }}>{t.category}</span>
                </span>
                <Difficulty d={t.difficulty} />
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

/** "1.e4 e5 2.Nf3" style numbering from a FEN's move number and side to move. */
export function numberedMoves(fen: string, moves: string[]): { label: string; san: string }[] {
  const parts = fen.split(' ');
  let n = parseInt(parts[5] || '1', 10) || 1;
  let white = (parts[1] || 'w') === 'w';
  return moves.map((san) => {
    const label = white ? `${n}.` : `${n}...`;
    if (!white) n++;
    white = !white;
    return { label, san };
  });
}

export function ChessTrapPage() {
  const { slug } = useParams<{ slug: string }>();
  const [t, setT] = useState<PublicTrap | null | undefined>(undefined);
  useEffect(() => {
    setT(undefined);
    apiFetch(`/api/public/traps/${encodeURIComponent(slug)}`).then((r) => (r.ok ? r.json() : null)).then((d) => setT(d?.trap ?? null)).catch(() => setT(null));
  }, [slug]);
  useEffect(() => {
    if (t) setPageMeta(`${t.name}: Chess Trap Explained Move by Move | ChessScout`, `${t.summary} How the ${t.name} works, the move that falls for it, and how to avoid it.`, `/chess-traps/${t.slug}`);
  }, [t]);
  const finalFen = useMemo(() => {
    if (!t?.startingFen || !t.moves) return null;
    try { const c = new Chess(t.startingFen); for (const m of t.moves) c.move(m); return c.fen(); } catch { return null; }
  }, [t]);
  if (t === undefined) return <><TopBar /><Spinner /></>;
  if (!t) return <><TopBar /><p className="py-16 text-center text-sm" style={{ color: RD.muted }}>We couldn't find that trap. <Link href="/chess-traps" className="underline">See all traps</Link></p></>;
  const moves = numberedMoves(t.startingFen ?? '', t.moves ?? []);
  const crit = t.criticalMoveIndex ?? -1;
  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-3xl space-y-3 px-4 pb-28 pt-5 md:pb-12">
        <p className="text-[13px]"><Link href="/chess-traps" style={{ color: RD.muted }}>Chess traps</Link></p>
        <div className="flex flex-wrap items-center gap-2"><Difficulty d={t.difficulty} /><span className="text-[12.5px]" style={{ color: RD.muted }}>{t.category} · set by {t.trapSide === 'white' ? 'White' : 'Black'}</span></div>
        <h1 className="text-[28px] font-black leading-tight" style={{ color: RD.text }}>{t.name}</h1>
        <p className="text-[15px] leading-relaxed" style={{ color: RD.text }}>{t.summary}</p>
        {t.explanation && <p className="text-[14px] leading-relaxed" style={{ color: RD.muted }}>{t.explanation}</p>}
        <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
          {finalFen && <Card className="flex justify-center"><FenThumb fen={finalFen} size={200} /></Card>}
          <Card>
            <h2 className="text-[15px] font-extrabold" style={{ color: RD.text }}>Move by move</h2>
            <ol className="mt-2 space-y-1.5">
              {moves.map((m, i) => (
                <li key={i} className="text-[13.5px] leading-snug" style={{ color: RD.muted }}>
                  <b style={{ color: i === crit ? RD.red : RD.text }}>{m.label} {m.san}</b>
                  {i === crit && <span className="ml-1 text-[11.5px] font-bold" style={{ color: RD.red }}>(the mistake)</span>}
                  {t.moveNotes?.[i] && <> — {t.moveNotes[i]}</>}
                </li>
              ))}
            </ol>
            {t.safeMoves?.length ? <p className="mt-3 text-[13.5px]" style={{ color: RD.text }}><b>Safe instead:</b> {t.safeMoves.join(', ')}</p> : null}
          </Card>
        </div>
        <Card className="text-center">
          <BookOpen size={20} className="mx-auto" style={{ color: RD.green }} />
          <p className="mt-1 text-[15px] font-extrabold" style={{ color: RD.text }}>Practice the {t.name}</p>
          <p className="mt-1 text-[13px]" style={{ color: RD.muted }}>Play it on a real board from both sides: set the trap, then learn to avoid it. Free.</p>
          <div className="mt-3"><CtaButton label="Practice this trap free" inApp={t.id ? `/traps/${t.id}` : '/traps'} title={`Practice the ${t.name}`} /></div>
        </Card>
      </main>
    </>
  );
}

/** /es, /pt, ...: the home page in that language. Members go to their dashboard. */
export function LangHome({ Landing }: { Landing: React.ComponentType }) {
  const { isAuthenticated } = useUser();
  const [, navigate] = useLocation();
  useEffect(() => { if (isAuthenticated) navigate('/', { replace: true } as never); }, [isAuthenticated, navigate]);
  return isAuthenticated ? null : <Landing />;
}
