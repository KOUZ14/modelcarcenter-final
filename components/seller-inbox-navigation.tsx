"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export function SellerInboxNavigation({ tabs, selected }: { tabs: string[][]; selected: string }) {
  const router = useRouter();
  return <><nav className="hub-filters seller-inbox-desktop" aria-label="Seller inbox">{tabs.map(([key, label]) => <Link key={key} aria-current={selected === key ? "page" : undefined} href={`/store?view=messages&tab=${key}`}>{label}</Link>)}</nav><label className="seller-control seller-inbox-mobile">Inbox view<select value={selected} onChange={event => router.push(`/store?view=messages&tab=${event.target.value}`)}>{tabs.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></>;
}
