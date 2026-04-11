import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from "./lib/stripeClient";
import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

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
    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
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
    logger.info('Schema migrations complete');
  } catch (err) {
    logger.error({ err }, 'Schema migration failed');
  }
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

runSchemaMigrations().catch((err) => {
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
