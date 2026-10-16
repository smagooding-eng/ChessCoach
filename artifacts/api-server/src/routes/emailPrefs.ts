import { Router, type IRouter, type Request, type Response } from "express";
import { verifyUnsubToken, setEmailOptOut, unsubToken } from "../lib/emailPrefs";
import { EMAIL, emailLayout, emailP } from "../lib/emailTheme";

// Public, signed links from the email footer. GET shows a page, POST is the
// one-click unsubscribe Gmail and Apple Mail send from their own button.
const router: IRouter = Router();

function page(res: Response, status: number, title: string, body: string, action?: { label: string; url: string }) {
  // Reuse the email layout so the page looks like the email it came from.
  const html = emailLayout({
    preheader: title,
    title,
    body: emailP(body, { center: true, mb: action ? 22 : 0 }),
    afterCta: action
      ? `<form method="POST" action="${action.url}" style="margin:0;text-align:center;"><button type="submit" style="background:${EMAIL.green};color:#FFFFFF;border:0;border-radius:12px;padding:13px 26px;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit;">${action.label}</button></form>`
      : `<p style="margin:22px 0 0;text-align:center;"><a href="${EMAIL.site}" style="color:${EMAIL.green};font-weight:700;text-decoration:none;font-family:sans-serif;">Back to ChessScout.net</a></p>`,
  });
  res.status(status).type("html").send(html);
}

function params(req: Request): { u: string; t: string } {
  const u = String((req.query.u ?? req.body?.u ?? "") as string);
  const t = String((req.query.t ?? req.body?.t ?? "") as string);
  return { u, t };
}

router.get("/email/unsubscribe", async (req: Request, res: Response) => {
  const { u, t } = params(req);
  if (!verifyUnsubToken(u, t)) {
    page(res, 400, "That link didn't work", "This unsubscribe link is invalid or incomplete. You can also turn email reminders off from your Profile.");
    return;
  }
  try {
    await setEmailOptOut(u, true);
    page(res, 200, "You're unsubscribed",
      "You won't get reminder or update emails from ChessScout.net any more. We'll still send emails about your account, like email verification.",
      { label: "Resubscribe", url: `/api/email/resubscribe?u=${encodeURIComponent(u)}&t=${unsubToken(u)}` });
  } catch {
    page(res, 500, "Something went wrong", "We couldn't update your email settings. Please try the link again in a minute.");
  }
});

router.post("/email/unsubscribe", async (req: Request, res: Response) => {
  const { u, t } = params(req);
  if (!verifyUnsubToken(u, t)) { res.status(400).send("Invalid link"); return; }
  try {
    await setEmailOptOut(u, true);
    res.status(200).send("Unsubscribed");
  } catch {
    res.status(500).send("Failed");
  }
});

router.post("/email/resubscribe", async (req: Request, res: Response) => {
  const { u, t } = params(req);
  if (!verifyUnsubToken(u, t)) {
    page(res, 400, "That link didn't work", "This link is invalid or incomplete.");
    return;
  }
  try {
    await setEmailOptOut(u, false);
    page(res, 200, "You're subscribed again", "Welcome back. You'll get ChessScout.net reminders and updates again.");
  } catch {
    page(res, 500, "Something went wrong", "We couldn't update your email settings. Please try again in a minute.");
  }
});

export default router;
