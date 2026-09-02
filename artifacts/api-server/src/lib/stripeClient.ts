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

    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}
