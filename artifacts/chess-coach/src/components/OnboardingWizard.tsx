import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from '@/hooks/use-user';
import { invalidateEloCache } from '@/hooks/use-elo-progress';
import { apiFetch } from '@/lib/api';
import {
  AlertTriangle, Loader2, Sparkles, ArrowRight, Camera, Brain, Bot,
  Target, Trophy, Swords, Compass, Check, ChevronRight, Database, Zap,
  BookOpen, Crown, TrendingUp, ChevronLeft,
} from 'lucide-react';
import { AICoachCard } from '@/components/AICoachCard';

const ONBOARDING_KEY = 'chessscout_onboarding_v2';

const G = '#81b64c';
const BG = '#1a1816';
const CARD = '#262421';
const TEXT = '#e8e6e3';
const MUTED = '#9e9b98';

const LOADING_MESSAGES = [
  "Pulling your last games...",
  "Detecting patterns in your losses...",
  "Finding your biggest weakness...",
  "Building your personal report...",
];

type Step = 'goal' | 'import' | 'loading' | 'aha' | 'tour' | 'demoReview' | 'deepImport' | 'commit';
type Platform = 'chesscom' | 'lichess';

interface Insight {
  headline: string;
  detail: string;
  severity: 'high' | 'medium' | 'low';
  metric?: string;
}

interface InsightsResponse {
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  insights: Insight[];
}

const SEV_BG: Record<string, string> = {
  high: 'linear-gradient(135deg, rgba(220,67,67,0.18) 0%, rgba(220,67,67,0.04) 100%)',
  medium: 'linear-gradient(135deg, rgba(234,151,51,0.18) 0%, rgba(234,151,51,0.04) 100%)',
  low: 'linear-gradient(135deg, rgba(129,182,76,0.18) 0%, rgba(129,182,76,0.04) 100%)',
};
const SEV_BORDER: Record<string, string> = {
  high: 'rgba(220,67,67,0.35)',
  medium: 'rgba(234,151,51,0.35)',
  low: 'rgba(129,182,76,0.35)',
};
const SEV_ACCENT: Record<string, string> = {
  high: '#dc4343',
  medium: '#ea9733',
  low: G,
};

const GOALS = [
  { id: 'fix',       icon: Target,  title: 'Stop losing the same way',  blurb: 'Find the patterns costing you games.',           commit: "We've already spotted the patterns dragging your rating down. Let's go fix them." },
  { id: 'climb',     icon: Trophy,  title: 'Climb to my next level',    blurb: 'Targeted fixes to break your rating ceiling.',   commit: "Your roadmap to the next rating tier is loaded. Time to climb." },
  { id: 'tourney',   icon: Swords,  title: 'Prep for an opponent',      blurb: 'Scout their weaknesses before you play.',        commit: "You're ready to scout. Drop an opponent's username and we'll do the rest." },
  { id: 'explore',   icon: Compass, title: "I'm just exploring",        blurb: "Show me what's possible.",                       commit: "Have a poke around — your dashboard is wired up with everything we found." },
] as const;

const TOUR = [
  {
    id: 'scan',
    icon: Camera,
    badge: 'NEW',
    title: 'Scan any position',
    sub: 'Snap a board mid-game and get the AI verdict in seconds.',
    bullet1: 'Works on books, screens, real boards',
    bullet2: 'Best move + threats + plan',
    bullet3: 'No more guessing in postgame review',
    demo: 'scan',
  },
  {
    id: 'analysis',
    icon: Brain,
    badge: 'CORE',
    title: 'AI Game Coach',
    sub: 'Every game gets a personalized breakdown of your blunders and fixes.',
    bullet1: 'Plain-English mistake explanations',
    bullet2: 'Pattern detection across all your games',
    bullet3: 'Custom drills for your weak spots',
    demo: 'analysis',
  },
  {
    id: 'practice',
    icon: Bot,
    badge: 'TRAIN',
    title: 'Practice Bots',
    sub: 'Drill the exact positions you keep losing — over and over until they click.',
    bullet1: 'Bots that punish your weaknesses',
    bullet2: 'Replay your worst openings',
    bullet3: 'Endgame mastery rooms',
    demo: 'practice',
  },
] as const;

function ProgressDots({ index, total }: { index: number; total: number }) {
  return (
    <div className="flex justify-center gap-1.5 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="h-1 rounded-full transition-all duration-300"
          style={{
            width: i === index ? 24 : 6,
            background: i <= index ? G : 'rgba(255,255,255,0.12)',
          }}
        />
      ))}
    </div>
  );
}

type Piece = { p: string; w: boolean };
type HL = { sq: string; color: 'green' | 'red' | 'amber' };

const FILES = ['a','b','c','d','e','f','g','h'];
const RANKS = [8,7,6,5,4,3,2,1];

