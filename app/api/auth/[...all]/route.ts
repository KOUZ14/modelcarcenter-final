import { getCollectorAuth } from "@/lib/auth";
import { routeError } from "@/lib/http";

export const dynamic = "force-dynamic";

async function handler(request: Request) {
  try {
    return await getCollectorAuth().handler(request);
  } catch (error) {
    return routeError(error, "Collector authentication is temporarily unavailable.");
  }
}

export const GET = handler;
export const POST = handler;
