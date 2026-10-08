import { Router, type IRouter, type Request, type Response } from "express";
import { isDashboardRedesignEnabled, setDashboardRedesignEnabled, isPhotoImagesEnabled, setPhotoImagesEnabled } from "../lib/appConfig";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated() || !req.user?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

// Public -- every client (logged in or not) needs to know this to decide
// which version of Home/Games/Analysis to render. Not a secret, and
// gating it behind auth would just mean logged-out visitors can't even
// load the landing experience correctly.
router.get("/app-config/dashboard-redesign", async (_req: Request, res: Response) => {
  try {
    const enabled = await isDashboardRedesignEnabled();
    res.json({ enabled });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load config", details: err.cause?.message ?? err.message });
  }
});

router.post("/admin/app-config/dashboard-redesign", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body as { enabled?: boolean };
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled (boolean) is required" });
      return;
    }
    await setDashboardRedesignEnabled(enabled, req.user!.id);
    res.json({ enabled });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update config", details: err.cause?.message ?? err.message });
  }
});

// Public, like the redesign flag: every visitor needs it to pick which images to show.
router.get("/app-config/photo-images", async (_req: Request, res: Response) => {
  try {
    res.json({ enabled: await isPhotoImagesEnabled() });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load config", details: err.cause?.message ?? err.message });
  }
});

router.post("/admin/app-config/photo-images", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body as { enabled?: boolean };
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled (boolean) is required" });
      return;
    }
    await setPhotoImagesEnabled(enabled, req.user!.id);
    res.json({ enabled });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update config", details: err.cause?.message ?? err.message });
  }
});

export default router;
