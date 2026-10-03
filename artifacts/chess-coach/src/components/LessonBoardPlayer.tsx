import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Chessboard, defaultPieces } from 'react-chessboard';
import { useSettings } from '@/context/SettingsContext';
import { Chess } from 'chess.js';
import {
  Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  MessageSquare, Swords, CheckCircle2, Lightbulb, Eye, RotateCcw,
  Trophy, Check, AlertTriangle, GraduationCap,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { buildTintedPieceSet } from './RecoloredPieces';
import { PieceGradientDefs } from './PieceGradientDefs';

const CHESSCOM_GREEN = '#81b64c';
const BG_DARK = '#262421';
const BG_CARD = '#302e2b';
const MISTAKE_RED = '#dc4343';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function FormatComment({ text, isMistake, isFix }: { text: string; isMistake?: boolean; isFix?: boolean }) {
  const baseColor = isMistake ? '#e8c4c4' : isFix ? '#c4e8d4' : '#c8c5c1';

  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*)|(The Mistake)|(The Fix)/gi;
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(<span key={key++}>{text.slice(last, match.index)}</span>);
    }

    const full = match[0];

    if (full.startsWith('**') && full.endsWith('**')) {
      parts.push(
        <strong key={key++} style={{ fontWeight: 700 }}>
          {full.slice(2, -2)}
        </strong>
      );
    } else if (/the mistake/i.test(full)) {
      parts.push(
        <span key={key++} style={{ color: MISTAKE_RED, fontWeight: 700 }}>
          {full}
        </span>
      );
    } else if (/the fix/i.test(full)) {
      parts.push(
        <span key={key++} style={{ color: CHESSCOM_GREEN, fontWeight: 700 }}>
          {full}
        </span>
      );
    }

    last = match.index + full.length;
  }

  if (last < text.length) {
    parts.push(<span key={key++}>{text.slice(last)}</span>);
  }

  return <span style={{ color: baseColor }}>{parts}</span>;
}

interface Step {
  fen: string;
  san: string | null;
  comment: string;
  moveNum: number;
  fullMoveNumber: number;
  color: 'w' | 'b' | null;
  isMistake?: boolean;
  isFix?: boolean;
  from?: string;
  to?: string;
}

const BOARD_LIGHT = '#f0d9b5';
const BOARD_DARK = '#b58863';

