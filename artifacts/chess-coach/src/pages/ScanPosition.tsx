import React, { useState, useRef, useCallback } from 'react';
import { Chess } from 'chess.js';
import { ChessBoard } from '@/components/ChessBoard';
import { apiFetch } from '@/lib/api';
import { Camera, Upload, RotateCcw, Swords, Compass, AlertCircle, X, FlipVertical } from 'lucide-react';

type ScanState = 'idle' | 'scanning' | 'result' | 'error';

export function ScanPosition() {
  const [state, setState] = useState<ScanState>('idle');
  const [error, setError] = useState('');
  const [fen, setFen] = useState('');
  const [confidence, setConfidence] = useState('');
  const [notes, setNotes] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [sandboxFen, setSandboxFen] = useState('');
  const [sandboxChess, setSandboxChess] = useState<Chess | null>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [mode, setMode] = useState<'preview' | 'explore'>('preview');
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

        const data = await res.json() as { fen?: string; confidence?: string; notes?: string; error?: string };

        if (!res.ok || !data.fen) {
          setError(data.error || 'Could not recognize a chess position.');
          setState('error');
          return;
        }

        setFen(data.fen);
        setConfidence(data.confidence || 'medium');
        setNotes(data.notes || '');
        setState('result');
      } catch {
        setError('Failed to analyze the image. Please try again.');
        setState('error');
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const startExplore = useCallback(() => {
    try {
      const chess = new Chess(fen);
      setSandboxChess(chess);
      setSandboxFen(chess.fen());
      setMoveHistory([]);
      setMode('explore');
    } catch {
      setError('Invalid position — cannot load this FEN.');
      setState('error');
    }
  }, [fen]);

  const handleSandboxMove = useCallback((san: string) => {
    if (!sandboxChess) return;
    try {
      sandboxChess.move(san);
      setSandboxFen(sandboxChess.fen());
      setMoveHistory(prev => [...prev, san]);
    } catch {}
  }, [sandboxChess]);

  const undoMove = useCallback(() => {
    if (!sandboxChess) return;
    sandboxChess.undo();
    setSandboxFen(sandboxChess.fen());
    setMoveHistory(prev => prev.slice(0, -1));
  }, [sandboxChess]);

  const resetExplore = useCallback(() => {
    try {
      const chess = new Chess(fen);
      setSandboxChess(chess);
      setSandboxFen(chess.fen());
      setMoveHistory([]);
    } catch {}
  }, [fen]);

  const resetAll = useCallback(() => {
    setState('idle');
    setError('');
    setFen('');
    setConfidence('');
    setNotes('');
    setPreviewUrl('');
    setSandboxFen('');
    setSandboxChess(null);
    setMoveHistory([]);
    setMode('preview');
    setFlipped(false);
  }, []);

  const goToPlayAI = useCallback((fromFen?: string) => {
    const activeFen = fromFen || fen;
    if (!activeFen) return;
    const turnChar = activeFen.split(' ')[1] || 'w';
    const color = turnChar === 'b' ? 'b' : 'w';
    window.location.href = `/practice?fen=${encodeURIComponent(activeFen)}&rating=1200&color=${color}`;
  }, [fen]);

  const confidenceColor = confidence === 'high' ? 'text-emerald-400' : confidence === 'medium' ? 'text-amber-400' : 'text-rose-400';
  const confidenceBg = confidence === 'high' ? 'bg-emerald-500/10 border-emerald-500/30' : confidence === 'medium' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-rose-500/10 border-rose-500/30';

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <div className="text-center">
        <h1 className="text-2xl font-black tracking-tight">
          <span className="text-white">Scan</span>{' '}
          <span style={{ color: '#81b64c' }}>Position</span>
        </h1>
        <p className="text-sm text-white/40 mt-1">
          Upload a chess board screenshot and jump into the position
        </p>
      </div>

      {state === 'idle' && (
        <div className="space-y-3">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="glass-card rounded-2xl p-8 border border-white/10 hover:border-primary/30 transition-all cursor-pointer flex flex-col items-center gap-3 active:scale-[0.98]"
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(129,182,76,0.12)' }}>
              <Upload className="w-7 h-7" style={{ color: '#81b64c' }} />
            </div>
            <div className="text-center">
              <p className="font-bold text-white">Upload Image</p>
              <p className="text-xs text-white/40 mt-0.5">PNG, JPG, or WEBP up to 10MB</p>
            </div>
          </div>

          <div
            onClick={() => cameraInputRef.current?.click()}
            className="glass-card rounded-2xl p-6 border border-white/10 hover:border-primary/30 transition-all cursor-pointer flex items-center gap-4 active:scale-[0.98]"
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(129,182,76,0.12)' }}>
              <Camera className="w-5 h-5" style={{ color: '#81b64c' }} />
            </div>
            <div>
              <p className="font-bold text-white text-sm">Take Photo</p>
              <p className="text-xs text-white/40">Use your camera to capture a position</p>
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
          <div className="glass-card rounded-xl px-4 py-5 border border-primary/30 bg-primary/5 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
            <div>
              <p className="text-sm font-bold" style={{ color: '#81b64c' }}>Analyzing position...</p>
              <p className="text-xs text-white/40 mt-0.5">AI is identifying every piece on the board</p>
            </div>
          </div>
        </div>
      )}

      {state === 'error' && (
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
          <div className="relative">
            <ChessBoard fen={fen} flipped={flipped} />
            <button
              onClick={() => setFlipped(f => !f)}
              className="absolute top-2 left-2 z-10 p-1.5 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 hover:border-primary/30 transition-all"
              title="Flip board"
            >
              <FlipVertical className="w-4 h-4 text-white/60" />
            </button>
          </div>

          <div className={`rounded-xl px-3 py-2 border text-xs flex items-center gap-2 ${confidenceBg}`}>
            <span className={`font-bold uppercase ${confidenceColor}`}>
              {confidence} confidence
            </span>
            {notes && <span className="text-white/40">— {notes}</span>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={startExplore}
              className="py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.97] flex items-center justify-center gap-2"
              style={{ background: 'rgba(129,182,76,0.15)', color: '#81b64c', border: '1px solid rgba(129,182,76,0.3)' }}
            >
              <Compass className="w-4 h-4" />
              Explore
            </button>
            <button
              onClick={() => goToPlayAI()}
              className="py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.97] flex items-center justify-center gap-2"
              style={{ background: 'rgba(129,182,76,0.15)', color: '#81b64c', border: '1px solid rgba(129,182,76,0.3)' }}
            >
              <Swords className="w-4 h-4" />
              Play AI
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

      {state === 'result' && mode === 'explore' && (
        <div className="space-y-3">
          <div className="relative">
            <ChessBoard
              fen={sandboxFen}
              flipped={flipped}
              practiceMode={true}
              onMovePlayed={(san) => handleSandboxMove(san)}
            />
            <button
              onClick={() => setFlipped(f => !f)}
              className="absolute top-2 left-2 z-10 p-1.5 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 hover:border-primary/30 transition-all"
              title="Flip board"
            >
              <FlipVertical className="w-4 h-4 text-white/60" />
            </button>
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
              style={{ background: 'rgba(129,182,76,0.15)', color: '#81b64c', border: '1px solid rgba(129,182,76,0.3)' }}
            >
              <Swords className="w-3.5 h-3.5" />
              Play AI
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
    </div>
  );
}
