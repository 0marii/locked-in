# Locked-In

A customizable, browser-based focus timer and deep-work tracker. Built with vanilla HTML, CSS, and JavaScript; no build step, backend, account, or third-party runtime dependency is required.

**Live site:** https://0marii.github.io/locked-in/  
**Repository:** https://github.com/0marii/locked-in

## Features

- Focus on a custom goal (for example, coding, studying, writing, reading, or your own text).
- Choose 30 minutes, 45 minutes, 1 hour, or a custom duration (hours and minutes).
- Standard and optional Hardcore session styles.
- Timestamp-based countdown calculations to reduce timer drift when the browser throttles interval callbacks.
- Break tracking with live expected-end times: scheduled end (no breaks) and real end (including breaks).
- Completion score requires at least 70% of planned focus time; break duration and excess break count reduce the score.
- Hardcore sessions that reach 15:00 or more cumulative break time fail and receive no score.
- Sticky notes during a running session: add multiple notes that do not overwrite each other.
- Notes tab groups notes by session, with edit and delete for each note; inbox notes work without an active session.
- Session report with focused time, elapsed time, break time, a completion score, editable topics, and notes.
- Notes and topics are preserved in local history, shown in reports and searchable in session history.
- Resume an active timer after minimizing, refreshing, or reopening the page.
- Floating mini-timer when you leave the timer screen for History, Insights, or Notes.
- Private Insights: completion stats, 7-day chart, 12-week heatmap, streaks, best time, top goal, and top tag.
- Daily and weekly completed-focus goals with progress on Setup and Insights.
- Recent goal chips to refill intent, duration, style, and tag.
- Optional session tags (Study / Code / Writing / Testing / custom) with History filter.
- Preferences: end notifications, 5-minute break reminder, completion chime (Off / Soft / Full), optional break suggestions with a chosen interval.
- Save a local weekly stats PNG from Insights (no upload).
- History tooltips explain column meaning, completion-score math, and why an outcome was assigned.
- Edit session notes or delete individual history records.
- Import a device backup and merge or replace records by session ID.
- Searchable local session history with date, tag, and sort filters.
- Download a spreadsheet, or export/import a full device backup (history, notes, to-dos, prefs, goals, themes).
- Installable PWA shell (`manifest.webmanifest` + network-first HTML service worker).
- Six themes: Dark, Light, Forest, Violet, Pink, and Blue.
- Responsive layout with a mobile hamburger navigation menu.
- Keyboard shortcuts: `B` toggles a break and `S` ends a session while a session is active (when not typing in a field).
- SEO metadata, canonical URL, Open Graph metadata, JSON-LD, `robots.txt`, `sitemap.xml`, and a custom `404.html`.
- Respects reduced-motion preferences and includes basic keyboard accessibility support.

## Project files

```text
locked-in/
├── index.html
├── style.css              # CSS entry (@import css/*)
├── app.js                 # ES module entry (type="module")
├── css/
│   ├── tokens.css
│   ├── base.css
│   ├── layout.css
│   ├── components.css
│   ├── setup.css
│   ├── timer.css
│   ├── report.css
│   ├── history.css
│   ├── insights.css
│   └── notes.css
├── js/
│   ├── constants.js
│   ├── runtime.js
│   ├── storage.js
│   ├── toast.js
│   ├── utils.js
│   ├── sync.js
│   ├── theme-nav.js
│   ├── setup.js
│   ├── session.js
│   ├── history.js
│   ├── insights.js
│   ├── notes.js
│   └── bind.js
├── assets/
│   ├── favicon.svg
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── icon-512-maskable.png
│   ├── og-image.png
│   └── og-image.svg
├── package.json
├── manifest.webmanifest
├── sw.js
├── 404.html
├── robots.txt
├── sitemap.xml
├── tests/
│   └── static-contract.test.cjs
├── LICENSE
└── README.md
```

App logic and styles are split into native modules under `js/` and `css/` (no bundler). Icons and images live in `assets/`. GitHub Pages serves them over HTTPS with relative paths.

## Run tests

Node-only contract and smoke tests (no browser automation):

```bash
npm run check
```

Useful pieces:

```bash
npm run css
npm run assets:verify
npm run assets:bump
node --test tests/*.test.cjs
node --check app.js
node --check js/*.js
```

These are source-level checks, not a substitute for manual browser and Lighthouse testing.

## Run locally

Open `index.html` directly, or run a local static server:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploy

Release checklist before pushing to GitHub Pages:

1. Edit `css/*` / `js/*` as needed.
2. Run `npm run assets:bump` (or `npm run css` if the asset version is unchanged).
3. Run `npm run predeploy` (syntax + asset verify + contract/smoke tests).
4. Commit and push to the publishing branch.
5. Hard-refresh once (or wait for the new service-worker `CACHE`) so clients drop the old precache.

After any CSS edit, always rebundle before push — `style.css` and `css/screens.css` are generated.

## Deploy to GitHub Pages

This project is designed for a project site hosted at `https://0marii.github.io/locked-in/`.

1. Follow the **Deploy** checklist above.
2. In GitHub, open **Settings → Pages**.
3. Select the correct branch and `/ (root)` folder (or your existing publishing configuration).
4. Wait for the Pages deployment to finish.
5. Open the live URL and smoke-test the mobile menu, timer, history, sticky notes, insights, themes, and exports.

All internal asset links use relative paths (`./style.css`, `./app.js`, `./assets/favicon.svg`) to work under the `/locked-in/` project path.

## Privacy and storage

The app stores session history, active session state, notes, preferences, focus goals, recent goals, customize look, named themes, and the selected theme in browser `localStorage`. It does not upload session information to a server. Data is specific to the browser/device and can be removed when browser data is cleared. Use **Export to other device** (History menu) to download a full copy. **Import from other device** can replace or merge sessions and applies themes/settings from the file. Live in-progress timers are not included. Data remains local to your browser; do not use the app on a shared device if your session notes are private. If storage writes fail, the UI keeps drafts dirty and never claims “Saved.” Browser notifications are opt-in and only fire when permission is granted.

## How the completion score works

Completion score is based on **focused seconds / planned seconds**, not elapsed clock time.

1. Reach at least **70%** of planned focus time and avoid a Hardcore failure.
2. Start from that completion percentage.
3. Subtract a break-duration penalty and an excess-break-count penalty (more than two breaks).

This is a time-allocation metric, not a scientific measurement of attention, output, or concentration. Incomplete, ended-early, and Hardcore-failed attempts are kept in History but are excluded from Insights completed totals.

## Hardcore mode

In Hardcore mode, cumulative break time of **15:00 or more** ends the session as a failure. This is an intentionally strict, client-side rule. Like any browser-only timer, the app cannot guarantee continuity if the page is forcibly closed or the browser process is terminated.

## SEO notes

The page includes a descriptive title, meta description, canonical URL, Open Graph/Twitter metadata (PNG card image), JSON-LD structured data, a sitemap, and a robots file. These make the site easier for crawlers and social previews to understand but do not guarantee indexing or rankings. GitHub Pages is static hosting, so the initial HTML should keep meaningful content and metadata without requiring JavaScript to populate it.

## Contact

For feedback or bug reports, email [mo.omari862@gmail.com](mailto:mo.omari862@gmail.com).

## License
MIT
