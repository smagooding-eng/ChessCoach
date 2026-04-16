import { Router, type IRouter } from "express";
import type { Request, Response } from "express";
import { db, gamesTable, weaknessesTable, coursesTable, backgroundJobsTable } from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import {
  AnalyzeGamesBody,
  AnalyzeGamesResponse,
  GetWeaknessesQueryParams,
  GetWeaknessesResponse,
  GetAnalysisSummaryQueryParams,
  GetAnalysisSummaryResponse,
} from "@workspace/api-zod";
import { analyzePlayerGames } from "../lib/openaiAnalysis";
import { randomUUID } from "crypto";
import type { Logger } from "pino";
import OpenAI from "openai";
import { Chess } from "chess.js";
import sharp from "sharp";

const router: IRouter = Router();

async function runAnalysisJob(username: string, jobId: string, log: Logger): Promise<void> {
  try {
    const games = await db
      .select()
      .from(gamesTable)
      .where(eq(gamesTable.username, username.toLowerCase()))
      .orderBy(desc(gamesTable.playedAt))
      .limit(50);

    if (games.length === 0) {
      await db.update(backgroundJobsTable).set({
        status: "error",
        error: "No games found. Import games first.",
        completedAt: new Date(),
      }).where(eq(backgroundJobsTable.id, jobId));
      return;
    }

    const gameSummaries = games.map((g) => ({
      pgn: g.pgn,
      result: g.result,
      opening: g.opening,
      timeControl: g.timeControl,
      whiteUsername: g.whiteUsername,
      blackUsername: g.blackUsername,
      whiteRating: g.whiteRating,
      blackRating: g.blackRating,
      gameId: g.id,
    }));

    const analysis = await analyzePlayerGames(username, gameSummaries);

    await db.delete(weaknessesTable).where(eq(weaknessesTable.username, username.toLowerCase()));

    for (const weakness of analysis.weaknesses) {
      const relatedGameIds = (weakness.relatedGameIndices ?? [])
        .filter((idx) => idx >= 0 && idx < games.length)
        .map((idx) => games[idx].id)
        .filter((id): id is number => typeof id === "number");

      await db.insert(weaknessesTable).values({
        username: username.toLowerCase(),
        category: weakness.category,
        severity: weakness.severity,
        description: weakness.description,
        frequency: weakness.frequency,
        examples: weakness.examples,
        relatedGameIds,
      });
    }

    await db
      .update(gamesTable)
      .set({ analyzed: true })
      .where(eq(gamesTable.username, username.toLowerCase()));

    log.info({ jobId, username }, "Analysis job complete");
    await db.update(backgroundJobsTable).set({
      status: "done",
      completedAt: new Date(),
    }).where(eq(backgroundJobsTable.id, jobId));
  } catch (err) {
    log.error({ err, jobId }, "Analysis job failed");
    const msg = err instanceof Error ? err.message : "Analysis failed";
    await db.update(backgroundJobsTable).set({
      status: "error",
      error: msg,
      completedAt: new Date(),
    }).where(eq(backgroundJobsTable.id, jobId));
  }
}

router.post("/analysis/start", async (req, res): Promise<void> => {
  const parsed = AnalyzeGamesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { username } = parsed.data;
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const [pending] = await db.select().from(backgroundJobsTable).where(
    and(
      eq(backgroundJobsTable.userId, userId),
      eq(backgroundJobsTable.type, "analysis"),
      eq(backgroundJobsTable.status, "pending"),
    )
  );

  if (pending) {
    const age = Date.now() - new Date(pending.createdAt).getTime();
    if (age > 10 * 60 * 1000) {
      await db.update(backgroundJobsTable).set({
        status: "error",
        error: "Timed out (server restart or crash)",
        completedAt: new Date(),
      }).where(eq(backgroundJobsTable.id, pending.id));
    } else {
      res.json({ jobId: pending.id });
      return;
    }
  }

  const jobId = randomUUID();
  await db.insert(backgroundJobsTable).values({
    id: jobId,
    userId,
    type: "analysis",
    status: "pending",
    targetUsername: username.toLowerCase(),
  });

  res.json({ jobId });
  runAnalysisJob(username.toLowerCase(), jobId, req.log).catch(() => {});
});

router.get("/analysis/status/:jobId", async (req, res): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [job] = await db.select().from(backgroundJobsTable).where(
    and(eq(backgroundJobsTable.id, req.params.jobId as string), eq(backgroundJobsTable.userId, userId))
  );
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  res.setHeader("Cache-Control", "no-store");
  res.json({ status: job.status, error: job.error });
});

