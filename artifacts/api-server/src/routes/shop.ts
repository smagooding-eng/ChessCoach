import { Router, type IRouter, type Request, type Response } from "express";
import { db, shopItemsTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";

const router: IRouter = Router();

// Matches the same local requireAdmin pattern used in admin.ts and
// landingFunnel.ts -- it isn't exported from authMiddleware.ts, so each
// route file that needs it defines its own.
function requireAdmin(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated() || !req.user?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

// Public -- just product links, nothing sensitive. The /shop page itself
// is behind ProtectedRoute client-side (consistent with Puzzles, Traps,
// Endgames), but the underlying data has no reason to require auth at
// the API level.
router.get("/shop", async (_req: Request, res: Response) => {
  try {
    const items = await db.select().from(shopItemsTable).orderBy(asc(shopItemsTable.sortOrder), asc(shopItemsTable.createdAt));
    res.json({ items });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load shop items" });
  }
});

// Admin: same list, but admin-scoped route so the management panel
// doesn't depend on the public route's shape ever staying compatible.
router.get("/admin/shop-items", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const items = await db.select().from(shopItemsTable).orderBy(asc(shopItemsTable.sortOrder), asc(shopItemsTable.createdAt));
    res.json({ items });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load shop items" });
  }
});

router.post("/admin/shop-items", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { title, description, imageUrl, amazonUrl, priceLabel, sortOrder } = req.body as {
      title?: string; description?: string; imageUrl?: string; amazonUrl?: string; priceLabel?: string; sortOrder?: number;
    };
    if (!title?.trim() || !amazonUrl?.trim()) {
      res.status(400).json({ error: "title and amazonUrl are required" });
      return;
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(amazonUrl.trim());
    } catch {
      res.status(400).json({ error: "amazonUrl must be a valid URL" });
      return;
    }
    // Not a hard requirement (some legitimate short-link forms exist),
    // but flagged so a paste mistake doesn't silently ship a non-Amazon
    // or non-affiliate link.
    if (!/(^|\.)amazon\.[a-z.]+$/i.test(parsedUrl.hostname) && !/^amzn\.to$/i.test(parsedUrl.hostname)) {
      res.status(400).json({ error: `That URL's domain (${parsedUrl.hostname}) doesn't look like Amazon -- double-check it's the right affiliate link before saving.` });
      return;
    }

    const [created] = await db.insert(shopItemsTable).values({
      title: title.trim(),
      description: description?.trim() || null,
      imageUrl: imageUrl?.trim() || null,
      amazonUrl: amazonUrl.trim(),
      priceLabel: priceLabel?.trim() || null,
      sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
    }).returning();
    res.json({ item: created });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create shop item" });
  }
});

router.put("/admin/shop-items/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, imageUrl, amazonUrl, priceLabel, sortOrder } = req.body as {
      title?: string; description?: string; imageUrl?: string; amazonUrl?: string; priceLabel?: string; sortOrder?: number;
    };
    if (amazonUrl !== undefined) {
      try {
        new URL(amazonUrl);
      } catch {
        res.status(400).json({ error: "amazonUrl must be a valid URL" });
        return;
      }
    }
    const updates: Partial<typeof shopItemsTable.$inferInsert> = {};
    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description.trim() || null;
    if (imageUrl !== undefined) updates.imageUrl = imageUrl.trim() || null;
    if (amazonUrl !== undefined) updates.amazonUrl = amazonUrl.trim();
    if (priceLabel !== undefined) updates.priceLabel = priceLabel.trim() || null;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    const [updated] = await db.update(shopItemsTable).set(updates).where(eq(shopItemsTable.id, id)).returning();
    if (!updated) {
      res.status(404).json({ error: "Shop item not found" });
      return;
    }
    res.json({ item: updated });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update shop item" });
  }
});

router.delete("/admin/shop-items/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [deleted] = await db.delete(shopItemsTable).where(eq(shopItemsTable.id, id)).returning();
    if (!deleted) {
      res.status(404).json({ error: "Shop item not found" });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete shop item" });
  }
});

export default router;
