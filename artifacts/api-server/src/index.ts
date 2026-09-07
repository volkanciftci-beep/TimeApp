import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function initStripe() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Stripe.");
  await runMigrations({ databaseUrl: process.env.DATABASE_URL });
  const sync = await getStripeSync();
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (domain) {
    await sync.findOrCreateManagedWebhook(`https://${domain}/api/stripe/webhook`);
  }
  void sync.syncBackfill().catch((error) => logger.error({ err: error }, "Stripe backfill failed"));
}

let stripeRetryDelayMs = 5_000;

async function initializeStripeWithRetry() {
  try {
    await initStripe();
    stripeRetryDelayMs = 5_000;
    logger.info("Stripe migrations, webhook, and synchronization initialized");
  } catch (error) {
    logger.error(
      { err: error, retryInMs: stripeRetryDelayMs },
      "Stripe initialization failed; retry scheduled",
    );
    const retryTimer = setTimeout(() => {
      void initializeStripeWithRetry();
    }, stripeRetryDelayMs);
    retryTimer.unref();
    stripeRetryDelayMs = Math.min(stripeRetryDelayMs * 2, 60_000);
  }
}

const server = app.listen(port, "0.0.0.0", () => {
  logger.info({ port, host: "0.0.0.0" }, "Server listening");
  void initializeStripeWithRetry();
});

server.on("error", (error) => {
  logger.error({ err: error }, "Error listening on port");
  process.exit(1);
});
