import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { calculateMarketplaceFee, determineMarketplaceFee } from "../lib/fees.ts";
import { POLICY_VERSION, sellerAcceptedCurrentTerms } from "../lib/legal.ts";
import { buildCheckoutSessionBody, stripeSettlementDetails } from "../lib/stripe.ts";

test("the standard marketplace rate is 7% with integer-cent rounding", () => {
  assert.deepEqual(determineMarketplaceFee(), {marketplaceFeeBps:700});
  for (const [subtotal, fee] of [[0,0],[1,0],[8,1],[12500,875],[19999,1400],[20000,1400]]) {
    assert.deepEqual(calculateMarketplaceFee(subtotal), {marketplaceFeeBps:700,platformFeeCents:fee});
  }
  assert.throws(() => calculateMarketplaceFee(-1));
});

test("legacy fee environment overrides cannot change the universal rate", () => {
  const script = "import { config } from './lib/config.ts'; console.log(config.marketplaceFeeBps);";
  const output = execFileSync(process.execPath, ['--experimental-strip-types','--input-type=module','-e',script], {
    cwd:fileURLToPath(new URL('../',import.meta.url)), encoding:'utf8',
    env:{...process.env,COLLECTOR_MARKETPLACE_FEE_BPS:'850',PROFESSIONAL_MARKETPLACE_FEE_BPS:'1200',FOUNDING_SELLER_MARKETPLACE_FEE_BPS:'500',FOUNDING_SELLER_PROMOTION_MONTHS:'invalid'},
  });
  assert.equal(output.trim(),'700');
});

test("sellers must accept the updated fee policy before new sales", () => {
  assert.equal(POLICY_VERSION,'2026-11-05-founding-store-offer-v6');
  assert.equal(sellerAcceptedCurrentTerms({sellerTermsVersion:'2026-09-27-consumer-protection-v4',sellerTermsAcceptedAt:'2026-10-01'}),false);
  assert.equal(sellerAcceptedCurrentTerms({sellerTermsVersion:POLICY_VERSION,sellerTermsAcceptedAt:'2026-11-05'}),true);
});

test("real seller carts and calculator use 7% regardless of founding history", async t => {
  const root=fileURLToPath(new URL('../',import.meta.url)), scratch=await mkdtemp(join(root,'.fee-test-')), file=join(scratch,'fee.mjs');
  t.after(async()=>{await unlink(file).catch(()=>{});await rmdir(scratch);});
  const result=await build({absWorkingDir:root,bundle:true,platform:'node',format:'esm',packages:'external',write:false,jsx:'automatic',
    stdin:{contents:'export {sellerCartFromRows} from "./lib/inventory"; export {SellerProceedsCalculator} from "./components/seller-proceeds-calculator";',resolveDir:root,loader:'tsx'},
    plugins:[{name:'boundaries',setup(b){
      b.onResolve({filter:/^@\/db$|\.css$/},({path})=>({path,namespace:'stub'}));
      b.onLoad({filter:/.*/,namespace:'stub'},({path})=>({contents:path.endsWith('.css')?'':'export const getDb=()=>{throw Error("Unexpected DB call")};export const getD1=getDb;'}));
    }}],
  });
  await writeFile(file,result.outputFiles[0].contents);
  const {sellerCartFromRows,SellerProceedsCalculator}=await import(pathToFileURL(file).href);
  for(const sellerType of ['collector','professional']) for(const isFoundingSeller of [false,true]) for(const foundingRateEndsAt of ['2026-01-01','2099-01-01']) {
    const cart=sellerCartFromRows([{id:'model',sellerId:'seller',sellerType,isFoundingSeller,foundingRateStartsAt:'2025-01-01',foundingRateEndsAt,currency:'usd',priceCents:20000,quantity:1,shippingMode:'flat',shippingCents:1000}]);
    assert.equal(cart.fee.marketplaceFeeBps,700);
    assert.equal(cart.totals.platformFeeCents,1400);
    assert.equal(cart.totals.shippingCents,sellerType==='collector'?0:1000);
  }
  const html=renderToStaticMarkup(createElement(SellerProceedsCalculator,{marketplaceFeeBps:700}));
  assert.match(html,/7% standard marketplace fee/);
  assert.match(html,/189.03/);
  assert.doesNotMatch(html,/Seller type|8\.5%|<select/i);
});

test("Stripe Checkout keeps funds on-platform for a later seller transfer", () => {
  const body = buildCheckoutSessionBody({
    reservationId: "reservation-1",
    sellerId: "seller-1",
    sellerStripeAccountId: "acct_123",
    items: [
      {
        title: "Model car",
        description: "",
        imageUrl: null,
        priceCents: 20_000,
        currency: "usd",
        quantity: 1,
      },
    ],
    shippingCents: 1_000,
    marketplaceFeeBps: 700,
    platformFeeCents: 1_400,
    expiresAt: new Date("2026-08-20T00:00:00.000Z"),
    policyVersion: "2026-08-19",
  });
  assert.equal(body.get("payment_intent_data[application_fee_amount]"), null);
  assert.equal(body.get("metadata[marketplace_fee_bps]"), "700");
  assert.equal(body.get("metadata[payment_flow]"), "separate");
  assert.equal(body.get("metadata[processing_fee_payer]"), "seller");
  assert.equal(body.get("payment_intent_data[transfer_data][destination]"), null);
  assert.equal(body.get("payment_intent_data[transfer_group]"), "MCC_reservation-1");
  assert.equal(
    body.get("payment_intent_data[metadata][seller_stripe_account_id]"),
    "acct_123",
  );
});

test("seller settlement withholds marketplace tax and records processing separately", () => {
  const settlement = stripeSettlementDetails(
    {
      id: "cs_taxed",
      url: null,
      payment_status: "paid",
      status: "complete",
      amount_total: 11_325,
      total_details: { amount_tax: 825, amount_shipping: 500 },
      payment_intent: {
        id: "pi_taxed",
        latest_charge: {
          id: "ch_taxed",
          balance_transaction: {
            id: "txn_taxed",
            fee: 358,
            net: 10_967,
          },
        },
      },
    },
    700,
  );
  assert.deepEqual(settlement, {
    processingFeePayer: "platform",
    paymentProcessingFeeCents: 358,
    sellerProceedsCents: 9_800,
  });
});

test("checkout ignores browser-supplied fee values and historical orders copy the reservation snapshot", async () => {
  const checkout = await readFile(
    new URL("../app/api/checkout/route.ts", import.meta.url),
    "utf8",
  );
  const orders = await readFile(
    new URL("../lib/orders.ts", import.meta.url),
    "utf8",
  );
  const migration = await readFile(
    new URL("../drizzle/0003_lush_grim_reaper.sql", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(checkout, /payload\.(?:marketplace|platform|application).*fee/i);
  assert.match(checkout, /loadAuthoritativeCart\(requested\)/);
  assert.match(checkout, /assertSellerPaymentsReady\(loadedCart\.seller\.sellerStripeAccountId!/);
  assert.match(orders, /reservation\.marketplaceFeeBps/);
  assert.match(orders, /reservation\.platformFeeCents/);
  assert.match(migration, /`marketplace_fee_bps` integer DEFAULT 1000 NOT NULL/);
  assert.doesNotMatch(migration, /DROP TABLE/i);
  assert.match(migration, /orders` ADD `marketplace_fee_bps` integer DEFAULT 1000 NOT NULL/);
});
