import { Router, type IRouter, type Request, type Response } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { getUserRatings, listTimeControls, getActiveGameForUser } from '../lib/liveServer';

const router: IRouter = Router();

router.get('/live/time-controls', (_req: Request, res: Response) => {
  res.json({ timeControls: listTimeControls() });
});

router.get('/live/ratings', requireAuth, async (req: Request, res: Response) => {
  try {
    const ratings = await getUserRatings(req.user!.id);
    res.json({ ratings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load ratings' });
  }
});

router.get('/live/active-game', requireAuth, (req: Request, res: Response) => {
  const result = getActiveGameForUser(req.user!.id);
  if (!result) { res.json({ game: null }); return; }
  res.json({ game: result.state, color: result.color });
});

export default router;
