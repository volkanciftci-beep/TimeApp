const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
export const COMPANY_TRIAL_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

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

export function companyTrialEndsAt(createdAt: Date) {
  return new Date(createdAt.getTime() + COMPANY_TRIAL_DAYS * DAY_MS);
}

export function isCompanyTrialActive(createdAt: Date, now = new Date()) {
  return now.getTime() < companyTrialEndsAt(createdAt).getTime();
}

export function hasCompanyAccess(
  company: SubscriptionState & { createdAt: Date },
  now = new Date(),
) {
  return isActiveSubscriptionStatus(company.subscriptionStatus) ||
    isCompanyTrialActive(company.createdAt, now);
}

export function isDevelopmentMode(nodeEnv = process.env.NODE_ENV) {
  return nodeEnv === "development";
}

export function hasTeamAccess(
  company: SubscriptionState & { createdAt: Date },
  now = new Date(),
  nodeEnv = process.env.NODE_ENV,
) {
  return isDevelopmentMode(nodeEnv) || hasCompanyAccess(company, now);
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