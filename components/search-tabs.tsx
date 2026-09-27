import Link from "next/link";
import { marketplaceHref } from "@/lib/discovery";

export function SearchTabs({ query, active }: { query: string; active: "models" | "collectors" | "posts" }) {
  return <nav className="discovery-tabs" aria-label="Search result type">
    {(["models", "collectors", "posts"] as const).map(type => <Link key={type}
      href={type === "models" ? marketplaceHref({ q: query }) : `/search?${new URLSearchParams({ q: query, type })}`}
      aria-current={active === type ? "page" : undefined}>{type === "models" ? "Models" : type === "collectors" ? "Collectors" : "Posts"}</Link>)}
  </nav>;
}
