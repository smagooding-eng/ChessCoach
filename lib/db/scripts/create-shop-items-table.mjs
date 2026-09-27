// Run manually via Render's Shell tab:
//   node /repo/lib/db/scripts/create-shop-items-table.mjs
//
// Deliberately does NOT import @workspace/db or drizzle-orm at all --
// only the raw `pg` driver. The previous versions of this script tried
// to go through @workspace/db's index.ts, which re-exports its entire
// schema barrel (17 files) using plain relative imports with no file
// extensions. Bundlers (what the real server runs through) tolerate
// that; Node's own native module loader, run directly via plain `node`,
// does not -- and would have needed the same fix repeated across every
// file in that whole import graph, one at a time. Talking to Postgres
// directly sidesteps all of it: this only needs the `pg` package, which
// resolves correctly from here because this script lives inside
// lib/db's own directory, the same place index.ts's own `import pg
// from "pg"` already resolves successfully.

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set in this environment. Run this somewhere with the same DATABASE_URL as the live server (e.g. Render's Shell tab for this service).");
    process.exit(1);
  }

  console.log("Connecting directly via pg (no @workspace/db, no Drizzle)...");
  const pg = (await import("pg")).default;
  const { Client } = pg;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    console.log("Creating shop_items table (if it doesn't already exist)...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS shop_items (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        title varchar NOT NULL,
        description text,
        image_url text,
        amazon_url text NOT NULL,
        price_label varchar,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    console.log("\nVerifying table now exists...");
    const result = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'shop_items'
      ORDER BY ordinal_position
    `);
    if (!result.rows || result.rows.length === 0) {
      console.error("\nSTILL MISSING: shop_items has no columns even after this ran without throwing. Something deeper is wrong -- possibly a permissions issue, or this is targeting a different database than expected.");
      process.exit(1);
    }
    console.log(`shop_items now has ${result.rows.length} column(s):`);
    for (const row of result.rows) {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    }
    console.log("\nDone. The shop page and admin shop-management panel are safe to use now.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  console.error("Message:", err?.message);
  process.exit(1);
});
