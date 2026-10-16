import { Router, type IRouter, type Request, type Response } from "express";
import { listPublicPlayers, getPublicPlayer } from "../lib/publicPlayers";

const router: IRouter = Router();

// Public, no login: the player pages at chessscout.net/players. Only players on
// our list are served (not arbitrary usernames), so these can't be used to
// make us hammer Chess.com.
router.get("/public/players", async (_req: Request, res: Response) => {
  try {
    res.set("Cache-Control", "public, max-age=600");
    res.json({ players: await listPublicPlayers() });
  } catch {
    res.status(500).json({ error: "Failed to load players" });
  }
});

router.get("/public/players/:slug", async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug ?? "").toLowerCase();
    if (!/^[a-z0-9_-]{2,40}$/.test(slug)) { res.status(404).json({ error: "Not found" }); return; }
    const p = await getPublicPlayer(slug);
    if (!p) { res.status(404).json({ error: "Not found" }); return; }
    res.set("Cache-Control", "public, max-age=600");
    res.json(p);
  } catch {
    res.status(500).json({ error: "Failed to load player" });
  }
});

export default router;
