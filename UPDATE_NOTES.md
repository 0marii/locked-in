# Locked-In update notes

## Included changes

- Added the Pink theme to the theme selector and CSS design tokens.
- Kept existing theme persistence and updated theme-color metadata through the existing theme logic.
- Added a fixed, accessible back-to-top button that appears after scrolling beyond 420px.
- Back-to-top respects the user's reduced-motion preference.
- Improved theme selector sizing and mobile navigation menu scrolling.
- Added restrained hover/focus feedback and extra focus-visible styles.
- Replaced placeholder `feedback@example.com` mail links with GitHub issue creation links.
- Added a Node built-in smoke-test suite and npm scripts; no runtime dependencies were added.
- Updated README feature list, file tree, test instructions, and Lighthouse caveats.

## Verification performed

- `node --check app.js` — passed.
- `node --check locked-in-enhancements.js` — passed.
- `npm test` — 5 tests passed.
- Static HTML check — no duplicate IDs, no unmatched label targets, and no missing local asset references found.

## Not claimed

A full browser-driven end-to-end run and Lighthouse audits were not completed in this environment. Therefore, no Lighthouse score of 100 is claimed. After deployment, test timer start/break/resume/end, session history, exports/imports, themes, and mobile navigation in a real browser and run Lighthouse on both mobile and desktop.
