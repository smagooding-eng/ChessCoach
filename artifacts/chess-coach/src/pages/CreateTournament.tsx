import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowLeft, Trophy, Zap, CalendarDays, Users, Clock, Swords, GitBranch, Loader2, Check, Sparkles, Award, ChevronDown, Crown } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { PT, cardStyle, greenBtn, ghostBtn } from '@/lib/playTheme';
import { ShareLink } from '@/components/play/ShareLink';
import { LogoPicker } from '@/components/play/TournamentBranding';

// Create a tournament in one screen: pick a format, the time control, how
// many players and when it starts, then share the link. Player-made
// tournaments are unlisted: only people with the link can find and join.

type Format = 'arena' | 'bracket';
type Kind = 'live' | 'daily';
interface Tc { id: string; label: string }

const PLAYER_PRESETS: { value: number | null; label: string }[] = [
  { value: 4, label: '4' }, { value: 8, label: '8' }, { value: 16, label: '16' }, { value: 32, label: '32' }, { value: null, label: 'No limit' },
];
// Pro tournaments always have a cap, 500 at most.
const PRO_PLAYER_PRESETS: { value: number | null; label: string }[] = [
  { value: 16, label: '16' }, { value: 32, label: '32' }, { value: 64, label: '64' }, { value: 128, label: '128' }, { value: 256, label: '256' }, { value: 500, label: '500 (max)' },
];
const PRO_MAX = 500;
const LIVE_LENGTHS = [{ m: 30, label: '30 min' }, { m: 60, label: '1 hour' }, { m: 90, label: '90 min' }, { m: 120, label: '2 hours' }];
const DAILY_LENGTHS = [{ m: 3 * 1440, label: '3 days' }, { m: 7 * 1440, label: '1 week' }, { m: 14 * 1440, label: '2 weeks' }, { m: 30 * 1440, label: '30 days' }];

type StartChoice = 'soon' | 'hour' | 'tonight' | 'tomorrow' | 'custom';

function startDate(choice: StartChoice, custom: string): Date {
  const now = new Date();
  if (choice === 'soon') return new Date(now.getTime() + 15 * 60_000);
  if (choice === 'hour') return new Date(now.getTime() + 60 * 60_000);
  if (choice === 'tonight') {
    const d = new Date(now); d.setHours(20, 0, 0, 0);
    if (d.getTime() - now.getTime() < 15 * 60_000) d.setDate(d.getDate() + 1);
    return d;
  }
  if (choice === 'tomorrow') { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(19, 0, 0, 0); return d; }
  const c = custom ? new Date(custom) : new Date(now.getTime() + 60 * 60_000);
  return Number.isNaN(c.getTime()) ? new Date(now.getTime() + 60 * 60_000) : c;
}

function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: PT.muted }}>{children}</p>;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className="rounded-[10px] px-3 py-2 text-[13px] font-bold transition-colors"
      style={on ? greenBtn : ghostBtn}>{children}</button>
  );
}

