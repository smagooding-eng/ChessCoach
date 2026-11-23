// The Scout Trail: puzzles as a walk along a trail. Every solved puzzle moves your pawn one stop;
// each stretch of 20 stops is a new area (campsite, lake, lookout, summit…), and the next one waits
// under the clouds. Solving opens the normal puzzle trainer (which favours your own mistakes).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { ListTree } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useUser } from '@/hooks/use-user';
import { AppIcon } from '@/components/AppIcon';
import { setPageMeta } from '@/lib/pageMeta';

type Stats = { total: number; solved: number; streak: number; accuracy: number };
const STOPS = 20;
const AREAS = [
  { name: 'Base Camp', ground: '#3E7A3A', ground2: '#356B32', path: '#C9A46A', accent: '#E8524A' },
  { name: 'Pine Lake', ground: '#2F7353', ground2: '#28644A', path: '#CDB07C', accent: '#4FA3E8' },
  { name: 'Lookout Ridge', ground: '#6E7A3A', ground2: '#5F6A31', path: '#D8B77A', accent: '#F2B53A' },
  { name: 'Summit', ground: '#5E6B73', ground2: '#525E66', path: '#E6D3A8', accent: '#9B7BE8' },
];
const area = (i: number) => AREAS[i % AREAS.length];
const TIPS = [
  'Every stop on the trail is a puzzle. Many come from mistakes in your own games.',
  'Got one wrong? Look at the solution before moving on. That is where the learning is.',
  'Check every capture and every check before you move. Most puzzles hide one.',
  'Twenty stops and this area is done. The next one is waiting under the clouds.',
];

// Stop positions: a winding path from the bottom (stop 1) to the top (stop 20).
const W = 360, H = 1120, TOP = 270; // above TOP: the next area, under clouds
const pathX = (y: number) => W / 2 + Math.sin(((H - 70 - y) / (H - 70 - TOP)) * Math.PI * 3.2) * 105;
const stopPos = (i: number) => {
  const y = H - 70 - (i / (STOPS - 1)) * (H - 70 - TOP);
  return { x: pathX(y), y };
};
/** Scenery beside the trail at height y: on whichever side has more room. */
const beside = (y: number, off = 118) => { const px = pathX(y); return px > W / 2 ? Math.max(34, px - off) : Math.min(W - 34, px + off); };

