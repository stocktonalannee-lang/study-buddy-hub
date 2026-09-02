/**
 * Launch feature flags.
 *
 * The subscription tier ("unlimited access to top students' notes") is fully
 * modelled in the database and the UI, but stays switched OFF for launch.
 * Flip SUBSCRIPTIONS_ENABLED to true when you're ready to charge.
 */
export const SUBSCRIPTIONS_ENABLED = false;

export const PREMIUM_TIER = {
  name: "Unlimited",
  priceLabel: "$4/mo",
  blurb: "Unlimited downloads from top students, once we turn it on.",
};
