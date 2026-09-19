import { sellerAcceptedCurrentTerms } from "./legal.ts";

export type SetupStore = {
  status: string; description: string; specialty?: string; packingApproach?: string;
  shippingOriginCountry: string; shippingOriginRegion: string | null;
  shippingOriginStreet1: string | null; shippingOriginCity: string | null;
  shippingOriginPostalCode: string | null; shippingOriginPhone: string | null;
  shippingMode: string; shippingPolicySummary: string; handlingTimeBusinessDays: number;
  stripeChargesEnabled: boolean; stripePayoutsEnabled: boolean;
  sellerTermsVersion?: string | null; sellerTermsAcceptedAt?: string | null;
};

export function sellerPublicProfileComplete(store: Pick<SetupStore, "description" | "specialty" | "packingApproach" | "shippingOriginCountry" | "shippingOriginRegion">) {
  return store.description.trim().length >= 30 && Boolean(store.specialty?.trim()) &&
    (store.packingApproach?.trim().length ?? 0) >= 20 && Boolean(store.shippingOriginCountry.trim()) &&
    Boolean(store.shippingOriginRegion?.trim());
}

/** Progress is calculated from saved records, never from a locally checked box. */
export function buildSellerSetup(store: SetupStore, inventory: Array<{ status: string }>, carrierRatesConfigured: boolean) {
  const profile = sellerPublicProfileComplete(store);
  const payments = store.stripeChargesEnabled && store.stripePayoutsEnabled;
  const shipping = Boolean(store.shippingOriginStreet1 && store.shippingOriginCity &&
    store.shippingOriginPostalCode && store.shippingOriginPhone && store.shippingOriginCountry &&
    store.shippingOriginRegion && store.shippingPolicySummary.trim() && store.handlingTimeBusinessDays > 0 &&
    (store.shippingMode !== "calculated" || carrierRatesConfigured));
  const terms = sellerAcceptedCurrentTerms(store);
  const steps = [
    { id: "store", title: "Set up your store", complete: profile, href: "/store?view=settings#store-introduction", detail: "Add your introduction, specialty, general shipping location, and packing approach." },
    { id: "payments", title: "Connect your bank account to receive payments", complete: payments, href: "/store?view=payments", detail: "Provide identity and bank details securely with Stripe. Return here to check your connection." },
    { id: "shipping", title: "Set shipping options", complete: shipping, href: "/store?view=settings#shipping-options", detail: "Save your private ship-from address, dispatch time, shipping charge, and packing dimensions." },
    { id: "inventory", title: "Add your first model or upload inventory", complete: inventory.length > 0, href: "/store?view=inventory", detail: "Start with a draft. Add actual-item photos and condition details before publishing." },
  ];
  return { steps, completed: steps.filter(step => step.complete).length, termsAccepted: terms,
    readyToPublish: profile && payments && shipping && terms && store.status === "active",
    listingCounts: { draft: inventory.filter(item => item.status === "draft").length,
      pending: inventory.filter(item => item.status === "pending_review").length,
      live: inventory.filter(item => item.status === "active").length } };
}
