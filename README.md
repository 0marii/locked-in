Here is a clean, recruiter-ready `README.md` tailored for your repository:

```markdown
# 🧠 FocusForge

> A brutalist focus manager and accountability engine that tracks deep work, enforces disciplined breaks, and mathematically judges your session efficiency.

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Vanilla JS](https://img.shields.io/badge/Vanilla-JavaScript-F7DF1E?logo=javascript&logoColor=black)
![Zero Dependencies](https://img.shields.io/badge/Dependencies-0-brightgreen)
![GitHub Pages](https://img.shields.io/badge/Deploy-GitHub_Pages-222222?logo=github)

Unlike standard countdown or Pomodoro timers that passively count down, **FocusForge** acts as an impartial arbiter for your study sessions. It tracks real elapsed clock time versus actual focused time, scales efficiency dynamically, ranks your performance across 5 tiers, and logs your session history locally.

---

## ⚡ Key Features

- **Singular Task Intent:** Prompts for your exact goal upfront and keeps it pinned on-screen to combat cognitive drift.
- **Dynamic Session Pacing:** Supports flexible `HH.MM` target durations or modular 45-minute deep-work cycles.
- **True Efficiency Math:** Calculates real-world focus efficiency:
  $$\text{Focus Score} = \left(\frac{\text{Actual Focused Time}}{\text{Total Elapsed Clock Time}}\right) \times 100$$
- **The Arbiter (Dynamic Star & Rank Tiers):** Performance is evaluated and categorized dynamically based on your focus percentage.
- **💀 Hardcore Mode:** An opt-in strictness toggle. If any single break exceeds 15 minutes, the engine immediately terminates the session with a disqualified score.
- **Synthesized Audio Alerts:** Utilizes the browser's native **Web Audio API** to generate multi-frequency chimes and buzzers without external audio files or network requests.
- **Keyboard-First Interface:** Global hotkeys allow starting, pausing, break tracking, and early stops without reaching for a mouse.
- **Persistent Analytics & CSV Export:** Stores complete session logs in `localStorage` and provides one-click CSV report exports.

---

## ⌨️ Controls & Shortcuts

| Key | Action | Description |
| :--- | :--- | :--- |
| <kbd>b</kbd> | **Toggle Tracked Break** | Pauses focus countdown, starts break stopwatch, and logs break duration. |
| <kbd>s</kbd> | **Stop Session Early** | Closes active timer and immediately generates an efficiency report. |

*(Keyboard hotkeys automatically ignore input when typing inside text boxes).*

---

## 🏆 Scoring & Rank Breakdown

| Efficiency Score | Rating | Rank Title | Verdict |
| :---: | :---: | :--- | :--- |
| **≥ 96%** | ⭐⭐⭐⭐⭐ | **👑 GOD TIER FOCUS** | Flawless discipline; negligible idle time. |
| **89% – 95%** | ⭐⭐⭐⭐ | **🔥 ELITE SCHOLAR** | Highly productive with structured, timely breathers. |
| **80% – 88%** | ⭐⭐⭐ | **⚖️ BALANCED WORKER** | Solid output, but prone to minor break creep. |
| **66% – 79%** | ⭐⭐ | **🥱 DISTRACTED WANDERER** | Excessive time away from target work. |
| **< 66%** | ⭐ | **🤡 PROCRASTINATOR** | Clock ran while checked out. |
| *Break > 15m* | 0 Stars | **💀 HARDCORE CASUALTY** | Automatic disqualification under Hardcore rules. |

---

## 🛠️ Architecture & Tech Stack

- **HTML5:** Semantic architecture with an accessible single-page multi-screen layout.
- **CSS3:** Custom properties (CSS variables), modern flexbox/grid architectures, and dark terminal aesthetic optimized for deep work.
- **Vanilla JavaScript (ES6+):** 
  - Zero external frameworks or runtime dependencies.
  - Native **Web Audio API** (`AudioContext`, `OscillatorNode`, `GainNode`) for procedural sound synthesis.
  - Native **Web Storage API** (`localStorage`) for persistence.
  - Blob-driven CSV generation for instant client-side data export.

---

## 🚀 Quickstart & Local Setup

No node runtime, package manager, or build steps required.

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/YOUR_USERNAME/focus-forge.git](https://github.com/YOUR_USERNAME/focus-forge.git)
   cd focus-forge

```

2. **Run locally:**
Open `index.html` in any modern web browser:
```bash
# On macOS
open index.html

# On Linux
xdg-open index.html

# On Windows
start index.html

```



---

## 🌐 Deploy to GitHub Pages

1. Push the code to your GitHub repository.
2. In your repository, go to **Settings** > **Pages**.
3. Under **Build and deployment > Branch**, select `main` (or `master`) and set the folder to `/(root)`.
4. Click **Save**. Your study manager will be live on the web in seconds.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

```

```
