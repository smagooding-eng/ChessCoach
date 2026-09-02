import { type Request, type Response, type NextFunction } from "express";
import type { SessionUser } from "../lib/auth";
import {
  ADMIN_EMAILS,
  clearSession,
  getSessionId,
  getSession,
} from "../lib/auth";
declare global {
  namespace Express {
    interface User extends SessionUser {}
    interface Request {
      isAuthenticated(): this is AuthedRequest;
      user?: User | undefined;
    }
    export interface AuthedRequest {
      user: User;
    }
  }
}
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];
  const sid = getSessionId(req);
  if (!sid) {
    next();
    return;
  }
  const session = await getSession(sid);
  if (!session?.user?.id) {
    await clearSession(res, sid);
    next();
    return;
  }
  req.user = session.user;
  next();
}
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    const { storage } = await import("../lib/storage");
    const user = await storage.getUser(req.user!.id);
    if (user?.isAdmin || ADMIN_EMAILS.includes(user?.email?.toLowerCase?.() ?? "")) {
      next();
      return;
    }
    res.status(403).json({ error: "Admin access required" });
  } catch {
    res.status(500).json({ error: "Failed to verify admin access" });
  }
}
// Extracted from requirePremium's own logic so other routes (e.g. the
// chess traps paywall, which needs to check status without blocking
// the whole request the way a middleware would) can reuse the exact
// same check rather than duplicating it and risking drift.
export async function isUserPremium(userId: string): Promise<boolean> {
  const { storage } = await import("../lib/storage");
  const user = await storage.getUser(userId);
  if (user?.isAdmin || ADMIN_EMAILS.includes(user?.email?.toLowerCase?.() ?? "")) {
    return true;
  }
  if (user?.stripeCustomerId) {
    let sub: any = null;
    try {
      sub = await storage.getSubscriptionByCustomerId(user.stripeCustomerId);
    } catch {
      try {
        const { getUncachableStripeClient } = await import("../lib/stripeClient");
        const stripe = await getUncachableStripeClient();
        const subs = await stripe.subscriptions.list({
          customer: user.stripeCustomerId,
          status: 'all',
          limit: 1,
        });
        if (subs.data.length > 0) sub = subs.data[0];
      } catch {}
    }
    if (sub && ["active", "trialing"].includes(sub.status as string)) {
      return true;
    }
  }
  return false;
}
export async function requirePremium(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    const premium = await isUserPremium(req.user!.id);
    if (premium) {
      next();
      return;
    }
    res.status(403).json({ error: "Premium subscription required" });
  } catch {
    res.status(500).json({ error: "Failed to check subscription" });
  }
}
