import { getUncachableStripeClient } from "../src/stripeClient.ts";

const PRODUCT_KEY = "zeitapp_business";
const PRICE_LOOKUP_KEY = "zeitapp_monthly_eur_2900";

async function seedZeitAppPlan() {
  const stripe = await getUncachableStripeClient();
  const products = await stripe.products.list({ active: true, limit: 100 });
  let product = products.data.find((item) => item.metadata.product_key === PRODUCT_KEY);

  if (!product) {
    product = await stripe.products.create(
      {
        name: "ZeitApp",
        description: "ZeitApp Firmenabo mit 14 Tagen kostenloser Testphase.",
        metadata: { product_key: PRODUCT_KEY, trial_days: "14" },
      },
      { idempotencyKey: "zeitapp-product-business-v1" },
    );
  } else if (
    product.name !== "ZeitApp" ||
    product.description !== "ZeitApp Firmenabo mit 14 Tagen kostenloser Testphase." ||
    product.metadata.trial_days !== "14"
  ) {
    product = await stripe.products.update(product.id, {
      name: "ZeitApp",
      description: "ZeitApp Firmenabo mit 14 Tagen kostenloser Testphase.",
      metadata: { ...product.metadata, product_key: PRODUCT_KEY, trial_days: "14" },
    });
  }

  const prices = await stripe.prices.list({ product: product.id, active: true, type: "recurring", limit: 100 });
  let price = prices.data.find(
    (item) =>
      item.currency === "eur" &&
      item.unit_amount === 2900 &&
      item.recurring?.interval === "month",
  );

  if (!price) {
    price = await stripe.prices.create(
      {
        product: product.id,
        unit_amount: 2900,
        currency: "eur",
        recurring: { interval: "month" },
        lookup_key: PRICE_LOOKUP_KEY,
      },
      { idempotencyKey: "zeitapp-price-monthly-eur-2900-v1" },
    );
  }

  if (product.default_price !== price.id) {
    await stripe.products.update(product.id, { default_price: price.id });
  }

  console.log(`ZeitApp Stripe plan ready: ${product.id} / ${price.id}`);
}

seedZeitAppPlan().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});