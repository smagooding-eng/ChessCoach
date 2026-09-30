// Run manually via Render's Shell tab:
//   node /repo/lib/db/scripts/create-push-subscriptions-table.mjs
//
// Uses the pg driver directly (no @workspace/db, no Drizzle) -- see
// create-shop-items-table.mjs in this same folder for why: importing
// @workspace/db's schema graph through plain `node` hits Node's strict
// ESM module resolution in ways bundlers silently paper over. This
// script only needs the pg driver, which resolves correctly from here
// because this script lives inside lib/db's own directory, same as
// index.ts's own `import pg from "pg"`.

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set in this environment. Run this somewhere with the same DATABASE_URL as the live server (e.g. Render's Shell tab for this service).");
    process.exit(1);
  }

  console.log("Connecting directly via pg...");
  const pg = (await import("pg")).default;
  const { Client } = pg;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    console.log("Creating push_subscriptions table (if it doesn't already exist)...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL,
        endpoint text NOT NULL UNIQUE,
        p256dh text NOT NULL,
        auth text NOT NULL,
        user_agent text,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_success_at timestamptz
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id)
    `);

    console.log("\nVerifying table now exists...");
    const result = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'push_subscriptions'
      ORDER BY ordinal_position
    `);
    if (!result.rows || result.rows.length === 0) {
      console.error("\nSTILL MISSING: push_subscriptions has no columns even after this ran without throwing. Something deeper is wrong -- possibly a permissions issue, or this is targeting a different database than expected.");
      process.exit(1);
    }
    console.log(`push_subscriptions now has ${result.rows.length} column(s):`);
    for (const row of result.rows) {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    }
    console.log("\nDone. The push notification system is safe to use now, once VAPID env vars and web-push are also set up (see the delivery notes).");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  console.error("Message:", err?.message);
  process.exit(1);
});
