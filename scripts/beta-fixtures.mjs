// Fictional local review data. Never import this module from application code.
export const PREFIX = 'beta-v1-';
export const id = (kind, value) => `${PREFIX}${kind}-${value}`;
export const reviewPeople = [0, 1, 2];

const people = [
  ['Alex Morgan', 'alexs-garage', 'Portland, OR', 'JDM, 1:18, photography', 'Weekend shelf photographer. Japanese classics, opening parts, and the occasional impulse buy.'],
  ['Maya Chen', 'apex-miniatures', 'Seattle, WA', 'Porsche, Motorsport, 1:43', 'Apex Miniatures. Endurance racing specialist and lifelong collector. Happy to talk display cabinets.'],
  ['Jamie Rivera', 'jamies-first-shelf', 'Austin, TX', '1:64, JDM', 'Building my first proper display, one pocket-sized car at a time. Here for ideas and friendly advice.'],
  ['Theo Brooks', 'small-scale-studio', 'Chicago, IL', '1:64, photography', 'Small Scale Studio. Tiny cars, carefully packed. Most evenings you will find me photographing the latest arrivals.'],
  ['Priya Shah', 'pitlane-archive', 'San Diego, CA', 'Motorsport, Porsche, 1:43', 'Pitlane Archive. Endurance grids, touring cars and the stories behind the liveries.'],
  ['Daniel Park', 'redline-collectibles', 'Denver, CO', 'JDM, 1:18', 'Redline Collectibles. Japanese coupes and a soft spot for cars with opening bonnets.'],
  ['Sofia Martinez', 'sunday-supercars', 'Miami, FL', '1:18, Lamborghini', 'Sunday Supercars. A rotating display of poster cars and the details that made us love them.'],
  ['Oliver Reed', 'touring-room', 'Boston, MA', '1:64, Volvo, Touring', 'The Touring Room. Everyday heroes, boxy silhouettes and carefully chosen display pieces.'],
  ['Nina Patel', 'nina-in-miniature', 'San Jose, CA', '1:64, photography', 'Window light, a sheet of grey card, and a very patient cat.'],
  ['Elliot Kim', 'z-car-notebook', 'Sacramento, CA', 'JDM, Nissan, 1:18', 'Documenting every small detail of the S30. Always happy to compare notes.'],
  ['Grace Wilson', 'grid-position', 'Phoenix, AZ', 'Motorsport, 1:43', 'Organizing the shelf by race weekend rather than manufacturer.'],
  ['Mateo Silva', 'blue-hour-garage', 'Los Angeles, CA', 'Lamborghini, photography', 'Blue hour photographs and a cabinet full of angular supercars.'],
  ['Hana Mori', 'pocket-parking', 'Bellevue, WA', 'JDM, 1:64', 'Tiny parking lot scenes. New to photographing models, learning something every week.'],
  ['Ben Carter', 'boxy-and-brilliant', 'Minneapolis, MN', 'Volvo, Touring, 1:43', 'Unapologetic admirer of sensible cars in miniature.'],
  ['Amara Okafor', 'shelf-stories', 'Atlanta, GA', '1:18, photography', 'Every model has a memory attached. Slowly writing mine down.'],
  ['Luca Rossi', 'after-the-checkered', 'Tampa, FL', 'Porsche, Motorsport', 'The race finishes; the research begins. Looking for your favorite reference books.'],
  ['Zoe Turner', 'sixty-four-club', 'Raleigh, NC', '1:64, JDM', 'Budget collecting, clever displays, and no such thing as a starter collection.'],
  ['Noah Adams', 'garage-on-a-desk', 'Salt Lake City, UT', '1:43, Porsche', 'My whole garage fits next to the keyboard.'],
  ['Isla Nguyen', 'quiet-apex', 'San Francisco, CA', 'Motorsport, photography', 'Simple compositions. Interesting shapes. Usually a racing car.'],
  ['Arjun Mehta', 'opening-parts', 'Dallas, TX', '1:18, JDM', 'Hinges, engine bays and interiors. Collecting the details you cannot see through the box.'],
  ['Ruby Scott', 'the-weekend-shelf', 'Nashville, TN', 'Volvo, 1:64', 'A monthly swap of the display keeps old favorites feeling new.'],
  ['Sam Taylor', 'scale-and-light', 'Pittsburgh, PA', 'photography, 1:43', 'Experimenting with reflections and sharing what worked.'],
  ['Leila Hassan', 'cabinet-corner', 'Washington, DC', '1:18, Lamborghini', 'Making a small apartment work for a growing collection.'],
  ['Max Bennett', 'one-more-space', 'Las Vegas, NV', 'JDM, Motorsport, 1:64', 'There is always room for one more. Usually.'],
];