const SAN_PATTERN = /\*\*(?:\d+\.+\s*)?([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|O-O(?:-O)?)[!?]*\*\*/;

function extractFen(pgn: string): string | null {
  const fenHeaderMatch = pgn.match(/\[FEN\s+"([^"]+)"\]/i);
  if (fenHeaderMatch) {
    try { new Chess(fenHeaderMatch[1]); return fenHeaderMatch[1]; } catch { return null; }
  }
  const looksLikeFen = /^[rnbqkpRNBQKP1-8\/]+ [wb] [KQkq-]+ [a-h\d-]+/.test(pgn.trim());
  if (looksLikeFen) {
    try { new Chess(pgn.trim()); return pgn.trim(); } catch { return null; }
  }
  return null;
}

function extractTargetSquare(san: string): string | null {
  if (san === 'O-O' || san === 'O-O-O') return null;
  const m = san.match(/([a-h][1-8])/);
  return m ? m[1] : null;
}

function buildStepsFromContent(
  fen: string,
  content: string,
  drillExpectedMove: string | null,
): Step[] {
  const fullMoveNumber = parseInt(fen.split(' ')[5]) || 1;
  const turnColor: 'w' | 'b' = fen.split(' ')[1] === 'b' ? 'b' : 'w';

  // The Concept section is shown separately in the lesson's left-panel
  // intro card (see LessonIntroCard in CourseDetail.tsx) — showing it again
  // here would duplicate the same text. Still strip it from the step
  // sequence below so it doesn't also appear as a regular paragraph step.
  const introComment = 'Study this position.';

  const steps: Step[] = [
    { fen, san: null, comment: introComment, moveNum: 0, fullMoveNumber, color: null },
  ];

  const contentParts = content
    .replace(/##\s*The Concept\s*\n+[\s\S]*?(?=\n+##|$)/i, '')
    .split(/\n\n+/).filter(s => s.trim().length > 0);
  const grouped: string[] = [];
  for (let i = 0; i < contentParts.length; i++) {
    const t = contentParts[i].trim();
    if (t.startsWith('#') && i + 1 < contentParts.length && !contentParts[i + 1].trim().startsWith('#')) {
      grouped.push(t + '\n\n' + contentParts[i + 1].trim());
      i++;
    } else {
      grouped.push(t);
    }
  }

  for (const section of grouped) {
    const moveMatch = section.match(SAN_PATTERN);
    if (!moveMatch) continue;

    const san = moveMatch[1];
    const isMistakeSection = /mistake|error|wrong|bad|blunder|\?\?/i.test(section);
    const isFixSection = /fix|correct|better|instead|should|improve|best/i.test(section);
    const cleanComment = section
      .replace(/^#{1,3}\s+/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .trim();

    let added = false;
    try {
      const testChess = new Chess(fen);
      const move = testChess.move(san);
      if (move) {
        steps.push({
          fen: testChess.fen(),
          san: move.san,
          comment: cleanComment,
          moveNum: steps.length,
          fullMoveNumber,
          color: turnColor,
          isMistake: isMistakeSection && !isFixSection,
          isFix: isFixSection && !isMistakeSection,
          from: move.from,
          to: move.to,
        });
        added = true;
      }
    } catch {}

    if (!added) {
      const targetSq = extractTargetSquare(san);
      if (targetSq) {
        steps.push({
          fen,
          san,
          comment: cleanComment,
          moveNum: steps.length,
          fullMoveNumber,
          color: turnColor,
          isMistake: isMistakeSection && !isFixSection,
          isFix: isFixSection && !isMistakeSection,
          to: targetSq,
        });
      }
    }
  }

  if (steps.length === 1 && drillExpectedMove) {
    let added = false;
    try {
      const testChess = new Chess(fen);
      const move = testChess.move(drillExpectedMove);
      if (move) {
        steps.push({
          fen: testChess.fen(),
          san: move.san,
          comment: `The correct move is ${move.san}.`,
          moveNum: 1,
          fullMoveNumber,
          color: turnColor,
          isFix: true,
          from: move.from,
          to: move.to,
        });
        added = true;
      }
    } catch {}

    if (!added) {
      const targetSq = extractTargetSquare(drillExpectedMove);
      if (targetSq) {
        steps.push({
          fen,
          san: drillExpectedMove,
          comment: `The correct move is ${drillExpectedMove}.`,
          moveNum: 1,
          fullMoveNumber,
          color: turnColor,
          isFix: true,
          to: targetSq,
        });
      }
    }
  }

  return steps;
}

function tryPartialPgnParse(pgn: string, fen: string): Step[] {
  const fullMoveNumber = parseInt(fen.split(' ')[5]) || 1;
  const turnColor: 'w' | 'b' = fen.split(' ')[1] === 'b' ? 'b' : 'w';

  const steps: Step[] = [
    { fen, san: null, comment: '', moveNum: 0, fullMoveNumber, color: null },
  ];

  const moveText = pgn.replace(/\[.*?\]\s*/g, '').trim();
  const moveRegex = /(\d+\.+\s*)?([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|O-O(?:-O)?)\s*(?:\{([^}]*)\})?/g;

  const player = new Chess(fen);
  let match;

  while ((match = moveRegex.exec(moveText)) !== null) {
    const san = match[2];
    const rawComment = match[3] || '';
    const isMistake = /^\s*\[mistake\]\s*/i.test(rawComment);
    const isFix = /^\s*\[fix\]\s*/i.test(rawComment);
    const cleanComment = rawComment.replace(/^\s*\[(mistake|fix)\]\s*/i, '');

    try {
      const move = player.move(san);
      if (!move) break;

      const idx = steps.length - 1;
      const startColor2 = fen.split(' ')[1] === 'b' ? 1 : 0;
      const globalIdx = startColor2 + idx;
      const fmn = fullMoveNumber + Math.floor(globalIdx / 2);
      const color: 'w' | 'b' = globalIdx % 2 === 0 ? 'w' : 'b';

      steps.push({
        fen: player.fen(),
        san: move.san,
        comment: cleanComment,
        moveNum: steps.length,
        fullMoveNumber: fmn,
        color,
        isMistake,
        isFix,
        from: move.from,
        to: move.to,
      });
    } catch {
      break;
    }
  }

  return steps;
}

function parsePgnSteps(pgn: string, content?: string | null, drillExpectedMove?: string | null): Step[] | null {
  if (!pgn || pgn.trim() === '') return null;

  const fen = extractFen(pgn);

  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const history = chess.history({ verbose: true });

    if (history.length === 0 && fen) {
      if (content) {
        const contentSteps = buildStepsFromContent(fen, content, drillExpectedMove ?? null);
        if (contentSteps.length > 1) return contentSteps;
      }
      return [{ fen, san: null, comment: 'Study this position.', moveNum: 0, fullMoveNumber: parseInt(fen.split(' ')[5]) || 1, color: null }];
    }

    if (history.length === 0) return null;

    const comments: string[] = new Array(history.length + 1).fill('');
    for (let i = history.length; i >= 0; i--) {
      comments[i] = chess.getComment() || '';
      if (i > 0) chess.undo();
    }

    const fenHeader = chess.header()?.FEN;
    const startFen = fenHeader || START_FEN;

    const startFullMove = fenHeader
      ? (parseInt(startFen.split(' ')[5]) || 1)
      : 1;
    const startColor = startFen.split(' ')[1] === 'b' ? 1 : 0;

    // The Concept section is shown separately in the lesson's left-panel
    // intro card, so it's intentionally not surfaced again here — using it
    // again on this step would just duplicate the same text.
    const introComment = comments[0] || undefined;

    const player = new Chess(startFen);
    const steps: Step[] = [
      { fen: startFen, san: null, comment: introComment ?? '', moveNum: 0, fullMoveNumber: startFullMove, color: null },
    ];

    for (let i = 0; i < history.length; i++) {
      const move = history[i];
      player.move(move.san);
      const rawComment = comments[i + 1];
      const isMistake = /^\s*\[mistake\]\s*/i.test(rawComment);
      const isFix = /^\s*\[fix\]\s*/i.test(rawComment);
      const cleanComment = rawComment.replace(/^\s*\[(mistake|fix)\]\s*/i, '');

      const globalIdx = startColor + i;
      const fullMoveNumber = startFullMove + Math.floor(globalIdx / 2);
      const color: 'w' | 'b' = globalIdx % 2 === 0 ? 'w' : 'b';

      steps.push({
        fen: player.fen(),
        san: move.san,
        comment: cleanComment,
        moveNum: i + 1,
        fullMoveNumber,
        color,
        isMistake,
        isFix,
        from: move.from,
        to: move.to,
      });
    }

    if (drillExpectedMove) {
      const mistakeIdx = steps.findIndex(s => s.isMistake);
      if (mistakeIdx > 0) {
        const hasFixAlready = steps.some(s => s.isFix);
        if (!hasFixAlready) {
          const preMistakeFen = steps[mistakeIdx - 1].fen;
          try {
            const fixChess = new Chess(preMistakeFen);
            const fixMove = fixChess.move(drillExpectedMove);
            if (fixMove) {
              const preMistakeStep = steps[mistakeIdx - 1];
              const insertAt = mistakeIdx + 1;
              steps.splice(insertAt, 0, {
                fen: fixChess.fen(),
                san: fixMove.san,
                comment: `The correct move is ${fixMove.san}.`,
                moveNum: insertAt,
                fullMoveNumber: preMistakeStep.fullMoveNumber,
                color: steps[mistakeIdx].color,
                isFix: true,
                from: fixMove.from,
                to: fixMove.to,
              });
              for (let k = insertAt + 1; k < steps.length; k++) {
                steps[k].moveNum = k;
              }
            }
          } catch {}
        }
      }
    }

    return steps;
  } catch {
    if (fen) {
      const partialSteps = tryPartialPgnParse(pgn, fen);
      if (partialSteps.length > 1) return partialSteps;

      if (content) {
        const contentSteps = buildStepsFromContent(fen, content, drillExpectedMove ?? null);
        if (contentSteps.length > 1) return contentSteps;
      }
      return [{ fen, san: null, comment: 'Study this position.', moveNum: 0, fullMoveNumber: parseInt(fen.split(' ')[5]) || 1, color: null }];
    }
    try {
      const fallbackFen = pgn.trim();
      new Chess(fallbackFen);
      return [{ fen: fallbackFen, san: null, comment: 'Study this position.', moveNum: 0, fullMoveNumber: parseInt(fallbackFen.split(' ')[5]) || 1, color: null }];
    } catch {}
    return [{ fen: START_FEN, san: null, comment: '', moveNum: 0, fullMoveNumber: 1, color: null }];
  }
}

type DrillState = 'idle' | 'correct' | 'wrong' | 'revealed';
type Tab = 'mistake' | 'fix' | 'drill';

interface LessonChallengeProp {
  fen: string;
  expectedMove: string;
  hint?: string | null;
  contextPgn?: string | null;
}

interface LessonBoardPlayerProps {
  pgn: string;
  fixPgn?: string | null;
  showFixLine?: boolean;
  title?: string;
  // Shown at step 0 of the Mistake tab specifically, instead of the bare
  // "Press play or click a move to begin" that told the learner nothing
  // about what they're about to look at.
  positionRecap?: string | null;
  // Used to link out to the existing Puzzles page, pre-filtered to this
  // lesson's weakness category, once the Drill is solved -- see the
  // "Practice Related Puzzles" button below.
  courseCategory?: string | null;
  // Reports the CURRENTLY DISPLAYED move's comment text (Mistake/Fix
  // tabs only) up to the parent -- this is what lets the page's single
  // Read Aloud/AUTO control actually read what's on screen, instead of
  // only ever reading the lesson's separate static overview text while
  // someone is looking at a specific move's explanation.
  onMoveTextChange?: (text: string) => void;
  drillFen?: string | null;
  drillExpectedMove?: string | null;
  drillHint?: string | null;
  content?: string | null;
  extraChallenges?: LessonChallengeProp[] | null;
  conceptTitle?: string | null;
}

function buildFrontendFixPgn(mistakePgn: string, drillExpectedMove: string | null | undefined): string | null {
  if (!drillExpectedMove) return null;
  try {
    const fenMatch = mistakePgn.match(/\[FEN\s+"([^"]+)"\]/i);
    if (!fenMatch) return null;
    const startFen = fenMatch[1];

    const mistakeSteps = parsePgnSteps(mistakePgn, null, null);
    if (!mistakeSteps || mistakeSteps.length < 3) return null;

    const mistakeIdx = mistakeSteps.findIndex(s => s.isMistake);
    if (mistakeIdx < 2) return null;

    const preMistakeFen = mistakeSteps[mistakeIdx - 1].fen;
    const chessInstance = new Chess(preMistakeFen);
    const fixMove = chessInstance.move(drillExpectedMove);
    if (!fixMove) return null;

    const moveText = mistakePgn.replace(/\[.*?\]\s*/g, '').trim();
    const moveRegex = /(\d+\.+\s*)?([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|O-O(?:-O)?)\s*(?:\{([^}]*)\})?/g;

    const moves: { san: string; comment: string }[] = [];
    let m;
    while ((m = moveRegex.exec(moveText)) !== null) {
      moves.push({ san: m[2], comment: m[3] || '' });
    }

    const contextMoves = moves.slice(0, mistakeIdx - 1);
    let result = `[FEN "${startFen}"]\n\n`;
    const parts: string[] = [];
    const isBlack = startFen.split(' ')[1] === 'b';
    const startFullMove = parseInt(startFen.split(' ')[5]) || 1;

    for (let i = 0; i < contextMoves.length; i++) {
      const gi = (isBlack ? 1 : 0) + i;
      const mn = startFullMove + Math.floor(gi / 2);
      const black = gi % 2 === 1;
      if (!black) {
        parts.push(`${mn}. ${contextMoves[i].san} {${contextMoves[i].comment || 'Leading up to the key moment.'}}`);
      } else if (i === 0 && isBlack) {
        parts.push(`${mn}... ${contextMoves[i].san} {${contextMoves[i].comment || 'Leading up to the key moment.'}}`);
      } else {
        parts.push(`${contextMoves[i].san} {${contextMoves[i].comment || 'Leading up to the key moment.'}}`);
      }
    }

    const fixGi = (isBlack ? 1 : 0) + contextMoves.length;
    const fixMn = startFullMove + Math.floor(fixGi / 2);
    const fixBlack = fixGi % 2 === 1;
    if (!fixBlack) {
      parts.push(`${fixMn}. ${fixMove.san} {[FIX] The correct move.}`);
    } else if (parts.length === 0) {
      parts.push(`${fixMn}... ${fixMove.san} {[FIX] The correct move.}`);
    } else {
      parts.push(`${fixMove.san} {[FIX] The correct move.}`);
    }

    result += parts.join(' ');
    return result;
  } catch {
    return null;
  }
}

export function LessonBoardPlayer({ pgn, fixPgn, showFixLine, title, positionRecap, courseCategory, onMoveTextChange, drillFen, drillExpectedMove, drillHint, content, extraChallenges, conceptTitle }: LessonBoardPlayerProps) {
  const [, navigate] = useLocation();
  const { boardColors, boardTextureCss, pieceColors, pieceShape, pieceStyle, showCoordinates, showLegalMoves } = useSettings();
  const BOARD_LIGHT = boardColors.light;
  const BOARD_DARK = boardColors.dark;
  const BOARD_TEXTURE_IMAGE = boardTextureCss.backgroundImage;
  const BOARD_TEXTURE_IMAGE_DARK = boardTextureCss.backgroundImageDark ?? boardTextureCss.backgroundImage;
  const BOARD_TEXTURE_SIZE = boardTextureCss.backgroundSize;
  // Now built by the one shared function every board calls -- see
  // buildTintedPieceSet in RecoloredPieces.tsx.
  const tintedPieces = useMemo(
    () => buildTintedPieceSet({ pieceColors, pieceShape, pieceStyle }) as unknown as typeof defaultPieces,
    [pieceColors, pieceShape, pieceStyle],
  );
  const [tab, setTab] = useState<Tab>('mistake');
  // tab is now the ONLY source of truth for mistake vs fix content.
  // showFixLine (an external prop CourseDetail.tsx used to toggle based
  // on which paragraph of the separate text narration was scrolled into
  // view) is intentionally ignored here now -- keeping it "live" as a
  // secondary trigger would mean scrolling unrelated text could silently
  // override whichever tab the person actually clicked, showing fix
  // content while the Mistake pill still looked selected. Mistake/Fix
  // are top-level tabs the person switches explicitly now, not an
  // implicit side effect of scroll position.
  const onFixTab = tab === 'fix';
  const activePgn = useMemo(() => {
    if (onFixTab) {
      if (fixPgn) return fixPgn;
      const fallback = buildFrontendFixPgn(pgn, drillExpectedMove);
      if (fallback) return fallback;
    }
    return pgn;
  }, [pgn, fixPgn, onFixTab, drillExpectedMove]);

  // drillExpectedMove here enables parsePgnSteps' own fallback: if a
  // PGN is too short (just 1 real step) to show anything meaningful, it
  // synthesizes a "<move> — Best Move" step from this. That fallback
  // must only ever fire while building FIX content -- a too-short
  // MISTAKE pgn should just show what little real data exists, never
  // get a synthetic "Best Move" badge grafted onto it. The previous
  // version of this line had this backwards (onFixTab ? null :
  // drillExpectedMove), which is exactly why the Mistake tab was
  // showing "Nxd7 — Best Move" instead of the actual mistake, 28. Ne8+.
  const steps = parsePgnSteps(activePgn, content, onFixTab ? drillExpectedMove : null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  // The full move-list strip competes with the board and commentary for
  // attention the moment a lesson opens -- collapsed by default so the
  // lesson tab shows one clear focus (board + commentary + a single
  // primary action) at a time, matching how chess.com's lesson screens
  // never show more than the current step plus one next action. Still
  // fully available, just opt-in instead of always-on.
  const [showMoveList, setShowMoveList] = useState(false);
  const [prevFen, setPrevFen] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const moveListRef = useRef<HTMLDivElement>(null);

  const mistakeIdx = useMemo(() => {
    if (!steps || steps.length <= 1) return -1;
    return steps.findIndex(s => s.isMistake);
  }, [steps]);

  const autoJumpTarget = useMemo(() => {
    if (mistakeIdx <= 0) return 0;
    return Math.max(0, mistakeIdx - 2);
  }, [mistakeIdx]);

  useEffect(() => {
    setCurrentStep(autoJumpTarget);
    setIsPlaying(false);
    setPrevFen(null);
  }, [activePgn, autoJumpTarget]);

  // ── Drill state ──────────────────────────────────────────────────────────────
  const [drillState, setDrillState] = useState<DrillState>('idle');
  const [drillAttempts, setDrillAttempts] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [drillPosition, setDrillPosition] = useState<string>('');

  // The drill scenario: after finding the fix move itself, keep going --
  // the opponent auto-plays its reply, then the player finds the next
  // best move, continuing through whatever of the fix line's best-line
  // continuation exists (capped at a few plies by the backend already).
  // fixPgn carries the context moves leading up to the fix too, so this
  // locates where the fix move itself actually starts within it, rather
  // than assuming index 0. Only available for the primary challenge
  // (index 0) -- extraChallenges (other mistakes grouped into the same
  // themed lesson) only carry a single expectedMove each, with no
  // multi-move continuation data to build a scenario from.
  const scenarioSteps = useMemo(() => {
    if (!fixPgn) return null;
    const parsed = parsePgnSteps(fixPgn, null, null);
    if (!parsed) return null;
    const fixIndex = parsed.findIndex(s => s.isFix);
    if (fixIndex < 0) return null;
    return parsed.slice(fixIndex);
  }, [fixPgn]);
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [scenarioComplete, setScenarioComplete] = useState(false);

  const step = steps?.[currentStep];
  const totalSteps = steps?.length ?? 1;
  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;

  // Reports whatever text is actually visible right now, for Read
  // Aloud/AUTO to use -- Mistake and Fix tabs only, since Drill's
  // content isn't a narrated explanation in the same way.
  useEffect(() => {
    if (!onMoveTextChange) return;
    if (tab !== 'mistake' && tab !== 'fix') return;
    const raw = (currentStep === 0 && tab === 'mistake' && positionRecap)
      ? positionRecap
      : step?.comment || step?.san || '';
    onMoveTextChange(raw.replace(/\*\*/g, ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, currentStep, step?.comment, step?.san, positionRecap]);

  const go = useCallback((idx: number) => {
    setPrevFen(steps?.[currentStep]?.fen ?? null);
    setCurrentStep(Math.max(0, Math.min(idx, totalSteps - 1)));
  }, [currentStep, totalSteps, steps]);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentStep(prev => {
          if (prev >= totalSteps - 1) { setIsPlaying(false); return prev; }
          return prev + 1;
        });
      }, 2200);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, totalSteps]);

  // Scroll move list — container-only, never the page
  useEffect(() => {
    const container = moveListRef.current;
    const active = container?.querySelector<HTMLElement>('[data-active="true"]');
    if (!container || !active) return;
    const containerTop = container.scrollTop;
    const containerBottom = containerTop + container.clientHeight;
    const btnTop = active.offsetTop;
    const btnBottom = btnTop + active.offsetHeight;
    if (btnTop < containerTop) container.scrollTop = btnTop - 8;
    else if (btnBottom > containerBottom) container.scrollTop = btnBottom - container.clientHeight + 8;
  }, [currentStep]);

  const allChallenges = useMemo(() => {
    const list: { fen: string; expectedMove: string; hint: string | null }[] = [];
    if (drillFen && drillExpectedMove) {
      list.push({ fen: drillFen, expectedMove: drillExpectedMove, hint: drillHint ?? null });
    }
    if (extraChallenges) {
      for (const c of extraChallenges) {
        if (c.fen && c.expectedMove) list.push({ fen: c.fen, expectedMove: c.expectedMove, hint: c.hint ?? null });
      }
    }
    return list;
  }, [drillFen, drillExpectedMove, drillHint, extraChallenges]);

  const [currentChallengeIndex, setCurrentChallengeIndex] = useState(0);
  const activeChallenge = allChallenges[currentChallengeIndex] ?? null;
  const isMultiChallenge = allChallenges.length > 1;
  const [showingConceptIntro, setShowingConceptIntro] = useState(isMultiChallenge);

  const hasDrill = allChallenges.length > 0;
  const hasFix = !!fixPgn || !!drillExpectedMove;
  // Whether THIS challenge (not just this lesson) actually has scenario
  // data to continue with -- only the primary challenge (index 0) does.
  // Needs both currentChallengeIndex and scenarioSteps to already exist,
  // which is exactly why this declaration kept landing in the wrong
  // place earlier and breaking the build twice over.
  const hasScenario = currentChallengeIndex === 0 && !!scenarioSteps && scenarioSteps.length > 1;

  const drillMoveArrow = useMemo(() => {
    if (!activeChallenge) return null;
    try {
      const chess = new Chess(activeChallenge.fen);
      const move = chess.move(activeChallenge.expectedMove);
      if (!move) return null;
      return { from: move.from, to: move.to };
    } catch {
      return null;
    }
  }, [activeChallenge]);

  const [drillSelectedSq, setDrillSelectedSq] = useState<string | null>(null);

  useEffect(() => {
    if (activeChallenge) {
      setDrillPosition(activeChallenge.fen);
      setDrillState('idle');
      setDrillAttempts(0);
      setShowHint(false);
      setDrillSelectedSq(null);
      setScenarioIndex(0);
      setScenarioComplete(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChallengeIndex, activeChallenge?.fen]);

  // Once a scenario is past its first move, the live position
  // (drillPosition) has moved on from the challenge's starting FEN --
  // legal-move lookups need to use whichever one actually reflects the
  // board right now, or they'd compute moves from the wrong position
  // partway through a scenario.
  const currentDrillFen = drillPosition || activeChallenge?.fen || '';

  const getDrillLegalTargets = useCallback((sq: string | null): string[] => {
    if (!sq || !currentDrillFen) return [];
    try {
      const chess = new Chess(currentDrillFen);
      return chess.moves({ square: sq as any, verbose: true }).map(m => m.to);
    } catch { return []; }
  }, [currentDrillFen]);


  const drillLegalTargets = useMemo(() => getDrillLegalTargets(drillSelectedSq), [drillSelectedSq, getDrillLegalTargets]);

  const drillSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (drillSelectedSq) styles[drillSelectedSq] = { background: 'rgba(100, 180, 255, 0.55)', borderRadius: '4px' };
    if (showLegalMoves) {
      for (const sq of drillLegalTargets) styles[sq] = { background: 'radial-gradient(circle, rgba(100,180,255,0.55) 28%, transparent 30%)' };
    }
    return styles;
  }, [drillSelectedSq, drillLegalTargets, showLegalMoves]);


  // ── Drill handlers ───────────────────────────────────────────────────────────
  // Auto-plays the opponent's reply (scenarioSteps[idx]) after a short
  // pause -- long enough to actually see what the player's move did to
  // the board before the reply lands, matching the pacing used for
  // auto-play elsewhere in this component (see the 2200ms interval
  // above). Then lands on the next USER-turn step, or marks the
  // scenario complete if none remain.
  const playOpponentReplyAndAdvance = useCallback((idx: number) => {
    if (!scenarioSteps) return;
    const reply = scenarioSteps[idx];
    if (!reply) { setScenarioComplete(true); setDrillState('correct'); return; }
    setTimeout(() => {
      setDrillPosition(reply.fen);
      const next = idx + 1;
      if (next >= scenarioSteps.length) {
        setScenarioIndex(next);
        setScenarioComplete(true);
        setDrillState('correct');
      } else {
        setScenarioIndex(next);
        setDrillState('idle');
      }
    }, 900);
  }, [scenarioSteps]);

  const handleDrillDrop = useCallback((args: { sourceSquare: string; targetSquare: string | null; piece: unknown }) => {
    if (drillState === 'correct' || drillState === 'revealed') return false;
    if (!activeChallenge || !args.targetSquare) return false;
    if (args.sourceSquare === args.targetSquare) return false;

    const expectedSan = hasScenario && scenarioSteps ? scenarioSteps[scenarioIndex]?.san : activeChallenge.expectedMove;
    if (!expectedSan) return false;

    try {
      const chess = new Chess(currentDrillFen);
      const move = chess.move({ from: args.sourceSquare, to: args.targetSquare, promotion: 'q' });
      if (!move) return false;

      const normalize = (s: string) => s.replace(/[+#!?]/g, '').trim();
      const isCorrect = normalize(move.san) === normalize(expectedSan) || move.to === expectedSan.slice(-2);

      setDrillAttempts(a => a + 1);
      if (!isCorrect) {
        setDrillState('wrong');
        setTimeout(() => setDrillState('idle'), 1200);
        return false;
      }

      setDrillPosition(chess.fen());

      if (!hasScenario || !scenarioSteps) {
        // No scenario data for this challenge (an extra challenge from a
        // grouped lesson, which only ever carries one expected move) --
        // same single-move behavior as before.
        setDrillState('correct');
        return true;
      }

      const nextIdx = scenarioIndex + 1;
      if (nextIdx >= scenarioSteps.length) {
        setScenarioIndex(nextIdx);
        setScenarioComplete(true);
        setDrillState('correct');
      } else {
        setDrillState('correct'); // brief "correct" flash for this one ply
        playOpponentReplyAndAdvance(nextIdx);
      }
      return true;
    } catch {
      return false;
    }
  }, [activeChallenge, drillState, currentDrillFen, hasScenario, scenarioSteps, scenarioIndex, playOpponentReplyAndAdvance]);

  const handleDrillSquareClick = useCallback(({ square, piece }: { square: string; piece: { pieceType: string } | null }) => {
    if (drillState === 'correct' || drillState === 'revealed' || !activeChallenge) return;
    if (drillSelectedSq) {
      if (square === drillSelectedSq) { setDrillSelectedSq(null); return; }
      if (drillLegalTargets.includes(square)) {
        handleDrillDrop({ sourceSquare: drillSelectedSq, targetSquare: square, piece: null });
        setDrillSelectedSq(null);
        return;
      }
      if (piece) { setDrillSelectedSq(square); } else { setDrillSelectedSq(null); }
      return;
    }
    if (piece) {
      try {
        const chess = new Chess(currentDrillFen);
        if (piece.pieceType[0].toLowerCase() === chess.turn()) setDrillSelectedSq(square);
      } catch { setDrillSelectedSq(square); }
    }
  }, [drillState, activeChallenge, currentDrillFen, drillSelectedSq, drillLegalTargets, handleDrillDrop]);

  const resetDrill = () => {
    setDrillState('idle');
    setDrillAttempts(0);
    setShowHint(false);
    setDrillPosition(activeChallenge?.fen || '');
    setDrillSelectedSq(null);
    setScenarioIndex(0);
    setScenarioComplete(false);
  };

  const goToNextChallenge = () => {
    if (currentChallengeIndex < allChallenges.length - 1) {
      setCurrentChallengeIndex(i => i + 1);
    }
  };

  const revealAnswer = () => {
    if (!activeChallenge) return;
    try {
      const chess = new Chess(activeChallenge.fen);
      chess.move(activeChallenge.expectedMove);
      setDrillPosition(chess.fen());
    } catch { /* ignore */ }
    setDrillState('revealed');
  };


  if (!steps) {
    const fallbackFen = extractFen(activePgn) ?? START_FEN;
    return (
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: BG_DARK }}>
        <div className="px-4 py-3">
          <div className="bg-white/95 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-sm text-gray-700">Study this position.</p>
          </div>
        </div>
        <div className="px-2 pb-3 max-w-[480px] mx-auto">
          <PieceGradientDefs />
          <Chessboard
            options={{
              position: fallbackFen,
              allowDragging: false,
              boardStyle: { borderRadius: '6px', overflow: 'hidden' },
              darkSquareStyle: { backgroundColor: BOARD_DARK, backgroundImage: BOARD_TEXTURE_IMAGE_DARK, backgroundSize: BOARD_TEXTURE_SIZE },
              lightSquareStyle: { backgroundColor: BOARD_LIGHT, backgroundImage: BOARD_TEXTURE_IMAGE, backgroundSize: BOARD_TEXTURE_SIZE },
              pieces: tintedPieces,
              showNotation: showCoordinates,
            }}
          />
        </div>
      </div>
    );
  }

  const movePairs: { num: number; white: number; black: number | null }[] = [];
  const firstMoveColor = steps[1]?.color;
  if (firstMoveColor === 'b') {
    movePairs.push({ num: steps[1].fullMoveNumber, white: -1, black: 1 });
    for (let i = 2; i < steps.length; i += 2) {
      movePairs.push({ num: steps[i].fullMoveNumber, white: i, black: i + 1 < steps.length ? i + 1 : null });
    }
  } else {
    for (let i = 1; i < steps.length; i += 2) {
      movePairs.push({ num: steps[i].fullMoveNumber, white: i, black: i + 1 < steps.length ? i + 1 : null });
    }
  }

  const hasComment = step && step.comment.trim().length > 0;


  const userColor = steps?.[1]?.color ?? (steps?.[0]?.fen?.includes(' b ') ? 'b' : 'w');
  const boardOrientation: 'white' | 'black' = userColor === 'b' ? 'black' : 'white';

  const boardSquareStyles = (() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (step?.isMistake && step.to) {
      if (step.from) styles[step.from] = { background: 'rgba(220, 50, 50, 0.45)', boxShadow: 'inset 0 0 0 2px rgba(220,50,50,0.7)' };
      styles[step.to] = { background: 'rgba(220, 50, 50, 0.6)', boxShadow: 'inset 0 0 0 2px rgba(220,50,50,0.8)' };
    } else if (step?.isFix && step.to) {
      if (step.from) styles[step.from] = { background: 'rgba(34, 197, 94, 0.35)', boxShadow: 'inset 0 0 0 2px rgba(34,197,94,0.5)' };
      styles[step.to] = { background: 'rgba(34, 197, 94, 0.55)', boxShadow: 'inset 0 0 0 2px rgba(34,197,94,0.7)' };
    } else if (step?.to && currentStep > 0) {
      if (step.from) styles[step.from] = { background: 'rgba(255, 240, 80, 0.25)' };
      styles[step.to] = { background: 'rgba(255, 240, 80, 0.45)' };
    }
    return styles;
  })();

  return (
    <div className="rounded-xl overflow-hidden shadow-xl" style={{ backgroundColor: BG_DARK }}>
      {/* Same gradient defs as ChessBoard.tsx, duplicated here rather than
          shared, since a lesson page can render this component without a
          ChessBoard instance also mounted -- and SVG url(#id) fills need
          the def to actually exist in the document to resolve. Duplicate
          identical IDs elsewhere on the same page are harmless. */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <linearGradient id="cc-grad-shaded-light" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fdfdfd" /><stop offset="55%" stopColor="#e2e2e2" /><stop offset="100%" stopColor="#bdbdbd" />
          </linearGradient>
          <linearGradient id="cc-grad-shaded-dark" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5a5a5a" /><stop offset="55%" stopColor="#333333" /><stop offset="100%" stopColor="#151515" />
          </linearGradient>
          <linearGradient id="cc-grad-wood-light" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fbe9c6" /><stop offset="50%" stopColor="#e8c583" /><stop offset="100%" stopColor="#c08f43" />
          </linearGradient>
          <linearGradient id="cc-grad-wood-dark" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8a5a2e" /><stop offset="50%" stopColor="#5c3a1a" /><stop offset="100%" stopColor="#2e1a0a" />
          </linearGradient>
          <linearGradient id="cc-grad-marble-light" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" /><stop offset="60%" stopColor="#e6e6ee" /><stop offset="100%" stopColor="#c4c4d2" />
          </linearGradient>
          <linearGradient id="cc-grad-marble-dark" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4a4a54" /><stop offset="60%" stopColor="#26262e" /><stop offset="100%" stopColor="#0e0e12" />
          </linearGradient>
          <linearGradient id="cc-grad-chrome-light" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" /><stop offset="35%" stopColor="#c9d3d9" /><stop offset="60%" stopColor="#eef3f5" /><stop offset="100%" stopColor="#8a97a0" />
          </linearGradient>
          <linearGradient id="cc-grad-chrome-dark" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7a828a" /><stop offset="35%" stopColor="#2a2d31" /><stop offset="60%" stopColor="#4a4f55" /><stop offset="100%" stopColor="#0a0b0c" />
          </linearGradient>
        </defs>
      </svg>
      {/* ── Tab pills: Mistake → Fix → Drill, in that fixed order -- this
          is the actual narrative sequence (see the mistake and what it
          cost, then see what should have happened instead, then prove
          you can find it yourself), not just three unordered views. */}
      <div className="flex items-center gap-1.5 px-3 py-2 md:py-2.5 overflow-x-auto" style={{ backgroundColor: BG_CARD }}>
        <button
          onClick={() => { setIsPlaying(false); setTab('mistake'); setCurrentStep(0); }}
          className={cn(
            'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap',
            tab === 'mistake'
              ? 'text-white shadow-md'
              : 'text-white/50 hover:text-white/80 hover:bg-white/5'
          )}
          style={tab === 'mistake' ? { backgroundColor: MISTAKE_RED } : undefined}
        >
          <AlertTriangle className="w-3 h-3" /> Mistake
        </button>

        {hasFix && (
          <button
            onClick={() => { setIsPlaying(false); setTab('fix'); setCurrentStep(0); }}
            className={cn(
              'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap',
              tab === 'fix'
                ? 'text-white shadow-md'
                : 'text-white/50 hover:text-white/80 hover:bg-white/5'
            )}
            style={tab === 'fix' ? { backgroundColor: CHESSCOM_GREEN } : undefined}
          >
            <CheckCircle2 className="w-3 h-3" /> Fix
          </button>
        )}

        {hasDrill && (
          <button
            onClick={() => { setIsPlaying(false); setTab('drill'); resetDrill(); }}
            className={cn(
              'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap',
              tab === 'drill'
                ? 'text-white shadow-md'
                : 'text-white/50 hover:text-white/80 hover:bg-white/5'
            )}
            style={tab === 'drill' ? { backgroundColor: CHESSCOM_GREEN } : undefined}
          >
            <Swords className="w-3 h-3" /> Drill
          </button>
        )}

        {/* Shows "Next: Fix →" / "Next: Drill →" right in the tab bar
            itself once the current tab's last step is reached -- not
            just a relabeled button down in the controls, which turned
            out to be invisible on mobile until the fix above. This is
            the second, more prominent place that promise is now kept. */}
        <span className="ml-auto text-[11px] font-mono pr-1 shrink-0" style={
          (tab === 'mistake' && isLast && hasFix) || (tab === 'fix' && isLast && hasDrill)
            ? { color: CHESSCOM_GREEN, fontWeight: 700 }
            : { color: 'rgba(255,255,255,0.4)' }
        }>
          {tab === 'drill'
            ? 'Find best move'
            : tab === 'mistake' && isLast && hasFix
            ? 'Next: Fix →'
            : tab === 'fix' && isLast && hasDrill
            ? 'Next: Drill →'
            : (currentStep > 0 ? `Move ${step?.fullMoveNumber}` : title ?? '')}
        </span>
      </div>

      {/* ── MISTAKE / FIX TABS ──────────────────────────────────────────────
          Same rendering for both -- only the underlying PGN (activePgn,
          computed above from tab) and the step data differ. The step
          objects already carry isMistake/isFix flags that drive the red
          "Mistake" / green "Best Move" badges correctly either way. */}
      {(tab === 'mistake' || tab === 'fix') && (
        <div className="flex flex-col">
          {/* Commentary bubble -- capped height with its own internal
              scroll, so a longer intro message (the first screen's text
              is often longer than a per-move comment) scrolls within
              itself instead of pushing the board down past the
              fullscreen container's overflow:hidden boundary, which is
              what was clipping the board on the first screen. The board
              below this is the thing that must never be cut off; this
              bubble is the one allowed to need its own scroll instead. */}
          <div className="px-2 pt-2 pb-0.5 md:px-3 md:pt-3 md:pb-1 max-h-[22vh] overflow-y-auto shrink-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                <div className="rounded-xl px-3 py-2 md:px-4 md:py-3 shadow-sm" style={{
                  background: BG_CARD,
                  borderLeft: step?.isMistake
                    ? `3px solid ${MISTAKE_RED}`
                    : step?.isFix
                    ? `3px solid ${CHESSCOM_GREEN}`
                    : '3px solid rgba(255,255,255,0.06)',
                }}>
                  <div className="flex items-start gap-3">
                    {step?.isMistake ? (
                      <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center shrink-0 mt-0.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-white" />
                      </div>
                    ) : step?.isFix ? (
                      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: CHESSCOM_GREEN }}>
                        <Check className="w-3.5 h-3.5 text-white" />
                      </div>
                    ) : null}
                    <div className="flex-1 min-w-0">
                      {step?.san && currentStep > 0 && (
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold" style={{
                            color: step.isMistake ? MISTAKE_RED : step.isFix ? CHESSCOM_GREEN : '#e8e6e3'
                          }}>
                            {step.color === 'w' ? '' : ''}{step.fullMoveNumber}.{step.color === 'b' ? '..' : ''} {step.san}
                            {step.isMistake ? ' — Mistake' : step.isFix ? ' — Best Move' : ''}
                          </span>
                        </div>
                      )}
                      <p className="text-sm leading-relaxed">
                        {hasComment
                          ? <FormatComment text={step!.comment} isMistake={step!.isMistake} isFix={step!.isFix} />
                          : currentStep === 0 && tab === 'mistake' && positionRecap
                          ? <span>{positionRecap}</span>
                          : currentStep === 0
                          ? <span style={{ color: '#9e9b98' }}>Press play or click a move to begin.</span>
                          : step?.san
                          ? <span style={{ color: '#9e9b98' }}>{step.color === 'w' ? 'White' : 'Black'} plays {step.san}.</span>
                          : ''}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Board */}
          <div className="px-2 pb-1 max-w-[480px] mx-auto w-full">
            <div className="relative">
              <PieceGradientDefs />
              <Chessboard
                options={{
                  position: step?.fen,
                  allowDragging: false,
                  boardOrientation: boardOrientation,
                  boardStyle: { borderRadius: '6px', overflow: 'hidden' },
                  darkSquareStyle: { backgroundColor: BOARD_DARK, backgroundImage: BOARD_TEXTURE_IMAGE_DARK, backgroundSize: BOARD_TEXTURE_SIZE },
                  lightSquareStyle: { backgroundColor: BOARD_LIGHT, backgroundImage: BOARD_TEXTURE_IMAGE, backgroundSize: BOARD_TEXTURE_SIZE },
              pieces: tintedPieces,
              showNotation: showCoordinates,
                  animationDurationInMs: 180,
                  squareStyles: boardSquareStyles,
                }}
              />
              {step?.isMistake && (
                <div className="absolute top-2 right-2 pointer-events-none z-10">
                  <div className="flex items-center gap-1 px-2 py-1 rounded-xl text-xs font-bold bg-red-600 text-white shadow-lg">
                    <AlertTriangle className="w-3 h-3" /> Mistake
                  </div>
                </div>
              )}
              {step?.isFix && (
                <div className="absolute top-2 right-2 pointer-events-none z-10">
                  <div className="flex items-center gap-1 px-2 py-1 rounded-xl text-xs font-bold text-white shadow-lg" style={{ backgroundColor: CHESSCOM_GREEN }}>
                    <Check className="w-3 h-3" /> Best Move
                  </div>
                </div>
              )}
              <AnimatePresence>
                {prevFen !== step?.fen && step?.san && (
                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0.3 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className={cn(
                      'absolute inset-0 rounded-xl pointer-events-none',
                      step?.isMistake ? 'bg-red-500/15' : step?.isFix ? 'bg-emerald-500/15' : 'bg-yellow-400/10'
                    )}
                  />
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-col items-center gap-2 px-2 py-3 md:px-4 max-w-[480px] mx-auto w-full">
            {/* One clear primary action, matching chess.com's lesson
                screens -- Prev/Next step through, Play/Pause is the
                dominant central action. Jump-to-start/jump-to-end are
                real but secondary, so they're visually smaller and
                muted rather than equal-weight with everything else;
                nothing here was removed, only de-emphasized. */}
            {/* gap-4 on mobile (was 2.5, before that 1.5) -- still
                reported as too tight to tap reliably even after the
                first increase, so widening further and giving the two
                small skip buttons a bigger touch target too (p-1.5 ->
                p-2.5), since a small gap combined with a small target is
                what actually causes mis-taps, not gap alone. */}
            <div className="flex items-center justify-center gap-4 md:gap-5 flex-wrap">
              <button
                onClick={() => { setIsPlaying(false); go(0); }}
                disabled={isFirst}
                title="Jump to start"
                className="p-2.5 rounded-full text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all disabled:opacity-10 shrink-0"
              >
                <SkipBack className="w-3 h-3" />
              </button>
              <button
                onClick={() => go(currentStep - 1)}
                disabled={isFirst}
                className="p-2 md:p-2.5 rounded-full text-white/70 bg-white/[0.06] hover:bg-white/[0.14] hover:text-white transition-all disabled:opacity-20 shrink-0"
              >
                <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
              </button>

              <button
                onClick={() => {
                  if (isPlaying) { setIsPlaying(false); return; }
                  if (isLast) {
                    // Reaching the end of Mistake advances into Fix;
                    // reaching the end of Fix advances into Drill. This
                    // is the actual point of having these as a fixed
                    // sequence rather than three independent views --
                    // finishing one step naturally leads into the next.
                    if (tab === 'mistake' && hasFix) { setTab('fix'); setCurrentStep(0); return; }
                    if (tab === 'fix' && hasDrill) { setTab('drill'); resetDrill(); return; }
                    return;
                  }
                  setIsPlaying(true);
                }}
                className="flex items-center justify-center gap-1.5 md:gap-2 px-5 md:px-9 py-2.5 md:py-3 rounded-full text-white font-bold text-sm transition-all hover:brightness-110 shadow-lg whitespace-nowrap"
                style={{ backgroundColor: CHESSCOM_GREEN }}
              >
                {isPlaying ? (
                  <><Pause className="w-4 h-4 shrink-0" /> <span className="inline">Pause</span></>
                ) : isLast ? (
                  tab === 'mistake' && hasFix ? (
                    <><CheckCircle2 className="w-4 h-4 shrink-0" /> <span className="inline">See the Fix</span></>
                  ) : tab === 'fix' && hasDrill ? (
                    <><Swords className="w-4 h-4 shrink-0" /> <span className="inline">Try the Drill</span></>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4 shrink-0" /> <span className="inline">Done</span></>
                  )
                ) : (
                  <><Play className="w-4 h-4 shrink-0" /> <span className="inline">{currentStep === 0 ? 'Play' : 'Next'}</span></>
                )}
              </button>

              <button
                onClick={() => {
                  if (!isLast) { go(currentStep + 1); return; }
                  if (tab === 'mistake' && hasFix) { setTab('fix'); setCurrentStep(0); return; }
                  if (tab === 'fix' && hasDrill) { setTab('drill'); resetDrill(); }
                }}
                disabled={isLast && !((tab === 'mistake' && hasFix) || (tab === 'fix' && hasDrill))}
                className="p-2 md:p-2.5 rounded-full text-white/70 bg-white/[0.06] hover:bg-white/[0.14] hover:text-white transition-all disabled:opacity-20 shrink-0"
              >
                <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
              </button>
              <button
                onClick={() => { setIsPlaying(false); go(totalSteps - 1); }}
                disabled={isLast}
                title="Jump to end"
                className="p-2.5 rounded-full text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all disabled:opacity-10 shrink-0"
              >
                <SkipForward className="w-3 h-3" />
              </button>
            </div>

            {mistakeIdx > 0 && currentStep < mistakeIdx && (
              <button
                onClick={() => go(mistakeIdx)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all"
                style={{ color: '#ffffff', backgroundColor: 'rgba(220,67,67,0.35)', border: '1px solid rgba(220,67,67,0.6)' }}
                title="Jump to mistake"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Jump to key moment
              </button>
            )}
          </div>

          {/* Move list toggle -- a single small affordance instead of the
              full strip always competing with everything above it. */}
          {movePairs.length > 0 && (
            <button
              onClick={() => setShowMoveList(v => !v)}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-white/40 hover:text-white/70 transition-colors"
            >
              {showMoveList ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showMoveList ? 'Hide move list' : 'Show move list'}
            </button>
          )}

          {/* Horizontal move strip */}
          {movePairs.length > 0 && showMoveList && (
            <div
              ref={moveListRef}
              className="flex items-center gap-0.5 px-3 py-2 overflow-x-auto hide-scrollbar"
              style={{ backgroundColor: BG_CARD }}
            >
              <button
                onClick={() => go(0)}
                disabled={isFirst}
                className="p-1 text-white/40 hover:text-white disabled:opacity-20 shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-[2px] overflow-x-auto hide-scrollbar">
                {movePairs.map(({ num, white, black }) => {
                  const wStep2 = white >= 0 ? steps[white] : null;
                  const bStep2 = black != null ? steps[black] : null;
                  return (
                    <React.Fragment key={`${num}-${white}`}>
                      <span className="text-[10px] text-white/30 font-mono px-0.5 shrink-0">{num}.</span>
                      {wStep2 ? (
                        <button
                          data-active={currentStep === white}
                          onClick={() => go(white)}
                          className={cn(
                            'px-1.5 py-0.5 rounded text-xs font-semibold transition-all shrink-0 whitespace-nowrap',
                            currentStep === white
                              ? 'text-white shadow-sm'
                              : wStep2.isMistake
                              ? 'text-red-400 hover:bg-red-500/20'
                              : wStep2.isFix
                              ? 'text-emerald-400 hover:bg-emerald-500/20'
                              : 'text-white/70 hover:bg-white/10'
                          )}
                          style={currentStep === white ? {
                            backgroundColor: wStep2.isMistake ? '#ef4444' : wStep2.isFix ? '#22c55e' : CHESSCOM_GREEN
                          } : undefined}
                        >
                          {wStep2.isMistake ? '?!' : wStep2.isFix ? '✓' : ''}{wStep2.san}
                        </button>
                      ) : (
                        <span className="text-xs text-white/20 px-1 shrink-0">…</span>
                      )}
                      {bStep2 ? (
                        <button
                          data-active={currentStep === black}
                          onClick={() => go(black!)}
                          className={cn(
                            'px-1.5 py-0.5 rounded text-xs font-semibold transition-all shrink-0 whitespace-nowrap',
                            currentStep === black
                              ? 'text-white shadow-sm'
                              : bStep2.isMistake
                              ? 'text-red-400 hover:bg-red-500/20'
                              : bStep2.isFix
                              ? 'text-emerald-400 hover:bg-emerald-500/20'
                              : 'text-white/70 hover:bg-white/10'
                          )}
                          style={currentStep === black ? {
                            backgroundColor: bStep2.isMistake ? '#ef4444' : bStep2.isFix ? '#22c55e' : CHESSCOM_GREEN
                          } : undefined}
                        >
                          {bStep2.isMistake ? '?!' : bStep2.isFix ? '✓' : ''}{bStep2.san}
                        </button>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </div>
              <button
                onClick={() => go(totalSteps - 1)}
                disabled={isLast}
                className="p-1 text-white/40 hover:text-white disabled:opacity-20 shrink-0"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {currentStep > 0 && steps[currentStep]?.fen && (
            <div className="px-3 pb-2 md:px-4">
              <button
                onClick={() => {
                  const prevFen = currentStep <= 1
                    ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
                    : (steps[currentStep - 1]?.fen ?? steps[currentStep].fen);
                  navigate(`/practice?fen=${encodeURIComponent(prevFen)}&rating=1200`);
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 border border-primary/30 hover:border-primary/50"
                style={{ background: 'rgba(129,182,76,0.1)', color: CHESSCOM_GREEN }}
              >
                <Swords className="w-3.5 h-3.5" />
                Jump in from here
              </button>
            </div>
          )}

          {/* Progress bar */}
          <div className="h-1" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
            <motion.div
              className="h-full"
              style={{ backgroundColor: CHESSCOM_GREEN }}
              animate={{ width: `${(currentStep / Math.max(totalSteps - 1, 1)) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

        </div>
      )}

      {/* The old Repeat tab (re-input every move from the mistake PGN by
          typing it back in) was removed entirely here, replaced by Fix
          as the second tab -- the auto-advancing Play/Next buttons above
          are now how someone moves from Mistake to Fix to Drill, not a
          separate CTA block or a fourth navigation mode. */}
      {/* ── DRILL TAB ─────────────────────────────────────────────────────── */}
      {tab === 'drill' && hasDrill && showingConceptIntro && isMultiChallenge && (
        <div className="flex flex-col">
          <div className="px-2 pt-2 pb-0.5 md:px-3 md:pt-3 md:pb-1">
            <div className="flex items-end gap-2">
              <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center"
                style={{ background: `linear-gradient(160deg, ${CHESSCOM_GREEN}, #5f8a3a)`, boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <div className="relative flex-1 rounded-2xl rounded-bl-sm px-3 py-2 md:px-4 md:py-3 shadow-sm bg-white/95">
                <p className="text-sm font-bold text-gray-900">
                  {conceptTitle ? `Learn how to spot: ${conceptTitle}` : 'Learn this pattern before practicing it.'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {allChallenges.length} real positions from your own games, all sharing this same idea.
                </p>
              </div>
            </div>
          </div>
          <div className="px-2 pb-1 max-w-[480px] mx-auto w-full">
            <div className="relative rounded-xl overflow-hidden">
              <PieceGradientDefs />
              <Chessboard
                options={{
                  position: allChallenges[0]?.fen ?? '',
                  allowDragging: false,
                  boardOrientation: boardOrientation,
                  boardStyle: { borderRadius: '6px', overflow: 'hidden' },
                  darkSquareStyle: { backgroundColor: BOARD_DARK, backgroundImage: BOARD_TEXTURE_IMAGE_DARK, backgroundSize: BOARD_TEXTURE_SIZE },
                  lightSquareStyle: { backgroundColor: BOARD_LIGHT, backgroundImage: BOARD_TEXTURE_IMAGE, backgroundSize: BOARD_TEXTURE_SIZE },
              pieces: tintedPieces,
              showNotation: showCoordinates,
                }}
              />
            </div>
          </div>
          <div className="px-3 py-3">
            <button
              onClick={() => setShowingConceptIntro(false)}
              className="w-full py-3 rounded-xl text-sm font-black text-white flex items-center justify-center gap-2"
              style={{ backgroundColor: CHESSCOM_GREEN }}
            >
              Start <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {tab === 'drill' && hasDrill && !(showingConceptIntro && isMultiChallenge) && (
        <div className="flex flex-col">
          {/* Commentary */}
          <div className="px-2 pt-2 pb-0.5 md:px-3 md:pt-3 md:pb-1">
            <div className="flex items-end gap-2">
              <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center"
                style={{ background: `linear-gradient(160deg, ${CHESSCOM_GREEN}, #5f8a3a)`, boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <div className={cn(
                'relative flex-1 rounded-2xl rounded-bl-sm px-3 py-2 md:px-4 md:py-3 shadow-sm',
                drillState === 'correct' ? 'bg-emerald-50 border border-emerald-200'
                  : drillState === 'revealed' ? 'bg-amber-50 border border-amber-200'
                  : 'bg-white/95'
              )}>
                {isMultiChallenge && (
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      Challenge {currentChallengeIndex + 1}/{allChallenges.length}
                    </span>
                    <div className="flex gap-1">
                      {allChallenges.map((_, i) => (
                        <div key={i} className={cn(
                          'h-1 w-4 rounded-full',
                          i < currentChallengeIndex ? 'bg-emerald-400' : i === currentChallengeIndex ? 'bg-blue-400' : 'bg-gray-200'
                        )} />
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-sm font-bold text-gray-900 mb-0.5">Find the best move</p>
                <p className="text-xs text-gray-500">
                  {drillState === 'correct'
                    ? `Excellent! ${activeChallenge?.expectedMove} is correct!`
                    : drillState === 'revealed'
                    ? `The answer was ${activeChallenge?.expectedMove}.`
                    : 'Drag a piece on the board to make your move.'}
                </p>
                {drillAttempts > 0 && drillState !== 'correct' && drillState !== 'revealed' && (
                  <p className="text-xs text-orange-600 mt-1 font-medium">{drillAttempts} attempt{drillAttempts > 1 ? 's' : ''} so far</p>
                )}
              </div>
            </div>
          </div>

          {/* Board */}
          <div className="px-2 pb-1 max-w-[480px] mx-auto w-full">
            <div className="relative">
              <PieceGradientDefs />
              <Chessboard
                options={{
                  // drillPosition is already the single source of truth at
                  // every point -- initialized to activeChallenge.fen on
                  // reset, updated after each real move (including the
                  // scenario's auto-played opponent replies), and left
                  // untouched on a wrong attempt. The old state-based
                  // special-case (show activeChallenge.fen whenever
                  // drillState is 'idle') assumed 'idle' only ever meant
                  // "fresh start," which broke the moment the scenario
                  // feature made drillState go back to 'idle' mid-sequence
                  // too, while waiting for the next move -- snapping the
                  // board back to the very first position every time, even
                  // though drillPosition itself was already correct.
                  position: drillPosition || activeChallenge?.fen || '',
                  allowDragging: drillState !== 'correct' && drillState !== 'revealed',
                  boardOrientation: boardOrientation,
                  dragActivationDistance: 8,
                  onPieceDrop: drillState === 'correct' || drillState === 'revealed' ? () => false : handleDrillDrop,
                  onSquareClick: handleDrillSquareClick,
                  squareStyles: drillSquareStyles,
                  arrows: (drillState === 'correct' || drillState === 'revealed') && drillMoveArrow
                    ? [{ startSquare: drillMoveArrow.from, endSquare: drillMoveArrow.to, color: drillState === 'correct' ? 'rgba(52,211,153,0.85)' : 'rgba(245,158,11,0.85)' }]
                    : undefined,
                  boardStyle: { borderRadius: '6px', overflow: 'hidden', cursor: 'pointer' },
                  darkSquareStyle: { backgroundColor: BOARD_DARK, backgroundImage: BOARD_TEXTURE_IMAGE_DARK, backgroundSize: BOARD_TEXTURE_SIZE },
                  lightSquareStyle: { backgroundColor: BOARD_LIGHT, backgroundImage: BOARD_TEXTURE_IMAGE, backgroundSize: BOARD_TEXTURE_SIZE },
              pieces: tintedPieces,
              showNotation: showCoordinates,
                  animationDurationInMs: 180,
                }}
              />
              <AnimatePresence>
                {drillState === 'correct' && (
                  <motion.div key="correct" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 rounded-xl flex items-center justify-center pointer-events-none" style={{ backgroundColor: 'rgba(34,197,94,0.2)' }}>
                    <div className="text-white font-black text-2xl px-6 py-3 rounded-xl shadow-lg" style={{ backgroundColor: CHESSCOM_GREEN }}>✓ Correct!</div>
                  </motion.div>
                )}
                {drillState === 'wrong' && (
                  <motion.div key="wrong" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 rounded-xl flex items-center justify-center bg-red-500/20 pointer-events-none">
                    <div className="bg-red-500 text-white font-black text-xl px-6 py-3 rounded-xl shadow-lg">✗ Try again</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Result cards */}
          <div className="px-3 py-2">
            <AnimatePresence mode="wait">
              {drillState === 'correct' && (
                <motion.div key="ok" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div className="flex-1">
                    {hasScenario && scenarioComplete ? (
                      <>
                        <p className="text-sm font-bold text-emerald-400">Scenario complete!</p>
                        <p className="text-xs text-white/50 mt-0.5">You played out the full best line, move by move.</p>
                      </>
                    ) : hasScenario ? (
                      <>
                        <p className="text-sm font-bold text-emerald-400">Correct!</p>
                        <p className="text-xs text-white/50 mt-0.5">Move {Math.min(scenarioIndex, (scenarioSteps?.length ?? 1))} of {scenarioSteps?.length ?? 1} — watch the reply, then keep going.</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-bold text-emerald-400">Correct — {activeChallenge?.expectedMove}!</p>
                        <p className="text-xs text-white/50 mt-0.5">Solved{drillAttempts > 1 ? ` in ${drillAttempts} attempts` : ' on first try'}.</p>
                      </>
                    )}
                  </div>
                  {isMultiChallenge && currentChallengeIndex < allChallenges.length - 1 && (
                    <button
                      onClick={goToNextChallenge}
                      className="shrink-0 px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-1.5"
                      style={{ backgroundColor: CHESSCOM_GREEN }}
                    >
                      Next <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </motion.div>
              )}
              {drillState === 'revealed' && (
                <motion.div key="rev" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/15 border border-amber-500/30">
                  <Eye className="w-5 h-5 text-amber-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-amber-400">Answer: {activeChallenge?.expectedMove}</p>
                    <p className="text-xs text-white/50 mt-0.5">Study this move, then try again.</p>
                  </div>
                  {isMultiChallenge && currentChallengeIndex < allChallenges.length - 1 && (
                    <button
                      onClick={goToNextChallenge}
                      className="shrink-0 px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-1.5"
                      style={{ backgroundColor: CHESSCOM_GREEN }}
                    >
                      Next <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {activeChallenge?.hint && drillState === 'idle' && (
              <div className="mt-2">
                {showHint ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/20 border border-blue-500/40">
                    <Lightbulb className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-300">{activeChallenge.hint}</p>
                  </motion.div>
                ) : (
                  <button
                    onClick={() => setShowHint(true)}
                    className="text-xs text-white/40 hover:text-blue-400 flex items-center gap-1.5 transition-colors"
                  >
                    <Lightbulb className="w-3.5 h-3.5" /> Show hint
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 px-4 py-3">
            <button
              onClick={resetDrill}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white/60 hover:text-white hover:bg-white/10 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
            {drillState === 'idle' && drillAttempts >= 2 && (
              <button
                onClick={revealAnswer}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-amber-300 hover:bg-amber-500/20 border border-amber-500/50 transition-all"
              >
                <Eye className="w-3.5 h-3.5" /> Reveal answer
              </button>
            )}
            {(drillState === 'correct' || drillState === 'revealed') && (
              <button
                onClick={() => { setTab('mistake'); setCurrentStep(0); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white hover:brightness-110 transition-all"
                style={{ backgroundColor: CHESSCOM_GREEN }}
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Back to Mistake
              </button>
            )}
          </div>

          {/* Links out to the existing Puzzles page rather than
              rebuilding an interactive solver a third time -- Puzzles.tsx
              already accepts ?weakness= and filters using the same
              category-to-theme mapping the backend's /puzzles/next
              endpoint uses, so this is 100% existing, proven
              functionality, not a new query or a new board UI. Opens in
              a new tab so progress in this lesson isn't lost; this is a
              strong, prominent suggestion rather than a hard requirement
              -- Complete & Next isn't blocked on actually solving these,
              since verifying that server-side would need correlating
              puzzle attempts by timestamp against this specific lesson,
              a meaningfully bigger piece than this card. */}
          {(drillState === 'correct' || drillState === 'revealed') && courseCategory && (
            <div className="mx-3 mb-3 md:mx-4 md:mb-4 p-3.5 rounded-xl flex items-center gap-3" style={{ backgroundColor: 'rgba(127,209,79,0.08)', border: '1px solid rgba(127,209,79,0.25)' }}>
              <Swords className="w-5 h-5 shrink-0" style={{ color: CHESSCOM_GREEN }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">Lock it in with a few puzzles</p>
                <p className="text-xs text-white/50 mt-0.5">2–3 more like this one, before moving on.</p>
              </div>
              <a
                href={`/puzzles?weakness=${encodeURIComponent(courseCategory)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 px-4 py-2 rounded-xl text-xs font-bold text-white hover:brightness-110 transition-all whitespace-nowrap"
                style={{ backgroundColor: CHESSCOM_GREEN }}
              >
                Practice Puzzles →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
