# Locked-In update notes — History and navigation fixes

- Fixed the brand logo navigation so it returns to the Focus/setup screen, and cache-busted the stylesheet and application script with `?v=4` for GitHub Pages deployments.
- Made the floating back-to-top button initialize its visibility on page load, show after 240px of scrolling, and remain keyboard-inaccessible while hidden.
- Added footer links for requesting a feature and reporting a bug through GitHub Issues, alongside the configured contact email.
- Corrected history summary and insight averages to use a time-weighted focus ratio (total focus / total elapsed).
- Kept the history table's nine columns aligned with its nine rendered cells and improved full-width horizontal scrolling, wrapping, action-column sizing, and mobile toolbar layout.
- Clarified search to include goals, topics, and notes; hid About content while viewing History; improved report/chart panel spacing and heading tracking.
- Retained static GitHub Pages compatibility: no server-side requirements or build step added.

## Checks run

- `node --check app.js` — passed.
- `node --test tests/static-contract.test.cjs` — 8 tests passed.

Browser-based end-to-end testing and Lighthouse audits were not run in this environment.
