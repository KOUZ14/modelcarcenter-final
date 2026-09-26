import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SearchTabs } from "@/components/search-tabs";
import { getCurrentCollector } from "@/lib/collector-auth";
import { collectors, feed } from "@/lib/community";
import { marketplaceHref, readMarketplaceFilters } from "@/lib/discovery";
import { CollectorCard, PostCard } from "@/components/community-ui";
import "@/components/discovery.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const read = (name: string) => Array.isArray(params[name]) ? params[name][0] ?? "" : params[name] ?? "";
  const filters = readMarketplaceFilters({ get: read });
  const type = read("type");
  // Preserve legacy /search links while keeping every shopping search on one flow.
  if (type !== "collectors" && type !== "posts") redirect(marketplaceHref(filters));
  const collector = await getCurrentCollector();
  const viewer = collector?.user.id ?? null;
  const profiles = type === "collectors" ? await collectors(viewer, filters.q) : [];
  const posts = type === "posts" ? await feed(viewer, { q: filters.q }) : [];
  return <><SiteHeader /><main id="main-content" tabIndex={-1} className="community-detail shell">
    <h1>Search Model Car Center</h1>
    <form className="community-search" method="get" role="search">
      <label htmlFor="community-query">Search {type}<input id="community-query" name="q" type="search" defaultValue={filters.q} placeholder={type === "collectors" ? "Collector name" : "Search public posts"} /></label>
      <input type="hidden" name="type" value={type} /><button className="button dark">Search</button>
    </form>
    <SearchTabs query={filters.q} active={type} />
    {profiles.length || posts.length ? <div className="catalog-model-results">{profiles.map(profile => <CollectorCard collector={profile} key={profile.userId} />)}{posts.map(post => <PostCard post={post} key={post.id} />)}</div> : <div className="no-results"><h2>No {type}{filters.q ? ` match “${filters.q}”` : " yet"}</h2><p>{type === "collectors" ? "Public collector profiles will appear here as people join." : "Public collection photos and discussions will appear here as collectors share them."}</p><Link className="button outline" href={marketplaceHref({ q: filters.q })}>Search models for sale</Link>{filters.q && <Link className="text-link" href={`/search?type=${type}`}>Browse all {type}</Link>}</div>}
  </main><SiteFooter /></>;
}
