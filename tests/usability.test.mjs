import assert from 'node:assert/strict';
import test from 'node:test';
import { readMarketplaceFilters, marketplaceHref, modelHuntHref, modelHuntPrefill, selectedFilterOptions, stockCategories } from '../lib/discovery.ts';
import { requiredPhotoViews, listingPhotoEvidence, photoAltForViews, photoViewsFromAlt } from '../lib/listing-evidence.ts';
import { buildSellerSetup } from '../lib/seller-setup.ts';
import { estimateSellerProceeds } from '../lib/seller-calculator.ts';
import { sanitizeAnalyticsDetails, analyticsConsent } from '../lib/analytics-rules.ts';
import { ACTIVE_PROTECTION_POLICY_VERSION, REFUND_REQUEST_DAYS_AFTER_DELIVERY, reportDeadlineForOrder, protectionPolicyForOrder } from '../lib/protection.ts';
import { POLICY_VERSION } from '../lib/legal.ts';
import { parseModelHunt } from '../lib/validation.ts';

test('empty scale selections survive URL round trips, filter removal and returning to an earlier URL', () => {
  const first = readMarketplaceFilters(new URLSearchParams('scale=1%3A64&q=Porsche&manufacturer=MINI+GT&condition=mint'));
  assert.deepEqual(readMarketplaceFilters(new URL(marketplaceHref(first), 'https://example.test').searchParams), first);
  const options = selectedFilterOptions([{ value: '1:18', label: '1:18' }], first.scale);
  assert.equal(options[0].value, '1:64');
  const next = readMarketplaceFilters(new URL(marketplaceHref({ ...first, scale: '' }), 'https://example.test').searchParams);
  assert.equal(next.scale, ''); assert.equal(next.manufacturer, 'MINI GT');
  assert.equal(readMarketplaceFilters(new URL(marketplaceHref(first), 'https://example.test').searchParams).scale, '1:64');
  assert.equal(marketplaceHref(), '/marketplace');
});
test('unsuccessful shopping carries optional criteria into Model Hunt without requiring car make or scale', () => {
  const href = modelHuntHref({ q: 'McLaren F1', scale: '1:64', manufacturer: 'AUTOart', condition: 'mint', availability: 'in_stock' });
  const draft = modelHuntPrefill(new URL(href, 'https://example.test').searchParams);
  assert.equal(draft.vehicleModel, 'McLaren F1'); assert.equal(draft.preferredScale, '1:64'); assert.equal(draft.modelManufacturer, 'AUTOart'); assert.match(draft.notes, /in-stock/);
  const minimal = parseModelHunt({ vehicleModel: 'McLaren F1', collectorEmail: 'buyer@example.test' });
  assert.equal(minimal.preferredScale, ''); assert.equal(minimal.vehicleMake, '');
  assert.deepEqual(stockCategories(['1:64', '1:18'], { '1:18': 2 }).map(row => [row.value, row.count]), [['1:18', 2], ['1:64', 0]]);
});

