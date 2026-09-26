import { requireCollectorApi } from "@/lib/collector-auth";
import { readJsonObject, routeError } from "@/lib/http";
import {
  getMessagingCenterData,
  markConversationRead,
  sendConversationMessage,
  startConversation,
  startSellerConversation,
} from "@/lib/messaging";
import { requiredString, ValidationError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const collector = await requireCollectorApi(request);
  if (collector instanceof Response) return collector;
  try {
    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversation") || undefined;
    const productId = url.searchParams.get("product") || undefined;
    return Response.json({
      ok: true,
      data: await getMessagingCenterData(collector.user.id, {
        conversationId,
        productId,
        sellerId: url.searchParams.get("seller") || undefined,
        sellerOnly: url.searchParams.get("context") === "seller",
      }),
    });
  } catch (error) {
    return routeError(error, "Your messages are temporarily unavailable.");
  }
}

export async function POST(request: Request) {
  const collector = await requireCollectorApi(request);
  if (collector instanceof Response) return collector;
  try {
    const payload = await readJsonObject(request);
    const action = requiredString(payload.action, "action", 40);
    if (action === "start" || action === "start_seller") {
      const result = action === "start_seller" ? await startSellerConversation(
        collector.user.id, requiredString(payload.sellerId, "sellerId", 100), payload.body,
      ) : await startConversation(
        collector.user.id,
        requiredString(payload.productId, "productId", 100),
        payload.body,
      );
      if (result.collectorThread) return Response.json({ok:true,redirect:`/messages?thread=${encodeURIComponent(result.conversationId)}&tab=requests`});
      return Response.json({
        ok: true,
        data: await getMessagingCenterData(collector.user.id, {
          conversationId: result.conversationId,
          sellerOnly: payload.context === "seller",
        }),
      });
    }
    if (action === "send") {
      const result = await sendConversationMessage(
        collector.user.id,
        requiredString(payload.conversationId, "conversationId", 100),
        payload.body,
      );
      return Response.json({
        ok: true,
        data: await getMessagingCenterData(collector.user.id, {
          conversationId: result.conversationId,
          sellerOnly: payload.context === "seller",
        }),
      });
    }
    if (action === "mark_read") {
      await markConversationRead(
        collector.user.id,
        requiredString(payload.conversationId, "conversationId", 100),
      );
      return Response.json({ ok: true });
    }
    throw new ValidationError("Unknown messaging action.");
  } catch (error) {
    return routeError(error, "The message could not be sent.");
  }
}
