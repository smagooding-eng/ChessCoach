import { useState, useEffect } from 'react';

type ChessPlayer = {
  avatar?: string;
  username: string;
  name?: string;
  title?: string;
  rating?: number;
};

const cache = new Map<string, ChessPlayer>();
const pending = new Map<string, Promise<ChessPlayer>>();

async function fetchChessPlayer(username: string): Promise<ChessPlayer> {
  const key = username.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  if (pending.has(key)) return pending.get(key)!;

  const promise = Promise.all([
    fetch(`https://api.chess.com/pub/player/${key}`).then(r => r.ok ? r.json() : {}),
    fetch(`https://api.chess.com/pub/player/${key}/stats`).then(r => r.ok ? r.json() : {}),
  ]).then(([profile, stats]: [Record<string, unknown>, Record<string, unknown>]) => {
    const rapidStats = stats['chess_rapid'] as { last?: { rating?: number } } | undefined;
    const blitzStats = stats['chess_blitz'] as { last?: { rating?: number } } | undefined;
    const bulletStats = stats['chess_bullet'] as { last?: { rating?: number } } | undefined;
    const rating =
      rapidStats?.last?.rating ??
      blitzStats?.last?.rating ??
      bulletStats?.last?.rating;

    const player: ChessPlayer = {
      username: (profile['username'] as string) ?? username,
      avatar: profile['avatar'] as string | undefined,
      name: profile['name'] as string | undefined,
      title: profile['title'] as string | undefined,
      rating,
    };
    cache.set(key, player);
    pending.delete(key);
    return player;
  }).catch(() => {
    const fallback: ChessPlayer = { username };
    cache.set(key, fallback);
    pending.delete(key);
    return fallback;
  });

  pending.set(key, promise);
  return promise;
}

export function useChessPlayer(username: string | undefined) {
  const [player, setPlayer] = useState<ChessPlayer | null>(() => {
    if (!username) return null;
    return cache.get(username.toLowerCase()) ?? null;
  });
  const [loading, setLoading] = useState(!player && !!username);

  useEffect(() => {
    if (!username) return;
    const key = username.toLowerCase();
    if (cache.has(key)) {
      setPlayer(cache.get(key)!);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchChessPlayer(username).then(p => {
      setPlayer(p);
      setLoading(false);
    });
  }, [username]);

  return { player, loading };
}
