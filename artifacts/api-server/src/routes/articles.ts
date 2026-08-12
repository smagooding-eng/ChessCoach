import { Router, type IRouter, type Request, type Response } from "express";
import { db, seoArticlesTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";

const router: IRouter = Router();

router.get("/articles", async (_req: Request, res: Response) => {
  try {
    const articles = await db.select({
      slug: seoArticlesTable.slug,
      title: seoArticlesTable.title,
      metaDescription: seoArticlesTable.metaDescription,
      createdAt: seoArticlesTable.createdAt,
    }).from(seoArticlesTable)
      .where(eq(seoArticlesTable.published, true))
      .orderBy(desc(seoArticlesTable.createdAt));
    res.json({ articles });
  } catch {
    res.status(500).json({ error: "Failed to load articles" });
  }
});

router.get("/articles/:slug", async (req: Request, res: Response) => {
  try {
    const [article] = await db.select().from(seoArticlesTable)
      .where(and(eq(seoArticlesTable.slug, req.params.slug as string), eq(seoArticlesTable.published, true)));
    if (!article) {
      res.status(404).json({ error: "Article not found" });
      return;
    }
    res.json({ article });
  } catch {
    res.status(500).json({ error: "Failed to load article" });
  }
});

export default router;
