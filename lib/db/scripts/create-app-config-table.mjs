// Run manually via Render's Shell tab:
//   node /repo/lib/db/scripts/create-app-config-table.mjs
//
// Uses the pg driver directly -- see create-shop-items-table.mjs in this
// same folder for why (plain `node` can't resolve @workspace/db's own
// internal module graph the way a bundler does).

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
    console.log("Creating app_config table (if it doesn't already exist)...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_config (
        key varchar PRIMARY KEY,
        value text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by varchar
      )
    `);

    console.log("\nVerifying table now exists...");
    const result = await client.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'app_config' ORDER BY ordinal_position
    `);
    if (!result.rows || result.rows.length === 0) {
      console.error("\nSTILL MISSING: app_config has no columns even after this ran without throwing.");
      process.exit(1);
    }
    console.log(`app_config: ${result.rows.length} column(s) confirmed.`);
    console.log("\nDone. The global dashboard-redesign flag is safe to use now (defaults to off until an admin turns it on).");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  console.error("Message:", err?.message);
  process.exit(1);
});
