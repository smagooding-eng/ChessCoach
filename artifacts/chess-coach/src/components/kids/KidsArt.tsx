// Chess for Kids -- the characters and shapes.
//
// Every piece is a friendly character with a face: "sunny" pieces are the
// child's, "plum" pieces are the other team. Shapes (stars, hearts, gems...)
// are the things to catch, bushes are what gets in the way, and the buddies
// are the avatars a child picks. All drawn here as SVG so they stay crisp at
// any size and need no image downloads.

import type { ReactElement } from 'react';
import type { PieceType, Side, ShapeKind } from '@/lib/kids/levels';

const TEAM = {
  w: { body: '#FFD45C', shade: '#F7A928', line: '#8A4F00', cheek: '#FF8DA1', shine: '#FFF3C4' },
  b: { body: '#9479E0', shade: '#6C51C2', line: '#33236E', cheek: '#F7A6D6', shine: '#D9CCFF' },
};

function Face({ x, y, side, mood = 'happy', s = 1 }: { x: number; y: number; side: Side; mood?: 'happy' | 'wow' | 'sad'; s?: number }) {
  const c = TEAM[side];
  const eyeDx = 7 * s;
  return (
    <g>
      {[-1, 1].map((d) => (
        <g key={d}>
          <ellipse cx={x + d * eyeDx} cy={y} rx={3.3 * s} ry={4.2 * s} fill={c.line} />
          <circle cx={x + d * eyeDx + 1.1 * s} cy={y - 1.5 * s} r={1.3 * s} fill="#fff" />
        </g>
      ))}
      <ellipse cx={x - 12 * s} cy={y + 6 * s} rx={3.6 * s} ry={2.4 * s} fill={c.cheek} opacity={0.75} />
      <ellipse cx={x + 12 * s} cy={y + 6 * s} rx={3.6 * s} ry={2.4 * s} fill={c.cheek} opacity={0.75} />
      {mood === 'wow' ? (
        <ellipse cx={x} cy={y + 8 * s} rx={3 * s} ry={3.6 * s} fill={c.line} />
      ) : mood === 'sad' ? (
        <path d={`M${x - 5 * s} ${y + 10 * s} Q${x} ${y + 6 * s} ${x + 5 * s} ${y + 10 * s}`} stroke={c.line} strokeWidth={2.4 * s} fill="none" strokeLinecap="round" />
      ) : (
        <path d={`M${x - 6 * s} ${y + 6 * s} Q${x} ${y + 12 * s} ${x + 6 * s} ${y + 6 * s}`} stroke={c.line} strokeWidth={2.4 * s} fill="none" strokeLinecap="round" />
      )}
    </g>
  );
}

