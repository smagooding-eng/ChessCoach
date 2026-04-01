import { type Request, type Response, type NextFunction } from "express";
import type { SessionUser } from "../lib/auth";
import {
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

const FREE_TRIAL_DAYS = 3;

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
    const { storage } = await import("../lib/storage");
    const user = await storage.getUser(req.user!.id);

    if (user?.isAdmin) {
      next();
      return;
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
        next();
        return;
      }
    }

    if (user?.createdAt) {
      const created = new Date(user.createdAt);
      const elapsed = Date.now() - created.getTime();
      if (elapsed < FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000) {
        next();
        return;
      }
    }

    res.status(403).json({ error: "Premium subscription required" });
  } catch {
    res.status(500).json({ error: "Failed to check subscription" });
  }
}
