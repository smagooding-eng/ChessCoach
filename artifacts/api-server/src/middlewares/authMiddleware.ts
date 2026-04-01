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

    if (!user?.stripeCustomerId) {
      res.status(403).json({ error: "Premium subscription required" });
      return;
    }

    const sub = await storage.getSubscriptionByCustomerId(user.stripeCustomerId);
    if (!sub || !["active", "trialing"].includes(sub.status)) {
      res.status(403).json({ error: "Premium subscription required" });
      return;
    }

    next();
  } catch {
    res.status(500).json({ error: "Failed to check subscription" });
  }
}
