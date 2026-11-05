import { requireAdminApi } from "@/lib/admin-auth";
import { readJsonObject,routeError } from "@/lib/http";
import { complianceAction } from "@/lib/compliance-admin";
export async function POST(request:Request){try{const admin=await requireAdminApi();if(admin instanceof Response)return admin;await complianceAction(admin.email,await readJsonObject(request));return Response.json({ok:true});}catch(error){return routeError(error);}}