test('budgets survive links, sorting, pagination, filter removal and Model Hunt handoff', () => {
  const budget = readMarketplaceFilters(new URLSearchParams('q=Porsche&minPrice=0&maxPrice=250.50&manufacturer=AUTOart'));
  const sorted = { ...budget, sort: 'price_asc', page: 3 };
  assert.deepEqual(readMarketplaceFilters(new URL(marketplaceHref(sorted), 'https://example.test').searchParams), sorted);
  const removed = readMarketplaceFilters(new URL(marketplaceHref({ ...budget, minPrice: '', maxPrice: '', page: 1 }), 'https://example.test').searchParams);
  assert.equal(removed.minPrice, ''); assert.equal(removed.maxPrice, '');
  assert.equal(removed.manufacturer, 'AUTOart'); assert.equal(removed.q, 'Porsche');
  const draft = modelHuntPrefill(new URL(modelHuntHref(budget), 'https://example.test').searchParams);
  assert.equal(draft.maxBudget, '250.50'); assert.match(draft.notes, /Minimum listing price: \$0/);
});
test('photo evidence adapts to sealed models, absent boxes, accessories and defects', () => {
  const sealed = { packagingCondition: 'sealed', originalBoxStatus: 'included', accessories: 'Booklet' };
  assert.deepEqual(requiredPhotoViews(sealed), ['packaging', 'seal']);
  assert.equal(listingPhotoEvidence(sealed, [{ alt: photoAltForViews(['packaging'], 'Actual box') }, { alt: photoAltForViews(['seal'], 'Intact seal') }]).complete, true);
  const loose = { packagingCondition: 'not_included', originalBoxStatus: 'not_included', accessories: 'None', defects: 'None known' };
  assert.deepEqual(requiredPhotoViews(loose), ['front', 'rear', 'left', 'right', 'top', 'underside']);
  assert.deepEqual(requiredPhotoViews({...loose, accessories: 'None included'}), ['front', 'rear', 'left', 'right', 'top', 'underside']);
  assert.deepEqual(photoViewsFromAlt(photoAltForViews(['front', 'sides'], 'Actual model')), ['front']);
  assert.deepEqual(photoViewsFromAlt(photoAltForViews(['front', 'left', 'right'], 'Actual model').replace(' - ', ' \u2014 ')), ['front', 'left', 'right']);
  assert.equal(listingPhotoEvidence(loose, [{ alt: 'Legacy photo' }]).complete, false);
  assert.ok(requiredPhotoViews({ ...loose, defects: 'Chipped paint', accessories: 'Display base' }).includes('issues'));
  assert.ok(requiredPhotoViews({ ...loose, defects: 'Chipped paint', accessories: 'Display base' }).includes('accessories'));
});
test('seller setup reflects saved records and separates drafts from publication readiness', () => {
  const store = { status:'active', description:'Independent specialist in collectible model cars.', specialty:'Racing models', packingApproach:'Padded model and box inside a sturdy outer carton.', shippingOriginCountry:'US', shippingOriginRegion:'CA', shippingOriginStreet1:'1 Main St', shippingOriginCity:'Los Angeles', shippingOriginPostalCode:'90012', shippingOriginPhone:'5555555555', shippingMode:'flat', shippingPolicySummary:'Ships with tracking.', handlingTimeBusinessDays:2, stripeChargesEnabled:true, stripePayoutsEnabled:true, sellerTermsVersion:POLICY_VERSION, sellerTermsAcceptedAt:'2026-09-18T00:00:00Z' };
  const saved = buildSellerSetup(store, [{status:'draft'}], false);
  assert.equal(saved.completed, 4); assert.equal(saved.listingCounts.live, 0); assert.equal(saved.readyToPublish, true);
  assert.equal(buildSellerSetup({...store, stripePayoutsEnabled:false}, [{status:'draft'}], false).readyToPublish, false);
  assert.equal(buildSellerSetup({...store, specialty:''}, [{status:'draft'}], false).completed, 3);
  assert.equal(buildSellerSetup({...store, shippingMode:'calculated'}, [{status:'draft'}], false).steps.find(step=>step.id==='shipping').complete, false);
  assert.deepEqual(buildSellerSetup(JSON.parse(JSON.stringify(store)), [{status:'draft'}], false), saved);
});
test('calculator uses item-only commission and actual-order processing allocation for every configured seller rate', () => {
  for (const [feeBps, commission, proceeds] of [[850,1700,18603],[700,1400,18903],[500,1000,19303]]) {
    const result=estimateSellerProceeds({itemCents:20000,shippingCents:1000,taxCents:2000,feeBps,processingBps:290,processingFixedCents:30});
    assert.equal(result.totalCents,23000);assert.equal(result.platformFeeCents,commission);assert.equal(result.paymentProcessingFeeCents,697);assert.equal(result.proceedsCents,proceeds);
  }
  assert.throws(()=>estimateSellerProceeds({itemCents:-1,shippingCents:0,taxCents:0,feeBps:700,processingBps:290,processingFixedCents:30}), /non-negative/);
});
test('active protection stays at three calendar days and explicit legacy deadlines remain frozen', () => {
  assert.equal(ACTIVE_PROTECTION_POLICY_VERSION,'delivery-3-v1');assert.equal(REFUND_REQUEST_DAYS_AFTER_DELIVERY,3);
  const order={createdAt:'2026-09-01T12:00:00Z',deliveredAt:'2026-09-18T12:00:00Z'};
  assert.equal(reportDeadlineForOrder(order),'2026-09-21T12:00:00.000Z');
  assert.equal(reportDeadlineForOrder({...order,refundRequestDeadline:'2026-09-20T12:00:00Z'}),'2026-09-20T12:00:00Z');
  assert.throws(()=>protectionPolicyForOrder({protectionPolicyVersion:'not-approved'}), /needs review/);
  assert.throws(()=>protectionPolicyForOrder({protectionPolicyVersion:'__proto__'}), /needs review/);
});
test('measurement excludes arbitrary text, private form fields, paths and non-finite values', () => {
  assert.deepEqual(sanitizeAnalyticsDetails({step:'inventory',result:'success',count:4,durationMs:2000,query:'private',email:'private',address:'private',message:'private',payment:'private'}),{step:'inventory',result:'success',count:4,durationMs:2000});
  assert.deepEqual(sanitizeAnalyticsDetails({step:'/products/private',result:'private text',count:NaN,durationMs:Infinity}),{});
  assert.equal(analyticsConsent('mcc_analytics=yes'),true);assert.equal(analyticsConsent('mcc_analytics=no'),false);assert.equal(analyticsConsent('not_mcc_analytics=yes'),false);
});
