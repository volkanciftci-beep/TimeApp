import assert from "node:assert/strict";
import test from "node:test";
import { billingActionForSubscription } from "./billingAction.ts";

test("inactive owner billing CTA uses checkout", () => {
  assert.equal(billingActionForSubscription(false), "checkout");
});

test("active or trialing owner billing CTA uses the customer portal", () => {
  assert.equal(billingActionForSubscription(true), "portal");
});