// /last-game (the "Review my last game" home-screen shortcut): opens the newest game's review.
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useMyGames } from '@/hooks/use-games';

export default function LastGamePage() {
  const { data } = useMyGames(1);
  const [, navigate] = useLocation();
  useEffect(() => {
    if (data === undefined) return;
    const g = data?.games?.[0];
    navigate(g ? `/games/${g.id}` : '/games', { replace: true });
  }, [data, navigate]);
  return null;
}
