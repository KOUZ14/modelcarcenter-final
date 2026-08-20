import { env } from "cloudflare:workers";
import { requireCollectorApi } from "@/lib/collector-auth";
import { routeError } from "@/lib/http";
import {
  addResolutionEvidence,
  authorizeResolutionReturn,
  closeResolutionCase,
  escalateResolutionCase,
  getResolutionCenterData,
  issueResolutionRefund,
  markResolutionReturnShipped,
  openResolutionCase,
  respondToResolutionCase,
} from "@/lib/resolution";
import { requiredString, ValidationError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const collector = await requireCollectorApi(request);
  if (collector instanceof Response) return collector;
  try {
    return Response.json({
      ok: true,
      data: await getResolutionCenterData(collector.user.id),
    });
  } catch (error) {
    return routeError(error, "The resolution center is temporarily unavailable.");
  }
}

export async function POST(request: Request) {
  const collector = await requireCollectorApi(request);
  if (collector instanceof Response) return collector;
  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ValidationError("Submit a valid resolution-center form.");
    }
    const payload = Object.fromEntries(form.entries());
    const action = requiredString(payload.action, "action", 40);
    const files = form
      .getAll("files")
      .filter((value): value is File => value instanceof File && value.size > 0);

    if (action === "open_case")
      return Response.json({
        ok: true,
        ...(await openResolutionCase({
          userId: collector.user.id,
          payload,
          files,
          storage: env.IMAGES,
        })),
      });
    if (action === "add_evidence")
      return Response.json({
        ok: true,
        ...(await addResolutionEvidence({
          userId: collector.user.id,
          caseId: requiredString(payload.caseId, "caseId", 100),
          caption: payload.caption,
          files,
          storage: env.IMAGES,
        })),
      });
    if (action === "seller_response")
      return Response.json({
        ok: true,
        ...(await respondToResolutionCase(collector.user.id, payload)),
      });
    if (action === "authorize_return")
      return Response.json({
        ok: true,
        ...(await authorizeResolutionReturn({
          userId: collector.user.id,
          payload,
          label: files[0] ?? null,
          storage: env.IMAGES,
        })),
      });
    if (action === "return_shipped")
      return Response.json({
        ok: true,
        ...(await markResolutionReturnShipped(collector.user.id, payload)),
      });
    if (action === "escalate")
      return Response.json({
        ok: true,
        ...(await escalateResolutionCase(collector.user.id, payload)),
      });
    if (action === "close_case")
      return Response.json({
        ok: true,
        ...(await closeResolutionCase(collector.user.id, payload)),
      });
    if (action === "issue_refund")
      return Response.json({
        ok: true,
        ...(await issueResolutionRefund(collector.user.id, payload)),
      });
    throw new ValidationError("Unknown resolution-center action.");
  } catch (error) {
    return routeError(error, "The resolution-center action could not be completed.");
  }
}

