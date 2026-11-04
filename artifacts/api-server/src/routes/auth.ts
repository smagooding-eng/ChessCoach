import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, referralConversionsTable, emailDripLogTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { storage } from "../lib/storage";
import { sendEmail, welcomeEmailHtml } from "../lib/email";
import { emailLayout, emailP, escapeHtml, EMAIL, EMAIL_FONT } from "../lib/emailTheme";
import crypto from "crypto";
import { putHandoff, takeHandoff, validHandoffCode } from "../lib/authHandoff";
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
    scoutUsername: dbUser.scoutUsername || null,
    emailOptOut: !!dbUser.emailOptOut,
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
  const greeting = name ? escapeHtml(name) : "there";
  return emailLayout({
    preheader: "Confirm your email to finish setting up ChessScout.net.",
    title: `Confirm your email, ${greeting}`,
    body: emailP("Tap the button below to confirm this is your email address. The link expires in 24 hours.", { center: true, mb: 22 }),
    cta: { label: "Verify my email", href: verifyUrl },
    afterCta: `<p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:${EMAIL.muted};font-family:${EMAIL_FONT};">If the button doesn't work, paste this link into your browser:<br><span style="color:${EMAIL.green};word-break:break-all;">${verifyUrl}</span></p>`,
    footerNote: "If you didn't sign up for ChessScout.net, you can ignore this email.",
  });
}

router.get("/auth/user", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.json({ user: null }); return; }
  // The ChessScout username can be set from another device, so read it
  // fresh rather than trusting the copy stored in this session.
  try {
    const [row] = await db.select({ scoutUsername: usersTable.scoutUsername, emailOptOut: usersTable.emailOptOut, profileImageUrl: usersTable.profileImageUrl }).from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
    if (row) {
      (req.user as any).profileImageUrl = row.profileImageUrl ?? null;
      (req.user as any).scoutUsername = row.scoutUsername ?? null;
      (req.user as any).emailOptOut = !!row.emailOptOut;
    }
  } catch { /* fall back to the session copy */ }
  touchLastActive(req.user!.id);
  res.json({ user: req.user });
});

/** Record that the player opened the app (at most once per 10 minutes). */
export function touchLastActive(userId: string): void {
  db.execute(sql`UPDATE users SET last_active_at = now() WHERE id = ${userId} AND (last_active_at IS NULL OR last_active_at < now() - interval '10 minutes')`).catch(() => {});
  db.execute(sql`INSERT INTO user_activity_days (user_id, day) VALUES (${userId}, (now() AT TIME ZONE 'UTC')::date) ON CONFLICT DO NOTHING`).catch(() => {});
}

const RESERVED_SCOUT_NAMES = new Set([
  "admin", "administrator", "root", "support", "help", "chessscout", "chessscoutnet", "chess-scout",
  "scout", "coach", "moderator", "mod", "staff", "system", "official", "team", "api", "www",
  "null", "undefined", "anonymous", "guest", "player", "bot", "stockfish",
]);

function validateScoutUsername(raw: unknown): { name?: string; error?: string } {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (name.length < 3 || name.length > 20) return { error: "Use 3 to 20 characters." };
  if (!/^[A-Za-z0-9_-]+$/.test(name)) return { error: "Letters, numbers, - and _ only." };
  if (!/[A-Za-z0-9]/.test(name[0])) return { error: "Start with a letter or number." };
  if (RESERVED_SCOUT_NAMES.has(name.toLowerCase())) return { error: "That name is reserved." };
  return { name };
}

async function scoutUsernameTaken(name: string, exceptUserId?: string): Promise<boolean> {
  const rows = await db.select({ id: usersTable.id }).from(usersTable)
    .where(sql`LOWER(${usersTable.scoutUsername}) = LOWER(${name})`).limit(1);
  return rows.length > 0 && rows[0].id !== exceptUserId;
}

router.get("/auth/scout-username/check", async (req: Request, res: Response) => {
  const v = validateScoutUsername(req.query.name);
  if (v.error) { res.json({ available: false, error: v.error }); return; }
  try {
    const taken = await scoutUsernameTaken(v.name!, req.isAuthenticated() ? req.user!.id : undefined);
    res.json(taken ? { available: false, error: "That username is taken." } : { available: true });
  } catch {
    res.status(500).json({ available: false, error: "Couldn't check right now." });
  }
});