router.get("/analysis/active-job", async (req, res): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.json({ job: null }); return; }

  const [job] = await db.select().from(backgroundJobsTable).where(
    and(
      eq(backgroundJobsTable.userId, userId),
      eq(backgroundJobsTable.type, "analysis"),
    )
  ).orderBy(desc(backgroundJobsTable.createdAt)).limit(1);

  if (!job) { res.json({ job: null }); return; }

  const ageMs = Date.now() - job.createdAt.getTime();
  if (job.status === "pending" && ageMs > 10 * 60 * 1000) {
    await db.update(backgroundJobsTable).set({
      status: "error",
      error: "Timed out (server restart or crash)",
      completedAt: new Date(),
    }).where(eq(backgroundJobsTable.id, job.id));
    res.json({ job: null });
    return;
  }
  if (job.status === "done" && ageMs > 60_000) {
    res.json({ job: null });
    return;
  }
  if (job.status === "error" && ageMs > 60_000) {
    res.json({ job: null });
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.json({ job: { id: job.id, status: job.status, error: job.error, createdAt: job.createdAt.toISOString() } });
});

router.post("/analysis/analyze", async (req, res): Promise<void> => {
  const parsed = AnalyzeGamesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username } = parsed.data;
  req.log.info({ username }, "Starting game analysis (blocking)");

  const games = await db
    .select()
    .from(gamesTable)
    .where(eq(gamesTable.username, username.toLowerCase()))
    .orderBy(desc(gamesTable.playedAt))
    .limit(50);

  if (games.length === 0) {
    res.status(400).json({ error: "No games found for this username. Import games first." });
    return;
  }

  const gameSummaries = games.map((g) => ({
    pgn: g.pgn,
    result: g.result,
    opening: g.opening,
    timeControl: g.timeControl,
    whiteUsername: g.whiteUsername,
    blackUsername: g.blackUsername,
    whiteRating: g.whiteRating,
    blackRating: g.blackRating,
    gameId: g.id,
  }));

  const analysis = await analyzePlayerGames(username, gameSummaries);

  await db.delete(weaknessesTable).where(eq(weaknessesTable.username, username.toLowerCase()));

  for (const weakness of analysis.weaknesses) {
    const relatedGameIds = (weakness.relatedGameIndices ?? [])
      .filter((idx) => idx >= 0 && idx < games.length)
      .map((idx) => games[idx].id)
      .filter((id): id is number => typeof id === "number");

    await db.insert(weaknessesTable).values({
      username: username.toLowerCase(),
      category: weakness.category,
      severity: weakness.severity,
      description: weakness.description,
      frequency: weakness.frequency,
      examples: weakness.examples,
      relatedGameIds,
    });
  }

  await db
    .update(gamesTable)
    .set({ analyzed: true })
    .where(eq(gamesTable.username, username.toLowerCase()));

  res.json(
    AnalyzeGamesResponse.parse({
      username,
      gamesAnalyzed: games.length,
      weaknesses: analysis.weaknesses,
      summary: analysis.summary,
    })
  );
});

router.get("/analysis/weaknesses", async (req, res): Promise<void> => {
  const query = GetWeaknessesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { username } = query.data;

  const weaknesses = await db
    .select()
    .from(weaknessesTable)
    .where(eq(weaknessesTable.username, username.toLowerCase()))
    .orderBy(desc(weaknessesTable.createdAt));

  const lastUpdated = weaknesses.length > 0 ? weaknesses[0].createdAt.toISOString() : null;

  res.json(
    GetWeaknessesResponse.parse({
      username,
      weaknesses: weaknesses.map((w) => ({
        ...w,
        createdAt: w.createdAt.toISOString(),
      })),
      lastUpdated,
    })
  );
});

router.get("/analysis/summary", async (req, res): Promise<void> => {
  const query = GetAnalysisSummaryQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { username } = query.data;

  const games = await db
    .select()
    .from(gamesTable)
    .where(eq(gamesTable.username, username.toLowerCase()));

  const totalGames = games.length;

  let wins = 0, losses = 0, draws = 0;
  const openingMap = new Map<string, { games: number; wins: number; losses: number; draws: number }>();
  const timeControlMap = new Map<string, { games: number; wins: number; losses: number }>();
  let totalRating = 0;

  for (const g of games) {
    const userIsWhite = g.whiteUsername.toLowerCase() === username.toLowerCase();
    const rating = userIsWhite ? g.whiteRating : g.blackRating;
    if (rating > 0) totalRating += rating;

    const result = g.result;
    if (result === "win") wins++;
    else if (result === "loss") losses++;
    else draws++;

    const opening = g.opening || "Unknown Opening";
    if (!openingMap.has(opening)) {
      openingMap.set(opening, { games: 0, wins: 0, losses: 0, draws: 0 });
    }
    const opStat = openingMap.get(opening)!;
    opStat.games++;
    if (result === "win") opStat.wins++;
    else if (result === "loss") opStat.losses++;
    else opStat.draws++;

    const tc = g.timeControl;
    if (!timeControlMap.has(tc)) {
      timeControlMap.set(tc, { games: 0, wins: 0, losses: 0 });
    }
    const tcStat = timeControlMap.get(tc)!;
    tcStat.games++;
    if (result === "win") tcStat.wins++;
    else if (result === "loss") tcStat.losses++;
  }

  const openingStats = Array.from(openingMap.entries())
    .map(([opening, stat]) => ({ opening, ...stat }))
    .sort((a, b) => b.games - a.games)
    .slice(0, 8);

  const resultsByTimeControl = Array.from(timeControlMap.entries())
    .map(([timeControl, stat]) => ({ timeControl, ...stat }))
    .sort((a, b) => b.games - a.games);

  res.json(
    GetAnalysisSummaryResponse.parse({
      username,
      totalGames,
      wins,
      losses,
      draws,
      winRate: totalGames > 0 ? Math.round((wins / totalGames) * 100) / 100 : 0,
      avgRating: totalGames > 0 ? Math.round(totalRating / totalGames) : 0,
      openingStats,
      resultsByTimeControl,
    })
  );
});

