/* Locked-In — privacy-first focus timer. No build step, no dependencies. */
(() => {
  "use strict";

  const HISTORY_KEY = "locked_in_history_v2";
  const LEGACY_HISTORY_KEYS = ["focusforge_history_v1", "locked-in-history"];
  const ACTIVE_SESSION_KEY = "locked_in_active_session_v2";
  const THEME_KEY = "locked_in_theme";
  const NOTES_INBOX_KEY = "locked_in_notes_inbox_v1";
  const MAX_HISTORY = 1000;
  const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
  const HARDCORE_BREAK_LIMIT_SECONDS = 15 * 60;
  const MIN_SAVED_FOCUS_SECONDS = 60;
  const CHANNEL_NAME = "locked-in-sync-v1";

  const $ = (id) => document.getElementById(id);
  const dom = {
    screens: [...document.querySelectorAll(".screen")],
    navLinks: [...document.querySelectorAll("[data-screen]")],
    nav: $("site-nav"), menuToggle: $("menu-toggle"),
    themeButton: $("theme-button"), themePopover: $("theme-popover"),
    setupForm: $("setup-form"), taskIntent: $("task-intent"), durationPreset: $("duration-preset"),
    customDuration: $("custom-duration"), customHours: $("custom-hours"), customMinutes: $("custom-minutes"),
    sessionStyle: $("session-style"), setupCompletedCount: $("setup-completed-count"), setupAllCount: $("setup-all-count"), setupTotalFocus: $("setup-total-focus"),
    activeSessionBanner: $("active-session-banner"), activeSessionLabel: $("active-session-label"), resumeSessionBtn: $("resume-session-btn"),
    timerBackBtn: $("timer-back-btn"), statusBadge: $("status-badge"), timerHeading: $("timer-heading"), timerSubtitle: $("timer-subtitle"),
    timeDisplay: $("time-display"), timerProgress: $("timer-progress"), timerProgressBar: $("timer-progress-bar"),
    plannedTime: $("planned-time"), breakTime: $("break-time"), elapsedTime: $("elapsed-time"), expectedEndTime: $("expected-end-time"),
    timerStatusMessage: $("timer-status-message"), breakBtn: $("break-btn"), stopBtn: $("stop-btn"), keyboardShortcuts: $("keyboard-shortcuts"),
    reportEyebrow: $("report-eyebrow"), reportSymbol: $("report-symbol"), reportTitle: $("report-title"), reportMessage: $("report-message"),
    completionPercent: $("completion-percent"), completionCaption: $("completion-caption"), completionBar: $("completion-bar"),
    repIntent: $("rep-intent"), repFocus: $("rep-focus"), repClock: $("rep-clock"), repBreaks: $("rep-breaks"),
    reportTopic: $("report-topic"), reportNotes: $("report-notes"), reportSaveState: $("report-save-state"),
    breakBreakdownWrapper: $("break-breakdown-wrapper"), breakBreakdownList: $("break-breakdown-list"),
    newSessionBtn: $("new-session-btn"), reportHistoryBtn: $("report-history-btn"),
    historyCompletedCount: $("history-completed-count"), historyAttemptCount: $("history-attempt-count"), historyTotalFocus: $("history-total-focus"),
    historySearch: $("history-search"), historyDateFrom: $("history-date-from"), historyDateTo: $("history-date-to"), historySort: $("history-sort"),
    historyTableBody: $("history-table-body"), historyEmpty: $("history-empty"), historyStartBtn: $("history-start-btn"),
    exportCsvBtn: $("export-csv-btn"), exportJsonBtn: $("export-json-btn"), importJsonInput: $("import-json-input"), clearHistoryBtn: $("clear-history-btn"),
    insightsStats: $("insights-stats"), insightsSummary: $("insights-summary"), weeklyChart: $("weekly-chart"), heatmap: $("heatmap"),
    bestTime: $("best-time"), bestGoal: $("best-goal"), streakCurrent: $("streak-current"), streakBest: $("streak-best"),
    notesInbox: $("notes-inbox"), notesSessions: $("notes-sessions"), notesSearch: $("notes-search"), noteCaptureForm: $("note-capture-form"), noteCaptureInput: $("note-capture-input"),
    toast: $("toast"), confirmDialog: $("confirm-dialog"), confirmTitle: $("confirm-title"), confirmMessage: $("confirm-message"), confirmAccept: $("confirm-accept"),
    shortDialog: $("short-dialog"), shortSave: $("short-save"), shortDiscard: $("short-discard"),
    editDialog: $("edit-session-dialog"), editForm: $("edit-session-form"), editTitle: $("edit-session-title"), editNotes: $("edit-session-notes"), editDelete: $("edit-session-delete"), editCancel: $("edit-session-cancel"),
    backToTop: $("back-to-top"), currentYear: $("current-year")
  };

  const state = {
    activeScreen: "setup-screen",
    session: null,
    history: [],
    inbox: [],
    intervalId: null,
    toastTimer: null,
    confirmAction: null,
    shortSessionAction: null,
    editingId: null,
    reportId: null,
    lastPersistedAt: 0,
    channel: null,
    readOnly: false,
    reportDirty: false,
    wakeLock: null
  };

  function safeRead(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (error) {
      console.warn("Locked-In storage read failed.", error);
      return fallback;
    }
  }

  function safeWrite(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error("Locked-In storage write failed.", error);
      showToast("Browser storage is unavailable or full. Export a backup before continuing.");
      return false;
    }
  }

  function esc(text) {
    return String(text ?? "");
  }

  function normalizeRecord(record) {
    if (!record || typeof record !== "object") return null;
    const rawDate = record.completedAt || record.date || record.timestamp || new Date().toISOString();
    const date = Date.parse(rawDate);
    const target = Math.max(60, Math.floor(Number(record.targetSeconds ?? record.plannedSeconds ?? 60) || 60));
    const focus = Math.max(0, Math.floor(Number(record.focusSeconds ?? record.focusedSeconds ?? record.focusTime ?? 0) || 0));
    const elapsed = Math.max(focus, Math.floor(Number(record.elapsedSeconds ?? record.clockSeconds ?? record.realClockSeconds ?? focus) || 0));
    const breaks = Array.isArray(record.breaks) ? record.breaks.slice(0, 200).map((b) => ({
      durationSeconds: Math.max(0, Math.floor(Number(b?.durationSeconds ?? b?.duration ?? 0) || 0)),
      startedAt: b?.startedAt || null,
      endedAt: b?.endedAt || null
    })) : [];
    const outcome = ["completed", "incomplete", "failed", "ended"].includes(record.outcome)
      ? record.outcome
      : (record.failed || record.hardcoreFailed ? "failed" : record.completed ? "completed" : "ended");
    const topic = String(record.topic ?? record.topics ?? record.workedOn ?? "").slice(0, 240);
    const notes = String(record.notes ?? record.studied ?? "").slice(0, 4000);
    return {
      id: String(record.id || `${date || Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      intent: String(record.intent ?? record.task ?? record.goal ?? "Untitled session").trim().slice(0, 120) || "Untitled session",
      targetSeconds: target,
      focusSeconds: focus,
      elapsedSeconds: elapsed,
      breakSeconds: Math.max(0, Math.floor(Number(record.breakSeconds) || breaks.reduce((sum, b) => sum + b.durationSeconds, 0))),
      breaks,
      completedAt: Number.isFinite(date) ? new Date(date).toISOString() : new Date().toISOString(),
      hardcore: Boolean(record.hardcore ?? record.isHardcore),
      hardcoreFailed: outcome === "failed",
      outcome,
      reason: String(record.reason || "").slice(0, 300),
      topic, topics: topic, notes, studied: notes,
      score: record.score == null ? null : Math.max(0, Math.min(100, Math.floor(Number(record.score) || 0))),
      scoreVersion: 2
    };
  }

  function loadData() {
    let raw = safeRead(HISTORY_KEY, null);
    if (!Array.isArray(raw)) {
      for (const key of LEGACY_HISTORY_KEYS) {
        const legacy = safeRead(key, null);
        if (Array.isArray(legacy)) { raw = legacy; break; }
      }
    }
    state.history = (Array.isArray(raw) ? raw : []).map(normalizeRecord).filter(Boolean)
      .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)).slice(0, MAX_HISTORY);
    const inbox = safeRead(NOTES_INBOX_KEY, []);
    state.inbox = Array.isArray(inbox) ? inbox.map((n) => ({
      id: String(n?.id || `${Date.now()}-${Math.random()}`),
      text: String(n?.text || "").slice(0, 2000),
      createdAt: n?.createdAt || new Date().toISOString()
    })).filter(n => n.text.trim()).slice(0, 200) : [];
  }

  function saveHistory() {
    if (state.readOnly) return false;
    const ok = safeWrite(HISTORY_KEY, state.history.slice(0, MAX_HISTORY));
    if (ok) broadcast({ type: "history", source: tabId });
    return ok;
  }

  function saveInbox() {
    if (state.readOnly) return false;
    const ok = safeWrite(NOTES_INBOX_KEY, state.inbox.slice(0, 200));
    if (ok) broadcast({ type: "inbox", source: tabId });
    return ok;
  }

  let tabId = "";
  try {
    tabId = sessionStorage.getItem("locked_in_tab_id") || "";
    if (!tabId) { tabId = `${Date.now()}-${Math.random().toString(36).slice(2)}`; sessionStorage.setItem("locked_in_tab_id", tabId); }
  } catch (_) { tabId = `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

  function broadcast(message) {
    try { state.channel?.postMessage(message); } catch (_) {}
  }

  function initSync() {
    try {
      state.channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null;
      state.channel?.addEventListener("message", (event) => {
        if (!event.data || event.data.source === tabId) return;
        if (event.data.type === "active-session") {
          const active = safeRead(ACTIVE_SESSION_KEY, null);
          if (active && state.session?.id !== active.id) {
            state.readOnly = true;
            showToast("This session is active in another tab. This tab is read-only.");
          } else if (!active && state.session) {
            state.session = null;
            stopTimerLoop();
            showScreen("setup-screen");
          }
        }
        if (event.data.type === "history" || event.data.type === "inbox") { loadData(); renderAll(); }
      });
    } catch (_) {}
    window.addEventListener("storage", (event) => {
      if (event.key === ACTIVE_SESSION_KEY) {
        const active = safeRead(ACTIVE_SESSION_KEY, null);
        if (active && active.tabId && active.tabId !== tabId) {
          if (state.session?.id !== active.id) {
            state.readOnly = true;
            showToast("A focus session is active in another tab.");
          }
        } else if (!active && state.session) {
          state.session = null; stopTimerLoop(); showScreen("setup-screen");
        }
      }
      if (event.key === HISTORY_KEY || event.key === NOTES_INBOX_KEY) { loadData(); renderAll(); }
    });
  }

  function showToast(message) {
    if (!dom.toast) return;
    dom.toast.textContent = message;
    dom.toast.classList.add("is-visible");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => dom.toast.classList.remove("is-visible"), 3600);
  }

  function closeMenu() {
    dom.nav.classList.remove("is-open");
    dom.menuToggle.setAttribute("aria-expanded", "false");
    dom.menuToggle.setAttribute("aria-label", "Open navigation menu");
  }

  function toggleMenu() {
    const open = dom.nav.classList.toggle("is-open");
    dom.menuToggle.setAttribute("aria-expanded", String(open));
    dom.menuToggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
  }

  function validScreen(id) { return dom.screens.some(s => s.id === id); }

  const screenMap = {
    timer: "timer-screen", history: "history-screen", insights: "insights-screen", notes: "notes-screen",
    report: "report-screen", setup: "setup-screen"
  };

  function navigate(id, replace = false) {
    if (!validScreen(id)) id = "setup-screen";
    state.activeScreen = id;
    dom.screens.forEach(s => s.classList.toggle("is-active", s.id === id));
    dom.navLinks.forEach(link => {
      const active = link.dataset.screen === id;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
    });
    closeMenu();
    const hash = Object.entries(screenMap).find(([, value]) => value === id)?.[0] || "setup";
    const target = `${location.pathname}${location.search}#${hash}`;
    if (location.hash !== `#${hash}`) {
      if (replace) history.replaceState(null, "", target); else history.pushState(null, "", target);
    }
    if (id === "setup-screen") renderSetup();
    if (id === "history-screen") renderHistory();
    if (id === "insights-screen") renderInsights();
    if (id === "notes-screen") renderNotes();
    if (id === "timer-screen" && state.session) renderTimer();
    if (id !== "timer-screen") safeWrite("locked_in_last_screen", id);
    const title = { "setup-screen": "Locked-In — Focus Timer", "timer-screen": "Focus session · Locked-In", "report-screen": "Session report · Locked-In", "history-screen": "History · Locked-In", "insights-screen": "Insights · Locked-In", "notes-screen": "Notes · Locked-In" }[id];
    document.title = title || "Locked-In";
    const heading = document.querySelector(`#${id} h1`);
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  function setTheme(theme, persist = true) {
    const themes = ["dark", "light", "forest", "violet", "pink", "blue"];
    const chosen = themes.includes(theme) ? theme : "dark";
    document.documentElement.dataset.theme = chosen;
    dom.themeButton.setAttribute("aria-label", `Theme: ${chosen}. Open theme picker`);
    dom.themeButton.querySelector(".theme-name").textContent = chosen[0].toUpperCase() + chosen.slice(1);
    dom.themePopover.querySelectorAll("[data-theme]").forEach((button) => {
      const active = button.dataset.theme === chosen;
      button.classList.toggle("is-selected", active);
      button.setAttribute("aria-checked", String(active));
    });
    if (persist) { try { localStorage.setItem(THEME_KEY, chosen); } catch (_) {} }
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg || "#101310");
  }

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (_) {}
    const system = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    setTheme(saved || system, false);
    dom.themeButton.addEventListener("click", () => {
      const open = dom.themePopover.classList.toggle("is-open");
      dom.themeButton.setAttribute("aria-expanded", String(open));
    });
    dom.themePopover.querySelectorAll("[data-theme]").forEach(b => b.addEventListener("click", () => {
      setTheme(b.dataset.theme); dom.themePopover.classList.remove("is-open"); dom.themeButton.setAttribute("aria-expanded", "false");
    }));
    document.addEventListener("click", (e) => {
      if (!dom.themePopover.contains(e.target) && !dom.themeButton.contains(e.target)) {
        dom.themePopover.classList.remove("is-open"); dom.themeButton.setAttribute("aria-expanded", "false");
      }
    });
  }

  function parseDuration() {
    if (dom.durationPreset.value !== "custom") return Number(dom.durationPreset.value) * 60;
    const hRaw = dom.customHours.value.trim(), mRaw = dom.customMinutes.value.trim();
    if (hRaw === "" && mRaw === "") { showToast("Enter a custom duration."); return null; }
    const h = hRaw === "" ? 0 : Number(hRaw), m = mRaw === "" ? 0 : Number(mRaw);
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
      showToast("Enter whole hours from 0–23 and minutes from 0–59."); return null;
    }
    const seconds = (h * 60 + m) * 60;
    if (seconds < 60) { showToast("Focus duration must be at least 1 minute."); return null; }
    return seconds;
  }

  function formatClock(total, hours = false) {
    const s = Math.max(0, Math.floor(Number(total) || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (hours || h > 0) return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
    return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  }

  function formatDuration(total) {
    const s = Math.max(0, Math.floor(Number(total) || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h) return `${h}h ${String(m).padStart(2,"0")}m`;
    if (m) return sec ? `${m}m ${sec}s` : `${m}m`;
    return `${sec}s`;
  }

  function formatDate(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "Unknown date" : new Intl.DateTimeFormat(undefined, {year:"numeric", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit"}).format(d);
  }

  function completedRecords() {
    return state.history.filter(r => r.outcome === "completed");
  }

  function scoreFor(record) {
    if (record.scoreVersion === 2) return record.score;
    if (!record.targetSeconds) return null;
    return record.focusSeconds / record.targetSeconds >= .7 ? Math.round(record.focusSeconds / record.targetSeconds * 100) : null;
  }

  function activeFocusSeconds(s, now = Date.now()) {
    return s.accumulatedFocusSeconds + (!s.currentBreakStartedAt && s.activeWorkStartedAt ? Math.max(0, (now - s.activeWorkStartedAt) / 1000) : 0);
  }

  function currentBreakSeconds(s, now = Date.now()) {
    return s.breakSeconds + (s.currentBreakStartedAt ? Math.max(0, (now - s.currentBreakStartedAt) / 1000) : 0);
  }

  function elapsedSeconds(s, now = Date.now()) { return Math.max(0, (now - s.startedAt) / 1000); }

  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try { const lock = await navigator.wakeLock.request("screen"); if (state.session) state.wakeLock = lock; else await lock.release(); } catch (_) {}
  }
  async function releaseWakeLock() {
    try { await state.wakeLock?.release(); } catch (_) {}
    state.wakeLock = null;
  }

  function startSession(event) {
    event?.preventDefault();
    if (state.readOnly) { showToast("This tab is read-only because another tab owns the active session."); return; }
    if (state.session) { navigate("timer-screen"); return; }
    const intent = dom.taskIntent.value.trim();
    if (intent.length < 2) { showToast("Add a focus goal with at least 2 characters."); dom.taskIntent.focus(); return; }
    const targetSeconds = parseDuration();
    if (!targetSeconds) return;
    const now = Date.now();
    state.session = {
      id: `${now}-${Math.random().toString(36).slice(2, 9)}`, tabId, intent: intent.slice(0,120),
      targetSeconds, hardcore: dom.sessionStyle.value === "hardcore", startedAt: now,
      activeWorkStartedAt: now, accumulatedFocusSeconds: 0, currentBreakStartedAt: null,
      breakSeconds: 0, breaks: [], topic: "", notes: ""
    };
    if (!safeWrite(ACTIVE_SESSION_KEY, state.session)) { state.session = null; return; }
    broadcast({type:"active-session", source:tabId, sessionId:state.session.id});
    state.lastPersistedAt = now;
    dom.reportTopic.value = ""; dom.reportNotes.value = "";
    navigate("timer-screen");
    requestWakeLock();
    startTimerLoop();
    renderTimer(now);
  }

  function startTimerLoop() {
    stopTimerLoop();
    state.intervalId = setInterval(tick, 250);
  }

  function stopTimerLoop() {
    if (state.intervalId) clearInterval(state.intervalId);
    state.intervalId = null;
  }

  function tick() {
    const s = state.session;
    if (!s) return;
    const now = Date.now();
    const breakTotal = currentBreakSeconds(s, now);
    if (s.hardcore && breakTotal >= HARDCORE_BREAK_LIMIT_SECONDS) {
      finishSession("failed", "Hardcore break limit reached.", true);
      return;
    }
    if (!s.currentBreakStartedAt) {
      s.remainingSeconds = Math.max(0, s.targetSeconds - activeFocusSeconds(s, now));
      if (s.remainingSeconds <= 0) { finishSession("completed", "Target duration reached.", false); return; }
    }
    if (now - state.lastPersistedAt >= 3000) {
      safeWrite(ACTIVE_SESSION_KEY, s);
      state.lastPersistedAt = now;
    }
    renderTimer(now);
  }

  function toggleBreak() {
    const s = state.session;
    if (!s || state.readOnly) return;
    const now = Date.now();
    if (!s.currentBreakStartedAt) {
      s.accumulatedFocusSeconds += Math.max(0, (now - s.activeWorkStartedAt) / 1000);
      s.activeWorkStartedAt = null; s.currentBreakStartedAt = now;
      dom.timerStatusMessage.textContent = s.hardcore ? "Hardcore: 15:00 total break time is the limit." : "Take a breath. Resume when you're ready.";
      showToast("Break started.");
    } else {
      const duration = Math.max(0, (now - s.currentBreakStartedAt) / 1000);
      s.breakSeconds += duration;
      s.breaks.push({startedAt:new Date(s.currentBreakStartedAt).toISOString(), endedAt:new Date(now).toISOString(), durationSeconds:Math.floor(duration)});
      s.currentBreakStartedAt = null; s.activeWorkStartedAt = now;
      dom.timerStatusMessage.textContent = "Back to it. Pick up where you left off.";
      if (s.hardcore && s.breakSeconds >= HARDCORE_BREAK_LIMIT_SECONDS) { finishSession("failed", "Hardcore break limit reached.", true); return; }
      showToast("Break ended. Focus resumed.");
    }
    safeWrite(ACTIVE_SESSION_KEY, s); state.lastPersistedAt = now; renderTimer(now);
  }

  function renderTimer(now = Date.now()) {
    const s = state.session; if (!s) return;
    const onBreak = Boolean(s.currentBreakStartedAt);
    const focus = activeFocusSeconds(s, now);
    const elapsed = elapsedSeconds(s, now);
    const breaks = currentBreakSeconds(s, now);
    const remaining = onBreak ? Math.max(0, s.targetSeconds - focus) : Math.max(0, s.targetSeconds - focus);
    dom.timerHeading.textContent = s.intent;
    dom.timerSubtitle.textContent = s.hardcore ? "Hardcore mode is active. Stay within the 15-minute total break limit." : "Stay with one thing.";
    dom.timeDisplay.textContent = formatClock(remaining, s.targetSeconds >= 3600);
    dom.statusBadge.classList.toggle("is-break", onBreak);
    dom.statusBadge.innerHTML = `<span class="status-dot"></span>${onBreak ? "ON BREAK" : "FOCUSING"}`;
    dom.breakBtn.innerHTML = onBreak ? '▶ Resume focus <kbd>B</kbd>' : '☕ Take a break <kbd>B</kbd>';
    dom.plannedTime.textContent = formatDuration(s.targetSeconds);
    dom.breakTime.textContent = formatDuration(breaks);
    dom.elapsedTime.textContent = formatDuration(elapsed);
    const expectedEnd = new Date(s.startedAt + (s.targetSeconds + breaks) * 1000);
    dom.expectedEndTime.textContent = expectedEnd.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
    if (onBreak) dom.timerStatusMessage.textContent = s.hardcore ? `Hardcore total break: ${formatClock(breaks)} / 15:00` : "Take a breath. Resume when you're ready.";
    const pct = Math.min(100, Math.max(0, focus / s.targetSeconds * 100));
    dom.timerProgressBar.style.width = `${pct}%`;
    dom.timerProgress.setAttribute("aria-valuenow", String(Math.round(pct)));
    document.title = `${formatClock(remaining, s.targetSeconds >= 3600)} · Locked-In`;
  }

  function stopSession() {
    if (!state.session) return;
    const now = Date.now();
    const focus = Math.floor(activeFocusSeconds(state.session, now));
    if (focus < MIN_SAVED_FOCUS_SECONDS) {
      openShortSessionDialog();
      return;
    }
    askConfirm("End this session?", `Save ${formatDuration(focus)} as an incomplete attempt? It will not count as completed.`, () => finishSession("ended", "Ended early.", false), "Save attempt");
  }

  function openShortSessionDialog() {
    dom.shortSessionAction = "discard";
    if (typeof dom.shortDialog.showModal === "function") dom.shortDialog.showModal();
    else { finishSession("ended", "Discarded because it was under one minute.", true); }
  }

  function finishSession(outcome, reason, discard) {
    const s = state.session; if (!s) return;
    const now = Date.now();
    if (s.currentBreakStartedAt) {
      const duration = Math.max(0, (now - s.currentBreakStartedAt) / 1000);
      s.breakSeconds += duration;
      s.breaks.push({startedAt:new Date(s.currentBreakStartedAt).toISOString(), endedAt:new Date(now).toISOString(), durationSeconds:Math.floor(duration)});
      s.currentBreakStartedAt = null;
    }
    const focusSeconds = Math.min(s.targetSeconds, Math.max(0, Math.floor(activeFocusSeconds(s, now))));
    const elapsed = Math.max(focusSeconds + Math.floor(s.breakSeconds), Math.floor(elapsedSeconds(s, now)));
    if (discard || focusSeconds < MIN_SAVED_FOCUS_SECONDS) {
      stopTimerLoop(); releaseWakeLock(); state.session = null; safeWrite(ACTIVE_SESSION_KEY, null); broadcast({type:"active-session", source:tabId, sessionId:null});
      showToast("Short session discarded. Nothing was added to history.");
      navigate("setup-screen"); dom.taskIntent.focus(); return;
    }
    s.topic = String(dom.reportTopic.value || "").trim().slice(0,240);
    s.notes = String(dom.reportNotes.value || "").trim().slice(0,4000);
    const completion = s.targetSeconds ? Math.min(focusSeconds / s.targetSeconds, 1) : 0;
    let finalOutcome = outcome;
    if (s.hardcore && s.breakSeconds >= HARDCORE_BREAK_LIMIT_SECONDS) finalOutcome = "failed";
    else if (completion < .7 && finalOutcome !== "failed") finalOutcome = "incomplete";
    const breakPenalty = Math.min(.8 * (s.breakSeconds / s.targetSeconds) * 100, 60);
    const countPenalty = Math.min(Math.max(s.breaks.length - 2, 0) * 2, 10);
    const score = completion >= .7 && finalOutcome !== "failed" ? Math.max(0, Math.round(completion * 100 - breakPenalty - countPenalty)) : null;
    const record = normalizeRecord({
      id:s.id, intent:s.intent, targetSeconds:s.targetSeconds, focusSeconds, elapsedSeconds:elapsed,
      breakSeconds:Math.floor(s.breakSeconds), breaks:s.breaks, score, scoreVersion:2, completedAt:new Date(now).toISOString(),
      hardcore:s.hardcore, hardcoreFailed:finalOutcome === "failed", outcome:finalOutcome, reason, topic:s.topic, notes:s.notes
    });
    stopTimerLoop(); releaseWakeLock(); state.session = null; safeWrite(ACTIVE_SESSION_KEY, null); broadcast({type:"active-session", source:tabId, sessionId:null});
    state.history.unshift(record); state.history = state.history.slice(0, MAX_HISTORY); saveHistory();
    state.reportId = record.id;
    renderReport(record); navigate("report-screen");
    if (record.outcome === "completed") playChime();
  }

  function playChime() {
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      const ctx = new C(), now = ctx.currentTime;
      [523.25,659.25,783.99].forEach((f,i) => {
        const o=ctx.createOscillator(), g=ctx.createGain(); o.type="sine"; o.frequency.value=f;
        g.gain.setValueAtTime(.0001,now+i*.12); g.gain.exponentialRampToValueAtTime(.12,now+i*.12+.03); g.gain.exponentialRampToValueAtTime(.0001,now+i*.12+.25);
        o.connect(g); g.connect(ctx.destination); o.start(now+i*.12); o.stop(now+i*.12+.27);
      });
      setTimeout(()=>ctx.close().catch(()=>{}),1200);
    } catch (_) {}
  }

  function renderReport(record) {
    const score = scoreFor(record);
    const completed = record.outcome === "completed", failed = record.outcome === "failed", incomplete = record.outcome === "incomplete";
    dom.reportEyebrow.textContent = failed ? "HARDCORE SESSION FAILED" : completed ? "SESSION COMPLETE" : "SESSION ENDED";
    dom.reportSymbol.textContent = failed ? "!" : completed ? "✓" : "·";
    dom.reportTitle.textContent = failed ? "Reset and try again." : completed ? "You showed up." : incomplete ? "Session ended early." : "Time recorded.";
    dom.reportMessage.textContent = failed ? "The 15-minute total break limit was reached. This attempt is not counted as completed." : completed ? "You reached your planned focus duration." : incomplete ? `You focused for ${Math.round(record.focusSeconds / record.targetSeconds * 100)}% of the plan. Finish 70% for the session to count as completed.` : "Your time is saved as an incomplete attempt.";
    dom.completionPercent.textContent = score == null ? "N/A" : `${score}%`;
    dom.completionCaption.textContent = score == null ? "Not counted" : score >= 90 ? "Excellent completion" : score >= 75 ? "Strong completion" : score >= 50 ? "Partial completion" : "Low completion";
    dom.completionBar.style.width = `${score || 0}%`;
    dom.completionPercent.title = "Completion score: time-based completion, not a measure of concentration quality.";
    dom.repIntent.textContent = record.intent;
    dom.repFocus.textContent = formatDuration(record.focusSeconds);
    dom.repClock.textContent = formatDuration(record.elapsedSeconds);
    dom.repBreaks.textContent = `${record.breaks.length} · ${formatDuration(record.breakSeconds)}`;
    dom.reportTopic.value = record.topic || "";
    dom.reportNotes.value = record.notes || "";
    dom.reportSaveState.textContent = "Saved";
    state.reportDirty = false;
    dom.breakBreakdownList.replaceChildren();
    record.breaks.forEach((b,i) => { const li=document.createElement("li"); li.textContent=`Break ${i+1}: ${formatDuration(b.durationSeconds)}`; dom.breakBreakdownList.append(li); });
    dom.breakBreakdownWrapper.classList.toggle("is-hidden", !record.breaks.length);
  }

  function renderSetup() {
    const completed = completedRecords();
    dom.setupCompletedCount.textContent = String(completed.length);
    dom.setupAllCount.textContent = String(state.history.length);
    dom.setupTotalFocus.textContent = formatDuration(completed.reduce((s,r)=>s+r.focusSeconds,0));
    const active = safeRead(ACTIVE_SESSION_KEY, null);
    dom.activeSessionBanner.classList.toggle("is-hidden", !active || Boolean(state.session));
    if (active && !state.session) dom.activeSessionLabel.textContent = `${active.intent} · ${formatClock(active.targetSeconds)} planned`;
  }

  function restoreActiveSession() {
    const saved = safeRead(ACTIVE_SESSION_KEY, null);
    if (!saved || !saved.id || !saved.startedAt || !saved.targetSeconds) return;
    if (saved.tabId && saved.tabId !== tabId) {
      state.readOnly = true;
      dom.activeSessionBanner.classList.remove("is-hidden");
      dom.activeSessionLabel.textContent = `${saved.intent} · active in another tab`;
      return;
    }
    state.session = saved;
    state.session.tabId = tabId;
    if (state.session.currentBreakStartedAt && state.session.hardcore && currentBreakSeconds(state.session) >= HARDCORE_BREAK_LIMIT_SECONDS) {
      finishSession("failed","Hardcore break limit reached.",false); return;
    }
    navigate("timer-screen", true);
    requestWakeLock();
    startTimerLoop(); tick(); showToast("Your active session was restored.");
  }

  function askConfirm(title, message, action, acceptText) {
    dom.confirmTitle.textContent=title; dom.confirmMessage.textContent=message; dom.confirmAccept.textContent=acceptText || "Confirm";
    state.confirmAction=action; dom.confirmDialog.returnValue="";
    if (typeof dom.confirmDialog.showModal === "function") dom.confirmDialog.showModal(); else if (window.confirm(message)) action();
  }

  function getFilteredHistory() {
    const q = dom.historySearch.value.trim().toLocaleLowerCase();
    const from = dom.historyDateFrom.value ? new Date(`${dom.historyDateFrom.value}T00:00:00`) : null;
    const to = dom.historyDateTo.value ? new Date(`${dom.historyDateTo.value}T23:59:59.999`) : null;
    let rows = state.history.filter(r => {
      const text=[r.intent,r.topic,r.notes,r.outcome,r.reason].join(" ").toLocaleLowerCase();
      const d=new Date(r.completedAt);
      return (!q || text.includes(q)) && (!from || d>=from) && (!to || d<=to);
    });
    const sort=dom.historySort.value;
    rows.sort((a,b)=>sort==="oldest" ? Date.parse(a.completedAt)-Date.parse(b.completedAt) : sort==="focus" ? b.focusSeconds-a.focusSeconds : Date.parse(b.completedAt)-Date.parse(a.completedAt));
    return rows;
  }

  function renderHistory() {
    const rows=getFilteredHistory();
    dom.historyTableBody.replaceChildren();
    rows.forEach(r=>{
      const tr=document.createElement("tr");
      const values=[
        formatDate(r.completedAt), r.intent, r.topic || "—", r.notes || "—", formatDuration(r.focusSeconds), formatDuration(r.elapsedSeconds),
        scoreFor(r)==null ? "N/A" : `${scoreFor(r)}%`
      ];
      values.forEach((v,i)=>{const td=document.createElement("td");td.textContent=v;td.dataset.label=["Date","Goal","Topics","Notes","Focus","Elapsed","Completion score"][i];tr.append(td);});
      const out=document.createElement("td");out.dataset.label="Outcome";const pill=document.createElement("span");pill.className=`outcome-pill ${r.outcome==="completed"?"success":r.outcome==="failed"?"failed":""}`;pill.textContent=r.outcome==="completed"?"Completed":r.outcome==="failed"?"Hardcore failed":r.outcome==="incomplete"?"Incomplete":"Ended early";out.append(pill);tr.append(out);
      const actions=document.createElement("td");actions.dataset.label="Actions";actions.className="history-actions-cell";
      const edit=document.createElement("button");edit.className="button button-secondary button-small";edit.type="button";edit.textContent="Edit";edit.addEventListener("click",()=>openEdit(r.id));
      const del=document.createElement("button");del.className="button button-danger-outline button-small";del.type="button";del.textContent="Delete";del.addEventListener("click",()=>deleteSession(r.id));actions.append(edit,del);tr.append(actions);
      dom.historyTableBody.append(tr);
    });
    dom.historyEmpty.classList.toggle("is-visible", rows.length===0);
    dom.historyEmpty.querySelector("h2").textContent = state.history.length && !rows.length ? "No matching sessions" : "No sessions yet";
    dom.historyEmpty.querySelector("p").textContent = state.history.length && !rows.length ? "Try a different search, date range, or sort." : "Completed and incomplete attempts will appear here.";
    dom.historyStartBtn.classList.toggle("is-hidden", Boolean(state.history.length && !rows.length));
    const completed=completedRecords();
    dom.historyCompletedCount.textContent=String(completed.length);
    dom.historyAttemptCount.textContent=String(state.history.length);
    dom.historyTotalFocus.textContent=formatDuration(completed.reduce((s,r)=>s+r.focusSeconds,0));
  }

  function deleteSession(id) {
    const item=state.history.find(r=>r.id===id); if(!item) return;
    state.history=state.history.filter(r=>r.id!==id); saveHistory(); renderHistory(); renderNotes(); renderInsights();
    showUndoToast(`Deleted “${item.intent}”.`,()=>{state.history.push(item);state.history.sort((a,b)=>Date.parse(b.completedAt)-Date.parse(a.completedAt));saveHistory();renderAll();showToast("Session restored.");});
  }

  function showUndoToast(message, undo) {
    clearTimeout(state.toastTimer);
    dom.toast.innerHTML="";
    const text=document.createElement("span");text.textContent=message;
    const b=document.createElement("button");b.type="button";b.textContent="Undo";b.className="toast-action";b.addEventListener("click",()=>{undo();dom.toast.classList.remove("is-visible");});
    dom.toast.append(text,b);dom.toast.classList.add("is-visible");state.toastTimer=setTimeout(()=>dom.toast.classList.remove("is-visible"),5000);
  }

  function openEdit(id) {
    const item=state.history.find(r=>r.id===id); if(!item) return;
    state.editingId=id;dom.editTitle.value=item.topic||"";dom.editNotes.value=item.notes||"";
    if(typeof dom.editDialog.showModal==="function") dom.editDialog.showModal();
  }

  function saveEdit() {
    const item=state.history.find(r=>r.id===state.editingId);if(!item)return;
    item.topic= item.topics=dom.editTitle.value.trim().slice(0,240);
    item.notes= item.studied=dom.editNotes.value.trim().slice(0,4000);
    saveHistory();dom.editDialog.close();renderAll();showToast("Session updated.");
  }

  function saveReportNotes() {
    const item=state.history.find(r=>r.id===state.reportId);if(!item)return;
    item.topic=item.topics=dom.reportTopic.value.trim().slice(0,240);
    item.notes=item.studied=dom.reportNotes.value.trim().slice(0,4000);
    saveHistory();state.reportDirty=false;dom.reportSaveState.textContent=`Saved · ${new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`;renderAll();showToast("Session notes saved.");
  }

  function renderInsights() {
    const completed=completedRecords();
    const totalFocus=completed.reduce((s,r)=>s+r.focusSeconds,0);
    const scores=completed.map(scoreFor).filter(v=>v!=null);
    const avg=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):null;
    const attempts=state.history.length;
    const completionRate=attempts?Math.round(completed.length/attempts*100):0;
    dom.insightsStats.replaceChildren();
    [["Completed",completed.length],["Completion rate",attempts?`${completionRate}%`:"—"],["Focus time",formatDuration(totalFocus)],["Avg completion",avg==null?"—":`${avg}%`]].forEach(([l,v])=>{
      const card=document.createElement("div");card.className="insight-stat";const s=document.createElement("span");s.textContent=l;const strong=document.createElement("strong");strong.textContent=v;card.append(s,strong);dom.insightsStats.append(card);
    });
    dom.insightsSummary.textContent=attempts?`Based on ${attempts} saved attempt${attempts===1?"":"s"}. Incomplete and failed attempts are kept separate from completed totals.`:"Start a session to build your private insights.";
    drawWeeklyChart(completed); drawHeatmap(completed);
    const groups={};completed.forEach(r=>{const h=new Date(r.completedAt).getHours();groups[h]=(groups[h]||0)+r.focusSeconds;});
    const best=Object.entries(groups).sort((a,b)=>b[1]-a[1])[0];dom.bestTime.textContent=best?`${String(Number(best[0])).padStart(2,"0")}:00–${String((Number(best[0])+1)%24).padStart(2,"0")}:00`:"—";
    const goals={};completed.forEach(r=>{goals[r.intent]=(goals[r.intent]||0)+r.focusSeconds;});const bg=Object.entries(goals).sort((a,b)=>b[1]-a[1])[0];dom.bestGoal.textContent=bg?`${bg[0]} · ${formatDuration(bg[1])}`:"—";
    const streaks=calculateStreaks(completed);dom.streakCurrent.textContent=String(streaks.current);dom.streakBest.textContent=String(streaks.best);
  }

  function drawWeeklyChart(records) {
    const c=dom.weeklyChart,ctx=c.getContext("2d");if(!ctx)return;
    const width=Math.max(300,c.clientWidth||700),height=230,dpr=devicePixelRatio||1;c.width=width*dpr;c.height=height*dpr;c.style.height=`${height}px`;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    const styles=getComputedStyle(document.documentElement),accent=styles.getPropertyValue("--accent").trim(),muted=styles.getPropertyValue("--text-muted").trim(),border=styles.getPropertyValue("--border").trim();
    const days=[];for(let i=6;i>=0;i--){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-i);days.push(d);}
    const vals=days.map(d=>records.filter(r=>{const x=new Date(r.completedAt);return x.toDateString()===d.toDateString();}).reduce((s,r)=>s+r.focusSeconds,0));const max=Math.max(3600,...vals);
    ctx.font="12px system-ui,sans-serif";ctx.fillStyle=muted;ctx.strokeStyle=border;ctx.beginPath();ctx.moveTo(28,190);ctx.lineTo(width-16,190);ctx.stroke();
    const gap=12,bw=(width-44-gap*6)/7;vals.forEach((v,i)=>{const bh=Math.max(v?3:0,v/max*145),x=28+i*(bw+gap);ctx.fillStyle=accent;ctx.fillRect(x,190-bh,bw,bh);ctx.fillStyle=muted;ctx.textAlign="center";ctx.fillText(days[i].toLocaleDateString([],{weekday:"short"}),x+bw/2,214);});
    c.setAttribute("aria-label",`Seven day completed focus chart: ${vals.map((v,i)=>`${days[i].toLocaleDateString([],{weekday:"short"})} ${formatDuration(v)}`).join(", ")}`);
  }

  function drawHeatmap(records) {
    const container=dom.heatmap;container.replaceChildren();
    const now=new Date();now.setHours(0,0,0,0);
    const start=new Date(now);start.setDate(start.getDate()-83);
    const byDay={};records.forEach(r=>{const d=new Date(r.completedAt);d.setHours(0,0,0,0);const k=d.toISOString().slice(0,10);byDay[k]=(byDay[k]||0)+r.focusSeconds;});
    const max=Math.max(1,...Object.values(byDay));
    for(let i=0;i<84;i++){const d=new Date(start);d.setDate(start.getDate()+i);const k=d.toISOString().slice(0,10);const v=byDay[k]||0;const cell=document.createElement("span");cell.className="heat-cell";cell.dataset.level=v?String(Math.min(4,Math.ceil(v/max*4))):"0";cell.title=`${d.toLocaleDateString()}: ${formatDuration(v)} completed`;cell.setAttribute("aria-label",cell.title);container.append(cell);}
  }

  function calculateStreaks(records) {
    const dates=[...new Set(records.map(r=>new Date(r.completedAt).toISOString().slice(0,10)))].sort();
    if(!dates.length)return {current:0,best:0};
    let best=1,run=1;for(let i=1;i<dates.length;i++){const a=new Date(`${dates[i-1]}T00:00:00`),b=new Date(`${dates[i]}T00:00:00`);if((b-a)===86400000)run++;else run=1;best=Math.max(best,run);}
    const today=new Date();today.setHours(0,0,0,0);let current=0;let cursor=today;
    for(;;){const k=cursor.toISOString().slice(0,10);if(!dates.includes(k))break;current++;cursor.setDate(cursor.getDate()-1);}
    return {current,best};
  }

  function renderNotes() {
    const q=dom.notesSearch.value.trim().toLocaleLowerCase();
    dom.notesInbox.replaceChildren();dom.notesSessions.replaceChildren();
    state.inbox.filter(n=>n.text.toLocaleLowerCase().includes(q)).forEach(n=>{
      const card=document.createElement("article");card.className="note-card";const p=document.createElement("p");p.textContent=n.text;const meta=document.createElement("small");meta.textContent=`Inbox · ${formatDate(n.createdAt)}`;const b=document.createElement("button");b.className="button button-danger-outline button-small";b.type="button";b.textContent="Delete";b.addEventListener("click",()=>{state.inbox=state.inbox.filter(x=>x.id!==n.id);saveInbox();renderNotes();});card.append(p,meta,b);dom.notesInbox.append(card);
    });
    const notes=state.history.filter(r=>r.notes||r.topic).filter(r=>[r.intent,r.topic,r.notes].join(" ").toLocaleLowerCase().includes(q));
    notes.forEach(r=>{const card=document.createElement("article");card.className="note-card";const h=document.createElement("h3");h.textContent=r.intent;const meta=document.createElement("small");meta.textContent=`${formatDate(r.completedAt)} · ${r.outcome==="completed"?"Completed":"Attempt"}`;const topic=document.createElement("strong");topic.textContent=r.topic||"No topic";const p=document.createElement("p");p.textContent=r.notes||"No notes saved.";card.append(h,meta,topic,p);dom.notesSessions.append(card);});
    if(!state.inbox.length)dom.notesInbox.innerHTML='<p class="empty-inline">No inbox notes. Use Quick capture to save a thought without an active session.</p>';
    if(!notes.length)dom.notesSessions.innerHTML='<p class="empty-inline">No session notes yet.</p>';
  }

  function addInboxNote() {
    const text=dom.noteCaptureInput.value.trim();if(!text)return;
    state.inbox.unshift({id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,text,createdAt:new Date().toISOString()});
    dom.noteCaptureInput.value="";saveInbox();renderNotes();showToast("Note added to your inbox.");
  }

  function csvEscape(value) {
    let text=String(value??"");
    if(/^[\s]*[=+\-@]/.test(text))text="'"+text;
    return `"${text.replace(/"/g,'""')}"`;
  }

  function download(name,data,type) {
    const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function exportCsv() {
    if(!state.history.length){showToast("There are no attempts to export.");return;}
    const header=["Completed At","Goal","Planned","Focus","Elapsed","Breaks","Completion score","Style","Outcome","Reason","Topics","Notes"];
    const rows=state.history.map(r=>[r.completedAt,r.intent,formatDuration(r.targetSeconds),formatDuration(r.focusSeconds),formatDuration(r.elapsedSeconds),formatDuration(r.breakSeconds),scoreFor(r)==null?"":scoreFor(r),r.hardcore?"Hardcore":"Standard",r.outcome,r.reason,r.topic,r.notes]);
    download("locked-in-history.csv","\uFEFF"+[header,...rows].map(row=>row.map(csvEscape).join(",")).join("\r\n"),"text/csv;charset=utf-8");showToast("CSV export prepared.");
  }

  function exportJson() {
    download("locked-in-backup.json",JSON.stringify({schemaVersion:3,exportedAt:new Date().toISOString(),app:"Locked-In",sessions:state.history,notesInbox:state.inbox},null,2),"application/json");showToast("JSON backup prepared.");
  }

  async function importJson(file) {
    if(!file)return;
    if(file.size>MAX_IMPORT_BYTES){showToast("Import rejected: file is larger than 2 MB.");dom.importJsonInput.value="";return;}
    try{
      const parsed=JSON.parse(await file.text());
      const incoming=Array.isArray(parsed)?parsed:parsed?.sessions;
      if(!Array.isArray(incoming)||incoming.length>MAX_HISTORY||incoming.some(r=>!r||typeof r!=="object"||!String(r.intent??r.goal??r.task??"").trim()))throw new Error("schema");
      const normalized=incoming.map(normalizeRecord).filter(Boolean);
      const replace=window.confirm("Import backup: press OK to replace history, or Cancel to merge it with existing sessions.");
      if(replace)state.history=normalized;else{const map=new Map(state.history.map(r=>[r.id,r]));normalized.forEach(r=>map.set(r.id,r));state.history=[...map.values()].sort((a,b)=>Date.parse(b.completedAt)-Date.parse(a.completedAt)).slice(0,MAX_HISTORY);}
      if(Array.isArray(parsed.notesInbox))state.inbox=parsed.notesInbox.map(n=>({id:String(n.id||`${Date.now()}-${Math.random()}`),text:String(n.text||"").slice(0,2000),createdAt:n.createdAt||new Date().toISOString()})).filter(n=>n.text.trim()).slice(0,200);
      saveHistory();saveInbox();renderAll();showToast(`Imported ${normalized.length} session${normalized.length===1?"":"s"}.`);
    }catch(_){showToast("Import rejected. Use a valid Locked-In JSON backup.");}
    finally{dom.importJsonInput.value="";}
  }

  function clearHistory() {
    if(!state.history.length){showToast("History is already empty.");return;}
    askConfirm("Clear all history?","This removes saved attempts from this browser. Export a backup first if you want to keep them.",()=>{state.history=[];saveHistory();renderAll();showToast("History cleared.");},"Clear history");
  }

  function renderAll(){renderSetup();renderHistory();renderInsights();renderNotes();}

  function handleKeyboard(e) {
    const target=e.target, tag=target?.tagName?.toLowerCase();
    const typing=["input","textarea","select"].includes(tag)||target?.isContentEditable;
    if(e.key==="Escape"){
      if(dom.themePopover.classList.contains("is-open")){dom.themePopover.classList.remove("is-open");dom.themeButton.setAttribute("aria-expanded","false");return;}
      if(dom.menuToggle.getAttribute("aria-expanded")==="true"){closeMenu();return;}
      if(dom.shortDialog.open){dom.shortDialog.close();return;}
      if(dom.editDialog.open){dom.editDialog.close();return;}
      if(dom.confirmDialog.open){dom.confirmDialog.close("cancel");return;}
    }
    if(typing||e.altKey||e.ctrlKey||e.metaKey)return;
    if(!state.session||state.readOnly||!dom.keyboardShortcuts.checked)return;
    if(e.key.toLowerCase()==="b"){e.preventDefault();toggleBreak();}
    if(e.key.toLowerCase()==="s"){e.preventDefault();stopSession();}
  }

  function bindEvents() {
    dom.menuToggle.addEventListener("click",toggleMenu);
    dom.navLinks.forEach(link=>link.addEventListener("click",()=>navigate(link.dataset.screen)));
    dom.setupForm.addEventListener("submit",startSession);
    dom.durationPreset.addEventListener("change",()=>{const custom=dom.durationPreset.value==="custom";dom.customDuration.classList.toggle("is-hidden",!custom);dom.customDuration.setAttribute("aria-hidden",String(!custom));if(custom)dom.customHours.focus();});
    dom.resumeSessionBtn.addEventListener("click",()=>{const active=safeRead(ACTIVE_SESSION_KEY,null);if(active&&active.tabId===tabId){state.session=active;navigate("timer-screen");startTimerLoop();}else showToast("The active session belongs to another tab.");});
    dom.timerBackBtn.addEventListener("click",()=>navigate("setup-screen"));
    dom.breakBtn.addEventListener("click",toggleBreak);dom.stopBtn.addEventListener("click",stopSession);
    dom.newSessionBtn.addEventListener("click",()=>{dom.taskIntent.value="";navigate("setup-screen");dom.taskIntent.focus();});
    dom.reportHistoryBtn.addEventListener("click",()=>navigate("history-screen"));dom.historyStartBtn.addEventListener("click",()=>navigate("setup-screen"));
    [dom.historySearch,dom.historyDateFrom,dom.historyDateTo,dom.historySort].forEach(el=>el.addEventListener("input",renderHistory));
    dom.exportCsvBtn.addEventListener("click",exportCsv);dom.exportJsonBtn.addEventListener("click",exportJson);dom.importJsonInput.addEventListener("change",()=>importJson(dom.importJsonInput.files?.[0]));dom.clearHistoryBtn.addEventListener("click",clearHistory);
    dom.reportTopic.addEventListener("input",()=>{state.reportDirty=true;dom.reportSaveState.textContent="Unsaved changes";});
    dom.reportNotes.addEventListener("input",()=>{state.reportDirty=true;dom.reportSaveState.textContent="Unsaved changes";});
    document.querySelector("#report-save-btn").addEventListener("click",saveReportNotes);
    dom.noteCaptureForm.addEventListener("submit",e=>{e.preventDefault();addInboxNote();});dom.notesSearch.addEventListener("input",renderNotes);
    dom.shortSave.addEventListener("click",()=>{dom.shortDialog.close();askConfirm("Save short attempt?","Save it as an incomplete attempt. It will not count as completed.",()=>finishSession("ended","Ended early.",false),"Save attempt");});
    dom.shortDiscard.addEventListener("click",()=>{dom.shortDialog.close();finishSession("ended","Discarded because it was under one minute.",true);});
    dom.confirmDialog.addEventListener("close",()=>{const a=state.confirmAction;state.confirmAction=null;if(dom.confirmDialog.returnValue==="confirm"&&a)a();});
    dom.editCancel.addEventListener("click",()=>dom.editDialog.close());dom.editDelete.addEventListener("click",()=>{const id=state.editingId;dom.editDialog.close();if(id)deleteSession(id);});dom.editForm.addEventListener("submit",e=>{e.preventDefault();saveEdit();});
    document.addEventListener("keydown",handleKeyboard);
    window.addEventListener("popstate",()=>navigate(screenMap[location.hash.slice(1)]||"setup-screen",true));
    window.addEventListener("hashchange",()=>navigate(screenMap[location.hash.slice(1)]||"setup-screen",true));
    window.addEventListener("resize",()=>{if(innerWidth>760)closeMenu();});
    document.addEventListener("visibilitychange",()=>{if(!document.hidden&&state.session){requestWakeLock();tick();}});
    window.addEventListener("beforeunload",(e)=>{if(state.reportDirty){e.preventDefault();e.returnValue="";}if(state.session){safeWrite(ACTIVE_SESSION_KEY,state.session);}});
    dom.backToTop.addEventListener("click",()=>scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion:reduce)").matches?"auto":"smooth"}));
    window.addEventListener("scroll",()=>{const show=scrollY>500;dom.backToTop.classList.toggle("is-visible",show);dom.backToTop.tabIndex=show?0:-1;},{passive:true});
  }

  function init() {
    loadData();initTheme();bindEvents();initSync();
    try{dom.keyboardShortcuts.checked=localStorage.getItem("locked_in_keyboard_shortcuts")!=="false";}catch(_){}
    dom.keyboardShortcuts.addEventListener("change",()=>{try{localStorage.setItem("locked_in_keyboard_shortcuts",String(dom.keyboardShortcuts.checked));}catch(_){}});
    dom.currentYear.textContent=new Date().getFullYear();
    const initial=screenMap[location.hash.slice(1)]||"setup-screen";
    navigate(initial,true);
    renderAll();
    restoreActiveSession();
    if(!state.session) setTimeout(()=>dom.taskIntent.focus(),80);
    try{localStorage.setItem("locked_in_app_version","3.0.0");}catch(_){}
  }

  init();
})();