function Tree({ x, y, s = 1, c = '#2F6B2E' }: { x: number; y: number; s?: number; c?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="26" rx="16" ry="5" fill="rgba(0,0,0,.22)" />
      <rect x="-3" y="10" width="6" height="16" rx="2" fill="#7A5230" />
      <path d="M0-28 18 2H-18z" fill={c} /><path d="M0-14 22 16H-22z" fill={c} />
      <path d="M0-28 18 2H6z" fill="rgba(0,0,0,.14)" />
    </g>
  );
}
function Tent({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="22" rx="30" ry="7" fill="rgba(0,0,0,.22)" />
      <path d="M-28 22 0-20 28 22z" fill="#E8524A" /><path d="M0-20 28 22H6z" fill="#B8343E" />
      <path d="M-7 22 0 4l7 18z" fill="#3A1F1C" /><path d="M0-20v-10" stroke="#5B3A22" strokeWidth="2.5" />
      <path d="M0-30h12l-3 4 3 4H0z" fill="#F2B53A" />
    </g>
  );
}
function Campfire({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-12 8 12 2M-12 2l24 6" stroke="#7A5230" strokeWidth="4" strokeLinecap="round" />
      <path d="M0-14c4 6 9 8 9 14a9 9 0 0 1-18 0c0-5 4-7 6-9 0 3 1 4 3 5 0-4 0-7 0-10z" fill="#F08A3C" />
      <path d="M0-3c2 3 4 4 4 7a4 4 0 0 1-8 0c0-2 2-3 3-4z" fill="#F2B53A" />
    </g>
  );
}
function Pond({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="0" rx="46" ry="22" fill="#2E73B8" /><ellipse cx="-4" cy="-3" rx="38" ry="16" fill="#4FA3E8" />
      <path d="M-20-6q6-3 12 0M6 2q6-3 12 0" stroke="#BFE0FA" strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="22" cy="6" rx="7" ry="4" fill="#5FA83A" />
    </g>
  );
}
function Tower({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="34" rx="24" ry="6" fill="rgba(0,0,0,.22)" />
      <path d="M-16 34-8-12M16 34 8-12M-12 14h24M-14 26h28" stroke="#7A5230" strokeWidth="4" strokeLinecap="round" />
      <rect x="-15" y="-26" width="30" height="16" rx="2" fill="#9B6B3F" /><path d="M-19-26 0-42 19-26z" fill="#5F8F36" />
      <rect x="-9" y="-22" width="18" height="8" fill="#3A2614" />
    </g>
  );
}
function Rock({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${s})`}><path d="M-14 8-8-6 4-9 14 2 10 8z" fill="#8C9694" /><path d="M4-9 14 2 10 8 2 4z" fill="#6F7977" /></g>;
}

function Stone({ i, x, y, state, color }: { i: number; x: number; y: number; state: 'done' | 'here' | 'next'; color: string }) {
  const top = state === 'done' ? '#E3C48A' : state === 'here' ? '#F5DDA5' : '#B89868';
  return (
    <g transform={`translate(${x} ${y})`} opacity={state === 'next' ? 0.92 : 1}>
      <ellipse cx="0" cy="9" rx="25" ry="11" fill="rgba(0,0,0,.25)" />
      <ellipse cx="0" cy="5" rx="24" ry="13" fill="#8A6235" />
      <ellipse cx="0" cy="0" rx="24" ry="13" fill={top} />
      <ellipse cx="0" cy="0" rx="17" ry="8.5" fill="none" stroke="rgba(122,82,48,.35)" strokeWidth="1.5" />
      {state === 'done'
        ? <path d="m-7 0 5 4.5 9-9" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        : <text x="0" y="5" textAnchor="middle" fontSize="15" fontWeight="900" fill="#5B3A1E" fontFamily="system-ui">{i + 1}</text>}
    </g>
  );
}
function Pawn({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y - 30})`}><g className="cs-trail-pawn">
      <ellipse cx="0" cy="30" rx="16" ry="6" fill="rgba(0,0,0,.3)" />
      <circle cx="0" cy="-10" r="9" fill="#81B64C" stroke="#4F7A2A" strokeWidth="2" />
      <path d="M-7 0h14l3 6H-10zM-12 6h24l4 20h-32z" fill="#81B64C" stroke="#4F7A2A" strokeWidth="2" strokeLinejoin="round" />
      <path d="M-6-14a4 4 0 0 1 4-3" stroke="#C5E3A3" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </g></g>
  );
}
function Clouds() {
  const c = (x: number, y: number, s: number) => (
    <g transform={`translate(${x} ${y}) scale(${s})`}><circle cx="-30" cy="6" r="22" fill="#E6EEF0" /><circle cx="0" cy="-6" r="30" fill="#F1F6F7" /><circle cx="32" cy="6" r="22" fill="#E6EEF0" /><rect x="-52" y="6" width="106" height="22" rx="11" fill="#E6EEF0" /></g>
  );
  return (
    <g>
      <rect width={W} height={TOP - 70} fill="#DCE7EA" />
      <path d={`M0 ${TOP - 70} q45 30 90 0 t90 0 t90 0 t90 0 V${TOP - 110} H0z`} fill="#DCE7EA" />
      {c(50, 60, 1.1)}{c(250, 50, 1.3)}{c(160, 125, 1)}{c(330, 140, .9)}{c(30, 160, .9)}
    </g>
  );
}

