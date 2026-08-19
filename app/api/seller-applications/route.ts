import { getDb } from "@/db";
import { sellerApplications } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { readJsonObject, routeError } from "@/lib/http";
import { parseSellerApplication } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const payload = parseSellerApplication(await readJsonObject(request));
    const id = crypto.randomUUID();
    await getDb().insert(sellerApplications).values({ id, ...payload });
    await sendEmail({
      to: payload.email,
      subject: "We received your Model Car Center seller application",
      html: `<h1>Application received</h1><p>Thanks for applying to sell with Model Car Center. We'll review your store and contact you at this email.</p>`,
      text: "Thanks for applying to sell with Model Car Center. We'll review your store and contact you at this email.",
      idempotencyKey: `seller-application-${id}`,
    }).catch(console.error);
    return Response.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    return routeError(error, "We couldn't save your application. Please try again.");
  }
}
