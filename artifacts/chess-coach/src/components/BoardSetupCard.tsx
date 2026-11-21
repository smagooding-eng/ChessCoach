// "Your board & play": the quick set-up every member sees once (new members while their
// games import; everyone else on their next visit, with their own choices marked "Yours"),
// and the top of Settings. Every option scrolls sideways; taps only change a draft shown on
// the preview board, and nothing is saved until Save (backing out keeps their settings).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { lichessAuth, syncLichessAuth, connectLichess, type LichessAuth } from '@/lib/lichessBoard';
import { PIECE_THEME_TYPES } from '@/lib/pieceThemes';
import { BOARD_GROUPS } from '@/lib/boardGroups';
import { useDashboardRedesignFlag } from '@/hooks/use-app-config';
import { useSettings, LookOverride, BG_PHOTOS, PIECE_SHAPES, BOARD_TEXTURES, BOARD_THEMES, isPhotoBoard, type BoardLook, type PieceShape, type BoardTexture, type BoardTheme } from '@/context/SettingsContext';
import { SOUND_PACKS, playSound, type SoundPack } from '@/lib/sounds';
import { ChessBoard } from '@/components/ChessBoard';
import { GameAlertsRow } from '@/components/GameAlerts';

const G = '#81B64C', TEXT = '#F5F7F6', MUTED = '#87918E', INNER = '#121B1D', LINE = 'rgba(255,255,255,.08)';
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Every main option, in the same order as Settings: piece sets by type, photo boards by
// material, then the plain two-tone colours; every sound pack.
const PIECES: PieceShape[] = PIECE_THEME_TYPES.flatMap((t) => t.shapes).filter((k) => k !== 'default');
type BoardPick = { kind: 'photo'; key: BoardTexture } | { kind: 'color'; key: Exclude<BoardTheme, 'custom'> };
const boardsFor = (enhanced: boolean): BoardPick[] => [
  ...[...new Set(BOARD_GROUPS.flatMap((g) => g.boards))]
    .filter((k) => isPhotoBoard(k) && BOARD_TEXTURES[k] && (enhanced || !BOARD_TEXTURES[k].enhancedOnly))
    .map((key) => ({ kind: 'photo' as const, key })),
  ...(Object.keys(BOARD_THEMES) as Exclude<BoardTheme, 'custom'>[]).map((key) => ({ kind: 'color' as const, key })),
];
const SOUNDS = Object.keys(SOUND_PACKS) as SoundPack[];

/** A sideways-scrolling row that opens with the current choice in view. */
function ScrollRow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const row = ref.current;
    const on = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (row && on) row.scrollLeft = on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;
  }, []);
  return (
    <div ref={ref} className={`relative -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1.5 ${className}`}
      style={{ scrollbarWidth: 'thin', WebkitMaskImage: 'linear-gradient(90deg,#000 88%,transparent)', maskImage: 'linear-gradient(90deg,#000 88%,transparent)' }}>
      {children}
      <span className="w-6 shrink-0" aria-hidden="true" />
    </div>
  );
}

function preview(pack: SoundPack) {
  const gap = SOUND_PACKS[pack]?.group === 'natural' ? 560 : 380;
  playSound('move', pack);
  setTimeout(() => playSound('capture', pack), gap);
}

const pieceImg = (k: PieceShape) => {
  const info = PIECE_SHAPES[k];
  if (k === 'default') return null;
  return info?.raster ? `/pieces/${k}/wN.webp?v=${info.version ?? 1}` : `/pieces/${k}/wN.svg`;
};

