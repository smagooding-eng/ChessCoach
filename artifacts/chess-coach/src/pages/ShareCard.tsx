import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'wouter';
import { PageHero, CHESSCOM_GREEN, TEXT_LIGHT, TEXT_MUTED, BRASS } from '@/components/DesignSystem';
import { ChessBoard } from '@/components/ChessBoard';
import { Download, UserPlus, Loader2, Trophy, Flame, TrendingUp, Puzzle } from 'lucide-react';

export type ShareableCard =
  | { type: 'course'; username: string; courseName: string; weaknessFixed: string; lessonsCompleted: number }
  | { type: 'milestone'; username: string; oldRating?: number; newRating: number }
  | { type: 'streak'; username: string; streakDays: number; accuracy?: number }
  | { type: 'puzzle'; username: string; rating: number; themes: string[] }
  | { type: 'puzzle_position'; fen: string; rating: number; themes: string[] };

function decodeCard(encoded: string): ShareableCard | null {
  try {
    const json = decodeURIComponent(escape(atob(decodeURIComponent(encoded))));
    const parsed = JSON.parse(json);
    if (!parsed?.type) return null;
    if (parsed.type === 'puzzle_position') {
      if (!parsed.fen) return null;
      return parsed as ShareableCard;
    }
    if (!parsed?.username) return null;
    return parsed as ShareableCard;
  } catch {
    return null;
  }
}

export function encodeCard(card: ShareableCard): string {
  const json = JSON.stringify(card);
  return encodeURIComponent(btoa(unescape(encodeURIComponent(json))));
}