/** A friendly chess piece character. */
export function KidPiece({ type, side, size = 56, mood }: { type: PieceType; side: Side; size?: number | string; mood?: 'happy' | 'wow' | 'sad' }) {
  const c = TEAM[side];
  const stroke = { stroke: c.line, strokeWidth: 3, strokeLinejoin: 'round' as const };
  const base = <rect x="22" y="83" width="56" height="11" rx="5.5" fill={c.shade} {...stroke} />;
  let art: ReactElement;
  switch (type) {
    case 'p':
      art = (
        <>
          <path d="M34 85 Q36 62 43 52 L57 52 Q64 62 66 85 Z" fill={c.body} {...stroke} />
          <ellipse cx="50" cy="52" rx="15" ry="4.5" fill={c.shade} {...stroke} />
          <circle cx="50" cy="33" r="18" fill={c.body} {...stroke} />
          <ellipse cx="43" cy="24" rx="6" ry="3.5" fill={c.shine} opacity="0.8" />
          <Face x={50} y={32} side={side} mood={mood} s={0.9} />
          {base}
        </>
      );
      break;
    case 'r':
      art = (
        <>
          <path d="M30 38 L70 38 L67 85 L33 85 Z" fill={c.body} {...stroke} />
          <path d="M24 16 h11 v8 h8.5 v-8 h13 v8 h8.5 v-8 h11 v24 h-52 Z" fill={c.body} {...stroke} />
          <rect x="26" y="36" width="48" height="6" rx="3" fill={c.shade} {...stroke} />
          <rect x="29" y="20" width="4" height="12" rx="2" fill={c.shine} opacity="0.8" />
          <Face x={50} y={57} side={side} mood={mood} s={0.95} />
          {base}
        </>
      );
      break;
    case 'b':
      art = (
        <>
          <path d="M37 85 Q39 66 42 56 L58 56 Q61 66 63 85 Z" fill={c.body} {...stroke} />
          <path d="M50 12 C70 24 74 44 62 56 L38 56 C26 44 30 24 50 12 Z" fill={c.body} {...stroke} />
          <path d="M57 22 L50 34" stroke={c.line} strokeWidth="3" strokeLinecap="round" />
          <circle cx="50" cy="10" r="5" fill={c.shade} {...stroke} />
          <ellipse cx="50" cy="56" rx="14" ry="4" fill={c.shade} {...stroke} />
          <ellipse cx="40" cy="28" rx="3.5" ry="7" fill={c.shine} opacity="0.75" transform="rotate(25 40 28)" />
          <Face x={50} y={41} side={side} mood={mood} s={0.85} />
          {base}
        </>
      );
      break;
    case 'n':
      art = (
        <>
          <path d="M66 85 L32 85 Q30 70 40 60 Q30 61 23 55 Q18 49 23 42 L40 28 Q42 16 52 13 L55 5 L60 14 Q78 22 76 46 Q74 66 66 85 Z" fill={c.body} {...stroke} />
          <path d="M60 14 Q78 22 76 46 Q74 66 66 85 L60 85 Q68 62 68 44 Q68 26 56 17 Z" fill={c.shade} />
          <path d="M66 85 L32 85 Q30 70 40 60 Q30 61 23 55 Q18 49 23 42 L40 28 Q42 16 52 13 L55 5 L60 14 Q78 22 76 46 Q74 66 66 85 Z" fill="none" {...stroke} />
          <circle cx="25" cy="47" r="2" fill={c.line} />
          <ellipse cx="47" cy="22" rx="5" ry="3" fill={c.shine} opacity="0.8" transform="rotate(-30 47 22)" />
          <g>
            <ellipse cx="47" cy="33" rx="3.4" ry="4.3" fill={c.line} />
            <circle cx="48.3" cy="31.4" r="1.3" fill="#fff" />
            <ellipse cx="39" cy="45" rx="3.6" ry="2.4" fill={c.cheek} opacity="0.75" />
            {mood === 'wow'
              ? <ellipse cx="31" cy="53" rx="2.6" ry="3" fill={c.line} />
              : <path d="M27 52 Q32 57 37 53" stroke={c.line} strokeWidth="2.4" fill="none" strokeLinecap="round" />}
          </g>
          {base}
        </>
      );
      break;
    case 'q':
      art = (
        <>
          <path d="M32 85 Q35 70 40 64 L60 64 Q65 70 68 85 Z" fill={c.body} {...stroke} />
          <circle cx="50" cy="48" r="19" fill={c.body} {...stroke} />
          <path d="M30 30 L37 14 L44 26 L50 10 L56 26 L63 14 L70 30 Z" fill={c.shade} {...stroke} />
          {[[37, 13], [50, 9], [63, 13]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="3.6" fill="#FF7AB6" stroke={c.line} strokeWidth="2" />)}
          <ellipse cx="42" cy="39" rx="5" ry="3" fill={c.shine} opacity="0.8" />
          <Face x={50} y={49} side={side} mood={mood} s={0.9} />
          {base}
        </>
      );
      break;
    case 'k':
    default:
      art = (
        <>
          <path d="M32 85 Q35 70 40 64 L60 64 Q65 70 68 85 Z" fill={c.body} {...stroke} />
          <circle cx="50" cy="48" r="19" fill={c.body} {...stroke} />
          <path d="M31 31 L33 20 L41 26 L50 18 L59 26 L67 20 L69 31 Z" fill={c.shade} {...stroke} />
          <path d="M50 4 V16 M44 9 H56" stroke={c.line} strokeWidth="7" strokeLinecap="round" />
          <path d="M50 4 V16 M44 9 H56" stroke={c.shade} strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="42" cy="39" rx="5" ry="3" fill={c.shine} opacity="0.8" />
          <Face x={50} y={49} side={side} mood={mood} s={0.9} />
          {base}
        </>
      );
  }
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ overflow: 'visible', display: 'block' }}>
      <ellipse cx="50" cy="96" rx="30" ry="3.5" fill="#000" opacity="0.12" />
      {art}
    </svg>
  );
}

