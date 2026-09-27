export async function expireCollectionOffersIn(database:D1Database,now=Date.now()) {
  await database.prepare("UPDATE collection_offers SET status='expired' WHERE (status='proposed' AND expires_at<=?) OR (status='reserved' AND payment_deadline<=?)").bind(now,now).run();
}
