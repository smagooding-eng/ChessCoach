// "Your board & play": the quick set-up every member sees once (new members while their
// games import; everyone else on their next visit, with their own choices marked "Yours"),
// and the top of Settings. Changes apply straight away (the preview board shows them);
// the full lists stay in Settings' other tabs.
import { useMemo, useRef, useState } from 'react';
import { useSettings, PIECE_SHAPES, BOARD_TEXTURES, BOARD_THEMES, isPhotoBoard, type PieceShape, type BoardTexture, type BoardTheme } from '@/context/SettingsContext';
import { SOUND_PACKS, playSound, type SoundPack } from '@/lib/sounds';
import { ChessBoard } from '@/components/ChessBoard';

const G = '#81B64C', TEXT = '#F5F7F6', MUTED = '#87918E', INNER = '#121B1D', LINE = 'rgba(255,255,255,.08)';
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const PIECES: PieceShape[] = ['ink-cream', 'walnut-maple', 'marble-gold', 'crystal-ice', 'cburnett', 'brushed-steel'];
type BoardPick = { kind: 'photo'; key: BoardTexture } | { kind: 'color'; key: Exclude<BoardTheme, 'custom'> };
const BOARDS: BoardPick[] = [
  { kind: 'photo', key: 'cs-tournament' as BoardTexture }, { kind: 'photo', key: 'cs-walnut' as BoardTexture }, { kind: 'color', key: 'green' },
  { kind: 'photo', key: 'cs-emerald' as BoardTexture }, { kind: 'photo', key: 'cs-obsidian' as BoardTexture }, { kind: 'color', key: 'classic' },
];
const SOUNDS: SoundPack[] = ['scout', 'staunton', 'stone', 'soft'];

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

