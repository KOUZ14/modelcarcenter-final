# Mobile experience

The mobile layout applies at 820px and below. Desktop retains the full navigation and persistent Shop filters.

- The bottom navigation has labeled icons for Shop, Community, Collection, Inbox and Explore. Explore exposes shopping, account, selling and support destinations without requiring users to find the account dropdown.
- Shop shows results before filter controls. Filters open in a native modal sheet, update the matching count immediately, and remain in the URL. Sort stays next to the Filters button. Active filter chips remove individual constraints; Clear all resets the search and filters.
- Explore and filter sheets trap focus, close with Escape or a backdrop tap, restore focus to the opener, and release the background scroll lock when closed or resized to desktop.
- The home page is a discovery page with a compact search introduction, scale links, and a recent-inventory preview: four models on mobile and up to eight on desktop. Filtering and pagination live in Shop. Manufacturer links, Model Hunt, explanations and email signup expand on demand. Existing `/#model-hunt` links open and scroll to the form.
- Product grids use two columns. Card titles and seller names wrap; photo badges and save buttons occupy separate corners.
- Available product cards have a direct Add to cart button with confirmation and quantity limits. Preorders link to the reservation flow; sold-out models keep their details link. Both guests and signed-in buyers use the existing shared cart.
- Breadcrumbs align the link, separator and current page on one row. Long current-page titles truncate in the breadcrumb; the full title remains in the page heading.
- The cart shows compact item rows before the delivery form, with quantity, remove and price grouped together. Shipping prices or pending status stay visible in expandable seller sections; combined-shipping requests expand separately. Jump links reach the delivery address and checkout summary. The mobile address form keeps state and ZIP together.
- Text fields and selects use 16px text on mobile. Main controls have at least 44px tap targets. Forms stack, and community tabs scroll horizontally.
- Bottom navigation, cookie notice and page padding account for device safe areas. Cookie notice height is measured so content can scroll clear of both fixed elements.
- Headings across shopping, community, collection, account, seller and support pages use consistent tracking and readable line spacing. Standard sections use 28px vertical padding on mobile and 32–56px on desktop. Data cards size to their content instead of large presentation-style minimum heights.
- Product specifications and seller reputation use compact labeled rows on phones, retaining condition, defect, shipping and return information. Account, seller and support summaries have smaller headings and tighter spacing. Conversation histories have a bounded height so the composer stays closer to the thread.
- Footer link groups collapse on mobile and open on desktop. All links and cookie settings remain available; native disclosure controls work without JavaScript too.

## Device review

Before release, review 320px, 390px, 768px and desktop widths in a real browser. Check signed-in and guest navigation, every Explore link, focus restoration and Escape, filter changes and clearing, empty results, pagination, long product titles, the on-screen keyboard, cookie settings, and portrait/landscape rotation. Also check Model Hunt links from another page and the empty home catalog, opening/submitting the collapsed forms, footer groups across breakpoints, product disclosures, account metrics, seller forms, support cases and message composers. For shopping, check card quick-add feedback, cart limits and save errors, breadcrumb alignment, multi-seller carts, shipping disclosures and rate selection, address validation from the shipping buttons, cart jump links, and checkout with pending/expired quotes. This is a manual review checklist, not a record of completed device tests.
