"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";

export function SellerStart({ collectorFee, professionalFee, application }: {
  collectorFee: string;
  professionalFee: string;
  application: ReactNode;
}) {
  const applicationDetails = useRef<HTMLDetailsElement>(null);
  const applicationTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function revealApplication() {
      if (window.location.hash !== "#professional-application") return;
      if (applicationDetails.current) applicationDetails.current.open = true;
      applicationTarget.current?.focus({ preventScroll: true });
      applicationTarget.current?.scrollIntoView({ block: "start" });
    }
    revealApplication();
    window.addEventListener("hashchange", revealApplication);
    return () => window.removeEventListener("hashchange", revealApplication);
  }, []);

  return <div className="sell-start">
    <div className="sell-choices" aria-label="Compare seller options">
      <article className="sell-choice" aria-label="Collector selling">
        <Link className="button dark" href="/sell/model">Sell from my collection</Link>
        <p className="sell-choice-fee"><strong>{collectorFee}</strong> marketplace fee + processing</p>
        <p>Your own models · collector account</p>
        <details>
          <summary>What you’ll need</summary>
          <p>Sign in, add model and condition details, and upload actual photos. Before publishing, complete payout and shipping setup. Publish your listing when it is ready.</p>
        </details>
      </article>
      <article className="sell-choice" aria-label="Store selling">
        <a className="button dark" href="#professional-application" onClick={() => {
          if (applicationDetails.current) applicationDetails.current.open = true;
        }}>Apply as a store</a>
        <p className="sell-choice-fee"><strong>{professionalFee}</strong> marketplace fee + processing</p>
        <p>Business inventory · approval required</p>
        <details>
          <summary>What you’ll need</summary>
          <p>Your business name, contact details, current selling channels and approximate inventory size. No bank details are needed to apply.</p>
        </details>
      </article>
    </div>
    <p className="sell-shared-fees">No listing or monthly fees. Marketplace fees apply to the item price, excluding shipping and tax.</p>
    <nav className="sell-quick-links" aria-label="Seller resources">
      <a href="#listing-preview">Preview the seller tools <span aria-hidden="true">↓</span></a>
      <Link href="/store">Seller Dashboard <span aria-hidden="true">↗</span></Link>
    </nav>
    <details className="sell-application-disclosure" ref={applicationDetails}>
      <summary>Store application <span>Business details and founding-store offer</span></summary>
      <div id="professional-application" tabIndex={-1} ref={applicationTarget}>{application}</div>
    </details>
  </div>;
}