export function BoardSetupCard({ mode, onDone, progress }: {
  /** first: a new member · returning: has made choices before · settings: the Settings page */
  mode: 'first' | 'returning' | 'settings';
  onDone?: () => void;
  /** New members: their games importing, or 'ready' once in. */
  progress?: 'importing' | 'ready' | null;
}) {
  const s = useSettings();
  // What they had when the card opened: marked "Yours" (not for brand-new members).
  const was = useRef({ piece: s.pieceShape, texture: s.boardTexture, theme: s.boardTheme, sound: s.soundEnabled ? s.soundPack : 'off' });
  const showYours = mode !== 'first';
  const [changed, setChanged] = useState(false);
  const touch = () => setChanged(true);

  const pieces = useMemo(() => {
    const list = [...PIECES];
    if (showYours && !list.includes(was.current.piece) && was.current.piece !== 'default') list.unshift(was.current.piece);
    return list;
  }, [showYours]);
  const boards = useMemo(() => {
    const list = [...BOARDS];
    const w = was.current;
    if (showYours) {
      if (isPhotoBoard(w.texture) && !list.some((b) => b.kind === 'photo' && b.key === w.texture)) list.unshift({ kind: 'photo', key: w.texture });
      if (!isPhotoBoard(w.texture) && w.theme !== 'custom' && !list.some((b) => b.kind === 'color' && b.key === w.theme)) list.unshift({ kind: 'color', key: w.theme as Exclude<BoardTheme, 'custom'> });
    }
    return list;
  }, [showYours]);

  const boardOn = (b: BoardPick) => (b.kind === 'photo' ? s.boardTexture === b.key : !isPhotoBoard(s.boardTexture) && s.boardTheme === b.key);
  const boardWas = (b: BoardPick) => (b.kind === 'photo' ? was.current.texture === b.key : !isPhotoBoard(was.current.texture) && was.current.theme === b.key);
  const pickBoard = (b: BoardPick) => {
    if (b.kind === 'photo') s.setBoardTexture(b.key);
    else { s.setBoardTheme(b.key); if (isPhotoBoard(s.boardTexture)) s.setBoardTexture('flat' as BoardTexture); }
    touch();
  };
  const boardLabel = (b: BoardPick) => (b.kind === 'photo' ? BOARD_TEXTURES[b.key]?.label : BOARD_THEMES[b.key]?.label) ?? '';
  const currentBoard = boards.find(boardOn);
  const soundNow = s.soundEnabled ? s.soundPack : 'off';

  const title = mode === 'returning' ? 'Your current set-up' : mode === 'first' ? 'Set up your board' : 'Board & play';
  const sub = mode === 'returning' ? 'These are the choices you made before. Keep them, or tap to change anything.'
    : mode === 'first' ? 'Pick how your board looks and plays. You can change it any time.'
    : 'Changes apply straight away. More boards, pieces and themes are in the other tabs.';

  return (
    <div className="rounded-[22px] p-4" style={{ background: '#0D1516', border: `1px solid ${LINE}`, color: TEXT }}>
      <p className="text-[11px] font-black uppercase tracking-[.14em]" style={{ color: G }}>Your board &amp; play</p>
      <h2 className="mt-1 text-[22px] font-black leading-tight">{title}</h2>
      <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: MUTED }}>{sub}</p>

      <div className="pointer-events-none mx-auto mt-3.5 w-[216px]" aria-hidden="true">
        <ChessBoard fen={START} maxWidthOverride={216} suppressConfirmMoves />
      </div>

      <div className="mt-3.5">
        <p className="mb-1.5 flex justify-between text-[11px] font-black uppercase tracking-[.12em]" style={{ color: MUTED }}>Pieces <b className="normal-case tracking-normal" style={{ color: TEXT }}>{PIECE_SHAPES[s.pieceShape]?.label}</b></p>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 pt-2">
          {pieces.map((k) => (
            <Tile key={k} on={s.pieceShape === k} yours={showYours && was.current.piece === k} label={PIECE_SHAPES[k]?.label ?? k} onClick={() => { s.setPieceShape(k); touch(); }}>
              {pieceImg(k) ? <img src={pieceImg(k)!} alt="" className="h-10 w-10 object-contain" /> : <span className="text-2xl">♞</span>}
            </Tile>
          ))}
        </div>
      </div>

      <div className="mt-2.5">
        <p className="mb-1.5 flex justify-between text-[11px] font-black uppercase tracking-[.12em]" style={{ color: MUTED }}>Board <b className="normal-case tracking-normal" style={{ color: TEXT }}>{currentBoard ? boardLabel(currentBoard) : 'Custom'}</b></p>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 pt-2">
          {boards.map((b) => (
            <Tile key={`${b.kind}:${b.key}`} on={boardOn(b)} yours={showYours && boardWas(b)} label={boardLabel(b)} onClick={() => pickBoard(b)}>
              {b.kind === 'photo'
                ? <span className="block h-10 w-10" style={{ background: `url('${BOARD_TEXTURES[b.key]?.thumb ?? BOARD_TEXTURES[b.key]?.boardImage}') center/cover` }} />
                : <span className="grid h-10 w-10 grid-cols-2">{[0, 1, 2, 3].map((i) => <i key={i} style={{ background: i === 0 || i === 3 ? BOARD_THEMES[b.key].light : BOARD_THEMES[b.key].dark }} />)}</span>}
            </Tile>
          ))}
        </div>
      </div>

      <div className="mt-2.5">
        <p className="mb-1.5 flex justify-between text-[11px] font-black uppercase tracking-[.12em]" style={{ color: MUTED }}>Move sounds <b className="normal-case tracking-normal" style={{ color: TEXT }}>{soundNow === 'off' ? 'Off' : SOUND_PACKS[soundNow as SoundPack]?.label}</b></p>
        <div className="flex flex-wrap gap-1.5">
          {[...SOUNDS, ...(showYours && was.current.sound !== 'off' && !SOUNDS.includes(was.current.sound as SoundPack) ? [was.current.sound as SoundPack] : [])].map((k) => {
            const on = soundNow === k;
            return (
              <button key={k} type="button" onClick={() => { s.setSoundEnabled(true); s.setSoundPack(k); preview(k); touch(); }}
                className="rounded-[10px] px-3 py-1.5 text-[12px] font-extrabold" style={on ? { background: G, color: '#06110A' } : { background: INNER, border: `1px solid ${LINE}`, color: '#C9CFCD' }}>
                {SOUND_PACKS[k]?.label} ▸
              </button>
            );
          })}
          <button type="button" onClick={() => { s.setSoundEnabled(false); touch(); }} className="rounded-[10px] px-3 py-1.5 text-[12px] font-extrabold"
            style={soundNow === 'off' ? { background: G, color: '#06110A' } : { background: INNER, border: `1px solid ${LINE}`, color: '#C9CFCD' }}>Off</button>
        </div>
      </div>

      <div className="mt-3">
        <p className="mb-1 text-[11px] font-black uppercase tracking-[.12em]" style={{ color: MUTED }}>Play</p>
        {([
          ['Pawn promotion', 'Auto-queen, or choose each time', <Seg key="p" value={s.promotionChoice} options={[['queen', 'Auto-queen'], ['ask', 'Ask']]} onChange={(v) => { s.setPromotionChoice(v); touch(); }} />],
          ['Confirm moves', 'Tap twice before a move counts', <Seg key="c" value={s.confirmMoves} options={[[true, 'On'], [false, 'Off']]} onChange={(v) => { s.setConfirmMoves(v); touch(); }} />],
          ['Show legal moves', null, <Seg key="l" value={s.showLegalMoves} options={[[true, 'On'], [false, 'Off']]} onChange={(v) => { s.setShowLegalMoves(v); touch(); }} />],
          ['Board coordinates', null, <Seg key="x" value={s.showCoordinates} options={[[true, 'On'], [false, 'Off']]} onChange={(v) => { s.setShowCoordinates(v); touch(); }} />],
        ] as [string, string | null, React.ReactNode][]).map(([label, hint, ctl]) => (
          <div key={label} className="flex items-center justify-between gap-3 py-2" style={{ borderTop: `1px solid rgba(255,255,255,.06)` }}>
            <span className="min-w-0 text-[13px] font-bold">{label}{hint && <small className="block text-[11px] font-medium" style={{ color: MUTED }}>{hint}</small>}</span>
            {ctl}
          </div>
        ))}
      </div>

      {onDone && (
        <>
          <button type="button" onClick={onDone} className="mt-3.5 w-full rounded-[14px] py-3 text-[15px] font-black" style={{ background: G, color: '#06110A' }}>
            {mode === 'returning' && !changed ? 'Keep my set-up' : mode === 'first' && !changed ? 'Looks good' : 'Save my set-up'}
          </button>
          <p className="mt-2 text-center text-[12px]" style={{ color: MUTED }}>You can change these any time in Settings</p>
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