function CardContent({ card }: { card: ShareableCard }) {
  if (card.type === 'course') {
    return (
      <div className="text-center py-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
          style={{ background: '#211f1c', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05), inset 0 2px 4px rgba(0,0,0,0.4)' }}>
          <Trophy className="w-6 h-6" style={{ color: BRASS }} />
        </div>
        <p className="text-sm font-semibold" style={{ color: TEXT_MUTED }}>{card.username} just completed</p>
        <p className="font-display text-2xl font-semibold mt-1" style={{ color: TEXT_LIGHT }}>{card.courseName}</p>
        <p className="text-sm mt-3" style={{ color: CHESSCOM_GREEN }}>Fixed: {card.weaknessFixed}</p>
        <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>{card.lessonsCompleted} lessons, built from their own games</p>
      </div>
    );
  }
  if (card.type === 'milestone') {
    const gain = card.oldRating != null ? card.newRating - card.oldRating : null;
    return (
      <div className="text-center py-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
          style={{ background: '#211f1c', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05), inset 0 2px 4px rgba(0,0,0,0.4)' }}>
          <TrendingUp className="w-6 h-6" style={{ color: CHESSCOM_GREEN }} />
        </div>
        <p className="text-sm font-semibold" style={{ color: TEXT_MUTED }}>{card.username}'s Scout ELO</p>
        <p className="font-display text-4xl font-semibold mt-1" style={{ color: TEXT_LIGHT }}>{card.newRating}</p>
        {gain != null && (
          <p className="text-sm mt-2" style={{ color: CHESSCOM_GREEN }}>
            {gain >= 0 ? `+${gain}` : gain} from {card.oldRating}
          </p>
        )}
      </div>
    );
  }
  if (card.type === 'puzzle_position') {
    return (
      <div className="text-center py-5 px-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: CHESSCOM_GREEN }}>
          Can you find the winning move?
        </p>
        <div className="max-w-[280px] mx-auto rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
          <ChessBoard fen={card.fen} practiceMode={false} />
        </div>
        <p className="text-sm font-semibold mt-4" style={{ color: TEXT_LIGHT }}>{card.rating}-rated puzzle</p>
        {card.themes.length > 0 && (
          <div className="flex items-center justify-center gap-1.5 flex-wrap mt-2 px-4">
            {card.themes.slice(0, 3).map((theme) => (
              <span key={theme} className="px-2 py-0.5 rounded-md text-[10px] font-semibold" style={{ background: 'rgba(129,182,76,0.15)', color: CHESSCOM_GREEN }}>
                {theme}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (card.type === 'puzzle') {
    return (
      <div className="text-center py-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
          style={{ background: '#211f1c', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05), inset 0 2px 4px rgba(0,0,0,0.4)' }}>
          <Puzzle className="w-6 h-6" style={{ color: CHESSCOM_GREEN }} />
        </div>
        <p className="text-sm font-semibold" style={{ color: TEXT_MUTED }}>{card.username} solved a</p>
        <p className="font-display text-3xl font-semibold mt-1" style={{ color: TEXT_LIGHT }}>{card.rating} rated puzzle</p>
        {card.themes.length > 0 && (
          <div className="flex items-center justify-center gap-1.5 flex-wrap mt-3 px-4">
            {card.themes.slice(0, 3).map((theme) => (
              <span key={theme} className="px-2 py-0.5 rounded-md text-[10px] font-semibold" style={{ background: 'rgba(129,182,76,0.15)', color: CHESSCOM_GREEN }}>
                {theme}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }
  // streak
  return (
    <div className="text-center py-6">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
        style={{ background: '#211f1c', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05), inset 0 2px 4px rgba(0,0,0,0.4)' }}>
        <Flame className="w-6 h-6" style={{ color: '#e88930' }} />
      </div>
      <p className="text-sm font-semibold" style={{ color: TEXT_MUTED }}>{card.username}'s puzzle streak</p>
      <p className="font-display text-4xl font-semibold mt-1" style={{ color: TEXT_LIGHT }}>{card.streakDays} days</p>
      {card.accuracy != null && (
        <p className="text-sm mt-2" style={{ color: CHESSCOM_GREEN }}>{card.accuracy}% accuracy</p>
      )}
    </div>
  );
}

export function ShareCard() {
  const params = useParams<{ data: string }>();
  const [card, setCard] = useState<ShareableCard | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!params.data) { setInvalid(true); return; }
    const decoded = decodeCard(params.data);
    if (!decoded) { setInvalid(true); return; }
    setCard(decoded);
  }, [params.data]);

  const downloadImage = async () => {
    if (!captureRef.current) return;
    setDownloading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(captureRef.current, { backgroundColor: '#262421', scale: 2, useCORS: true });
      const link = document.createElement('a');
      link.download = `chessscout-${card?.type ?? 'card'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      // fail silently — the link itself remains fully shareable regardless
    }
    setDownloading(false);
  };

  if (invalid) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-sm" style={{ color: TEXT_MUTED }}>This link looks broken or incomplete.</p>
        <Link href="/" className="inline-block mt-4 text-sm font-semibold" style={{ color: CHESSCOM_GREEN }}>
          Visit ChessScout.net →
        </Link>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: CHESSCOM_GREEN }} />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-5">
      <PageHero piece="♟" eyebrow="ChessScout.net" title="Shared achievement" />

      <div ref={captureRef} className="p-4 rounded-2xl" style={{ background: '#262421' }}>
        <div className="rounded-2xl p-2" style={{ background: 'linear-gradient(180deg, #383532 0%, #2a2825 100%)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <CardContent card={card} />
          <div className="flex items-center justify-center gap-1.5 pb-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: BRASS }}>chessscout.net</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={downloadImage}
          disabled={downloading}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
          style={{ background: 'rgba(255,255,255,0.06)', color: TEXT_LIGHT, border: '1px solid rgba(255,255,255,0.1)' }}
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Download as image
        </button>
        <Link href="/"
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black"
          style={{ background: `linear-gradient(180deg, #95c45a 0%, ${CHESSCOM_GREEN} 100%)`, color: 'white' }}
        >
          <UserPlus className="w-4 h-4" />
          Try ChessScout.net
        </Link>
      </div>
    </div>
  );
}
