import { getD1 } from "@/db";
export async function purchaseEvidenceForOrder(orderId:string) {
  const rows=await getD1().prepare(`SELECT e.id,e.snapshot,e.captured_at FROM purchase_evidence e
    WHERE e.checkout_id=(SELECT checkout_reservation_id FROM orders WHERE id=?)
    OR e.preorder_id IN (SELECT id FROM preorder_reservations WHERE order_id=?)`).bind(orderId,orderId).all<{id:string;snapshot:string;captured_at:string}>();
  return (rows.results??[]).map(row=>({...row,snapshot:JSON.parse(row.snapshot)}));
}
