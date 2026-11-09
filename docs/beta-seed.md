# Populated local beta

The collector beta remains unpublished. This fixture populates only the local D1 and R2 emulators used by the existing development preview. It does not change the public site, apply production migrations, send invitations, or create payment-provider records.

Start with the existing local migrations, then run:

```sh
npm run db:migrate:local
npm run db:seed:beta
npm run dev:beta
```

Open **http://127.0.0.1:5173/beta-review**. The hub has normal sign-in links for three fictional accounts:

| Account | Review journey |
| --- | --- |
| Alex Morgan | An established collection, Following feed, saved posts, model wishlist, private notes, requests, notifications, and four private offers. |
| Maya Chen | Apex Miniatures storefront, single-piece listings linked to public collection items, incoming offers and buyer questions. |
| Jamie Rivera | A newer collector, wishlist, welcome conversation, and a question to a store. |

Links use the existing Better Auth verification flow. They are single use and expire after 24 hours. Sign out before switching personas; regenerate links with `npm run db:seed:beta -- --login-only`. The link file lives in ignored `.sites-runtime/` and the hub is served only to loopback clients by `dev:beta`; neither is part of a hosted build. No account password or application authentication bypass is added.

## Dataset

- 24 fictional collectors across several collecting interests, with 210 follow relationships.
- Six stores, 12 illustrative catalog releases, and 48 listings across three scales, multiple conditions and price ranges.
- 193 physical collection pieces on 72 shelves, including private pieces, a private unmatched custom, historical ownership, for-sale pieces, and pieces open to offers.
- 72 posts over the preceding week, 324 replies, and 988 likes/saves; catalog and piece tags connect browsing journeys.
- 11 conversations with 17 messages, including accepted chats, incoming requests, and four structured offer examples (two proposals, one reservation, one decline).
- Model wishlists, unread notifications, and an editorial theme.
- 255 protected community photo records backed by actual local R2 JPEG objects. These reuse the four existing illustrative development photos; no new real seller photography is implied. Fictional catalog maker/scale combinations are unverified.

All fixture emails use `example.test`; IDs start with `beta-v1-`, and handles and store slugs start with `beta-`. Profiles, catalog descriptions, and the local banner identify the simulation. No transaction reviews, completed purchases, or seller performance claims are fabricated.

The beta launcher binds to `127.0.0.1:5173` and disables Stripe, Shippo, Resend and Places credentials in the application configuration, including credentials loaded independently by the Cloudflare development plugin. Social interactions remain functional. Offer acceptance and cancellation can be exercised; external payment and fulfillment require a separately configured test session. The marker is ignored in production.

## Repeatability and checks

`npm run db:seed:beta -- --check` builds the fixture in isolated SQLite using every real migration, checks foreign keys and the reservation trigger, and applies it a second time to verify repeatability without touching persistent storage.

The seed accepts no database, config, or remote-target arguments. Its generated Wrangler config names only the fixed local placeholder resources, explicitly disables remote bindings, and uses `.wrangler/state/v3`. The existing local database and unrelated records are preserved. It inserts missing fixture rows in one D1 batch and does not overwrite review edits, clear records, revive expired offers, or refresh immutable offer terms on a rerun. Missing seed photos are restored, while existing objects remain unchanged. Seeding is manual and is not a migration, build step, or deployment hook.

Offer proposals naturally expire after their remaining 40 hours and the reservation after 22 hours. Timestamps remain stable on subsequent runs so edits and browsing history are preserved. Use a fresh local emulator state for a fully fresh scenario; this command deliberately provides no destructive reset option.

The local review hub and bearer links must remain out of `public/`, Git, and release archives. Never copy the seed into a production migration.
