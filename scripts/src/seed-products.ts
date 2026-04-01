import Stripe from 'stripe';

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found');
  }

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set('include_secrets', 'true');
  url.searchParams.set('connector_names', 'stripe');
  url.searchParams.set('environment', 'development');

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X-Replit-Token': xReplitToken
    }
  });

  const data = await response.json();
  const conn = data.items?.[0];
  if (!conn?.settings?.secret) {
    throw new Error('Stripe connection not found');
  }
  return conn.settings.secret;
}

async function createProducts() {
  try {
    const secretKey = await getCredentials();
    const stripe = new Stripe(secretKey, { apiVersion: '2025-08-27.basil' as any });

    console.log('Creating Chess Coach Pro products in Stripe...');

    const existingProducts = await stripe.products.search({
      query: "name:'Chess Coach Pro' AND active:'true'"
    });

    if (existingProducts.data.length > 0) {
      console.log('Chess Coach Pro product already exists. Skipping creation.');
      console.log(`Existing product ID: ${existingProducts.data[0].id}`);

      const prices = await stripe.prices.list({ product: existingProducts.data[0].id, active: true });
      for (const p of prices.data) {
        console.log(`  Price: ${p.id} - $${(p.unit_amount || 0) / 100}/${p.recurring?.interval}`);
      }
      return;
    }

    const product = await stripe.products.create({
      name: 'Chess Coach Pro',
      description: 'Premium chess coaching with AI analysis, personalized courses, TTS narration, and opponent scouting',
    });
    console.log(`Created product: ${product.name} (${product.id})`);

    const weeklyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: 100,
      currency: 'usd',
      recurring: {
        interval: 'week',
      },
    });
    console.log(`Created weekly price: $1.00/week (${weeklyPrice.id})`);

    const monthlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: 400,
      currency: 'usd',
      recurring: {
        interval: 'month',
      },
    });
    console.log(`Created monthly price: $4.00/month (${monthlyPrice.id})`);

    console.log('Products and prices created successfully!');
    console.log('Webhooks will sync this data to your database automatically.');

  } catch (error: any) {
    console.error('Error creating products:', error.message);
    process.exit(1);
  }
}

createProducts();
