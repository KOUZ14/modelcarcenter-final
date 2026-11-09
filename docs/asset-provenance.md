# Asset provenance register

Reviewed September 16, 2026. A file being present is not evidence of permission. No ownership or licensing records were provided during this audit; retain receipts, original source files, creator agreements, or licenses with the business records.

| Asset | Current use | Evidence status / owner action |
| --- | --- | --- |
| `public/images/model-car-center-logo.png`, `model-car-center-logo-dark.svg`, `model-car-center-icon.png` | Brand identity | Confirm ownership of the original artwork and any incorporated graphics. |
| `public/favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `icon-32.png`, `icon-192.png`, `icon-512.png` | Derived app/browser icons | Confirm rights to the underlying brand artwork. |
| `public/images/model-car-hero.png` | Homepage hero | Identify creator/source and permission for commercial website use. |
| `public/og.png` | Social link preview | Record source/creator and rights to any underlying artwork. |
| `public/images/product-black-sedan.png`, `product-blue-supercar.png`, `product-red-coupe.png`, `product-silver-racer.png` | Development/demo catalog assets | Record origin and commercial-use permission before reuse in real listings. Demo seed is not run in production. |
| Seller-uploaded R2 listing/store media and externally hosted images | Product/gallery/storefront content | Existing Seller Terms require rights. Keep seller attribution and investigate infringement reports; a contractual promise is not independent license evidence. |
| System Arial / Helvetica / sans-serif | Browser-rendered typography | No font files are distributed or fetched from a font CDN by the application. Recheck if webfonts are added. |
| `components/icons.tsx` and utility SVG files | UI icons | Record artwork provenance if sourced externally; existing code assets were retained during this audit. |

For each resolved entry record: asset path/hash, source URL or original creator, owner/licensee, permitted uses, restrictions/attribution, acquisition date, and evidence location. Do not store confidential receipts in the public directory.
