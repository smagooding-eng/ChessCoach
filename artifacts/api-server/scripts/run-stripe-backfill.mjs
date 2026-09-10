// Run manually via Render's Shell tab (plain node, no tsx needed):
//   node scripts/run-stripe-backfill.mjs
//
// Every webhook has been failing with foreign key violations
// (fk_invoices_account, fk_subscriptions_account) since the schema fix --
// that means stripe.accounts has no rows for invoices/subscriptions to
// link to. syncBackfill() is supposed to populate that on every server
// startup (see initStripe() in src/index.ts), but it's a fire-and-forget
// call there -- if it's been failing, the error log for it is easy to
// miss among everything else logged at startup. This runs it directly.

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set in this environment. Run this via Render's Shell tab for this service.");
    process.exit(1);
  }
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("STRIPE_SECRET_KEY and/or STRIPE_WEBHOOK_SECRET is not set in this environment. Run this via Render's Shell tab for this service.");
    process.exit(1);
  }

  // Constructed directly with the same config the app itself uses (see
  // getStripeSync() in src/lib/stripeClient.ts), rather than importing
  // that helper -- importing it would require knowing the exact compiled
  // output path in production, the same kind of guess that already went
  // wrong once with tsx not being installed. This only needs env vars,
  // which are guaranteed available here the same way they are for the
  // running server.
  console.log("Constructing StripeSync instance...");
  const { StripeSync } = await import("stripe-replit-sync");
  const stripeSync = new StripeSync({
    poolConfig: {
      connectionString: process.env.DATABASE_URL,
      max: 2,
    },
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  });

  console.log("Running syncBackfill()...");
  try {
    await stripeSync.syncBackfill();
    console.log("SUCCESS: backfill completed without error.");
  } catch (err) {
    console.error("FAILED: backfill threw an error. Full details below:");
    console.error(err);
    console.error("\nError message:", err?.message);
    console.error("Error stack:", err?.stack);
    process.exit(1);
  }

  console.log("\nDone. Try resending a failed webhook from the Stripe dashboard to confirm.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
