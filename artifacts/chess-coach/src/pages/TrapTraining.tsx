import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, Link } from 'wouter';
import { Chess } from 'chess.js';
import { ArrowLeft, Swords, Shield, Loader2, CheckCircle2, XCircle, RotateCcw, Lightbulb } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { ChessBoard } from '@/components/ChessBoard';

const BG = '#141413';
const CARD = '#1c1b19';
const TEXT = '#e8e6e3';
const MUTED = '#9e9b98';
const ACCENT = '#e0a03a';
const GREEN = '#81b64c';
const RED = '#e05a5a';

interface Trap {
  id: number;
  name: string;
  category: string;
  difficulty: string;
  trapSide: 'white' | 'black';
  summary: string;
  explanation: string;
  startingFen: string;
  trapLineSan: string[];
  criticalMoveIndex: number;
  safeMovesSan: string[];
}

type Mode = 'commit' | 'avoid';
type StepState = 'playing' | 'success' | 'failure';

export default function TrapTrainingPage() {
  const { id } = useParams<{ id: string }>();
  const [trap, setTrap] = useState<Trap | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<{ commit: boolean; avoid: boolean }>({ commit: false, avoid: false });
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    apiFetch(`/api/traps/${id}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.trap) { setTrap(d.trap); setProgress(d.progress ?? { commit: false, avoid: false }); } })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: ACCENT }} />
      </div>
    );
  }

  if (!trap) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: BG, color: TEXT }}>
        <p className="text-sm" style={{ color: MUTED }}>Trap not found.</p>
        <Link href="/admin/traps" className="text-sm font-bold" style={{ color: ACCENT }}>Back to Traps</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: BG, color: TEXT }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-8">
        <Link href="/admin/traps" className="inline-flex items-center gap-1.5 text-sm mb-6" style={{ color: MUTED }}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl sm:text-3xl font-black" style={{ letterSpacing: '-0.02em' }}>{trap.name}</h1>
        </div>
        <p className="text-sm mb-1" style={{ color: MUTED }}>{trap.category} &middot; {trap.difficulty}</p>
        <p className="text-sm mb-6" style={{ color: TEXT }}>{trap.summary}</p>

        {!mode ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <button
              onClick={() => setMode('commit')}
              className="rounded-2xl p-5 text-left transition-transform hover:scale-[1.02]"
              style={{ background: CARD, border: `1px solid ${progress.commit ? GREEN : 'rgba(255,255,255,0.06)'}` }}
            >
              <div className="flex items-center justify-between mb-2">
                <Swords className="w-5 h-5" style={{ color: ACCENT }} />
                {progress.commit && <CheckCircle2 className="w-4 h-4" style={{ color: GREEN }} />}
              </div>
              <p className="font-bold text-sm mb-1">Learn to set it</p>
              <p className="text-xs" style={{ color: MUTED }}>Play the trapping side and execute the sequence.</p>
            </button>
            <button
              onClick={() => setMode('avoid')}
              className="rounded-2xl p-5 text-left transition-transform hover:scale-[1.02]"
              style={{ background: CARD, border: `1px solid ${progress.avoid ? GREEN : 'rgba(255,255,255,0.06)'}` }}
            >
              <div className="flex items-center justify-between mb-2">
                <Shield className="w-5 h-5" style={{ color: ACCENT }} />
                {progress.avoid && <CheckCircle2 className="w-4 h-4" style={{ color: GREEN }} />}
              </div>
              <p className="font-bold text-sm mb-1">Learn to spot it</p>
              <p className="text-xs" style={{ color: MUTED }}>Find the safe move before you fall into it.</p>
            </button>
          </div>
        ) : (
          <TrainingBoard
            trap={trap}
            mode={mode}
            onExit={() => setMode(null)}
            onComplete={(m) => setProgress(p => ({ ...p, [m]: true }))}
          />
        )}

        <div className="rounded-2xl p-5 mt-2" style={{ background: CARD, border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs font-black uppercase tracking-wide mb-2" style={{ color: MUTED }}>Why it works</p>
          <p className="text-sm leading-relaxed" style={{ color: TEXT }}>{trap.explanation}</p>
        </div>
      </div>
    </div>
  );
}

function TrainingBoard({ trap, mode, onExit, onComplete }: { trap: Trap; mode: Mode; onExit: () => void; onComplete: (mode: Mode) => void }) {
  const chessRef = useRef(new Chess(trap.startingFen));
  const [fen, setFen] = useState(chessRef.current.fen());
  const [stepIdx, setStepIdx] = useState(0);
  const [state, setState] = useState<StepState>('playing');
  const [showHint, setShowHint] = useState(false);
  const recordedRef = useRef(false);

  const reset = useCallback(() => {
    chessRef.current = new Chess(trap.startingFen);
    setFen(chessRef.current.fen());
    setStepIdx(0);
    setState('playing');
    setShowHint(false);
    recordedRef.current = false;
  }, [trap.startingFen]);

  useEffect(() => { reset(); }, [mode, reset]);

  const recordAttempt = useCallback((success: boolean) => {
    if (recordedRef.current) return;
    recordedRef.current = true;
    apiFetch(`/api/traps/${trap.id}/attempt`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, success }),
    }).catch(() => {});
    if (success) onComplete(mode);
  }, [trap.id, mode, onComplete]);

  // In "commit" mode the user plays trap.trapSide's moves; every other
  // move in the sequence auto-plays as the scripted opponent reply.
  // In "avoid" mode the user plays the opposite side -- moves are
  // auto-played up to the critical index, then the user must find a
  // safe alternative instead of the scripted (losing) move.
  const userColor = mode === 'commit' ? trap.trapSide : (trap.trapSide === 'white' ? 'black' : 'white');
  const isUsersTurn = (chessRef.current.turn() === 'w' ? 'white' : 'black') === userColor;
  const isCriticalStep = mode === 'avoid' && stepIdx === trap.criticalMoveIndex;

  // Auto-play scripted moves that aren't the user's turn (both modes),
  // and in avoid mode, auto-play straight through to the critical step.
  useEffect(() => {
    if (state !== 'playing') return;
    if (stepIdx >= trap.trapLineSan.length) return;
    if (mode === 'avoid' && stepIdx === trap.criticalMoveIndex) return; // wait for the user here
    if (mode === 'commit' && isUsersTurn) return; // wait for the user here

    const timer = setTimeout(() => {
      try {
        chessRef.current.move(trap.trapLineSan[stepIdx]);
        setFen(chessRef.current.fen());
        setStepIdx(i => i + 1);
      } catch {
        // scripted move didn't apply -- stop advancing rather than corrupt state
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [stepIdx, state, mode, trap.trapLineSan, trap.criticalMoveIndex, isUsersTurn]);

  const handleMove = (san: string) => {
    if (state !== 'playing') return;

    if (isCriticalStep) {
      const safe = trap.safeMovesSan.includes(san);
      if (safe) {
        setState('success');
        recordAttempt(true);
      } else {
        setState('failure');
        recordAttempt(false);
      }
      const move = chessRef.current.move(san);
      if (move) setFen(chessRef.current.fen());
      return;
    }

    // Commit mode: the move must match the scripted line exactly.
    const expected = trap.trapLineSan[stepIdx];
    if (san !== expected) return; // ChessBoard's own expectedMoveSan check normally prevents this
    const move = chessRef.current.move(san);
    if (!move) return;
    setFen(chessRef.current.fen());
    const nextIdx = stepIdx + 1;
    setStepIdx(nextIdx);
    if (nextIdx >= trap.trapLineSan.length) {
      setState('success');
      recordAttempt(true);
    }
  };

  const expectedMoveSan = mode === 'commit' && isUsersTurn && state === 'playing' && stepIdx < trap.trapLineSan.length
    ? trap.trapLineSan[stepIdx]
    : null;

  const boardInteractive = state === 'playing' && (isCriticalStep || (mode === 'commit' && isUsersTurn));

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: ACCENT }}>
          {mode === 'commit' ? <Swords className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
          {mode === 'commit' ? 'Set the trap' : 'Spot the trap'}
        </p>
        <button onClick={onExit} className="text-xs font-bold" style={{ color: MUTED }}>Exit</button>
      </div>

      <ChessBoard
        fen={fen}
        practiceMode={boardInteractive}
        expectedMoveSan={expectedMoveSan}
        onMovePlayed={(san) => handleMove(san)}
      />

      {mode === 'avoid' && stepIdx < trap.criticalMoveIndex && state === 'playing' && (
        <p className="text-xs text-center mt-3" style={{ color: MUTED }}>Setting up the position...</p>
      )}

      {isCriticalStep && state === 'playing' && (
        <div className="mt-3 text-center">
          <p className="text-sm font-bold mb-2">This is the critical moment. Find the safe move.</p>
          {showHint ? (
            <p className="text-xs" style={{ color: ACCENT }}>Avoid the move that looks natural here — look for what it actually hangs.</p>
          ) : (
            <button onClick={() => setShowHint(true)} className="text-xs font-bold flex items-center gap-1 mx-auto" style={{ color: MUTED }}>
              <Lightbulb className="w-3.5 h-3.5" /> Hint
            </button>
          )}
        </div>
      )}

      {state === 'success' && (
        <div className="mt-4 rounded-2xl p-4 text-center" style={{ background: `${GREEN}15`, border: `1px solid ${GREEN}40` }}>
          <CheckCircle2 className="w-6 h-6 mx-auto mb-1" style={{ color: GREEN }} />
          <p className="font-bold text-sm" style={{ color: GREEN }}>
            {mode === 'commit' ? 'Trap executed.' : 'Spotted it.'}
          </p>
          <button onClick={reset} className="text-xs font-bold mt-2 flex items-center gap-1 mx-auto" style={{ color: MUTED }}>
            <RotateCcw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      )}

      {state === 'failure' && (
        <div className="mt-4 rounded-2xl p-4 text-center" style={{ background: `${RED}15`, border: `1px solid ${RED}40` }}>
          <XCircle className="w-6 h-6 mx-auto mb-1" style={{ color: RED }} />
          <p className="font-bold text-sm" style={{ color: RED }}>That's the trap — you just fell into it.</p>
          <button onClick={reset} className="text-xs font-bold mt-2 flex items-center gap-1 mx-auto" style={{ color: MUTED }}>
            <RotateCcw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      )}
    </div>
  );
}
