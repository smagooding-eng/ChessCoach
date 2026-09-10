// Run manually via Render's Shell tab:
//   node scripts/run-stripe-migrations.mjs
//
// Plain JS (not .ts) specifically because the production container only
// has production dependencies installed -- tsx is a dev dependency and
// isn't there, so `pnpm exec tsx ...` fails with "Command tsx not found".
// Plain node needs nothing extra to run this.
//
// The app is supposed to run this automatically on every startup (see
// getStripeSync() in src/lib/stripeClient.ts), but production logs show
// "relation stripe.X does not exist" errors on every webhook attempt from
// at least Sep 4 through Sep 10 -- meaning that automatic call has never
// actually succeeded, silently. This runs the exact same migration
// directly, with nothing swallowing the error, so we can see what's
// really happening.

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set in this environment. This must be run somewhere that has the same DATABASE_URL as the running server (e.g. Render's Shell tab for this service).");
    process.exit(1);
  }

  console.log("Importing stripe-replit-sync...");
  const { runMigrations } = await import("stripe-replit-sync");

  console.log("Running migrations against DATABASE_URL...");
  try {
    await runMigrations({ databaseUrl: process.env.DATABASE_URL });
    console.log("SUCCESS: migrations completed without error.");
  } catch (err) {
    console.error("FAILED: migrations threw an error. Full details below:");
    console.error(err);
    console.error("\nError message:", err?.message);
    console.error("Error stack:", err?.stack);
    process.exit(1);
  }

  // Confirm the schema actually exists now, independent of whether
  // runMigrations() reported success -- belt and suspenders, since the
  // whole point of this script is that the app's own success/failure
  // signal turned out not to be trustworthy. Uses the same db connection
  // (@workspace/db) the rest of the app already relies on successfully.
  console.log("\nVerifying schema now exists...");
  const { db } = await import("@workspace/db");
  const { sql } = await import("drizzle-orm");
  const result = await db.execute(
    sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'stripe' ORDER BY table_name`
  );
  const rows = result.rows ?? result;
  if (!rows || rows.length === 0) {
    console.error("STILL MISSING: the 'stripe' schema has no tables in it, even after migrations reported success (or ran without throwing). Something deeper is wrong -- possibly a permissions issue, or migrations are targeting a different database than expected.");
    process.exit(1);
  }
  console.log(`Found ${rows.length} table(s) in the 'stripe' schema:`);
  for (const row of rows) console.log(`  - stripe.${row.table_name}`);
  console.log("\nDone. Webhooks should work now -- try resending a failed one from the Stripe dashboard to confirm.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
