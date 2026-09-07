import { getStripeSync } from "./stripeClient";
import { db } from "@workspace/db";
import { companies } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string) {
    if (!Buffer.isBuffer(payload)) {
      throw new Error("Stripe webhook payload must be a raw Buffer.");
    }
    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    const event = JSON.parse(payload.toString("utf8")) as {
      type?: string;
      data?: {
        object?: {
          id?: string;
          customer?: string;
          status?: string;
          metadata?: { companyId?: string };
        };
      };
    };
    if (!event.type?.startsWith("customer.subscription.")) return;

    const subscription = event.data?.object;
    const companyId = Number.parseInt(subscription?.metadata?.companyId ?? "", 10);
    if (
      !Number.isSafeInteger(companyId) ||
      !subscription?.id ||
      !subscription.customer ||
      !subscription.status
    ) return;

    await db
      .update(companies)
      .set({
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        updatedAt: new Date(),
      })
      .where(and(eq(companies.id, companyId), eq(companies.stripeCustomerId, subscription.customer)));
  }
}