router.get("/analysis/weaknesses/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid weakness id" });
    return;
  }

  const [weakness] = await db
    .select()
    .from(weaknessesTable)
    .where(eq(weaknessesTable.id, id));

  if (!weakness) {
    res.status(404).json({ error: "Weakness not found" });
    return;
  }

  const gameSelectFields = {
    id: gamesTable.id,
    whiteUsername: gamesTable.whiteUsername,
    blackUsername: gamesTable.blackUsername,
    result: gamesTable.result,
    opening: gamesTable.opening,
    timeControl: gamesTable.timeControl,
    playedAt: gamesTable.playedAt,
    whiteRating: gamesTable.whiteRating,
    blackRating: gamesTable.blackRating,
    pgn: gamesTable.pgn,
  };

  let relatedGames;
  if (weakness.relatedGameIds && weakness.relatedGameIds.length > 0) {
    relatedGames = await db
      .select(gameSelectFields)
      .from(gamesTable)
      .where(inArray(gamesTable.id, weakness.relatedGameIds));
  } else {
    relatedGames = await db
      .select(gameSelectFields)
      .from(gamesTable)
      .where(eq(gamesTable.username, weakness.username))
      .orderBy(desc(gamesTable.playedAt))
      .limit(8);
  }

  function extractMidGameFen(pgn: string | null): string | null {
    if (!pgn) return null;
    try {
      const Chess = require("chess.js").Chess;
      const chess = new Chess();
      chess.loadPgn(pgn);
      const history = chess.history({ verbose: true });
      const midPoint = Math.min(Math.floor(history.length * 0.55), history.length);
      if (midPoint === 0) return null;
      const player = new Chess();
      for (let i = 0; i < midPoint; i++) player.move(history[i].san);
      return player.fen();
    } catch {
      return null;
    }
  }

  const relatedCourses = await db
    .select()
    .from(coursesTable)
    .where(
      and(
        eq(coursesTable.username, weakness.username),
        eq(coursesTable.category, weakness.category)
      )
    );

  const analysisGames = await db
    .select({ id: gamesTable.id })
    .from(gamesTable)
    .where(eq(gamesTable.username, weakness.username))
    .orderBy(desc(gamesTable.playedAt))
    .limit(50);

  const ordinalToId: Record<number, number> = {};
  analysisGames.forEach((g, idx) => { ordinalToId[idx + 1] = g.id; });

  function extractGameIdsFromText(text: string): number[] {
    const ids: number[] = [];
    const re = /[Gg]ames?\s+(\d+)(?:\s*[-–]\s*(\d+))?(?:\s+and\s+(\d+))?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = parseInt(m[1]);
      if (m[2]) {
        const end = parseInt(m[2]);
        for (let i = start; i <= end; i++) if (ordinalToId[i]) ids.push(ordinalToId[i]);
      } else {
        if (ordinalToId[start]) ids.push(ordinalToId[start]);
      }
      if (m[3]) {
        const extra = parseInt(m[3]);
        if (ordinalToId[extra]) ids.push(ordinalToId[extra]);
      }
    }
    return [...new Set(ids)];
  }

  const examplesWithLinks = (weakness.examples ?? []).map((text) => ({
    text,
    gameIds: extractGameIdsFromText(text),
  }));

  res.json({
    weakness: { ...weakness, createdAt: weakness.createdAt.toISOString() },
    examplesWithLinks,
    relatedGames: relatedGames.map((g) => ({
      id: g.id,
      whiteUsername: g.whiteUsername,
      blackUsername: g.blackUsername,
      result: g.result,
      opening: g.opening,
      timeControl: g.timeControl,
      playedAt: g.playedAt?.toISOString() ?? null,
      whiteRating: g.whiteRating,
      blackRating: g.blackRating,
      midGameFen: extractMidGameFen(g.pgn),
    })),
    relatedCourses: relatedCourses.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
    })),
  });
});

