<div align="center">

# 🧠 Locked-In

**A brutalist deep-work timer and session manager that grades your study efficiency.**

[Live Demo](https://0marii.github.io/locked-in/) • [Report Bug](https://github.com/0marii/locked-in/issues) • [Request Feature](https://github.com/0marii/locked-in/issues)

<br />

[![Vanilla JS](https://img.shields.io/badge/Vanilla-JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](#)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-0-brightgreen?style=flat-square)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
[![GitHub Pages](https://img.shields.io/badge/Deploy-GitHub_Pages-24292e?style=flat-square&logo=github)](https://0marii.github.io/locked-in/)

</div>

---

## ⚡ What Makes It Different?

Most timers passively count down without tracking actual cognitive output. **Locked-In** acts as an active accountability arbiter:

- **True Efficiency Tracking** — Tracks actual focused work against real-world clock time (accounting for pauses, interruptions, and break creep).
- **Dynamic Star Ratings** — Calculates a percentile efficiency score and rates your session from 1 to 5 stars.
- **💀 Hardcore Mode** — High-stakes discipline. Any single break exceeding 15 minutes instantly terminates and disqualifies the session.
- **Synthesized Audio** — Procedurally generates sound effects (success chimes and penalty buzzers) via the native browser Web Audio API—no external audio files or network requests required.
- **Persistent Analytics** — Automatically stores session metrics in `localStorage` and provides instant CSV export for performance logging.

---

## 📐 The Efficiency Formula

$$\text{Focus Score (\%)} = \left( \frac{\text{Actual Focused Time}}{\text{Total Elapsed Clock Time}} \right) \times 100$$

> **Example:** If you set a 2-hour target session and accumulate 30 minutes of total breaks, your session took 2.5 hours of clock time. Your Focus Score is **80%** (2h focused / 2.5h total elapsed).

---

## 🏆 Ranks & Rating System

| Efficiency | Rating | Rank | Verdict |
| :---: | :---: | :--- | :--- |
| **≥ 96%** | ⭐⭐⭐⭐⭐ | **👑 GOD TIER FOCUS** | Flawless execution. Minimal idle time. |
| **89% – 95%** | ⭐⭐⭐⭐ | **🔥 ELITE SCHOLAR** | Highly productive with structured breathers. |
| **80% – 88%** | ⭐⭐⭐ | **⚖️ BALANCED WORKER** | Solid output, but break creep was noticeable. |
| **66% – 79%** | ⭐⭐ | **🥱 DISTRACTED WANDERER** | Excessive time away from target work. |
| **< 66%** | ⭐ | **🤡 PROCRASTINATOR** | Clock ran while checked out. |
| *Break > 15m* | 0 Stars | **💀 HARDCORE CASUALTY** | Disqualified under Hardcore rules. |

---

## ⌨️ Controls & Hotkeys

| Key | Action | Description |
| :---: | :--- | :--- |
| <kbd>B</kbd> | **Tracked Break** | Pauses focus countdown, starts a live break stopwatch, and logs duration. |
| <kbd>S</kbd> | **Stop Session** | Terminates session early and instantly renders the evaluation report. |

---

## 🚀 Local Setup

No bundlers, package managers, or Node runtimes required.

```bash
# Clone the repository
git clone [https://github.com/0marii/locked-in.git](https://github.com/0marii/locked-in.git)

# Enter the project directory
cd locked-in

# Open directly in your browser
open index.html        # macOS
xdg-open index.html    # Linux
start index.html       # Windows
