import { Router, type IRouter, type Request, type Response } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { getUserRatings, listTimeControls, getActiveGameForUser, getUserLiveHistory, seedRatingFromOnboardingGame, liveActivity } from '../lib/liveServer';
import { listOpenApps } from '../lib/notify';
import { nextLiveHour } from '../lib/officialTournaments';
import { getDailyRating } from '../lib/correspondence';

const router: IRouter = Router();

// Who's around right now (real people only; you aren't counted), plus the
// next Live Hour, for the "players online" line on Play and Home.
router.get('/live/online', async (req: Request, res: Response) => {
  try {
    const me = (req as Request & { user?: { id?: string } }).user?.id ?? null;
    const online = new Set(listOpenApps().map((a) => a.userId));
    const { searching, playing } = liveActivity();
    for (const u of [...searching, ...playing]) online.add(u);
    if (me) online.delete(me);
    const others = (l: string[]) => l.filter((u) => u !== me).length;
    res.set('Cache-Control', 'no-store');
    res.json({ online: online.size, searching: others(searching), playing: others(playing), liveHour: await nextLiveHour().catch(() => null) });
  } catch {
    res.json({ online: 0, searching: 0, playing: 0, liveHour: null });
  }
});

router.get('/live/time-controls', (_req: Request, res: Response) => {
  res.json({ timeControls: listTimeControls() });
});

router.post('/live/onboarding-seed', requireAuth, async (req: Request, res: Response) => {
  const outcome = req.body?.outcome;
  if (outcome !== 'win' && outcome !== 'loss' && outcome !== 'draw') {
    res.status(400).json({ error: "outcome must be 'win', 'loss', or 'draw'" });
    return;
  }
  try {
    const rating = await seedRatingFromOnboardingGame(req.user!.id, outcome);
    res.json({ rating });
  } catch (err) {
    res.status(500).json({ error: 'Failed to seed rating' });
  }
});

router.get('/live/ratings', requireAuth, async (req: Request, res: Response) => {
  try {
    const ratings = await getUserRatings(req.user!.id);
    // Daily games share one rating across 1 / 3 / 7 days.
    const daily = await getDailyRating(req.user!.id);
    res.json({ ratings: { ...ratings, daily } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load ratings' });
  }
});

router.get('/live/history', requireAuth, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
    const games = await getUserLiveHistory(req.user!.id, limit);
    res.json({ games });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load history' });
  }
});

router.get('/live/active-game', requireAuth, (req: Request, res: Response) => {
  const result = getActiveGameForUser(req.user!.id);
  if (!result) { res.json({ game: null }); return; }
  res.json({ game: result.state, color: result.color });
});

export default router;
