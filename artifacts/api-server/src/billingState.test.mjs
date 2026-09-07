import assert from "node:assert/strict";
import test from "node:test";
import { reconcileSubscriptionState } from "./billingState.ts";

test("a webhook-confirmed trialing company is not downgraded by a missing Stripe mirror row", () => {
  const webhookState = {
    stripeSubscriptionId: "sub_webhook",
    subscriptionStatus: "trialing",
  };

  assert.deepEqual(reconcileSubscriptionState(webhookState, undefined), webhookState);
});

test("a webhook-confirmed trialing company is not downgraded by a delayed inactive mirror row", () => {
  const webhookState = {
    stripeSubscriptionId: "sub_webhook",
    subscriptionStatus: "trialing",
  };

  assert.deepEqual(
    reconcileSubscriptionState(webhookState, {
      id: "sub_stale",
      status: "inactive",
    }),
    webhookState,
  );
});

test("an active Stripe mirror row can positively reconcile company state", () => {
  assert.deepEqual(
    reconcileSubscriptionState(
      { stripeSubscriptionId: null, subscriptionStatus: "inactive" },
      { id: "sub_active", status: "active" },
    ),
    { stripeSubscriptionId: "sub_active", subscriptionStatus: "active" },
  );
});