# Locked-In

A customizable, browser-based focus timer and deep-work tracker. Built with vanilla HTML, CSS, and JavaScript; no build step, backend, account, or third-party runtime dependency is required.

**Live site:** https://0marii.github.io/locked-in/  
**Repository:** https://github.com/0marii/locked-in

## Features

- Focus on a custom goal (for example, coding, studying, writing, reading, or your own text).
- Choose 25, 45, 60, or 90 minutes, or reveal the custom duration fields to enter hours and minutes.
- Standard and optional Hardcore session styles.
- Timestamp-based countdown calculations to reduce timer drift when the browser throttles interval callbacks.
- Break tracking and a consistent 15-minute Hardcore break limit.
- Session report with focused time, elapsed time, break time, focus-time ratio, editable topics, and notes.
- Notes and topics are preserved in local history, shown in reports and searchable in session history.
- Resume an active timer after refreshing or reopening the page.
- Edit session notes or delete individual history records.
- Import JSON backups and merge records by session ID.
- Searchable local session history.
- CSV export and JSON backup.
- Five themes: Dark, Light, Forest, Violet, and Pink.
- Responsive layout with a mobile hamburger navigation menu.
- Keyboard shortcuts: `B` toggles a break and `S` ends a session while the timer screen is active.
- SEO metadata, canonical URL, Open Graph metadata, JSON-LD, `robots.txt`, and sitemap.
- Respects reduced-motion preferences and includes basic keyboard accessibility support.

## Project files

```text
locked-in/
├── index.html
├── style.css
├── app.js
├── favicon.svg
├── robots.txt
├── sitemap.xml
└── README.md
```

## Run tests

The included Node.js static-contract tests check key UI and persistence contracts without a build step:

```bash
node --test tests/static-contract.test.cjs
node --check app.js
```

These are source-level checks, not a substitute for manual browser and Lighthouse testing.

## Run locally

Open `index.html` directly, or run a local static server:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploy to GitHub Pages

This project is designed for a project site hosted at `https://0marii.github.io/locked-in/`.

1. Commit the files to the repository's publishing branch.
2. In GitHub, open **Settings → Pages**.
3. Select the correct branch and `/ (root)` folder (or your existing publishing configuration).
4. Wait for the Pages deployment to finish.
5. Open the live URL and test the mobile menu, timer, history, themes, and exports.

All internal asset links use relative paths (`./style.css`, `./app.js`, `./favicon.svg`) to work under the `/locked-in/` project path.

## Privacy and storage

The app stores session history, active session state, notes, and the selected theme in browser `localStorage`. It does not upload session information to a server. Data is specific to the browser/device and can be removed when browser data is cleared. Use **Backup JSON** to export a copy. Importing a backup merges records and retains topic/note fields when present. Data remains local to your browser; do not use the app on a shared device if your session notes are private.

## How the focus time ratio works

`focus time ratio = focused seconds / elapsed seconds × 100`

This is a time-allocation metric, not a scientific measurement of attention, output, or concentration. Break time and time spent in the session affect the ratio.

## Hardcore mode

In Hardcore mode, cumulative break time longer than 15 minutes ends the session as a failure. This is an intentionally strict, client-side rule. Like any browser-only timer, the app cannot guarantee continuity if the page is forcibly closed or the browser process is terminated.

## SEO notes

The page includes a descriptive title, meta description, canonical URL, Open Graph/Twitter metadata, JSON-LD structured data, a sitemap, and a robots file. These make the site easier for crawlers and social previews to understand but do not guarantee indexing or rankings. GitHub Pages is static hosting, so the initial HTML should keep meaningful content and metadata without requiring JavaScript to populate it.

## Contact

For feedback or bug reports, email [mo.omari862@gmail.com](mailto:mo.omari862@gmail.com).

## License
MIT
