import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { isNotNull, inArray, eq } from "drizzle-orm";
import { sendEmail, sendBulkEmail } from "../lib/email";
import { ADMIN_EMAILS } from "../lib/auth";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated() || !req.user?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

router.post("/admin/email/send", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { to, subject, html, text } = req.body;

    if (!to || !subject || !html) {
      res.status(400).json({ error: "to, subject, and html are required" });
      return;
    }

    const adminEmail = req.user?.email;
    const result = await sendEmail({
      to,
      subject,
      html,
      text,
      replyTo: adminEmail || undefined,
    });

    res.json({ success: true, id: result?.id });
  } catch (err: any) {
    console.error("Email send error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/admin/email/broadcast", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { subject, html, text, recipientFilter } = req.body;

    if (!subject || !html) {
      res.status(400).json({ error: "subject and html are required" });
      return;
    }

    let recipients: string[];

    if (recipientFilter === "all") {
      const users = await db
        .select({ email: usersTable.email })
        .from(usersTable)
        .where(isNotNull(usersTable.email));
      recipients = users.map(u => u.email!).filter(Boolean);
    } else if (recipientFilter === "specific" && req.body.emails) {
      recipients = req.body.emails;
    } else {
      res.status(400).json({ error: "recipientFilter must be 'all' or 'specific' with emails array" });
      return;
    }

    if (recipients.length === 0) {
      res.status(400).json({ error: "No recipients found" });
      return;
    }

    const results = await sendBulkEmail(recipients, subject, html, text);

    res.json({
      success: true,
      totalRecipients: recipients.length,
      ...results,
    });
  } catch (err: any) {
    console.error("Broadcast email error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/admin/email/test", requireAdmin, async (req: Request, res: Response) => {
  try {
    const adminEmail = req.user?.email;
    if (!adminEmail) {
      res.status(400).json({ error: "No admin email found" });
      return;
    }

    const { subject, html, text } = req.body;

    const result = await sendEmail({
      to: adminEmail,
      subject: subject || "Test Email from ChessScout",
      html: html || `<div style="padding:20px;background:#262421;color:#e8e6e3;font-family:sans-serif;"><h2 style="color:#81b64c;">♜ ChessScout Test Email</h2><p>This is a test email from your ChessScout admin panel.</p><p style="color:#9e9b98;">If you received this, your email integration is working correctly!</p></div>`,
      text: text || "This is a test email from ChessScout.",
      replyTo: adminEmail,
    });

    res.json({ success: true, id: result?.id, sentTo: adminEmail });
  } catch (err: any) {
    console.error("Test email error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
