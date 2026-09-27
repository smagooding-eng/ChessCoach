// Run manually via Render's Shell tab:
//   node scripts/create-shop-items-table.mjs
//
// Plain JS, same reason as the other scripts in this folder: production
// only has production dependencies installed, and tsx isn't one of them.
// This project doesn't auto-run Drizzle migrations for the main schema
// on startup, so a schema.ts change alone does nothing to the live
// database -- this creates the table directly, once.

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set in this environment. Run this somewhere with the same DATABASE_URL as the live server (e.g. Render's Shell tab for this service).");
    process.exit(1);
  }

  console.log("Connecting via @workspace/db...");
  const { db } = await import("@workspace/db");
  const { sql } = await import("drizzle-orm");

  console.log("Creating shop_items table (if it doesn't already exist)...");
  await db.execute(sql`
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
  const result = await db.execute(sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'shop_items'
    ORDER BY ordinal_position
  `);
  const rows = result.rows ?? result;
  if (!rows || rows.length === 0) {
    console.error("\nSTILL MISSING: shop_items has no columns even after this ran without throwing. Something deeper is wrong -- possibly a permissions issue, or this is targeting a different database than expected.");
    process.exit(1);
  }
  console.log(`shop_items now has ${rows.length} column(s):`);
  for (const row of rows) {
    console.log(`  - ${row.column_name} (${row.data_type})`);
  }
  console.log("\nDone. The shop page and admin shop-management panel are safe to deploy now.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  console.error("Message:", err?.message);
  process.exit(1);
});
