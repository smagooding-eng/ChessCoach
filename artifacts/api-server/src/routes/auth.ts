import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, referralConversionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { storage } from "../lib/storage";
import crypto from "crypto";
import {
  clearSession,
  getSessionId,
  createSession,
  setSessionCookie,
  ADMIN_EMAILS,
  type SessionData,
  type SessionUser,
} from "../lib/auth";

const FRONTEND_URL = process.env.CORS_ORIGIN || "";

const router: IRouter = Router();

function getOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host =
    req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
}

function toSessionUser(dbUser: any): SessionUser {
  return {
    id: dbUser.id,
    email: dbUser.email,
    firstName: dbUser.firstName,
    lastName: dbUser.lastName,
    profileImageUrl: dbUser.profileImageUrl,
    chesscomUsername: dbUser.chesscomUsername,
    lichessUsername: dbUser.lichessUsername || null,
    isAdmin: dbUser.isAdmin || ADMIN_EMAILS.includes(dbUser.email?.toLowerCase?.() ?? ""),
    inviteCode: dbUser.inviteCode || null,
  };
}

router.get("/auth/user", (req: Request, res: Response) => {
  res.json({
    user: req.isAuthenticated() ? req.user : null,
  });
});

function generateInviteCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

router.post("/auth/register", async (req: Request, res: Response) => {
  const { email, password, firstName, chesscomUsername, referralCode } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  try {
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));

    if (existing) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    let referrerUserId: string | null = null;
    if (referralCode) {
      const [referrer] = await db.select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.inviteCode, referralCode.toUpperCase().trim()));
      if (referrer) referrerUserId = referrer.id;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [user] = await db
      .insert(usersTable)
      .values({
        email,
        passwordHash,
        authProvider: "local",
        firstName: firstName || null,
        chesscomUsername: chesscomUsername || null,
        isAdmin: ADMIN_EMAILS.includes(email.toLowerCase()),
        referredByUserId: referrerUserId,
        lastLoginAt: new Date(),
      })
      .returning();

    if (referrerUserId) {
      await db.insert(referralConversionsTable).values({
        referrerUserId,
        referredUserId: user.id,
        status: "signed_up",
      });
    }

    const sessionData: SessionData = { user: toSessionUser(user) };
    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);

    res.json({ user: toSessionUser(user), token: sid });
  } catch (err: any) {
    req.log?.error?.({ err }, "Registration error");
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/auth/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));

    if (!user || !user.passwordHash) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));

    const sessionData: SessionData = { user: toSessionUser(user) };
    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);

    res.json({ user: toSessionUser(user), token: sid });
  } catch (err: any) {
    req.log?.error?.({ err }, "Login error");
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/auth/google/status", (_req: Request, res: Response) => {
  res.json({ available: !!process.env.GOOGLE_CLIENT_ID });
});

router.get("/auth/google", (req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.redirect(FRONTEND_URL + "/setup?error=google_not_configured");
    return;
  }

  const origin = getOrigin(req);
  const redirectUri = `${origin}/api/auth/google/callback`;
  const refCode = (req.query.ref as string) || '';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    state: refCode ? `ref:${refCode}` : 'none',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get("/auth/google/callback", async (req: Request, res: Response) => {
  const { code } = req.query;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!code || !clientId || !clientSecret) {
    res.redirect(FRONTEND_URL + "/?error=google_auth_failed");
    return;
  }

  try {
    const origin = getOrigin(req);
    const redirectUri = `${origin}/api/auth/google/callback`;
    const stateParam = (req.query.state as string) || '';
    const googleRefCode = stateParam.startsWith('ref:') ? stateParam.slice(4) : '';

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: code as string,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      res.redirect(FRONTEND_URL + "/?error=google_auth_failed");
      return;
    }

    const tokens = await tokenRes.json() as any;

    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoRes.ok) {
      res.redirect(FRONTEND_URL + "/?error=google_auth_failed");
      return;
    }

    const profile = await userInfoRes.json() as any;

    let [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.googleId, profile.id));

    if (!user) {
      const [existingByEmail] = profile.email
        ? await db.select().from(usersTable).where(eq(usersTable.email, profile.email))
        : [null];

      if (existingByEmail) {
        [user] = await db
          .update(usersTable)
          .set({
            googleId: profile.id,
            authProvider: existingByEmail.authProvider === "local" ? "local+google" : "google",
            profileImageUrl: profile.picture || existingByEmail.profileImageUrl,
            firstName: existingByEmail.firstName || profile.given_name,
            lastName: existingByEmail.lastName || profile.family_name,
            lastLoginAt: new Date(),
          })
          .where(eq(usersTable.id, existingByEmail.id))
          .returning();
      } else {
        let googleReferrerUserId: string | null = null;
        if (googleRefCode) {
          const [referrer] = await db.select({ id: usersTable.id })
            .from(usersTable)
            .where(eq(usersTable.inviteCode, googleRefCode.toUpperCase().trim()));
          if (referrer) googleReferrerUserId = referrer.id;
        }
        [user] = await db
          .insert(usersTable)
          .values({
            email: profile.email,
            googleId: profile.id,
            authProvider: "google",
            firstName: profile.given_name || null,
            lastName: profile.family_name || null,
            profileImageUrl: profile.picture || null,
            referredByUserId: googleReferrerUserId,
            lastLoginAt: new Date(),
          })
          .returning();
        if (googleReferrerUserId) {
          await db.insert(referralConversionsTable).values({
            referrerUserId: googleReferrerUserId,
            referredUserId: user.id,
            status: "signed_up",
          });
        }
      }
    } else {
      await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
    }

    const sessionData: SessionData = { user: toSessionUser(user) };
    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);

    res.redirect(FRONTEND_URL + "/#token=" + sid);
  } catch (err: any) {
    req.log?.error?.({ err }, "Google callback error");
    res.redirect(FRONTEND_URL + "/?error=google_auth_failed");
  }
});

