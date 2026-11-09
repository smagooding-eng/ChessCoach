import React, { useState, useRef, useCallback } from 'react';
import { Link, useLocation } from 'wouter';
import { PieceTile } from '@/components/DesignSystem';
import { UpgradeNudge } from '@/components/UpgradeNudge';
import { ProUpsell } from '@/components/ProUpsell';
import { useUser } from '@/hooks/use-user';
import { Chess } from 'chess.js';
import { ChessBoard } from '@/components/ChessBoard';
import { useBoardTheme } from '@/components/MiniBoard';
import { apiFetch } from '@/lib/api';
import { Camera, Upload, RotateCcw, Swords, Compass, AlertCircle, X, FlipVertical, Wand2, Trash2, ArrowLeft, Archive, Check, Loader2, Puzzle, Pencil } from 'lucide-react';
import { positionProblems, withCastling, setTurn } from '@/lib/positionCheck';
import { SolvePosition } from '@/components/SolvePosition';

const PIECE_GLYPH: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

function fenToBoard(fen: string): (string | null)[][] {
  const board: (string | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
  const placement = (fen.split(' ')[0] || '');
  const rows = placement.split('/');
  for (let r = 0; r < 8; r++) {
    let f = 0;
    const row = rows[r] || '';
    for (const ch of row) {
      if (/[1-8]/.test(ch)) { f += parseInt(ch); }
      else { if (f < 8) board[r][f] = ch; f++; }
    }
  }
  return board;
}

function boardToFen(board: (string | null)[][], rest: string): string {
  const ranks: string[] = [];
  for (let r = 0; r < 8; r++) {
    let line = '';
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p) { if (empty > 0) { line += empty.toString(); empty = 0; } line += p; }
      else { empty++; }
    }
    if (empty > 0) line += empty.toString();
    ranks.push(line);
  }
  return ranks.join('/') + ' ' + rest;
}

function EditableBoard({ fen, flipped, onFenChange, unsure = [] }: { fen: string; flipped: boolean; onFenChange: (fen: string) => void; unsure?: string[] }) {
  const board = fenToBoard(fen);
  const theme = useBoardTheme();
  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = flipped ? ['h','g','f','e','d','c','b','a'] : ['a','b','c','d','e','f','g','h'];
  const restParts = fen.split(' ').slice(1);
  const rest = restParts.length > 0 ? restParts.join(' ') : 'w - - 0 1';

  const handleClick = (rowIdx: number, colIdx: number) => {
    const piece = board[rowIdx][colIdx];
    if (!piece) return;
    // Toggle color: uppercase ↔ lowercase
    const flipped = piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
    const newBoard = board.map(r => r.slice());
    newBoard[rowIdx][colIdx] = flipped;
    onFenChange(boardToFen(newBoard, rest));
  };

  return (
    <div
      className="relative grid grid-cols-8 w-full select-none rounded-[10px] overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.6)]"
      style={{ aspectRatio: '1', touchAction: 'manipulation', ...theme.skin.boardStyle }}
    >
      {theme.defs}
      {ranks.map((rank) =>
        files.map((file) => {
          const rowIdx = 8 - rank;
          const colIdx = file.charCodeAt(0) - 97;
          const piece = board[rowIdx][colIdx];
          const isLight = (rowIdx + colIdx) % 2 === 0;
          return (
            <button
              key={`${file}${rank}`}
              type="button"
              onClick={() => handleClick(rowIdx, colIdx)}
              disabled={!piece}
              className="relative flex items-center justify-center text-[clamp(22px,6vw,40px)] leading-none p-0 m-0 border-0"
              style={{
                ...(isLight ? theme.skin.lightSquareStyle : theme.skin.darkSquareStyle),
                cursor: piece ? 'pointer' : 'default',
                aspectRatio: '1',
              }}
              aria-label={`${file}${rank}${piece ? ` ${piece}` : ''}`}
            >
              {piece ? theme.renderPiece(piece) : null}
              {unsure.includes(`${file}${rank}`) && <span className="pointer-events-none absolute inset-[2px] rounded-[3px]" style={{ boxShadow: 'inset 0 0 0 3px #E8B447' }} />}
            </button>
          );
        })
      )}
    </div>
  );
}

type ScanState = 'idle' | 'scanning' | 'result' | 'error' | 'builder';

const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1';

