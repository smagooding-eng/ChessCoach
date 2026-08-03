import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from "./lib/stripeClient";
import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { createServer } from "http";
import { attachLiveServer, seedBotPersonas } from "./lib/liveServer";

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

    logger.info('Schema migrations complete');
  } catch (err) {
    logger.error({ err }, 'Schema migration failed');
    throw err;
  }
}

const httpServer = createServer(app);
attachLiveServer(httpServer);
httpServer.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});

runSchemaMigrations().then(() => {
  void seedBotPersonas().catch((err) => logger.warn({ err }, 'seedBotPersonas failed'));
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

import("./lib/puzzleSeed").then(({ seedPuzzlesIfNeeded, preGenerateExplanations }) => {
  seedPuzzlesIfNeeded().then(() => {
    preGenerateExplanations().catch((err: any) => {
      logger.error({ err }, "Puzzle explanation pre-generation failed");
    });
  }).catch((err: any) => {
    logger.error({ err }, "Puzzle seed failed");
  });
}).catch(() => {});
