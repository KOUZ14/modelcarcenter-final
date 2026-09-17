import { config } from "@/lib/config";

export function BusinessIdentity() {
  return <p>Model Car Center is operated by {config.businessLegalName}, a sole proprietorship.</p>;
}

export function BusinessDetails() {
  return <section className="business-details" aria-label="Business details"><h2>Business details</h2><dl>
    <div><dt>Trading name</dt><dd>Model Car Center</dd></div>
    {config.businessLegalName && <div><dt>Legal operator</dt><dd>{config.businessLegalName}</dd></div>}
    <div><dt>Business type</dt><dd>Sole proprietorship</dd></div>
    {config.businessMailingAddress && <div><dt>Mailing address</dt><dd>{config.businessMailingAddress}</dd></div>}
    {config.businessJurisdiction && <div><dt>Registration jurisdiction</dt><dd>{config.businessJurisdiction}</dd></div>}
    <div><dt>Customer support and privacy requests</dt><dd><a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a></dd></div>
  </dl><p>Independent sellers are identified on their storefronts and product pages. Contact support before mailing an item; the business mailing address is not a return authorization.</p></section>;
}
