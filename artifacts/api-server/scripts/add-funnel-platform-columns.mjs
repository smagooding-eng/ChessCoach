// Run manually via Render's Shell tab:
//   node scripts/add-funnel-platform-columns.mjs
//
// Plain JS (not .ts), same reason as run-stripe-migrations.mjs: the
// production container only has production dependencies, and tsx isn't
// one of them.
//
// This project doesn't run Drizzle migrations automatically on startup
// for the main app schema (only the Stripe sync library has its own
// auto-migration, and even that turned out to be unreliable -- see
// run-stripe-migrations.mjs). So a schema.ts change alone does nothing
// to the live database; this script applies it directly, once.
//
// Adds two columns to landing_funnel_events:
//   - platform: 'web' | 'app', defaulted to 'web' for all existing rows
//     (every visit was 'web' before the PWA install flow existed)
//   - elapsed_ms: nullable, only meaningful for exit_<section> events

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set in this environment. Run this somewhere with the same DATABASE_URL as the live server (e.g. Render's Shell tab for this service).");
    process.exit(1);
  }

  console.log("Connecting via @workspace/db...");
  const { db } = await import("@workspace/db");
  const { sql } = await import("drizzle-orm");

  console.log("Adding platform column (default 'web')...");
  await db.execute(sql`
    ALTER TABLE landing_funnel_events
    ADD COLUMN IF NOT EXISTS platform varchar NOT NULL DEFAULT 'web'
  `);

  console.log("Adding elapsed_ms column (nullable)...");
  await db.execute(sql`
    ALTER TABLE landing_funnel_events
    ADD COLUMN IF NOT EXISTS elapsed_ms integer
  `);

  console.log("\nVerifying columns now exist...");
  const result = await db.execute(sql`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'landing_funnel_events'
    ORDER BY ordinal_position
  `);
  const rows = result.rows ?? result;
  console.log(`landing_funnel_events now has ${rows.length} column(s):`);
  for (const row of rows) {
    console.log(`  - ${row.column_name} (${row.data_type})${row.column_default ? ` default ${row.column_default}` : ""}`);
  }

  const hasNewColumns = rows.some((r) => r.column_name === "platform") && rows.some((r) => r.column_name === "elapsed_ms");
  if (!hasNewColumns) {
    console.error("\nSTILL MISSING: one or both new columns aren't there even after this ran without throwing. Something deeper is wrong -- possibly a permissions issue, or this is targeting a different database than expected.");
    process.exit(1);
  }
  console.log("\nDone. The new funnel code (platform + elapsed_ms tracking) is safe to deploy now.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  console.error("Message:", err?.message);
  process.exit(1);
});
