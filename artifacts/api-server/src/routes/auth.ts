import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, referralConversionsTable, emailDripLogTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { storage } from "../lib/storage";
import { sendEmail, welcomeEmailHtml } from "../lib/email";
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
    emailVerified: !!dbUser.emailVerified || dbUser.authProvider === "google" || dbUser.authProvider === "local+google",
  };
}

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// Reject emails whose local-part is all digits (e.g., 123@gmail.com), starts/ends with dot, or has consecutive dots.
function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length > 254) return false;
  if (!EMAIL_REGEX.test(trimmed)) return false;
  const [local, domain] = trimmed.split("@");
  if (!local || !domain) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return false;
  if (domain.includes("--")) return false;
  // Domain must have a TLD of at least 2 letters
  const tld = domain.split(".").pop() || "";
  if (tld.length < 2) return false;
  return true;
}

function validatePassword(password: string): string | null {
  if (typeof password !== "string") return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  if (password.length > 128) return "Password is too long";
  if (!/[A-Za-z]/.test(password)) return "Password must contain at least one letter";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number";
  return null;
}

function verificationEmailHtml(name: string | null, verifyUrl: string): string {
  const greeting = name || "there";
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#262421;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:24px;"><h1 style="color:#81b64c;margin:0;font-size:26px;">♜ ChessScout.net</h1></div>
    <div style="background:#302e2b;border-radius:12px;padding:30px;color:#e8e6e3;">
      <h2 style="color:#e8e6e3;margin:0 0 12px;font-size:20px;">Confirm your email, ${greeting}</h2>
      <p style="color:#9e9b98;font-size:14px;line-height:1.6;margin:0 0 20px;">Click the button below to confirm this is your email address. The link expires in 24 hours.</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${verifyUrl}" style="display:inline-block;background:#81b64c;color:#fff;text-decoration:none;padding:13px 30px;border-radius:8px;font-weight:700;font-size:15px;">Verify my email</a>
      </div>
      <p style="color:#9e9b98;font-size:12px;line-height:1.5;margin:0;">If the button doesn't work, paste this URL into your browser:<br/><span style="color:#81b64c;word-break:break-all;">${verifyUrl}</span></p>
      <p style="color:#666;font-size:12px;margin-top:18px;">If you didn't sign up for ChessScout, you can ignore this email.</p>
    </div>
  </div></body></html>`;
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
  const { email: rawEmail, password, firstName, chesscomUsername, lichessUsername, referralCode } = req.body;
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  if (!isValidEmail(email)) {
    res.status(400).json({ error: "Please enter a valid email address" });
    return;
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
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
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const [user] = await db
      .insert(usersTable)
      .values({
        email,
        passwordHash,
        authProvider: "local",
        firstName: firstName || null,
        chesscomUsername: chesscomUsername || null,
        lichessUsername: lichessUsername || null,
        isAdmin: ADMIN_EMAILS.includes(email),
        referredByUserId: referrerUserId,
        emailVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationExpires: verificationExpires,
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

    if (user.email) {
      const verifyUrl = `${getOrigin(req)}/api/auth/verify-email?token=${verificationToken}`;
      sendEmail({
        to: user.email,
        subject: "Confirm your ChessScout.net email ♜",
        html: verificationEmailHtml(user.firstName, verifyUrl),
      }).catch((err) => {
        req.log?.warn?.({ err }, "Failed to send verification email");
      });

      sendEmail({
        to: user.email,
        subject: "Welcome to ChessScout.net — Your Edge Starts Now! ♜",
        html: welcomeEmailHtml(user.firstName),
      }).then(() => {
        db.insert(emailDripLogTable).values({ userId: user.id, dripType: 'welcome' }).catch(() => {});
      }).catch(() => {});
    }
  } catch (err: any) {
    req.log?.error?.({ err }, "Registration error");
    res.status(500).json({ error: "Registration failed" });
  }
});

router.get("/auth/verify-email", async (req: Request, res: Response) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const origin = getOrigin(req);
  if (!token) {
    res.redirect(origin + "/?verify=missing");
    return;
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.emailVerificationToken, token));
    if (!user) {
      res.redirect(origin + "/?verify=invalid");
      return;
    }
    if (user.emailVerificationExpires && user.emailVerificationExpires.getTime() < Date.now()) {
      res.redirect(origin + "/?verify=expired");
      return;
    }
    await db.update(usersTable).set({
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
    }).where(eq(usersTable.id, user.id));
    res.redirect(origin + "/?verify=ok");
  } catch (err: any) {
    req.log?.error?.({ err }, "Email verification error");
    res.redirect(origin + "/?verify=error");
  }
});

router.post("/auth/resend-verification", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const userId = (req.user as SessionUser).id;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user || !user.email) {
      res.status(400).json({ error: "No email on file" });
      return;
    }
    if (user.emailVerified) {
      res.json({ ok: true, alreadyVerified: true });
      return;
    }
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.update(usersTable).set({
      emailVerificationToken: token,
      emailVerificationExpires: expires,
    }).where(eq(usersTable.id, user.id));
    const verifyUrl = `${getOrigin(req)}/api/auth/verify-email?token=${token}`;
    await sendEmail({
      to: user.email,
      subject: "Confirm your ChessScout.net email ♜",
      html: verificationEmailHtml(user.firstName, verifyUrl),
    });
    res.json({ ok: true });
  } catch (err: any) {
    req.log?.error?.({ err }, "Resend verification error");
    res.status(500).json({ error: "Failed to resend verification email" });
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
  const callbackOrigin = getOrigin(req);

  if (!code || !clientId || !clientSecret) {
    res.redirect(callbackOrigin + "/?error=google_auth_failed");
    return;
  }

  try {
    const origin = callbackOrigin;
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
      res.redirect(callbackOrigin + "/?error=google_auth_failed");
      return;
    }

    const tokens = await tokenRes.json() as any;

    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoRes.ok) {
      res.redirect(callbackOrigin + "/?error=google_auth_failed");
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

        if (user.email) {
          sendEmail({
            to: user.email,
            subject: "Welcome to ChessScout.net — Your Edge Starts Now! ♜",
            html: welcomeEmailHtml(user.firstName),
          }).then(() => {
            db.insert(emailDripLogTable).values({ userId: user.id, dripType: 'welcome' }).catch(() => {});
          }).catch(() => {});
        }
      }
    } else {
      await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
    }

    const sessionData: SessionData = { user: toSessionUser(user) };
    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);

    res.redirect(callbackOrigin + "/#token=" + sid);
  } catch (err: any) {
    req.log?.error?.({ err }, "Google callback error");
    res.redirect(callbackOrigin + "/?error=google_auth_failed");
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