function BuilderBoard({
  fen,
  flipped,
  selectedPiece,
  onSquareTap,
}: {
  fen: string;
  flipped: boolean;
  selectedPiece: string | null;
  onSquareTap: (rowIdx: number, colIdx: number) => void;
}) {
  const board = fenToBoard(fen);
  const theme = useBoardTheme();
  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = flipped ? ['h','g','f','e','d','c','b','a'] : ['a','b','c','d','e','f','g','h'];

  return (
    <div
      className="relative grid grid-cols-8 w-full select-none rounded-[10px] overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.6)]"
      style={{ aspectRatio: '1', touchAction: 'manipulation', ...theme.skin.boardStyle }}
    >
      {theme.defs}
      {ranks.map((rank) =>
        files.map((file) => {
          const rowIdx = 8 - rank;
          const colIdx = file.charCodeAt(0) - 97;
          const piece = board[rowIdx][colIdx];
          const isLight = (rowIdx + colIdx) % 2 === 0;
          return (
            <button
              key={`${file}${rank}`}
              type="button"
              onClick={() => onSquareTap(rowIdx, colIdx)}
              className="relative flex items-center justify-center text-[clamp(22px,6vw,40px)] leading-none p-0 m-0 border-0"
              style={{
                ...(isLight ? theme.skin.lightSquareStyle : theme.skin.darkSquareStyle),
                cursor: selectedPiece || piece ? 'pointer' : 'default',
                aspectRatio: '1',
              }}
              aria-label={`${file}${rank}${piece ? ` ${piece}` : ''}`}
            >
              {piece ? theme.renderPiece(piece) : null}
            </button>
          );
        })
      )}
    </div>
  );
}

