import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";

export function PolicyPage({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: React.ReactNode }) {
  return <main><SiteHeader/><article className="inner-page shell legal-page"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="legal-intro">{intro}</p><div className="legal-notice">Launch draft: this operational policy is provided for founder and legal review before public launch. It is not legal advice.</div><div className="legal-content">{children}</div></article><SiteFooter/></main>;
}
