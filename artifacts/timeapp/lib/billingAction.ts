export type BillingAction = "checkout" | "portal";

export function billingActionForSubscription(hasActiveSubscription: boolean): BillingAction {
  return hasActiveSubscription ? "portal" : "checkout";
}