export function CreateTournament() {
  const { authUser, isPremium } = useUser();
  const [proT, setProT] = useState(false);
  const [terms, setTerms] = useState(false);
  const [, navigate] = useLocation();
  const host = authUser?.scoutUsername || authUser?.chesscomUsername || authUser?.lichessUsername || authUser?.firstName || 'My';

  const [options, setOptions] = useState<{ live: Tc[]; daily: Tc[] }>({ live: [], daily: [] });
  const [format, setFormat] = useState<Format>('arena');
  const [kind, setKind] = useState<Kind>('live');
  const [tc, setTc] = useState('blitz_5_0');
  const [maxPlayers, setMaxPlayers] = useState<number | null>(16);
  const [length, setLength] = useState(60);
  const [start, setStart] = useState<StartChoice>('soon');
  const [custom, setCustom] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60_000)));
  const [mode, setMode] = useState<'casual' | 'ranked'>('casual');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [join, setJoin] = useState(true);
  const [club, setClub] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [listed, setListed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; name: string; when: Date } | null>(null);

  useEffect(() => {
    apiFetch('/api/tournament-options').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d) setOptions({ live: d.liveTimeControls ?? [], daily: d.dailyTimeControls ?? [] });
    }).catch(() => {});
  }, []);

  const tcs = kind === 'daily' ? options.daily : options.live;
  // Keep the picks valid when switching live/daily or knockout/arena.
  useEffect(() => {
    if (tcs.length && !tcs.some((t) => t.id === tc)) setTc(tcs[0].id);
  }, [tcs, tc]);
  useEffect(() => { setLength(kind === 'daily' ? 7 * 1440 : 60); }, [kind]);
  useEffect(() => { if (format === 'bracket' && start === 'soon') setStart('hour'); }, [format, start]);

  const tcLabel = tcs.find((t) => t.id === tc)?.label ?? '';
  const suggested = useMemo(() => {
    const base = tcLabel.replace(' per move', '');
    const what = format === 'bracket' ? 'Knockout' : kind === 'daily' ? 'Daily Arena' : 'Arena';
    return `${host}'s ${base} ${what}`.replace(/\s+/g, ' ').trim();
  }, [host, tcLabel, format, kind]);
  useEffect(() => { if (!nameTouched) setName(suggested); }, [suggested, nameTouched]);

  const when = startDate(start, custom);
  const whenText = when.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const lengths = kind === 'daily' ? DAILY_LENGTHS : LIVE_LENGTHS;

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await apiFetch('/api/tournaments', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || suggested, description: note.trim() || undefined, timeControl: tc, mode,
          startsAt: when.toISOString(), durationMinutes: format === 'arena' ? length : undefined,
          format, kind, maxPlayers: proT ? (maxPlayers ?? PRO_MAX) : maxPlayers, join, clubName: club.trim() || undefined, logo: logo ?? undefined, listed,
          eligibility: proT ? 'pro' : 'all', acceptOrganizerTerms: proT ? terms : undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not create the tournament');
      setCreated({ id: d.id, name: name.trim() || suggested, when });
      window.scrollTo({ top: 0 });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create the tournament');
    } finally { setBusy(false); }
  };

  if (created) {
    const url = `${window.location.origin}/tournaments/${created.id}`;
    return (
      <div className="mx-auto max-w-[560px] space-y-4 p-4 pb-24 md:p-0">
        <div className="space-y-4 p-6 text-center" style={cardStyle}>
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-[16px]" style={{ background: '#81B64C', color: '#FFFFFF' }}><Check size={30} strokeWidth={3} /></span>
          <div>
            <h1 className="text-[22px] font-black" style={{ color: PT.text }}>{created.name} is set</h1>
            <p className="mt-1 text-[13.5px]" style={{ color: PT.muted }}>
              Starts {created.when.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. Share the link with your players; they can join from it{listed ? ' or find it on the tournaments list' : ''}.
            </p>
          </div>
          <div className="text-left">
            <ShareLink url={url} text={`Join my chess tournament "${created.name}" on ChessScout`} />
          </div>
          <button onClick={() => navigate(`/tournaments/${created.id}`)} className="w-full rounded-xl py-3 text-[14px] font-extrabold" style={ghostBtn}>
            Open the tournament
          </button>
        </div>
        <p className="text-center text-[12px]" style={{ color: PT.muted }}>We'll notify you when players join. You can cancel it from the tournament page.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[560px] space-y-4 p-4 pb-28 md:p-0">
      <div className="flex items-center gap-3">
        <Link href="/tournaments" className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ color: PT.muted, background: 'rgba(255,255,255,.05)' }} aria-label="Back"><ArrowLeft size={18} /></Link>
        <div>
          <h1 className="text-2xl font-black" style={{ color: PT.text, letterSpacing: '-0.02em' }}>Create a tournament</h1>
          <p className="text-[13px]" style={{ color: PT.muted }}>Set it up, then share the link with your players.</p>
        </div>
      </div>

      <div className="space-y-5 p-5" style={cardStyle}>
        {/* Format */}
        <div>
          <Label>Format</Label>
          <div className="grid grid-cols-2 gap-2">
            {([
              ['arena', 'Arena', Swords, 'Play as many games as you can. Most points wins.'],
              ['bracket', 'Knockout', GitBranch, 'Win to advance. Last player standing wins.'],
            ] as const).map(([id, label, Icon, sub]) => {
              const on = format === id;
              return (
                <button key={id} type="button" onClick={() => setFormat(id)} aria-pressed={on}
                  className="rounded-[14px] p-3 text-left transition-colors"
                  style={{ background: on ? PT.greenSoft : 'rgba(255,255,255,0.04)', border: `1.5px solid ${on ? PT.green : PT.border}` }}>
                  <span className="mb-1.5 grid h-9 w-9 place-items-center rounded-[10px]" style={{ background: '#81B64C', color: '#FFFFFF' }}><Icon size={18} /></span>
                  <b className="block text-[14.5px] font-extrabold" style={{ color: PT.text }}>{label}</b>
                  <span className="block text-[12px] leading-snug" style={{ color: PT.muted }}>{sub}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Game type + time control */}
        <div>
          <Label>Time control</Label>
          <div className="mb-2 grid grid-cols-2 gap-1 rounded-[12px] p-1" style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${PT.border}` }}>
            {([['live', 'Live', Zap], ['daily', 'Daily', CalendarDays]] as const).map(([id, label, Icon]) => (
              <button key={id} type="button" onClick={() => setKind(id)} aria-pressed={kind === id}
                className="flex items-center justify-center gap-1.5 rounded-[9px] py-2 text-[13px] font-extrabold"
                style={kind === id ? greenBtn : { color: PT.muted }}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tcs.length === 0 && <span className="text-[12.5px]" style={{ color: PT.muted }}>Loading…</span>}
            {tcs.map((t) => <Chip key={t.id} on={tc === t.id} onClick={() => setTc(t.id)}>{t.label}</Chip>)}
          </div>
        </div>

        {/* Who can join */}
        <div>
          <Label>Who can join</Label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setProT(false)} aria-pressed={!proT} className="rounded-[14px] p-3 text-left"
              style={{ background: !proT ? PT.greenSoft : 'rgba(255,255,255,0.04)', border: `1.5px solid ${!proT ? PT.green : PT.border}` }}>
              <b className="block text-[14.5px] font-extrabold" style={{ color: PT.text }}>Everyone</b>
              <span className="block text-[12px] leading-snug" style={{ color: PT.muted }}>Free for all players.</span>
            </button>
            <button type="button" onClick={() => { if (isPremium) { setProT(true); if (maxPlayers === null) setMaxPlayers(PRO_MAX); } }} aria-pressed={proT} disabled={!isPremium}
              className="rounded-[14px] p-3 text-left disabled:opacity-70"
              style={{ background: proT ? PT.greenSoft : 'rgba(255,255,255,0.04)', border: `1.5px solid ${proT ? PT.green : PT.border}` }}>
              <b className="flex items-center gap-1.5 text-[14.5px] font-extrabold" style={{ color: PT.text }}><Crown size={14} style={{ color: PT.gold }} /> Pro tournament</b>
              <span className="block text-[12px] leading-snug" style={{ color: PT.muted }}>Pro members, or a $5 entry. You earn $1 per new entry.</span>
            </button>
          </div>
          {!isPremium && (
            <p className="mt-1.5 text-[12px]" style={{ color: PT.muted }}>
              Pro tournaments are for Pro members to host. <Link href="/pricing" className="font-bold underline" style={{ color: PT.green }}>See ChessScout Pro</Link>
            </p>
          )}
          {proT && (
            <div className="mt-2 space-y-2 rounded-[12px] p-3" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${PT.border}` }}>
              <p className="text-[12.5px] leading-snug" style={{ color: PT.muted }}>
                Pro members join free. Everyone else can go Pro ($5/month) or pay a one-time <b style={{ color: PT.text }}>$5 entry</b>.
                For each player who joins with an entry fee or goes Pro from your tournament, you earn <b style={{ color: PT.text }}>$1</b>, paid out through
                your <Link href="/affiliate" className="font-bold underline" style={{ color: PT.green }}>Affiliate page</Link>. Players who were already Pro don't earn a payout. Up to 500 players.
              </p>
              <label className="flex cursor-pointer items-start gap-2.5 text-[12.5px]" style={{ color: PT.text }}>
                <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#81B64C]" />
                <span>I'm the organizer. Any prizes or rewards are mine to offer and deliver, and I'll follow the rules where I and my players live. ChessScout.net doesn't hold, offer or award prizes.</span>
              </label>
            </div>
          )}
        </div>

        {/* Players */}
        <div>
          <Label>Number of players</Label>
          <div className="flex flex-wrap gap-1.5">
            {(proT ? PRO_PLAYER_PRESETS : PLAYER_PRESETS).map((p) => <Chip key={p.label} on={maxPlayers === p.value} onClick={() => setMaxPlayers(p.value)}>{p.label}</Chip>)}
            <input
              type="number" min={2} max={proT ? PRO_MAX : 256} inputMode="numeric"
              value={maxPlayers !== null && !(proT ? PRO_PLAYER_PRESETS : PLAYER_PRESETS).some((p) => p.value === maxPlayers) ? maxPlayers : ''}
              onChange={(e) => { const n = Number(e.target.value); setMaxPlayers(Number.isFinite(n) && n >= 2 ? Math.min(proT ? PRO_MAX : 256, Math.round(n)) : 16); }}
              placeholder="Other"
              className="w-[84px] rounded-[10px] px-3 py-2 text-[13px] font-bold outline-none"
              style={{ ...ghostBtn }}
            />
          </div>
          {format === 'bracket' && (
            <p className="mt-1.5 text-[12px]" style={{ color: PT.muted }}>Knockouts work best with 4, 8, 16 or 32. Odd spots get a bye to the next round.</p>
          )}
        </div>

        {/* Start */}
        <div>
          <Label>Starts</Label>
          <div className="flex flex-wrap gap-1.5">
            {format === 'arena' && <Chip on={start === 'soon'} onClick={() => setStart('soon')}>In 15 min</Chip>}
            <Chip on={start === 'hour'} onClick={() => setStart('hour')}>In 1 hour</Chip>
            <Chip on={start === 'tonight'} onClick={() => setStart('tonight')}>Tonight 8pm</Chip>
            <Chip on={start === 'tomorrow'} onClick={() => setStart('tomorrow')}>Tomorrow 7pm</Chip>
            <Chip on={start === 'custom'} onClick={() => setStart('custom')}>Pick a time</Chip>
          </div>
          {start === 'custom' && (
            <input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)}
              min={toLocalInput(new Date())}
              className="mt-2 w-full rounded-[10px] px-3 py-2.5 text-[14px] font-bold outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', color: PT.text, border: `1px solid ${PT.border}`, colorScheme: 'dark' }} />
          )}
          <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px]" style={{ color: PT.muted }}><Clock size={13} /> {whenText}</p>
        </div>

        {/* Length (arena) */}
        {format === 'arena' && (
          <div>
            <Label>Length</Label>
            <div className="flex flex-wrap gap-1.5">
              {lengths.map((l) => <Chip key={l.m} on={length === l.m} onClick={() => setLength(l.m)}>{l.label}</Chip>)}
            </div>
          </div>
        )}

        {/* Rated */}
        <div>
          <Label>Ranked or casual</Label>
          <div className="grid grid-cols-2 gap-1.5">
            <Chip on={mode === 'casual'} onClick={() => setMode('casual')}><span className="inline-flex items-center gap-1.5"><Sparkles size={14} /> Casual</span></Chip>
            <Chip on={mode === 'ranked'} onClick={() => setMode('ranked')}><span className="inline-flex items-center gap-1.5"><Award size={14} /> Ranked</span></Chip>
          </div>
          <p className="mt-1.5 text-[12px]" style={{ color: PT.muted }}>
            {mode === 'ranked' ? 'Players face opponents of similar rating, and games count toward ChessScout ratings.' : 'Opponents are drawn at random and ratings don’t change.'}
          </p>
        </div>

        {/* Name + branding */}
        <div>
          <Label>Title</Label>
          <input value={name} onChange={(e) => { setName(e.target.value); setNameTouched(true); }} maxLength={80}
            className="w-full rounded-[10px] px-3 py-2.5 text-[14px] font-bold outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', color: PT.text, border: `1px solid ${PT.border}` }} />
          {!showNote ? (
            <button type="button" onClick={() => setShowNote(true)} className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-bold" style={{ color: PT.green }}>
              <ChevronDown size={14} /> Add a note for players
            </button>
          ) : (
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3}
              placeholder="Prizes, rules, club name…"
              className="mt-2 w-full rounded-[10px] px-3 py-2.5 text-[13.5px] outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', color: PT.text, border: `1px solid ${PT.border}` }} />
          )}
        </div>

        <div>
          <Label>Your club (optional)</Label>
          <input value={club} onChange={(e) => setClub(e.target.value)} maxLength={80} placeholder="e.g. Riverside Chess Club"
            className="mb-2.5 w-full rounded-[10px] px-3 py-2.5 text-[14px] font-bold outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', color: PT.text, border: `1px solid ${PT.border}` }} />
          <LogoPicker value={logo} onChange={setLogo} />
          <p className="mt-1.5 text-[12px]" style={{ color: PT.muted }}>Players see your club name and logo on the tournament page and the tournaments list.</p>
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-[12px] px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${PT.border}` }}>
          <input type="checkbox" checked={listed} onChange={(e) => setListed(e.target.checked)} className="h-4 w-4 accent-[#81B64C]" />
          <span className="text-[13.5px] font-bold" style={{ color: PT.text }}>Show on the public tournaments list</span>
        </label>

        <label className="flex cursor-pointer items-center gap-3 rounded-[12px] px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${PT.border}` }}>
          <input type="checkbox" checked={join} onChange={(e) => setJoin(e.target.checked)} className="h-4 w-4 accent-[#81B64C]" />
          <span className="text-[13.5px] font-bold" style={{ color: PT.text }}>I'm playing in it too</span>
        </label>

        {err && <p className="text-[13px] font-bold" style={{ color: PT.red }}>{err}</p>}

        <button onClick={submit} disabled={busy || !tc || (proT && !terms)} className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] py-3.5 text-[15px] font-extrabold disabled:opacity-60" style={greenBtn}>
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Trophy size={18} />} Create and get link
        </button>
        <p className="flex items-center justify-center gap-1.5 text-center text-[12px]" style={{ color: PT.muted }}>
          <Users size={13} /> {listed ? 'Anyone can find it on the tournaments list, or join from your link.' : 'Only people with the link can find and join it.'}
        </p>
      </div>
    </div>
  );
}
