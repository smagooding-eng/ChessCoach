import { runMigrations } from 'stripe-replit-sync';
import { ensureAnalyticsViews } from "./lib/analyticsExclusions";
import { getStripeSync } from "./lib/stripeClient";
import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { createServer } from "http";
import { attachLiveServer, seedBotPersonas } from "./lib/liveServer";
import { startDailySweep } from "./lib/correspondence";
import { startTournamentEngine } from "./lib/tournamentEngine";
import { ensurePublicPlayersTable, startPublicPlayersRefresher } from "./lib/publicPlayers";

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL environment variable is required for Stripe integration.'
    );
  }

  try {
    logger.info('Initializing Stripe schema...');
    await runMigrations({ databaseUrl });
    logger.info('Stripe schema ready');

    const stripeSync = await getStripeSync();

    logger.info('Setting up managed webhook...');
    const publicAppUrl = process.env.PUBLIC_APP_URL;
    if (!publicAppUrl) {
      throw new Error(
        'PUBLIC_APP_URL environment variable is required (e.g. https://your-api.onrender.com).'
      );
    }
    const webhookBaseUrl = publicAppUrl.replace(/\/+$/, '');
    const webhookResult = await stripeSync.findOrCreateManagedWebhook(
      `${webhookBaseUrl}/api/stripe/webhook`);
    logger.info({ url: webhookResult?.webhook?.url || 'setup complete' }, 'Webhook configured');

    stripeSync.syncBackfill()
      .then(() => {
        logger.info('Stripe data synced');
      })
      .catch((err: any) => {
        logger.error({ err }, 'Error syncing Stripe data');
      });
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Stripe (server will continue without Stripe)');
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function runSchemaMigrations() {
  try {
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium_override BOOLEAN NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS scout_username VARCHAR`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_opt_out BOOLEAN NOT NULL DEFAULT false`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_page_views_user_time ON page_views(user_id, created_at DESC)`);
    // Crawlers, link-preview fetchers, scripts and automated browsers (see
    // lib/botDetect): kept apart from page_views so people stats exclude them.
    await db.execute(sql`CREATE TABLE IF NOT EXISTS bot_visits (
      id SERIAL PRIMARY KEY,
      path VARCHAR NOT NULL,
      kind VARCHAR NOT NULL,
      user_agent TEXT,
      ip_address VARCHAR,
      source VARCHAR NOT NULL DEFAULT 'browser',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_bot_visits_time ON bot_visits(created_at DESC)`);
    // One row per player per day they opened the app (for "active every week" checks).
    await db.execute(sql`CREATE TABLE IF NOT EXISTS user_activity_days (
      user_id VARCHAR NOT NULL,
      day DATE NOT NULL,
      PRIMARY KEY (user_id, day)
    )`);
    // Beginner Path + Chess for Kids progress and the account's Kid Mode flag (routes/learnProgress.ts).
    await db.execute(sql`CREATE TABLE IF NOT EXISTS learn_progress (
      user_id VARCHAR PRIMARY KEY,
      beginner JSONB,
      kids JSONB,
      kid_mode BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS users_scout_username_lower_idx ON users (LOWER(scout_username))`);
    await db.execute(sql`UPDATE users SET is_premium_override = true WHERE email = 'lukakhvedelidze97@gmail.com' AND is_premium_override = false`);

    await db.execute(sql`CREATE TABLE IF NOT EXISTS growth_credentials (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      platform VARCHAR NOT NULL UNIQUE,
      credentials TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    await db.execute(sql`CREATE TABLE IF NOT EXISTS growth_campaigns (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR NOT NULL,
      theme VARCHAR NOT NULL,
      platforms JSONB NOT NULL,
      frequency VARCHAR NOT NULL,
      custom_note TEXT,
      status VARCHAR NOT NULL DEFAULT 'active',
      next_run_at TIMESTAMPTZ,
      last_run_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_campaigns_status ON growth_campaigns(status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_campaigns_next_run ON growth_campaigns(next_run_at)`);

    await db.execute(sql`CREATE TABLE IF NOT EXISTS growth_post_log (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id VARCHAR,
      platform VARCHAR NOT NULL,
      content TEXT NOT NULL,
      title TEXT,
      status VARCHAR NOT NULL DEFAULT 'pending',
      error TEXT,
      external_id VARCHAR,
      posted_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_post_log_campaign ON growth_post_log(campaign_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_post_log_platform ON growth_post_log(platform)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_post_log_posted ON growth_post_log(posted_at)`);

    await db.execute(sql`CREATE TABLE IF NOT EXISTS email_drip_log (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL,
      drip_type VARCHAR NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await db.execute(sql`DROP INDEX IF EXISTS idx_drip_user_type`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_drip_user_type ON email_drip_log(user_id, drip_type)`);

    await db.execute(sql`CREATE TABLE IF NOT EXISTS user_live_ratings (
      user_id VARCHAR NOT NULL,
      time_control VARCHAR NOT NULL,
      rating REAL NOT NULL DEFAULT 1500,
      rd REAL NOT NULL DEFAULT 350,
      vol REAL NOT NULL DEFAULT 0.06,
      games_played INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, time_control)
    )`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS bot_personas (
      id VARCHAR PRIMARY KEY,
      username VARCHAR NOT NULL,
      rating INTEGER NOT NULL,
      country VARCHAR,
      title VARCHAR,
      avatar VARCHAR,
      member_since_year INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS live_games (
      id VARCHAR PRIMARY KEY,
      mode VARCHAR NOT NULL,
      time_control VARCHAR NOT NULL,
      white_user_id VARCHAR,
      black_user_id VARCHAR,
      white_username VARCHAR NOT NULL,
      black_username VARCHAR NOT NULL,
      white_persona_id VARCHAR,
      black_persona_id VARCHAR,
      result VARCHAR NOT NULL,
      termination VARCHAR NOT NULL,
      pgn TEXT NOT NULL,
      white_rating_before REAL,
      black_rating_before REAL,
      white_rating_after REAL,
      black_rating_after REAL,
      started_at TIMESTAMPTZ NOT NULL,
      finished_at TIMESTAMPTZ NOT NULL
    )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_live_games_white_user ON live_games(white_user_id, finished_at DESC)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_live_games_black_user ON live_games(black_user_id, finished_at DESC)`);

    // Daily (correspondence) games + challenge links. Created here as well as
    // in the drizzle schema so production gets them without a manual push.
    await db.execute(sql`CREATE TABLE IF NOT EXISTS correspondence_games (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      time_control VARCHAR NOT NULL,
      mode VARCHAR NOT NULL DEFAULT 'casual',
      white_user_id VARCHAR NOT NULL,
      black_user_id VARCHAR NOT NULL,
      white_username VARCHAR NOT NULL,
      black_username VARCHAR NOT NULL,
      white_is_bot INTEGER NOT NULL DEFAULT 0,
      black_is_bot INTEGER NOT NULL DEFAULT 0,
      pgn TEXT NOT NULL DEFAULT '',
      fen TEXT NOT NULL,
      turn_user_id VARCHAR NOT NULL,
      white_bank_ms INTEGER NOT NULL,
      black_bank_ms INTEGER NOT NULL,
      last_move_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      status VARCHAR NOT NULL DEFAULT 'active',
      result VARCHAR,
      termination VARCHAR,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at TIMESTAMPTZ
    )`);
    for (const col of [
      sql`ALTER TABLE correspondence_games ADD COLUMN IF NOT EXISTS mode VARCHAR NOT NULL DEFAULT 'casual'`,
      sql`ALTER TABLE correspondence_games ADD COLUMN IF NOT EXISTS white_rating_before INTEGER`,
      sql`ALTER TABLE correspondence_games ADD COLUMN IF NOT EXISTS black_rating_before INTEGER`,
      sql`ALTER TABLE correspondence_games ADD COLUMN IF NOT EXISTS white_rating_after INTEGER`,
      sql`ALTER TABLE correspondence_games ADD COLUMN IF NOT EXISTS black_rating_after INTEGER`,
      sql`ALTER TABLE correspondence_games ADD COLUMN IF NOT EXISTS white_games_id INTEGER`,
      sql`ALTER TABLE correspondence_games ADD COLUMN IF NOT EXISTS black_games_id INTEGER`,
      sql`ALTER TABLE correspondence_games ADD COLUMN IF NOT EXISTS draw_offer_from VARCHAR`,
      sql`ALTER TABLE correspondence_games ADD COLUMN IF NOT EXISTS low_time_notified_at TIMESTAMPTZ`,
    ]) await db.execute(col);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_correspondence_white_user ON correspondence_games(white_user_id, status)`);
    // Daily games are people-only now: close any still-running games against
    // the old automatic daily bot (it never actually moved).
    await db.execute(sql`UPDATE correspondence_games SET status = 'finished', termination = 'aborted', finished_at = now()
      WHERE status = 'active' AND (white_is_bot = 1 OR black_is_bot = 1)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_correspondence_black_user ON correspondence_games(black_user_id, status)`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS correspondence_queue (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL,
      username VARCHAR NOT NULL,
      time_control VARCHAR NOT NULL,
      mode VARCHAR NOT NULL DEFAULT 'casual',
      rating INTEGER NOT NULL DEFAULT 1200,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await db.execute(sql`ALTER TABLE correspondence_queue ADD COLUMN IF NOT EXISTS mode VARCHAR NOT NULL DEFAULT 'casual'`);
    await db.execute(sql`ALTER TABLE correspondence_queue ADD COLUMN IF NOT EXISTS rating INTEGER NOT NULL DEFAULT 1200`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS game_challenges (
      code VARCHAR PRIMARY KEY,
      creator_user_id VARCHAR NOT NULL,
      creator_username VARCHAR NOT NULL,
      kind VARCHAR NOT NULL,
      time_control VARCHAR NOT NULL,
      mode VARCHAR NOT NULL DEFAULT 'casual',
      color VARCHAR NOT NULL DEFAULT 'random',
      status VARCHAR NOT NULL DEFAULT 'open',
      accepted_by_user_id VARCHAR,
      accepted_by_username VARCHAR,
      game_id VARCHAR,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_game_challenges_creator ON game_challenges(creator_user_id, status)`);
    // Open (reusable) challenge links + the requests made through them.
    await db.execute(sql`ALTER TABLE game_challenges ADD COLUMN IF NOT EXISTS open BOOLEAN NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE game_challenges ADD COLUMN IF NOT EXISTS parent_code VARCHAR`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_game_challenges_parent ON game_challenges(parent_code, status)`);
    // Challenges someone opened but hasn't answered yet (shown on their home + Play screens).
    // Landing-page funnel events. This table existed only in the schema file
    // and was never created on the production database, so every funnel event
    // failed to save and the admin Funnel panel always errored.
    await db.execute(sql`CREATE TABLE IF NOT EXISTS landing_funnel_events (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      visitor_id VARCHAR NOT NULL,
      event_type VARCHAR NOT NULL,
      platform VARCHAR NOT NULL DEFAULT 'web',
      elapsed_ms INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await db.execute(sql`ALTER TABLE landing_funnel_events ADD COLUMN IF NOT EXISTS platform VARCHAR NOT NULL DEFAULT 'web'`);
    await db.execute(sql`ALTER TABLE landing_funnel_events ADD COLUMN IF NOT EXISTS elapsed_ms INTEGER`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_landing_funnel_created ON landing_funnel_events(created_at, platform)`);
    // Reporting views that leave the owner's accounts and suspected bots out of the admin numbers.
    await ensureAnalyticsViews();
    // Practice-bot results: each player's record against each bot, and how
    // many different players have beaten it.
    await db.execute(sql`CREATE TABLE IF NOT EXISTS bot_results (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR NOT NULL,
      bot VARCHAR NOT NULL,
      result VARCHAR NOT NULL,
      moves INTEGER NOT NULL DEFAULT 0,
      game_key VARCHAR NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, game_key)
    )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_bot_results_bot ON bot_results(bot, result)`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS challenge_invites (
      user_id VARCHAR NOT NULL,
      code VARCHAR NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      dismissed_at TIMESTAMPTZ,
      PRIMARY KEY (user_id, code)
    )`);
    // In-app notifications (the bell). Push is a copy of these for when the app is closed.
    await db.execute(sql`CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL,
      title VARCHAR NOT NULL,
      body TEXT NOT NULL,
      url VARCHAR,
      kind VARCHAR NOT NULL DEFAULT 'general',
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC)`);
    // Friends: one row per pair. requester asked, addressee answers.
    await db.execute(sql`CREATE TABLE IF NOT EXISTS friendships (
      id SERIAL PRIMARY KEY,
      requester_id VARCHAR NOT NULL,
      addressee_id VARCHAR NOT NULL,
      status VARCHAR NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      accepted_at TIMESTAMPTZ,
      UNIQUE (requester_id, addressee_id)
    )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id, status)`);
    // Direct messages between friends (challenge_code: a challenge sent in the chat).
    await db.execute(sql`CREATE TABLE IF NOT EXISTS direct_messages (
      id SERIAL PRIMARY KEY,
      sender_id VARCHAR NOT NULL,
      recipient_id VARCHAR NOT NULL,
      body TEXT NOT NULL,
      challenge_code VARCHAR,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      read_at TIMESTAMPTZ
    )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_dm_pair ON direct_messages(sender_id, recipient_id, created_at DESC)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_dm_recipient_unread ON direct_messages(recipient_id) WHERE read_at IS NULL`);
    // Arena tournaments (admin-created). Players are paired continuously while it runs.
    await db.execute(sql`CREATE TABLE IF NOT EXISTS tournaments (
      id VARCHAR PRIMARY KEY,
      name VARCHAR NOT NULL,
      description TEXT,
      time_control VARCHAR NOT NULL,
      mode VARCHAR NOT NULL DEFAULT 'casual',
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      status VARCHAR NOT NULL DEFAULT 'scheduled',
      created_by VARCHAR NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS tournament_players (
      tournament_id VARCHAR NOT NULL,
      user_id VARCHAR NOT NULL,
      username VARCHAR NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      games INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      withdrawn BOOLEAN NOT NULL DEFAULT false,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (tournament_id, user_id)
    )`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS tournament_games (
      id SERIAL PRIMARY KEY,
      tournament_id VARCHAR NOT NULL,
      game_id VARCHAR NOT NULL,
      white_user_id VARCHAR NOT NULL,
      black_user_id VARCHAR NOT NULL,
      white_username VARCHAR NOT NULL,
      black_username VARCHAR NOT NULL,
      result VARCHAR,
      termination VARCHAR,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at TIMESTAMPTZ,
      UNIQUE (game_id)
    )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_tournament_games_t ON tournament_games(tournament_id, started_at DESC)`);
    // Tournament formats: arena (continuous pairing) or bracket (knockout);
    // live or daily games; open to everyone or Pro only; brackets have no
    // fixed end (they finish with the final).
    await db.execute(sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS format VARCHAR NOT NULL DEFAULT 'arena'`);
    await db.execute(sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS kind VARCHAR NOT NULL DEFAULT 'live'`);
    await db.execute(sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS eligibility VARCHAR NOT NULL DEFAULT 'all'`);
    await db.execute(sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS max_players INTEGER`);
    await db.execute(sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS total_rounds INTEGER`);
    await db.execute(sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS winner_user_id VARCHAR`);
    await db.execute(sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS winner_username VARCHAR`);
    // Player-created tournaments: unlisted (reached by their share link) and
    // credited to their creator.
    await db.execute(sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS visibility VARCHAR NOT NULL DEFAULT 'public'`);
    await db.execute(sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS created_by_name VARCHAR`);
    // Organizer branding: club name + logo (logo bytes live in their own table).
    await db.execute(sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS club_name VARCHAR`);
    await db.execute(sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS logo_version INTEGER`);
    await import("./lib/tournamentEntries").then((m) => m.ensureTournamentEntryTables());
    await db.execute(sql`CREATE TABLE IF NOT EXISTS tournament_logos (
      tournament_id VARCHAR PRIMARY KEY,
      mime VARCHAR NOT NULL,
      data TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await db.execute(sql`ALTER TABLE tournaments ALTER COLUMN ends_at DROP NOT NULL`);
    await db.execute(sql`ALTER TABLE tournament_games ADD COLUMN IF NOT EXISTS kind VARCHAR NOT NULL DEFAULT 'live'`);
    await db.execute(sql`ALTER TABLE tournament_games ADD COLUMN IF NOT EXISTS match_id INTEGER`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS tournament_matches (
      id SERIAL PRIMARY KEY,
      tournament_id VARCHAR NOT NULL,
      round INTEGER NOT NULL,
      slot INTEGER NOT NULL,
      a_id VARCHAR, a_name VARCHAR, a_seed INTEGER,
      b_id VARCHAR, b_name VARCHAR, b_seed INTEGER,
      status VARCHAR NOT NULL DEFAULT 'waiting',
      winner_id VARCHAR, winner_name VARCHAR,
      note VARCHAR,
      game_id VARCHAR,
      games_played INTEGER NOT NULL DEFAULT 0,
      deadline TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tournament_id, round, slot)
    )`);

    // Games played on ChessScout used to be saved without their owner, so
    // they never showed in the Games tab. Link them to their players, and
    // file games against a bot under 'bot'. Safe to re-run (only touches
    // rows still missing an owner / still 'chessscout').
    try {
      for (const side of ['white', 'black'] as const) {
        const uid = sql.raw(`lg.${side}_user_id`), uname = sql.raw(`lg.${side}_username`);
        await db.execute(sql`UPDATE games g SET user_id = ${uid} FROM live_games lg
          WHERE g.platform = 'chessscout' AND g.user_id IS NULL AND ${uid} IS NOT NULL
            AND g.played_at = lg.started_at AND LOWER(g.username) = LOWER(${uname})`);
        const cgUid = sql.raw(`cg.${side}_user_id`), cgGid = sql.raw(`cg.${side}_games_id`);
        await db.execute(sql`UPDATE games g SET user_id = ${cgUid} FROM correspondence_games cg
          WHERE g.id = ${cgGid} AND g.user_id IS NULL`);
      }
      await db.execute(sql`UPDATE games g SET platform = 'bot' FROM live_games lg
        WHERE g.platform = 'chessscout' AND g.played_at = lg.started_at
          AND (lg.white_persona_id IS NOT NULL OR lg.black_persona_id IS NOT NULL)
          AND (LOWER(g.username) = LOWER(lg.white_username) OR LOWER(g.username) = LOWER(lg.black_username))`);
    } catch (err) {
      logger.warn({ err }, 'ChessScout games owner backfill failed');
    }

    logger.info('Schema migrations complete');
  } catch (err) {
    logger.error({ err }, 'Schema migration failed');
    throw err;
  }
}

const httpServer = createServer(app);
attachLiveServer(httpServer);
startDailySweep();
startTournamentEngine();
// Official scheduled tournaments (nightly blitz, weekend knockout, weekly daily).
import("./lib/officialTournaments").then(({ startOfficialTournaments }) => startOfficialTournaments()).catch((err) => logger.warn({ err }, "official tournaments start failed"));
httpServer.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});

runSchemaMigrations().then(() => {
  // Public player pages: table + slow weekly refresh from Chess.com.
  ensurePublicPlayersTable().then(() => startPublicPlayersRefresher()).catch((err) => logger.warn({ err }, 'public players setup failed'));
  // IndexNow: full submission of public pages at most once a week.
  import("./lib/indexNow").then(({ startIndexNow }) => startIndexNow()).catch((err) => logger.warn({ err }, 'indexnow start failed'));
  // Club outreach: weekly search for new club / organizer contacts.
  import("./lib/clubOutreach").then(({ startClubOutreachSchedule }) => startClubOutreachSchedule()).catch((err) => logger.warn({ err }, 'club outreach start failed'));
  void seedBotPersonas().catch((err) => logger.warn({ err }, 'seedBotPersonas failed'));
  // "Review all": resume jobs cut off by a restart; Coach review after upgrading.
  import("./routes/games").then(({ startReviewServices }) => startReviewServices()).catch((err) => logger.warn({ err }, 'review services start failed'));
  import("./lib/growthScheduler").then(({ startGrowthScheduler }) => {
    startGrowthScheduler();
  }).catch((err) => {
    logger.error({ err }, "Growth scheduler failed to start");
  });
}).catch((err) => {
  logger.error({ err }, 'Schema migration error');
});

initStripe().catch((err) => {
  logger.error({ err }, 'Stripe init failed after server start');
});

import("./lib/puzzleSeed").then(({ seedPuzzlesIfNeeded }) => {
  // preGenerateExplanations() used to run automatically here on every
  // server startup. That's a real bug, not a minor inefficiency: this
  // app redeploys frequently, and every single restart re-triggered a
  // full OpenAI-powered pass over every puzzle still missing an
  // explanation. If a prior run got killed mid-pass by the next deploy
  // (very likely, given how many puzzles there are and how often this
  // service restarts), the next startup just started over from the same
  // point, burning real OpenAI cost on the same puzzles repeatedly
  // without making sustained progress. It's now a manual, admin-triggered
  // action instead -- see POST /api/admin/generate-puzzle-explanations --
  // so it runs deliberately, once, when actually wanted.
  seedPuzzlesIfNeeded().catch((err: any) => {
    logger.error({ err }, "Puzzle seed failed");
  });
}).catch(() => {});
