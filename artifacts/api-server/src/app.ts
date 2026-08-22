import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";
import { WebhookHandlers } from "./lib/webhookHandlers";
import { analytics } from "@heycatch/sdk";
import { getStripeSecretKey } from "./lib/stripeClient";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const app: Express = express();

analytics.init({ projectKey: "hck_pk_SAR07dB6bnpluTvimEswcyXYddoGhbx8" });

// Best-effort HeyCatch business event for a new paid subscription. This is
// parsed independently of the legacy StripeSync library (which is opaque
// and doesn't expose the parsed event), using the standard `stripe`
// package's own signature verification against STRIPE_WEBHOOK_SECRET.
// Wrapped so that any failure here (missing secret, event shape surprise,
// etc.) can never break the real webhook processing below it -- that part
// is load-bearing for actual subscriptions and must keep working
// regardless of whether analytics tracking succeeds.
async function trackSubscriptionEventBestEffort(payload: Buffer, signature: string) {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) return;
    const { default: Stripe } = await import("stripe");
    const secretKey = await getStripeSecretKey();
    const stripe = new Stripe(secretKey, { apiVersion: "2025-08-27.basil" as any });
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    if (event.type === "customer.subscription.created") {
      const sub = event.data.object as any;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
      if (!customerId) return;
      const [localUser] = await db.select({ id: usersTable.id })
        .from(usersTable).where(eq(usersTable.stripeCustomerId, customerId)).limit(1);
      if (!localUser) return;
      const item = sub.items?.data?.[0];
      await analytics.setIdentity(localUser.id, { plan: "pro" });
      await analytics.trackEvent(
        "subscription_started",
        { plan: item?.price?.recurring?.interval === "year" ? "pro_annual" : "pro_monthly" },
        { userId: localUser.id },
      );
    }
  } catch (err: any) {
    console.error("HeyCatch subscription event tracking failed (non-fatal):", err.message);
  }
}

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      res.status(400).json({ error: 'Missing stripe-signature' });
      return;
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;

      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
        res.status(500).json({ error: 'Webhook processing error' });
        return;
      }

      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      void trackSubscriptionEventBestEffort(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors({
  origin: corsOrigin ? [corsOrigin] : true,
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(authMiddleware);

app.use("/api", router);

export default app;