const baseModels = [
  ['AUTOart', 'Nissan', 'Fairlady Z S30', '1971', 'Red', 'product-red-coupe.png', 'JDM'],
  ['Spark', 'Porsche', '963 No. 6', '2023', 'Silver', 'product-silver-racer.png', 'Motorsport'],
  ['Kyosho', 'Lamborghini', 'Countach LPI 800-4', '2022', 'Blue', 'product-blue-supercar.png', 'Lamborghini'],
  ['Tarmac Works', 'Volvo', '850 R', '1996', 'Black', 'product-black-sedan.png', 'Touring'],
];
const stores = ['Apex Miniatures', 'Small Scale Studio', 'Pitlane Archive', 'Redline Collectibles', 'Sunday Supercars', 'The Touring Room'];
const sellerOwners = [1, 3, 4, 5, 6, 7];
const captions = [
  'Finally gave this one a spot at eye level. The silhouette does all the work; I kept the rest of the shelf simple. What is the centerpiece of your display right now?',
  'A new arrival and a slow unboxing this morning. I am keeping the packaging, but the model is definitely coming out of the box. Do you display yours on the base?',
  'Tried a single window and a sheet of grey card for this photo. Moving the car a few centimeters changed the reflections completely. No special lighting needed.',
  'Reorganized the cabinet by color instead of scale. It should not work, but I keep walking past to look at it. Anyone else change their display every month?',
  'The detail I keep coming back to is the shape around the rear window. A small thing, but it makes this model feel right on the shelf.',
  'A favorite from the collection that has survived every clear-out. This was a birthday gift, so it is staying even when shelf space runs out.',
  'Question for fellow collectors: how much space do you leave between models? I am trying to fit one more row without making the whole cabinet feel crowded.',
  'Weekend photo session, take two. Lowering the camera to headlight height made the biggest difference. Sharing the result in case it helps someone starting out.',
  'I used to collect everything I liked. Focusing on one theme has made choosing new pieces much more enjoyable. Still making exceptions, of course.',
  'This is my entry for the weekly theme. No expensive display case, just a little corner of the desk and a model I enjoy seeing every day.',
  'Back on the shelf after a gentle dusting. A soft brush was all it needed. Those tiny mirrors always make me take my time.',
  'Comparing the smaller model with its larger shelf neighbor tonight. Same subject, a completely different presence. Which scale fits your space best?',
  'The original box is bigger than my first display shelf. I have started labeling the outer cartons so I can find things again. Future me will be grateful.',
  'A quick collection update: one duplicate is moving on, and the rest are getting a proper display. The piece linked here has the condition details.',
  'Anyone using a shallow wall cabinet? I would love to hear how you handle dust and lighting without running cables across the room.',
  'A quiet favorite rather than a rare one. This is exactly the kind of car I remember seeing on the way to school.',
  'I took the same shot in morning and afternoon light. The paint looked completely different. Going to try a neutral background next weekend.',
  'One shelf, three scales, and far too much time deciding where everything belongs. The arrangement will probably change again tomorrow.',
  'New collector question: do you keep a spreadsheet, photos, or both? I have started adding notes about when and why each model joined the collection.',
  'A few display pieces are available from our store this week. We have included packaging notes on each listing. Happy to answer detail questions before anyone decides.',
  'Spent the evening reading about the full-size car, then went straight back to inspect the miniature. Learning the history is half the hobby for me.',
  'First attempt at a closer detail shot. The phone was resting on a stack of books, which was more stable than my hands. Small improvements count.',
  'The best addition this month was a riser, not another model. Now I can actually see the row at the back of the cabinet.',
  'A little shelf appreciation before the weekend. Thanks to everyone who shared display advice on my last post; I finally tried it.',
];
const replies = [
  'That lower camera angle works really well. I am going to try it with my desk display.',
  'I leave about a car width between mine. A little breathing room makes a big difference.',
  'Lovely choice for the front row. The profile is what sold me on this one too.',
  'I keep the boxes in labeled storage and the models out where I can enjoy them.',
  'Window light is underrated. I use a white card opposite the window to lift the shadows.',
  'The story behind a model is always more interesting to me than how rare it is.',
  'A shallow riser helped with my back row. The clear acrylic ones disappear visually.',
  'This is exactly the kind of collection photo I come here for.',
  'I photograph the model and the box label when it arrives. Finding the exact release later is much easier.',
  'Good question. I rotate six pieces each month and keep the rest safely boxed.',
  'Thanks for including the scale. It is surprisingly hard to judge from a close-up.',
  'Mine lives next to the keyboard too. It makes a long workday a little better.',
];

