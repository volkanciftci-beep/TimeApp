import assert from "node:assert/strict";
import test from "node:test";
import {
  companyTrialEndsAt,
  hasCompanyAccess,
  isCompanyTrialActive,
  reconcileSubscriptionState,
} from "./billingState.ts";

test("a company has access throughout its first 14 days without Stripe checkout", () => {
  const createdAt = new Date("2026-09-01T10:00:00.000Z");
  const company = {
    createdAt,
    stripeSubscriptionId: null,
    subscriptionStatus: "inactive",
  };

  assert.equal(companyTrialEndsAt(createdAt).toISOString(), "2026-09-15T10:00:00.000Z");
  assert.equal(isCompanyTrialActive(createdAt, new Date("2026-09-15T09:59:59.999Z")), true);
  assert.equal(hasCompanyAccess(company, new Date("2026-09-15T09:59:59.999Z")), true);
});

test("an inactive company is locked when its 14-day company trial expires", () => {
  const company = {
    createdAt: new Date("2026-09-01T10:00:00.000Z"),
    stripeSubscriptionId: null,
    subscriptionStatus: "inactive",
  };

  assert.equal(hasCompanyAccess(company, new Date("2026-09-15T10:00:00.000Z")), false);
});

test("an active Stripe subscription keeps access after the company trial expires", () => {
  const company = {
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    stripeSubscriptionId: "sub_active",
    subscriptionStatus: "active",
  };

  assert.equal(hasCompanyAccess(company, new Date("2026-09-15T10:00:00.000Z")), true);
});

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