function Tile({ on, yours, label, onClick, children }: { on: boolean; yours: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className="relative w-[66px] shrink-0 rounded-[12px] p-1.5 text-center"
      style={{ background: INNER, border: `1px solid ${LINE}`, boxShadow: on ? `inset 0 0 0 2px ${G}` : undefined }}>
      {yours && <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[5px] px-1.5 text-[9px] font-black" style={{ background: G, color: '#06110A' }}>Yours</span>}
      <span className="mx-auto grid h-10 w-10 place-items-center overflow-hidden rounded-[8px]">{children}</span>
      <span className="mt-0.5 block truncate text-[9.5px] font-bold" style={{ color: '#C9CFCD' }}>{label}</span>
    </button>
  );
}

function Seg<T extends string | boolean>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex shrink-0 rounded-[9px] p-0.5" style={{ background: INNER }}>
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" onClick={() => onChange(v)} className="rounded-[7px] px-2.5 py-1 text-[12px] font-extrabold"
          style={value === v ? { background: G, color: '#06110A' } : { color: MUTED }}>{l}</button>
      ))}
    </div>
  );
}

type Draft = {
  piece: PieceShape; texture: BoardTexture; theme: BoardTheme; sound: SoundPack | 'off';
  promo: 'queen' | 'ask'; confirm: boolean; legal: boolean; coords: boolean;
  look: 'standard' | string;   // 'standard' (solid cards) or a backdrop id
};

