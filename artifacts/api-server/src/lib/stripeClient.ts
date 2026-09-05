import Stripe from 'stripe';

async function getCredentials() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error(
      'STRIPE_SECRET_KEY environment variable is required. Set it (and STRIPE_PUBLISHABLE_KEY) ' +
        'in your hosting provider\'s dashboard.'
    );
  }

  return {
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    secretKey: process.env.STRIPE_SECRET_KEY,
  };
}

export async function getUncachableStripeClient() {
  const { secretKey } = await getCredentials();
  return new Stripe(secretKey, {
    apiVersion: '2025-08-27.basil' as any,
    maxNetworkRetries: 3,
    timeout: 20000,
  });
}

export async function getStripePublishableKey() {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

export async function getStripeSecretKey() {
  const { secretKey } = await getCredentials();
  return secretKey;
}

let stripeSync: any = null;
let migrationsRun = false;

export async function getStripeSync() {
  if (!stripeSync) {
    const { StripeSync, runMigrations } = await import('stripe-replit-sync');
    const secretKey = await getStripeSecretKey();

    // The library requires this to be called separately before first use --
    // it creates the `stripe` schema and its tables (including
    // _managed_webhooks) in Postgres. Without this, every webhook and
    // every sync operation fails with "relation ... does not exist",
    // since the schema was never created.
    if (!migrationsRun) {
      await runMigrations({ databaseUrl: process.env.DATABASE_URL! });
      migrationsRun = true;
    }

    // stripeWebhookSecret MUST be passed here. Without it, the library's
    // processWebhook() falls back to looking up a secret from its own
    // stripe._managed_webhooks table -- a feature for webhook endpoints
    // the library auto-provisions via the Stripe API, which this app
    // doesn't use (the endpoint is configured by hand in the Stripe
    // Dashboard). That table was never created for this account, so
    // every single webhook failed with "relation ... does not exist"
    // regardless of event type -- this one field was the entire bug.
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error(
        'STRIPE_WEBHOOK_SECRET environment variable is required for webhook processing. ' +
        'Set it to the signing secret shown for this endpoint in the Stripe Dashboard ' +
        '(Developers -> Webhooks -> this endpoint -> Signing secret).'
      );
    }

    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    });
  }
  return stripeSync;
}