router.post("/auth/scout-username", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  const v = validateScoutUsername(req.body?.username);
  if (v.error) { res.status(400).json({ error: v.error }); return; }
  try {
    if (await scoutUsernameTaken(v.name!, req.user!.id)) {
      res.status(409).json({ error: "That username is taken." });
      return;
    }
    const [updated] = await db.update(usersTable).set({ scoutUsername: v.name! })
      .where(eq(usersTable.id, req.user!.id)).returning();
    const sessionUser = toSessionUser(updated);
    const sid = getSessionId(req);
    if (sid) {
      const { updateSession } = await import("../lib/auth");
      await updateSession(sid, { user: sessionUser });
    }
    req.user = sessionUser as any;
    res.json({ user: sessionUser });
  } catch (err: any) {
    // Unique index race: someone else grabbed it between check and write.
    if (String(err?.code) === "23505" || /unique/i.test(String(err?.message))) {
      res.status(409).json({ error: "That username is taken." });
      return;
    }
    res.status(500).json({ error: "Failed to save username" });
  }
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
        subject: "Welcome to ChessScout.net: Play. Scout. Improve. ♜",
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
  const origin = FRONTEND_URL || getOrigin(req);
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
  // In-page (one-tap) sign-in: on when GOOGLE_ONE_TAP=1 and chessscout.net is an
  // "Authorized JavaScript origin" on the Google OAuth client.
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  res.json({ available: !!clientId, oneTapClientId: process.env.GOOGLE_ONE_TAP === "1" && clientId ? clientId : null });
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
    // ref:CODE and/or app (the Play app), so the return trip can say where it started.
    state: [refCode ? `ref:${refCode}` : '', req.query.app === '1' ? 'app' : '', validHandoffCode(req.query.h) ? `h:${req.query.h}` : ''].filter(Boolean).join(';') || 'none',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// Sends the browser to `url` via a tiny HTML page that navigates with
// window.location.replace(), instead of a raw HTTP redirect. This
// specifically matters for the TWA (Android app) build: navigating out
// to accounts.google.com for the actual sign-in step can drop the
// activity out of the TWA's trusted fullscreen mode, and a plain
// server-side redirect landing back on our own domain doesn't reliably
// get Android to re-promote it back into fullscreen -- users were stuck
// seeing the desktop-style sidebar layout until they force-closed and
// reopened the app. A page-level, client-initiated navigation back to
// our verified origin is the documented way to get Android to
// re-verify and snap back into fullscreen within the same session.
function sendClientRedirect(res: Response, url: string) {
  res.set("Content-Type", "text/html").send(
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>` +
    `<script>window.location.replace(${JSON.stringify(url)});</script>` +
    `</body></html>`
  );
}

type GoogleProfile = { id: string; email?: string | null; given_name?: string | null; family_name?: string | null; picture?: string | null };
/** Finds or creates the account for a Google profile (links an existing email account), as the
 *  redirect sign-in and the in-page (one-tap) sign-in both do. */
async function signInGoogleProfile(profile: GoogleProfile, refCode: string): Promise<{ user: typeof usersTable.$inferSelect; isNewSignup: boolean }> {
  let [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.googleId, profile.id));

  let isNewSignup = false;

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
          // A picture the player uploaded themselves is kept.
          profileImageUrl: existingByEmail.profileImageUrl?.includes('/api/avatars/') ? existingByEmail.profileImageUrl : (profile.picture || existingByEmail.profileImageUrl),
          firstName: existingByEmail.firstName || profile.given_name,
          lastName: existingByEmail.lastName || profile.family_name,
          lastLoginAt: new Date(),
        })
        .where(eq(usersTable.id, existingByEmail.id))
        .returning();
    } else {
      isNewSignup = true;
      let googleReferrerUserId: string | null = null;
      if (refCode) {
        const [referrer] = await db.select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.inviteCode, refCode.toUpperCase().trim()));
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
          subject: "Welcome to ChessScout.net: Play. Scout. Improve. ♜",
          html: welcomeEmailHtml(user.firstName),
        }).then(() => {
          db.insert(emailDripLogTable).values({ userId: user.id, dripType: 'welcome' }).catch(() => {});
        }).catch(() => {});
      }
    }
  } else {
    await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
  }
  return { user, isNewSignup };
}

// In-page Google sign-in (one tap): the browser hands us Google's signed ID token,
// Google checks the signature for us (tokeninfo), and we sign the person in here,
// without ever leaving the page (matters in the Android app, where the redirect
// trip out to Google can end up in a separate browser tab).
router.post("/auth/google/idtoken", async (req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const credential = String((req.body as { credential?: string })?.credential ?? "");
  const refCode = String((req.body as { ref?: string })?.ref ?? "").slice(0, 40);
  if (!clientId || !credential) { res.status(400).json({ error: "Google sign-in isn't available." }); return; }
  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    const info = await r.json().catch(() => null) as { aud?: string; iss?: string; sub?: string; email?: string; email_verified?: string | boolean; given_name?: string; family_name?: string; picture?: string; exp?: string } | null;
    const issOk = info?.iss === "accounts.google.com" || info?.iss === "https://accounts.google.com";
    if (!r.ok || !info || info.aud !== clientId || !issOk || !info.sub || Number(info.exp ?? 0) * 1000 < Date.now()) {
      res.status(401).json({ error: "Google sign-in didn't go through. Please try again." }); return;
    }
    const verified = info.email_verified === true || info.email_verified === "true";
    const { user, isNewSignup } = await signInGoogleProfile({
      id: info.sub, email: verified ? info.email ?? null : null, given_name: info.given_name ?? null, family_name: info.family_name ?? null, picture: info.picture ?? null,
    }, refCode);
    const sid = await createSession({ user: toSessionUser(user) } as SessionData);
    setSessionCookie(res, sid);
    res.json({ token: sid, newSignup: isNewSignup });
  } catch (err) {
    req.log?.error?.({ err }, "Google one-tap sign-in failed");
    res.status(500).json({ error: "Google sign-in didn't go through. Please try again." });
  }
});

router.get("/auth/google/callback", async (req: Request, res: Response) => {
  const { code } = req.query;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackOrigin = getOrigin(req);
  const frontendOrigin = FRONTEND_URL || callbackOrigin;

  if (!code || !clientId || !clientSecret) {
    sendClientRedirect(res, frontendOrigin + "/?error=google_auth_failed");
    return;
  }

  try {
    const origin = callbackOrigin;
    const redirectUri = `${origin}/api/auth/google/callback`;
    const stateParam = (req.query.state as string) || '';
    const stateParts = stateParam.split(';');
    const googleRefCode = stateParts.find((x) => x.startsWith('ref:'))?.slice(4) ?? '';
    const fromApp = stateParts.includes('app');
    const handoff = stateParts.find((x) => x.startsWith('h:'))?.slice(2) ?? null;

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
      sendClientRedirect(res, frontendOrigin + "/?error=google_auth_failed");
      return;
    }

    const tokens = await tokenRes.json() as any;

    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoRes.ok) {
      sendClientRedirect(res, frontendOrigin + "/?error=google_auth_failed");
      return;
    }

    const profile = await userInfoRes.json() as any;

    const { user, isNewSignup } = await signInGoogleProfile(profile, googleRefCode);

    const sessionData: SessionData = { user: toSessionUser(user) };
    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);

    // isNewSignup distinguishes a genuinely new account from an existing
    // login or an existing local account just linking Google -- only the
    // former should count as a completed signup in funnel tracking. The
    // frontend (UserContext.tsx) reads this off the hash and fires the
    // corresponding funnel event once, since this redirect is the only
    // place that knows which case just happened.
    // An existing account signing back in is marked too, so the funnel can
    // tell "came back signed in" apart from "never came back from Google".
    const newSignupParam = isNewSignup ? "&newSignup=google" : "&login=google";
    putHandoff(handoff, { sid, newSignup: isNewSignup, provider: "google" });
    sendClientRedirect(res, frontendOrigin + "/#token=" + sid + newSignupParam + (fromApp ? "&app=1" : ""));
  } catch (err: any) {
    req.log?.error?.({ err }, "Google callback error");
    sendClientRedirect(res, frontendOrigin + "/?error=google_auth_failed");
  }
});

// ── Sign in with Lichess ──────────────────────────────────────────────────
// Lichess's own sign-in (OAuth with PKCE; no app registration needed). Finds the
// account by Lichess id, then by email (linking it), or creates one with the
// Lichess username already linked, so their games are ready to import.
const lichessPending = new Map<string, { verifier: string; ref: string; app: boolean; at: number; h: string | null }>();
let lichessColumn: Promise<void> | null = null;
const ensureLichessColumn = () => (lichessColumn ??= db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS lichess_id varchar`).then(() => undefined).catch((err) => { lichessColumn = null; throw err; }));
const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

router.get("/auth/lichess", (req: Request, res: Response) => {
  for (const [k, v] of lichessPending) if (Date.now() - v.at > 15 * 60_000) lichessPending.delete(k);
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  lichessPending.set(state, { verifier, ref: String(req.query.ref ?? "").slice(0, 40), app: req.query.app === "1", at: Date.now(), h: validHandoffCode(req.query.h) ? String(req.query.h) : null });
  const params = new URLSearchParams({
    response_type: "code", client_id: "chessscout.net", redirect_uri: `${getOrigin(req)}/api/auth/lichess/callback`,
    scope: "email:read", code_challenge_method: "S256", code_challenge: challenge, state,
  });
  res.redirect(`https://lichess.org/oauth?${params}`);
});

router.get("/auth/lichess/callback", async (req: Request, res: Response) => {
  const frontendOrigin = FRONTEND_URL || getOrigin(req);
  const fail = () => sendClientRedirect(res, frontendOrigin + "/?error=lichess_auth_failed");
  const state = String(req.query.state ?? ""); const code = String(req.query.code ?? "");
  const pending = lichessPending.get(state); lichessPending.delete(state);
  if (!pending || !code) { fail(); return; }
  try {
    const tokenRes = await fetch("https://lichess.org/api/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: pending.verifier, redirect_uri: `${getOrigin(req)}/api/auth/lichess/callback`, client_id: "chessscout.net" }),
    });
    const tok = await tokenRes.json().catch(() => null) as { access_token?: string } | null;
    if (!tokenRes.ok || !tok?.access_token) { fail(); return; }
    const auth = { Authorization: `Bearer ${tok.access_token}` };
    const acc = await fetch("https://lichess.org/api/account", { headers: auth }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { id?: string; username?: string; title?: string; profile?: { firstName?: string; lastName?: string } } | null;
    const em = await fetch("https://lichess.org/api/account/email", { headers: auth }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { email?: string } | null;
    // We only needed to read who they are: give the token back to Lichess.
    void fetch("https://lichess.org/api/token", { method: "DELETE", headers: auth }).catch(() => {});
    if (!acc?.id || !acc.username || acc.title === "BOT") { fail(); return; }
    await ensureLichessColumn();
    const email = em?.email ? em.email.toLowerCase() : null;
    const rows = (r: any) => (Array.isArray(r) ? r : r?.rows ?? []);
    let [user] = rows(await db.execute(sql`SELECT * FROM users WHERE lichess_id = ${acc.id} LIMIT 1`)).map((x: any) => x.id) as string[];
    let isNewSignup = false;
    if (!user && email) {
      const [byEmail] = await db.select().from(usersTable).where(eq(usersTable.email, email));
      if (byEmail) user = byEmail.id;
    }
    if (user) {
      await db.execute(sql`UPDATE users SET lichess_id = ${acc.id}, lichess_username = COALESCE(lichess_username, ${acc.username}), last_login_at = now() WHERE id = ${user}`);
    } else {
      isNewSignup = true;
      let referrer: string | null = null;
      if (pending.ref) {
        const [r] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.inviteCode, pending.ref.toUpperCase().trim()));
        if (r) referrer = r.id;
      }
      const [created] = await db.insert(usersTable).values({
        email, authProvider: "lichess", lichessUsername: acc.username,
        firstName: acc.profile?.firstName || null, lastName: acc.profile?.lastName || null,
        referredByUserId: referrer, lastLoginAt: new Date(),
      }).returning();
      user = created.id;
      await db.execute(sql`UPDATE users SET lichess_id = ${acc.id} WHERE id = ${user}`);
      if (referrer) await db.insert(referralConversionsTable).values({ referrerUserId: referrer, referredUserId: user, status: "signed_up" });
      if (email) {
        sendEmail({ to: email, subject: "Welcome to ChessScout.net: Play. Scout. Improve. ♜", html: welcomeEmailHtml(created.firstName) })
          .then(() => { db.insert(emailDripLogTable).values({ userId: created.id, dripType: "welcome" }).catch(() => {}); }).catch(() => {});
      }
    }
    const [fresh] = await db.select().from(usersTable).where(eq(usersTable.id, user));
    const sid = await createSession({ user: toSessionUser(fresh) } as SessionData);
    setSessionCookie(res, sid);
    putHandoff(pending.h, { sid, newSignup: isNewSignup, provider: "lichess" });
    sendClientRedirect(res, frontendOrigin + "/#token=" + sid + (isNewSignup ? "&newSignup=lichess" : "&login=lichess") + (pending.app ? "&app=1" : ""));
  } catch (err) {
    req.log?.error?.({ err }, "Lichess sign-in failed");
    fail();
  }
});

