/* Locked-In: vanilla JavaScript, compatible with static GitHub Pages hosting. */
(() => {
  "use strict";

  const HISTORY_KEY = "locked_in_history_v2";
  const LEGACY_HISTORY_KEYS = ["focusforge_history_v1", "locked-in-history"];
  const THEME_KEY = "locked_in_theme";
  const HARDCORE_BREAK_LIMIT_SECONDS = 15 * 60;
  const MAX_HISTORY = 1000;

  const $ = (id) => document.getElementById(id);
  const dom = {
    screens: [...document.querySelectorAll(".screen")],
    navLinks: [...document.querySelectorAll("[data-screen]")],
    nav: $("site-nav"), menuToggle: $("menu-toggle"), themeSelect: $("theme-select"),
    setupForm: $("setup-form"), taskIntent: $("task-intent"), durationPreset: $("duration-preset"),
    customDuration: $("custom-duration"), customHours: $("custom-hours"), customMinutes: $("custom-minutes"),
    sessionStyle: $("session-style"), setupSessionCount: $("setup-session-count"), setupTotalFocus: $("setup-total-focus"),
    timerBackBtn: $("timer-back-btn"), statusBadge: $("status-badge"), timerHeading: $("timer-heading"),
    timerSubtitle: $("timer-subtitle"), timeDisplay: $("time-display"), timerProgress: $("timer-progress"),
    timerProgressBar: $("timer-progress-bar"), plannedTime: $("planned-time"), breakTime: $("break-time"),
    elapsedTime: $("elapsed-time"), timerStatusMessage: $("timer-status-message"), breakBtn: $("break-btn"),
    stopBtn: $("stop-btn"), reportEyebrow: $("report-eyebrow"), reportSymbol: $("report-symbol"),
    reportTitle: $("report-title"), reportMessage: $("report-message"), efficiencyPercent: $("efficiency-percent"),
    rankDisplay: $("rank-display"), efficiencyBar: $("efficiency-bar"), repIntent: $("rep-intent"),
    repFocus: $("rep-focus"), repClock: $("rep-clock"), repBreaks: $("rep-breaks"),
    breakBreakdownWrapper: $("break-breakdown-wrapper"), breakBreakdownList: $("break-breakdown-list"),
    newSessionBtn: $("new-session-btn"), reportHistoryBtn: $("report-history-btn"),
    historySessionCount: $("history-session-count"), historyTotalFocus: $("history-total-focus"),
    historyAverage: $("history-average"), historySearch: $("history-search"), historyTableBody: $("history-table-body"),
    historyEmpty: $("history-empty"), historyStartBtn: $("history-start-btn"), exportCsvBtn: $("export-csv-btn"),
    exportJsonBtn: $("export-json-btn"), clearHistoryBtn: $("clear-history-btn"), currentYear: $("current-year"),
    toast: $("toast"), confirmDialog: $("confirm-dialog"), confirmTitle: $("confirm-title"),
    confirmMessage: $("confirm-message"), confirmAccept: $("confirm-accept")
  };

  const state = {
    activeScreen: "setup-screen",
    session: null,
    intervalId: null,
    history: [],
    toastTimer: null,
    confirmAction: null
  };

  function safeRead(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn(`Locked-In could not read ${key}.`, error);
      return fallback;
    }
  }

  function safeWrite(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Locked-In could not save ${key}.`, error);
      showToast("Browser storage is unavailable or full. Export a backup and check your browser settings.");
      return false;
    }
  }

  function loadHistory() {
    let stored = safeRead(HISTORY_KEY, null);
    if (!Array.isArray(stored)) {
      for (const key of LEGACY_HISTORY_KEYS) {
        const legacy = safeRead(key, null);
        if (Array.isArray(legacy)) {
          stored = legacy.map(normalizeLegacyRecord).filter(Boolean);
          safeWrite(HISTORY_KEY, stored);
          break;
        }
      }
    }
    state.history = (Array.isArray(stored) ? stored : [])
      .map(normalizeLegacyRecord).filter(Boolean)
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
      .slice(0, MAX_HISTORY);
  }

  function normalizeLegacyRecord(record) {
    if (!record || typeof record !== "object") return null;
    const intent = String(record.intent ?? record.task ?? record.goal ?? "Untitled session").slice(0, 120);
    const focusSeconds = Math.max(0, Math.floor(Number(record.focusSeconds ?? record.focusedSeconds ?? record.focusTime ?? 0) || 0));
    const elapsedSeconds = Math.max(focusSeconds, Math.floor(Number(record.elapsedSeconds ?? record.clockSeconds ?? record.realClockSeconds ?? focusSeconds) || 0));
    const breaks = Array.isArray(record.breaks) ? record.breaks.map((b) => ({
      durationSeconds: Math.max(0, Math.floor(Number(b.durationSeconds ?? b.duration ?? 0) || 0)),
      startedAt: b.startedAt || null,
      endedAt: b.endedAt || null
    })) : [];
    const completedAt = record.completedAt || record.date || record.timestamp || new Date().toISOString();
    const targetSeconds = Math.max(60, Math.floor(Number(record.targetSeconds ?? record.plannedSeconds ?? focusSeconds) || focusSeconds || 60));
    return {
      id: String(record.id || `${Date.parse(completedAt) || Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      intent, targetSeconds, focusSeconds, elapsedSeconds,
      breakSeconds: Math.max(0, Math.floor(Number(record.breakSeconds) || breaks.reduce((sum, b) => sum + b.durationSeconds, 0))),
      breaks, completedAt: Number.isFinite(Date.parse(completedAt)) ? new Date(completedAt).toISOString() : new Date().toISOString(),
      hardcore: Boolean(record.hardcore ?? record.isHardcore),
      hardcoreFailed: Boolean(record.hardcoreFailed ?? record.failed),
      outcome: record.outcome || (record.hardcoreFailed || record.failed ? "failed" : (record.completed ? "completed" : "ended")),
      reason: String(record.reason || "")
    };
  }

  function saveHistory() {
    safeWrite(HISTORY_KEY, state.history.slice(0, MAX_HISTORY));
  }

  function showToast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add("is-visible");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => dom.toast.classList.remove("is-visible"), 3500);
  }

  function showScreen(screenId) {
    if (!dom.screens.some((screen) => screen.id === screenId)) return;
    state.activeScreen = screenId;
    dom.screens.forEach((screen) => screen.classList.toggle("is-active", screen.id === screenId));
    dom.navLinks.forEach((link) => link.classList.toggle("is-active", link.dataset.screen === screenId));
    closeMenu();
    if (screenId === "history-screen") renderHistory();
    if (screenId === "setup-screen") renderSetupStats();
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  function closeMenu() {
    dom.nav.classList.remove("is-open");
    dom.menuToggle.setAttribute("aria-expanded", "false");
    dom.menuToggle.setAttribute("aria-label", "Open navigation menu");
  }

  function toggleMenu() {
    const isOpen = dom.nav.classList.toggle("is-open");
    dom.menuToggle.setAttribute("aria-expanded", String(isOpen));
    dom.menuToggle.setAttribute("aria-label", isOpen ? "Close navigation menu" : "Open navigation menu");
  }

  function setTheme(theme, persist = true) {
    const validThemes = ["dark", "light", "forest", "violet", "pink"];
    const chosen = validThemes.includes(theme) ? theme : "dark";
    document.documentElement.dataset.theme = chosen;
    dom.themeSelect.value = chosen;
    if (persist) {
      try { localStorage.setItem(THEME_KEY, chosen); } catch (_) { /* Theme still works for this page view. */ }
    }
    const themeColor = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor || "#101310");
  }

  function parseDuration() {
    if (dom.durationPreset.value !== "custom") return Number(dom.durationPreset.value) * 60;
    const hoursRaw = dom.customHours.value.trim();
    const minutesRaw = dom.customMinutes.value.trim();
    const hours = hoursRaw === "" ? 0 : Number(hoursRaw);
    const minutes = minutesRaw === "" ? 0 : Number(minutesRaw);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      showToast("Enter whole hours from 0–23 and minutes from 0–59.");
      return null;
    }
    const seconds = (hours * 60 + minutes) * 60;
    if (seconds < 60) {
      showToast("Choose a focus duration of at least one minute.");
      return null;
    }
    return seconds;
  }

  function formatClock(totalSeconds, includeHours = false) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (includeHours || h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function formatDuration(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0 && sec > 0) return `${m}m ${sec}s`;
    if (m > 0) return `${m}m`;
    return `${sec}s`;
  }

  function formatDate(dateString) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "Unknown date";
    return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function startSession(event) {
    event?.preventDefault();
    if (state.session) {
      showToast("Finish your current session before starting another.");
      return;
    }
    const intent = dom.taskIntent.value.trim();
    if (!intent) {
      dom.taskIntent.focus();
      showToast("Add a focus goal first, such as coding or reading.");
      return;
    }
    const targetSeconds = parseDuration();
    if (!targetSeconds) return;

    const now = Date.now();
    state.session = {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      intent, targetSeconds, remainingSeconds: targetSeconds, hardcore: dom.sessionStyle.value === "hardcore",
      startedAt: now, activeWorkStartedAt: now, accumulatedFocusSeconds: 0,
      currentBreakStartedAt: null, breaks: [], breakSeconds: 0, outcome: null, reason: ""
    };
    showScreen("timer-screen");
    renderTimer();
    state.intervalId = window.setInterval(tick, 250);
  }

  function activeFocusSeconds(session, now = Date.now()) {
    return session.accumulatedFocusSeconds + (!session.currentBreakStartedAt && session.activeWorkStartedAt ? Math.max(0, (now - session.activeWorkStartedAt) / 1000) : 0);
  }

  function elapsedSeconds(session, now = Date.now()) {
    return Math.max(0, (now - session.startedAt) / 1000);
  }

  function currentBreakSeconds(session, now = Date.now()) {
    return session.breakSeconds + (session.currentBreakStartedAt ? Math.max(0, (now - session.currentBreakStartedAt) / 1000) : 0);
  }

  function tick() {
    const session = state.session;
    if (!session) return;
    const now = Date.now();

    if (session.currentBreakStartedAt && session.hardcore && (now - session.currentBreakStartedAt) / 1000 > HARDCORE_BREAK_LIMIT_SECONDS) {
      finishSession("failed", "A single break exceeded 15 minutes.");
      return;
    }

    if (!session.currentBreakStartedAt) {
      session.remainingSeconds = Math.max(0, session.targetSeconds - activeFocusSeconds(session, now));
      if (session.remainingSeconds <= 0) {
        finishSession("completed", "Target duration reached.");
        return;
      }
    }
    renderTimer(now);
  }

  function toggleBreak() {
    const session = state.session;
    if (!session) return;
    const now = Date.now();
    if (!session.currentBreakStartedAt) {
      session.accumulatedFocusSeconds += Math.max(0, (now - session.activeWorkStartedAt) / 1000);
      session.activeWorkStartedAt = null;
      session.currentBreakStartedAt = now;
      dom.timerStatusMessage.textContent = session.hardcore ? "Break started. In Hardcore mode, keep it under 15 minutes." : "Take a breath. Resume when you're ready.";
      showToast("Break started.");
    } else {
      const durationSeconds = Math.max(0, (now - session.currentBreakStartedAt) / 1000);
      session.breakSeconds += durationSeconds;
      session.breaks.push({ startedAt: new Date(session.currentBreakStartedAt).toISOString(), endedAt: new Date(now).toISOString(), durationSeconds: Math.floor(durationSeconds) });
      session.currentBreakStartedAt = null;
      session.activeWorkStartedAt = now;
      dom.timerStatusMessage.textContent = "Back to it. Pick up where you left off.";
      showToast("Break ended. Focus resumed.");
    }
    renderTimer(now);
  }

  function askConfirm(title, message, action, acceptText = "Confirm") {
    dom.confirmTitle.textContent = title;
    dom.confirmMessage.textContent = message;
    dom.confirmAccept.textContent = acceptText;
    state.confirmAction = action;
    if (typeof dom.confirmDialog.showModal === "function") dom.confirmDialog.showModal();
    else if (window.confirm(message)) action();
  }

  function stopSession() {
    if (!state.session) return;
    askConfirm("End this session?", "Your time so far will be saved to your session history.", () => finishSession("ended", "Ended early."), "End session");
  }

  function finishSession(outcome, reason) {
    const session = state.session;
    if (!session) return;
    const now = Date.now();
    if (session.currentBreakStartedAt) {
      const durationSeconds = Math.max(0, (now - session.currentBreakStartedAt) / 1000);
      session.breakSeconds += durationSeconds;
      session.breaks.push({ startedAt: new Date(session.currentBreakStartedAt).toISOString(), endedAt: new Date(now).toISOString(), durationSeconds: Math.floor(durationSeconds) });
      session.currentBreakStartedAt = null;
    }
    const focusSeconds = Math.min(session.targetSeconds, Math.max(0, Math.floor(activeFocusSeconds(session, now))));
    const elapsed = Math.max(0, Math.floor(elapsedSeconds(session, now)));
    const breakSeconds = Math.max(0, Math.floor(session.breakSeconds));
    const record = {
      id: session.id, intent: session.intent, targetSeconds: session.targetSeconds,
      focusSeconds, elapsedSeconds: Math.max(focusSeconds + breakSeconds, elapsed),
      breakSeconds, breaks: session.breaks, completedAt: new Date(now).toISOString(),
      hardcore: session.hardcore, hardcoreFailed: outcome === "failed", outcome, reason
    };
    clearInterval(state.intervalId);
    state.intervalId = null;
    state.session = null;
    state.history.unshift(record);
    state.history = state.history.slice(0, MAX_HISTORY);
    saveHistory();
    renderReport(record);
    renderSetupStats();
    showScreen("report-screen");
    if (outcome === "completed") playChime();
  }

  function renderTimer(now = Date.now()) {
    const session = state.session;
    if (!session) return;
    const onBreak = Boolean(session.currentBreakStartedAt);
    const focus = activeFocusSeconds(session, now);
    const elapsed = elapsedSeconds(session, now);
    const breaks = currentBreakSeconds(session, now);
    const remaining = onBreak ? session.remainingSeconds : Math.max(0, session.targetSeconds - focus);
    dom.timerHeading.textContent = session.intent;
    dom.timerSubtitle.textContent = session.hardcore ? "Hardcore mode is active." : "Stay with one thing.";
    dom.timeDisplay.textContent = formatClock(remaining, session.targetSeconds >= 3600);
    dom.statusBadge.classList.toggle("is-break", onBreak);
    dom.statusBadge.innerHTML = `<span class="status-dot"></span> ${onBreak ? "ON BREAK" : "FOCUSING"}`;
    dom.breakBtn.innerHTML = onBreak ? '↻ Resume focus <kbd>B</kbd>' : '☕ Take a break <kbd>B</kbd>';
    dom.plannedTime.textContent = formatDuration(session.targetSeconds);
    dom.breakTime.textContent = formatClock(breaks);
    dom.elapsedTime.textContent = formatClock(elapsed);
    dom.timerStatusMessage.textContent = onBreak
      ? (session.hardcore ? `Hardcore break: ${formatClock((now - session.currentBreakStartedAt) / 1000)} / 15:00` : "Take a breath. Resume when you're ready.")
      : dom.timerStatusMessage.textContent;
    const percent = Math.min(100, Math.max(0, focus / session.targetSeconds * 100));
    dom.timerProgressBar.style.width = `${percent}%`;
    dom.timerProgress.setAttribute("aria-valuenow", String(Math.round(percent)));
    document.title = `${formatClock(remaining)} · Locked-In`;
  }

  function renderReport(record) {
    const ratio = record.elapsedSeconds > 0 ? Math.round(record.focusSeconds / record.elapsedSeconds * 100) : 0;
    const complete = record.outcome === "completed";
    const failed = record.outcome === "failed";
    dom.reportEyebrow.textContent = failed ? "HARDCORE SESSION FAILED" : complete ? "SESSION COMPLETE" : "SESSION ENDED";
    dom.reportSymbol.textContent = failed ? "!" : complete ? "✓" : "↗";
    dom.reportTitle.textContent = failed ? "Reset and try again." : complete ? "You showed up." : "Every minute counts.";
    dom.reportMessage.textContent = failed ? "One session doesn't define you. Start again when you're ready." : complete ? "You reached your planned focus duration. Nice work." : "You ended this session early. Your time has still been recorded.";
    dom.efficiencyPercent.textContent = `${ratio}%`;
    dom.efficiencyBar.style.width = `${ratio}%`;
    dom.rankDisplay.textContent = ratio >= 90 ? "Very focused time" : ratio >= 70 ? "Solid effort" : ratio >= 40 ? "Room for breaks" : "A work in progress";
    dom.repIntent.textContent = record.intent;
    dom.repFocus.textContent = formatClock(record.focusSeconds, record.focusSeconds >= 3600);
    dom.repClock.textContent = formatClock(record.elapsedSeconds, record.elapsedSeconds >= 3600);
    dom.repBreaks.textContent = `${record.breaks.length} · ${formatClock(record.breakSeconds)}`;
    dom.breakBreakdownList.replaceChildren();
    record.breaks.forEach((item, index) => {
      const li = document.createElement("li");
      li.textContent = `Break ${index + 1}: ${formatClock(item.durationSeconds)}${item.durationSeconds > HARDCORE_BREAK_LIMIT_SECONDS ? " · over 15 minutes" : ""}`;
      dom.breakBreakdownList.append(li);
    });
    dom.breakBreakdownWrapper.classList.toggle("is-hidden", record.breaks.length === 0);
    document.title = "Session report · Locked-In";
  }

  function renderSetupStats() {
    dom.setupSessionCount.textContent = String(state.history.length);
    const focus = state.history.reduce((sum, item) => sum + item.focusSeconds, 0);
    dom.setupTotalFocus.textContent = formatDuration(focus);
  }

  function renderHistory() {
    const query = dom.historySearch.value.trim().toLocaleLowerCase();
    const rows = state.history.filter((item) => item.intent.toLocaleLowerCase().includes(query));
    dom.historyTableBody.replaceChildren();
    rows.forEach((item) => {
      const tr = document.createElement("tr");
      const ratio = item.elapsedSeconds ? Math.round(item.focusSeconds / item.elapsedSeconds * 100) : 0;
      const outcomeLabel = item.outcome === "completed" ? "Completed" : item.outcome === "failed" ? "Hardcore failed" : "Ended early";
      const cells = [
        formatDate(item.completedAt), item.intent, formatClock(item.focusSeconds, item.focusSeconds >= 3600),
        formatClock(item.elapsedSeconds, item.elapsedSeconds >= 3600), `${ratio}%`
      ];
      cells.forEach((value) => {
        const td = document.createElement("td");
        td.textContent = value;
        tr.append(td);
      });
      const outcomeCell = document.createElement("td");
      const pill = document.createElement("span");
      pill.className = `outcome-pill ${item.outcome === "completed" ? "success" : item.outcome === "failed" ? "failed" : ""}`;
      pill.textContent = outcomeLabel;
      outcomeCell.append(pill);
      tr.append(outcomeCell);
      dom.historyTableBody.append(tr);
    });
    const totalFocus = state.history.reduce((sum, item) => sum + item.focusSeconds, 0);
    const avg = state.history.length ? Math.round(state.history.reduce((sum, item) => sum + (item.elapsedSeconds ? item.focusSeconds / item.elapsedSeconds * 100 : 0), 0) / state.history.length) : null;
    dom.historySessionCount.textContent = String(state.history.length);
    dom.historyTotalFocus.textContent = formatDuration(totalFocus);
    dom.historyAverage.textContent = avg === null ? "—" : `${avg}%`;
    dom.historyEmpty.classList.toggle("is-visible", rows.length === 0);
    if (state.history.length > 0 && rows.length === 0) {
      dom.historyEmpty.querySelector("h2").textContent = "No matching sessions";
      dom.historyEmpty.querySelector("p").textContent = "Try a different search term.";
      dom.historyStartBtn.classList.add("is-hidden");
    } else {
      dom.historyEmpty.querySelector("h2").textContent = "No sessions yet";
      dom.historyEmpty.querySelector("p").textContent = "Your completed sessions will appear here. Start with one small goal.";
      dom.historyStartBtn.classList.remove("is-hidden");
    }
    renderSetupStats();
  }

  function csvEscape(value) {
    let text = String(value ?? "");
    // Prevent spreadsheet formula injection in exported user-controlled values.
    if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCsv() {
    if (!state.history.length) {
      showToast("There are no sessions to export yet.");
      return;
    }
    const header = ["Completed At", "Goal", "Planned Seconds", "Focused Seconds", "Elapsed Seconds", "Break Seconds", "Break Count", "Focus Time Ratio (%)", "Session Style", "Outcome", "Reason"];
    const rows = state.history.map((item) => [
      item.completedAt, item.intent, item.targetSeconds, item.focusSeconds, item.elapsedSeconds,
      item.breakSeconds, item.breaks.length, item.elapsedSeconds ? Math.round(item.focusSeconds / item.elapsedSeconds * 100) : 0,
      item.hardcore ? "Hardcore" : "Standard", item.outcome, item.reason
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
    downloadFile("locked-in-sessions.csv", "\uFEFF" + csv, "text/csv;charset=utf-8");
    showToast("CSV export prepared.");
  }

  function exportJson() {
    const backup = { schemaVersion: 1, exportedAt: new Date().toISOString(), app: "Locked-In", sessions: state.history };
    downloadFile("locked-in-backup.json", JSON.stringify(backup, null, 2), "application/json");
    showToast("JSON backup prepared.");
  }

  function clearHistory() {
    if (!state.history.length) {
      showToast("Your history is already empty.");
      return;
    }
    askConfirm("Clear all history?", "This permanently removes saved sessions from this browser. Export a backup first if you want to keep them.", () => {
      state.history = [];
      saveHistory();
      renderHistory();
      showToast("Session history cleared.");
    }, "Clear history");
  }

  function playChime() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const now = context.currentTime;
      [523.25, 659.25, 783.99].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, now + index * 0.12);
        gain.gain.setValueAtTime(0.0001, now + index * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.12, now + index * 0.12 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.12 + 0.25);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now + index * 0.12);
        oscillator.stop(now + index * 0.12 + 0.27);
      });
      window.setTimeout(() => context.close().catch(() => {}), 1200);
    } catch (error) {
      console.info("Audio notification is unavailable in this browser.", error);
    }
  }

  function handleKeyboard(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    const tag = target?.tagName?.toLowerCase();
    if (["input", "textarea", "select", "button"].includes(tag) || target?.isContentEditable) return;
    if (event.key.toLowerCase() === "b" && state.activeScreen === "timer-screen") {
      event.preventDefault();
      toggleBreak();
    }
    if (event.key.toLowerCase() === "s" && state.activeScreen === "timer-screen") {
      event.preventDefault();
      stopSession();
    }
    if (event.key === "Escape") closeMenu();
  }

  function bindEvents() {
    dom.menuToggle.addEventListener("click", toggleMenu);
    dom.navLinks.forEach((button) => button.addEventListener("click", () => showScreen(button.dataset.screen)));
    dom.nav.querySelector('a[href="#about"]').addEventListener("click", () => {
      closeMenu();
      setTimeout(() => document.getElementById("about").scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    });
    dom.themeSelect.addEventListener("change", () => setTheme(dom.themeSelect.value));
    dom.durationPreset.addEventListener("change", () => {
      const custom = dom.durationPreset.value === "custom";
      dom.customDuration.classList.toggle("is-hidden", !custom);
      dom.customDuration.setAttribute("aria-hidden", String(!custom));
      if (custom) dom.customHours.focus();
    });
    dom.setupForm.addEventListener("submit", startSession);
    dom.timerBackBtn.addEventListener("click", () => {
      askConfirm("Leave the timer?", "Your active session will be ended and saved to history.", () => finishSession("ended", "Returned to setup."), "End and return");
    });
    dom.breakBtn.addEventListener("click", toggleBreak);
    dom.stopBtn.addEventListener("click", stopSession);
    dom.newSessionBtn.addEventListener("click", () => {
      dom.taskIntent.value = "";
      showScreen("setup-screen");
      dom.taskIntent.focus();
    });
    dom.reportHistoryBtn.addEventListener("click", () => showScreen("history-screen"));
    dom.historyStartBtn.addEventListener("click", () => showScreen("setup-screen"));
    dom.historySearch.addEventListener("input", renderHistory);
    dom.exportCsvBtn.addEventListener("click", exportCsv);
    dom.exportJsonBtn.addEventListener("click", exportJson);
    dom.clearHistoryBtn.addEventListener("click", clearHistory);
    dom.confirmDialog.addEventListener("close", () => {
      const action = state.confirmAction;
      state.confirmAction = null;
      if (dom.confirmDialog.returnValue === "confirm" && action) action();
    });
    document.addEventListener("keydown", handleKeyboard);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && state.session) tick();
    });
    window.addEventListener("beforeunload", (event) => {
      if (state.session) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
    window.addEventListener("resize", () => {
      if (window.innerWidth > 760) closeMenu();
    });
  }

  function init() {
    loadHistory();
    let savedTheme = "dark";
    try { savedTheme = localStorage.getItem(THEME_KEY) || "dark"; } catch (_) { /* Use default theme. */ }
    setTheme(savedTheme, false);
    dom.currentYear.textContent = String(new Date().getFullYear());
    bindEvents();
    renderSetupStats();
    renderHistory();
  }

  init();
})();