/** Things to catch on the board. */
export function KidShape({ kind, size = 48 }: { kind: ShapeKind; size?: number | string }) {
  let art: ReactElement;
  const eyes = (x: number, y: number, col: string) => (
    <g>
      <circle cx={x - 6} cy={y} r="2.6" fill={col} />
      <circle cx={x + 6} cy={y} r="2.6" fill={col} />
      <path d={`M${x - 4} ${y + 5} Q${x} ${y + 9} ${x + 4} ${y + 5}`} stroke={col} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </g>
  );
  switch (kind) {
    case 'star':
      art = (
        <>
          <path d="M50 8 L61 35 L90 37 L67 56 L75 85 L50 69 L25 85 L33 56 L10 37 L39 35 Z" fill="#FFC93C" stroke="#E08A00" strokeWidth="4" strokeLinejoin="round" />
          <path d="M44 22 L39 35" stroke="#FFF1B0" strokeWidth="4" strokeLinecap="round" />
          {eyes(50, 48, '#8A4F00')}
        </>
      );
      break;
    case 'heart':
      art = (
        <>
          <path d="M50 86 C20 64 10 46 14 32 C18 18 38 14 50 30 C62 14 82 18 86 32 C90 46 80 64 50 86 Z" fill="#FF6B9E" stroke="#C93670" strokeWidth="4" strokeLinejoin="round" />
          <ellipse cx="30" cy="34" rx="6" ry="4" fill="#FFC2D8" transform="rotate(-30 30 34)" />
          {eyes(50, 48, '#7A1640')}
        </>
      );
      break;
    case 'gem':
      art = (
        <>
          <path d="M28 18 L72 18 L90 40 L50 88 L10 40 Z" fill="#45D9F7" stroke="#0E86B5" strokeWidth="4" strokeLinejoin="round" />
          <path d="M10 40 H90 M28 18 L38 40 L50 88 L62 40 L72 18 M38 40 L50 18 L62 40" stroke="#0E86B5" strokeWidth="2.5" fill="none" strokeLinejoin="round" />
          <path d="M30 24 L36 36" stroke="#D6F8FF" strokeWidth="4" strokeLinecap="round" />
        </>
      );
      break;
    case 'balloon':
      art = (
        <>
          <path d="M50 78 Q46 86 52 92 Q56 96 50 100" stroke="#7A7A7A" strokeWidth="2" fill="none" />
          <ellipse cx="50" cy="40" rx="28" ry="33" fill="#FF5C5C" stroke="#C02E2E" strokeWidth="4" />
          <path d="M45 72 L55 72 L50 79 Z" fill="#C02E2E" />
          <ellipse cx="38" cy="26" rx="6" ry="9" fill="#FFB3B3" transform="rotate(20 38 26)" />
          {eyes(50, 42, '#7A1010')}
        </>
      );
      break;
    case 'donut':
      art = (
        <>
          <circle cx="50" cy="52" r="36" fill="#E9B26E" stroke="#A86A26" strokeWidth="4" />
          <path d="M18 48 Q22 22 50 18 Q78 22 82 48 Q80 60 72 56 Q66 66 58 60 Q50 70 42 60 Q34 66 28 56 Q20 60 18 48 Z" fill="#FF9EC9" stroke="#D45B95" strokeWidth="3" strokeLinejoin="round" />
          <circle cx="50" cy="48" r="10" fill="#FFF6E5" stroke="#A86A26" strokeWidth="3" />
          {[[32, 34, '#45D9F7'], [64, 30, '#FFC93C'], [70, 46, '#7BE07B'], [28, 48, '#FFF'], [44, 28, '#9479E0'], [58, 62, '#45D9F7']].map(([x, y, col], i) => (
            <rect key={i} x={Number(x) - 4} y={Number(y) - 1.5} width="8" height="3" rx="1.5" fill={String(col)} transform={`rotate(${i * 37} ${x} ${y})`} />
          ))}
        </>
      );
      break;
    case 'moon':
    default:
      art = (
        <>
          <path d="M62 10 A40 40 0 1 0 90 66 A32 32 0 1 1 62 10 Z" fill="#FFE27A" stroke="#D6A300" strokeWidth="4" strokeLinejoin="round" />
          <path d="M30 50 Q34 54 38 50" stroke="#8A6300" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <path d="M36 62 Q42 66 48 62" stroke="#8A6300" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <ellipse cx="28" cy="60" rx="4" ry="2.6" fill="#FFB3B3" />
        </>
      );
  }
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ overflow: 'visible', display: 'block' }}>
      {art}
    </svg>
  );
}

