// Admin: how quick reviews are doing. Per game caught: how long after it ended we saw
// it, reviewed it and told the member, and whether they opened it.
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/authMiddleware";

const router: IRouter = Router();
const rowsOf = <T,>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { rows?: T[] })?.rows ?? [])) as T[];

router.get("/admin/quick-stats", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const day = (s: unknown) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const start = day(req.query.startDate) ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const end = day(req.query.endDate) ?? new Date().toISOString().slice(0, 10);
  const since = `${start}T00:00:00Z`;
  const until = new Date(new Date(`${end}T00:00:00Z`).getTime() + 864e5).toISOString();
  try {
    const [r] = rowsOf<{
      caught: number; members: number; notified: number; pushed: number; emailed: number; opened: number;
      caught_min: number | null; reviewed_min: number | null; notified_min: number | null;
      cc_min: number | null; li_min: number | null;
    }>(await db.execute(sql`
      SELECT count(*)::int AS caught, count(DISTINCT user_id)::int AS members,
        count(notified_at)::int AS notified,
        count(*) FILTER (WHERE via = 'push')::int AS pushed,
        count(*) FILTER (WHERE via = 'email')::int AS emailed,
        count(opened_at)::int AS opened,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM detected_at - ended_at) / 60)::float AS caught_min,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM reviewed_at - ended_at) / 60)::float AS reviewed_min,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM notified_at - ended_at) / 60)::float AS notified_min,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM detected_at - ended_at) / 60) FILTER (WHERE platform = 'chesscom')::float AS cc_min,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM detected_at - ended_at) / 60) FILTER (WHERE platform = 'lichess')::float AS li_min
      FROM quick_detect WHERE ended_at >= ${since} AND ended_at < ${until}`));
    const m = (v: number | null | undefined) => (v == null ? null : Math.round(v * 10) / 10);
    res.json({
      startDate: start, endDate: end,
      caught: r?.caught ?? 0, members: r?.members ?? 0,
      notified: r?.notified ?? 0, pushed: r?.pushed ?? 0, emailed: r?.emailed ?? 0, opened: r?.opened ?? 0,
      minutes: { caught: m(r?.caught_min), reviewed: m(r?.reviewed_min), notified: m(r?.notified_min), chesscom: m(r?.cc_min), lichess: m(r?.li_min) },
    });
  } catch (e) {
    // Nothing recorded yet (table made on the first start)
    res.json({ startDate: start, endDate: end, caught: 0, members: 0, notified: 0, pushed: 0, emailed: 0, opened: 0, minutes: { caught: null, reviewed: null, notified: null, chesscom: null, lichess: null } });
  }
});

export default router;
