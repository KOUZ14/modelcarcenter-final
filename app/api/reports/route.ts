import { readJsonObject,routeError } from "@/lib/http";
import { submitMarketplaceReport } from "@/lib/marketplace-reports";
export async function POST(request:Request) {try{return Response.json(await submitMarketplaceReport(await readJsonObject(request)),{status:201});}catch(error){return routeError(error);}}