export function ScanPosition() {
  const pieceTheme = useBoardTheme();
  const { isPremium, isSubscriptionLoaded } = useUser();
  const [, navigate] = useLocation();
  const [state, setState] = useState<ScanState>('idle');
  const [error, setError] = useState('');
  const [fen, setFen] = useState('');
  const [confidence, setConfidence] = useState('');
  const [notes, setNotes] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [croppedImage, setCroppedImage] = useState('');
  const [annotatedImage, setAnnotatedImage] = useState('');
  const [sandboxFen, setSandboxFen] = useState('');
  const [sandboxChess, setSandboxChess] = useState<Chess | null>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [mode, setMode] = useState<'preview' | 'explore' | 'solve'>('preview');
  const [unsure, setUnsure] = useState<string[]>([]);
  // Scans save themselves to Saved Positions; fixes made afterwards update that same entry.
  const savedId = useRef<number | null>(null);
  const savedFen = useRef('');
  const [gameStatus, setGameStatus] = useState<string | null>(null);
  const [builderFen, setBuilderFen] = useState(START_FEN);
  const [builderPiece, setBuilderPiece] = useState<string | null>('P');
  const [builderTurn, setBuilderTurn] = useState<'w' | 'b'>('w');
  const [builderError, setBuilderError] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isLimitReached, setIsLimitReached] = useState(false);
  // Opened from Saved Positions with ?fen=…&solve=1: straight into solving it.
  React.useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const f = q.get('fen');
    if (!f) return;
    if (positionProblems(f).length) { setBuilderFen(f); setState('builder'); return; }
    setFen(f); setSaveState('saved'); setState('result'); setMode(q.get('solve') === '1' ? 'solve' : 'preview');
  }, []);
  React.useEffect(() => {
    if (state !== 'result' || !savedId.current || !fen || fen === savedFen.current) return;
    const id = savedId.current;
    const t = setTimeout(() => {
      setSaveState('saving');
      apiFetch(`/api/scanned-positions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fen }) })
        .then((r) => { if (r.ok) { savedFen.current = fen; setSaveState('saved'); } else setSaveState('error'); })
        .catch(() => setSaveState('error'));
    }, 1200);
    return () => clearTimeout(t);
  }, [fen, state, saveState]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      setState('error');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Image is too large. Max 10MB.');
      setState('error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setPreviewUrl(dataUrl);
      setState('scanning');
      setError('');

      try {
        const res = await apiFetch('/api/analysis/scan-position', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: dataUrl }),
        });

        const data = await res.json() as { fen?: string; confidence?: string; unsure?: string[]; notes?: string; croppedImage?: string; annotatedImage?: string; error?: string; message?: string };

        if (!res.ok || !data.fen) {
          setIsLimitReached(data.error === 'usage_limit' || data.error === 'pro_required');
          setError((data.error === 'usage_limit' || data.error === 'pro_required' ? data.message : data.error) || 'Could not recognize a chess position.');
          setState('error');
          return;
        }
        setIsLimitReached(false);

        setFen(data.fen);
        setConfidence(data.confidence || 'medium');
        setUnsure(Array.isArray(data.unsure) ? data.unsure.slice(0, 64) : []);
        setNotes(data.notes || '');
        setCroppedImage(data.croppedImage || '');
        savedId.current = null; savedFen.current = data.fen;
        setSaveState('saving');
        void apiFetch('/api/scanned-positions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fen: data.fen }) })
          .then(async (r) => { const d = await r.json().catch(() => ({})); if (r.ok && d.position?.id) { savedId.current = d.position.id; setSaveState('saved'); } else setSaveState('error'); })
          .catch(() => setSaveState('error'));
        setAnnotatedImage(data.annotatedImage || '');
        setState('result');
      } catch {
        setError('Failed to analyze the image. Please try again.');
        setState('error');
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const checkGameOver = useCallback((chess: Chess) => {
    if (chess.isCheckmate()) {
      const winner = chess.turn() === 'w' ? 'Black' : 'White';
      setGameStatus(`Checkmate — ${winner} wins!`);
    } else if (chess.isStalemate()) {
      setGameStatus('Stalemate — Draw');
    } else if (chess.isDraw()) {
      setGameStatus('Draw');
    } else {
      setGameStatus(null);
    }
  }, []);

  // Explore opens the Position Explorer at this position (Stockfish's swing on every move).
  const startExplore = useCallback(() => {
    try {
      const chess = new Chess(withCastling(fen));
      navigate(`/explore?from=scan&fen=${encodeURIComponent(chess.fen())}`);
    } catch {
      setError('Invalid position — cannot load this FEN.');
      setState('error');
    }
  }, [fen, navigate]);

  const handleSandboxMove = useCallback((san: string) => {
    if (!sandboxChess) return;
    try {
      sandboxChess.move(san);
      setSandboxFen(sandboxChess.fen());
      setMoveHistory(prev => [...prev, san]);
      checkGameOver(sandboxChess);
    } catch {}
  }, [sandboxChess, checkGameOver]);

  const undoMove = useCallback(() => {
    if (!sandboxChess) return;
    sandboxChess.undo();
    setSandboxFen(sandboxChess.fen());
    setMoveHistory(prev => prev.slice(0, -1));
    setGameStatus(null);
  }, [sandboxChess]);

  const resetExplore = useCallback(() => {
    try {
      const chess = new Chess(fen);
      setSandboxChess(chess);
      setSandboxFen(chess.fen());
      setMoveHistory([]);
      setGameStatus(null);
    } catch {}
  }, [fen]);

  const saveToArchive = useCallback(async () => {
    if (!fen || saveState === 'saving') return;
    setSaveState('saving');
    try {
      const res = savedId.current
        ? await apiFetch(`/api/scanned-positions/${savedId.current}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fen }) })
        : await apiFetch('/api/scanned-positions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fen }) });
      if (res.ok) {
        if (!savedId.current) { const d = await res.json().catch(() => ({})); if (d.position?.id) savedId.current = d.position.id; }
        savedFen.current = fen;
        setSaveState('saved');
      } else {
        setSaveState('error');
      }
    } catch {
      setSaveState('error');
    }
  }, [fen, saveState]);

  const resetAll = useCallback(() => {
    setState('idle');
    setError('');
    setFen('');
    setConfidence('');
    setNotes('');
    setPreviewUrl('');
    setCroppedImage('');
    setSandboxFen('');
    setSandboxChess(null);
    setMoveHistory([]);
    setMode('preview');
    setFlipped(false);
    setGameStatus(null);
    setSaveState('idle');
    setIsLimitReached(false);
    setUnsure([]);
    savedId.current = null; savedFen.current = '';
  }, []);

  const goToPlayAI = useCallback((fromFen?: string) => {
    const activeFen = fromFen ? fromFen : fen ? withCastling(fen) : '';
    if (!activeFen) return;
    const turnChar = activeFen.split(' ')[1] || 'w';
    const color = turnChar === 'b' ? 'b' : 'w';
    window.location.href = `/practice?fen=${encodeURIComponent(activeFen)}&rating=1200&color=${color}`;
  }, [fen]);

  const problems = state === 'result' && fen ? positionProblems(fen) : [];
  // The full editor, starting from this position (to add, move or remove pieces).
  const openEditor = (from: string) => {
    setBuilderFen(from);
    setBuilderTurn(from.split(' ')[1] === 'b' ? 'b' : 'w');
    setBuilderPiece(null);
    setBuilderError('');
    setState('builder');
  };

  const confidenceColor = confidence === 'high' ? 'text-emerald-400' : confidence === 'medium' ? 'text-amber-400' : 'text-rose-400';
  const confidenceBg = confidence === 'high' ? 'bg-emerald-500/20 border-emerald-500/50' : confidence === 'medium' ? 'bg-amber-500/20 border-amber-500/50' : 'bg-rose-500/20 border-rose-500/50';

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <div className="flex flex-col items-center text-center">
        <PieceTile piece="♞" size={56} />
        <h1 className="text-2xl md:text-3xl font-black mt-3" style={{ letterSpacing: '-0.02em' }}>
          <span className="text-white">Scan</span>{' '}
          <span style={{ color: '#81b64c' }}>Position</span>
        </h1>
        <p className="text-sm text-white/40 mt-1">
          Upload a chess board screenshot and jump into the position
        </p>
        <Link href="/scan-archive" className="inline-flex items-center gap-1.5 mt-3 text-xs font-bold" style={{ color: '#81b64c' }}>
          <Archive className="w-3.5 h-3.5" />
          View Saved Positions
        </Link>
      </div>

      {state === 'idle' && !isPremium && isSubscriptionLoaded && (
        <ProUpsell
          compact
          title="Photo scanning is part of Pro"
          text="AI vision reads the board for you. The position editor below is free: set up any position by hand."
        />
      )}

      {state === 'idle' && (
        <div className="space-y-3">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="glass-card rounded-xl p-8 border border-white/10 hover:border-primary/30 transition-all cursor-pointer flex flex-col items-center gap-3 active:scale-[0.98]"
          >
            <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ background: '#81B64C' }}>
              <Upload className="w-7 h-7" style={{ color: '#ffffff' }} />
            </div>
            <div className="text-center">
              <p className="font-bold text-white">Upload Image</p>
              <p className="text-xs text-white/40 mt-0.5">PNG, JPG, or WEBP up to 10MB</p>
            </div>
          </div>

          <div
            onClick={() => cameraInputRef.current?.click()}
            className="glass-card rounded-xl p-6 border border-white/10 hover:border-primary/30 transition-all cursor-pointer flex items-center gap-4 active:scale-[0.98]"
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#81B64C' }}>
              <Camera className="w-5 h-5" style={{ color: '#ffffff' }} />
            </div>
            <div>
              <p className="font-bold text-white text-sm">Take Photo</p>
              <p className="text-xs text-white/40">Use your camera to capture a position</p>
            </div>
          </div>

          <div
            onClick={() => {
              setBuilderFen(START_FEN);
              setBuilderTurn('w');
              setBuilderPiece('P');
              setBuilderError('');
              setState('builder');
            }}
            className="glass-card rounded-xl p-6 border border-white/10 hover:border-primary/30 transition-all cursor-pointer flex items-center gap-4 active:scale-[0.98]"
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#81B64C' }}>
              <Wand2 className="w-5 h-5" style={{ color: '#ffffff' }} />
            </div>
            <div>
              <p className="font-bold text-white text-sm">Build Position</p>
              <p className="text-xs text-white/40">Set up any position from scratch and play it</p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />

          <div className="glass-card rounded-xl p-4 border border-white/5">
            <p className="text-[11px] font-bold text-white/30 uppercase tracking-wider mb-2">Tips for best results</p>
            <ul className="text-xs text-white/50 space-y-1.5">
              <li className="flex gap-2"><span style={{ color: '#81b64c' }}>•</span> Use a clear, well-lit photo of the board</li>
              <li className="flex gap-2"><span style={{ color: '#81b64c' }}>•</span> Screenshot from Chess.com or Lichess works great</li>
              <li className="flex gap-2"><span style={{ color: '#81b64c' }}>•</span> Make sure all pieces are visible</li>
              <li className="flex gap-2"><span style={{ color: '#81b64c' }}>•</span> Photos from chess books and diagrams also work</li>
            </ul>
          </div>
        </div>
      )}

      {state === 'scanning' && (
        <div className="space-y-4">
          {previewUrl && (
            <div className="glass-card rounded-xl overflow-hidden border border-white/10">
              <img src={previewUrl} alt="Chess position" className="w-full max-h-80 object-contain bg-black/30" />
            </div>
          )}
          <div className="glass-card rounded-xl px-4 py-5 border border-primary/30 bg-primary flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
            <div>
              <p className="text-sm font-bold" style={{ color: '#81b64c' }}>Analyzing position...</p>
              <p className="text-xs text-white/40 mt-0.5">Identifying every piece on the board</p>
            </div>
          </div>
        </div>
      )}

      {state === 'error' && isLimitReached && (
        <UpgradeNudge
          headline="Scanning a photo is part of Pro"
          subtext="Reading a board from a photo uses AI vision. The position editor below is always free: set up any position and play it against Stockfish."
        />
      )}

      {state === 'error' && !isLimitReached && (
        <div className="space-y-3">
          {previewUrl && (
            <div className="glass-card rounded-xl overflow-hidden border border-white/10">
              <img src={previewUrl} alt="Chess position" className="w-full max-h-80 object-contain bg-black/30" />
            </div>
          )}
          <div className="glass-card rounded-xl px-4 py-3 border border-rose-500/30 bg-rose-500/5 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <p className="text-sm text-rose-400 flex-1">{error}</p>
          </div>
          <button
            onClick={resetAll}
            className="w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.97] border border-white/10 hover:border-primary/30 text-white/60 hover:text-white"
          >
            Try Again
          </button>
        </div>
      )}

      {state === 'result' && mode === 'preview' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {croppedImage && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Cropped Board</p>
                <img
                  src={croppedImage}
                  alt="Cropped board"
                  className="w-full rounded-[10px] border border-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.5)]"
                  style={{
                    aspectRatio: '1 / 1',
                    objectFit: 'contain',
                    background: '#000',
                    display: 'block',
                  }}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Detected — tap a piece to flip its color</p>
              <div className="relative">
                <EditableBoard fen={fen} flipped={flipped} onFenChange={(f) => { setFen(f); setSaveState('idle'); }} unsure={unsure} />
                <button
                  onClick={() => setFlipped(f => !f)}
                  className="absolute top-2 left-2 z-10 p-1.5 rounded-xl bg-black/60 backdrop-blur-sm border border-white/10 hover:border-primary/30 transition-all"
                  title="Flip board"
                >
                  <FlipVertical className="w-4 h-4 text-white/60" />
                </button>
              </div>
            </div>
          </div>

          <div className={`rounded-xl px-3 py-2 border text-xs flex items-center gap-2 ${confidenceBg}`}>
            <span className={`font-bold uppercase ${confidenceColor}`}>
              {confidence} confidence
            </span>
            {notes && <span className="text-white/40">— {notes}</span>}
          </div>

          {unsure.length > 0 && (
            <div className="rounded-xl px-3 py-2 text-xs" style={{ background: '#121B1D', border: '1px solid rgba(232,180,71,.5)' }}>
              <span className="font-bold" style={{ color: '#E8B447' }}>Check {unsure.length === 1 ? 'this square' : `these ${unsure.length} squares`}:</span>{' '}
              <span className="text-white/70">{unsure.join(', ')}. They’re outlined on the board. The scan wasn’t sure about them.</span>
            </div>
          )}

          {problems.length > 0 && (
            <div className="rounded-xl px-3 py-2.5 text-xs space-y-1" style={{ background: '#121B1D', border: '1px solid rgba(240,96,93,.55)' }}>
              <p className="font-bold text-rose-400">This position can’t be played yet:</p>
              {problems.map((p) => <p key={p} className="text-white/75">• {p}</p>)}
              <p className="text-white/50">Tap a piece to switch its colour, or fix it in the editor.</p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">To move</span>
            {(['w', 'b'] as const).map((t) => (
              <button key={t} onClick={() => setFen((f) => setTurn(f, t))} className="rounded-full px-3 py-1 text-xs font-bold"
                style={(fen.split(' ')[1] || 'w') === t ? { background: t === 'w' ? '#fff' : '#1a1a1a', color: t === 'w' ? '#1a1a1a' : '#fff', border: '1px solid rgba(255,255,255,.25)' } : { color: 'rgba(255,255,255,.6)', border: '1px solid rgba(255,255,255,.1)' }}>
                {t === 'w' ? 'White' : 'Black'}
              </button>
            ))}
            <button onClick={() => openEditor(fen)} className="ml-auto flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-white/70"><Pencil className="h-3 w-3" />Edit position</button>
          </div>

          <button
            onClick={() => setMode('solve')}
            disabled={problems.length > 0}
            className="w-full py-3 rounded-xl font-black text-sm transition-all active:scale-[0.97] flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ background: '#81b64c', color: '#ffffff' }}
          >
            <Puzzle className="w-4 h-4" />
            Solve it: find the best move
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={startExplore}
              disabled={problems.length > 0}
              className="disabled:opacity-40 py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.97] flex items-center justify-center gap-2"
              style={{ background: 'rgba(129,182,76,0.35)', color: '#ffffff', border: '1px solid rgba(129,182,76,0.3)' }}
            >
              <Compass className="w-4 h-4" />
              Explore
            </button>
            <button
              onClick={() => goToPlayAI()}
              disabled={problems.length > 0}
              className="disabled:opacity-40 py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.97] flex items-center justify-center gap-2"
              style={{ background: 'rgba(129,182,76,0.35)', color: '#ffffff', border: '1px solid rgba(129,182,76,0.3)' }}
            >
              <Swords className="w-4 h-4" />
              Play Bot
            </button>
          </div>

          <button
            onClick={saveToArchive}
            disabled={saveState === 'saving' || saveState === 'saved'}
            className="w-full py-2.5 rounded-xl font-bold text-sm transition-all active:scale-[0.97] flex items-center justify-center gap-2 disabled:opacity-70"
            style={{
              background: saveState === 'saved' ? 'rgba(129,182,76,0.1)' : 'rgba(255,255,255,0.05)',
              color: saveState === 'saved' ? '#81b64c' : '#e8e6e3',
              border: saveState === 'saved' ? '1px solid rgba(129,182,76,0.3)' : '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {saveState === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
            {saveState === 'saved' && <Check className="w-4 h-4" />}
            {(saveState === 'idle' || saveState === 'error') && <Archive className="w-4 h-4" />}
            {saveState === 'saved' ? (savedId.current ? 'Saved automatically · fixes save too' : 'Saved to Archive') : saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save Failed — Tap to Retry' : 'Save to Archive'}
          </button>

          <button
            onClick={resetAll}
            className="w-full py-2.5 rounded-xl text-xs font-bold text-white/40 hover:text-white/60 transition-all flex items-center justify-center gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            Scan New Position
          </button>
        </div>
      )}

      {state === 'result' && mode === 'solve' && (
        <div className="space-y-3">
          <SolvePosition fen={withCastling(fen)} flipped={flipped} onExplore={startExplore} onPlay={() => goToPlayAI()} />
          <button onClick={() => setMode('preview')} className="w-full py-2.5 rounded-xl text-xs font-bold text-white/40 hover:text-white/60 transition-all flex items-center justify-center gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to the position
          </button>
        </div>
      )}

      {state === 'result' && mode === 'explore' && (
        <div className="space-y-3">
          <div className="relative">
            <ChessBoard
              fen={sandboxFen}
              flipped={flipped}
              practiceMode={!gameStatus}
              onMovePlayed={(san) => handleSandboxMove(san)}
            />
            <button
              onClick={() => setFlipped(f => !f)}
              className="absolute top-2 left-2 z-10 p-1.5 rounded-xl bg-black/60 backdrop-blur-sm border border-white/10 hover:border-primary/30 transition-all"
              title="Flip board"
            >
              <FlipVertical className="w-4 h-4 text-white/60" />
            </button>
            {gameStatus && (
              <div className="absolute inset-0 rounded-[10px] flex items-center justify-center bg-black/50 pointer-events-none">
                <div className="px-5 py-3 rounded-xl bg-amber-500/20 border border-amber-500/40 backdrop-blur-sm">
                  <p className="text-lg font-black text-amber-300 text-center">♚ {gameStatus}</p>
                </div>
              </div>
            )}
          </div>

          {moveHistory.length > 0 && (
            <div className="glass-card rounded-xl px-3 py-2 border border-white/10 flex items-center gap-2">
              <p className="text-xs text-white/40 truncate flex-1">
                {moveHistory.map((m, i) => (
                  <span key={i}>
                    {i % 2 === 0 && <span className="text-white/20">{Math.floor(i / 2) + 1}. </span>}
                    <span className="text-white/60">{m} </span>
                  </span>
                ))}
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={undoMove}
              disabled={moveHistory.length === 0}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-[0.97] flex items-center justify-center gap-1.5 border border-white/10 hover:border-primary/30 text-white/50 disabled:opacity-30"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Undo
            </button>
            <button
              onClick={resetExplore}
              disabled={moveHistory.length === 0}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-[0.97] flex items-center justify-center gap-1.5 border border-white/10 hover:border-primary/30 text-white/50 disabled:opacity-30"
            >
              Reset
            </button>
            <button
              onClick={() => goToPlayAI(sandboxFen)}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-[0.97] flex items-center justify-center gap-1.5"
              style={{ background: 'rgba(129,182,76,0.35)', color: '#ffffff', border: '1px solid rgba(129,182,76,0.3)' }}
            >
              <Swords className="w-3.5 h-3.5" />
              Play Bot
            </button>
          </div>

          <button
            onClick={resetAll}
            className="w-full py-2.5 rounded-xl text-xs font-bold text-white/40 hover:text-white/60 transition-all flex items-center justify-center gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            Scan New Position
          </button>
        </div>
      )}

      {state === 'builder' && (
        <div className="space-y-3">
          <div className="relative">
            <BuilderBoard
              fen={builderFen}
              flipped={flipped}
              selectedPiece={builderPiece}
              onSquareTap={(rowIdx, colIdx) => {
                const board = fenToBoard(builderFen);
                const existing = board[rowIdx][colIdx];
                const newBoard = board.map(r => r.slice());
                if (builderPiece) {
                  newBoard[rowIdx][colIdx] = builderPiece;
                } else if (existing) {
                  newBoard[rowIdx][colIdx] = null;
                }
                const restParts = builderFen.split(' ').slice(1);
                const rest = restParts.length > 0 ? restParts.join(' ') : `${builderTurn} - - 0 1`;
                setBuilderFen(boardToFen(newBoard, rest));
                setBuilderError('');
              }}
            />
            <button
              onClick={() => setFlipped(f => !f)}
              className="absolute top-2 left-2 z-10 p-1.5 rounded-xl bg-black/60 backdrop-blur-sm border border-white/10 hover:border-primary/30 transition-all"
              title="Flip board"
            >
              <FlipVertical className="w-4 h-4 text-white/60" />
            </button>
          </div>

          <div className="rounded-xl px-3 py-2 border border-white/10 bg-white/5 text-[11px] text-white/60 text-center">
            {builderPiece ? (
              <>Tap any square to place <span className="text-white/90 font-bold">
                {PIECE_GLYPH[builderPiece]} {builderPiece === builderPiece.toUpperCase() ? 'White' : 'Black'}{' '}
                {({ K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn' } as Record<string, string>)[builderPiece.toUpperCase()]}
              </span></>
            ) : (
              <>Eraser selected — tap any piece to <span className="text-white/90 font-bold">remove</span> it.</>
            )}
          </div>

          {/* Piece palette: white row + black row + eraser */}
          <div className="space-y-1.5">
            <div className="grid grid-cols-6 gap-1">
              {['K','Q','R','B','N','P'].map(p => (
                <button
                  key={p}
                  onClick={() => setBuilderPiece(p)}
                  className="aspect-square rounded-xl flex items-center justify-center text-[clamp(20px,5vw,32px)] leading-none transition-all"
                  style={{
                    background: builderPiece === p ? 'rgba(129,182,76,0.25)' : '#3a3835',
                    border: builderPiece === p ? '2px solid #81b64c' : '2px solid transparent',
                  }}
                  aria-label={`White ${p}`}
                >
                  <span className="relative block h-[78%] w-[78%]">{pieceTheme.renderPiece(p)}</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-6 gap-1">
              {['k','q','r','b','n','p'].map(p => (
                <button
                  key={p}
                  onClick={() => setBuilderPiece(p)}
                  className="aspect-square rounded-xl flex items-center justify-center text-[clamp(20px,5vw,32px)] leading-none transition-all"
                  style={{
                    background: builderPiece === p ? 'rgba(129,182,76,0.25)' : '#3a3835',
                    border: builderPiece === p ? '2px solid #81b64c' : '2px solid transparent',
                  }}
                  aria-label={`Black ${p}`}
                >
                  <span className="relative block h-[78%] w-[78%]">{pieceTheme.renderPiece(p)}</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1">
              <button
                onClick={() => setBuilderPiece(null)}
                className="py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                style={{
                  background: builderPiece === null ? 'rgba(244,63,94,0.2)' : '#3a3835',
                  border: builderPiece === null ? '2px solid rgba(244,63,94,0.6)' : '2px solid transparent',
                  color: builderPiece === null ? '#fb7185' : '#fff',
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Eraser
              </button>
              <button
                onClick={() => {
                  setBuilderFen(`8/8/8/8/8/8/8/8 ${builderTurn} - - 0 1`);
                  setBuilderError('');
                }}
                className="py-2 rounded-xl text-xs font-bold border border-white/10 hover:border-white/30 text-white/70 transition-all"
              >
                Clear Board
              </button>
              <button
                onClick={() => {
                  setBuilderFen(`rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR ${builderTurn} - - 0 1`);
                  setBuilderError('');
                }}
                className="py-2 rounded-xl text-xs font-bold border border-white/10 hover:border-white/30 text-white/70 transition-all"
              >
                Start Pos
              </button>
            </div>
          </div>

          {/* Side to move */}
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40 px-2">Turn</span>
            <button
              onClick={() => {
                setBuilderTurn('w');
                const parts = builderFen.split(' ');
                parts[1] = 'w';
                setBuilderFen(parts.join(' '));
                setBuilderError('');
              }}
              className="flex-1 py-1.5 rounded-xl text-xs font-bold transition-all"
              style={{
                background: builderTurn === 'w' ? '#fff' : 'transparent',
                color: builderTurn === 'w' ? '#1a1a1a' : 'rgba(255,255,255,0.6)',
              }}
            >
              White
            </button>
            <button
              onClick={() => {
                setBuilderTurn('b');
                const parts = builderFen.split(' ');
                parts[1] = 'b';
                setBuilderFen(parts.join(' '));
                setBuilderError('');
              }}
              className="flex-1 py-1.5 rounded-xl text-xs font-bold transition-all"
              style={{
                background: builderTurn === 'b' ? '#1a1a1a' : 'transparent',
                color: builderTurn === 'b' ? '#fff' : 'rgba(255,255,255,0.6)',
                border: builderTurn === 'b' ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
              }}
            >
              Black
            </button>
          </div>

          {builderError && (
            <div className="rounded-xl px-3 py-2 border border-rose-500/30 bg-rose-500/5 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <p className="text-xs text-rose-400">{builderError}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                const issues = positionProblems(builderFen);
                if (issues.length) { setBuilderError(issues.join(' ')); return; }
                try {
                  const chess = new Chess(withCastling(builderFen));
                  setFen(chess.fen());
                  setBuilderError('');
                  navigate(`/explore?from=scan&fen=${encodeURIComponent(chess.fen())}`);
                } catch (e) {
                  setBuilderError(`Invalid position — ${(e as Error).message || 'check kings, pawn ranks, and side to move.'}`);
                }
              }}
              className="py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.97] flex items-center justify-center gap-2"
              style={{ background: 'rgba(129,182,76,0.35)', color: '#ffffff', border: '1px solid rgba(129,182,76,0.3)' }}
            >
              <Compass className="w-4 h-4" />
              Explore
            </button>
            <button
              onClick={() => {
                const issues = positionProblems(builderFen);
                if (issues.length) { setBuilderError(issues.join(' ')); return; }
                try {
                  const chess = new Chess(withCastling(builderFen));
                  goToPlayAI(chess.fen());
                } catch (e) {
                  setBuilderError(`Invalid position — ${(e as Error).message || 'check kings, pawn ranks, and side to move.'}`);
                }
              }}
              className="py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.97] flex items-center justify-center gap-2"
              style={{ background: 'rgba(129,182,76,0.35)', color: '#ffffff', border: '1px solid rgba(129,182,76,0.3)' }}
            >
              <Swords className="w-4 h-4" />
              Play Bot
            </button>
          </div>

          <button
            onClick={() => {
              const issues = positionProblems(builderFen);
              if (issues.length) { setBuilderError(issues.join(' ')); return; }
              setFen(withCastling(builderFen)); setUnsure([]); setSaveState('idle'); setState('result'); setMode('solve');
            }}
            className="w-full py-3 rounded-xl font-black text-sm transition-all active:scale-[0.97] flex items-center justify-center gap-2"
            style={{ background: '#81b64c', color: '#ffffff' }}
          >
            <Puzzle className="w-4 h-4" />
            Solve it: find the best move
          </button>
          {fen && (
            <button
              onClick={() => { setFen(builderFen); setUnsure([]); setSaveState('idle'); setState('result'); setMode('preview'); }}
              className="w-full py-2.5 rounded-xl text-xs font-bold text-white/60 border border-white/10 transition-all flex items-center justify-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              Use this position
            </button>
          )}

          <button
            onClick={resetAll}
            className="w-full py-2.5 rounded-xl text-xs font-bold text-white/40 hover:text-white/60 transition-all flex items-center justify-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
        </div>
      )}
    </div>
  );
}