export function buildBetaFixture(now = Date.now()) {
  const records = [], media = [], transitions = [];
  const add = (table, row, key = 'id') => { records.push({ table, row, key }); return row; };
  const ago = hours => now - hours * 3600000;
  const iso = hours => new Date(ago(hours)).toISOString();
  const photo = (owner, ref, asset, attachment = {}) => {
    const mediaId = id('media', ref);
    add('community_media', { id: mediaId, owner_id: id('user', owner), ...attachment, created_at: ago(720) });
    media.push({ id: mediaId, asset });
    return mediaId;
  };
  people.forEach(([name, handle, region, interests, bio], n) => {
    add('user', { id: id('user', n), name, email: `${handle}@example.test`, email_verified: 1, created_at: ago(2160 + n * 13), updated_at: ago(24) });
    add('collector_profiles', { id: id('profile', n), user_id: id('user', n), display_name: name, handle: `beta-${handle}`, bio: `${bio} Fictional beta collector.`, onboarding_completed: 1, created_at: iso(2160 + n * 13), updated_at: iso(24) });
    add('community_settings', { user_id: id('user', n), published: 1, visibility: 'public', interests, region, contact: 'requests' }, 'user_id');
  });
  const models = Array.from({ length: 12 }, (_, n) => {
    const [maker, make, model, year, color, asset, topic] = baseModels[n % 4];
    const scale = ['1:18', '1:43', '1:64'][Math.floor(n / 4)];
    add('catalog_products', { id: id('catalog', n), model_car_manufacturer: maker, manufacturer_key: maker.toLowerCase().replace(/\W/g, ''), manufacturer_sku: `BETA-${n + 1}`, sku_key: `beta${n + 1}`, scale, vehicle_make: make, vehicle_model: model, vehicle_year: year, color, title: `${make} ${model} · ${color}`, description: 'Fictional beta catalog release. Scale/maker combinations and photography illustrate the interface; they are not verified manufacturer specifications.', primary_image_url: `/images/${asset}`, catalog_status: 'unverified', created_at: iso(1500), updated_at: iso(1500) });
    return { maker, make, model, year, color, asset, topic, scale, title: `${make} ${model}`, price: [21900, 8900, 2495][Math.floor(n / 4)] + (n % 4) * 500 };
  });
  stores.forEach((name, n) => add('sellers', { id: id('seller', n), owner_user_id: id('user', sellerOwners[n]), slug: `beta-${name.toLowerCase().replace(/\W+/g, '-')}`, store_name: name, contact_name: people[sellerOwners[n]][0], contact_email: `${people[sellerOwners[n]][1]}@example.test`, description: `${people[sellerOwners[n]][4]} Fictional beta store; all inventory is simulated.`, status: 'active', seller_type: 'professional', stripe_account_id: `acct_beta_fixture_${n}`, stripe_charges_enabled: 1, stripe_payouts_enabled: 1, shipping_mode: n === 4 ? 'free' : 'flat', default_shipping_cents: n === 4 ? 0 : 695 + n * 100, handling_time_business_days: 1 + n % 3, shipping_origin_country: 'US', shipping_origin_region: ['WA', 'IL', 'CA', 'CO', 'FL', 'MA'][n], shipping_policy_summary: 'Ships in protective outer packaging. Beta sample shipping policy.', return_policy_summary: 'Contact the seller within 14 days. Beta sample return policy.', seller_terms_version: '2026-09-15-seller-processing-v3', seller_terms_accepted_at: iso(2160), created_at: iso(2160), updated_at: iso(24) }));
  const listings = [];
  for (let n = 0; n < 48; n++) {
    const m = models[n % 12], seller = Math.floor(n / 8), used = n % 3 === 0;
    listings.push(add('products', { id: id('listing', n), seller_id: id('seller', seller), catalog_product_id: id('catalog', n % 12), slug: `beta-${m.make}-${m.model}-${n}`.toLowerCase().replace(/[^a-z0-9-]/g, '-'), seller_sku: `BETA-${n + 1}`, title: m.title, description: `${m.title} in ${m.color.toLowerCase()}, ${m.scale} scale. ${used ? 'Carefully displayed in a closed cabinet. Original box included; light shelf wear on the outer sleeve.' : 'Boxed display model with original packaging.'} Fictional beta listing using illustrative photography.`, scale: m.scale, model_manufacturer: m.maker, vehicle_make: m.make, vehicle_model: m.model, vehicle_year: m.year, color: m.color, condition: used ? 'displayed' : 'new_opened', condition_notes: used ? 'Light display use. Tiny rub on the outer box corner; model presents cleanly.' : 'Opened for inspection and photographs. Model and packaging present cleanly.', model_condition: used ? 'near_mint' : 'mint', packaging_condition: used ? 'good' : 'excellent', original_box_status: 'included', material: n % 4 === 1 ? 'Resin' : 'Diecast', price_cents: m.price + seller * 350 - (used ? 700 : 0), currency: 'usd', inventory_quantity: n < 8 ? 1 : 2 + n % 5, reserved_quantity: 0, status: 'active', primary_image_url: `/images/${m.asset}`, package_length: '12', package_width: '9', package_height: '6', package_weight: '2', keywords: `${m.make} ${m.model} ${m.maker} ${m.topic} ${m.scale} beta`, created_at: iso(n * 4 + 1), updated_at: iso(n * 4 + 1) }));
    add('product_images', { id: id('listing-photo', n), product_id: id('listing', n), url: `/images/${m.asset}`, alt: `${m.color} ${m.title} — illustrative beta photo`, sort_order: 0 });
  }
  const pieces = [];
  people.forEach((_, owner) => {
    ['Favorites on display', owner % 2 ? 'Race weekend' : 'Japanese classics', 'Desk-sized garage'].forEach((name, shelf) => add('collection_shelves', { id: id('shelf', `${owner}-${shelf}`), owner_id: id('user', owner), name, created_at: ago(1200 + shelf) }));
    for (let slot = 0; slot < 8; slot++) {
      // The first seller owns the eight single-piece listings used by offer demos.
      const index = owner === 1 ? slot : (owner * 3 + slot) % 12, m = models[index];
      const pieceId = id('piece', `${owner}-${slot}`), visibility = slot === 7 && owner !== 1 ? 'private' : 'public';
      const availability = owner === 1 ? (slot < 5 ? 'open_to_offers' : 'for_sale') : slot === 6 ? 'previously_owned' : 'not_for_sale';
      const mediaId = id('media', `piece-${owner}-${slot}`);
      pieces.push(add('collection_items', { id: pieceId, owner_id: id('user', owner), catalog_id: id('catalog', index), listing_id: owner === 1 ? id('listing', slot) : null, title: m.title, scale: m.scale, maker: m.maker, car_make: m.make, color: m.color, story: ['The piece that started this part of the collection. Still a favorite after several shelf rearrangements.', 'Found this while looking for something entirely different. It fits the theme better than I expected.', 'I keep this near the desk so I can enjoy the details between projects.', 'A gift with a story attached. It has earned its place in the cabinet.'][slot % 4], condition: 'Displayed carefully; original box retained.', visibility, availability, photos: JSON.stringify([mediaId]), private_notes: 'PRIVATE BETA NOTE: stored in cabinet two; keep the original receipt in the box.', purchase_cost: String(m.price / 100 - 10), minimum_cents: owner === 1 ? Math.floor(listings[slot].price_cents * 0.75) : 0, pinned: slot === 0 ? 1 : 0, created_at: ago(owner * 7 + slot * 24 + 2) }));
      photo(owner, `piece-${owner}-${slot}`, m.asset, { item_id: pieceId });
      add('shelf_members', { id: id('shelf-member', `${owner}-${slot}`), shelf_id: id('shelf', `${owner}-${slot % 3}`), item_id: pieceId });
      if (slot === 0) add('shelf_members', { id: id('shelf-member', `${owner}-${slot}-extra`), shelf_id: id('shelf', `${owner}-2`), item_id: pieceId });
    }
  });
  // A personal unmatched item exercises the catalog/piece distinction.
  add('collection_items', { id: id('piece', 'custom'), owner_id: id('user', 0), title: 'My first repainted coupe', scale: '1:64', maker: 'Personal custom', car_make: 'Nissan', color: 'Red', story: 'A practice repaint from my first year collecting. The exact base release is still unidentified.', visibility: 'private', photos: '[]', private_notes: 'Unmatched personal item — do not create a catalog identity from this.', purchase_cost: '8.00', created_at: ago(48) });
  people.forEach((_, owner) => {
    for (let offset = 1; offset <= 6 + owner % 7; offset++) add('collector_relationships', { id: id('follow', `${owner}-${offset}`), owner_id: id('user', owner), target_id: id('user', (owner + offset) % people.length), kind: 'follow', created_at: ago(400 - offset * 4) });
    for (let n = 0; n < 4; n++) add('model_wishlist', { id: id('wish', `${owner}-${n}`), owner_id: id('user', owner), catalog_id: id('catalog', (owner + n * 2) % models.length), created_at: ago(n * 5 + 1) });
  });
  for (let n = 0; n < 72; n++) {
    const owner = (n * 7) % people.length, slot = n % 6, piece = pieces[owner * 8 + slot];
    const modelIndex = Number(piece.catalog_id.split('-').at(-1)), m = models[modelIndex];
    const postId = id('post', n), hours = 0.15 + n * 2.3, question = n % 8 === 6;
    const mediaId = id('media', `post-${n}`);
    const commercial = owner === 1 && n > 20;
    add('community_posts', { id: postId, owner_id: id('user', owner), body: `${n < 24 ? '' : n < 48 ? 'From last weekend: ' : 'A recent collection note: '}${captions[n % captions.length]}`, photos: JSON.stringify(question ? [] : [mediaId]), topic: `${m.topic}, ${m.scale}, ${m.make}`, prompt: question ? 'Question' : ['Model photography', 'Latest addition', 'Collection display'][n % 3], catalog_id: piece.catalog_id, item_id: piece.id, commercial: commercial ? 1 : 0, created_at: ago(hours) });
    if (!question) photo(owner, `post-${n}`, m.asset, { post_id: postId });
    for (let c = 0; c < 2 + n % 6; c++) add('community_comments', { id: id('comment', `${n}-${c}`), owner_id: id('user', (owner + c + 1) % people.length), post_id: postId, body: replies[(n + c * 3) % replies.length], created_at: ago(Math.max(0.01, hours - (c + 1) * 0.025)) });
    for (let a = 0; a < 3 + n % 16; a++) {
      const actor = (owner + a + 1) % people.length;
      add('community_post_actions', { id: id('like', `${n}-${actor}`), owner_id: id('user', actor), post_id: postId, kind: 'like', created_at: ago(Math.max(0.01, hours - 0.01)) });
      if (a % 3 === 0) add('community_post_actions', { id: id('save', `${n}-${actor}`), owner_id: id('user', actor), post_id: postId, kind: 'save', created_at: ago(Math.max(0.01, hours - 0.01)) });
    }
  }
  add('community_editorial', { id: id('editorial', 0), title: 'Small cars. Great stories.', body: 'This week, share the model that started it all. A pocket-money find, a gift, or a long-awaited grail: every collection has a first chapter.', topic: 'JDM', spotlight_id: id('user', 0), author: 'MCC beta editorial', created_at: ago(3) });
  const threads = [
    [8, 0, 'accepted', 'Window-light photography', ['Your last photo convinced me to try the grey-card setup. How far was the car from the window?', 'About half a meter. I used a white notebook on the other side to soften the shadow.', 'Tried it this morning and it worked beautifully. Thanks for sharing the setup!']],
    [0, 9, 'accepted', 'Fairlady Z details', ['I am comparing the trim around the rear window on my S30. Have you noticed any differences between releases?', 'Yes, I made a few notes on my collection page. Happy to compare photos.', 'That would be great. I will take a closer shot at the weekend.']],
    [12, 0, 'request', 'Your display shelves', ['Hi Alex! Your collection layout looks close to the space I have. Would you mind sharing the shelf depth?']],
    [16, 0, 'request', 'A first collection question', ['Hello! I am choosing between 1:43 and 1:64 for a small cabinet. I liked your mixed-scale display and would love to hear what worked.']],
    [2, 1, 'request', 'Packaging question', ['Hi Maya, does the Porsche include the original display base and clear cover?']],
    [0, 3, 'accepted', 'Desk display advice', ['I am putting together a small desk display. Would the smaller scale be a better fit?', 'For a desk, I would start with three 1:64 pieces and leave room around them. A low riser helps.']],
    [2, 16, 'accepted', 'Welcome to the hobby', ['Thanks for the warm welcome on my first post.', 'Glad you joined! Start with cars you enjoy, and the collection will find its own theme.']],
  ];
  threads.forEach(([sender, recipient, status, reference, messages], n) => {
    add('collector_threads', { id: id('thread', n), sender_id: id('user', sender), recipient_id: id('user', recipient), reference, status, sender_read_at: ago(4), recipient_read_at: ago(12), created_at: ago(72 + n), updated_at: ago(0.5 + n * 0.4) });
    messages.forEach((body, m) => add('collector_messages', { id: id('message', `${n}-${m}`), thread_id: id('thread', n), owner_id: id('user', m % 2 ? recipient : sender), body, created_at: ago(8 + n - m * 3) }));
  });
  for (let n = 0; n < 4; n++) {
    const listing = listings[n], piece = pieces[8 + n], offerId = id('offer', n), threadId = id('offer-thread', n);
    add('collector_threads', { id: threadId, sender_id: id('user', 0), recipient_id: id('user', 1), item_id: piece.id, reference: listing.title, status: 'accepted', created_at: ago(10 + n), updated_at: ago(0.5 + n) });
    const terms = JSON.stringify({ listingId: listing.id, title: listing.title, catalogId: listing.catalog_product_id, condition: listing.condition, conditionNotes: listing.condition_notes, modelCondition: listing.model_condition, packageLength: '12', packageWidth: '9', packageHeight: '6', packageWeight: '2', shipFrom: null, shippingMode: 'flat', shippingCents: 695, handlingDays: 1, currency: 'usd' });
    add('collection_offers', { id: offerId, root_id: offerId, item_id: piece.id, buyer_id: id('user', 0), owner_id: id('user', 1), proposer_id: id('user', n === 1 ? 1 : 0), thread_id: threadId, price_cents: Math.floor(listing.price_cents * (n === 1 ? 0.95 : 0.9)), currency: 'usd', terms, item_version: 1, destination: JSON.stringify({ country: 'US', postalCode: '97205' }), expires_at: now + 40 * 3600000, created_at: ago(8) });
    add('collector_messages', { id: id('offer-message', n), thread_id: threadId, owner_id: id('user', n === 1 ? 1 : 0), body: n === 1 ? 'Thanks for your interest. Here is my proposed price for this piece.' : 'A private offer for the piece we discussed.', offer_id: offerId, created_at: ago(3 + n) });
    if (n === 2) transitions.push({ id: offerId, status: 'reserved', paymentDeadline: now + 22 * 3600000 });
    if (n === 3) transitions.push({ id: offerId, status: 'declined' });
  }
  for (let n = 0; n < 18; n++) add('community_notifications', { id: id('notification', n), owner_id: id('user', 0), actor_id: id('user', 1 + n % 23), category: n % 4 === 0 ? 'message' : 'social', label: ['New message request', 'New reply', 'New follower'][n % 3], href: n % 3 === 0 ? '/messages?tab=requests' : n % 3 === 1 ? `/community/posts/${id('post', n)}` : `/collectors/beta-${people[1 + n % 23][1]}`, read_at: n > 10 ? ago(12) : null, created_at: ago(0.25 + n * 2) });
  return { records, media, transitions, people: people.map(([name, handle], n) => ({ id: id('user', n), name, handle: `beta-${handle}`, email: `${handle}@example.test` })) };
}

export function insertStatement({ table, row, key = 'id' }) {
  const columns = Object.keys(row);
  return { sql: `INSERT INTO "${table}" (${columns.map(c => `"${c}"`).join(',')}) SELECT ${columns.map(() => '?').join(',')} WHERE NOT EXISTS (SELECT 1 FROM "${table}" WHERE "${key}"=?)`, values: [...Object.values(row), row[key]] };
}
