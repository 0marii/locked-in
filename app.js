/* Locked-In: vanilla JavaScript, compatible with static GitHub Pages hosting. */
(() => {
  "use strict";

  const HISTORY_KEY = "locked_in_history_v2";
  const LEGACY_HISTORY_KEYS = ["focusforge_history_v1", "locked-in-history"];
  const THEME_KEY = "locked_in_theme";
  const ACTIVE_SESSION_KEY = "locked_in_active_session_v1";
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
    timerBackBtn: $("timer-back-btn"), activeSessionBanner: $("active-session-banner"), activeSessionLabel: $("active-session-label"), resumeSessionBtn: $("resume-session-btn"), statusBadge: $("status-badge"), timerHeading: $("timer-heading"),
    timerSubtitle: $("timer-subtitle"), timeDisplay: $("time-display"), timerProgress: $("timer-progress"),
    timerProgressBar: $("timer-progress-bar"), plannedTime: $("planned-time"), breakTime: $("break-time"),
    elapsedTime: $("elapsed-time"), expectedEndTime: $("expected-end-time"), timerStatusMessage: $("timer-status-message"), breakBtn: $("break-btn"),
    stopBtn: $("stop-btn"), reportEyebrow: $("report-eyebrow"), reportSymbol: $("report-symbol"),
    reportTitle: $("report-title"), reportMessage: $("report-message"), efficiencyPercent: $("efficiency-percent"),
    rankDisplay: $("rank-display"), efficiencyBar: $("efficiency-bar"), repIntent: $("rep-intent"),
    repFocus: $("rep-focus"), repClock: $("rep-clock"), repBreaks: $("rep-breaks"),
    breakBreakdownWrapper: $("break-breakdown-wrapper"), breakBreakdownList: $("break-breakdown-list"),
    newSessionBtn: $("new-session-btn"), reportHistoryBtn: $("report-history-btn"),
    historySessionCount: $("history-session-count"), historyTotalFocus: $("history-total-focus"),
    historyAverage: $("history-average"), historySearch: $("history-search"), historyTableBody: $("history-table-body"),
    historyEmpty: $("history-empty"), historyStartBtn: $("history-start-btn"), analysisStats: $("analysis-stats"), analysisSummary: $("analysis-summary"), focusChart: $("focus-chart"), exportCsvBtn: $("export-csv-btn"),
    exportJsonBtn: $("export-json-btn"), clearHistoryBtn: $("clear-history-btn"), currentYear: $("current-year"),
    sessionTopic: $("session-topic"), sessionNotes: $("session-notes"), notesSaveStatus: $("notes-save-status"),
    importJsonInput: $("import-json-input"), backToTop: $("back-to-top"), keyboardShortcuts: $("keyboard-shortcuts"),
    toast: $("toast"), confirmDialog: $("confirm-dialog"), confirmTitle: $("confirm-title"),
    confirmMessage: $("confirm-message"), confirmAccept: $("confirm-accept")
  };

  const state = {
    activeScreen: "setup-screen",
    session: null,
    intervalId: null,
    history: [],
    toastTimer: null,
    confirmAction: null,
    lastReportId: null,
    lastPersistedAt: 0
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
      reason: String(record.reason || ""),
      topic: String(record.topic ?? record.topics ?? record.workedOn ?? "").slice(0, 240),
      notes: String(record.notes ?? record.studied ?? "").slice(0, 4000),
      topics: String(record.topic ?? record.topics ?? record.workedOn ?? "").slice(0, 240),
      studied: String(record.notes ?? record.studied ?? "").slice(0, 4000)
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
    document.body.classList.toggle("is-focusing", screenId === "timer-screen");
    document.body.classList.toggle("is-history", screenId === "history-screen");
    dom.screens.forEach((screen) => screen.classList.toggle("is-active", screen.id === screenId));
    dom.navLinks.forEach((link) => {
      const active = link.dataset.screen === screenId;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
    });
    const hashForScreen = {"setup-screen":"setup", "timer-screen":"timer", "report-screen":"report", "history-screen":"history"}[screenId];
    if (hashForScreen && location.hash !== `#${hashForScreen}`) history.pushState(null, "", `${location.pathname}${location.search}#${hashForScreen}`);
    closeMenu();
    if (screenId === "history-screen") renderHistory();
    if (screenId === "setup-screen") renderSetupStats();
    renderActiveSessionBanner();
    const heading = document.querySelector(`#${screenId} h1`);
    if (heading) { heading.setAttribute("tabindex", "-1"); heading.focus({preventScroll:true}); }
    document.title = screenId === "history-screen" ? "Session history · Locked-In" : screenId === "setup-screen" ? "Locked-In — Focus Timer & Deep Work Tracker" : screenId === "timer-screen" ? "Focus session · Locked-In" : "Session report · Locked-In";
    if (screenId !== "timer-screen") safeWrite("locked_in_last_screen", screenId);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  function renderActiveSessionBanner() {
    if (!dom.activeSessionBanner) return;
    const active = Boolean(state.session);
    dom.activeSessionBanner.classList.toggle("is-hidden", !active || state.activeScreen !== "setup-screen");
    if (active) dom.activeSessionLabel.textContent = `${state.session.intent} · ${formatClock(Math.max(0, state.session.remainingSeconds || state.session.targetSeconds))} planned time remaining`;
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
    const validThemes = ["dark", "light", "forest", "violet", "pink", "blue"];
    const chosen = validThemes.includes(theme) ? theme : "dark";
    document.documentElement.dataset.theme = chosen;
    dom.themeSelect.value = chosen;
    if (persist) {
      try { localStorage.setItem(THEME_KEY, chosen); } catch (_) { /* Theme still works for this page view. */ }
    }
    const themeColor = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor || "#101310");
    if (state.activeScreen === "history-screen") renderHistory();
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
      intent, topic: "", notes: "", targetSeconds, remainingSeconds: targetSeconds, hardcore: dom.sessionStyle.value === "hardcore",
      startedAt: now, activeWorkStartedAt: now, accumulatedFocusSeconds: 0,
      currentBreakStartedAt: null, breaks: [], breakSeconds: 0, outcome: null, reason: ""
    };
    safeWrite(ACTIVE_SESSION_KEY, state.session);
    state.lastPersistedAt = now;
    dom.sessionTopic.value = "";
    dom.sessionNotes.value = "";
    ["topic-save-state", "notes-save-state"].forEach((id) => { const el = $(id); if (el) { el.dataset.state = "saved"; el.textContent = "No unsaved changes"; } });
    ["save-topic-btn", "save-notes-btn"].forEach((id) => { const el = $(id); if (el) el.disabled = true; });
    dom.notesSaveStatus.textContent = "Notes are saved with this session when you finish.";
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

    if (session.hardcore && currentBreakSeconds(session, now) > HARDCORE_BREAK_LIMIT_SECONDS) {
      finishSession("failed", "Total break time exceeded 15 minutes.");
      return;
    }

    if (!session.currentBreakStartedAt) {
      session.remainingSeconds = Math.max(0, session.targetSeconds - activeFocusSeconds(session, now));
      if (session.remainingSeconds <= 0) {
        finishSession("completed", "Target duration reached.");
        return;
      }
    }
    if (now - state.lastPersistedAt >= 5000) { safeWrite(ACTIVE_SESSION_KEY, session); state.lastPersistedAt = now; }
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
      dom.timerStatusMessage.textContent = session.hardcore ? "Break started. Hardcore mode allows 15 minutes of total break time." : "Take a breath. Resume when you're ready.";
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
    safeWrite(ACTIVE_SESSION_KEY, session); state.lastPersistedAt = now;
    renderTimer(now);
  }

  function askConfirm(title, message, action, acceptText = "Confirm") {
    dom.confirmTitle.textContent = title;
    dom.confirmMessage.textContent = message;
    dom.confirmAccept.textContent = acceptText;
    state.confirmAction = action;
    dom.confirmDialog.returnValue = "";
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
    session.topic = dom.sessionTopic.value.trim();
    session.notes = dom.sessionNotes.value.trim();
    const focusSeconds = Math.min(session.targetSeconds, Math.max(0, Math.floor(activeFocusSeconds(session, now))));
    const elapsed = Math.max(0, Math.floor(elapsedSeconds(session, now)));
    const breakSeconds = Math.max(0, Math.floor(session.breakSeconds));
    const completion = session.targetSeconds > 0 ? Math.min(focusSeconds / session.targetSeconds, 1) : 0;
    const breakCount = session.breaks.length;
    const score = completion < 0.70 ? null : Math.max(0, Math.round(completion * 100 - Math.min(0.8 * (breakSeconds / session.targetSeconds) * 100, 60) - Math.min(Math.max(breakCount - 2, 0) * 2, 10)));
    if (session.hardcore && breakSeconds > HARDCORE_BREAK_LIMIT_SECONDS) outcome = "failed";
    else if (completion < 0.70 && outcome !== "failed") outcome = "incomplete";
    const finalScore = outcome === "failed" || outcome === "incomplete" ? null : score;
    const record = {
      id: session.id, intent: session.intent, targetSeconds: session.targetSeconds,
      focusSeconds, elapsedSeconds: Math.max(focusSeconds + breakSeconds, elapsed),
      breakSeconds, breaks: session.breaks, score: finalScore, scoreVersion: 2, completedAt: new Date(now).toISOString(),
      hardcore: session.hardcore, hardcoreFailed: outcome === "failed", outcome, reason,
      topic: session.topic || "", topics: session.topic || "", notes: session.notes || "", studied: session.notes || ""
    };
    clearInterval(state.intervalId);
    state.intervalId = null;
    state.session = null;
    safeWrite(ACTIVE_SESSION_KEY, null);
    if (record.focusSeconds === 0) {
      showToast("Empty sessions are not saved.");
      showScreen("setup-screen");
      return;
    }
    if (state.history.length >= MAX_HISTORY) showToast(`History limit reached: only the latest ${MAX_HISTORY} sessions are kept. Export a backup to preserve older records.`);
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
    dom.expectedEndTime.textContent = new Date(now + Math.max(0, remaining) * 1000).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"});
    dom.timerStatusMessage.textContent = onBreak
      ? (session.hardcore ? `Hardcore total break: ${formatClock(breaks)} / 15:00` : "Take a breath. Resume when you're ready.")
      : dom.timerStatusMessage.textContent;
    const percent = Math.min(100, Math.max(0, focus / session.targetSeconds * 100));
    dom.timerProgressBar.style.width = `${percent}%`;
    dom.timerProgress.setAttribute("aria-valuenow", String(Math.round(percent)));
    dom.timerProgress.setAttribute("aria-valuetext", `${Math.round(percent)}% of planned focus time completed`);
    document.title = `${formatClock(remaining, session.targetSeconds >= 3600)} · Locked-In`;
  }

  function renderReport(record) {
    const ratio = record.scoreVersion === 2 ? record.score : (record.elapsedSeconds > 0 ? Math.round(record.focusSeconds / record.elapsedSeconds * 100) : 0);
    const complete = record.outcome === "completed";
    const incomplete = record.outcome === "incomplete";
    const failed = record.outcome === "failed";
    dom.reportEyebrow.textContent = failed ? "HARDCORE SESSION FAILED" : complete ? "SESSION COMPLETE" : "SESSION ENDED";
    dom.reportSymbol.textContent = failed ? "!" : complete ? "✓" : "↗";
    dom.reportTitle.textContent = failed ? "Reset and try again." : complete ? "You showed up." : incomplete ? "Session ended early." : "Every minute counts.";
    dom.reportMessage.textContent = failed ? "One session doesn't define you. Start again when you're ready." : complete ? "You reached your planned focus duration. Nice work." : incomplete ? "You completed less than 70% of your planned focus time. This session is excluded from completed totals." : "You ended this session early. Your time has still been recorded.";
    dom.efficiencyPercent.textContent = ratio == null ? "N/A" : `${ratio}%`;
    const planned = Math.max(1, Number(record.targetSeconds) || 1);
    const completionPct = Math.min((record.focusSeconds / planned) * 100, 100);
    const breakPenalty = Math.min(0.8 * (record.breakSeconds / planned) * 100, 60);
    const countPenalty = Math.min(Math.max((record.breaks || []).length - 2, 0) * 2, 10);
    const scoreExplanation = ratio == null
      ? (failed ? `No score: Hardcore mode failed because total break time exceeded ${Math.round(HARDCORE_BREAK_LIMIT_SECONDS / 60)} minutes.` : `No score: focused ${Math.round(completionPct)}% of the planned time; at least 70% is required.`)
      : `Focus score = ${Math.round(completionPct)}% completion − ${breakPenalty.toFixed(1)} break-time penalty − ${countPenalty} break-count penalty = ${ratio}. Planned ${formatDuration(planned)}, focused ${formatDuration(record.focusSeconds)}, breaks ${formatDuration(record.breakSeconds)} across ${(record.breaks || []).length} break(s).`;
    dom.efficiencyPercent.title = scoreExplanation;
    dom.efficiencyPercent.setAttribute("aria-label", scoreExplanation);
    dom.efficiencyPercent.tabIndex = 0;
    dom.rankDisplay.title = scoreExplanation;
    dom.rankDisplay.setAttribute("aria-label", scoreExplanation);
    dom.efficiencyBar.style.width = `${ratio || 0}%`;
    dom.rankDisplay.textContent = failed ? "Hardcore failed · no score" : ratio == null ? "Incomplete · no score" : ratio >= 90 ? "Excellent" : ratio >= 75 ? "Strong" : ratio >= 50 ? "Fair" : "Weak";
    state.lastReportId = record.id;
    dom.repIntent.textContent = record.intent;
    dom.sessionTopic.value = record.topic || record.topics || "";
    dom.sessionNotes.value = record.notes || record.studied || "";
    dom.notesSaveStatus.textContent = "Changes are saved to this session record.";
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

  function getScoredHistory() {
    return state.history.filter((item) =>
      item.outcome !== "incomplete" &&
      item.outcome !== "failed" &&
      (item.scoreVersion !== 2 || item.score != null)
    );
  }

  function renderSetupStats() {
    const scoredHistory = getScoredHistory();
    dom.setupSessionCount.textContent = String(scoredHistory.length);
    const focus = scoredHistory.reduce((sum, item) => sum + item.focusSeconds, 0);
    dom.setupTotalFocus.textContent = formatDuration(focus);
  }

  function renderHistory() {
    const query = dom.historySearch.value.trim().toLocaleLowerCase();
    const rows = state.history.filter((item) => [item.intent, item.topic, item.topics, item.notes, item.studied].join(" ").toLocaleLowerCase().includes(query));
    dom.historyTableBody.replaceChildren();
    rows.forEach((item) => {
      const tr = document.createElement("tr");
      const ratio = item.scoreVersion === 2 ? item.score : (item.elapsedSeconds ? Math.round(item.focusSeconds / item.elapsedSeconds * 100) : 0);
      const outcomeLabel = item.outcome === "completed" ? "Completed" : item.outcome === "failed" ? "Hardcore failed" : item.outcome === "incomplete" ? "Incomplete" : "Ended early";
      const cells = [
        formatDate(item.completedAt), item.intent || "Untitled session", item.topic || item.topics || "—", item.notes || item.studied || "—",
        `${formatClock(item.focusSeconds, item.focusSeconds >= 3600)}${item.focusSeconds >= 3600 ? " h:m:s" : " m:s"}`,
        `${formatClock(item.elapsedSeconds, item.elapsedSeconds >= 3600)}${item.elapsedSeconds >= 3600 ? " h:m:s" : " m:s"}`, `${ratio == null ? (item.scoreVersion === 2 ? "N/A" : "Legacy") : ratio + "%"}`
      ];
      cells.forEach((value) => {
        const td = document.createElement("td");
        td.textContent = value;
        tr.append(td);
      });
      const scoreCell = tr.children[6];
      if (scoreCell) {
        const planned = Math.max(1, Number(item.targetSeconds) || 1);
        const completionPct = Math.min(item.focusSeconds / planned * 100, 100);
        const breakPenalty = Math.min(0.8 * ((item.breakSeconds || 0) / planned) * 100, 60);
        const countPenalty = Math.min(Math.max(((item.breaks || []).length) - 2, 0) * 2, 10);
        scoreCell.title = item.score == null
          ? (item.outcome === "incomplete" ? `No score: ${Math.round(completionPct)}% completion; 70% is required.` : item.outcome === "failed" ? "No score: Hardcore break limit exceeded." : "No score available for this legacy session.")
          : `Score: ${Math.round(completionPct)}% completion − ${breakPenalty.toFixed(1)} break-time penalty − ${countPenalty} break-count penalty = ${item.score}.`;
        scoreCell.tabIndex = 0;
      }
      const outcomeCell = document.createElement("td");
      const pill = document.createElement("span");
      pill.className = `outcome-pill ${item.outcome === "completed" ? "success" : item.outcome === "failed" ? "failed" : ""}`;
      pill.textContent = outcomeLabel;
      if (item.outcome === "incomplete") {
        pill.title = `Incomplete: focused ${Math.round(Math.min(100, (item.focusSeconds / Math.max(1, item.targetSeconds)) * 100))}% of the planned time. At least 70% is required to receive a score or count as completed.`;
        pill.tabIndex = 0;
        pill.setAttribute("aria-label", pill.title);
      } else if (item.outcome === "failed") {
        pill.title = `Hardcore failed: total break time was ${formatDuration(item.breakSeconds)}, exceeding the 15-minute limit. No score is awarded.`;
        pill.tabIndex = 0;
        pill.setAttribute("aria-label", pill.title);
      }
      outcomeCell.append(pill);
      tr.append(outcomeCell);
      const actionsCell = document.createElement("td");
      const edit = document.createElement("button"); edit.type = "button"; edit.className = "button button-secondary button-small"; edit.textContent = "Edit notes"; edit.setAttribute("aria-label", `Edit notes for ${item.intent}`);
      edit.addEventListener("click", () => editSessionNotes(item.id));
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "button button-danger-outline button-small"; remove.textContent = "Delete"; remove.setAttribute("aria-label", `Delete session ${item.intent}`);
      remove.addEventListener("click", () => deleteSession(item.id));
      actionsCell.append(edit, remove); tr.append(actionsCell);
      dom.historyTableBody.append(tr);
    });
    const scoredHistory = getScoredHistory();
    const totalFocus = scoredHistory.reduce((sum, item) => sum + item.focusSeconds, 0);
    const avg = scoredHistory.length
      ? Math.round(scoredHistory.reduce((sum, item) => sum + item.score, 0) / scoredHistory.length)
      : null;
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
    renderAnalysis(rows, query);
  }

  function renderAnalysis(rows, query) {
    if (!dom.analysisStats || !dom.focusChart || !dom.analysisSummary) return;
    const focus = rows.reduce((sum, item) => sum + item.focusSeconds, 0);
    const breaks = rows.reduce((sum, item) => sum + item.breakSeconds, 0);
    const elapsed = rows.reduce((sum, item) => sum + item.elapsedSeconds, 0);
    const eligible = rows.filter(item => item.outcome !== "incomplete" && item.outcome !== "failed" && (item.scoreVersion !== 2 || item.score != null));
    const avg = eligible.length ? Math.round(eligible.reduce((sum, item) => sum + (item.scoreVersion === 2 ? item.score : (item.elapsedSeconds ? item.focusSeconds / item.elapsedSeconds * 100 : 0)), 0) / eligible.length) : null;
    const stats = [["Matching sessions", rows.length], ["Total focus time", formatDuration(focus)], ["Total break time", formatDuration(breaks)], ["Total elapsed", formatDuration(elapsed)], ["Average focus score", avg == null ? "—" : `${avg}%`]];
    dom.analysisStats.replaceChildren();
    stats.forEach(([label, value]) => { const card = document.createElement("div"); card.className = "analysis-stat"; const small = document.createElement("span"); small.textContent = label; const strong = document.createElement("strong"); strong.textContent = String(value); card.append(small, strong); dom.analysisStats.append(card); });
    dom.analysisSummary.textContent = query ? `Showing ${rows.length} session(s) matching “${query}”.` : `Based on ${rows.length} saved session(s).`;
    drawFocusChart(rows);
  }

  function drawFocusChart(rows) {
    const canvas = dom.focusChart; const ctx = canvas.getContext("2d"); if (!ctx) return;
    const width = Math.max(300, canvas.clientWidth || 600); const height = 220; const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
    const styles = getComputedStyle(document.documentElement); const accent = styles.getPropertyValue("--accent").trim() || "#b7f36b"; const muted = styles.getPropertyValue("--text-muted").trim() || "#a0aa9e"; const border = styles.getPropertyValue("--border").trim() || "#303a30";
    ctx.font = "12px system-ui, sans-serif"; ctx.fillStyle = muted;
    const recent = rows.slice(0, 12).reverse();
    if (!recent.length) { ctx.fillText("No matching sessions yet", 12, 30); canvas.setAttribute("aria-label", "No sessions match the current search."); return; }
    const top = 14, bottom = 36, left = 12, right = 12, plotHeight = height - top - bottom;
    ctx.strokeStyle = border; ctx.beginPath(); ctx.moveTo(left, top + plotHeight); ctx.lineTo(width - right, top + plotHeight); ctx.stroke();
    const max = Math.max(60, ...recent.map(item => item.focusSeconds)); const gap = 8; const barWidth = Math.max(5, (width - left - right - gap * (recent.length - 1)) / recent.length);
    recent.forEach((item, index) => { const barHeight = Math.max(2, item.focusSeconds / max * (plotHeight - 8)); const x = left + index * (barWidth + gap); ctx.fillStyle = accent; ctx.fillRect(x, top + plotHeight - barHeight, barWidth, barHeight); ctx.fillStyle = muted; ctx.textAlign = "center"; const label = new Date(item.completedAt).toLocaleDateString(undefined, {month:"short", day:"numeric"}); ctx.fillText(label, x + barWidth / 2, height - 12, Math.max(32, barWidth + 12)); });
    canvas.setAttribute("aria-label", `Focus time chart for ${recent.length} recent sessions. ${recent.map(item => `${item.intent}: ${formatDuration(item.focusSeconds)}`).join("; ")}`);
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
    const header = ["Completed At", "Goal", "Planned Seconds", "Focused Seconds", "Elapsed Seconds", "Break Seconds", "Break Count", "Focus Score (%)", "Session Style", "Outcome", "Reason", "Topics / Work", "Notes"];
    const rows = state.history.map((item) => [
      item.completedAt, item.intent, item.targetSeconds, item.focusSeconds, item.elapsedSeconds,
      item.breakSeconds, item.breaks.length, item.scoreVersion === 2 ? (item.score == null ? "" : item.score) : (item.elapsedSeconds ? Math.round(item.focusSeconds / item.elapsedSeconds * 100) : 0),
      item.hardcore ? "Hardcore" : "Standard", item.outcome, item.reason, item.topic || item.topics || "", item.notes || item.studied || ""
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
    downloadFile("locked-in-sessions.csv", "\uFEFF" + csv, "text/csv;charset=utf-8");
    showToast("CSV export prepared.");
  }

  function exportJson() {
    const backup = { schemaVersion: 2, exportedAt: new Date().toISOString(), app: "Locked-In", sessions: state.history };
    downloadFile("locked-in-backup.json", JSON.stringify(backup, null, 2), "application/json");
    showToast("JSON backup prepared.");
  }

  function editSessionNotes(id) {
    const item = state.history.find((record) => record.id === id);
    const dialog = $("edit-session-dialog");
    if (!item || !dialog) return;
    $("edit-session-title").value = item.topic || item.topics || "";
    $("edit-session-notes").value = item.notes || item.studied || "";
    dialog.dataset.sessionId = String(id);
    dialog.returnValue = "";
    if (typeof dialog.showModal === "function") dialog.showModal();
    else showToast("Your browser does not support the note editor dialog.");
    $("edit-session-title").focus();
  }

  function deleteSession(id) {
    const item = state.history.find((record) => record.id === id);
    if (!item) return;
    askConfirm("Delete this session?", `Delete “${item.intent}”? This cannot be undone.`, () => {
      state.history = state.history.filter((record) => record.id !== id);
      saveHistory(); renderHistory(); showToast("Session deleted.");
    }, "Delete session");
  }

  async function importJsonBackup(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const incoming = Array.isArray(parsed) ? parsed : parsed.sessions;
      if (!Array.isArray(incoming) || incoming.some((record) => !record || typeof record !== "object" || !("intent" in record || "goal" in record || "task" in record))) throw new Error("Invalid backup");
      const merged = new Map(state.history.map((record) => [String(record.id), record]));
      incoming.slice(0, MAX_HISTORY).forEach((record) => { const normalized = normalizeLegacyRecord(record); if (normalized) merged.set(normalized.id, normalized); });
      state.history = [...merged.values()].sort((a,b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)).slice(0, MAX_HISTORY);
      saveHistory(); renderHistory(); showToast(`Imported ${incoming.length} session(s).`);
    } catch (_) { showToast("Import failed. Choose a valid Locked-In JSON backup."); }
    finally { if (dom.importJsonInput) dom.importJsonInput.value = ""; }
  }

  function restoreActiveSession() {
    const saved = safeRead(ACTIVE_SESSION_KEY, null);
    if (!saved || typeof saved !== "object" || !saved.id || !saved.startedAt || !saved.targetSeconds) return;
    const now = Date.now();
    state.session = saved;
    state.lastPersistedAt = now;
    if (state.session.currentBreakStartedAt) {
      // Breaks continue to elapse accurately after reload.
    } else if (!state.session.activeWorkStartedAt) {
      state.session.activeWorkStartedAt = now;
    }
    dom.taskIntent.value = saved.intent || "";
    dom.sessionTopic.value = saved.topic || "";
    dom.sessionNotes.value = saved.notes || "";
    showScreen("timer-screen");
    renderTimer(now);
    state.intervalId = window.setInterval(tick, 250);
    showToast("Your active session was restored.");
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
    if (["input", "textarea", "select"].includes(tag) || target?.isContentEditable) return;
    if (dom.keyboardShortcuts.checked && event.key.toLowerCase() === "b" && state.activeScreen === "timer-screen") {
      event.preventDefault();
      toggleBreak();
    }
    if (dom.keyboardShortcuts.checked && event.key.toLowerCase() === "s" && state.activeScreen === "timer-screen") {
      event.preventDefault();
      stopSession();
    }
    if (event.key === "Escape") closeMenu();
  }

  function bindEvents() {
    try { dom.keyboardShortcuts.checked = localStorage.getItem("locked_in_keyboard_shortcuts") !== "false"; } catch (_) {}
    dom.keyboardShortcuts.addEventListener("change", () => { try { localStorage.setItem("locked_in_keyboard_shortcuts", String(dom.keyboardShortcuts.checked)); } catch (_) {} });
    dom.menuToggle.addEventListener("click", toggleMenu);
    dom.navLinks.forEach((button) => button.addEventListener("click", () => showScreen(button.dataset.screen)));
    dom.nav.querySelector('a[href="#about"]').addEventListener("click", () => {
      closeMenu();
      if (state.activeScreen !== "setup-screen") showScreen("setup-screen");
      setTimeout(() => document.getElementById("about").scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    });
    dom.themeSelect.addEventListener("change", () => setTheme(dom.themeSelect.value));
    dom.durationPreset.addEventListener("change", () => {
      const custom = dom.durationPreset.value === "custom";
      dom.customDuration.classList.toggle("is-hidden", !custom);
      dom.customDuration.setAttribute("aria-hidden", String(!custom));
      if (custom) dom.customHours.focus();
    });
    dom.setupForm.addEventListener("submit", startSession);
    dom.timerBackBtn.addEventListener("click", () => showScreen("setup-screen"));
    dom.resumeSessionBtn.addEventListener("click", () => { if (state.session) { showScreen("timer-screen"); tick(); } });
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
    dom.importJsonInput.addEventListener("change", () => importJsonBackup(dom.importJsonInput.files?.[0]));
    dom.sessionTopic.addEventListener("input", () => { if (state.session) { state.session.topic = dom.sessionTopic.value; safeWrite(ACTIVE_SESSION_KEY, state.session); } });
    dom.sessionNotes.addEventListener("input", () => { if (state.session) { state.session.notes = dom.sessionNotes.value; safeWrite(ACTIVE_SESSION_KEY, state.session); } else if (state.lastReportId) { const r = state.history.find(x => x.id === state.lastReportId); if (r) { r.notes = r.studied = dom.sessionNotes.value; saveHistory(); } } });
    dom.sessionTopic.addEventListener("change", () => { if (!state.session && state.lastReportId) { const r = state.history.find(x => x.id === state.lastReportId); if (r) { r.topic = r.topics = dom.sessionTopic.value; saveHistory(); renderHistory(); } } });
    const updateBackToTop = () => {
      const visible = window.scrollY > 240;
      dom.backToTop.classList.toggle("is-visible", visible);
      dom.backToTop.setAttribute("aria-hidden", String(!visible));
      dom.backToTop.tabIndex = visible ? 0 : -1;
    };
    dom.backToTop.addEventListener("click", () => window.scrollTo({top:0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"}));
    window.addEventListener("scroll", updateBackToTop, {passive:true});
    window.addEventListener("pageshow", updateBackToTop);
    updateBackToTop();
    dom.confirmDialog.addEventListener("close", () => {
      const action = state.confirmAction;
      state.confirmAction = null;
      if (dom.confirmDialog.returnValue === "confirm" && action) action();
    });
    document.addEventListener("keydown", handleKeyboard);
    window.addEventListener("hashchange", () => {
      const map = {"#setup":"setup-screen", "#timer":"timer-screen", "#report":"report-screen", "#history":"history-screen"};
      const target = map[location.hash];
      if (target && target !== state.activeScreen) {
        if (target === "timer-screen" && !state.session) showScreen("setup-screen");
        else showScreen(target);
      }
    });
    document.querySelector(".brand")?.addEventListener("click", (event) => {
      event.preventDefault(); showScreen("setup-screen");
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && state.session) safeWrite(ACTIVE_SESSION_KEY, state.session);
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
      if (state.activeScreen === "history-screen") renderHistory();
    });
  }


  function installRequestedFeatures() {
    // Sticky notes are per-session and are merged into the session notes before saving.
    const nav = $("sticky-notes-nav");
    if (nav) nav.addEventListener("click", () => {
      closeMenu();
      let panel = $("sticky-notes-panel");
      if (!panel) {
        panel = document.createElement("section"); panel.id = "sticky-notes-panel"; panel.className = "sticky-notes-panel";
        panel.innerHTML = '<div class="sticky-head"><strong>Sticky notes</strong><button type="button" class="sticky-close" aria-label="Close sticky notes">×</button></div><p>Quick thoughts for this session. They are automatically added to session notes when you save the session.</p><textarea id="sticky-note-input" aria-label="Sticky note" placeholder="Jot down a thought…"></textarea><button type="button" class="button button-primary" id="sticky-add">Add sticky note</button><ul id="sticky-note-list"></ul>';
        document.body.append(panel);
        panel.querySelector(".sticky-close").addEventListener("click",()=>panel.classList.remove("is-open"));
        $("sticky-add").addEventListener("click",()=>{
          const input=$("sticky-note-input"), value=input.value.trim(); if(!value)return;
          const list=$("sticky-note-list"), li=document.createElement("li"); li.textContent=value; list.append(li);
          const current=dom.sessionNotes.value.trim(); dom.sessionNotes.value=[current,`• ${value}`].filter(Boolean).join("\n");
          if (state.session) { state.session.notes = dom.sessionNotes.value; safeWrite(ACTIVE_SESSION_KEY, state.session); }
          input.value=""; showToast("Sticky note added to this session's notes.");
        });
      }
      panel.classList.toggle("is-open");
      if(panel.classList.contains("is-open")) $("sticky-note-input").focus();
    });
    const topic = dom.sessionTopic, notes = dom.sessionNotes;
    const saveField = (field, buttonId, statusId, prop) => {
      const btn=$(buttonId), status=$(statusId); if(!btn||!status||!field)return;
      let dirty=false;
      const mark=()=>{dirty=true;btn.disabled=false;status.textContent="Unsaved changes";status.dataset.state="dirty";};
      field.addEventListener("input",mark);
      btn.addEventListener("click",()=>{
        try {
          const records=JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");
          const rec=records.find(r=>String(r.id)===String(state.lastReportId)) || records[0];
          if(!rec) throw new Error("No saved session is available.");
          const value=field.value.trim(); rec[prop]=value;
          if(prop==="topic")rec.topics=value; else rec.studied=value;
          localStorage.setItem(HISTORY_KEY,JSON.stringify(records));
          dirty=false;btn.disabled=true;status.dataset.state="saved";status.textContent=`Saved ✓ · ${new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`;showToast("Saved successfully.");
          state.history=records;renderHistory();
        } catch(err) { status.dataset.state="error";status.textContent="Save failed — browser storage may be unavailable.";showToast("Could not save. Check browser storage and try again."); }
      });
      field.dataset.saveButton=buttonId;
    };
    saveField(topic,"save-topic-btn","topic-save-state","topic");
    saveField(notes,"save-notes-btn","notes-save-state","notes");
    const editDialog = $("edit-session-dialog");
    const editForm = $("edit-session-form");
    const editNotes = $("edit-session-notes");
    const editCancel = $("edit-session-cancel");
    const editDelete = $("edit-session-delete");
    if (editCancel) editCancel.addEventListener("click", () => editDialog?.close("cancel"));
    if (editDelete) editDelete.addEventListener("click", () => {
      const id = editDialog?.dataset.sessionId;
      editDialog?.close("delete");
      if (id) deleteSession(id);
    });
    if (editNotes) editNotes.addEventListener("input", () => { editNotes.style.height = "auto"; editNotes.style.height = `${editNotes.scrollHeight}px`; });
    if (editForm) editForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const id = editDialog?.dataset.sessionId;
      const item = state.history.find((record) => String(record.id) === String(id));
      if (!item) { editDialog?.close(); return; }
      item.topic = item.topics = $("edit-session-title").value.trim().slice(0, 240);
      item.notes = item.studied = $("edit-session-notes").value.trim().slice(0, 4000);
      saveHistory(); renderHistory(); editDialog.close("saved"); showToast("Session notes updated.");
    });
    document.addEventListener("keydown",e=>{
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="s"){
        const topicDirty = $("topic-save-state")?.dataset.state === "dirty";
        const notesDirty = $("notes-save-state")?.dataset.state === "dirty";
        if (topicDirty || notesDirty) {
          e.preventDefault();
          if (topicDirty) $("save-topic-btn")?.click();
          if (notesDirty) $("save-notes-btn")?.click();
        }
      }
      if(e.key==="Escape") { const panel=$("sticky-notes-panel");if(panel)panel.classList.remove("is-open"); }
    });
    window.addEventListener("beforeunload",e=>{
      if(($("topic-save-state")?.dataset.state==="dirty")||($("notes-save-state")?.dataset.state==="dirty")){e.preventDefault();e.returnValue="";}
    });
  }

  function init() {
    loadHistory();
    let savedTheme = "dark";
    try { savedTheme = localStorage.getItem(THEME_KEY) || "dark"; } catch (_) { /* Use default theme. */ }
    setTheme(savedTheme, false);
    dom.currentYear.textContent = String(new Date().getFullYear());
    bindEvents();
    installRequestedFeatures();
    renderSetupStats();
    renderHistory();
    restoreActiveSession();
  }

  init();
})();