export default function ScoutTrailPage() {
  const { authUser } = useUser();
  const [stats, setStats] = useState<Stats | null>(null);
  const hereRef = useRef<SVGGElement>(null);
  useEffect(() => { setPageMeta('Scout Trail — ChessScout.net', 'Puzzles as a trail: every puzzle you solve moves you one stop.', '/trail'); }, []);
  useEffect(() => {
    if (!authUser) return;
    apiFetch('/api/puzzles/stats', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setStats(d)).catch(() => {});
  }, [authUser]);

  const solved = stats?.solved ?? 0;
  const areaIdx = Math.floor(solved / STOPS);
  const at = solved % STOPS; // the stop you're standing on (0-based): the next puzzle to solve
  const a = area(areaIdx);
  const tip = useMemo(() => TIPS[(solved + areaIdx) % TIPS.length], [solved, areaIdx]);

  // keep the pawn in view
  useEffect(() => { hereRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [stats]);

  const pts = Array.from({ length: STOPS }, (_, i) => stopPos(i));
  const pathD = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  return (
    <div className="mx-auto w-full max-w-[560px] px-3 pt-3" style={{ color: '#F5F7F6' }}>
      <style>{'@keyframes csPawnBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}} .cs-trail-pawn{animation:csPawnBob 1.6s ease-in-out infinite;transform-box:fill-box}'}</style>
      <div className="mb-2 flex items-center justify-center gap-2">
        <AppIcon name="trail" size={24} />
        <h1 className="text-[20px] font-black">Scout Trail</h1>
      </div>

      {/* the coach, in a speech bubble */}
      <div className="mb-2 flex items-start gap-2.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ background: '#212B2D' }}><AppIcon name="coach" size={30} /></span>
        <p className="relative rounded-[12px] px-3 py-2 text-[13.5px] font-semibold leading-snug" style={{ background: '#F5F7F6', color: '#1A2224' }}>{tip}</p>
      </div>

      <div className="relative overflow-hidden rounded-[12px]" style={{ background: a.ground }}>
        <div className="flex items-center justify-between px-3 py-2 text-[13px] font-extrabold" style={{ background: 'rgba(0,0,0,.25)' }}>
          <span>Area {areaIdx + 1}: {a.name}</span>
          <span>{at}/{STOPS}</span>
        </div>
        <div className="max-h-[62vh] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Trail: stop ${at + 1} of ${STOPS}`}>
            <rect width={W} height={H} fill={a.ground} />
            {Array.from({ length: 40 }, (_, k) => (
              <ellipse key={k} cx={(k * 97) % W} cy={(k * 173) % H} rx={18 + (k % 4) * 6} ry={7 + (k % 3) * 3} fill={a.ground2} opacity=".7" />
            ))}
            {/* the trail itself */}
            <path d={pathD} fill="none" stroke="rgba(0,0,0,.18)" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 4)" />
            <path d={pathD} fill="none" stroke={a.path} strokeWidth="30" strokeLinecap="round" strokeLinejoin="round" opacity=".55" />
            {/* scenery, kept beside the trail */}
            <Tent x={beside(H - 90, 120)} y={H - 90} /><Campfire x={beside(H - 40, 70)} y={H - 34} />
            <Tree x={beside(H - 200)} y={H - 200} s={1.1} /><Tree x={beside(H - 170, 150)} y={H - 165} s={.8} c="#3B7D37" />
            <Rock x={beside(H - 290, 90)} y={H - 290} />
            <Pond x={beside(H - 410, 125)} y={H - 410} /><Tree x={beside(H - 500)} y={H - 500} s={1.2} /><Tree x={beside(H - 470, 150)} y={H - 465} s={.85} c="#3B7D37" />
            <Rock x={beside(H - 590, 100)} y={H - 590} s={1.3} /><Tree x={beside(H - 650)} y={H - 650} />
            <Tower x={beside(H - 760, 115)} y={H - 760} />
            <Tree x={beside(H - 850)} y={H - 850} s={1.15} c="#3B7D37" /><Tree x={beside(H - 820, 150)} y={H - 815} s={.8} />
            {/* the finish flag */}
            <g transform={`translate(${pts[STOPS - 1].x + 30} ${pts[STOPS - 1].y - 40})`}>
              <path d="M0 0v44" stroke="#3A2614" strokeWidth="3" /><path d="M0 0h26l-6 7 6 7H0z" fill={a.accent} />
            </g>
            {pts.map((p, i) => (
              <Stone key={i} i={i} x={p.x} y={p.y} color="#5F8F36" state={i < at ? 'done' : i === at ? 'here' : 'next'} />
            ))}
            <g ref={hereRef}><Pawn x={pts[at].x} y={pts[at].y} /></g>
            {/* what's next: under the clouds */}
            <Clouds />
            <text x={W / 2} y={104} textAnchor="middle" fontSize="16" fontWeight="900" fill="#3A4648" fontFamily="system-ui">Next: {area(areaIdx + 1).name}</text>
          </svg>
        </div>
        {/* progress through this area */}
        <div className="flex items-center gap-2.5 px-3 py-2.5" style={{ background: 'rgba(0,0,0,.28)' }}>
          <span className="text-[13px] font-black">{at}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(0,0,0,.35)' }}>
            <div className="h-full rounded-full" style={{ width: `${(at / STOPS) * 100}%`, background: '#81B64C' }} />
          </div>
          <AppIcon name="badge" size={22} />
        </div>
      </div>

      <div className="mt-2 flex items-center justify-center gap-4 text-[12.5px] font-bold" style={{ color: '#87918E' }}>
        <span>{solved.toLocaleString()} solved</span>
        {stats && stats.total > 0 && <span>{stats.accuracy}% right</span>}
        {stats && stats.streak > 1 && <span className="inline-flex items-center gap-1"><AppIcon name="streak" size={15} />{stats.streak} in a row</span>}
      </div>

      <div className="cs-cta-dock flex gap-2">
        <Link href="/puzzles/solved" aria-label="Puzzles you have solved" className="cs-cta cs-cta-quiet !w-[56px] shrink-0"><ListTree size={22} /></Link>
        <Link href="/puzzles?from=trail" className="cs-cta">Solve puzzles</Link>
      </div>
    </div>
  );
}
