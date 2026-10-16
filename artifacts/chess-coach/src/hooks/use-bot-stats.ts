import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

// Practice-bot records: your wins/losses/draws against each bot, and how many
// different players have beaten each one. Shared cache so every bot card reads
// the same numbers; refreshed after each finished game.

export interface BotRecord { wins: number; losses: number; draws: number }
export interface BotStats { beatenBy: Record<string, number>; mine: Record<string, BotRecord> }

let cache: BotStats | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<(s: BotStats) => void>();

export function refreshBotStats(): Promise<void> {
  if (inflight) return inflight;
  inflight = apiFetch('/api/bots/stats')
    .then((r) => (r.ok ? r.json() : null))
    .then((d: BotStats | null) => {
      if (d) { cache = { beatenBy: d.beatenBy ?? {}, mine: d.mine ?? {} }; listeners.forEach((l) => l(cache!)); }
    })
    .catch(() => { /* cards just show no stats */ })
    .finally(() => { inflight = null; });
  return inflight;
}

export function useBotStats(): BotStats | null {
  const [s, setS] = useState<BotStats | null>(cache);
  useEffect(() => {
    listeners.add(setS);
    if (!cache) void refreshBotStats(); else setS(cache);
    return () => { listeners.delete(setS); };
  }, []);
  return s;
}

/** Save a finished game against a bot (once per game), then refresh the cards. */
export function reportBotResult(bot: string, result: 'win' | 'loss' | 'draw', moves: number, gameKey: string,
  game?: { pgn: string; color: 'w' | 'b'; botRating: number }): void {
  apiFetch('/api/bots/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // pgn/color/botRating: the game itself is kept too (Games tab > Bots)
    body: JSON.stringify({ bot, result, moves, gameKey, ...(game ?? {}) }),
  })
    .then(() => refreshBotStats())
    .catch(() => { /* best effort */ });
}