export function BoardSetupCard({ mode, onDone, progress, kicker }: {
  /** Small line above the title (default "Your board & play"). */
  kicker?: string;
  /** first: a new member · returning: has made choices before · settings: the Settings page */
  mode: 'first' | 'returning' | 'settings';
  onDone?: () => void;
  /** New members: their games importing, or 'ready' once in. */
  progress?: 'importing' | 'ready' | null;
}) {
  const s = useSettings();
  // What they have now. Every tap only changes this draft (the preview board shows it);
  // nothing is saved until they tap Save, so backing out leaves their settings as they were.
  const current = (): Draft => ({
    piece: s.pieceShape, texture: s.boardTexture, theme: s.boardTheme, sound: s.soundEnabled ? s.soundPack : 'off',
    promo: s.promotionChoice, confirm: s.confirmMoves, legal: s.showLegalMoves, coords: s.showCoordinates,
    look: s.uiStyle === 'photo' ? s.bgPhoto : 'standard',
  });
  const was = useRef<Draft>(current());
  const [d, setD] = useState<Draft>(was.current);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const changed = (Object.keys(d) as (keyof Draft)[]).some((k) => d[k] !== was.current[k]);
  const showYours = mode !== 'first';

  const save = () => {
    const w = was.current;
    if (d.piece !== w.piece) s.setPieceShape(d.piece);
    if (d.texture !== w.texture) s.setBoardTexture(d.texture);
    if (d.theme !== w.theme) s.setBoardTheme(d.theme);
    if (d.sound !== w.sound) { if (d.sound === 'off') s.setSoundEnabled(false); else { s.setSoundEnabled(true); s.setSoundPack(d.sound); } }
    if (d.promo !== w.promo) s.setPromotionChoice(d.promo);
    if (d.confirm !== w.confirm) s.setConfirmMoves(d.confirm);
    if (d.legal !== w.legal) s.setShowLegalMoves(d.legal);
    if (d.coords !== w.coords) s.setShowCoordinates(d.coords);
    if (d.look !== w.look) { if (d.look === 'standard') s.setUiStyle('standard'); else { s.setBgPhoto(d.look); s.setUiStyle('photo'); } }
    was.current = d;
    onDone?.();
  };

  // Lichess: play real Lichess players from ChessScout (the connection lives on their account).
  const [lich, setLich] = useState<LichessAuth | null>(() => lichessAuth());
  const [lichChecked, setLichChecked] = useState(() => !!lichessAuth());
  useEffect(() => {
    let live = true;
    void syncLichessAuth().then((a) => { if (live) setLich(a); }).catch(() => {}).finally(() => { if (live) setLichChecked(true); });
    return () => { live = false; };
  }, []);
  const goConnect = () => {
    // Leaving for lichess.org: an explicit tap, so keep what they picked here first.
    if (changed) save(); else onDone?.();
    void connectLichess(`${window.location.pathname}${window.location.search}`);
  };

  const pieces = useMemo(() => {
    const list = [...PIECES];
    if (showYours && !list.includes(was.current.piece) && was.current.piece !== 'default') list.unshift(was.current.piece);
    return list;
  }, [showYours]);
  const { enabled: enhanced } = useDashboardRedesignFlag();
  const boards = useMemo(() => boardsFor(enhanced), [enhanced]);

  const boardIs = (b: BoardPick, x: Draft) => (b.kind === 'photo' ? x.texture === b.key : !isPhotoBoard(x.texture) && x.theme === b.key);
  const pickBoard = (b: BoardPick) => {
    if (b.kind === 'photo') set({ texture: b.key });
    else set({ theme: b.key, texture: isPhotoBoard(d.texture) ? ('flat' as BoardTexture) : d.texture });
  };
  const boardLabel = (b: BoardPick) => (b.kind === 'photo' ? BOARD_TEXTURES[b.key]?.label : BOARD_THEMES[b.key]?.label) ?? '';
  const currentBoard = boards.find((b) => boardIs(b, d));
  const lookLabelNow = d.look === 'standard' ? 'Standard' : BG_PHOTOS.find((p) => p.id === d.look)?.label ?? 'Backdrop';

  const previewLook = {
    boardTheme: d.theme === 'custom' ? s.boardTheme : d.theme, boardTexture: d.texture, pieceShape: d.piece,
    pieceStyle: s.pieceStyle, showCoordinates: d.coords,
  } as unknown as BoardLook;

  const title = mode === 'returning' ? 'Your current set-up' : mode === 'first' ? 'Set up your board' : 'Board & play';
  const sub = mode === 'returning' ? 'These are the choices you made before. Keep them, or tap to change anything.'
    : mode === 'first' ? 'Pick how your board looks and plays. You can change it any time.'
    : 'Try anything on the board below. Nothing changes until you tap Save.';
  const head = (label: string, value: string) => (
    <p className="mb-1.5 flex justify-between text-[11px] font-black uppercase tracking-[.12em]" style={{ color: MUTED }}>{label} <b className="normal-case tracking-normal" style={{ color: TEXT }}>{value}</b></p>
  );
  const chip = (on: boolean) => (on ? { background: G, color: '#06110A' } : { background: INNER, border: `1px solid ${LINE}`, color: '#C9CFCD' });

  return (
    <div className="rounded-[22px] p-4" style={{ background: '#0D1516', border: `1px solid ${LINE}`, color: TEXT }}>
      <p className="text-[11px] font-black uppercase tracking-[.14em]" style={{ color: G }}>{kicker ?? 'Your board & play'}</p>
      <h2 className="mt-1 text-[22px] font-black leading-tight">{title}</h2>
      <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: MUTED }}>{sub}</p>

      <div className="pointer-events-none mx-auto mt-3.5 w-[216px]" aria-hidden="true">
        <LookOverride look={previewLook}>
          <ChessBoard fen={START} maxWidthOverride={216} suppressConfirmMoves />
        </LookOverride>
      </div>

      <div className="mt-3.5">
        {head('Pieces', PIECE_SHAPES[d.piece]?.label ?? '')}
        <ScrollRow className="pt-2">
          {pieces.map((k) => (
            <Tile key={k} on={d.piece === k} yours={showYours && was.current.piece === k} label={PIECE_SHAPES[k]?.label ?? k} onClick={() => set({ piece: k })}>
              {pieceImg(k) ? <img src={pieceImg(k)!} alt="" loading="lazy" className="h-10 w-10 object-contain" /> : <span className="text-2xl">♞</span>}
            </Tile>
          ))}
        </ScrollRow>
      </div>

      <div className="mt-2.5">
        {head('Board', currentBoard ? boardLabel(currentBoard) : 'Custom')}
        <ScrollRow className="pt-2">
          {boards.map((b) => (
            <Tile key={`${b.kind}:${b.key}`} on={boardIs(b, d)} yours={showYours && boardIs(b, was.current)} label={boardLabel(b)} onClick={() => pickBoard(b)}>
              {b.kind === 'photo'
                ? <img src={BOARD_TEXTURES[b.key]?.thumb ?? BOARD_TEXTURES[b.key]?.boardImage} alt="" loading="lazy" className="block h-10 w-10 object-cover" />
                : <span className="grid h-10 w-10 grid-cols-2">{[0, 1, 2, 3].map((i) => <i key={i} style={{ background: i === 0 || i === 3 ? BOARD_THEMES[b.key].light : BOARD_THEMES[b.key].dark }} />)}</span>}
            </Tile>
          ))}
        </ScrollRow>
      </div>

      <div className="mt-2.5">
        {head('Theme', lookLabelNow)}
        <ScrollRow className="pt-2">
          <Tile on={d.look === 'standard'} yours={showYours && was.current.look === 'standard'} label="Standard" onClick={() => set({ look: 'standard' })}>
            <span className="relative block h-10 w-10" style={{ background: '#050A0B' }}>
              <i className="absolute left-1 right-1 top-1.5 h-3 rounded-[3px]" style={{ background: '#0D1516', border: '1px solid rgba(255,255,255,.12)' }} />
              <i className="absolute bottom-1.5 left-1 h-3 w-4 rounded-[3px]" style={{ background: '#0D1516', border: '1px solid rgba(255,255,255,.12)' }} />
              <i className="absolute bottom-1.5 right-1 h-3 w-3 rounded-[3px]" style={{ background: G }} />
            </span>
          </Tile>
          {BG_PHOTOS.map((p) => (
            <Tile key={p.id} on={d.look === p.id} yours={showYours && was.current.look === p.id} label={p.label} onClick={() => set({ look: p.id })}>
              {p.css
                ? <span className="block h-10 w-10" style={{ background: p.css, backgroundSize: '50% 50%' }} />
                : <img src={p.thumb ?? p.src} alt="" loading="lazy" className="cs-keep-img block h-10 w-10 object-cover" />}
            </Tile>
          ))}
        </ScrollRow>
      </div>

      <div className="mt-2.5">
        {head('Move sounds', d.sound === 'off' ? 'Off' : SOUND_PACKS[d.sound]?.label ?? '')}
        <ScrollRow>
          {SOUNDS.map((k) => (
            <button key={k} type="button" aria-pressed={d.sound === k} onClick={() => { set({ sound: k }); preview(k); }}
              className="shrink-0 whitespace-nowrap rounded-[10px] px-3 py-1.5 text-[12px] font-extrabold" style={chip(d.sound === k)}>
              {SOUND_PACKS[k]?.label} ▸
            </button>
          ))}
          <button type="button" aria-pressed={d.sound === 'off'} onClick={() => set({ sound: 'off' })}
            className="shrink-0 rounded-[10px] px-3 py-1.5 text-[12px] font-extrabold" style={chip(d.sound === 'off')}>Off</button>
        </ScrollRow>
      </div>

      <div className="mt-3">
        <p className="mb-1 text-[11px] font-black uppercase tracking-[.12em]" style={{ color: MUTED }}>Play</p>
        {([
          ['Pawn promotion', 'Auto-queen, or choose each time', <Seg key="p" value={d.promo} options={[['queen', 'Auto-queen'], ['ask', 'Ask']]} onChange={(v) => set({ promo: v })} />],
          ['Confirm moves', 'Tap your clock before a move counts', <Seg key="c" value={d.confirm} options={[[true, 'On'], [false, 'Off']]} onChange={(v) => set({ confirm: v })} />],
          ['Show legal moves', null, <Seg key="l" value={d.legal} options={[[true, 'On'], [false, 'Off']]} onChange={(v) => set({ legal: v })} />],
          ['Board coordinates', null, <Seg key="x" value={d.coords} options={[[true, 'On'], [false, 'Off']]} onChange={(v) => set({ coords: v })} />],
        ] as [string, string | null, React.ReactNode][]).map(([label, hint, ctl]) => (
          <div key={label} className="flex items-center justify-between gap-3 py-2" style={{ borderTop: `1px solid rgba(255,255,255,.06)` }}>
            <span className="min-w-0 text-[13px] font-bold">{label}{hint && <small className="block text-[11px] font-medium" style={{ color: MUTED }}>{hint}</small>}</span>
            {ctl}
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-[14px] p-3" style={{ background: INNER, border: `1px solid ${LINE}` }}>
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[18px]" style={{ background: '#F5F7F6', color: '#0D1516' }} aria-hidden="true">♞</span>
          <span className="min-w-0 flex-1">
            <b className="block text-[13.5px]">Live Play</b>
            <small className="block text-[11.5px] leading-snug" style={{ color: MUTED }}>
              {lich ? <>All set, playing as <b style={{ color: TEXT }}>{lich.username}</b> on Lichess.</> : 'Real opponents in seconds, any time of day, played and reviewed right here.'}
            </small>
          </span>
          {lich
            ? <span className="shrink-0 rounded-[8px] px-2.5 py-1.5 text-[11.5px] font-black" style={{ background: G, color: '#06110A' }}>✓ Ready</span>
            : lichChecked && <button type="button" onClick={goConnect} className="shrink-0 rounded-[10px] px-3 py-2 text-[12px] font-black" style={{ background: G, color: '#06110A' }}>{changed ? 'Save & set up Live Play' : 'Set up Live Play'}</button>}
        </div>
        {!lich && lichChecked && <p className="mt-2 text-[11px]" style={{ color: MUTED }}>Uses your Lichess account: a quick sign-in on lichess.org and you’re back. No account? <a href="https://lichess.org/signup" target="_blank" rel="noreferrer" className="font-bold underline" style={{ color: G }}>Make one free</a>.</p>}
      </div>

      <div className="mt-2"><GameAlertsRow /></div>

      {(onDone || changed) && (
        <>
          <button type="button" onClick={save} className="mt-3.5 w-full rounded-[14px] py-3 text-[15px] font-black" style={{ background: G, color: '#06110A' }}>
            {changed ? 'Save my set-up' : mode === 'first' ? 'Looks good' : 'Keep my set-up'}
          </button>
          {mode === 'settings'
            ? <button type="button" onClick={() => setD(was.current)} className="mt-2 w-full text-center text-[12px] font-bold" style={{ color: MUTED }}>Undo changes</button>
            : <p className="mt-2 text-center text-[12px]" style={{ color: MUTED }}>Nothing changes unless you tap Save. You can change these any time in Settings.</p>}
        </>
      )}
      {progress && (
        <div className="mt-3 flex items-center gap-2 text-[11.5px]" style={{ color: MUTED }}>
          {progress === 'ready'
            ? <span className="font-bold" style={{ color: G }}>Your games are in. Your last game is ready to review.</span>
            : <><span>Bringing in your games…</span><span className="relative h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: INNER }}><i className="absolute inset-y-0 w-1/3 animate-[csbar_1.4s_ease-in-out_infinite] rounded-full" style={{ background: G }} /></span><style>{'@keyframes csbar{0%{left:-35%}100%{left:100%}}'}</style></>}
        </div>
      )}
    </div>
  );
}

// Seen once per member (on this device); the Settings tab stays available after.
export const SETUP_SEEN = (uid: string) => `cs_board_setup_v1:${uid}`;
export function markSetupSeen(uid: string | undefined | null): void {
  if (!uid) return;
  try { localStorage.setItem(SETUP_SEEN(uid), String(Date.now())); } catch { /* storage off */ }
}
export function setupSeen(uid: string | undefined | null): boolean {
  if (!uid) return true;
  try { return !!localStorage.getItem(SETUP_SEEN(uid)); } catch { return true; }
}
