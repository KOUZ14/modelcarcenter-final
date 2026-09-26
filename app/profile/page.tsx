import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ProfileEditor } from "@/components/collector-profile";
import { requireCollector } from "@/lib/collector-auth";
import { getCollection, settings } from "@/lib/community";
import { profileDiscussionReturn } from "@/lib/community-presentation";
import { publicPreviewPieces } from "@/lib/profile-editor";
export const dynamic = "force-dynamic";
export const metadata = { title: "Profile", robots: { index: false, follow: false } };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ edit?: string; returnTo?: string; intent?: string }> }) {
  const query = await searchParams;
  const returnTo = profileDiscussionReturn(query.returnTo);
  const commentSetup = query.intent === "comment" && Boolean(returnTo?.endsWith("#comment-composer"));
  const profileQuery = new URLSearchParams({
    ...(query.edit ? { edit: "1" } : {}),
    ...(returnTo ? { returnTo } : {}),
    ...(commentSetup ? { intent: "comment" } : {}),
  });
  const collector = await requireCollector("/profile" + (profileQuery.size ? "?" + profileQuery : ""));
  const profileSettings = await settings(collector.user.id);
  if (collector.profile.handle && profileSettings.published) {
    if (commentSetup && returnTo) redirect(returnTo);
    if (!query.edit) redirect(`/collectors/${collector.profile.handle}`);
  }
  const previewPieces = publicPreviewPieces(await getCollection(collector.user.id, collector.user.id));
  return <><SiteHeader/><main id="main-content" className="community-detail shell">
    <ProfileEditor profile={collector.profile} settings={profileSettings} returnTo={returnTo} commentSetup={commentSetup} previewPieces={previewPieces}/>
  </main></>;
}
