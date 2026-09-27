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

// Best-effort HTML meta-tag scraper -- pulls the same Open Graph tags a
// social-media link preview reads (og:title, og:description, og:image),
// plus a couple of Amazon-specific price patterns, so an admin can paste
// just the affiliate link instead of typing everything by hand.
//
// No HTML-parsing library here (none was already a dependency, and adding
// one means touching package.json/the lockfile, which isn't safe to do
// blind without being able to run an install) -- plain regex against the
// raw HTML instead. That's fragile against future markup changes on
// Amazon's end, and Amazon is known to rate-limit or block server-side
// requests outright sometimes -- this returns whatever it can find, with
// nulls for anything it can't, and the admin UI treats every field as
// still editable rather than trusting this blindly.
function extractMetaContent(html: string, property: string): string | null {
  // Handles both attribute orders (property-then-content and vice versa),
  // since real-world markup isn't consistent about it.
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property}["']`, "i"),
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (match?.[1]) return decodeHtmlEntities(match[1]);
  }
  return null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function extractPrice(html: string): string | null {
  // Amazon embeds price in a few different ways depending on the page
  // template -- tries the most common ones in order, first match wins.
  const patterns = [
    /"priceAmount"\s*:\s*([\d.]+)/i,
    /<span[^>]*class="[^"]*a-offscreen[^"]*"[^>]*>\s*\$?([\d,]+\.\d{2})/i,
    /"price"\s*:\s*"?\$?([\d,]+\.\d{2})"?/i,
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (match?.[1]) return `$${match[1].replace(/,/g, "")}`;
  }
  return null;
}

router.post("/admin/shop-items/fetch-preview", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { url } = req.body as { url?: string };
    if (!url?.trim()) {
      res.status(400).json({ error: "url is required" });
      return;
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url.trim());
    } catch {
      res.status(400).json({ error: "That's not a valid URL." });
      return;
    }

    let response: globalThis.Response;
    try {
      response = await fetch(parsedUrl.toString(), {
        // A realistic browser identity -- doesn't guarantee Amazon won't
        // block this, but a generic "node-fetch"-style default UA gets
        // blocked essentially every time, so this at least gives it a
        // real shot.
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
      });
    } catch (fetchErr: any) {
      res.status(502).json({ error: "Couldn't reach that URL. It may be down, or blocking automated requests -- you can still fill in the details manually below." });
      return;
    }

    if (!response.ok) {
      res.status(502).json({ error: `That page returned an error (HTTP ${response.status}). Amazon may be blocking this request -- you can still fill in the details manually below.` });
      return;
    }

    const html = await response.text();

    // A blocked/CAPTCHA'd request usually still returns HTTP 200 with a
    // page that has none of the real product markup -- catch that case
    // explicitly rather than returning a confusing "success" with every
    // field empty.
    const title = extractMetaContent(html, "og:title") ?? (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? null);
    const description = extractMetaContent(html, "og:description")
      ?? extractMetaContent(html, "description")
      ?? null;
    const imageUrl = extractMetaContent(html, "og:image");
    const priceLabel = extractPrice(html);

    if (!title && !imageUrl) {
      res.status(200).json({
        title: null, description: null, imageUrl: null, priceLabel: null,
        warning: "Couldn't find product details on that page -- Amazon may have blocked this request or served a CAPTCHA. Please fill in the fields manually.",
      });
      return;
    }

    res.json({
      title: title ? decodeHtmlEntities(title.trim()) : null,
      description: description ? decodeHtmlEntities(description.trim()).slice(0, 500) : null,
      imageUrl,
      priceLabel,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch preview." });
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
    const id = String(req.params.id);
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
    const id = String(req.params.id);
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
