import { Router, type IRouter, type Request, type Response } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { getUserRatings, listTimeControls, getActiveGameForUser, getUserLiveHistory, seedRatingFromOnboardingGame } from '../lib/liveServer';

const router: IRouter = Router();

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
    res.json({ ratings });
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