/** A round bush that blocks the way. */
export function KidBush({ size = 52 }: { size?: number | string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ display: 'block' }}>
      <ellipse cx="50" cy="90" rx="34" ry="5" fill="#000" opacity="0.12" />
      <g stroke="#23804A" strokeWidth="4">
        <circle cx="32" cy="58" r="22" fill="#45C774" />
        <circle cx="68" cy="58" r="22" fill="#45C774" />
        <circle cx="50" cy="40" r="25" fill="#56D683" />
        <path d="M14 70 Q50 92 86 70 L82 80 Q50 96 18 80 Z" fill="#3BB066" />
      </g>
      <circle cx="40" cy="34" r="5" fill="#9AF0B8" />
      {[[30, 54], [64, 48], [52, 66]].map(([x, y], i) => (
        <g key={i}>
          {[0, 72, 144, 216, 288].map((a) => (
            <circle key={a} cx={x + 4 * Math.cos((a * Math.PI) / 180)} cy={y + 4 * Math.sin((a * Math.PI) / 180)} r="3" fill={i === 1 ? '#FFD45C' : '#FF8DB8'} />
          ))}
          <circle cx={x} cy={y} r="2.4" fill="#fff" />
        </g>
      ))}
    </svg>
  );
}

// ------------------------------------------------------------- buddies

export const AVATARS: { id: string; name: string; bg: string }[] = [
  { id: 'fox', name: 'Fizz the Fox', bg: '#FFE3C2' },
  { id: 'owl', name: 'Ollie the Owl', bg: '#E6DAFF' },
  { id: 'panda', name: 'Pan the Panda', bg: '#D7F5E3' },
  { id: 'frog', name: 'Hops the Frog', bg: '#FFF4C2' },
  { id: 'bunny', name: 'Bun the Bunny', bg: '#FFE0EE' },
  { id: 'robot', name: 'Bolt the Robot', bg: '#D6EEFF' },
];

