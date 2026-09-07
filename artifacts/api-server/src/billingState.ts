const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

export type SubscriptionState = {
  stripeSubscriptionId: string | null;
  subscriptionStatus: string;
};

export type StripeMirrorSubscription = {
  id?: string;
  status?: string;
};

export function isActiveSubscriptionStatus(status: string) {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(status);
}

export function reconcileSubscriptionState(
  company: SubscriptionState,
  mirrorSubscription: StripeMirrorSubscription | undefined,
): SubscriptionState {
  if (
    !mirrorSubscription?.id ||
    !mirrorSubscription.status ||
    !isActiveSubscriptionStatus(mirrorSubscription.status)
  ) {
    return company;
  }

  return {
    stripeSubscriptionId: mirrorSubscription.id,
    subscriptionStatus: mirrorSubscription.status,
  };
}