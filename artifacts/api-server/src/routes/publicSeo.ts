import { Router, type IRouter, type Request, type Response } from "express";
import { getSeoPage, availableLangs, SEO_PAGES, VS_PAGES, langFromPrefix, localizedPath } from "../lib/seoPages";
import { listOpenings, getOpening, listTraps, getTrap } from "../lib/publicChessPages";

const router: IRouter = Router();

// Public, no login: the search-friendly pages (/play-chess-online,
// /chess-for-kids, /es/..., /chess-openings/<slug>, /chess-traps/<slug>).
// Read by the Vercel page renderer and by the app's own public pages.

const cache = (res: Response) => res.set("Cache-Control", "public, max-age=600");

router.get("/public/seo/pages", async (_req: Request, res: Response) => {
  try {
    const langs = await availableLangs();
    cache(res);
    res.json({
      pages: SEO_PAGES.map((p) => ({ key: p.key, path: p.path, translate: p.translate, langs: langs[p.key] ?? ["en"],
        alternates: (langs[p.key] ?? ["en"]).map((l) => ({ lang: l, path: localizedPath(p, l) })) })),
      vs: VS_PAGES.map((v) => v.path),
    });
  } catch { res.status(500).json({ error: "Failed to load pages" }); }
});

router.get("/public/seo/page/:key", async (req: Request, res: Response) => {
  try {
    const lang = langFromPrefix(String(req.query.lang ?? "en")) ?? "en";
    const page = await getSeoPage(String(req.params.key ?? ""), lang);
    if (!page) { res.status(404).json({ error: "Not found" }); return; }
    cache(res);
    res.json({ page });
  } catch { res.status(500).json({ error: "Failed to load page" }); }
});

router.get("/public/seo/vs", (req: Request, res: Response) => {
  const v = VS_PAGES.find((x) => x.path === String(req.query.path ?? ""));
  if (!v) { res.status(404).json({ error: "Not found" }); return; }
  cache(res);
  res.json({ page: v });
});

router.get("/public/openings", async (_req: Request, res: Response) => {
  try { cache(res); res.json({ openings: await listOpenings() }); }
  catch { res.status(500).json({ error: "Failed to load openings" }); }
});

router.get("/public/openings/:slug", async (req: Request, res: Response) => {
  try {
    const o = await getOpening(String(req.params.slug ?? "").toLowerCase());
    if (!o) { res.status(404).json({ error: "Not found" }); return; }
    cache(res);
    res.json({ opening: o });
  } catch { res.status(500).json({ error: "Failed to load opening" }); }
});

router.get("/public/traps", async (_req: Request, res: Response) => {
  try { cache(res); res.json({ traps: await listTraps() }); }
  catch { res.status(500).json({ error: "Failed to load traps" }); }
});

router.get("/public/traps/:slug", async (req: Request, res: Response) => {
  try {
    const t = await getTrap(String(req.params.slug ?? "").toLowerCase());
    if (!t) { res.status(404).json({ error: "Not found" }); return; }
    cache(res);
    res.json({ trap: t });
  } catch { res.status(500).json({ error: "Failed to load trap" }); }
});

export default router;
