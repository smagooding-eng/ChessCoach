import { storage } from './storage';
import { getUncachableStripeClient, getStripePublishableKey } from './stripeClient';

export class StripeService {
  async createCustomer(email: string, userId: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.customers.create({
      email,
      metadata: { userId },
    });
  }

  async createCheckoutSession(customerId: string, priceId: string, successUrl: string, cancelUrl: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      subscription_data: {
        trial_period_days: 3,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
  }

  async createCustomerPortalSession(customerId: string, returnUrl: string) {
    const stripe = await getUncachableStripeClient();
    try {
      return await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
    } catch (err: any) {
      if (err.message?.includes('portal configuration') || err.message?.includes('no portal') || err.code === 'resource_missing') {
        await stripe.billingPortal.configurations.create({
          business_profile: {
            headline: 'Manage your ChessScout Pro subscription',
          },
          features: {
            subscription_cancel: { enabled: true },
            subscription_update: {
              enabled: true,
              default_allowed_updates: ['price', 'promotion_code'],
            },
            payment_method_update: { enabled: true },
            invoice_history: { enabled: true },
          },
        });
        return await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: returnUrl,
        });
      }
      throw err;
    }
  }

  async getPublishableKey() {
    return await getStripePublishableKey();
  }

  async getProduct(productId: string) {
    return await storage.getProduct(productId);
  }

  async getSubscription(subscriptionId: string) {
    return await storage.getSubscription(subscriptionId);
  }
}

export const stripeService = new StripeService();
