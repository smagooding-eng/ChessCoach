import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import {
  Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight,
  MessageSquare, Swords, CheckCircle2, Lightbulb, Eye, RotateCcw,
  Trophy, Repeat2, Check, AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

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

  const steps: Step[] = [
    { fen, san: null, comment: 'Study this position.', moveNum: 0, fullMoveNumber, color: null },
  ];

  const contentParts = content.split(/\n\n+/).filter(s => s.trim().length > 0);
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

    const player = new Chess(startFen);
    const steps: Step[] = [
      { fen: startFen, san: null, comment: comments[0], moveNum: 0, fullMoveNumber: startFullMove, color: null },
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
type Tab = 'lesson' | 'drill' | 'repeat';

interface LessonBoardPlayerProps {
  pgn: string;
  fixPgn?: string | null;
  showFixLine?: boolean;
  title?: string;
  drillFen?: string | null;
  drillExpectedMove?: string | null;
  drillHint?: string | null;
  content?: string | null;
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

export function LessonBoardPlayer({ pgn, fixPgn, showFixLine, title, drillFen, drillExpectedMove, drillHint, content }: LessonBoardPlayerProps) {
  const activePgn = useMemo(() => {
    if (showFixLine) {
      if (fixPgn) return fixPgn;
      const fallback = buildFrontendFixPgn(pgn, drillExpectedMove);
      if (fallback) return fallback;
    }
    return pgn;
  }, [pgn, fixPgn, showFixLine, drillExpectedMove]);

  const steps = parsePgnSteps(activePgn, content, showFixLine ? null : drillExpectedMove);
  const [tab, setTab] = useState<Tab>('lesson');
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [prevFen, setPrevFen] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const moveListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentStep(0);
    setIsPlaying(false);
    setPrevFen(null);
  }, [activePgn]);

  // ── Drill state ──────────────────────────────────────────────────────────────
  const [drillState, setDrillState] = useState<DrillState>('idle');
  const [drillAttempts, setDrillAttempts] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [drillPosition, setDrillPosition] = useState<string>(() => drillFen || '');

  // ── Repeat drill state ───────────────────────────────────────────────────────
  const totalRepeatMoves = Math.max((steps?.length ?? 1) - 1, 0);
  const [repeatStep, setRepeatStep] = useState(0);
  const [repeatPosition, setRepeatPosition] = useState(() => steps?.[0]?.fen ?? START_FEN);
  const [repeatFeedback, setRepeatFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [repeatFirstTry, setRepeatFirstTry] = useState<boolean[]>(() => new Array(totalRepeatMoves).fill(true));
  const [repeatAttempts, setRepeatAttempts] = useState(0);
  const [repeatComplete, setRepeatComplete] = useState(false);

  const repeatFirstTryScore = repeatFirstTry.filter(Boolean).length;

  const step = steps?.[currentStep];
  const totalSteps = steps?.length ?? 1;
  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;

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

  const hasDrill = !!(drillFen && drillExpectedMove);
  const hasRepeat = (steps?.length ?? 0) > 1;

  const [drillSelectedSq, setDrillSelectedSq] = useState<string | null>(null);
  const [repeatSelectedSq, setRepeatSelectedSq] = useState<string | null>(null);

  const getDrillLegalTargets = useCallback((sq: string | null): string[] => {
    if (!sq || !drillFen) return [];
    try {
      const chess = new Chess(drillFen);
      return chess.moves({ square: sq as any, verbose: true }).map(m => m.to);
    } catch { return []; }
  }, [drillFen]);

  const getRepeatLegalTargets = useCallback((sq: string | null): string[] => {
    if (!sq || !steps) return [];
    try {
      const chess = new Chess(steps[repeatStep]?.fen ?? START_FEN);
      return chess.moves({ square: sq as any, verbose: true }).map(m => m.to);
    } catch { return []; }
  }, [steps, repeatStep]);

  const drillLegalTargets = useMemo(() => getDrillLegalTargets(drillSelectedSq), [drillSelectedSq, getDrillLegalTargets]);
  const repeatLegalTargets = useMemo(() => getRepeatLegalTargets(repeatSelectedSq), [repeatSelectedSq, getRepeatLegalTargets]);

  const drillSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (drillSelectedSq) styles[drillSelectedSq] = { background: 'rgba(100, 180, 255, 0.55)', borderRadius: '4px' };
    for (const sq of drillLegalTargets) styles[sq] = { background: 'radial-gradient(circle, rgba(100,180,255,0.55) 28%, transparent 30%)' };
    return styles;
  }, [drillSelectedSq, drillLegalTargets]);

  const repeatSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (repeatSelectedSq) styles[repeatSelectedSq] = { background: 'rgba(100, 180, 255, 0.55)', borderRadius: '4px' };
    for (const sq of repeatLegalTargets) styles[sq] = { background: 'radial-gradient(circle, rgba(100,180,255,0.55) 28%, transparent 30%)' };
    return styles;
  }, [repeatSelectedSq, repeatLegalTargets]);

  // ── Drill handlers ───────────────────────────────────────────────────────────
  const handleDrillDrop = useCallback((args: { sourceSquare: string; targetSquare: string | null; piece: unknown }) => {
    if (drillState === 'correct' || drillState === 'revealed') return false;
    if (!drillFen || !drillExpectedMove || !args.targetSquare) return false;

    try {
      const chess = new Chess(drillFen);
      const move = chess.move({ from: args.sourceSquare, to: args.targetSquare, promotion: 'q' });
      if (!move) return false;

      const normalize = (s: string) => s.replace(/[+#!?]/g, '').trim();
      const isCorrect = normalize(move.san) === normalize(drillExpectedMove) ||
        move.to === drillExpectedMove.slice(-2);

      setDrillAttempts(a => a + 1);
      if (isCorrect) {
        setDrillPosition(chess.fen());
        setDrillState('correct');
        return true;
      } else {
        setDrillState('wrong');
        setTimeout(() => setDrillState('idle'), 1200);
        return false;
      }
    } catch {
      return false;
    }
  }, [drillFen, drillExpectedMove, drillState]);

  const handleDrillSquareClick = useCallback(({ square, piece }: { square: string; piece: { pieceType: string } | null }) => {
    if (drillState === 'correct' || drillState === 'revealed' || !drillFen) return;
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
        const chess = new Chess(drillFen);
        if (piece.pieceType[0].toLowerCase() === chess.turn()) setDrillSelectedSq(square);
      } catch { setDrillSelectedSq(square); }
    }
  }, [drillState, drillFen, drillSelectedSq, drillLegalTargets, handleDrillDrop]);

  const resetDrill = () => {
    setDrillState('idle');
    setDrillAttempts(0);
    setShowHint(false);
    setDrillPosition(drillFen || '');
    setDrillSelectedSq(null);
  };

  const revealAnswer = () => {
    if (!drillFen || !drillExpectedMove) return;
    try {
      const chess = new Chess(drillFen);
      chess.move(drillExpectedMove);
      setDrillPosition(chess.fen());
    } catch { /* ignore */ }
    setDrillState('revealed');
  };

  // ── Repeat drill handlers ────────────────────────────────────────────────────
  const repeatUserColor = steps?.[1]?.color ?? 'w';

  const handleRepeatDrop = useCallback((args: { sourceSquare: string; targetSquare: string | null; piece: unknown }) => {
    if (repeatComplete || !args.targetSquare || !steps) return false;
    const expected = steps[repeatStep + 1]?.san;
    if (!expected) return false;

    try {
      const chess = new Chess(steps[repeatStep].fen);
      const move = chess.move({ from: args.sourceSquare, to: args.targetSquare, promotion: 'q' });
      if (!move) return false;

      const normalize = (s: string) => s.replace(/[+#!?]/g, '').trim();
      const isCorrect = normalize(move.san) === normalize(expected) ||
        move.to === expected.slice(-2);

      const wasFirstTry = repeatAttempts === 0;

      if (isCorrect) {
        if (!wasFirstTry) {
          setRepeatFirstTry(prev => { const n = [...prev]; n[repeatStep] = false; return n; });
        }
        setRepeatPosition(chess.fen());
        setRepeatFeedback('correct');
        setRepeatAttempts(0);

        setTimeout(() => {
          setRepeatFeedback(null);
          const next = repeatStep + 1;
          if (next >= (steps.length - 1)) {
            setRepeatComplete(true);
          } else {
            setRepeatStep(next);
          }
        }, 700);
        return true;
      } else {
        setRepeatFirstTry(prev => { const n = [...prev]; n[repeatStep] = false; return n; });
        setRepeatAttempts(a => a + 1);
        setRepeatFeedback('wrong');
        setTimeout(() => setRepeatFeedback(null), 700);
        return false;
      }
    } catch {
      return false;
    }
  }, [repeatStep, repeatComplete, steps, repeatAttempts]);

  const handleRepeatSquareClick = useCallback(({ square, piece }: { square: string; piece: { pieceType: string } | null }) => {
    if (repeatComplete || !steps) return;
    const nextMove = steps[repeatStep + 1];
    if (!nextMove || nextMove.color !== repeatUserColor) return;
    if (repeatSelectedSq) {
      if (square === repeatSelectedSq) { setRepeatSelectedSq(null); return; }
      if (repeatLegalTargets.includes(square)) {
        handleRepeatDrop({ sourceSquare: repeatSelectedSq, targetSquare: square, piece: null });
        setRepeatSelectedSq(null);
        return;
      }
      if (piece) { setRepeatSelectedSq(square); } else { setRepeatSelectedSq(null); }
      return;
    }
    if (piece) {
      try {
        const chess = new Chess(steps[repeatStep]?.fen ?? START_FEN);
        if (piece.pieceType[0].toLowerCase() === chess.turn()) setRepeatSelectedSq(square);
      } catch { setRepeatSelectedSq(square); }
    }
  }, [repeatComplete, steps, repeatStep, repeatUserColor, repeatSelectedSq, repeatLegalTargets, handleRepeatDrop]);

  useEffect(() => {
    if (tab !== 'repeat' || repeatComplete || !steps) return;
    const nextMove = steps[repeatStep + 1];
    if (!nextMove || !nextMove.color) return;
    if (nextMove.color === repeatUserColor) return;

    const timer = setTimeout(() => {
      try {
        const chess = new Chess(steps[repeatStep].fen);
        chess.move(nextMove.san!);
        setRepeatPosition(chess.fen());
        const next = repeatStep + 1;
        if (next >= steps.length - 1) {
          setRepeatComplete(true);
        } else {
          setRepeatStep(next);
        }
      } catch {}
    }, 600);
    return () => clearTimeout(timer);
  }, [tab, repeatStep, repeatComplete, steps, repeatUserColor]);

  const canRepeatDrag = useCallback(({ piece }: { piece: { pieceType: string } | null }) => {
    if (repeatComplete || !piece || !steps) return false;
    const nextMove = steps[repeatStep + 1];
    if (!nextMove || nextMove.color !== repeatUserColor) return false;
    try {
      const chess = new Chess(steps[repeatStep]?.fen ?? START_FEN);
      return piece.pieceType[0].toLowerCase() === chess.turn();
    } catch { return false; }
  }, [repeatStep, repeatComplete, steps, repeatUserColor]);

  const resetRepeat = () => {
    setRepeatStep(0);
    setRepeatPosition(steps?.[0]?.fen ?? START_FEN);
    setRepeatFeedback(null);
    setRepeatFirstTry(new Array(totalRepeatMoves).fill(true));
    setRepeatAttempts(0);
    setRepeatComplete(false);
    setRepeatSelectedSq(null);
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
          <Chessboard
            options={{
              position: fallbackFen,
              allowDragging: false,
              boardStyle: { borderRadius: '6px', overflow: 'hidden' },
              darkSquareStyle: { backgroundColor: BOARD_DARK },
              lightSquareStyle: { backgroundColor: BOARD_LIGHT },
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

  const repeatExpectedSan = steps[repeatStep + 1]?.san ?? null;
  const repeatColor = steps[repeatStep + 1]?.color ?? null;
  const repeatFullMove = steps[repeatStep + 1]?.fullMoveNumber ?? null;

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
      {/* ── Tab pills ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-3 py-2.5 overflow-x-auto" style={{ backgroundColor: BG_CARD }}>
        <button
          onClick={() => { setIsPlaying(false); setTab('lesson'); }}
          className={cn(
            'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap',
            tab === 'lesson'
              ? 'text-white shadow-md'
              : 'text-white/50 hover:text-white/80 hover:bg-white/5'
          )}
          style={tab === 'lesson' ? { backgroundColor: CHESSCOM_GREEN } : undefined}
        >
          <Play className="w-3 h-3" /> Lesson
        </button>

        {hasRepeat && (
          <button
            onClick={() => { setIsPlaying(false); setTab('repeat'); resetRepeat(); }}
            className={cn(
              'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap',
              tab === 'repeat'
                ? 'text-white shadow-md'
                : 'text-white/50 hover:text-white/80 hover:bg-white/5'
            )}
            style={tab === 'repeat' ? { backgroundColor: CHESSCOM_GREEN } : undefined}
          >
            <Repeat2 className="w-3 h-3" /> Repeat
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

        <span className="ml-auto text-[11px] text-white/40 font-mono pr-1 shrink-0">
          {tab === 'lesson'
            ? (currentStep > 0 ? `Move ${step?.fullMoveNumber}` : title ?? '')
            : tab === 'repeat'
            ? (repeatComplete ? '✓ Complete' : `${repeatStep}/${totalRepeatMoves}`)
            : 'Find best move'}
        </span>
      </div>

      {/* ── LESSON TAB ────────────────────────────────────────────────────── */}
      {tab === 'lesson' && (
        <div className="flex flex-col">
          {/* Commentary bubble */}
          <div className="px-3 pt-3 pb-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                <div className="rounded-xl px-4 py-3 shadow-sm" style={{
                  background: step?.isMistake
                    ? 'rgba(220,67,67,0.12)'
                    : step?.isFix
                    ? 'rgba(129,182,76,0.12)'
                    : BG_CARD,
                  border: step?.isMistake
                    ? '1px solid rgba(220,67,67,0.3)'
                    : step?.isFix
                    ? `1px solid rgba(129,182,76,0.3)`
                    : '1px solid rgba(255,255,255,0.06)',
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
              <Chessboard
                options={{
                  position: step?.fen,
                  allowDragging: false,
                  boardStyle: { borderRadius: '6px', overflow: 'hidden' },
                  darkSquareStyle: { backgroundColor: BOARD_DARK },
                  lightSquareStyle: { backgroundColor: BOARD_LIGHT },
                  animationDurationInMs: 180,
                  squareStyles: boardSquareStyles,
                }}
              />
              {step?.isMistake && (
                <div className="absolute top-2 right-2 pointer-events-none z-10">
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold bg-red-600 text-white shadow-lg">
                    <AlertTriangle className="w-3 h-3" /> Mistake
                  </div>
                </div>
              )}
              {step?.isFix && (
                <div className="absolute top-2 right-2 pointer-events-none z-10">
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold text-white shadow-lg" style={{ backgroundColor: CHESSCOM_GREEN }}>
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
                      'absolute inset-0 rounded-md pointer-events-none',
                      step?.isMistake ? 'bg-red-500/15' : step?.isFix ? 'bg-emerald-500/15' : 'bg-yellow-400/10'
                    )}
                  />
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Horizontal move strip */}
          {movePairs.length > 0 && (
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

          {/* Controls */}
          <div className="flex items-center justify-center gap-1 px-4 py-3">
            <button
              onClick={() => { setIsPlaying(false); go(0); }}
              disabled={isFirst}
              className="p-2.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-all disabled:opacity-20"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={() => go(currentStep - 1)}
              disabled={isFirst}
              className="p-2.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-all disabled:opacity-20"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => {
                if (isPlaying) { setIsPlaying(false); }
                else if (isLast) { go(currentStep + 1); }
                else { setIsPlaying(true); }
              }}
              className="flex items-center gap-2 px-8 py-2.5 rounded-lg text-white font-bold text-sm transition-all hover:brightness-110 shadow-lg mx-2"
              style={{ backgroundColor: CHESSCOM_GREEN }}
            >
              {isPlaying ? (
                <><Pause className="w-4 h-4" /> Pause</>
              ) : isLast ? (
                <><CheckCircle2 className="w-4 h-4" /> Done</>
              ) : (
                <><Play className="w-4 h-4" /> {currentStep === 0 ? 'Play' : 'Next'}</>
              )}
            </button>
            <button
              onClick={() => go(currentStep + 1)}
              disabled={isLast}
              className="p-2.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-all disabled:opacity-20"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => { setIsPlaying(false); go(totalSteps - 1); }}
              disabled={isLast}
              className="p-2.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-all disabled:opacity-20"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="h-1" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
            <motion.div
              className="h-full"
              style={{ backgroundColor: CHESSCOM_GREEN }}
              animate={{ width: `${(currentStep / Math.max(totalSteps - 1, 1)) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          {/* CTA: Repeat drill */}
          {hasRepeat && isLast && (
            <div className="px-4 py-3" style={{ backgroundColor: BG_CARD }}>
              <button
                onClick={() => { setTab('repeat'); resetRepeat(); }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold text-white hover:brightness-110 transition-all"
                style={{ backgroundColor: CHESSCOM_GREEN }}
              >
                <Repeat2 className="w-4 h-4" /> Practice This Sequence
              </button>
            </div>
          )}

          {!hasRepeat && hasDrill && isLast && (
            <div className="px-4 py-3" style={{ backgroundColor: BG_CARD }}>
              <button
                onClick={() => { setTab('drill'); resetDrill(); }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold text-white hover:brightness-110 transition-all"
                style={{ backgroundColor: CHESSCOM_GREEN }}
              >
                <Swords className="w-4 h-4" /> Practice Drill
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── REPEAT DRILL TAB ──────────────────────────────────────────────── */}
      {tab === 'repeat' && hasRepeat && (
        <div className="flex flex-col">
          {/* Commentary */}
          <div className="px-3 pt-3 pb-1">
            <div className="rounded-xl px-4 py-3 bg-white/95 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: CHESSCOM_GREEN }}>
                  <Repeat2 className="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 mb-0.5">
                    {repeatComplete ? 'Sequence Complete!' : 'Play the moves from memory'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {repeatComplete
                      ? `${repeatFirstTryScore} of ${totalRepeatMoves} correct on first try`
                      : repeatExpectedSan
                      ? `Move ${repeatStep + 1} of ${totalRepeatMoves} — ${repeatColor === 'w' ? 'White' : 'Black'} to play`
                      : 'Drag a piece to make the correct move.'}
                  </p>
                  {repeatAttempts > 0 && !repeatComplete && (
                    <p className="text-xs text-orange-600 mt-1 font-medium">{repeatAttempts} wrong attempt{repeatAttempts !== 1 ? 's' : ''}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Board */}
          <div className="px-2 pb-1 max-w-[480px] mx-auto w-full">
            <div className="relative">
              {repeatComplete ? (
                <div className="aspect-square rounded-md flex flex-col items-center justify-center gap-4 p-6" style={{ background: 'linear-gradient(135deg, #1a4731, #1e293b)' }}>
                  <Trophy className="w-16 h-16 text-amber-400 drop-shadow-lg" />
                  <div className="text-center">
                    <p className="text-xl font-black text-white mb-1">Well Done!</p>
                    <p className="text-sm text-white/60">
                      {repeatFirstTryScore}/{totalRepeatMoves} first-try correct
                    </p>
                  </div>
                  <div className="w-full max-w-[200px] bg-white/10 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${(repeatFirstTryScore / totalRepeatMoves) * 100}%`, backgroundColor: CHESSCOM_GREEN }}
                    />
                  </div>
                  <div className="flex gap-1.5 flex-wrap justify-center">
                    {repeatFirstTry.map((ok, i) => (
                      <div
                        key={i}
                        title={`Move ${i + 1}: ${steps[i + 1]?.san}`}
                        className={cn('w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center',
                          ok ? 'bg-emerald-500/40 text-emerald-200' : 'bg-red-500/30 text-red-300')}
                      >
                        {ok ? '✓' : '✗'}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <Chessboard
                    options={{
                      position: repeatPosition,
                      allowDragging: !repeatComplete,
                      canDragPiece: canRepeatDrag,
                      onPieceDrop: handleRepeatDrop,
                      onSquareClick: handleRepeatSquareClick,
                      squareStyles: repeatSquareStyles,
                      boardStyle: { borderRadius: '6px', overflow: 'hidden', cursor: 'pointer' },
                      darkSquareStyle: { backgroundColor: BOARD_DARK },
                      lightSquareStyle: { backgroundColor: BOARD_LIGHT },
                      animationDurationInMs: 180,
                    }}
                  />
                  <AnimatePresence>
                    {repeatFeedback === 'correct' && (
                      <motion.div key="rc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 rounded-md flex items-center justify-center pointer-events-none" style={{ backgroundColor: 'rgba(34,197,94,0.2)' }}>
                        <div className="text-white font-black text-2xl px-6 py-3 rounded-xl shadow-lg" style={{ backgroundColor: CHESSCOM_GREEN }}>✓ Correct!</div>
                      </motion.div>
                    )}
                    {repeatFeedback === 'wrong' && (
                      <motion.div key="rw" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 rounded-md flex items-center justify-center bg-red-500/20 pointer-events-none">
                        <div className="bg-red-500 text-white font-black text-xl px-6 py-3 rounded-xl shadow-lg">✗ Try again</div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>
          </div>

          {/* Progress */}
          {!repeatComplete && (
            <div className="px-3 py-2">
              <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: CHESSCOM_GREEN }}
                  animate={{ width: `${(repeatStep / totalRepeatMoves) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <div className="flex gap-1 flex-wrap mt-2">
                {repeatFirstTry.map((ok, i) => (
                  <div
                    key={i}
                    className={cn('h-1.5 flex-1 min-w-[8px] max-w-[20px] rounded-full transition-colors',
                      i < repeatStep
                        ? ok ? 'bg-emerald-500' : 'bg-red-400'
                        : i === repeatStep
                        ? 'animate-pulse'
                        : 'bg-white/10'
                    )}
                    style={i === repeatStep ? { backgroundColor: CHESSCOM_GREEN } : undefined}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Move reference */}
          {!repeatComplete && (
            <div className="px-3 py-2 overflow-x-auto" style={{ backgroundColor: BG_CARD }}>
              <div className="flex items-center gap-[2px] text-xs font-mono">
                {movePairs.map(({ num, white, black }) => (
                  <React.Fragment key={num}>
                    <span className="text-[10px] text-white/30 px-0.5">{num}.</span>
                    <span className={cn('px-1 rounded', repeatStep >= white ? 'text-white/80' : 'text-white/30')}>{steps[white]?.san}</span>
                    {black != null && <span className={cn('px-1 rounded', repeatStep >= black ? 'text-white/80' : 'text-white/30')}>{steps[black]?.san}</span>}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 px-4 py-3">
            <button
              onClick={resetRepeat}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white/60 hover:text-white hover:bg-white/10 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" /> {repeatComplete ? 'Go Again' : 'Reset'}
            </button>
            {repeatComplete && hasDrill && (
              <button
                onClick={() => { setTab('drill'); resetDrill(); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white hover:brightness-110 transition-all"
                style={{ backgroundColor: CHESSCOM_GREEN }}
              >
                <Swords className="w-3.5 h-3.5" /> Practice Drill
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── DRILL TAB ─────────────────────────────────────────────────────── */}
      {tab === 'drill' && hasDrill && (
        <div className="flex flex-col">
          {/* Commentary */}
          <div className="px-3 pt-3 pb-1">
            <div className={cn(
              'rounded-xl px-4 py-3 shadow-sm',
              drillState === 'correct' ? 'bg-emerald-50 border border-emerald-200'
                : drillState === 'revealed' ? 'bg-amber-50 border border-amber-200'
                : 'bg-white/95'
            )}>
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center shrink-0 mt-0.5">
                  <Swords className="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 mb-0.5">Find the best move</p>
                  <p className="text-xs text-gray-500">
                    {drillState === 'correct'
                      ? `Excellent! ${drillExpectedMove} is correct!`
                      : drillState === 'revealed'
                      ? `The answer was ${drillExpectedMove}.`
                      : 'Drag a piece on the board to make your move.'}
                  </p>
                  {drillAttempts > 0 && drillState !== 'correct' && drillState !== 'revealed' && (
                    <p className="text-xs text-orange-600 mt-1 font-medium">{drillAttempts} attempt{drillAttempts > 1 ? 's' : ''} so far</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Board */}
          <div className="px-2 pb-1 max-w-[480px] mx-auto w-full">
            <div className="relative">
              <Chessboard
                options={{
                  position: drillState === 'idle' || drillState === 'wrong' ? drillFen! : drillPosition,
                  allowDragging: drillState !== 'correct' && drillState !== 'revealed',
                  onPieceDrop: drillState === 'correct' || drillState === 'revealed' ? () => false : handleDrillDrop,
                  onSquareClick: handleDrillSquareClick,
                  squareStyles: drillSquareStyles,
                  boardStyle: { borderRadius: '6px', overflow: 'hidden', cursor: 'pointer' },
                  darkSquareStyle: { backgroundColor: BOARD_DARK },
                  lightSquareStyle: { backgroundColor: BOARD_LIGHT },
                  animationDurationInMs: 180,
                }}
              />
              <AnimatePresence>
                {drillState === 'correct' && (
                  <motion.div key="correct" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 rounded-md flex items-center justify-center pointer-events-none" style={{ backgroundColor: 'rgba(34,197,94,0.2)' }}>
                    <div className="text-white font-black text-2xl px-6 py-3 rounded-xl shadow-lg" style={{ backgroundColor: CHESSCOM_GREEN }}>✓ Correct!</div>
                  </motion.div>
                )}
                {drillState === 'wrong' && (
                  <motion.div key="wrong" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 rounded-md flex items-center justify-center bg-red-500/20 pointer-events-none">
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
                  <div>
                    <p className="text-sm font-bold text-emerald-400">Correct — {drillExpectedMove}!</p>
                    <p className="text-xs text-white/50 mt-0.5">Solved{drillAttempts > 1 ? ` in ${drillAttempts} attempts` : ' on first try'}.</p>
                  </div>
                </motion.div>
              )}
              {drillState === 'revealed' && (
                <motion.div key="rev" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/15 border border-amber-500/30">
                  <Eye className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-amber-400">Answer: {drillExpectedMove}</p>
                    <p className="text-xs text-white/50 mt-0.5">Study this move, then try again.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {drillHint && drillState === 'idle' && (
              <div className="mt-2">
                {showHint ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                    <Lightbulb className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-300">{drillHint}</p>
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
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white/60 hover:text-white hover:bg-white/10 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
            {drillState === 'idle' && drillAttempts >= 2 && (
              <button
                onClick={revealAnswer}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-amber-400 hover:bg-amber-500/10 border border-amber-500/30 transition-all"
              >
                <Eye className="w-3.5 h-3.5" /> Reveal answer
              </button>
            )}
            {(drillState === 'correct' || drillState === 'revealed') && (
              <button
                onClick={() => setTab('lesson')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white hover:brightness-110 transition-all"
                style={{ backgroundColor: CHESSCOM_GREEN }}
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Back to Lesson
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
