import { env } from "cloudflare:workers";
import { requireAdminApi } from "@/lib/admin-auth";
import { getCurrentCollector } from "@/lib/collector-auth";
import {
  getResolutionFileForAdmin,
  getResolutionFileForUser,
} from "@/lib/resolution";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const fileId = (await params).id;
  const collector = await getCurrentCollector(request.headers);
  let file: {
    id: string;
    storageKey: string;
    originalName: string;
    mimeType: string;
  } | null = collector
    ? await getResolutionFileForUser(collector.user.id, fileId)
    : null;
  if (!file) {
    const admin = await requireAdminApi();
    if (admin instanceof Response) return admin;
    file = await getResolutionFileForAdmin(fileId);
  }
  if (!file) return new Response("Not found", { status: 404 });
  const object = await env.IMAGES.get(file.storageKey);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", file.mimeType);
  headers.set(
    "Content-Disposition",
    `${file.mimeType === "application/pdf" ? "attachment" : "inline"}; filename="${file.originalName.replaceAll('"', "")}"`,
  );
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
}
