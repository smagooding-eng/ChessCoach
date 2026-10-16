import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { isNotNull, inArray, eq } from "drizzle-orm";
import { sendEmail, sendBulkEmail } from "../lib/email";
import { emailLayout, emailP, unsubscribeFooterHtml } from "../lib/emailTheme";
import { optedInUsersByEmail, unsubscribeHeaders, unsubscribeUrl } from "../lib/emailPrefs";
import { trackHtml } from "../lib/emailTracking";
import { ADMIN_EMAILS } from "../lib/auth";
import { ObjectStorageService } from "../lib/objectStorage";

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

    // Respect unsubscribes, and give every recipient their own unsubscribe link.
    const { allowed, optedOut } = await optedInUsersByEmail(recipients);
    const skippedOptOut = recipients.filter(e => optedOut.has(e.toLowerCase())).length;
    recipients = recipients.filter(e => !optedOut.has(e.toLowerCase()));
    if (recipients.length === 0) {
      res.status(400).json({ error: "Everyone selected has unsubscribed from emails", skippedOptOut });
      return;
    }
    const personalize = async (to: string) => {
      const userId = allowed.get(to.toLowerCase());
      const tracked = await trackHtml(html, { kind: "broadcast", template: String(subject).slice(0, 40), email: to, userId: userId ?? null, subject });
      if (!userId) return { html: tracked };
      const footer = unsubscribeFooterHtml(unsubscribeUrl(userId));
      const withFooter = tracked.includes("</body>") ? tracked.replace("</body>", `${footer}</body>`) : tracked + footer;
      return { html: withFooter, headers: unsubscribeHeaders(userId) };
    };

    req.log.info({ recipientCount: recipients.length, skippedOptOut, recipientFilter }, "Starting email broadcast");
    const results = await sendBulkEmail(recipients, subject, html, text, personalize);
    req.log.info({ sent: results.sent, failed: results.failed, errors: results.errors }, "Email broadcast complete");

    res.json({
      success: true,
      totalRecipients: recipients.length,
      skippedOptOut,
      ...results,
      failedEmails: results.errors.length > 0 ? results.errors : undefined,
    });
  } catch (err: any) {
    req.log.error({ error: err.message }, "Broadcast email error");
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
      html: html || emailLayout({ preheader: "Test email from your ChessScout.net admin panel.", badge: "Test", title: "ChessScout.net test email", body: emailP("This is a test email from your ChessScout.net admin panel. If you received this, your email integration is working.", { center: true, mb: 0 }) }),
      text: text || "This is a test email from ChessScout.",
      replyTo: adminEmail,
    });

    res.json({ success: true, id: result?.id, sentTo: adminEmail });
  } catch (err: any) {
    console.error("Test email error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

const objectStorage = new ObjectStorageService();

router.post("/admin/email/upload-image", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { dataUrl } = req.body;
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      res.status(400).json({ error: "Valid image data URL required" });
      return;
    }

    const mimeMatch = dataUrl.match(/^data:(image\/\w+);base64,/);
    if (!mimeMatch) {
      res.status(400).json({ error: "Invalid image format" });
      return;
    }
    const contentType = mimeMatch[1];
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length > 5 * 1024 * 1024) {
      res.status(400).json({ error: "Image must be under 5MB" });
      return;
    }

    const uploadUrl = await objectStorage.getObjectEntityUploadURL();
    const objectPath = objectStorage.normalizeObjectEntityPath(uploadUrl);

    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: buffer,
    });

    const publicAppUrl = (process.env.PUBLIC_APP_URL || "").replace(/\/+$/, "");
    if (!publicAppUrl) {
      throw new Error("PUBLIC_APP_URL environment variable is required.");
    }
    const publicUrl = `${publicAppUrl}/api/storage${objectPath}`;

    res.json({ success: true, url: publicUrl });
  } catch (err: any) {
    console.error("Image upload error:", err.message);
    res.status(500).json({ error: "Failed to upload image" });
  }
});

export default router;