router.post("/auth/update-profile", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { chesscomUsername, firstName, lichessUsername } = req.body;

  try {
    const updates: Record<string, any> = {};
    if (chesscomUsername !== undefined) updates.chesscomUsername = chesscomUsername;
    if (lichessUsername !== undefined) updates.lichessUsername = lichessUsername;
    if (firstName !== undefined) updates.firstName = firstName;

    if (Object.keys(updates).length === 0) {
      res.json({ user: req.user });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, req.user!.id))
      .returning();

    const sessionUser = toSessionUser(updated);
    const sid = getSessionId(req);
    if (sid) {
      const { updateSession } = await import("../lib/auth");
      await updateSession(sid, { user: sessionUser });
    }
    req.user = sessionUser as any;

    res.json({ user: sessionUser });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update profile" });
  }
});

router.get("/auth/referrals", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const userId = req.user.id;
    const [user] = await db.select({ inviteCode: usersTable.inviteCode, stripeCustomerId: usersTable.stripeCustomerId, isPremiumOverride: usersTable.isPremiumOverride }).from(usersTable).where(eq(usersTable.id, userId));

    let isPaid = !!user?.isPremiumOverride;
    if (!isPaid && user?.stripeCustomerId) {
      try {
        const sub = await storage.getSubscriptionByCustomerId(user.stripeCustomerId);
        if (sub && sub.status === 'active') isPaid = true;
      } catch {
        try {
          const { getUncachableStripeClient } = await import('../lib/stripeClient');
          const stripe = await getUncachableStripeClient();
          const subs = await stripe.subscriptions.list({ customer: user.stripeCustomerId, status: 'active', limit: 1 });
          if (subs.data.length > 0) isPaid = true;
        } catch {}
      }
    }

    const referrals = await db.select({
      id: referralConversionsTable.id,
      referredUserId: referralConversionsTable.referredUserId,
      status: referralConversionsTable.status,
      createdAt: referralConversionsTable.createdAt,
      convertedAt: referralConversionsTable.convertedAt,
    }).from(referralConversionsTable)
      .where(sql`${referralConversionsTable.referrerUserId} = ${userId}`);

    const referredUsers = referrals.length > 0
      ? await db.select({ id: usersTable.id, firstName: usersTable.firstName, chesscomUsername: usersTable.chesscomUsername })
        .from(usersTable)
        .where(sql`${usersTable.id} IN (${sql.join(referrals.map(r => sql`${r.referredUserId}`), sql`, `)})`)
      : [];

    const referralDetails = referrals.map(r => {
      const referred = referredUsers.find(u => u.id === r.referredUserId);
      return {
        id: r.id,
        status: r.status,
        createdAt: r.createdAt,
        convertedAt: r.convertedAt,
        referredName: referred?.firstName ?? referred?.chesscomUsername ?? "A friend",
      };
    });

    res.json({
      inviteCode: isPaid ? (user?.inviteCode ?? null) : null,
      isPaid,
      totalReferred: referrals.length,
      totalConverted: referrals.filter(r => r.status === "converted").length,
      referrals: referralDetails,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to get referral data" });
  }
});

router.get("/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.redirect(FRONTEND_URL + "/");
});

router.post("/auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.json({ success: true });
});

export default router;