export function KidAvatar({ id, size = 56 }: { id: string; size?: number }) {
  const a = AVATARS.find((x) => x.id === id) ?? AVATARS[0];
  const line = '#3A2A1E';
  const eye = (x: number, y: number, r = 4) => (
    <g>
      <circle cx={x} cy={y} r={r} fill={line} />
      <circle cx={x + r * 0.35} cy={y - r * 0.4} r={r * 0.38} fill="#fff" />
    </g>
  );
  const smile = (y: number) => <path d={`M43 ${y} Q50 ${y + 6} 57 ${y}`} stroke={line} strokeWidth="3" fill="none" strokeLinecap="round" />;
  let art: ReactElement;
  switch (a.id) {
    case 'fox':
      art = (
        <>
          <path d="M22 22 L36 40 L24 50 Z M78 22 L64 40 L76 50 Z" fill="#FF8A3D" stroke={line} strokeWidth="3" strokeLinejoin="round" />
          <path d="M26 30 L33 40 L27 44 Z M74 30 L67 40 L73 44 Z" fill="#FFD9C2" />
          <path d="M20 48 Q22 30 50 30 Q78 30 80 48 Q80 70 50 82 Q20 70 20 48 Z" fill="#FF8A3D" stroke={line} strokeWidth="3" />
          <path d="M28 56 Q40 56 50 70 Q60 56 72 56 Q70 72 50 82 Q30 72 28 56 Z" fill="#FFF3E8" />
          {eye(40, 52)}{eye(60, 52)}
          <ellipse cx="50" cy="66" rx="4.5" ry="3.2" fill={line} />
          {smile(70)}
        </>
      );
      break;
    case 'owl':
      art = (
        <>
          <path d="M24 30 L32 16 L40 30 M76 30 L68 16 L60 30" fill="#9B74D9" stroke={line} strokeWidth="3" strokeLinejoin="round" />
          <ellipse cx="50" cy="54" rx="30" ry="30" fill="#9B74D9" stroke={line} strokeWidth="3" />
          <ellipse cx="50" cy="66" rx="16" ry="14" fill="#E6DAFF" />
          <circle cx="38" cy="46" r="11" fill="#fff" stroke={line} strokeWidth="2.5" />
          <circle cx="62" cy="46" r="11" fill="#fff" stroke={line} strokeWidth="2.5" />
          {eye(38, 46, 5)}{eye(62, 46, 5)}
          <path d="M45 56 L55 56 L50 64 Z" fill="#FFB020" stroke={line} strokeWidth="2" strokeLinejoin="round" />
        </>
      );
      break;
    case 'panda':
      art = (
        <>
          <circle cx="28" cy="28" r="11" fill={line} />
          <circle cx="72" cy="28" r="11" fill={line} />
          <circle cx="50" cy="54" r="31" fill="#fff" stroke={line} strokeWidth="3" />
          <ellipse cx="38" cy="50" rx="8" ry="10" fill={line} transform="rotate(-25 38 50)" />
          <ellipse cx="62" cy="50" rx="8" ry="10" fill={line} transform="rotate(25 62 50)" />
          <circle cx="39" cy="49" r="3.2" fill="#fff" /><circle cx="61" cy="49" r="3.2" fill="#fff" />
          <ellipse cx="50" cy="63" rx="4.5" ry="3.2" fill={line} />
          {smile(67)}
          <ellipse cx="30" cy="64" rx="5" ry="3" fill="#FFB3C6" /><ellipse cx="70" cy="64" rx="5" ry="3" fill="#FFB3C6" />
        </>
      );
      break;
    case 'frog':
      art = (
        <>
          <circle cx="34" cy="32" r="13" fill="#6BD46B" stroke={line} strokeWidth="3" />
          <circle cx="66" cy="32" r="13" fill="#6BD46B" stroke={line} strokeWidth="3" />
          <ellipse cx="50" cy="58" rx="33" ry="26" fill="#6BD46B" stroke={line} strokeWidth="3" />
          <circle cx="34" cy="32" r="7" fill="#fff" /><circle cx="66" cy="32" r="7" fill="#fff" />
          {eye(34, 33, 4)}{eye(66, 33, 4)}
          <path d="M32 62 Q50 78 68 62" stroke={line} strokeWidth="3" fill="none" strokeLinecap="round" />
          <ellipse cx="28" cy="58" rx="5" ry="3" fill="#FF9EB5" /><ellipse cx="72" cy="58" rx="5" ry="3" fill="#FF9EB5" />
        </>
      );
      break;
    case 'bunny':
      art = (
        <>
          <ellipse cx="38" cy="22" rx="8" ry="20" fill="#fff" stroke={line} strokeWidth="3" />
          <ellipse cx="62" cy="22" rx="8" ry="20" fill="#fff" stroke={line} strokeWidth="3" />
          <ellipse cx="38" cy="24" rx="3.5" ry="13" fill="#FFB3CF" /><ellipse cx="62" cy="24" rx="3.5" ry="13" fill="#FFB3CF" />
          <circle cx="50" cy="58" r="28" fill="#fff" stroke={line} strokeWidth="3" />
          {eye(40, 54)}{eye(60, 54)}
          <path d="M47 63 L53 63 L50 67 Z" fill="#FF7FAE" />
          <path d="M50 67 Q45 73 41 69 M50 67 Q55 73 59 69" stroke={line} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <ellipse cx="32" cy="64" rx="5" ry="3" fill="#FFB3CF" /><ellipse cx="68" cy="64" rx="5" ry="3" fill="#FFB3CF" />
        </>
      );
      break;
    case 'robot':
    default:
      art = (
        <>
          <path d="M50 12 V24" stroke={line} strokeWidth="3" />
          <circle cx="50" cy="11" r="5" fill="#FF5C5C" stroke={line} strokeWidth="2.5" />
          <rect x="22" y="24" width="56" height="52" rx="14" fill="#9CD3FF" stroke={line} strokeWidth="3" />
          <rect x="14" y="42" width="8" height="16" rx="3" fill="#6FB6F0" stroke={line} strokeWidth="2.5" />
          <rect x="78" y="42" width="8" height="16" rx="3" fill="#6FB6F0" stroke={line} strokeWidth="2.5" />
          <rect x="30" y="36" width="40" height="22" rx="10" fill="#1F3550" />
          <circle cx="41" cy="47" r="5" fill="#6CF0FF" /><circle cx="59" cy="47" r="5" fill="#6CF0FF" />
          <path d="M38 66 H62" stroke={line} strokeWidth="3" strokeLinecap="round" />
          {[42, 50, 58].map((x) => <path key={x} d={`M${x} 63 V69`} stroke={line} strokeWidth="2" />)}
        </>
      );
  }
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ display: 'block' }}>
      <circle cx="50" cy="50" r="48" fill={a.bg} stroke="#fff" strokeWidth="4" />
      <g transform="translate(5 6) scale(0.9)">{art}</g>
    </svg>
  );
}