router.post("/analysis/scan-position", async (req: Request, res: Response): Promise<void> => {
  try {
    const { image } = req.body as { image: string };
    if (!image) {
      res.status(400).json({ error: "Image data is required" });
      return;
    }

    const base64Match = image.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/);
    if (!base64Match) {
      res.status(400).json({ error: "Invalid image format. Send a base64 data URL." });
      return;
    }

    const originalBase64 = base64Match[2];
    const sizeBytes = Math.ceil(originalBase64.length * 0.75);
    if (sizeBytes > 10 * 1024 * 1024) {
      res.status(400).json({ error: "Image too large. Max 10MB." });
      return;
    }

    const ai = new OpenAI({
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 1 — Board detection.
    // Ask the AI for the chessboard's bounding box as fractions of the image.
    // ─────────────────────────────────────────────────────────────────────────
    const originalBuf = Buffer.from(originalBase64, 'base64');
    const origMeta = await sharp(originalBuf).metadata();
    const imgW = origMeta.width ?? 0;
    const imgH = origMeta.height ?? 0;
    if (imgW < 64 || imgH < 64) {
      res.status(400).json({ error: "Image is too small to analyze." });
      return;
    }

    const BBOX_PROMPT = `Find the chess board in this image. The board is the 8×8 grid of squares.
Return ONLY the bounding box of the board as fractions of the image size (0 to 1).
Include every row and column of squares but NOT any UI (player names, clocks, eval bar, buttons).

Return ONLY this JSON:
{ "left": 0.05, "top": 0.12, "right": 0.95, "bottom": 0.88 }

If no chess board is visible, return {"left":0,"top":0,"right":1,"bottom":1}.`;

    type Bbox = { left?: number; top?: number; right?: number; bottom?: number };
    async function detectBbox(): Promise<Bbox> {
      try {
        const r = await ai.chat.completions.create({
          model: "gpt-5.2",
          max_completion_tokens: 500,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: BBOX_PROMPT },
              { type: "image_url", image_url: { url: `data:image/${base64Match[1]};base64,${originalBase64}`, detail: "low" } },
            ],
          }],
          response_format: { type: "json_object" },
        });
        return JSON.parse(r.choices[0]?.message?.content ?? "{}") as Bbox;
      } catch { return {}; }
    }

    const bbox = await detectBbox();
    let bl = Math.max(0, Math.min(1, bbox.left ?? 0));
    let bt = Math.max(0, Math.min(1, bbox.top ?? 0));
    let br = Math.max(0, Math.min(1, bbox.right ?? 1));
    let bb = Math.max(0, Math.min(1, bbox.bottom ?? 1));
    // Sanity: if bbox is degenerate, fall back to the full image.
    if (br - bl < 0.2 || bb - bt < 0.2) { bl = 0; bt = 0; br = 1; bb = 1; }

    // Force the crop to be square (the board IS square) and centered within the AI's bbox.
    const bW = br - bl;
    const bH = bb - bt;
    const bCx = (bl + br) / 2;
    const bCy = (bt + bb) / 2;
    const bSide = Math.max(bW, bH);
    bl = Math.max(0, bCx - bSide / 2);
    bt = Math.max(0, bCy - bSide / 2);
    br = Math.min(1, bCx + bSide / 2);
    bb = Math.min(1, bCy + bSide / 2);

    const cropX = Math.floor(bl * imgW);
    const cropY = Math.floor(bt * imgH);
    const cropW = Math.max(8, Math.floor((br - bl) * imgW));
    const cropH = Math.max(8, Math.floor((bb - bt) * imgH));
    const cropSide = Math.min(cropW, cropH, imgW - cropX, imgH - cropY);

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 2 — Crop board and re-encode. Use this image for the piece scan.
    // ─────────────────────────────────────────────────────────────────────────
    const BOARD_SIZE = 640; // 80 px per square
    const { data: rawRGB, info: rawInfo } = await sharp(originalBuf)
      .extract({ left: cropX, top: cropY, width: cropSide, height: cropSide })
      .resize(BOARD_SIZE, BOARD_SIZE, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const croppedJpeg = await sharp(originalBuf)
      .extract({ left: cropX, top: cropY, width: cropSide, height: cropSide })
      .resize(BOARD_SIZE, BOARD_SIZE, { fit: 'fill' })
      .jpeg({ quality: 92 })
      .toBuffer();
    const croppedBase64 = croppedJpeg.toString('base64');
    const mimeType = 'image/jpeg';
    const base64Data = croppedBase64;

    const PROMPT = `You are reading a chess board from a screenshot. Read it SQUARE BY SQUARE — never skip any square.

ORIENTATION:
- If you see file labels a–h along an edge and rank labels 1–8 along the other edge, use them as ground truth. The labels show you where each square is.
- Otherwise assume White is on the bottom (rank 1 = bottom row, file a = left column).

OUTPUT — return a JSON object with an 8-row grid covering EVERY square, from rank 8 down to rank 1, files a→h.

Each square's value is one of:
- "."  (empty square)
- "K","Q","R","B","N","P"  (WHITE piece — uppercase = light-colored piece)
- "k","q","r","b","n","p"  (BLACK piece — lowercase = dark-colored piece)

CRITICAL RULES — read carefully:
1. PIECE COLOR (most important — get this right!):
   - WHITE pieces are LIGHT-colored (cream / off-white / ivory). They appear pale against any square.
   - BLACK pieces are DARK-colored (dark brown, charcoal, or solid black). They appear dark against any square.
   - The piece's color is NEVER determined by the square it sits on. A white knight on a dark square is still WHITE. A black bishop on a light square is still BLACK.
   - When a light piece sits on a light square, look for the SHADOW or OUTLINE that distinguishes it from the square — it is still white.
   - When a dark piece sits on a dark square, the piece will still be visibly darker / more saturated than the square — it is still black.
   - For each piece, ask yourself: "Is the BODY of this piece lighter or darker than a neutral gray?" Lighter = white. Darker = black.
2. Distinguishing pieces by silhouette:
   - PAWN ♟ — small, simple round head on a base. The most common piece. Shorter than other pieces.
   - ROOK ♜ — castle/tower shape with crenellations (square teeth) on top.
   - KNIGHT ♞ — a horse head, faces sideways.
   - BISHOP ♝ — tall with a pointed/mitered top, often with a small slit/notch.
   - QUEEN ♛ — tall with a crown of multiple points/spikes around the top.
   - KING ♚ — tall with a CROSS or "+" on top. Only ONE per color.
3. EXACTLY 1 white king and 1 black king must appear. Count them at the end. If wrong, re-look.
4. NO pawns may sit on rank 1 or rank 8. If you see a piece there, it is NOT a pawn.
5. Maximum 8 pawns per color, max 32 pieces total.
6. Empty squares ARE empty — do not invent pieces. If unsure whether a square has a piece, it is probably empty.
7. FINAL COLOR PASS: Before responding, scan your output and re-check the color of every piece against the image. Pieces that look pale/cream in the image must be uppercase. Pieces that look dark/black must be lowercase. Wrong-color pieces are the most common scan error — fix them now.

WHOSE TURN: Look for any "White to move" / "Black to move" label, evaluation bar arrow, or highlighted last-move squares. Default "w" if unclear.

Return ONLY this JSON, no markdown:
{
  "rank8": ["?","?","?","?","?","?","?","?"],   // files a..h on rank 8
  "rank7": ["?","?","?","?","?","?","?","?"],
  "rank6": ["?","?","?","?","?","?","?","?"],
  "rank5": ["?","?","?","?","?","?","?","?"],
  "rank4": ["?","?","?","?","?","?","?","?"],
  "rank3": ["?","?","?","?","?","?","?","?"],
  "rank2": ["?","?","?","?","?","?","?","?"],
  "rank1": ["?","?","?","?","?","?","?","?"],
  "active_color": "w" | "b",
  "confidence": "high" | "medium" | "low",
  "notes": "<one-line description of the position>"
}`;

    type ScanResp = {
      rank8?: string[]; rank7?: string[]; rank6?: string[]; rank5?: string[];
      rank4?: string[]; rank3?: string[]; rank2?: string[]; rank1?: string[];
      pieces?: string[]; // legacy fallback if model still returns piece list
      active_color?: string; confidence?: string; notes?: string;
    };

    async function callOnce(): Promise<ScanResp> {
      const r = await ai.chat.completions.create({
        model: "gpt-5.2",
        max_completion_tokens: 4000,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}`, detail: "high" } },
          ],
        }],
        response_format: { type: "json_object" },
      });
      const c = r.choices[0]?.message?.content ?? "{}";
      try { return JSON.parse(c) as ScanResp; } catch { return {}; }
    }

    function gridToPieces(p: ScanResp): string[] {
      const ranks: Array<[number, string[] | undefined]> = [
        [8, p.rank8], [7, p.rank7], [6, p.rank6], [5, p.rank5],
        [4, p.rank4], [3, p.rank3], [2, p.rank2], [1, p.rank1],
      ];
      const out: string[] = [];
      for (const [rankNum, row] of ranks) {
        if (!Array.isArray(row) || row.length !== 8) continue;
        for (let f = 0; f < 8; f++) {
          const cell = (row[f] || '').trim();
          if (!cell || cell === '.' || cell === '?' || cell === '') continue;
          if (cell.length !== 1) continue;
          const isWhite = cell === cell.toUpperCase();
          const piece = cell.toUpperCase();
          if (!'KQRBNP'.includes(piece)) continue;
          const file = String.fromCharCode(97 + f);
          out.push(`${piece}${isWhite ? 'w' : 'b'}@${file}${rankNum}`);
        }
      }
      // Fallback if model returned the legacy pieces[] format
      if (out.length === 0 && Array.isArray(p.pieces)) return p.pieces;
      return out;
    }

    // Convert a ScanResp into an 8x8 string grid where each cell is one of
    //   '', 'K','Q','R','B','N','P','k','q','r','b','n','p'
    // Index [r][f] where r=0 is rank 8, f=0 is file a.
    function respToGrid(p: ScanResp): string[][] | null {
      const grid: string[][] = Array.from({ length: 8 }, () => Array(8).fill(''));
      const rows: Array<string[] | undefined> = [p.rank8, p.rank7, p.rank6, p.rank5, p.rank4, p.rank3, p.rank2, p.rank1];
      let validRows = 0;
      for (let r = 0; r < 8; r++) {
        const row = rows[r];
        if (!Array.isArray(row) || row.length !== 8) continue;
        validRows++;
        for (let f = 0; f < 8; f++) {
          const cell = (row[f] || '').trim();
          if (!cell || cell === '.' || cell === '?' || cell === '_' || cell === '-') { grid[r][f] = ''; continue; }
          if (cell.length !== 1) { grid[r][f] = ''; continue; }
          if (!'KQRBNPkqrbnp'.includes(cell)) { grid[r][f] = ''; continue; }
          grid[r][f] = cell;
        }
      }
      // Try legacy pieces[] format
      if (validRows < 4 && Array.isArray(p.pieces)) {
        for (const raw of p.pieces) {
          const m = String(raw).trim().match(/^([KQRBNP])([wb])@([a-h])([1-8])$/i);
          if (!m) continue;
          const piece = m[1].toUpperCase();
          const isWhite = m[2].toLowerCase() === 'w';
          const file = m[3].toLowerCase().charCodeAt(0) - 97;
          const rank = parseInt(m[4]);
          const r = 8 - rank;
          grid[r][file] = isWhite ? piece : piece.toLowerCase();
        }
        validRows = 8;
      }
      return validRows >= 4 ? grid : null;
    }

    // Per-square majority vote across multiple grids.
    function voteGrid(grids: string[][][]): string[][] {
      const out: string[][] = Array.from({ length: 8 }, () => Array(8).fill(''));
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const counts: Record<string, number> = {};
          for (const g of grids) counts[g[r][f]] = (counts[g[r][f]] || 0) + 1;
          // Pick the value with highest count; break ties by preferring non-empty
          let best = '';
          let bestCount = -1;
          for (const [v, c] of Object.entries(counts)) {
            if (c > bestCount || (c === bestCount && v !== '' && best === '')) {
              best = v; bestCount = c;
            }
          }
          out[r][f] = best;
        }
      }
      return out;
    }

    function gridDirectToPieces(grid: string[][]): string[] {
      const out: string[] = [];
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const cell = grid[r][f];
          if (!cell) continue;
          const piece = cell.toUpperCase();
          const isWhite = cell === piece;
          const file = String.fromCharCode(97 + f);
          const rank = 8 - r;
          out.push(`${piece}${isWhite ? 'w' : 'b'}@${file}${rank}`);
        }
      }
      return out;
    }

    function piecesToFen(pieces: string[], activeColor: string): string | null {
      const board: (string | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
      const pieceMap: Record<string, string> = {
        Kw: 'K', Qw: 'Q', Rw: 'R', Bw: 'B', Nw: 'N', Pw: 'P',
        Kb: 'k', Qb: 'q', Rb: 'r', Bb: 'b', Nb: 'n', Pb: 'p',
      };
      for (const raw of pieces) {
        const m = raw.trim().match(/^([KQRBNP])([wb])@([a-h])([1-8])$/i);
        if (!m) continue;
        const key = m[1].toUpperCase() + m[2].toLowerCase();
        const fenPiece = pieceMap[key];
        if (!fenPiece) continue;
        const file = m[3].toLowerCase().charCodeAt(0) - 97; // 0-7
        const rank = parseInt(m[4]) - 1; // 0-7
        // FEN rank 8 = board[0], rank 1 = board[7]
        const row = 7 - rank;
        board[row][file] = fenPiece;
      }
      const ranks: string[] = [];
      for (let r = 0; r < 8; r++) {
        let line = '';
        let empty = 0;
        for (let f = 0; f < 8; f++) {
          const p = board[r][f];
          if (p) {
            if (empty > 0) { line += empty.toString(); empty = 0; }
            line += p;
          } else {
            empty++;
          }
        }
        if (empty > 0) line += empty.toString();
        ranks.push(line);
      }
      const placement = ranks.join('/');
      const turn = activeColor === 'b' ? 'b' : 'w';
      return `${placement} ${turn} - - 0 1`;
    }

    function scoreParse(pieces: string[]): number {
      let kw = 0, kb = 0, total = 0;
      const seenSquares = new Set<string>();
      for (const raw of pieces) {
        const m = raw.trim().match(/^([KQRBNP])([wb])@([a-h])([1-8])$/i);
        if (!m) continue;
        const sq = (m[3] + m[4]).toLowerCase();
        if (seenSquares.has(sq)) return -1; // two pieces on same square = invalid
        seenSquares.add(sq);
        const piece = m[1].toUpperCase();
        const color = m[2].toLowerCase();
        if (piece === 'P' && (m[4] === '1' || m[4] === '8')) return -1; // pawn on back rank
        if (piece === 'K' && color === 'w') kw++;
        if (piece === 'K' && color === 'b') kb++;
        total++;
      }
      if (kw !== 1 || kb !== 1) return 0;
      if (total > 32) return 0;
      return total;
    }

    // 3-pass parallel: per-square majority vote across the grids.
    const passes = await Promise.all([callOnce(), callOnce(), callOnce()]);
    const grids = passes.map(respToGrid).filter((g): g is string[][] => g !== null);

    if (grids.length === 0) {
      res.status(422).json({ error: "Could not recognize a chess position in this image." });
      return;
    }

    const voted = voteGrid(grids);

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 4 — Pixel-based color override.
    // We now have the board perfectly cropped to BOARD_SIZE×BOARD_SIZE, so an
    // 8×8 grid lines up exactly with the squares. For each piece the AI found:
    //  • sample edge pixels to estimate the square's base color
    //  • pick the center pixels most different from base — those ARE the piece
    //  • record that piece's mean luminance
    // Then cluster the luminances into two groups (light vs dark) with k-means
    // and override the AI's color based on which cluster each piece falls in.
    // ─────────────────────────────────────────────────────────────────────────
    try {
      const SZ = rawInfo.width;            // 640
      const CELL = SZ / 8;                 // 80
      const data = rawRGB;

      function pieceBrightness(r: number, f: number): { lum: number; delta: number } | null {
        const cx0 = Math.floor(f * CELL);
        const cy0 = Math.floor(r * CELL);
        const cx1 = Math.floor((f + 1) * CELL);
        const cy1 = Math.floor((r + 1) * CELL);
        const cellW = cx1 - cx0;
        const cellH = cy1 - cy0;
        // Base (square) color = mean of edge strips (7% thick)
        const edge = Math.max(2, Math.floor(cellW * 0.07));
        let bR = 0, bG = 0, bB = 0, bN = 0;
        for (let dy = 0; dy < cellH; dy++) {
          for (let dx = 0; dx < cellW; dx++) {
            const onEdge = dx < edge || dx >= cellW - edge || dy < edge || dy >= cellH - edge;
            if (!onEdge) continue;
            const idx = ((cy0 + dy) * SZ + (cx0 + dx)) * 3;
            bR += data[idx]; bG += data[idx + 1]; bB += data[idx + 2]; bN++;
          }
        }
        if (bN === 0) return null;
        bR /= bN; bG /= bN; bB /= bN;

        // Center region (70%) — collect every pixel's delta from base
        const cPad = Math.floor(cellW * 0.15);
        const pixels: Array<{ lum: number; delta: number }> = [];
        for (let dy = cPad; dy < cellH - cPad; dy++) {
          for (let dx = cPad; dx < cellW - cPad; dx++) {
            const idx = ((cy0 + dy) * SZ + (cx0 + dx)) * 3;
            const R = data[idx], G = data[idx + 1], B = data[idx + 2];
            const dR = R - bR, dG = G - bG, dB = B - bB;
            const delta = Math.sqrt(dR * dR + dG * dG + dB * dB);
            const lum = 0.299 * R + 0.587 * G + 0.114 * B;
            pixels.push({ lum, delta });
          }
        }
        if (pixels.length === 0) return null;
        // Top 25% highest-delta pixels = the piece body
        pixels.sort((a, b) => b.delta - a.delta);
        const keep = Math.max(20, Math.floor(pixels.length * 0.25));
        let sumL = 0, sumD = 0;
        for (let i = 0; i < keep; i++) { sumL += pixels[i].lum; sumD += pixels[i].delta; }
        return { lum: sumL / keep, delta: sumD / keep };
      }

      const occupied: Array<{ r: number; f: number; piece: string; lum: number }> = [];
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const cell = voted[r][f];
          if (!cell) continue;
          const m = pieceBrightness(r, f);
          if (!m) continue;
          // Only consider squares where there is clearly a piece (delta from square > 25)
          if (m.delta < 20) continue;
          occupied.push({ r, f, piece: cell, lum: m.lum });
        }
      }

      if (occupied.length >= 2) {
        // k-means with k=2 on luminance
        const lums = occupied.map(o => o.lum).slice().sort((a, b) => a - b);
        let cLow = lums[Math.floor(lums.length * 0.2)];
        let cHigh = lums[Math.floor(lums.length * 0.8)];
        for (let iter = 0; iter < 30; iter++) {
          const lowG: number[] = [], highG: number[] = [];
          for (const l of lums) {
            if (Math.abs(l - cLow) <= Math.abs(l - cHigh)) lowG.push(l); else highG.push(l);
          }
          if (lowG.length === 0 || highG.length === 0) break;
          const nL = lowG.reduce((a, b) => a + b, 0) / lowG.length;
          const nH = highG.reduce((a, b) => a + b, 0) / highG.length;
          if (Math.abs(nL - cLow) < 0.5 && Math.abs(nH - cHigh) < 0.5) { cLow = nL; cHigh = nH; break; }
          cLow = nL; cHigh = nH;
        }
        const threshold = (cLow + cHigh) / 2;
        const separation = cHigh - cLow;

        // Require real separation (≥20 luminance units between clusters). If all pieces
        // are roughly the same brightness (e.g. only one color on the board), skip override.
        if (separation >= 20) {
          for (const { r, f, piece, lum } of occupied) {
            const shouldBeWhite = lum > threshold;
            if (shouldBeWhite && piece === piece.toLowerCase()) {
              voted[r][f] = piece.toUpperCase();
            } else if (!shouldBeWhite && piece === piece.toUpperCase()) {
              voted[r][f] = piece.toLowerCase();
            }
          }
        }
      }
    } catch (err) {
      req.log?.warn?.({ err }, "Pixel color override failed, keeping AI colors");
    }

    const votedPieces = gridDirectToPieces(voted);
    const votedScore = scoreParse(votedPieces);

    // If voted result is invalid (e.g. wrong king count), fall back to best individual pass
    let bestPieces: string[];
    let best: ScanResp;
    if (votedScore > 0) {
      bestPieces = votedPieces;
      // Pick best active_color/notes from passes that scored well
      const scored = passes.map(p => ({ p, s: scoreParse(gridToPieces(p)) }));
      scored.sort((a, b) => b.s - a.s);
      best = scored[0].p;
    } else {
      const scored = passes.map(p => ({ p, pieces: gridToPieces(p), s: scoreParse(gridToPieces(p)) }));
      scored.sort((a, b) => b.s - a.s);
      bestPieces = scored[0].pieces;
      best = scored[0].p;
    }

    if (bestPieces.length === 0) {
      res.status(422).json({ error: "Could not recognize a chess position in this image." });
      return;
    }

    // Clean obviously-impossible artifacts before building the FEN:
    // pawns cannot live on rank 1 or rank 8 — drop them if the AI placed any there.
    // Piece format produced by gridDirectToPieces is `${PIECE}${w|b}@${file}${rank}` (e.g. "Pw@e2").
    const cleanedPieces = bestPieces.filter(ps => {
      const m = ps.match(/^([KQRBNP])([wb])@([a-h])([1-8])$/i);
      if (!m) return true; // keep non-matching entries — piecesToFen will skip them itself
      const piece = m[1].toUpperCase();
      const rank = parseInt(m[4], 10);
      if (piece === 'P' && (rank === 1 || rank === 8)) return false;
      return true;
    });

    const builtFen = piecesToFen(cleanedPieces, best.active_color || 'w');
    if (!builtFen) {
      res.status(422).json({ error: "Could not parse the recognized position." });
      return;
    }

    // Try strict validation; if it fails, return the built FEN anyway so the user can
    // see what was detected and fix it on the board instead of getting a hard error.
    let validatedFen: string = builtFen;
    try {
      const chess = new Chess(builtFen);
      validatedFen = chess.fen();
    } catch {
      validatedFen = builtFen;
    }

    // Confidence based on how strongly the passes agreed.
    // Count how many of the 64 squares had unanimous agreement across all grids.
    let unanimous = 0;
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const v = grids[0][r][f];
        if (grids.every(g => g[r][f] === v)) unanimous++;
      }
    }
    const agreementRatio = unanimous / 64;
    let confidence: string;
    if (agreementRatio >= 0.97) confidence = "high";
    else if (agreementRatio >= 0.9) confidence = "medium";
    else confidence = "low";

    res.json({
      fen: validatedFen,
      confidence,
      notes: best.notes || "",
    });
  } catch (err: unknown) {
    req.log?.error?.({ err }, "Scan position error");
    res.status(500).json({ error: "Failed to analyze the image. Please try again." });
  }
});

export default router;