// The app, back from signing in elsewhere, collects its sign-in (see lib/authHandoff.ts).
router.get("/auth/handoff/:code", (req: Request, res: Response) => {
  const code = String(req.params.code);
  const h = validHandoffCode(code) ? takeHandoff(code) : null;
  if (!h) { res.status(404).json({ ready: false }); return; }
  res.json({ ready: true, token: h.sid, newSignup: h.newSignup, provider: h.provider });
});

router.post("/auth/update-profile", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { chesscomUsername, firstName, lichessUsername, emailOptOut } = req.body;

  try {
    const updates: Record<string, any> = {};
    if (chesscomUsername !== undefined) updates.chesscomUsername = chesscomUsername;
    if (lichessUsername !== undefined) updates.lichessUsername = lichessUsername;
    if (firstName !== undefined) updates.firstName = firstName;
    if (typeof emailOptOut === "boolean") updates.emailOptOut = emailOptOut;

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
    const [user] = await db.select({ inviteCode: usersTable.inviteCode, stripeCustomerId: usersTable.stripeCustomerId, isPremiumOverride: usersTable.isPremiumOverride, isAffiliate: usersTable.isAffiliate }).from(usersTable).where(eq(usersTable.id, userId));

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

    // Generate a code here too if the user is paid but doesn't have one
    // yet. The other generation path (in the Stripe subscription-status
    // poll) only fires for a literal 'active' Stripe subscription status,
    // which never applies to isPremiumOverride-based access (e.g. an
    // admin-granted free Pro account) -- those users were correctly shown
    // the unlocked referral UI via the broader isPaid check above, but
    // never actually got a code generated, so there was nothing to copy.
    // Also generate a code for a formal (admin-designated) affiliate, even
    // if they aren't a paying subscriber themselves -- being an affiliate
    // partner and being a paying customer are independent things. Before
    // this, an affiliate on the Free plan got no invite code and no
    // referral link at all, and the Affiliate Dashboard link on this page
    // was hidden entirely behind the same isPaid check below, effectively
    // locking a designated affiliate out of their own dashboard.
    if ((isPaid || user?.isAffiliate) && user && !user.inviteCode) {
      try {
        const newCode = crypto.randomBytes(4).toString("hex").toUpperCase();
        await db.update(usersTable).set({ inviteCode: newCode }).where(eq(usersTable.id, userId));
        user.inviteCode = newCode;
      } catch {
        // Unique constraint collision (astronomically unlikely) -- next
        // load of this page will just retry.
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
      inviteCode: (isPaid || user?.isAffiliate) ? (user?.inviteCode ?? null) : null,
      isPaid,
      isAffiliate: !!user?.isAffiliate,
      totalReferred: referrals.length,
      totalConverted: referrals.filter(r => r.status === "converted").length,
      referrals: referralDetails,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to get referral data" });
  }
});

// Let a member with a referral code (Pro members and affiliates) change it to
// something that fits them, like their channel or club name. Earlier
// referrals stay credited (they're stored by user, not by code); only links
// with the old code stop working.
const RESERVED_CODES = new Set(["ADMIN", "CHESSSCOUT", "CHESSSCOUTNET", "SUPPORT", "STAFF", "OFFICIAL", "HELP", "PRO", "FREE", "TEST", "NULL", "UNDEFINED"]);
router.post("/auth/referrals/code", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const userId = req.user.id;
    const raw = typeof req.body?.code === "string" ? req.body.code : "";
    const code = raw.trim().toUpperCase().replace(/[\s-]+/g, "");
    if (!/^[A-Z0-9_]{3,20}$/.test(code)) {
      res.status(400).json({ error: "Use 3 to 20 letters, numbers or underscores (no spaces)." }); return;
    }
    if (RESERVED_CODES.has(code)) { res.status(400).json({ error: "That code is reserved. Try another." }); return; }
    const [user] = await db.select({ inviteCode: usersTable.inviteCode, isAffiliate: usersTable.isAffiliate }).from(usersTable).where(eq(usersTable.id, userId));
    if (!user?.inviteCode && !user?.isAffiliate) {
      res.status(403).json({ error: "Referral codes come with Pro or the affiliate program." }); return;
    }
    if (user.inviteCode === code) { res.json({ inviteCode: code }); return; }
    const [taken] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.inviteCode, code));
    if (taken && taken.id !== userId) { res.status(409).json({ error: `"${code}" is already taken. Try another.` }); return; }
    try {
      await db.update(usersTable).set({ inviteCode: code }).where(eq(usersTable.id, userId));
    } catch {
      res.status(409).json({ error: `"${code}" is already taken. Try another.` }); return;
    }
    res.json({ inviteCode: code });
  } catch {
    res.status(500).json({ error: "Could not update your referral code" });
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