/** A small decorative cloud for the sky background. */
export function Cloud({ width = 120, opacity = 0.9 }: { width?: number; opacity?: number }) {
  return (
    <svg viewBox="0 0 120 60" width={width} height={width / 2} aria-hidden="true" style={{ opacity, display: 'block' }}>
      <path d="M20 50 Q4 50 6 38 Q8 26 24 28 Q28 10 48 12 Q62 2 76 14 Q96 10 100 28 Q118 28 114 42 Q112 50 98 50 Z" fill="#fff" />
    </svg>
  );
}

/** Three stars in a row, filled up to `n`. */
export function StarRow({ n, size = 18, gap = 2 }: { n: number; size?: number; gap?: number }) {
  return (
    <div style={{ display: 'flex', gap }} aria-label={`${n} of 3 stars`}>
      {[1, 2, 3].map((i) => (
        <svg key={i} viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
          <path d="M50 8 L61 35 L90 37 L67 56 L75 85 L50 69 L25 85 L33 56 L10 37 L39 35 Z"
            fill={i <= n ? '#FFC93C' : 'rgba(255,255,255,0.55)'} stroke={i <= n ? '#E08A00' : 'rgba(80,60,120,0.25)'} strokeWidth="7" strokeLinejoin="round" />
        </svg>
      ))}
    </div>
  );
}

// ------------------------------------------------------------- Benny the Bear (the kids' game buddy)

export type BearMood = 'happy' | 'wow' | 'think' | 'oops';

export function KidBear({ mood = 'happy', size = 64 }: { mood?: BearMood; size?: number }) {
  const line = '#3A2A1E';
  const fur = '#C68A57';
  const eyes = mood === 'think'
    ? (<g><circle cx="41" cy="50" r="4" fill={line} /><circle cx="61" cy="50" r="4" fill={line} /><circle cx="42.5" cy="48" r="1.5" fill="#fff" /><circle cx="62.5" cy="48" r="1.5" fill="#fff" /></g>)
    : mood === 'wow'
      ? (<g><circle cx="40" cy="52" r="5.5" fill={line} /><circle cx="60" cy="52" r="5.5" fill={line} /><circle cx="42" cy="50" r="2" fill="#fff" /><circle cx="62" cy="50" r="2" fill="#fff" /></g>)
      : (<g><circle cx="40" cy="53" r="4.2" fill={line} /><circle cx="60" cy="53" r="4.2" fill={line} /><circle cx="41.5" cy="51.4" r="1.6" fill="#fff" /><circle cx="61.5" cy="51.4" r="1.6" fill="#fff" /></g>);
  const mouth = mood === 'wow'
    ? <ellipse cx="50" cy="72" rx="4" ry="5" fill={line} />
    : mood === 'oops'
      ? <path d="M44 74 Q50 70 56 74" stroke={line} strokeWidth="3" fill="none" strokeLinecap="round" />
      : mood === 'think'
        ? <path d="M45 72 L55 71" stroke={line} strokeWidth="3" strokeLinecap="round" />
        : <path d="M43 70 Q50 77 57 70" stroke={line} strokeWidth="3" fill="none" strokeLinecap="round" />;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="Benny the Bear">
      <circle cx="50" cy="50" r="48" fill="#FFE6C7" />
      <circle cx="25" cy="27" r="12" fill={fur} stroke={line} strokeWidth="3" />
      <circle cx="75" cy="27" r="12" fill={fur} stroke={line} strokeWidth="3" />
      <circle cx="25" cy="27" r="6" fill="#F3B7A0" />
      <circle cx="75" cy="27" r="6" fill="#F3B7A0" />
      <path d="M18 56 Q18 26 50 26 Q82 26 82 56 Q82 84 50 86 Q18 84 18 56 Z" fill={fur} stroke={line} strokeWidth="3" />
      <ellipse cx="50" cy="68" rx="15" ry="12" fill="#F6DDBF" />
      <ellipse cx="50" cy="62" rx="5.5" ry="4" fill={line} />
      {mood === 'think' && <path d="M34 42 L45 40 M56 40 L67 42" stroke={line} strokeWidth="2.5" strokeLinecap="round" />}
      {eyes}
      {mouth}
      <circle cx="30" cy="66" r="4.5" fill="#FF9AA2" opacity="0.6" />
      <circle cx="70" cy="66" r="4.5" fill="#FF9AA2" opacity="0.6" />
      <path d="M40 88 L50 83 L60 88 L50 93 Z" fill="#FF6B6B" stroke={line} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="50" cy="88" r="2.6" fill="#fff" />
    </svg>
  );
}
