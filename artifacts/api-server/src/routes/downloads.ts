// Saving a file the app made (e.g. Admin's analytics export) on a phone. Phone apps (the
// Android app shell, the iPhone home-screen app) often drop the browser's in-page
// "download" quietly, so the app hands the file here and opens a short-lived link to it
// instead: an ordinary download the phone's own download manager / Files saves.
// The link is unguessable, works for 10 minutes, and the file is kept in memory only.
import { Router, type IRouter, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import { requireAuth } from "../middlewares/authMiddleware";

const router: IRouter = Router();
const TTL_MS = 10 * 60_000;
const MAX_BYTES = 15 * 1024 * 1024;
const files = new Map<string, { name: string; type: string; body: Buffer; exp: number }>();

function sweep() {
  const now = Date.now();
  for (const [k, f] of files) if (f.exp < now) files.delete(k);
}

router.post("/downloads", requireAuth, (req: Request, res: Response) => {
  sweep();
  const name = String(req.body?.name ?? "file").replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
  const type = /^[\w.+-]+\/[\w.+-]+$/.test(String(req.body?.type ?? "")) ? String(req.body.type) : "application/octet-stream";
  const text = typeof req.body?.text === "string" ? req.body.text : null;
  const b64 = typeof req.body?.base64 === "string" ? req.body.base64 : null;
  const body = text != null ? Buffer.from(text, "utf8") : b64 != null ? Buffer.from(b64, "base64") : null;
  if (!body || body.length === 0) { res.status(400).json({ error: "Nothing to save" }); return; }
  if (body.length > MAX_BYTES) { res.status(413).json({ error: "That file is too big to save this way" }); return; }
  const ticket = randomBytes(24).toString("base64url");
  files.set(ticket, { name, type, body, exp: Date.now() + TTL_MS });
  res.json({ ticket, path: `/dl/${ticket}` });
});

router.get("/downloads/:ticket", (req: Request, res: Response) => {
  sweep();
  const f = files.get(String(req.params.ticket));
  if (!f) { res.status(404).type("text/plain").send("This download link has expired. Go back and tap Download again."); return; }
  res.setHeader("Content-Type", f.type);
  res.setHeader("Content-Length", String(f.body.length));
  res.setHeader("Content-Disposition", `attachment; filename="${f.name}"; filename*=UTF-8''${encodeURIComponent(f.name)}`);
  res.setHeader("Cache-Control", "no-store");
  res.send(f.body);
});

export default router;