function MiniBoard({
  size = 152,
  pieces,
  highlights = [],
  arrow,
  scanLine = false,
  badge,
  rotateMs,
}: {
  size?: number;
  pieces: Record<string, Piece>;
  highlights?: HL[];
  arrow?: { from: string; to: string; color?: string };
  scanLine?: boolean;
  badge?: { label: string; pulse?: boolean; color?: string };
  rotateMs?: number;
}) {
  const SQ = size / 8;
  const sqToXY = (sq: string) => {
    const f = FILES.indexOf(sq[0]!);
    const r = RANKS.indexOf(parseInt(sq[1]!, 10));
    return { x: f * SQ + SQ / 2, y: r * SQ + SQ / 2 };
  };
  const colorFor = (c: HL['color']) => {
    if (c === 'red') return { bg: 'rgba(220,67,67,0.55)', border: '#dc4343' };
    if (c === 'amber') return { bg: 'rgba(255,179,71,0.55)', border: '#ffb347' };
    return { bg: 'rgba(129,182,76,0.55)', border: '#81b64c' };
  };
  const arrowColor = arrow?.color ?? '#81b64c';
  const arrowId = `ah-${arrowColor.replace('#','')}`;
  const a = arrow ? sqToXY(arrow.from) : null;
  const b = arrow ? sqToXY(arrow.to) : null;
  const fontSize = Math.round(SQ * 0.78);

  return (
    <motion.div
      className="relative shrink-0 rounded-md overflow-hidden"
      style={{ width: size, height: size, boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}
      animate={rotateMs ? { rotate: [0, 0.4, -0.4, 0] } : {}}
      transition={rotateMs ? { duration: rotateMs / 1000, repeat: Infinity, ease: 'easeInOut' } : {}}
    >
      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(8, 1fr)' }}>
        {RANKS.map((r, ri) =>
          FILES.map((f, fi) => {
            const sq = `${f}${r}`;
            const isLight = (ri + fi) % 2 === 0;
            const piece = pieces[sq];
            const hl = highlights.find((h) => h.sq === sq);
            const c = hl ? colorFor(hl.color) : null;
            return (
              <div
                key={sq}
                className="relative flex items-center justify-center"
                style={{ background: isLight ? '#eeeed2' : '#769656' }}
              >
                {c && (
                  <div className="absolute inset-0" style={{ background: c.bg, boxShadow: `inset 0 0 0 1.5px ${c.border}` }} />
                )}
                {piece && (
                  <span
                    className="relative"
                    style={{
                      fontSize,
                      lineHeight: 1,
                      color: piece.w ? '#fff' : '#1a1a1a',
                      textShadow: piece.w
                        ? '0 1px 1px rgba(0,0,0,0.6), 0 0 1px rgba(0,0,0,0.8)'
                        : '0 1px 1px rgba(255,255,255,0.2)',
                    }}
                  >
                    {piece.p}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
      {arrow && a && b && (
        <svg className="absolute inset-0 pointer-events-none" width={size} height={size}>
          <defs>
            <marker id={arrowId} markerWidth="3" markerHeight="3" refX="1.5" refY="1.5" orient="auto">
              <polygon points="0 0, 3 1.5, 0 3" fill={arrowColor} />
            </marker>
          </defs>
          <motion.line
            x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={arrowColor} strokeWidth={3} strokeLinecap="round"
            markerEnd={`url(#${arrowId})`}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5, ease: 'easeOut' }}
          />
        </svg>
      )}
      {scanLine && (
        <motion.div
          aria-hidden
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            height: 8,
            background: 'linear-gradient(90deg, transparent 0%, rgba(129,182,76,0.55) 50%, transparent 100%)',
            filter: 'blur(2px)',
            boxShadow: '0 0 8px rgba(129,182,76,0.6)',
          }}
          initial={{ top: 0 }}
          animate={{ top: ['-8px', `${size}px`, '-8px'] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      {badge && (
        <div className="absolute top-1.5 right-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          {badge.pulse && (
            <motion.div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: badge.color ?? G }}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
          )}
          <span className="text-[8px] font-black tracking-wider" style={{ color: '#fff' }}>{badge.label}</span>
        </div>
      )}
    </motion.div>
  );
}

// Famous opening / tactical positions used for the deep-import shuffle animation.
const SCHOLARS_MATE: Record<string, Piece> = {
  a8:{p:'♜',w:false},b8:{p:'♞',w:false},c8:{p:'♝',w:false},d8:{p:'♛',w:false},e8:{p:'♚',w:false},f8:{p:'♝',w:false},h8:{p:'♜',w:false},
  a7:{p:'♟',w:false},b7:{p:'♟',w:false},c7:{p:'♟',w:false},d7:{p:'♟',w:false},f7:{p:'♟',w:false},g7:{p:'♟',w:false},h7:{p:'♟',w:false},
  c6:{p:'♞',w:false},f6:{p:'♞',w:false},e5:{p:'♟',w:false},
  c4:{p:'♗',w:true},e4:{p:'♙',w:true},h5:{p:'♕',w:true},f3:{p:'♘',w:true},
  a2:{p:'♙',w:true},b2:{p:'♙',w:true},c2:{p:'♙',w:true},d2:{p:'♙',w:true},f2:{p:'♙',w:true},g2:{p:'♙',w:true},h2:{p:'♙',w:true},
  a1:{p:'♖',w:true},c1:{p:'♗',w:true},e1:{p:'♔',w:true},h1:{p:'♖',w:true},
};

const RUY_LOPEZ: Record<string, Piece> = {
  a8:{p:'♜',w:false},c8:{p:'♝',w:false},d8:{p:'♛',w:false},e8:{p:'♚',w:false},f8:{p:'♝',w:false},g8:{p:'♞',w:false},h8:{p:'♜',w:false},
  a6:{p:'♟',w:false},b7:{p:'♟',w:false},c7:{p:'♟',w:false},d7:{p:'♟',w:false},f7:{p:'♟',w:false},g7:{p:'♟',w:false},h7:{p:'♟',w:false},
  c6:{p:'♞',w:false},f6:{p:'♞',w:false},e5:{p:'♟',w:false},
  a4:{p:'♗',w:true},e4:{p:'♙',w:true},f3:{p:'♘',w:true},
  a2:{p:'♙',w:true},b2:{p:'♙',w:true},c2:{p:'♙',w:true},d2:{p:'♙',w:true},f2:{p:'♙',w:true},g2:{p:'♙',w:true},h2:{p:'♙',w:true},
  a1:{p:'♖',w:true},b1:{p:'♘',w:true},c1:{p:'♗',w:true},d1:{p:'♕',w:true},g1:{p:'♔',w:true},h1:{p:'♖',w:true},
};

const CARO_KANN: Record<string, Piece> = {
  a8:{p:'♜',w:false},b8:{p:'♞',w:false},c8:{p:'♝',w:false},d8:{p:'♛',w:false},e8:{p:'♚',w:false},f8:{p:'♝',w:false},g8:{p:'♞',w:false},h8:{p:'♜',w:false},
  a7:{p:'♟',w:false},b7:{p:'♟',w:false},e7:{p:'♟',w:false},f7:{p:'♟',w:false},g7:{p:'♟',w:false},h7:{p:'♟',w:false},
  c6:{p:'♟',w:false},d5:{p:'♟',w:false},
  d4:{p:'♙',w:true},e4:{p:'♙',w:true},
  a2:{p:'♙',w:true},b2:{p:'♙',w:true},c2:{p:'♙',w:true},f2:{p:'♙',w:true},g2:{p:'♙',w:true},h2:{p:'♙',w:true},
  a1:{p:'♖',w:true},b1:{p:'♘',w:true},c1:{p:'♗',w:true},d1:{p:'♕',w:true},e1:{p:'♔',w:true},f1:{p:'♗',w:true},g1:{p:'♘',w:true},h1:{p:'♖',w:true},
};

const QGD: Record<string, Piece> = {
  a8:{p:'♜',w:false},b8:{p:'♞',w:false},c8:{p:'♝',w:false},d8:{p:'♛',w:false},e8:{p:'♚',w:false},f8:{p:'♝',w:false},g8:{p:'♞',w:false},h8:{p:'♜',w:false},
  a7:{p:'♟',w:false},b7:{p:'♟',w:false},c7:{p:'♟',w:false},f7:{p:'♟',w:false},g7:{p:'♟',w:false},h7:{p:'♟',w:false},
  d5:{p:'♟',w:false},e6:{p:'♟',w:false},
  c4:{p:'♙',w:true},d4:{p:'♙',w:true},
  a2:{p:'♙',w:true},b2:{p:'♙',w:true},e2:{p:'♙',w:true},f2:{p:'♙',w:true},g2:{p:'♙',w:true},h2:{p:'♙',w:true},
  a1:{p:'♖',w:true},b1:{p:'♘',w:true},c1:{p:'♗',w:true},d1:{p:'♕',w:true},e1:{p:'♔',w:true},f1:{p:'♗',w:true},g1:{p:'♘',w:true},h1:{p:'♖',w:true},
};

const SICILIAN: Record<string, Piece> = {
  a8:{p:'♜',w:false},b8:{p:'♞',w:false},c8:{p:'♝',w:false},d8:{p:'♛',w:false},e8:{p:'♚',w:false},f8:{p:'♝',w:false},g8:{p:'♞',w:false},h8:{p:'♜',w:false},
  a7:{p:'♟',w:false},b7:{p:'♟',w:false},d7:{p:'♟',w:false},e7:{p:'♟',w:false},f7:{p:'♟',w:false},g7:{p:'♟',w:false},h7:{p:'♟',w:false},
  c5:{p:'♟',w:false},
  e4:{p:'♙',w:true},
  a2:{p:'♙',w:true},b2:{p:'♙',w:true},c2:{p:'♙',w:true},d2:{p:'♙',w:true},f2:{p:'♙',w:true},g2:{p:'♙',w:true},h2:{p:'♙',w:true},
  a1:{p:'♖',w:true},b1:{p:'♘',w:true},c1:{p:'♗',w:true},d1:{p:'♕',w:true},e1:{p:'♔',w:true},f1:{p:'♗',w:true},g1:{p:'♘',w:true},h1:{p:'♖',w:true},
};

const KINGS_INDIAN: Record<string, Piece> = {
  a8:{p:'♜',w:false},b8:{p:'♞',w:false},c8:{p:'♝',w:false},d8:{p:'♛',w:false},f8:{p:'♜',w:false},g8:{p:'♚',w:false},
  a7:{p:'♟',w:false},b7:{p:'♟',w:false},c7:{p:'♟',w:false},e7:{p:'♟',w:false},f7:{p:'♟',w:false},h7:{p:'♟',w:false},
  d6:{p:'♟',w:false},f6:{p:'♞',w:false},g6:{p:'♟',w:false},
  g7:{p:'♝',w:false},
  c4:{p:'♙',w:true},d4:{p:'♙',w:true},e4:{p:'♙',w:true},
  c3:{p:'♘',w:true},f3:{p:'♘',w:true},
  a2:{p:'♙',w:true},b2:{p:'♙',w:true},f2:{p:'♙',w:true},g2:{p:'♙',w:true},h2:{p:'♙',w:true},
  a1:{p:'♖',w:true},c1:{p:'♗',w:true},d1:{p:'♕',w:true},e1:{p:'♔',w:true},f1:{p:'♗',w:true},h1:{p:'♖',w:true},
};

const CYCLE_POSITIONS = [
  { pos: SCHOLARS_MATE, label: 'Italian · Qxf7#', hl: [{ sq:'h5', color:'green' as const }, { sq:'f7', color:'green' as const }], arrow: { from:'h5', to:'f7' } },
  { pos: RUY_LOPEZ, label: 'Ruy López · Bxc6', hl: [{ sq:'a4', color:'amber' as const }, { sq:'c6', color:'amber' as const }], arrow: { from:'a4', to:'c6', color:'#ffb347' } },
  { pos: CARO_KANN, label: 'Caro-Kann · e4 dxe4', hl: [{ sq:'e4', color:'red' as const }, { sq:'d5', color:'red' as const }] },
  { pos: QGD, label: 'Queen\'s Gambit Decl.', hl: [{ sq:'c4', color:'green' as const }, { sq:'d5', color:'amber' as const }] },
  { pos: SICILIAN, label: 'Sicilian Defense', hl: [{ sq:'e4', color:'green' as const }, { sq:'c5', color:'red' as const }] },
  { pos: KINGS_INDIAN, label: "King's Indian Setup", hl: [{ sq:'g7', color:'green' as const }, { sq:'e4', color:'green' as const }] },
];

function DeepImportVisual({ totalGames }: { totalGames: number }) {
  const [idx, setIdx] = useState(0);
  const [scanned, setScanned] = useState(0);
  const [patterns, setPatterns] = useState(0);
  const target = Math.max(800, Math.round(totalGames * 2.5));

  useEffect(() => {
    const cycle = setInterval(() => setIdx((i) => (i + 1) % CYCLE_POSITIONS.length), 700);
    const tick = setInterval(() => {
      setScanned((s) => Math.min(target, s + Math.floor(Math.random() * 9) + 3));
      if (Math.random() < 0.18) setPatterns((p) => p + 1);
    }, 140);
    return () => { clearInterval(cycle); clearInterval(tick); };
  }, [target]);

  const cur = CYCLE_POSITIONS[idx]!;
  const pct = Math.round((scanned / target) * 100);

  return (
    <div className="rounded-3xl p-3 mb-5" style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid ${G}33` }}>
      <div className="flex items-center gap-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.2 }}
          >
            <MiniBoard
              size={132}
              pieces={cur.pos}
              highlights={cur.hl}
              arrow={cur.arrow}
              scanLine
              badge={{ label: 'ANALYZING', pulse: true }}
            />
          </motion.div>
        </AnimatePresence>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: G }}>NOW STUDYING</p>
          <AnimatePresence mode="wait">
            <motion.p
              key={cur.label}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="text-sm font-black mb-2 truncate"
              style={{ color: TEXT }}
            >
              {cur.label}
            </motion.p>
          </AnimatePresence>
          <div className="space-y-1.5 mb-2">
            <div className="flex items-center justify-between text-[10px] font-bold" style={{ color: MUTED }}>
              <span>GAMES</span>
              <span className="font-mono" style={{ color: TEXT }}>{scanned.toLocaleString()} / {target.toLocaleString()}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <motion.div
                className="h-full"
                style={{ background: G }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider" style={{ color: G }}>
            <Sparkles className="w-3 h-3" />
            <span>{patterns} patterns found</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TourDemo({ kind }: { kind: 'scan' | 'analysis' | 'practice' }) {
  if (kind === 'scan') {
    // Scholar's-mate-style position. Black to move into mate after Qxf7#.
    const pieces: Record<string, { p: string; w: boolean }> = {
      a8: { p: '♜', w: false }, b8: { p: '♞', w: false }, c8: { p: '♝', w: false },
      d8: { p: '♛', w: false }, e8: { p: '♚', w: false }, f8: { p: '♝', w: false },
      h8: { p: '♜', w: false },
      a7: { p: '♟', w: false }, b7: { p: '♟', w: false }, c7: { p: '♟', w: false },
      d7: { p: '♟', w: false }, f7: { p: '♟', w: false }, g7: { p: '♟', w: false },
      h7: { p: '♟', w: false },
      c6: { p: '♞', w: false }, f6: { p: '♞', w: false },
      e5: { p: '♟', w: false },
      c4: { p: '♗', w: true }, e4: { p: '♙', w: true },
      h5: { p: '♕', w: true },
      f3: { p: '♘', w: true },
      a2: { p: '♙', w: true }, b2: { p: '♙', w: true }, c2: { p: '♙', w: true },
      d2: { p: '♙', w: true }, f2: { p: '♙', w: true }, g2: { p: '♙', w: true },
      h2: { p: '♙', w: true },
      a1: { p: '♖', w: true }, c1: { p: '♗', w: true }, e1: { p: '♔', w: true },
      h1: { p: '♖', w: true },
    };
    const files = ['a','b','c','d','e','f','g','h'];
    const ranks = [8,7,6,5,4,3,2,1];
    const SOURCE = 'h5';
    const TARGET = 'f7';
    // Compute pixel coords for the move arrow, board is 152x152, square = 19px.
    const SQ = 19;
    const sqToXY = (sq: string) => {
      const f = files.indexOf(sq[0]!);
      const r = ranks.indexOf(parseInt(sq[1]!, 10));
      return { x: f * SQ + SQ / 2, y: r * SQ + SQ / 2 };
    };
    const a = sqToXY(SOURCE);
    const b = sqToXY(TARGET);

    return (
      <div className="rounded-3xl p-3 mb-4" style={{ background: 'rgba(0,0,0,0.35)', border: `1px solid rgba(255,255,255,0.05)` }}>
        <div className="flex items-center gap-3">
          {/* MINI BOARD WITH SCAN ANIMATION */}
          <div className="relative shrink-0 rounded-md overflow-hidden" style={{ width: 152, height: 152, boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
            <div className="absolute inset-0 grid" style={{ gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(8, 1fr)' }}>
              {ranks.map((r, ri) =>
                files.map((f, fi) => {
                  const sq = `${f}${r}`;
                  const isLight = (ri + fi) % 2 === 0;
                  const piece = pieces[sq];
                  const isHL = sq === SOURCE || sq === TARGET;
                  return (
                    <div
                      key={sq}
                      className="relative flex items-center justify-center"
                      style={{ background: isLight ? '#eeeed2' : '#769656' }}
                    >
                      {isHL && (
                        <div className="absolute inset-0" style={{ background: 'rgba(129,182,76,0.55)', boxShadow: 'inset 0 0 0 1.5px #81b64c' }} />
                      )}
                      {piece && (
                        <span
                          className="relative"
                          style={{
                            fontSize: 15,
                            lineHeight: 1,
                            color: piece.w ? '#fff' : '#1a1a1a',
                            textShadow: piece.w
                              ? '0 1px 1px rgba(0,0,0,0.6), 0 0 1px rgba(0,0,0,0.8)'
                              : '0 1px 1px rgba(255,255,255,0.2)',
                          }}
                        >
                          {piece.p}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            {/* Move arrow */}
            <svg className="absolute inset-0 pointer-events-none" width={152} height={152}>
              <defs>
                <marker id="arrowhead" markerWidth="3" markerHeight="3" refX="1.5" refY="1.5" orient="auto">
                  <polygon points="0 0, 3 1.5, 0 3" fill="#81b64c" />
                </marker>
              </defs>
              <motion.line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="#81b64c" strokeWidth={3} strokeLinecap="round"
                markerEnd="url(#arrowhead)"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.5, ease: 'easeOut' }}
              />
            </svg>
            {/* Scan-line sweep */}
            <motion.div
              aria-hidden
              className="absolute left-0 right-0 pointer-events-none"
              style={{
                height: 8,
                background: 'linear-gradient(90deg, transparent 0%, rgba(129,182,76,0.55) 50%, transparent 100%)',
                filter: 'blur(2px)',
                boxShadow: '0 0 8px rgba(129,182,76,0.6)',
              }}
              initial={{ top: 0 }}
              animate={{ top: ['-8px', '152px', '-8px'] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />
            {/* "ANALYZING" badge */}
            <div className="absolute top-1.5 right-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
              <motion.div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: G }}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              <span className="text-[8px] font-black tracking-wider" style={{ color: '#fff' }}>SCANNING</span>
            </div>
          </div>

          {/* Verdict */}
          <div className="flex-1 min-w-0 text-left">
            <p className="text-[10px] font-black uppercase tracking-wider mb-1" style={{ color: G }}>AI Verdict</p>
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.3 }}
              className="text-base font-black font-mono leading-tight"
              style={{ color: TEXT }}
            >
              Qxf7<span style={{ color: G }}>#</span>
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.1, duration: 0.3 }}
              className="text-xs mt-0.5"
              style={{ color: MUTED }}
            >
              checkmate · 0.4s
            </motion.p>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
              className="mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black"
              style={{ background: `${G}22`, color: G, border: `1px solid ${G}44` }}
            >
              +∞ EVAL
            </motion.div>
          </div>
        </div>
      </div>
    );
  }
  if (kind === 'analysis') {
    // Greek-Gift-ish position: white played Nf3 (blunder, red), better was Bxh7+ (green).
    const analysisPieces: Record<string, Piece> = {
      a8:{p:'♜',w:false},c8:{p:'♝',w:false},d8:{p:'♛',w:false},f8:{p:'♜',w:false},g8:{p:'♚',w:false},
      a7:{p:'♟',w:false},b7:{p:'♟',w:false},c7:{p:'♟',w:false},f7:{p:'♟',w:false},g7:{p:'♟',w:false},h7:{p:'♟',w:false},
      c6:{p:'♞',w:false},f6:{p:'♞',w:false},e6:{p:'♟',w:false},
      d4:{p:'♙',w:true},
      d3:{p:'♗',w:true},c3:{p:'♘',w:true},
      a2:{p:'♙',w:true},b2:{p:'♙',w:true},c2:{p:'♙',w:true},f2:{p:'♙',w:true},g2:{p:'♙',w:true},h2:{p:'♙',w:true},
      a1:{p:'♖',w:true},c1:{p:'♗',w:true},d1:{p:'♕',w:true},f1:{p:'♖',w:true},g1:{p:'♔',w:true},
      f3:{p:'♘',w:true},
    };
    return (
      <div className="rounded-3xl p-3 mb-4" style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-3">
          <MiniBoard
            pieces={analysisPieces}
            highlights={[
              { sq: 'f3', color: 'red' },
              { sq: 'h7', color: 'green' },
              { sq: 'd3', color: 'green' },
            ]}
            arrow={{ from: 'd3', to: 'h7', color: '#81b64c' }}
            badge={{ label: 'BLUNDER', color: '#dc4343', pulse: true }}
          />
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#dc4343' }} />
              <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#ef6b6b' }}>Move 14</p>
            </div>
            <p className="text-sm font-black leading-tight mb-1.5" style={{ color: TEXT }}>You played <span className="font-mono" style={{ color: '#ef6b6b' }}>Nf3</span>, hanging tempo.</p>
            <div className="flex items-center gap-1.5 mb-0.5">
              <Check className="w-3 h-3" style={{ color: G }} strokeWidth={3} />
              <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: G }}>Better</p>
            </div>
            <p className="text-xs font-mono font-bold" style={{ color: TEXT }}><span style={{ color: G }}>Bxh7+</span> · winning attack</p>
          </div>
        </div>
      </div>
    );
  }
  // practice
  // Caro-Kann main line — bot punishes Black's setup.
  const practicePieces: Record<string, Piece> = {
    a8:{p:'♜',w:false},c8:{p:'♝',w:false},d8:{p:'♛',w:false},e8:{p:'♚',w:false},f8:{p:'♝',w:false},h8:{p:'♜',w:false},
    a7:{p:'♟',w:false},b7:{p:'♟',w:false},e7:{p:'♟',w:false},f7:{p:'♟',w:false},g7:{p:'♟',w:false},h7:{p:'♟',w:false},
    c6:{p:'♟',w:false},d7:{p:'♞',w:false},f6:{p:'♞',w:false},
    e4:{p:'♘',w:true},d4:{p:'♙',w:true},
    a2:{p:'♙',w:true},b2:{p:'♙',w:true},c2:{p:'♙',w:true},f2:{p:'♙',w:true},g2:{p:'♙',w:true},h2:{p:'♙',w:true},
    a1:{p:'♖',w:true},b1:{p:'♘',w:true},c1:{p:'♗',w:true},d1:{p:'♕',w:true},e1:{p:'♔',w:true},f1:{p:'♗',w:true},g1:{p:'♘',w:true},h1:{p:'♖',w:true},
  };
  return (
    <div className="rounded-3xl p-3 mb-4" style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="flex items-center gap-3">
        <MiniBoard
          pieces={practicePieces}
          highlights={[
            { sq: 'e4', color: 'green' },
            { sq: 'f6', color: 'red' },
          ]}
          arrow={{ from: 'e4', to: 'f6', color: '#81b64c' }}
          badge={{ label: 'BOT TURN', pulse: true }}
        />
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-7 h-7 rounded-[2rem] flex items-center justify-center shrink-0" style={{ background: `${G}22`, border: `1px solid ${G}44` }}>
              <Bot className="w-4 h-4" style={{ color: G }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black leading-tight" style={{ color: TEXT }}>Anti-Caro Bot</p>
              <p className="text-[10px]" style={{ color: MUTED }}>Trained on your losses · 1450</p>
            </div>
          </div>
          <p className="text-xs font-mono font-bold mb-1" style={{ color: TEXT }}>
            Threat: <span style={{ color: '#ef6b6b' }}>Nxf6+</span>
          </p>
          <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black" style={{ background: `${G}1f`, color: G, border: `1px solid ${G}44` }}>
            READY TO DRILL
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// DEMO REVIEW STEP — interactive AI review walkthrough during onboarding
// =====================================================================

const DEMO_START: Record<string, Piece> = {
  a8:{p:'♜',w:false},b8:{p:'♞',w:false},c8:{p:'♝',w:false},d8:{p:'♛',w:false},e8:{p:'♚',w:false},f8:{p:'♝',w:false},g8:{p:'♞',w:false},h8:{p:'♜',w:false},
  a7:{p:'♟',w:false},b7:{p:'♟',w:false},c7:{p:'♟',w:false},d7:{p:'♟',w:false},e7:{p:'♟',w:false},f7:{p:'♟',w:false},g7:{p:'♟',w:false},h7:{p:'♟',w:false},
  a2:{p:'♙',w:true},b2:{p:'♙',w:true},c2:{p:'♙',w:true},d2:{p:'♙',w:true},e2:{p:'♙',w:true},f2:{p:'♙',w:true},g2:{p:'♙',w:true},h2:{p:'♙',w:true},
  a1:{p:'♖',w:true},b1:{p:'♘',w:true},c1:{p:'♗',w:true},d1:{p:'♕',w:true},e1:{p:'♔',w:true},f1:{p:'♗',w:true},g1:{p:'♘',w:true},h1:{p:'♖',w:true},
};

type DemoMove = {
  san: string;
  from: string;
  to: string;
  by: 'white' | 'black';
  classification: 'best' | 'book' | 'inaccuracy' | 'mistake' | 'excellent';
  tone: 'positive' | 'warning' | 'danger' | 'info' | 'neutral' | 'gold';
  badge: string;
  badgeColor: string;
  text: string;
};

const DEMO_MOVES: DemoMove[] = [
  { san: '1. e4',    from: 'e2', to: 'e4', by: 'white', classification: 'book',       tone: 'info',     badge: 'BOOK',        badgeColor: '#5b9bd5',
    text: "Classic King's Pawn opening. Fights for the center and frees both the queen and bishop in one move." },
  { san: '1… e5',    from: 'e7', to: 'e5', by: 'black', classification: 'book',       tone: 'info',     badge: 'BOOK',        badgeColor: '#5b9bd5',
    text: "Symmetric reply — a principled, classical defense. Both sides are now playing for fast development." },
  { san: '2. Qh5?',  from: 'd1', to: 'h5', by: 'white', classification: 'mistake',    tone: 'warning',  badge: 'MISTAKE',     badgeColor: '#ffb347',
    text: "Premature queen sortie. Bringing the queen out this early lets Black gain tempo by developing pieces with threats." },
  { san: '2… Nc6',   from: 'b8', to: 'c6', by: 'black', classification: 'best',       tone: 'positive', badge: 'BEST',        badgeColor: '#81b64c',
    text: "Calmly defends e5 while developing a knight to its best square. This is exactly how to punish an early queen sortie." },
  { san: '3. Bc4',   from: 'f1', to: 'c4', by: 'white', classification: 'inaccuracy', tone: 'warning',  badge: 'INACCURACY',  badgeColor: '#ffb347',
    text: "Threatens scholar's mate on f7, but Black has a clean defense. White is now playing for tricks instead of a real plan." },
  { san: '3… g6!',   from: 'g7', to: 'g6', by: 'black', classification: 'excellent',  tone: 'gold',     badge: 'EXCELLENT',   badgeColor: '#eaa631',
    text: "Defends f7 and attacks the queen with tempo — Black solves both problems in a single move." },
];

function applyDemoMoves(n: number): Record<string, Piece> {
  const pos: Record<string, Piece> = { ...DEMO_START };
  for (let i = 0; i < n; i++) {
    const m = DEMO_MOVES[i];
    pos[m.to] = pos[m.from];
    delete pos[m.from];
  }
  return pos;
}

function DemoReviewStep({ onContinue }: { onContinue: () => void }) {
  const [idx, setIdx] = useState(0); // 0 = start; 1..N = after move N-1
  const totalMoves = DEMO_MOVES.length;
  const move = idx > 0 ? DEMO_MOVES[idx - 1] : null;
  const pos = applyDemoMoves(idx);

  const canPrev = idx > 0;
  const canNext = idx < totalMoves;
  const isComplete = idx === totalMoves;

  return (
    <motion.div
      key="demoReview"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="text-center"
    >
      <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: G }}>
        See it in action · live AI review
      </p>
      <h1 className="text-2xl md:text-4xl font-black mb-2 leading-[1.05] tracking-tight" style={{ color: TEXT }}>
        Step through a real <span style={{ color: G }}>AI review</span>
      </h1>
      <p className="text-sm md:text-base mb-5 max-w-md mx-auto" style={{ color: MUTED }}>
        This is exactly how every game in your library will be analyzed — move by move, with the coach explaining what worked and what didn't.
      </p>

      <div
        className="rounded-xl p-4 md:p-5 mb-4"
        style={{
          background: `linear-gradient(180deg, ${CARD} 0%, #2a2825 100%)`,
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 24px 60px -14px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.05) inset',
        }}
      >
        {/* Move dots */}
        <div className="flex justify-center gap-1.5 mb-4">
          {DEMO_MOVES.map((m, i) => (
            <div key={i}
              className="h-1 rounded-full transition-all"
              style={{
                width: i === idx - 1 ? 22 : 6,
                background: i < idx ? m.badgeColor : 'rgba(255,255,255,0.12)',
              }}
            />
          ))}
        </div>

        <div className="flex justify-center mb-4 min-h-[240px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`board-${idx}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            >
              <MiniBoard
                size={240}
                pieces={pos}
                highlights={move ? [{ sq: move.from, color: 'green' }, { sq: move.to, color: move.classification === 'mistake' || move.classification === 'inaccuracy' ? 'amber' : 'green' }] : []}
                arrow={move ? { from: move.from, to: move.to, color: move.badgeColor } : undefined}
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {move ? (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`mv-${idx}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            >
              <div className="flex items-center justify-center gap-2 mb-3">
                <span className="text-base font-black font-mono" style={{ color: TEXT }}>{move.san}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-black tracking-wider"
                  style={{ background: `${move.badgeColor}22`, color: move.badgeColor, border: `1px solid ${move.badgeColor}55` }}>
                  {move.badge}
                </span>
              </div>
              <AICoachCard tone={move.tone} name="Coach" badge="LIVE" title={`${move.by === 'white' ? 'White' : 'Black'} played ${move.san}`}>
                <p>{move.text}</p>
              </AICoachCard>
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="px-1 py-4 text-sm" style={{ color: MUTED }}>
            <BookOpen className="w-5 h-5 mx-auto mb-2" style={{ color: G }} />
            Click <span className="font-bold" style={{ color: TEXT }}>Next move</span> to see the coach analyze each move.
          </div>
        )}

        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => canPrev && setIdx(idx - 1)}
            disabled={!canPrev}
            className="flex items-center justify-center gap-1 px-3 py-2.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: TEXT }}
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          {canNext ? (
            <button
              onClick={() => setIdx(idx + 1)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all"
              style={{ background: G, color: '#fff', boxShadow: `0 12px 30px -8px ${G}88` }}
            >
              {idx === 0 ? 'Start review' : `Next move (${idx}/${totalMoves})`}
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onContinue}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all"
              style={{ background: G, color: '#fff', boxShadow: `0 12px 30px -8px ${G}88` }}
            >
              <Crown className="w-4 h-4" />
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {isComplete && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl p-3 mb-2 flex items-start gap-2 text-left"
          style={{ background: `${G}10`, border: `1px solid ${G}30` }}
        >
          <TrendingUp className="w-4 h-4 mt-0.5 shrink-0" style={{ color: G }} />
          <p className="text-xs" style={{ color: TEXT }}>
            <span className="font-bold">That's one game.</span> Every game in your library gets the same treatment — patterns surface, weaknesses get named, and the coach builds a plan around your real mistakes.
          </p>
        </motion.div>
      )}

      <button
        onClick={onContinue}
        className="text-xs mt-3 underline-offset-2 hover:underline"
        style={{ color: MUTED }}
      >
        Skip review
      </button>
    </motion.div>
  );
}

export function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const { authUser, login, refreshAuth } = useUser();
  const [step, setStep] = useState<Step>('goal');
  const [goal, setGoal] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>('chesscom');
  const [importUsername, setImportUsername] = useState(authUser?.chesscomUsername ?? authUser?.lichessUsername ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [tourIdx, setTourIdx] = useState(0);
  const [gameCounter, setGameCounter] = useState(0);
  const [deepImporting, setDeepImporting] = useState(false);
  const [deepImported, setDeepImported] = useState<number | null>(null);
  const [deepError, setDeepError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => () => { cancelledRef.current = true; }, []);

  // Loading message rotation + fake progress + ticking games counter
  useEffect(() => {
    if (step !== 'loading') return;
    setLoadingMsgIdx(0);
    setProgress(0);
    setGameCounter(0);
    const msgIv = setInterval(() => {
      setLoadingMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 1500);
    const progIv = setInterval(() => {
      setProgress((p) => (p < 90 ? p + Math.random() * 6 : p));
    }, 400);
    const counterIv = setInterval(() => {
      setGameCounter((c) => c + Math.floor(Math.random() * 4 + 1));
    }, 180);
    return () => { clearInterval(msgIv); clearInterval(progIv); clearInterval(counterIv); };
  }, [step]);

  const startImport = useCallback(async () => {
    const name = importUsername.trim();
    if (!name) { setError('Please enter a username'); return; }
    setError(null);
    setStep('loading');

    try {
      const importRes = await apiFetch('/api/games/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: name,
          months: 12,
          platform,
          ownerUsername: name,
        }),
      });
      if (!importRes.ok) {
        const j = await importRes.json().catch(() => ({}));
        throw new Error(j.error || `Import failed (${importRes.status})`);
      }

      login(name);
      try { await refreshAuth(); } catch {}
      invalidateEloCache();

      const insightsRes = await apiFetch(
        `/api/onboarding/insights?username=${encodeURIComponent(name)}&platform=${platform}`,
        { credentials: 'include' },
      );
      if (!insightsRes.ok) throw new Error('Failed to compute insights');
      const data = (await insightsRes.json()) as InsightsResponse;

      if (cancelledRef.current) return;
      setProgress(100);
      setInsights(data);
      setTimeout(() => {
        if (!cancelledRef.current) setStep('aha');
      }, 500);
    } catch (e) {
      if (cancelledRef.current) return;
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setStep('import');
    }
  }, [importUsername, platform, login, refreshAuth]);

  const runDeepImport = useCallback(async () => {
    const name = importUsername.trim();
    if (!name) { setStep('commit'); return; }
    setDeepError(null);
    setDeepImporting(true);
    try {
      const res = await apiFetch('/api/games/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: name,
          months: 24,
          platform,
          ownerUsername: name,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Import failed (${res.status})`);
      }
      const data = await res.json().catch(() => ({} as any));
      if (cancelledRef.current) return;
      const total = typeof data.total === 'number' ? data.total : null;
      const imported = typeof data.imported === 'number' ? data.imported : null;
      setDeepImported(total ?? imported ?? 0);
      invalidateEloCache();
      setTimeout(() => {
        if (!cancelledRef.current) { setDeepImporting(false); setStep('commit'); }
      }, 700);
    } catch (e) {
      if (cancelledRef.current) return;
      setDeepImporting(false);
      setDeepError(e instanceof Error ? e.message : 'Could not import more games');
    }
  }, [importUsername, platform]);

  // Step index for progress dots
  const progressIndex =
    step === 'goal' ? 0 :
    step === 'import' || step === 'loading' ? 1 :
    step === 'aha' ? 2 :
    step === 'tour' ? 3 :
    step === 'demoReview' ? 4 :
    step === 'deepImport' ? 5 : 6;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-start md:items-center justify-center p-3 md:p-6 pt-6 md:pt-6 overflow-y-auto"
      style={{
        background: `radial-gradient(ellipse at top, rgba(129,182,76,0.12) 0%, ${BG} 45%, #0f0d0c 100%)`,
      }}
    >
      {/* ambient floating glows */}
      <motion.div
        aria-hidden
        className="fixed top-[-120px] left-[-120px] w-[420px] h-[420px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(129,182,76,0.18) 0%, transparent 70%)', filter: 'blur(20px)' }}
        animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="fixed bottom-[-150px] right-[-150px] w-[480px] h-[480px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(234,151,51,0.14) 0%, transparent 70%)', filter: 'blur(24px)' }}
        animate={{ x: [0, -30, 0], y: [0, -40, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-xl relative rounded-[28px] p-5 md:p-8"
        style={{
          background: 'linear-gradient(180deg, rgba(48,46,43,0.95) 0%, rgba(38,36,33,0.95) 100%)',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow:
            '0 30px 80px -20px rgba(0,0,0,0.65), 0 0 0 1px rgba(129,182,76,0.06), inset 0 1px 0 rgba(255,255,255,0.04)',
          backdropFilter: 'blur(8px)',
        }}
      >
        {/* top sheen */}
        <div
          aria-hidden
          className="absolute top-0 left-8 right-8 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)' }}
        />

        <ProgressDots index={progressIndex} total={7} />

        <AnimatePresence mode="wait">
          {/* STEP 1 — GOAL */}
          {step === 'goal' && (
            <motion.div
              key="goal"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.25 }}
              className="text-center"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
                style={{ background: `${G}14`, border: `1px solid ${G}40` }}>
                <div className="flex -space-x-1.5">
                  {['#dc4343','#ea9733','#81b64c'].map((c, i) => (
                    <div key={i} className="w-4 h-4 rounded-full border" style={{ background: c, borderColor: BG }} />
                  ))}
                </div>
                <span className="text-[11px] font-black tracking-wide" style={{ color: G }}>
                  12,847 PLAYERS · AVG <span style={{ color: TEXT }}>+147 RATING</span> IN 30 DAYS
                </span>
              </div>
              <h1 className="text-3xl md:text-5xl font-black mb-3 leading-[1.05] tracking-tight" style={{ color: TEXT }}>
                What's your <span style={{ color: G }}>#1 goal</span>?
              </h1>
              <p className="text-sm md:text-base mb-6" style={{ color: MUTED }}>
                Pick one — we'll tune the entire app around it.
              </p>

              <div className="space-y-2.5">
                {GOALS.map((g) => {
                  const Icon = g.icon;
                  const selected = goal === g.id;
                  return (
                    <button
                      key={g.id}
                      onClick={() => setGoal(g.id)}
                      className="w-full text-left rounded-3xl p-4 flex items-center gap-3 transition-all"
                      style={{
                        background: selected ? `${G}14` : CARD,
                        border: `1.5px solid ${selected ? `${G}80` : 'rgba(255,255,255,0.06)'}`,
                      }}
                    >
                      <div className="w-10 h-10 rounded-[2rem] flex items-center justify-center shrink-0"
                        style={{ background: selected ? `${G}26` : 'rgba(255,255,255,0.04)' }}>
                        <Icon className="w-5 h-5" style={{ color: selected ? G : MUTED }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-black text-sm md:text-base leading-tight" style={{ color: TEXT }}>
                          {g.title}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: MUTED }}>{g.blurb}</p>
                      </div>
                      {selected && (
                        <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: G }}>
                          <Check className="w-3.5 h-3.5" style={{ color: '#fff' }} strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setStep('import')}
                disabled={!goal}
                className="w-full mt-5 flex items-center justify-center gap-2 py-3.5 rounded-3xl font-black text-base transition-all disabled:opacity-40"
                style={{ background: G, color: '#fff' }}
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </motion.div>
          )}

          {/* STEP 2 — IMPORT */}
          {step === 'import' && (
            <motion.div
              key="import"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.25 }}
              className="text-center"
            >
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-[2rem] mb-5"
                style={{ background: `${G}1a`, border: `1px solid ${G}33` }}>
                <Sparkles className="w-7 h-7" style={{ color: G }} />
              </div>
              <h1 className="text-3xl md:text-5xl font-black mb-3 leading-[1.05] tracking-tight" style={{ color: TEXT }}>
                Let's find your <span style={{ color: '#dc4343' }}>biggest leaks</span>
              </h1>
              <p className="text-sm md:text-base mb-6 max-w-md mx-auto" style={{ color: MUTED }}>
                Drop your handle. <span style={{ color: TEXT }}>30 seconds</span> · no password · we'll do the rest.
              </p>

              <div className="rounded-[2rem] p-5 md:p-6" style={{ background: CARD, border: `1px solid rgba(255,255,255,0.06)` }}>
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setPlatform('chesscom')}
                    className="flex-1 py-2.5 rounded-[2rem] font-bold text-sm transition-all"
                    style={{
                      background: platform === 'chesscom' ? `${G}1f` : 'rgba(255,255,255,0.04)',
                      color: platform === 'chesscom' ? G : MUTED,
                      border: `1px solid ${platform === 'chesscom' ? `${G}55` : 'transparent'}`,
                    }}
                  >
                    Chess.com
                  </button>
                  <button
                    onClick={() => setPlatform('lichess')}
                    className="flex-1 py-2.5 rounded-[2rem] font-bold text-sm transition-all"
                    style={{
                      background: platform === 'lichess' ? `${G}1f` : 'rgba(255,255,255,0.04)',
                      color: platform === 'lichess' ? G : MUTED,
                      border: `1px solid ${platform === 'lichess' ? `${G}55` : 'transparent'}`,
                    }}
                  >
                    Lichess
                  </button>
                </div>

                <input
                  type="text"
                  value={importUsername}
                  onChange={(e) => setImportUsername(e.target.value)}
                  placeholder={`Your ${platform === 'chesscom' ? 'Chess.com' : 'Lichess'} username`}
                  className="w-full px-4 py-3.5 rounded-3xl text-base outline-none transition-all mb-3 text-center font-semibold"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '2px solid rgba(255,255,255,0.08)',
                    color: TEXT,
                  }}
                  onFocus={(e) => (e.target.style.borderColor = G)}
                  onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
                  onKeyDown={(e) => { if (e.key === 'Enter') startImport(); }}
                  autoFocus
                />

                {error && (
                  <div className="mb-3 p-2.5 rounded-[2rem] text-sm" style={{ background: 'rgba(220,67,67,0.1)', border: '1px solid rgba(220,67,67,0.25)', color: '#ef6b6b' }}>
                    {error}
                  </div>
                )}

                <button
                  onClick={startImport}
                  disabled={!importUsername.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-3xl font-black text-base transition-all disabled:opacity-50"
                  style={{ background: G, color: '#fff' }}
                >
                  Analyze My Games
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 3 — LOADING */}
          {step === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-6"
            >
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-[2rem] mb-6"
                style={{ background: `${G}1a`, border: `1px solid ${G}33` }}>
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: G }} />
              </div>

              <AnimatePresence mode="wait">
                <motion.h2
                  key={loadingMsgIdx}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                  className="text-xl md:text-2xl font-bold mb-8"
                  style={{ color: TEXT }}
                >
                  {LOADING_MESSAGES[loadingMsgIdx]}
                </motion.h2>
              </AnimatePresence>

              <div className="max-w-sm mx-auto">
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: G, width: `${progress}%` }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                  />
                </div>
                <p className="text-xs mt-3 font-mono" style={{ color: MUTED }}>
                  {Math.round(progress)}%
                </p>

                <div className="mt-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <Database className="w-3.5 h-3.5" style={{ color: G }} />
                  <span className="text-xs font-mono font-bold" style={{ color: TEXT }}>
                    {gameCounter} games processed
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 4 — AHA / INSIGHTS */}
          {step === 'aha' && insights && (
            <motion.div
              key="aha"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              {(() => {
                const highCount = insights.insights.filter(i => i.severity === 'high').length;
                const medCount  = insights.insights.filter(i => i.severity === 'medium').length;
                const leak = Math.max(40, highCount * 65 + medCount * 35 + Math.min(insights.losses, 30) * 2);
                return (
                  <div className="text-center mb-6">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-3" style={{ color: G }}>
                      ✓ Analysis Complete · {insights.totalGames} games scanned
                    </p>
                    <h1 className="text-3xl md:text-5xl font-black leading-[1.05] tracking-tight mb-4" style={{ color: TEXT }}>
                      You're leaking
                    </h1>
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.15, type: 'spring', stiffness: 180 }}
                      className="inline-block mb-4 relative"
                    >
                      {/* sparkle particles around the number */}
                      {[...Array(6)].map((_, i) => {
                        const angle = (i / 6) * Math.PI * 2;
                        const r = 70;
                        return (
                          <motion.div
                            key={i}
                            className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full"
                            style={{ background: '#ef6b6b' }}
                            initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                            animate={{
                              x: Math.cos(angle) * r,
                              y: Math.sin(angle) * r,
                              opacity: [0, 1, 0],
                              scale: [0, 1.2, 0],
                            }}
                            transition={{ delay: 0.4 + i * 0.04, duration: 0.9, ease: 'easeOut' }}
                          />
                        );
                      })}
                      <motion.div
                        className="px-5 py-2 rounded-[2rem] relative"
                        animate={{
                          boxShadow: [
                            '0 0 0 rgba(220,67,67,0)',
                            '0 0 40px rgba(220,67,67,0.45)',
                            '0 0 0 rgba(220,67,67,0)',
                          ],
                        }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                        style={{
                          background: 'linear-gradient(135deg, rgba(220,67,67,0.18) 0%, rgba(220,67,67,0.04) 100%)',
                          border: '1.5px solid rgba(220,67,67,0.35)',
                        }}
                      >
                        <span className="text-5xl md:text-6xl font-black tracking-tight" style={{ color: '#ef6b6b' }}>
                          ~{leak}
                        </span>
                        <span className="text-xl md:text-2xl font-black ml-1" style={{ color: '#ef6b6b' }}>pts</span>
                      </motion.div>
                    </motion.div>
                    <p className="text-sm md:text-base font-semibold" style={{ color: TEXT }}>
                      every month you don't fix these.
                    </p>
                  </div>
                );
              })()}

              <div className="space-y-3 mb-6">
                {insights.insights.map((ins, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.12, duration: 0.3 }}
                    className="rounded-[2rem] p-5"
                    style={{
                      background: SEV_BG[ins.severity],
                      border: `1px solid ${SEV_BORDER[ins.severity]}`,
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="shrink-0 w-9 h-9 rounded-[2rem] flex items-center justify-center"
                        style={{ background: `${SEV_ACCENT[ins.severity]}22` }}
                      >
                        <AlertTriangle className="w-5 h-5" style={{ color: SEV_ACCENT[ins.severity] }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-base md:text-lg font-black leading-tight mb-1.5" style={{ color: TEXT }}>
                          {ins.headline}
                        </p>
                        <p className="text-sm" style={{ color: MUTED }}>
                          {ins.detail}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + insights.insights.length * 0.12 }}
                onClick={() => { setTourIdx(0); setStep('tour'); }}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-3xl font-black text-base transition-all"
                style={{ background: G, color: '#fff' }}
              >
                Show me how to fix this
                <ArrowRight className="w-5 h-5" />
              </motion.button>
            </motion.div>
          )}

          {/* STEP 5 — TOUR */}
          {step === 'tour' && (
            <motion.div
              key={`tour-${tourIdx}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="text-center"
            >
              <div className="flex justify-center gap-1.5 mb-4">
                {TOUR.map((_, i) => (
                  <div key={i}
                    className="h-1 rounded-full transition-all"
                    style={{ width: i === tourIdx ? 20 : 5, background: i <= tourIdx ? G : 'rgba(255,255,255,0.12)' }}
                  />
                ))}
              </div>

              <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: G }}>
                Your toolkit · {tourIdx + 1} of {TOUR.length}
              </p>

              {(() => {
                const t = TOUR[tourIdx];
                const Icon = t.icon;
                return (
                  <div className="rounded-[2rem] p-5 md:p-6" style={{ background: CARD, border: `1px solid rgba(255,255,255,0.06)` }}>
                    <div className="flex items-center justify-center gap-2 mb-4">
                      <div className="w-12 h-12 rounded-3xl flex items-center justify-center"
                        style={{ background: `${G}1a`, border: `1px solid ${G}33` }}>
                        <Icon className="w-6 h-6" style={{ color: G }} />
                      </div>
                      <span className="px-2 py-1 rounded text-[10px] font-black tracking-wider"
                        style={{ background: 'rgba(234,166,49,0.15)', color: '#eaa631' }}>
                        {t.badge}
                      </span>
                    </div>

                    <h2 className="text-2xl md:text-3xl font-black mb-2 leading-tight" style={{ color: TEXT }}>
                      {t.title}
                    </h2>
                    <p className="text-sm md:text-base mb-5" style={{ color: MUTED }}>
                      {t.sub}
                    </p>

                    <TourDemo kind={t.demo as any} />

                    <div className="space-y-2 text-left mb-5">
                      {[t.bullet1, t.bullet2, t.bullet3].map((b, i) => (
                        <motion.div
                          key={`${tourIdx}-${i}`}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.1 + i * 0.08 }}
                          className="flex items-start gap-2"
                        >
                          <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                            style={{ background: `${G}26` }}>
                            <Check className="w-2.5 h-2.5" style={{ color: G }} strokeWidth={3} />
                          </div>
                          <p className="text-sm" style={{ color: TEXT }}>{b}</p>
                        </motion.div>
                      ))}
                    </div>

                    <button
                      onClick={() => {
                        if (tourIdx < TOUR.length - 1) setTourIdx(tourIdx + 1);
                        else setStep('demoReview');
                      }}
                      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-3xl font-black text-base transition-all"
                      style={{ background: G, color: '#fff' }}
                    >
                      {tourIdx < TOUR.length - 1 ? 'Next weapon' : "I'm ready"}
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                );
              })()}

              <button
                onClick={() => setStep('demoReview')}
                className="text-xs mt-4 underline-offset-2 hover:underline"
                style={{ color: MUTED }}
              >
                Skip tour
              </button>
            </motion.div>
          )}

          {/* STEP 6 — DEMO REVIEW (live AI walkthrough) */}
          {step === 'demoReview' && (
            <DemoReviewStep onContinue={() => setStep('deepImport')} />
          )}

          {/* STEP 7 — DEEP IMPORT */}
          {step === 'deepImport' && (
            <motion.div
              key="deepImport"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="text-center"
            >
              <motion.div
                animate={deepImporting ? { scale: [1, 1.06, 1] } : {}}
                transition={deepImporting ? { repeat: Infinity, duration: 1.4 } : {}}
                className="inline-flex items-center justify-center w-14 h-14 rounded-[2rem] mb-5"
                style={{ background: `${G}1a`, border: `1px solid ${G}33` }}
              >
                {deepImporting
                  ? <Loader2 className="w-7 h-7 animate-spin" style={{ color: G }} />
                  : <Database className="w-7 h-7" style={{ color: G }} />}
              </motion.div>

              <h1 className="text-3xl md:text-5xl font-black mb-3 leading-[1.05] tracking-tight" style={{ color: TEXT }}>
                {deepImporting
                  ? 'Pulling your full library…'
                  : <>Unlock <span style={{ color: G }}>5× more patterns</span></>}
              </h1>
              <p className="text-sm md:text-base mb-6 max-w-md mx-auto" style={{ color: MUTED }}>
                {deepImporting
                  ? "Hang tight — this can take a moment for active players."
                  : <>You've seen <span style={{ color: TEXT }}>1 year</span> so far. Pull the rest and every long-running pattern surfaces.</>}
              </p>

              {deepImporting && <DeepImportVisual totalGames={insights?.totalGames ?? 0} />}

              <div className="grid grid-cols-2 gap-2.5 mb-5" style={deepImporting ? { opacity: 0.35 } : undefined}>
                <div className="rounded-3xl p-4 text-left" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: MUTED }}>1 YEAR</p>
                  <p className="text-2xl font-black mb-1" style={{ color: TEXT }}>{insights?.totalGames ?? 0}</p>
                  <p className="text-xs" style={{ color: MUTED }}>games · ~{insights?.insights?.length ?? 3} patterns</p>
                </div>
                <motion.div className="rounded-3xl p-4 text-left relative overflow-hidden"
                  animate={{
                    boxShadow: [
                      `0 0 0 ${G}00`,
                      `0 0 30px ${G}55`,
                      `0 0 0 ${G}00`,
                    ],
                  }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    background: 'linear-gradient(135deg, rgba(129,182,76,0.18) 0%, rgba(129,182,76,0.04) 100%)',
                    border: `1.5px solid ${G}66`,
                  }}>
                  <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider" style={{ background: G, color: '#fff' }}>
                    RECOMMENDED
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: G }}>FULL HISTORY</p>
                  <p className="text-2xl font-black mb-1" style={{ color: TEXT }}>{Math.max(8, Math.round((insights?.totalGames ?? 0) * 2.5))}+</p>
                  <p className="text-xs" style={{ color: TEXT }}>games · <span style={{ color: G }}>~{Math.max(8, (insights?.insights?.length ?? 3) * 3)} patterns</span></p>
                </motion.div>
              </div>

              {deepError && (
                <div className="mb-3 p-2.5 rounded-[2rem] text-sm" style={{ background: 'rgba(220,67,67,0.1)', border: '1px solid rgba(220,67,67,0.25)', color: '#ef6b6b' }}>
                  {deepError}
                </div>
              )}

              <button
                onClick={runDeepImport}
                disabled={deepImporting}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-3xl font-black text-base transition-all disabled:opacity-70"
                style={{ background: G, color: '#fff' }}
              >
                {deepImporting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Importing…
                  </>
                ) : (
                  <>
                    Yes, import my full library
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>

              {!deepImporting && (
                <button
                  onClick={() => setStep('commit')}
                  className="text-xs mt-4 underline-offset-2 hover:underline"
                  style={{ color: MUTED }}
                >
                  Maybe later
                </button>
              )}
            </motion.div>
          )}

          {/* STEP 7 — COMMIT */}
          {step === 'commit' && (
            <motion.div
              key="commit"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="text-center relative"
            >
              {/* CONFETTI BURST */}
              <div className="absolute inset-x-0 top-0 h-40 pointer-events-none overflow-visible">
                {Array.from({ length: 28 }).map((_, i) => {
                  const colors = [G, '#ffc34d', '#dc4343', '#5ab9ff', '#b8e070', '#ea9733'];
                  const color = colors[i % colors.length];
                  const startX = (Math.random() - 0.5) * 100;
                  const endX = startX + (Math.random() - 0.5) * 240;
                  const endY = 200 + Math.random() * 180;
                  const rot = Math.random() * 720;
                  const size = 5 + Math.random() * 6;
                  const isCircle = i % 3 === 0;
                  return (
                    <motion.div
                      key={i}
                      initial={{ x: `${startX}%`, y: 10, opacity: 1, rotate: 0, scale: 0.6 }}
                      animate={{ x: `${endX}%`, y: endY, opacity: [1, 1, 0], rotate: rot, scale: 1 }}
                      transition={{ duration: 1.6 + Math.random() * 0.8, ease: 'easeOut', delay: Math.random() * 0.15 }}
                      className="absolute left-1/2 top-0"
                      style={{
                        width: size,
                        height: isCircle ? size : size * 0.5,
                        background: color,
                        borderRadius: isCircle ? '50%' : 1,
                      }}
                    />
                  );
                })}
              </div>

              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6 relative"
                style={{ background: `${G}1a`, border: `2px solid ${G}55`, boxShadow: `0 0 40px ${G}55` }}
              >
                <Check className="w-10 h-10" style={{ color: G }} strokeWidth={3} />
              </motion.div>

              <h1 className="text-4xl md:text-5xl font-black mb-3 leading-[1.05] tracking-tight" style={{ color: TEXT }}>
                You're <span style={{ color: G }}>locked in</span>.
              </h1>
              {(() => {
                const total = deepImported ?? insights?.totalGames ?? 0;
                const goalCommit = GOALS.find(g => g.id === goal)?.commit
                  ?? "Your dashboard is loaded and ready.";
                return (
                  <p className="text-base mb-6 max-w-md mx-auto" style={{ color: MUTED }}>
                    {total > 0 ? <><span style={{ color: TEXT, fontWeight: 800 }}>{total} games</span> analyzed. </> : ''}{goalCommit}
                  </p>
                );
              })()}

              {/* Projected rating gain visual */}
              <div className="rounded-[2rem] p-5 mb-4"
                style={{
                  background: 'linear-gradient(135deg, rgba(129,182,76,0.16) 0%, rgba(129,182,76,0.02) 100%)',
                  border: `1.5px solid ${G}55`,
                }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: G }}>30-DAY PROJECTION</span>
                  <span className="text-2xl md:text-3xl font-black" style={{ color: G }}>+147</span>
                </div>
                <div className="flex items-end gap-1 h-12">
                  {[28, 35, 42, 48, 58, 70, 85, 100].map((h, i) => (
                    <motion.div
                      key={i}
                      initial={{ height: 0 }}
                      animate={{ height: `${h}%` }}
                      transition={{ delay: 0.3 + i * 0.05, duration: 0.4, ease: 'easeOut' }}
                      className="flex-1 rounded-sm"
                      style={{
                        background: i >= 5
                          ? G
                          : 'rgba(255,255,255,0.18)',
                      }}
                    />
                  ))}
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>TODAY</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: G }}>+30 DAYS</span>
                </div>
              </div>

              <div className="rounded-3xl p-3 mb-6 flex items-center gap-2.5"
                style={{ background: CARD, border: `1px solid rgba(255,255,255,0.06)` }}>
                <div className="w-8 h-8 rounded-[2rem] flex items-center justify-center shrink-0" style={{ background: `${G}22` }}>
                  <Zap className="w-4 h-4" style={{ color: G }} />
                </div>
                <div className="text-left flex-1">
                  <p className="text-xs font-black" style={{ color: TEXT }}>3 days of premium · free</p>
                  <p className="text-[11px]" style={{ color: MUTED }}>No card. Cancel anytime.</p>
                </div>
              </div>

              <button
                onClick={onComplete}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-3xl font-black text-base transition-all"
                style={{ background: G, color: '#fff' }}
              >
                Start improving
                <ArrowRight className="w-5 h-5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

// Custom event name so multiple useOnboardingCheck() consumers stay in sync
const ONBOARDING_EVENT = 'chessscout:onboarding-changed';

export function useOnboardingCheck() {
  const { isAuthenticated, isAuthLoading, authUser } = useUser();
  const userKey = authUser?.id ? `${ONBOARDING_KEY}_${authUser.id}` : null;

  const computeShow = useCallback(() => {
    if (isAuthLoading || !isAuthenticated || !userKey) return false;
    return !localStorage.getItem(userKey);
  }, [isAuthenticated, isAuthLoading, userKey]);

  const [show, setShow] = useState(computeShow);

  useEffect(() => {
    setShow(computeShow());
    const handler = () => setShow(computeShow());
    window.addEventListener(ONBOARDING_EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(ONBOARDING_EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, [computeShow]);

  const dismissOnboarding = useCallback(() => {
    if (userKey) localStorage.setItem(userKey, 'done');
    setShow(false);
    window.dispatchEvent(new Event(ONBOARDING_EVENT));
  }, [userKey]);

  return { showOnboarding: show, dismissOnboarding };
}
