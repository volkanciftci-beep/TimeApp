import { getUncachableStripeClient } from "./stripeClient";

export class StripeService {
  async createCustomer(email: string, companyId: number) {
    const stripe = await getUncachableStripeClient();
    return stripe.customers.create({
      email,
      metadata: { companyId: String(companyId) },
    });
  }

  async createCheckoutSession(
    customerId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
    companyId: number,
  ) {
    const stripe = await getUncachableStripeClient();
    return stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: { metadata: { companyId: String(companyId) } },
      metadata: { companyId: String(companyId) },
    });
  }

  async createCustomerPortalSession(customerId: string, returnUrl: string) {
    const stripe = await getUncachableStripeClient();
    return stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
  }
}

export const stripeService = new StripeService();