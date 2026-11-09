import { getD1 } from "@/db";
import { ValidationError } from "./validation";

export async function grantFoundingFeeOffer(sellerId: string, actor: string) {
  const db = getD1();
  const seller = await db.prepare("SELECT seller_type sellerType, founding_fee_granted_at grantedAt FROM sellers WHERE id=?")
    .bind(sellerId).first<{sellerType: string; grantedAt: string | null}>();
  if (!seller || seller.sellerType !== "professional") throw new ValidationError("Only professional store accounts can receive this offer.");
  if (seller.grantedAt) return { alreadyGranted: true };
  const grantedAt = new Date().toISOString();
  await db.batch([
    db.prepare(`UPDATE sellers SET founding_fee_granted_at=?, founding_fee_granted_by=?, is_founding_seller=1, updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND seller_type='professional' AND founding_fee_granted_at IS NULL`).bind(grantedAt, actor, sellerId),
    db.prepare(`INSERT INTO admin_activity (id,action,record_id,actor,detail)
      SELECT ?, 'grant_founding_fee_offer', ?, ?, ? WHERE changes()=1`)
      .bind(crypto.randomUUID(), sellerId, actor, JSON.stringify({grantedAt, feeFreeUnits:10})),
  ]);
  return { grantedAt };
}
