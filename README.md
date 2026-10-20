<div align="center">

# 🧠 Locked-In

**A local-first deep-work timer and session manager that measures focus consistency.**

[Live Demo](https://0marii.github.io/locked-in/) • [Report a Bug](https://github.com/0marii/locked-in/issues) • [Request a Feature](https://github.com/0marii/locked-in/issues)

<br />

[![Vanilla JS](https://img.shields.io/badge/Vanilla-JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](#)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-0-brightgreen?style=flat-square)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
[![GitHub Pages](https://img.shields.io/badge/Deploy-GitHub_Pages-24292e?style=flat-square&logo=github)](https://0marii.github.io/locked-in/)

</div>

---

## ⚡ What Is Locked-In?

Locked-In is a browser-based deep-work timer designed to help you set one clear goal, protect a block of time, and review how consistently you used it. It is built with **HTML, CSS, and vanilla JavaScript**. It requires no build step, package manager, backend, account, or third-party JavaScript dependency.

### Features

- **Focused sessions** — name your intention, choose a session style, and select a preset or custom duration from 1 minute to 12 hours.
- **Tracked breaks** — pause the focus countdown while a live break timer records time away, then resume without losing the session.
- **Hardcore Mode** — a single break that reaches 15 minutes ends the session and records a disqualified result.
- **Focus efficiency score** — compare focused time with total elapsed clock time, including breaks.
- **Session report** — review your score, rating, planned duration, focused duration, elapsed time, break count, and break log.
- **Session reflection** — optionally write a short reflection after a session.
- **Weekly overview** — view weekly focused time, completed session count, average efficiency, and a seven-day focus chart.
- **Session history** — search past goals and review saved session metrics.
- **CSV export** — export session records for spreadsheets or personal analysis.
- **JSON backup and restore** — back up your history and restore it later.
- **Dark and light themes** — switch the interface theme.
- **Refresh recovery** — an in-progress session is saved locally and can resume after a page refresh.
- **Keyboard shortcuts** — press `B` to toggle a tracked break and `S` to end a session early while the timer is active.
- **Legacy history migration** — the app attempts to import history saved by the older `focusforge_history_v1` version.
- **Responsive and reduced-motion-aware UI** — designed for desktop and mobile, with reduced animation when requested by the operating system.

> **Privacy note:** session data is stored in the current browser's `localStorage`. It is not automatically synced to another browser or device. Clearing browser storage can delete the history, so export a backup if you want to keep it.

---

## 📐 The Efficiency Formula

```text
Focus Efficiency (%) = (Focused Time / Total Elapsed Clock Time) × 100
```

**Example:** You focus for 2 hours and take 30 minutes of breaks. The total elapsed time is 2.5 hours, so your efficiency is 80%:

```text
(120 minutes / 150 minutes) × 100 = 80%
```

The app caps credited focus time at the planned duration. Efficiency describes how much elapsed session time was spent focused; it does **not** measure comprehension, output quality, or learning outcomes.

---

## 🏆 Ratings

| Efficiency | Rating | Label | Interpretation |
| :---: | :---: | :--- | :--- |
| **≥ 96%** | ⭐⭐⭐⭐⭐ | **Highly consistent** | Very little time away from the session. |
| **89%–95.9%** | ⭐⭐⭐⭐ | **Strong focus** | A steady session with limited break time. |
| **80%–88.9%** | ⭐⭐⭐ | **Balanced session** | A balanced session; review breaks if useful. |
| **66%–79.9%** | ⭐⭐ | **Room to improve** | Consider shorter blocks or more specific goals. |
| **< 66%** | ⭐ | **A session to learn from** | Try a smaller target or a different session length. |
| **Hardcore break reaches 15 minutes** | ☆☆☆☆☆ | **Hardcore limit reached** | The session ends and is recorded as a hardcore failure. |
| **Stopped early** | ☆☆☆☆☆ | **Session ended early** | Focused time is still recorded, but the session is marked as stopped early. |

The rating thresholds are product rules, not scientific measures of productivity or ability.

---

## ⌨️ Controls & Hotkeys

| Key | Action | Description |
| :---: | :--- | :--- |
| <kbd>B</kbd> | **Toggle break** | Starts a tracked break or resumes focus. |
| <kbd>S</kbd> | **End session** | Asks for confirmation and ends the active session early. |

The shortcuts apply while a session is active. Avoid relying on them while typing in an input or text field.

---

## 🗂️ Project Structure

```text
locked-in/
├── index.html       # App structure, screens, forms, and accessible labels
├── style.css        # Responsive layout, themes, components, and animations
├── app.js           # Timer logic, scoring, persistence, reports, and exports
├── README.md        # Project documentation
└── LICENSE          # MIT license (if included in the repository)
```

There is no build pipeline. Keep `index.html`, `style.css`, and `app.js` in the same directory unless you update the stylesheet and script paths in the HTML.

---

## 🚀 Run Locally

### Option 1: Open the HTML file

1. Download or clone the repository.
2. Open `index.html` in a modern browser.

### Option 2: Clone the repository

```bash
git clone https://github.com/0marii/locked-in.git
cd locked-in
```

Then open `index.html` in your browser. On macOS you can run `open index.html`; on Linux, `xdg-open index.html`; on Windows, `start index.html`.

No Node.js, npm, bundler, or development server is required for the app's basic use.

---

## 🌐 Deploy to GitHub Pages

1. Commit `index.html`, `style.css`, `app.js`, and `README.md` to the repository.
2. Open the repository's **Settings → Pages**.
3. Choose the branch and folder containing `index.html` (commonly `main` and `/ (root)`).
4. Save and wait for GitHub Pages to publish the site.
5. Open the published URL and test a short session, a tracked break, a page refresh, CSV export, and JSON backup/restore.

Because this is a static site, it does not need a server-side runtime. Use relative paths for local assets so the project works under the `/locked-in/` GitHub Pages subpath.

---

## 💾 Data, Backups & Troubleshooting

- **Where is history stored?** In this browser's `localStorage` for this website origin.
- **Does history sync across devices?** No. Export a JSON backup and restore it in the other browser if needed.
- **What happens if I refresh during a session?** The active session is persisted and should be recovered when the page is reopened in the same browser.
- **Why does a timer use real timestamps?** The remaining time is derived from timestamps rather than assuming browser intervals always run on schedule, which helps when a tab is backgrounded.
- **What if saving fails?** The app shows a warning where possible. Export your history and free browser storage space before trying again.
- **What should I test before a release?** Session completion, ending early, break/resume, Hardcore Mode at the 15-minute threshold, refresh recovery, old-history migration, CSV export, JSON restore, and mobile layouts.

---

## 🧰 Technology

- HTML5
- CSS3
- Vanilla JavaScript
- Browser `localStorage` for local persistence
- Browser timestamps for timer calculations
- Native file APIs for CSV and JSON export/import
- GitHub Pages for static hosting

No analytics SDK, external JavaScript library, API server, or account system is required by the app.

---

## 🤝 Contributing

Issues and feature requests are welcome through the repository's [Issues page](https://github.com/0marii/locked-in/issues). When reporting a bug, include the browser and operating system, the steps to reproduce it, and what you expected to happen. Do not attach private session data unless you intend to share it.

## 📄 License

This project links to the repository's `LICENSE` file. Check that file for the exact license terms before redistributing the project.

---

<div align="center">

**Make time count. One intention at a time.**

</div>
