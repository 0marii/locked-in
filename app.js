/* Locked-In — privacy-first focus timer. No build step, no dependencies. */
(() => {
  "use strict";

  const HISTORY_KEY = "locked_in_history_v2";
  const LEGACY_HISTORY_KEYS = ["focusforge_history_v1", "locked-in-history"];
  const ACTIVE_SESSION_KEY = "locked_in_active_session_v2";
  const THEME_KEY = "locked_in_theme";
  const NOTES_INBOX_KEY = "locked_in_notes_inbox_v1";
  const PREFS_KEY = "locked_in_prefs_v1";
  const RECENT_GOALS_KEY = "locked_in_recent_goals_v1";
  const FOCUS_GOALS_KEY = "locked_in_focus_goals_v1";
  const MAX_HISTORY = 1000;
  const BREAK_REMINDER_MS = 5 * 60 * 1000;
  const POMODORO_FOCUS_SECONDS = 25 * 60;
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
    sessionStyle: $("session-style"), recentGoals: $("recent-goals"), goalTag: $("goal-tag"), goalTagCustom: $("goal-tag-custom"),
    prefNotifyEnd: $("pref-notify-end"), prefNotifyBreak: $("pref-notify-break"), prefPomodoro: $("pref-pomodoro"), prefChime: $("pref-chime"),
    setupDailyProgressLabel: $("setup-daily-progress-label"), setupDailyProgressBar: $("setup-daily-progress-bar"),
    setupWeeklyProgressHint: $("setup-weekly-progress-hint"), setupEditGoalsBtn: $("setup-edit-goals-btn"),
    goalDailySlider: $("goal-daily-slider"), goalDailyHours: $("goal-daily-hours"), goalDailyMins: $("goal-daily-mins"), goalDailyDisplay: $("goal-daily-display"),
    goalWeeklySlider: $("goal-weekly-slider"), goalWeeklyHours: $("goal-weekly-hours"), goalWeeklyMins: $("goal-weekly-mins"), goalWeeklyDisplay: $("goal-weekly-display"),
    insightsDailyProgressBar: $("insights-daily-progress-bar"), insightsDailyProgressLabel: $("insights-daily-progress-label"),
    insightsWeeklyProgressBar: $("insights-weekly-progress-bar"), insightsWeeklyProgressLabel: $("insights-weekly-progress-label"),
    saveFocusGoalsBtn: $("save-focus-goals-btn"), shareWeekCardBtn: $("share-week-card-btn"), bestTag: $("best-tag"),
    historyTagFilter: $("history-tag-filter"),
    setupCompletedCount: $("setup-completed-count"), setupAllCount: $("setup-all-count"), setupTotalFocus: $("setup-total-focus"),
    activeSessionBanner: $("active-session-banner"), activeSessionLabel: $("active-session-label"), resumeSessionBtn: $("resume-session-btn"),
    floatingTimer: $("floating-timer"), floatingTimerBadge: $("floating-timer-badge"), floatingTimerStatus: $("floating-timer-status"),
    floatingTimerIntent: $("floating-timer-intent"), floatingTimerClock: $("floating-timer-clock"), floatingTimerReturn: $("floating-timer-return"),
    timerBackBtn: $("timer-back-btn"), statusBadge: $("status-badge"), timerHeading: $("timer-heading"), timerSubtitle: $("timer-subtitle"),
    timeDisplay: $("time-display"), timerProgress: $("timer-progress"), timerProgressBar: $("timer-progress-bar"),
    plannedTime: $("planned-time"), breakTime: $("break-time"), elapsedTime: $("elapsed-time"),
    expectedEndTime: $("expected-end-time"), expectedEndScheduled: $("expected-end-scheduled"),
    timerStatusMessage: $("timer-status-message"), breakBtn: $("break-btn"), stopBtn: $("stop-btn"), keyboardShortcuts: $("keyboard-shortcuts"),
    stickyNotes: $("sticky-notes"), stickyNotesToggle: $("sticky-notes-toggle"), stickyNotesClose: $("sticky-notes-close"),
    stickyNotesInput: $("sticky-notes-input"), stickyNotesSave: $("sticky-notes-save"), stickyNotesState: $("sticky-notes-state"),
    stickyNotesList: $("sticky-notes-list"),
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
    insightsStats: $("insights-stats"), insightsSummary: $("insights-summary"), weeklyChart: $("weekly-chart"), heatmap: $("heatmap"), heatmapText: $("heatmap-text"),
    bestTime: $("best-time"), bestGoal: $("best-goal"), streakCurrent: $("streak-current"), streakBest: $("streak-best"),
    notesInbox: $("notes-inbox"), notesSessions: $("notes-sessions"), notesSearch: $("notes-search"), noteCaptureForm: $("note-capture-form"), noteCaptureInput: $("note-capture-input"),
    toast: $("toast"), confirmDialog: $("confirm-dialog"), confirmTitle: $("confirm-title"), confirmMessage: $("confirm-message"), confirmAccept: $("confirm-accept"),
    shortDialog: $("short-dialog"), shortSave: $("short-save"), shortDiscard: $("short-discard"),
    editDialog: $("edit-session-dialog"), editForm: $("edit-session-form"), editTitle: $("edit-session-title"),
    editNotesSummary: $("edit-session-notes-summary"), editOpenNotes: $("edit-session-open-notes"),
    editDelete: $("edit-session-delete"), editCancel: $("edit-session-cancel"),
    editNoteDialog: $("edit-note-dialog"), editNoteForm: $("edit-note-form"), editNoteText: $("edit-note-text"),
    editNoteContext: $("edit-note-context"), editNoteDelete: $("edit-note-delete"), editNoteCancel: $("edit-note-cancel"),
    viewNotesDialog: $("view-session-notes-dialog"), viewNotesHeading: $("view-session-notes-heading"),
    viewNotesMeta: $("view-session-notes-meta"), viewNotesList: $("view-session-notes-list"),
    viewNoteInput: $("view-session-note-input"), viewNoteAdd: $("view-session-note-add"),
    viewNotesOpenTab: $("view-session-notes-open-tab"), viewNotesClose: $("view-session-notes-close"),
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
    editingNote: null,
    viewingNotesId: null,
    reportId: null,
    lastPersistedAt: 0,
    channel: null,
    readOnly: false,
    reportDirty: false,
    stickyDirty: false,
    stickyOpen: false,
    wakeLock: null,
    prefs: { notifyEnd: false, notifyBreak: false, pomodoro: false, chime: "soft" },
    focusGoals: { dailyMinutes: 120, weeklyMinutes: 600 },
    recentGoals: [],
    breakReminderTimer: null,
    pomodoroNotifiedBucket: -1
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
      noteItems: Array.isArray(record.noteItems)
        ? record.noteItems.map((n) => ({
            id: String(n?.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`),
            text: String(n?.text || "").trim().slice(0, 2000),
            createdAt: n?.createdAt || new Date().toISOString()
          })).filter((n) => n.text).slice(0, 100)
        : undefined,
      score: record.score == null ? null : Math.max(0, Math.min(100, Math.floor(Number(record.score) || 0))),
      scoreVersion: 2,
      tag: String(record.tag || "").trim().slice(0, 24)
    };
  }

  function ensureNoteItems(session) {
    if (!session) return [];
    if (!Array.isArray(session.noteItems)) {
      const legacy = String(session.notes || "").trim();
      session.noteItems = legacy
        ? [{ id: `legacy-${session.id || Date.now()}`, text: legacy.slice(0, 2000), createdAt: new Date(session.startedAt || Date.now()).toISOString() }]
        : [];
    }
    return session.noteItems;
  }

  function composeNotesText(noteItems) {
    return (Array.isArray(noteItems) ? noteItems : [])
      .map((n) => String(n?.text || "").trim())
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 4000);
  }

  function applyNoteItems(record, items) {
    if (!record) return;
    const next = (Array.isArray(items) ? items : [])
      .map((n) => ({
        id: String(n?.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`),
        text: String(n?.text || "").trim().slice(0, 2000),
        createdAt: n?.createdAt || new Date().toISOString()
      }))
      .filter((n) => n.text)
      .slice(0, 100);
    record.noteItems = next;
    record.notes = record.studied = composeNotesText(next);
  }

  function noteItemsFromComposedText(record, text, previousItems) {
    const trimmed = String(text || "").trim().slice(0, 4000);
    const prev = Array.isArray(previousItems) ? previousItems : sessionNoteItems(record);
    const prevText = composeNotesText(prev);
    if (trimmed === prevText) return prev;
    if (!trimmed) return [];
    if (prev.length <= 1) {
      const base = prev[0] || { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, createdAt: record.completedAt || new Date().toISOString() };
      return [{ ...base, text: trimmed.slice(0, 2000) }];
    }
    return trimmed.split(/\n\n+/).map((part, i) => ({
      id: prev[i]?.id || `${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
      text: part.trim().slice(0, 2000),
      createdAt: prev[i]?.createdAt || record.completedAt || new Date().toISOString()
    })).filter((n) => n.text);
  }

  function refreshNotesSurfaces() {
    renderNotes();
    renderHistory();
    if (state.viewingNotesId) renderSessionNotesViewer();
    if (state.editingId && dom.editNotesSummary) {
      const item = state.history.find((r) => r.id === state.editingId);
      if (item) updateEditNotesSummary(item);
    }
  }

  function persistSessionNotes() {
    if (!state.session) return false;
    state.session.notes = composeNotesText(ensureNoteItems(state.session));
    dom.reportNotes.value = state.session.notes;
    if (!safeWrite(ACTIVE_SESSION_KEY, state.session)) return false;
    state.lastPersistedAt = Date.now();
    return true;
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
    loadPrefs();
    loadFocusGoals();
    loadRecentGoals();
  }

  function loadPrefs() {
    const p = safeRead(PREFS_KEY, null);
    const legacyEnd = (() => { try { return localStorage.getItem("locked_in_notify_end"); } catch (_) { return null; } })();
    const legacyBreak = (() => { try { return localStorage.getItem("locked_in_notify_break"); } catch (_) { return null; } })();
    const legacyChime = (() => { try { return localStorage.getItem("locked_in_chime_mode"); } catch (_) { return null; } })();
    state.prefs = {
      notifyEnd: Boolean(p?.notifyEnd ?? (legacyEnd === "true")),
      notifyBreak: Boolean(p?.notifyBreak ?? (legacyBreak === "true")),
      pomodoro: Boolean(p?.pomodoro),
      chime: ["off", "soft", "full"].includes(p?.chime || legacyChime) ? (p?.chime || legacyChime) : "soft"
    };
  }

  function savePrefs() {
    return safeWrite(PREFS_KEY, state.prefs);
  }

  function applyPrefsToDom() {
    if (dom.prefNotifyEnd) dom.prefNotifyEnd.checked = state.prefs.notifyEnd;
    if (dom.prefNotifyBreak) dom.prefNotifyBreak.checked = state.prefs.notifyBreak;
    if (dom.prefPomodoro) dom.prefPomodoro.checked = state.prefs.pomodoro;
    if (dom.prefChime) dom.prefChime.value = state.prefs.chime;
  }

  const GOAL_LIMITS = {
    daily: { min: 15, max: 1440, sliderMax: 720, step: 15 },
    weekly: { min: 30, max: 10080, sliderMax: 2520, step: 30 }
  };

  function clampGoalMinutes(kind, minutes) {
    const lim = GOAL_LIMITS[kind] || GOAL_LIMITS.daily;
    const raw = Math.floor(Number(minutes) || 0);
    return Math.max(lim.min, Math.min(lim.max, raw));
  }

  function formatGoalClock(totalMinutes) {
    const mins = Math.max(0, Math.floor(Number(totalMinutes) || 0));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (!h) return `${m}m`;
    return `${h}h ${String(m).padStart(2, "0")}m`;
  }

  function loadFocusGoals() {
    const g = safeRead(FOCUS_GOALS_KEY, null);
    state.focusGoals = {
      dailyMinutes: clampGoalMinutes("daily", g?.dailyMinutes ?? 120),
      weeklyMinutes: clampGoalMinutes("weekly", g?.weeklyMinutes ?? 600)
    };
  }

  function readGoalMinutesFromDom(kind) {
    const hoursEl = kind === "daily" ? dom.goalDailyHours : dom.goalWeeklyHours;
    const minsEl = kind === "daily" ? dom.goalDailyMins : dom.goalWeeklyMins;
    const sliderEl = kind === "daily" ? dom.goalDailySlider : dom.goalWeeklySlider;
    const lim = GOAL_LIMITS[kind];
    let hours = Math.floor(Number(hoursEl?.value));
    let mins = Math.floor(Number(minsEl?.value));
    if (!Number.isFinite(hours)) hours = 0;
    if (!Number.isFinite(mins)) mins = 0;
    hours = Math.max(0, Math.min(kind === "daily" ? 23 : 168, hours));
    mins = Math.max(0, Math.min(59, mins));
    let total = hours * 60 + mins;
    if (total < lim.min && sliderEl) total = Number(sliderEl.value) || lim.min;
    return clampGoalMinutes(kind, total);
  }

  function syncGoalEditor(kind, totalMinutes) {
    const lim = GOAL_LIMITS[kind];
    const total = clampGoalMinutes(kind, totalMinutes);
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    const hoursEl = kind === "daily" ? dom.goalDailyHours : dom.goalWeeklyHours;
    const minsEl = kind === "daily" ? dom.goalDailyMins : dom.goalWeeklyMins;
    const sliderEl = kind === "daily" ? dom.goalDailySlider : dom.goalWeeklySlider;
    const displayEl = kind === "daily" ? dom.goalDailyDisplay : dom.goalWeeklyDisplay;
    if (hoursEl) hoursEl.value = String(hours);
    if (minsEl) minsEl.value = String(mins);
    if (sliderEl) {
      const sliderValue = Math.min(lim.sliderMax, Math.max(lim.min, total));
      sliderEl.value = String(sliderValue);
      const fill = ((sliderValue - lim.min) / (lim.sliderMax - lim.min)) * 100;
      sliderEl.style.setProperty("--goal-fill", `${fill}%`);
      sliderEl.setAttribute("aria-valuetext", formatGoalClock(total));
    }
    if (displayEl) displayEl.textContent = formatGoalClock(total);
    return total;
  }

  function draftFocusGoalsFromDom() {
    return {
      dailyMinutes: syncGoalEditor("daily", readGoalMinutesFromDom("daily")),
      weeklyMinutes: syncGoalEditor("weekly", readGoalMinutesFromDom("weekly"))
    };
  }

  function saveFocusGoalsFromDom() {
    const next = draftFocusGoalsFromDom();
    state.focusGoals = next;
    if (!safeWrite(FOCUS_GOALS_KEY, state.focusGoals)) {
      showToast("Could not save focus goals — browser storage unavailable.");
      return false;
    }
    renderFocusGoals();
    showToast("Focus goals saved.");
    return true;
  }

  function loadRecentGoals() {
    const raw = safeRead(RECENT_GOALS_KEY, []);
    state.recentGoals = Array.isArray(raw) ? raw.map((g) => ({
      intent: String(g?.intent || "").trim().slice(0, 120),
      durationPreset: String(g?.durationPreset || "45"),
      customSeconds: Math.max(0, Math.floor(Number(g?.customSeconds) || 0)),
      style: g?.style === "hardcore" ? "hardcore" : "standard",
      tag: String(g?.tag || "").trim().slice(0, 24)
    })).filter((g) => g.intent.length >= 2).slice(0, 5) : [];
  }

  function rememberRecentGoal(entry) {
    const next = [
      entry,
      ...state.recentGoals.filter((g) => g.intent.toLocaleLowerCase() !== entry.intent.toLocaleLowerCase())
    ].slice(0, 5);
    state.recentGoals = next;
    safeWrite(RECENT_GOALS_KEY, next);
  }

  function currentTagValue() {
    const selected = String(dom.goalTag?.value || "").trim();
    if (selected === "Other") {
      return String(dom.goalTagCustom?.value || "").trim().slice(0, 24);
    }
    return selected.slice(0, 24);
  }

  function syncTagCustomVisibility() {
    const other = dom.goalTag?.value === "Other";
    if (!dom.goalTagCustom) return;
    dom.goalTagCustom.classList.toggle("is-hidden", !other);
    dom.goalTagCustom.setAttribute("aria-hidden", String(!other));
    if (other) dom.goalTagCustom.focus();
  }

  function notify(title, body) {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    try {
      new Notification(title, { body, icon: "./icon-192.png", badge: "./icon-192.png", silent: false });
    } catch (_) {}
  }

  function clearBreakReminder() {
    if (state.breakReminderTimer) {
      clearTimeout(state.breakReminderTimer);
      state.breakReminderTimer = null;
    }
  }

  function scheduleBreakReminder() {
    clearBreakReminder();
    if (!state.prefs.notifyBreak || !("Notification" in window) || Notification.permission !== "granted") return;
    state.breakReminderTimer = setTimeout(() => {
      state.breakReminderTimer = null;
      if (!state.session?.currentBreakStartedAt) return;
      notify("Still on break", "You’ve been on break for 5 minutes. Resume when you’re ready.");
    }, BREAK_REMINDER_MS);
  }

  function startOfWeek(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - day);
    return d;
  }

  function completedFocusInRange(start, end) {
    return completedRecords().reduce((sum, r) => {
      const t = Date.parse(r.completedAt);
      if (!Number.isFinite(t) || t < start.getTime() || t > end.getTime()) return sum;
      return sum + Math.max(0, r.focusSeconds || 0);
    }, 0);
  }

  function focusProgress() {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart); todayEnd.setHours(23, 59, 59, 999);
    const weekStart = startOfWeek(now);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23, 59, 59, 999);
    return {
      dailySeconds: completedFocusInRange(todayStart, todayEnd),
      weeklySeconds: completedFocusInRange(weekStart, weekEnd),
      dailyGoal: state.focusGoals.dailyMinutes * 60,
      weeklyGoal: state.focusGoals.weeklyMinutes * 60
    };
  }

  function renderFocusGoals() {
    const p = focusProgress();
    const dailyPct = Math.min(100, p.dailyGoal ? (p.dailySeconds / p.dailyGoal) * 100 : 0);
    const weeklyPct = Math.min(100, p.weeklyGoal ? (p.weeklySeconds / p.weeklyGoal) * 100 : 0);
    const dailyLabel = `${formatDuration(p.dailySeconds)} / ${formatDuration(p.dailyGoal)}`;
    const weeklyLabel = `${formatDuration(p.weeklySeconds)} / ${formatDuration(p.weeklyGoal)}`;
    if (dom.setupDailyProgressLabel) dom.setupDailyProgressLabel.textContent = dailyLabel;
    if (dom.setupDailyProgressBar) dom.setupDailyProgressBar.style.width = `${dailyPct}%`;
    if (dom.setupWeeklyProgressHint) dom.setupWeeklyProgressHint.textContent = `This week: ${weeklyLabel}`;
    syncGoalEditor("daily", state.focusGoals.dailyMinutes);
    syncGoalEditor("weekly", state.focusGoals.weeklyMinutes);
    if (dom.insightsDailyProgressBar) dom.insightsDailyProgressBar.style.width = `${dailyPct}%`;
    if (dom.insightsDailyProgressLabel) dom.insightsDailyProgressLabel.textContent = `${dailyLabel} today`;
    if (dom.insightsWeeklyProgressBar) dom.insightsWeeklyProgressBar.style.width = `${weeklyPct}%`;
    if (dom.insightsWeeklyProgressLabel) dom.insightsWeeklyProgressLabel.textContent = `${weeklyLabel} this week`;
  }

  function renderRecentGoals() {
    if (!dom.recentGoals) return;
    dom.recentGoals.replaceChildren();
    const empty = !state.recentGoals.length;
    dom.recentGoals.classList.toggle("is-hidden", empty);
    if (empty) return;
    state.recentGoals.forEach((goal) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "recent-goal-chip";
      const mins = goal.durationPreset === "custom"
        ? Math.max(1, Math.round((goal.customSeconds || 0) / 60))
        : Number(goal.durationPreset) || 45;
      const title = document.createElement("span");
      title.textContent = goal.intent;
      const meta = document.createElement("small");
      meta.textContent = `${mins}m · ${goal.style === "hardcore" ? "Hardcore" : "Standard"}${goal.tag ? ` · ${goal.tag}` : ""}`;
      btn.append(title, meta);
      btn.addEventListener("click", () => applyRecentGoal(goal));
      dom.recentGoals.append(btn);
    });
  }

  function applyRecentGoal(goal) {
    if (!goal) return;
    dom.taskIntent.value = goal.intent;
    if (goal.durationPreset === "custom" && goal.customSeconds >= 60) {
      dom.durationPreset.value = "custom";
      dom.customDuration.classList.remove("is-hidden");
      dom.customDuration.setAttribute("aria-hidden", "false");
      const totalMin = Math.floor(goal.customSeconds / 60);
      dom.customHours.value = String(Math.floor(totalMin / 60));
      dom.customMinutes.value = String(totalMin % 60);
    } else {
      const preset = ["25", "45", "60", "90"].includes(String(goal.durationPreset)) ? String(goal.durationPreset) : "45";
      dom.durationPreset.value = preset;
      dom.customDuration.classList.add("is-hidden");
      dom.customDuration.setAttribute("aria-hidden", "true");
    }
    if (dom.sessionStyle) dom.sessionStyle.value = goal.style === "hardcore" ? "hardcore" : "standard";
    if (dom.goalTag) {
      const known = ["Study", "Code", "Writing"];
      if (!goal.tag) dom.goalTag.value = "";
      else if (known.includes(goal.tag)) dom.goalTag.value = goal.tag;
      else {
        dom.goalTag.value = "Other";
        if (dom.goalTagCustom) dom.goalTagCustom.value = goal.tag;
      }
      syncTagCustomVisibility();
    }
    dom.taskIntent.focus();
    showToast("Goal loaded — adjust if needed, then start.");
  }

  function populateHistoryTagFilter() {
    if (!dom.historyTagFilter) return;
    const current = dom.historyTagFilter.value;
    const tags = [...new Set(state.history.map((r) => r.tag).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    dom.historyTagFilter.replaceChildren();
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "All tags";
    dom.historyTagFilter.append(all);
    tags.forEach((tag) => {
      const opt = document.createElement("option");
      opt.value = tag;
      opt.textContent = tag;
      dom.historyTagFilter.append(opt);
    });
    if (tags.includes(current)) dom.historyTagFilter.value = current;
  }

  function downloadWeekCard() {
    const completed = completedRecords();
    const p = focusProgress();
    const streaks = calculateStreaks(completed);
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 630;
    const ctx = canvas.getContext("2d");
    if (!ctx) { showToast("Could not create share card."); return; }
    const styles = getComputedStyle(document.documentElement);
    const bg = styles.getPropertyValue("--bg").trim() || "#101310";
    const accent = styles.getPropertyValue("--accent").trim() || "#b7f36b";
    const text = styles.getPropertyValue("--text").trim() || "#f2f4ed";
    const muted = styles.getPropertyValue("--text-muted").trim() || "#a0aa9e";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1200, 630);
    ctx.fillStyle = accent;
    ctx.font = "700 28px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("Locked-In", 72, 96);
    ctx.fillStyle = text;
    ctx.font = "700 64px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("This week’s focus", 72, 190);
    ctx.fillStyle = accent;
    ctx.font = "700 96px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(formatDuration(p.weeklySeconds), 72, 320);
    ctx.fillStyle = muted;
    ctx.font = "500 28px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(`Goal ${formatDuration(p.weeklyGoal)} · Streak ${streaks.current} day${streaks.current === 1 ? "" : "s"}`, 72, 390);
    ctx.fillText(`${completed.length} completed session${completed.length === 1 ? "" : "s"}`, 72, 440);
    ctx.fillStyle = muted;
    ctx.font = "500 22px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("Private · stays on this device", 72, 560);
    canvas.toBlob((blob) => {
      if (!blob) { showToast("Could not export week card."); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `locked-in-week-${localDayKey(new Date())}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      showToast("Week card saved.");
    }, "image/png");
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

  function proceedNavigate(id, replace = false) {
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
    syncStickyNotesUi();
    syncFloatingTimer();
    if (id !== "timer-screen") safeWrite("locked_in_last_screen", id);
    const title = { "setup-screen": "Locked-In — Focus Timer", "timer-screen": "Focus session · Locked-In", "report-screen": "Session report · Locked-In", "history-screen": "History · Locked-In", "insights-screen": "Insights · Locked-In", "notes-screen": "Notes · Locked-In" }[id];
    document.title = title || "Locked-In";
    const heading = document.querySelector(`#${id} h1`);
    if (heading) {
      heading.tabIndex = -1;
      try { heading.focus({ preventScroll: true, focusVisible: false }); }
      catch (_) { heading.focus({ preventScroll: true }); }
    }
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  function navigate(id, replace = false) {
    if (!validScreen(id)) id = "setup-screen";
    if (state.reportDirty && state.activeScreen === "report-screen" && id !== "report-screen") {
      const pendingId = id;
      const reportUrl = `${location.pathname}${location.search}#report`;
      if (location.hash !== "#report") history.replaceState(null, "", reportUrl);
      if (dom.confirmDialog.open) return;
      askConfirm(
        "Discard unsaved notes?",
        "You have unsaved report notes. Leave without saving?",
        () => {
          state.reportDirty = false;
          proceedNavigate(pendingId, replace);
        },
        "Discard"
      );
      return;
    }
    proceedNavigate(id, replace);
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
      button.tabIndex = active ? 0 : -1;
    });
    if (persist) { try { localStorage.setItem(THEME_KEY, chosen); } catch (_) {} }
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg || "#101310");
    if (state.activeScreen === "insights-screen") renderInsights();
  }

  function closeThemePopover() {
    dom.themePopover.classList.remove("is-open");
    dom.themeButton.setAttribute("aria-expanded", "false");
  }

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (_) {}
    const system = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    setTheme(saved || system, false);
    const themeButtons = [...dom.themePopover.querySelectorAll("[data-theme]")];
    const syncThemeTabStops = () => {
      themeButtons.forEach((button) => {
        const selected = button.getAttribute("aria-checked") === "true";
        button.tabIndex = selected ? 0 : -1;
      });
    };
    syncThemeTabStops();
    dom.themeButton.addEventListener("click", () => {
      const open = dom.themePopover.classList.toggle("is-open");
      dom.themeButton.setAttribute("aria-expanded", String(open));
      if (open) {
        syncThemeTabStops();
        (themeButtons.find((b) => b.getAttribute("aria-checked") === "true") || themeButtons[0])?.focus();
      }
    });
    themeButtons.forEach((b) => b.addEventListener("click", () => {
      setTheme(b.dataset.theme); closeThemePopover(); dom.themeButton.focus();
    }));
    dom.themePopover.addEventListener("keydown", (e) => {
      if (!dom.themePopover.classList.contains("is-open")) return;
      const current = themeButtons.indexOf(document.activeElement);
      if (current < 0) return;
      let next = current;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); next = (current + 1) % themeButtons.length; }
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); next = (current - 1 + themeButtons.length) % themeButtons.length; }
      else if (e.key === "Home") { e.preventDefault(); next = 0; }
      else if (e.key === "End") { e.preventDefault(); next = themeButtons.length - 1; }
      else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setTheme(themeButtons[current].dataset.theme);
        closeThemePopover();
        dom.themeButton.focus();
        return;
      } else return;
      setTheme(themeButtons[next].dataset.theme);
      syncThemeTabStops();
      themeButtons[next].focus();
    });
    document.addEventListener("click", (e) => {
      if (!dom.themePopover.contains(e.target) && !dom.themeButton.contains(e.target)) closeThemePopover();
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

  function localDayKey(value) {
    const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function completedRecords() {
    return state.history.filter(r => r.outcome === "completed");
  }

  function scoreFor(record) {
    if (record.scoreVersion === 2) return record.score;
    if (!record.targetSeconds) return null;
    return record.focusSeconds / record.targetSeconds >= .7 ? Math.round(record.focusSeconds / record.targetSeconds * 100) : null;
  }

  function scoreBreakdown(record) {
    const planned = Math.max(1, Number(record.targetSeconds) || 0);
    const focus = Math.max(0, Number(record.focusSeconds) || 0);
    const breaks = Math.max(0, Number(record.breakSeconds) || 0);
    const breakCount = Array.isArray(record.breaks) ? record.breaks.length : 0;
    const completionRatio = Math.min(focus / planned, 1);
    const completionPct = Math.round(completionRatio * 100);
    const breakPenalty = Math.min(.8 * (breaks / planned) * 100, 60);
    const countPenalty = Math.min(Math.max(breakCount - 2, 0) * 2, 10);
    const raw = Math.max(0, Math.round(completionPct - breakPenalty - countPenalty));
    return { planned, focus, breaks, breakCount, completionPct, breakPenalty, countPenalty, raw };
  }

  function explainScore(record) {
    const score = scoreFor(record);
    const b = scoreBreakdown(record);
    if (record.outcome === "failed" || record.hardcoreFailed) {
      return "No score — Hardcore failed. Total break time reached 15:00 or more.";
    }
    if (score == null) {
      return `No score (N/A). Focused ${formatDuration(b.focus)} of ${formatDuration(b.planned)} planned (${b.completionPct}%). A score requires at least 70% of planned focus time.`;
    }
    return [
      `Completion score ${score}%`,
      `Focused ${formatDuration(b.focus)} / planned ${formatDuration(b.planned)} = ${b.completionPct}%`,
      `Break time penalty −${Math.round(b.breakPenalty)} (from ${formatDuration(b.breaks)} breaks)`,
      `Extra-break penalty −${b.countPenalty} (${b.breakCount} break${b.breakCount === 1 ? "" : "s"}; first 2 free)`,
      "Formula: focused÷planned×100 − break penalties. Not a measure of concentration quality."
    ].join(" · ");
  }

  function explainOutcome(record) {
    const b = scoreBreakdown(record);
    const reason = String(record.reason || "").trim();
    if (record.outcome === "completed") {
      return `Completed — focused ${b.completionPct}% of the plan (needs ≥70%).${reason ? ` ${reason}` : ""}`;
    }
    if (record.outcome === "failed" || record.hardcoreFailed) {
      return `Hardcore failed — cumulative break time reached 15:00 or more (${formatDuration(b.breaks)}).${reason ? ` ${reason}` : ""}`;
    }
    if (record.outcome === "incomplete") {
      return `Incomplete — focused ${b.completionPct}% of planned time (${formatDuration(b.focus)} / ${formatDuration(b.planned)}). Needs at least 70% to count as completed.${reason ? ` ${reason}` : ""}`;
    }
    return `Ended early — session was stopped before completion.${reason ? ` ${reason}` : ` Focused ${formatDuration(b.focus)} of ${formatDuration(b.planned)} planned.`}`;
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
    const tag = currentTagValue();
    if (dom.goalTag?.value === "Other" && !tag) {
      showToast("Enter a custom tag, or choose No tag.");
      dom.goalTagCustom?.focus();
      return;
    }
    const targetSeconds = parseDuration();
    if (!targetSeconds) return;
    const now = Date.now();
    state.session = {
      id: `${now}-${Math.random().toString(36).slice(2, 9)}`, tabId, intent: intent.slice(0,120),
      targetSeconds, hardcore: dom.sessionStyle.value === "hardcore", startedAt: now,
      activeWorkStartedAt: now, accumulatedFocusSeconds: 0, currentBreakStartedAt: null,
      breakSeconds: 0, breaks: [], topic: "", notes: "", noteItems: [], tag
    };
    if (!safeWrite(ACTIVE_SESSION_KEY, state.session)) { state.session = null; return; }
    rememberRecentGoal({
      intent: intent.slice(0, 120),
      durationPreset: dom.durationPreset.value,
      customSeconds: dom.durationPreset.value === "custom" ? targetSeconds : 0,
      style: dom.sessionStyle.value === "hardcore" ? "hardcore" : "standard",
      tag
    });
    broadcast({type:"active-session", source:tabId, sessionId:state.session.id});
    state.lastPersistedAt = now;
    state.pomodoroNotifiedBucket = -1;
    clearBreakReminder();
    dom.reportTopic.value = ""; dom.reportNotes.value = "";
    resetStickyNotes();
    renderRecentGoals();
    navigate("timer-screen");
    requestWakeLock();
    startTimerLoop();
    renderTimer(now);
  }

  function setStickyState(text, dataState = "saved") {
    if (!dom.stickyNotesState) return;
    dom.stickyNotesState.textContent = text;
    dom.stickyNotesState.dataset.state = dataState;
  }

  function resetStickyNotes() {
    state.stickyDirty = false;
    state.stickyOpen = false;
    if (dom.stickyNotesInput) dom.stickyNotesInput.value = "";
    setStickyState("Ready", "saved");
    renderStickyNoteList();
    syncStickyNotesUi();
  }

  function syncStickyNotesUi() {
    const active = Boolean(state.session) && state.activeScreen === "timer-screen" && !state.readOnly;
    if (dom.stickyNotesToggle) {
      const count = state.session ? ensureNoteItems(state.session).length : 0;
      dom.stickyNotesToggle.hidden = !active;
      dom.stickyNotesToggle.setAttribute("aria-expanded", String(active && state.stickyOpen));
      dom.stickyNotesToggle.innerHTML = count
        ? `<span aria-hidden="true">✎</span> Notes (${count})`
        : `<span aria-hidden="true">✎</span> Notes`;
    }
    if (dom.stickyNotes) {
      const open = active && state.stickyOpen;
      dom.stickyNotes.hidden = !open;
    }
  }

  function renderStickyNoteList() {
    if (!dom.stickyNotesList) return;
    dom.stickyNotesList.replaceChildren();
    const items = state.session ? ensureNoteItems(state.session) : [];
    if (!items.length) {
      const empty = document.createElement("li");
      empty.className = "sticky-notes-empty";
      empty.textContent = "No notes yet.";
      dom.stickyNotesList.append(empty);
      return;
    }
    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "sticky-note-item";
      const text = document.createElement("p");
      text.textContent = item.text;
      const meta = document.createElement("div");
      meta.className = "sticky-note-item-meta";
      const time = document.createElement("small");
      time.textContent = formatDate(item.createdAt);
      const del = document.createElement("button");
      del.type = "button";
      del.className = "sticky-note-delete";
      del.setAttribute("aria-label", "Delete note");
      del.textContent = "Delete";
      del.addEventListener("click", () => deleteStickyNote(item.id));
      meta.append(time, del);
      li.append(text, meta);
      dom.stickyNotesList.append(li);
    });
  }

  function openStickyNotes() {
    if (!state.session || state.readOnly) return;
    state.stickyOpen = true;
    renderStickyNoteList();
    syncStickyNotesUi();
    dom.stickyNotesInput?.focus();
  }

  function closeStickyNotes() {
    state.stickyOpen = false;
    syncStickyNotesUi();
    dom.stickyNotesToggle?.focus();
  }

  function addStickyNote(silent = false) {
    if (!state.session || state.readOnly) return false;
    const text = String(dom.stickyNotesInput?.value || "").trim().slice(0, 2000);
    if (!text) {
      setStickyState("Write a note first", "dirty");
      dom.stickyNotesInput?.focus();
      return false;
    }
    const items = ensureNoteItems(state.session);
    items.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      createdAt: new Date().toISOString()
    });
    state.session.noteItems = items.slice(0, 100);
    if (!persistSessionNotes()) {
      state.session.noteItems.pop();
      setStickyState("Not saved — storage unavailable", "error");
      return false;
    }
    if (dom.stickyNotesInput) dom.stickyNotesInput.value = "";
    state.stickyDirty = false;
    setStickyState(`Added · ${items.length} note${items.length === 1 ? "" : "s"}`, "saved");
    renderStickyNoteList();
    syncStickyNotesUi();
    refreshNotesSurfaces();
    if (!silent) showToast("Note added to this session.");
    return true;
  }

  function deleteStickyNote(id) {
    if (!state.session || state.readOnly) return false;
    const items = ensureNoteItems(state.session);
    const previous = items.slice();
    state.session.noteItems = items.filter((n) => n.id !== id);
    if (!persistSessionNotes()) {
      state.session.noteItems = previous;
      setStickyState("Could not delete — storage unavailable", "error");
      return false;
    }
    setStickyState(`Removed · ${state.session.noteItems.length} left`, "saved");
    renderStickyNoteList();
    syncStickyNotesUi();
    refreshNotesSurfaces();
    return true;
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
      if (state.prefs.pomodoro) {
        const focus = activeFocusSeconds(s, now);
        const bucket = Math.floor(focus / POMODORO_FOCUS_SECONDS);
        if (bucket > 0 && bucket > state.pomodoroNotifiedBucket) {
          state.pomodoroNotifiedBucket = bucket;
          showToast(`You’ve focused ${bucket * 25} minutes — consider a short break.`);
          notify("Break suggestion", `You’ve focused ${bucket * 25} minutes. A short break can help.`);
        }
      }
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
      scheduleBreakReminder();
    } else {
      clearBreakReminder();
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

  function syncFloatingTimer(now = Date.now()) {
    if (!dom.floatingTimer) return;
    const show = Boolean(state.session) && state.activeScreen !== "timer-screen";
    dom.floatingTimer.hidden = !show;
    dom.floatingTimer.classList.toggle("is-hidden", !show);
    document.body.classList.toggle("has-floating-timer", show);
    if (!show || !state.session) return;
    const s = state.session;
    const onBreak = Boolean(s.currentBreakStartedAt);
    const focus = activeFocusSeconds(s, now);
    const remaining = Math.max(0, s.targetSeconds - focus);
    const clock = formatClock(remaining, s.targetSeconds >= 3600);
    dom.floatingTimer.classList.toggle("is-break", onBreak);
    if (dom.floatingTimerStatus) dom.floatingTimerStatus.textContent = onBreak ? "On break" : "Focusing";
    if (dom.floatingTimerIntent) dom.floatingTimerIntent.textContent = s.intent;
    if (dom.floatingTimerClock) dom.floatingTimerClock.textContent = clock;
    dom.floatingTimer.setAttribute("aria-label", `${onBreak ? "On break" : "Focusing"}: ${s.intent}, ${clock} remaining`);
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
    const timeOpts = { hour: "2-digit", minute: "2-digit" };
    const scheduledEnd = new Date(s.startedAt + s.targetSeconds * 1000);
    const realEnd = new Date(s.startedAt + (s.targetSeconds + breaks) * 1000);
    const scheduledLabel = scheduledEnd.toLocaleTimeString([], timeOpts);
    const realLabel = realEnd.toLocaleTimeString([], timeOpts);
    dom.expectedEndTime.textContent = realLabel;
    dom.expectedEndTime.title = breaks > 0.5 || onBreak
      ? `Real end ${realLabel} — includes ${formatDuration(breaks)} of break time so far. Updates while you are on a break.`
      : `Real end ${realLabel}. Matches schedule while you have not taken breaks.`;
    if (dom.expectedEndScheduled) {
      const delayed = realEnd.getTime() - scheduledEnd.getTime() >= 30000;
      dom.expectedEndScheduled.textContent = delayed
        ? `Scheduled ${scheduledLabel}`
        : `Scheduled ${scheduledLabel} · on track`;
      dom.expectedEndScheduled.title = `Original plan without breaks: ${scheduledLabel}.`;
      dom.expectedEndScheduled.classList.toggle("is-delayed", delayed);
    }
    if (onBreak) dom.timerStatusMessage.textContent = s.hardcore ? `Hardcore total break: ${formatClock(breaks)} / 15:00` : "Take a breath. Resume when you're ready.";
    const pct = Math.min(100, Math.max(0, focus / s.targetSeconds * 100));
    dom.timerProgressBar.style.width = `${pct}%`;
    dom.timerProgress.setAttribute("aria-valuenow", String(Math.round(pct)));
    document.title = `${formatClock(remaining, s.targetSeconds >= 3600)} · Locked-In`;
    syncFloatingTimer(now);
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
      clearBreakReminder();
      stopTimerLoop(); releaseWakeLock(); state.session = null; safeWrite(ACTIVE_SESSION_KEY, null); broadcast({type:"active-session", source:tabId, sessionId:null});
      resetStickyNotes();
      syncFloatingTimer();
      showToast("Short session discarded. Nothing was added to history.");
      navigate("setup-screen"); dom.taskIntent.focus(); return;
    }
    const draft = String(dom.stickyNotesInput?.value || "").trim();
    if (draft) addStickyNote(true);
    const noteItems = ensureNoteItems(s).slice();
    s.topic = String(dom.reportTopic.value || s.topic || "").trim().slice(0,240);
    s.notes = composeNotesText(noteItems) || String(dom.reportNotes.value || s.notes || "").trim().slice(0,4000);
    s.noteItems = noteItems;
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
      hardcore:s.hardcore, hardcoreFailed:finalOutcome === "failed", outcome:finalOutcome, reason, topic:s.topic, notes:s.notes, noteItems,
      tag: s.tag || ""
    });
    clearBreakReminder();
    stopTimerLoop(); releaseWakeLock(); state.session = null; safeWrite(ACTIVE_SESSION_KEY, null); broadcast({type:"active-session", source:tabId, sessionId:null});
    resetStickyNotes();
    syncFloatingTimer();
    state.history.unshift(record); state.history = state.history.slice(0, MAX_HISTORY);
    if (!saveHistory()) {
      showToast("Session finished, but history could not be saved. Use Backup JSON before closing this tab.");
    }
    state.reportId = record.id;
    renderReport(record); navigate("report-screen");
    if (record.outcome === "completed") playChime();
    if (state.prefs.notifyEnd) {
      const label = record.outcome === "completed" ? "Session complete"
        : record.outcome === "failed" ? "Hardcore session failed"
        : record.outcome === "incomplete" ? "Session incomplete"
        : "Session ended";
      notify(label, `${record.intent} · ${formatDuration(record.focusSeconds)} focused`);
    }
  }

  function playChime() {
    const mode = state.prefs.chime || "soft";
    if (mode === "off") return;
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      const ctx = new C(), now = ctx.currentTime;
      const notes = mode === "full" ? [523.25, 659.25, 783.99] : [523.25, 659.25];
      const peak = mode === "full" ? .12 : .05;
      const gap = mode === "full" ? .12 : .1;
      const hold = mode === "full" ? .25 : .16;
      notes.forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(.0001, now + i * gap);
        g.gain.exponentialRampToValueAtTime(peak, now + i * gap + .03);
        g.gain.exponentialRampToValueAtTime(.0001, now + i * gap + hold);
        o.connect(g); g.connect(ctx.destination);
        o.start(now + i * gap); o.stop(now + i * gap + hold + .02);
      });
      setTimeout(() => ctx.close().catch(() => {}), 1200);
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
    const onTimer = state.activeScreen === "timer-screen";
    const showBanner = Boolean(active) && !onTimer;
    dom.activeSessionBanner.classList.toggle("is-hidden", !showBanner);
    if (showBanner) {
      dom.activeSessionLabel.textContent = state.session
        ? `${active.intent} · running in this tab`
        : `${active.intent} · ${formatClock(active.targetSeconds)} planned`;
    }
    const label = dom.setupForm.querySelector('button[type="submit"] span');
    if (label) label.textContent = state.session ? "Return to timer" : "Start focusing";
    renderRecentGoals();
    renderFocusGoals();
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
    ensureNoteItems(state.session);
    resetStickyNotes();
    if (state.session.currentBreakStartedAt && state.session.hardcore && currentBreakSeconds(state.session) >= HARDCORE_BREAK_LIMIT_SECONDS) {
      finishSession("failed","Hardcore break limit reached.",false); return;
    }
    navigate("timer-screen", true);
    requestWakeLock();
    if (state.session.currentBreakStartedAt) scheduleBreakReminder();
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
    const tag = String(dom.historyTagFilter?.value || "").trim();
    let rows = state.history.filter(r => {
      const text=[r.intent,r.topic,r.notes,r.outcome,r.reason,r.tag].join(" ").toLocaleLowerCase();
      const d=new Date(r.completedAt);
      return (!q || text.includes(q)) && (!from || d>=from) && (!to || d<=to) && (!tag || r.tag === tag);
    });
    const sort=dom.historySort.value;
    rows.sort((a,b)=>sort==="oldest" ? Date.parse(a.completedAt)-Date.parse(b.completedAt) : sort==="focus" ? b.focusSeconds-a.focusSeconds : Date.parse(b.completedAt)-Date.parse(a.completedAt));
    return rows;
  }

  function renderHistory() {
    populateHistoryTagFilter();
    const rows=getFilteredHistory();
    dom.historyTableBody.replaceChildren();
    rows.forEach(r=>{
      const tr=document.createElement("tr");
      const score = scoreFor(r);
      const b = scoreBreakdown(r);
      const noteItems = sessionNoteItems(r);
      const cells = [
        { label: "Date", text: formatDate(r.completedAt), title: `Saved ${formatDate(r.completedAt)}.` },
        { label: "Goal", text: r.intent, title: "Focus goal for this session." },
        { label: "Tag", text: r.tag || "—", title: r.tag ? `Tag: ${r.tag}.` : "No tag for this session." },
        { label: "Topics", text: r.topic || "—", title: r.topic ? "Topics / work tagged for this session." : "No topics saved for this session." },
        { label: "Focus", text: formatDuration(r.focusSeconds), title: `Active focus time: ${formatDuration(r.focusSeconds)} of ${formatDuration(r.targetSeconds)} planned (${b.completionPct}%). Breaks are excluded.` },
        { label: "Elapsed", text: formatDuration(r.elapsedSeconds), title: `Total clock time including breaks: ${formatDuration(r.elapsedSeconds)} (breaks ${formatDuration(r.breakSeconds)}).` },
        { label: "Completion score", text: score == null ? "N/A" : `${score}%`, title: explainScore(r), explain: true }
      ];
      cells.forEach((cell) => {
        const td = document.createElement("td");
        td.textContent = cell.text;
        td.dataset.label = cell.label;
        td.title = cell.title;
        if (cell.explain) {
          td.tabIndex = 0;
          td.setAttribute("aria-label", `${cell.label}: ${cell.text}. ${cell.title}`);
        }
        tr.append(td);
      });
      const notesTd = document.createElement("td");
      notesTd.dataset.label = "Notes";
      notesTd.className = "history-notes-cell";
      if (!noteItems.length) {
        notesTd.textContent = "—";
        notesTd.title = "No notes saved for this session.";
      } else {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "history-notes-btn";
        const preview = noteItems[0].text.replace(/\s+/g, " ").trim();
        const short = preview.length > 48 ? `${preview.slice(0, 48)}…` : preview;
        btn.innerHTML = "";
        const count = document.createElement("strong");
        count.textContent = noteItems.length === 1 ? "1 note" : `${noteItems.length} notes`;
        const snippet = document.createElement("span");
        snippet.textContent = short;
        btn.append(count, snippet);
        btn.title = noteItems.map((n, i) => `Note ${i + 1}: ${n.text}`).join("\n\n");
        btn.setAttribute("aria-label", `${noteItems.length} note${noteItems.length === 1 ? "" : "s"} for ${r.intent}. Open notes.`);
        btn.addEventListener("click", () => openSessionNotesViewer(r.id));
        notesTd.append(btn);
      }
      // Keep Notes column before Focus: insert after Topics (4th data cell so far is Topics as index 3 in cells... wait we removed Notes from cells)
      // Current order without Notes: Date Goal Tag Topics Focus Elapsed Score — need Notes after Topics
      const focusTd = tr.children[4]; // Focus is 5th child (0-based 4) after Date,Goal,Tag,Topics
      tr.insertBefore(notesTd, focusTd);
      const out = document.createElement("td");
      out.dataset.label = "Outcome";
      const pill = document.createElement("span");
      pill.className = `outcome-pill ${r.outcome === "completed" ? "success" : r.outcome === "failed" ? "failed" : ""}`;
      pill.textContent = r.outcome === "completed" ? "Completed" : r.outcome === "failed" ? "Hardcore failed" : r.outcome === "incomplete" ? "Incomplete" : "Ended early";
      pill.title = explainOutcome(r);
      pill.tabIndex = 0;
      pill.setAttribute("aria-label", `${pill.textContent}. ${explainOutcome(r)}`);
      out.append(pill);
      tr.append(out);
      const actions = document.createElement("td");
      actions.dataset.label = "Actions";
      actions.className = "history-actions-cell";
      const edit = document.createElement("button");
      edit.className = "button button-secondary button-small";
      edit.type = "button";
      edit.textContent = "Edit";
      edit.title = "Edit topics and notes for this session.";
      edit.addEventListener("click", () => openEdit(r.id));
      const del = document.createElement("button");
      del.className = "button button-danger-outline button-small";
      del.type = "button";
      del.textContent = "Delete";
      del.title = "Delete this session from local history.";
      del.addEventListener("click", () => deleteSession(r.id));
      actions.append(edit, del);
      tr.append(actions);
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
    const previous=state.history.slice();
    state.history=state.history.filter(r=>r.id!==id);
    if (!saveHistory()) {
      state.history=previous;
      showToast("Could not delete session — browser storage unavailable. Try Backup JSON.");
      return;
    }
    renderHistory(); renderNotes(); renderInsights();
    showUndoToast(`Deleted “${item.intent}”.`,()=>{
      state.history.push(item);
      state.history.sort((a,b)=>Date.parse(b.completedAt)-Date.parse(a.completedAt));
      if (!saveHistory()) { showToast("Could not restore session — browser storage unavailable."); return; }
      renderAll(); showToast("Session restored.");
    });
  }

  function showUndoToast(message, undo) {
    clearTimeout(state.toastTimer);
    dom.toast.innerHTML="";
    const text=document.createElement("span");text.textContent=message;
    const b=document.createElement("button");b.type="button";b.textContent="Undo";b.className="toast-action";b.addEventListener("click",()=>{undo();dom.toast.classList.remove("is-visible");});
    dom.toast.append(text,b);dom.toast.classList.add("is-visible");state.toastTimer=setTimeout(()=>dom.toast.classList.remove("is-visible"),5000);
  }

  function updateEditNotesSummary(item) {
    if (!dom.editNotesSummary) return;
    const items = sessionNoteItems(item);
    dom.editNotesSummary.textContent = items.length
      ? `${items.length} note${items.length === 1 ? "" : "s"} saved for this session.`
      : "No notes yet for this session.";
  }

  function openEdit(id) {
    const item = state.history.find((r) => r.id === id); if (!item) return;
    state.editingId = id;
    dom.editTitle.value = item.topic || "";
    updateEditNotesSummary(item);
    if (typeof dom.editDialog.showModal === "function") dom.editDialog.showModal();
  }

  function saveEdit() {
    const item = state.history.find((r) => r.id === state.editingId); if (!item) return;
    const prevTopic = item.topic;
    item.topic = item.topics = dom.editTitle.value.trim().slice(0, 240);
    if (!saveHistory()) {
      item.topic = item.topics = prevTopic;
      showToast("Could not update session — browser storage unavailable. Try Backup JSON.");
      return;
    }
    dom.editDialog.close();
    state.editingId = null;
    renderAll();
    showToast("Session updated.");
  }

  function saveReportNotes() {
    const item = state.history.find((r) => r.id === state.reportId); if (!item) return;
    const previousItems = sessionNoteItems(item);
    const previousTopic = item.topic;
    const previousNotes = item.notes;
    item.topic = item.topics = dom.reportTopic.value.trim().slice(0, 240);
    applyNoteItems(item, noteItemsFromComposedText(item, dom.reportNotes.value, previousItems));
    if (!saveHistory()) {
      item.topic = item.topics = previousTopic;
      applyNoteItems(item, previousItems);
      item.notes = item.studied = previousNotes;
      state.reportDirty = true;
      dom.reportSaveState.textContent = "Not saved — browser storage unavailable";
      return;
    }
    state.reportDirty = false;
    dom.reportSaveState.textContent = `Saved · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    renderAll();
    showToast("Session notes saved.");
  }

  function openSessionNotesViewer(sessionId) {
    const item = state.history.find((r) => r.id === sessionId);
    if (!item) return;
    state.viewingNotesId = sessionId;
    if (dom.viewNoteInput) dom.viewNoteInput.value = "";
    renderSessionNotesViewer();
    if (typeof dom.viewNotesDialog?.showModal === "function") dom.viewNotesDialog.showModal();
  }

  function closeSessionNotesViewer() {
    state.viewingNotesId = null;
    if (dom.viewNotesDialog?.open) dom.viewNotesDialog.close();
  }

  function renderSessionNotesViewer() {
    if (!dom.viewNotesList) return;
    const item = state.history.find((r) => r.id === state.viewingNotesId);
    if (!item) {
      closeSessionNotesViewer();
      return;
    }
    const items = sessionNoteItems(item);
    if (dom.viewNotesHeading) dom.viewNotesHeading.textContent = item.intent;
    if (dom.viewNotesMeta) {
      dom.viewNotesMeta.textContent = `${formatDate(item.completedAt)} · ${items.length} note${items.length === 1 ? "" : "s"}`;
    }
    dom.viewNotesList.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "empty-inline";
      empty.textContent = "No notes yet. Add one below.";
      dom.viewNotesList.append(empty);
      return;
    }
    const list = document.createElement("ul");
    list.className = "session-note-items";
    items.forEach((note, index) => {
      const li = document.createElement("li");
      li.className = "session-note-item";
      const label = document.createElement("strong");
      label.textContent = `Note ${index + 1}`;
      const p = document.createElement("p");
      p.textContent = note.text;
      const foot = document.createElement("div");
      foot.className = "session-note-item-foot";
      const time = document.createElement("small");
      time.textContent = formatDate(note.createdAt);
      const actions = document.createElement("div");
      actions.className = "note-card-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "button button-secondary button-small";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => openNoteEditor({
        scope: "history",
        sessionId: item.id,
        noteId: note.id,
        intent: item.intent,
        live: false,
        text: note.text
      }));
      const del = document.createElement("button");
      del.type = "button";
      del.className = "button button-danger-outline button-small";
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        state.editingNote = {
          scope: "history",
          sessionId: item.id,
          noteId: note.id,
          intent: item.intent,
          live: false,
          text: note.text
        };
        deleteEditedNote();
      });
      actions.append(edit, del);
      foot.append(time, actions);
      li.append(label, p, foot);
      list.append(li);
    });
    dom.viewNotesList.append(list);
  }

  function addNoteToViewedSession() {
    const item = state.history.find((r) => r.id === state.viewingNotesId);
    if (!item) return;
    const text = String(dom.viewNoteInput?.value || "").trim().slice(0, 2000);
    if (!text) {
      showToast("Write a note before adding.");
      dom.viewNoteInput?.focus();
      return;
    }
    const previous = sessionNoteItems(item);
    const next = [
      ...previous,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, text, createdAt: new Date().toISOString() }
    ];
    applyNoteItems(item, next);
    if (!saveHistory()) {
      applyNoteItems(item, previous);
      showToast("Could not save note — browser storage unavailable.");
      return;
    }
    if (dom.viewNoteInput) dom.viewNoteInput.value = "";
    if (state.reportId === item.id && dom.reportNotes) dom.reportNotes.value = item.notes || "";
    refreshNotesSurfaces();
    showToast("Note added.");
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
    const tags={};completed.forEach(r=>{if(!r.tag)return;tags[r.tag]=(tags[r.tag]||0)+r.focusSeconds;});
    const bt=Object.entries(tags).sort((a,b)=>b[1]-a[1])[0];
    if (dom.bestTag) dom.bestTag.textContent=bt?`${bt[0]} · ${formatDuration(bt[1])}`:"—";
    const streaks=calculateStreaks(completed);dom.streakCurrent.textContent=String(streaks.current);dom.streakBest.textContent=String(streaks.best);
    renderFocusGoals();
  }

  function drawWeeklyChart(records) {
    const c=dom.weeklyChart,ctx=c.getContext("2d");if(!ctx)return;
    const width=Math.max(300,c.clientWidth||700),height=230,dpr=devicePixelRatio||1;c.width=width*dpr;c.height=height*dpr;c.style.height=`${height}px`;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    const styles=getComputedStyle(document.documentElement),accent=styles.getPropertyValue("--accent").trim(),muted=styles.getPropertyValue("--text-muted").trim(),border=styles.getPropertyValue("--border").trim();
    const days=[];for(let i=6;i>=0;i--){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-i);days.push(d);}
    const vals=days.map(d=>records.filter(r=>localDayKey(r.completedAt)===localDayKey(d)).reduce((s,r)=>s+r.focusSeconds,0));const max=Math.max(3600,...vals);
    ctx.font="12px system-ui,sans-serif";ctx.fillStyle=muted;ctx.strokeStyle=border;ctx.beginPath();ctx.moveTo(28,190);ctx.lineTo(width-16,190);ctx.stroke();
    const gap=12,bw=(width-44-gap*6)/7;vals.forEach((v,i)=>{const bh=Math.max(v?3:0,v/max*145),x=28+i*(bw+gap);ctx.fillStyle=accent;ctx.fillRect(x,190-bh,bw,bh);ctx.fillStyle=muted;ctx.textAlign="center";ctx.fillText(days[i].toLocaleDateString([],{weekday:"short"}),x+bw/2,214);});
    c.setAttribute("aria-label",`Seven day completed focus chart: ${vals.map((v,i)=>`${days[i].toLocaleDateString([],{weekday:"short"})} ${formatDuration(v)}`).join(", ")}`);
  }

  function drawHeatmap(records) {
    const container=dom.heatmap;container.replaceChildren();
    const textList=dom.heatmapText; if (textList) textList.replaceChildren();
    const now=new Date();now.setHours(0,0,0,0);
    const start=new Date(now);start.setDate(start.getDate()-83);
    const byDay={};records.forEach(r=>{const k=localDayKey(r.completedAt);if(k)byDay[k]=(byDay[k]||0)+r.focusSeconds;});
    const max=Math.max(1,...Object.values(byDay));
    for(let i=0;i<84;i++){
      const d=new Date(start);d.setDate(start.getDate()+i);const k=localDayKey(d);const v=byDay[k]||0;
      const label=`${d.toLocaleDateString()}: ${formatDuration(v)} completed focus`;
      const cell=document.createElement("span");cell.className="heat-cell";cell.dataset.level=v?String(Math.min(4,Math.ceil(v/max*4))):"0";cell.title=label;container.append(cell);
      if (textList && v) { const li=document.createElement("li"); li.textContent=label; textList.append(li); }
    }
    if (textList && !textList.childElementCount) {
      const li=document.createElement("li"); li.textContent="No completed focus in the last 12 weeks."; textList.append(li);
    }
  }

  function calculateStreaks(records) {
    const dates=[...new Set(records.map(r=>localDayKey(r.completedAt)).filter(Boolean))].sort();
    if(!dates.length)return {current:0,best:0};
    let best=1,run=1;
    for(let i=1;i<dates.length;i++){
      const a=new Date(`${dates[i-1]}T00:00:00`);
      const b=new Date(`${dates[i]}T00:00:00`);
      if((b-a)===86400000)run++; else run=1;
      best=Math.max(best,run);
    }
    const today=new Date();today.setHours(0,0,0,0);
    let cursor=new Date(today);
    // Allow current streak to start from yesterday if nothing completed today yet.
    if (!dates.includes(localDayKey(cursor))) {
      cursor.setDate(cursor.getDate()-1);
      if (!dates.includes(localDayKey(cursor))) return {current:0,best};
    }
    let current=0;
    for(;;){
      const k=localDayKey(cursor);
      if(!dates.includes(k))break;
      current++;
      cursor.setDate(cursor.getDate()-1);
    }
    return {current,best};
  }

  function sessionNoteItems(record) {
    if (Array.isArray(record.noteItems) && record.noteItems.length) return record.noteItems.slice();
    const legacy = String(record.notes || "").trim();
    if (!legacy && !record.topic) return [];
    return legacy ? [{ id: "legacy", text: legacy, createdAt: record.completedAt || new Date().toISOString() }] : [];
  }

  function openNoteEditor(target) {
    state.editingNote = target;
    const label = target.scope === "inbox"
      ? "Inbox note"
      : `${target.intent || "Session"}${target.live ? " · in progress" : ""}`;
    if (dom.editNoteContext) dom.editNoteContext.textContent = label;
    dom.editNoteText.value = target.text || "";
    if (typeof dom.editNoteDialog.showModal === "function") dom.editNoteDialog.showModal();
    else {
      const next = window.prompt("Edit note", target.text || "");
      if (next == null) return;
      state.editingNote = { ...target, text: next };
      saveEditedNote();
    }
  }

  function saveEditedNote() {
    const target = state.editingNote;
    if (!target) return;
    const text = String(dom.editNoteText?.value || "").trim().slice(0, 2000);
    if (!text) {
      showToast("Note text cannot be empty.");
      dom.editNoteText?.focus();
      return;
    }
    if (target.scope === "inbox") {
      const item = state.inbox.find((n) => n.id === target.noteId);
      if (!item) return;
      const previous = item.text;
      item.text = text;
      if (!saveInbox()) {
        item.text = previous;
        showToast("Could not save note — browser storage unavailable.");
        return;
      }
    } else if (target.live) {
      if (!state.session || state.session.id !== target.sessionId) return;
      const items = ensureNoteItems(state.session);
      const item = items.find((n) => n.id === target.noteId);
      if (!item) return;
      const previous = item.text;
      item.text = text;
      if (!persistSessionNotes()) {
        item.text = previous;
        showToast("Could not save note — browser storage unavailable.");
        return;
      }
      renderStickyNoteList();
      syncStickyNotesUi();
      refreshNotesSurfaces();
      state.editingNote = null;
      dom.editNoteDialog?.close();
      showToast("Note updated.");
      return;
    } else {
      const record = state.history.find((r) => r.id === target.sessionId);
      if (!record) return;
      const items = sessionNoteItems(record);
      const note = items.find((n) => n.id === target.noteId) || items[0];
      if (!note) return;
      const previousItems = sessionNoteItems(record);
      note.text = text;
      applyNoteItems(record, items);
      if (!saveHistory()) {
        applyNoteItems(record, previousItems);
        showToast("Could not save note — browser storage unavailable.");
        return;
      }
      if (state.reportId === record.id && dom.reportNotes) dom.reportNotes.value = record.notes || "";
    }
    state.editingNote = null;
    dom.editNoteDialog?.close();
    refreshNotesSurfaces();
    showToast("Note updated.");
  }

  function deleteEditedNote() {
    const target = state.editingNote;
    if (!target) return;
    askConfirm("Delete this note?", "This removes only this note. Other notes in the session stay.", () => {
      let ok = false;
      if (target.scope === "inbox") {
        const previous = state.inbox.slice();
        state.inbox = state.inbox.filter((n) => n.id !== target.noteId);
        ok = saveInbox();
        if (!ok) {
          state.inbox = previous;
          showToast("Could not delete note — browser storage unavailable.");
          return;
        }
      } else if (target.live) {
        if (!state.session || state.session.id !== target.sessionId) return;
        ok = deleteStickyNote(target.noteId);
        if (!ok) return;
      } else {
        const record = state.history.find((r) => r.id === target.sessionId);
        if (!record) return;
        const previousItems = sessionNoteItems(record);
        applyNoteItems(record, previousItems.filter((n) => n.id !== target.noteId));
        ok = saveHistory();
        if (!ok) {
          applyNoteItems(record, previousItems);
          showToast("Could not delete note — browser storage unavailable.");
          return;
        }
        if (state.reportId === record.id && dom.reportNotes) dom.reportNotes.value = record.notes || "";
      }
      state.editingNote = null;
      if (dom.editNoteDialog?.open) dom.editNoteDialog.close();
      refreshNotesSurfaces();
      showToast("Note deleted.");
    }, "Delete note");
  }

  function renderNotes() {
    const q = dom.notesSearch.value.trim().toLocaleLowerCase();
    dom.notesInbox.replaceChildren();
    dom.notesSessions.replaceChildren();

    const inboxRows = state.inbox.filter((n) => !q || n.text.toLocaleLowerCase().includes(q));
    inboxRows.forEach((n) => {
      const card = document.createElement("article");
      card.className = "note-card";
      const p = document.createElement("p");
      p.textContent = n.text;
      const meta = document.createElement("small");
      meta.textContent = `Inbox · ${formatDate(n.createdAt)}`;
      const actions = document.createElement("div");
      actions.className = "note-card-actions";
      const edit = document.createElement("button");
      edit.className = "button button-secondary button-small";
      edit.type = "button";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => openNoteEditor({ scope: "inbox", noteId: n.id, text: n.text }));
      const del = document.createElement("button");
      del.className = "button button-danger-outline button-small";
      del.type = "button";
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        state.editingNote = { scope: "inbox", noteId: n.id, text: n.text };
        deleteEditedNote();
      });
      actions.append(edit, del);
      card.append(p, meta, actions);
      dom.notesInbox.append(card);
    });

    const groups = [];
    if (state.session) {
      const items = ensureNoteItems(state.session);
      const filtered = items.filter((item) => !q || [state.session.intent, item.text].join(" ").toLocaleLowerCase().includes(q));
      if (filtered.length) {
        groups.push({
          sessionId: state.session.id,
          intent: state.session.intent,
          live: true,
          outcome: "active",
          completedAt: state.session.startedAt,
          topic: state.session.topic || "",
          items: filtered
        });
      }
    }
    state.history.forEach((r) => {
      const items = sessionNoteItems(r);
      if (!items.length && !r.topic) return;
      const filtered = items.filter((item) => !q || [r.intent, r.topic, item.text].join(" ").toLocaleLowerCase().includes(q));
      if (!filtered.length && q) return;
      if (!filtered.length && !items.length && r.topic && (!q || [r.intent, r.topic].join(" ").toLocaleLowerCase().includes(q))) {
        groups.push({
          sessionId: r.id, intent: r.intent, live: false, outcome: r.outcome,
          completedAt: r.completedAt, topic: r.topic || "", items: []
        });
        return;
      }
      if (!filtered.length) return;
      groups.push({
        sessionId: r.id,
        intent: r.intent,
        live: false,
        outcome: r.outcome,
        completedAt: r.completedAt,
        topic: r.topic || "",
        items: filtered
      });
    });

    groups.forEach((group) => {
      const card = document.createElement("article");
      card.className = "session-notes-group";
      if (group.live) card.classList.add("is-live");

      const head = document.createElement("div");
      head.className = "session-notes-group-head";
      const title = document.createElement("h3");
      title.textContent = group.intent;
      const meta = document.createElement("small");
      const countLabel = `${group.items.length} note${group.items.length === 1 ? "" : "s"}`;
      meta.textContent = group.live
        ? `In progress · ${countLabel}`
        : `${formatDate(group.completedAt)} · ${group.outcome === "completed" ? "Completed" : "Attempt"} · ${countLabel}`;
      head.append(title, meta);
      if (group.topic) {
        const topic = document.createElement("strong");
        topic.className = "session-notes-group-topic";
        topic.textContent = group.topic;
        head.append(topic);
      }
      card.append(head);

      if (!group.items.length) {
        const empty = document.createElement("p");
        empty.className = "empty-inline";
        empty.textContent = "No notes in this session yet.";
        card.append(empty);
      } else {
        const list = document.createElement("ul");
        list.className = "session-note-items";
        group.items.forEach((item, index) => {
          const li = document.createElement("li");
          li.className = "session-note-item";
          const label = document.createElement("strong");
          label.textContent = `Note ${index + 1}`;
          const p = document.createElement("p");
          p.textContent = item.text;
          const foot = document.createElement("div");
          foot.className = "session-note-item-foot";
          const time = document.createElement("small");
          time.textContent = formatDate(item.createdAt);
          const actions = document.createElement("div");
          actions.className = "note-card-actions";
          const edit = document.createElement("button");
          edit.className = "button button-secondary button-small";
          edit.type = "button";
          edit.textContent = "Edit";
          edit.addEventListener("click", () => openNoteEditor({
            scope: group.live ? "live" : "history",
            sessionId: group.sessionId,
            noteId: item.id,
            intent: group.intent,
            live: group.live,
            text: item.text
          }));
          const del = document.createElement("button");
          del.className = "button button-danger-outline button-small";
          del.type = "button";
          del.textContent = "Delete";
          del.addEventListener("click", () => {
            state.editingNote = {
              scope: group.live ? "live" : "history",
              sessionId: group.sessionId,
              noteId: item.id,
              intent: group.intent,
              live: group.live,
              text: item.text
            };
            deleteEditedNote();
          });
          actions.append(edit, del);
          foot.append(time, actions);
          li.append(label, p, foot);
          list.append(li);
        });
        card.append(list);
      }
      dom.notesSessions.append(card);
    });

    if (!state.inbox.length) {
      dom.notesInbox.innerHTML = '<p class="empty-inline">No inbox notes. Use Quick capture to save a thought without an active session.</p>';
    } else if (!inboxRows.length) {
      dom.notesInbox.innerHTML = '<p class="empty-inline">No inbox notes match your search.</p>';
    }
    if (!groups.length) {
      dom.notesSessions.innerHTML = '<p class="empty-inline">No session notes yet.</p>';
    }
  }

  function addInboxNote() {
    const text=dom.noteCaptureInput.value.trim();if(!text)return;
    const note={id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,text,createdAt:new Date().toISOString()};
    state.inbox.unshift(note);
    if (!saveInbox()) {
      state.inbox=state.inbox.filter(n=>n.id!==note.id);
      showToast("Could not save note — browser storage unavailable. Try Backup JSON.");
      return;
    }
    dom.noteCaptureInput.value="";renderNotes();showToast("Note added to your inbox.");
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
    const header=["Completed At","Goal","Tag","Planned","Focus","Elapsed","Breaks","Completion score","Style","Outcome","Reason","Topics","Notes"];
    const rows=state.history.map(r=>[r.completedAt,r.intent,r.tag||"",formatDuration(r.targetSeconds),formatDuration(r.focusSeconds),formatDuration(r.elapsedSeconds),formatDuration(r.breakSeconds),scoreFor(r)==null?"":scoreFor(r),r.hardcore?"Hardcore":"Standard",r.outcome,r.reason,r.topic,r.notes]);
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
      const previousHistory=state.history.slice();
      const previousInbox=state.inbox.slice();
      if(replace)state.history=normalized;else{const map=new Map(state.history.map(r=>[r.id,r]));normalized.forEach(r=>map.set(r.id,r));state.history=[...map.values()].sort((a,b)=>Date.parse(b.completedAt)-Date.parse(a.completedAt)).slice(0,MAX_HISTORY);}
      if(Array.isArray(parsed.notesInbox))state.inbox=parsed.notesInbox.map(n=>({id:String(n.id||`${Date.now()}-${Math.random()}`),text:String(n.text||"").slice(0,2000),createdAt:n.createdAt||new Date().toISOString()})).filter(n=>n.text.trim()).slice(0,200);
      const historyOk=saveHistory();
      const inboxOk=Array.isArray(parsed.notesInbox) ? saveInbox() : true;
      if (!historyOk || !inboxOk) {
        state.history=previousHistory;
        state.inbox=previousInbox;
        showToast("Import could not be saved — browser storage unavailable. Try Backup JSON first.");
        return;
      }
      renderAll();showToast(`Imported ${normalized.length} session${normalized.length===1?"":"s"}.`);
    }catch(_){showToast("Import rejected. Use a valid Locked-In JSON backup.");}
    finally{dom.importJsonInput.value="";}
  }

  function clearHistory() {
    if(!state.history.length){showToast("History is already empty.");return;}
    askConfirm("Clear all history?","This removes saved attempts from this browser. Export a backup first if you want to keep them.",()=>{
      const previous=state.history.slice();
      state.history=[];
      if (!saveHistory()) {
        state.history=previous;
        showToast("Could not clear history — browser storage unavailable.");
        return;
      }
      renderAll();showToast("History cleared.");
    },"Clear history");
  }

  function renderAll(){renderSetup();renderHistory();renderInsights();renderNotes();}

  function handleKeyboard(e) {
    const target=e.target, tag=target?.tagName?.toLowerCase();
    const typing=["input","textarea","select"].includes(tag)||target?.isContentEditable;
    if(e.key==="Escape"){
      if(dom.themePopover.classList.contains("is-open")){closeThemePopover();dom.themeButton.focus();return;}
      if(state.stickyOpen){closeStickyNotes();return;}
      if(dom.menuToggle.getAttribute("aria-expanded")==="true"){closeMenu();return;}
      if(dom.shortDialog.open){dom.shortDialog.close();return;}
      if(dom.editDialog.open){dom.editDialog.close();return;}
      if(dom.editNoteDialog?.open){dom.editNoteDialog.close();state.editingNote=null;return;}
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
    dom.resumeSessionBtn.addEventListener("click",()=>{
      if (state.session) { navigate("timer-screen"); return; }
      const active=safeRead(ACTIVE_SESSION_KEY,null);
      if(active&&active.tabId===tabId){state.session=active;navigate("timer-screen");startTimerLoop();}
      else showToast("The active session belongs to another tab.");
    });
    dom.floatingTimerReturn?.addEventListener("click",()=>{
      if (state.session) navigate("timer-screen");
      else showToast("No active session in this tab.");
    });
    dom.timerBackBtn.addEventListener("click",()=>{ navigate("setup-screen"); renderSetup(); });
    dom.stickyNotesToggle?.addEventListener("click",()=>{ state.stickyOpen ? closeStickyNotes() : openStickyNotes(); });
    dom.stickyNotesClose?.addEventListener("click",closeStickyNotes);
    dom.stickyNotesSave?.addEventListener("click",()=>addStickyNote(false));
    dom.stickyNotesInput?.addEventListener("input",()=>{
      state.stickyDirty = Boolean(dom.stickyNotesInput.value.trim());
      setStickyState(state.stickyDirty ? "Ready to add" : "Ready", state.stickyDirty ? "dirty" : "saved");
    });
    dom.stickyNotesInput?.addEventListener("keydown",(e)=>{
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); addStickyNote(false); }
    });
    dom.breakBtn.addEventListener("click",toggleBreak);dom.stopBtn.addEventListener("click",stopSession);
    dom.newSessionBtn.addEventListener("click",()=>{dom.taskIntent.value="";navigate("setup-screen");dom.taskIntent.focus();});
    dom.reportHistoryBtn.addEventListener("click",()=>navigate("history-screen"));dom.historyStartBtn.addEventListener("click",()=>navigate("setup-screen"));
    [dom.historySearch,dom.historyDateFrom,dom.historyDateTo,dom.historySort,dom.historyTagFilter].filter(Boolean).forEach(el=>el.addEventListener("input",renderHistory));
    dom.goalTag?.addEventListener("change", syncTagCustomVisibility);
    const persistPrefToggle = async (key, checked, needsPermission) => {
      state.prefs[key] = checked;
      if (checked && needsPermission && "Notification" in window && Notification.permission === "default") {
        try { await Notification.requestPermission(); } catch (_) {}
      }
      if (checked && needsPermission && "Notification" in window && Notification.permission !== "granted") {
        state.prefs[key] = false;
        if (key === "notifyEnd" && dom.prefNotifyEnd) dom.prefNotifyEnd.checked = false;
        if (key === "notifyBreak" && dom.prefNotifyBreak) dom.prefNotifyBreak.checked = false;
        showToast("Notification permission was not granted.");
      }
      if (!savePrefs()) showToast("Could not save preferences — browser storage unavailable.");
    };
    dom.prefNotifyEnd?.addEventListener("change", () => persistPrefToggle("notifyEnd", dom.prefNotifyEnd.checked, true));
    dom.prefNotifyBreak?.addEventListener("change", () => persistPrefToggle("notifyBreak", dom.prefNotifyBreak.checked, true));
    dom.prefPomodoro?.addEventListener("change", () => {
      state.prefs.pomodoro = dom.prefPomodoro.checked;
      if (!savePrefs()) showToast("Could not save preferences — browser storage unavailable.");
    });
    dom.prefChime?.addEventListener("change", () => {
      state.prefs.chime = ["off", "soft", "full"].includes(dom.prefChime.value) ? dom.prefChime.value : "soft";
      if (!savePrefs()) showToast("Could not save preferences — browser storage unavailable.");
    });
    dom.setupEditGoalsBtn?.addEventListener("click", () => {
      navigate("insights-screen");
      dom.goalDailySlider?.focus();
    });
    const bindGoalEditor = (kind) => {
      const slider = kind === "daily" ? dom.goalDailySlider : dom.goalWeeklySlider;
      const hours = kind === "daily" ? dom.goalDailyHours : dom.goalWeeklyHours;
      const mins = kind === "daily" ? dom.goalDailyMins : dom.goalWeeklyMins;
      const onSlider = () => {
        syncGoalEditor(kind, Number(slider.value));
      };
      const onFields = () => {
        syncGoalEditor(kind, readGoalMinutesFromDom(kind));
      };
      slider?.addEventListener("input", onSlider);
      hours?.addEventListener("input", onFields);
      mins?.addEventListener("input", onFields);
      hours?.addEventListener("change", onFields);
      mins?.addEventListener("change", onFields);
    };
    bindGoalEditor("daily");
    bindGoalEditor("weekly");
    dom.saveFocusGoalsBtn?.addEventListener("click", saveFocusGoalsFromDom);
    dom.shareWeekCardBtn?.addEventListener("click", downloadWeekCard);
    dom.exportCsvBtn.addEventListener("click",exportCsv);dom.exportJsonBtn.addEventListener("click",exportJson);dom.importJsonInput.addEventListener("change",()=>importJson(dom.importJsonInput.files?.[0]));dom.clearHistoryBtn.addEventListener("click",clearHistory);
    dom.reportTopic.addEventListener("input",()=>{state.reportDirty=true;dom.reportSaveState.textContent="Unsaved changes";});
    dom.reportNotes.addEventListener("input",()=>{state.reportDirty=true;dom.reportSaveState.textContent="Unsaved changes";});
    document.querySelector("#report-save-btn").addEventListener("click",saveReportNotes);
    dom.noteCaptureForm.addEventListener("submit",e=>{e.preventDefault();addInboxNote();});dom.notesSearch.addEventListener("input",renderNotes);
    dom.shortSave.addEventListener("click",()=>{dom.shortDialog.close();askConfirm("Save short attempt?","Save it as an incomplete attempt. It will not count as completed.",()=>finishSession("ended","Ended early.",false),"Save attempt");});
    dom.shortDiscard.addEventListener("click",()=>{dom.shortDialog.close();finishSession("ended","Discarded because it was under one minute.",true);});
    dom.confirmDialog.addEventListener("close",()=>{const a=state.confirmAction;state.confirmAction=null;if(dom.confirmDialog.returnValue==="confirm"&&a)a();});
    dom.editCancel.addEventListener("click",()=>{state.editingId=null;dom.editDialog.close();});
    dom.editDelete.addEventListener("click",()=>{const id=state.editingId;state.editingId=null;dom.editDialog.close();if(id)deleteSession(id);});
    dom.editForm.addEventListener("submit",e=>{e.preventDefault();saveEdit();});
    dom.editOpenNotes?.addEventListener("click",()=>{
      if (!state.editingId) return;
      const id = state.editingId;
      openSessionNotesViewer(id);
    });
    dom.viewNotesClose?.addEventListener("click", closeSessionNotesViewer);
    dom.viewNotesDialog?.addEventListener("close", () => { state.viewingNotesId = null; });
    dom.viewNoteAdd?.addEventListener("click", addNoteToViewedSession);
    dom.viewNoteInput?.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); addNoteToViewedSession(); }
    });
    dom.viewNotesOpenTab?.addEventListener("click", () => {
      const item = state.history.find((r) => r.id === state.viewingNotesId);
      closeSessionNotesViewer();
      if (dom.editDialog?.open) { state.editingId = null; dom.editDialog.close(); }
      if (item && dom.notesSearch) dom.notesSearch.value = item.intent;
      navigate("notes-screen");
    });
    dom.editNoteCancel?.addEventListener("click",()=>{state.editingNote=null;dom.editNoteDialog.close();});
    dom.editNoteDelete?.addEventListener("click",deleteEditedNote);
    dom.editNoteForm?.addEventListener("submit",(e)=>{e.preventDefault();saveEditedNote();});
    document.addEventListener("keydown",handleKeyboard);
    window.addEventListener("popstate",()=>navigate(screenMap[location.hash.slice(1)]||"setup-screen",true));
    window.addEventListener("hashchange",()=>navigate(screenMap[location.hash.slice(1)]||"setup-screen",true));
    window.addEventListener("resize",()=>{
      if(innerWidth>760)closeMenu();
      if(state.activeScreen==="insights-screen") renderInsights();
    });
    document.addEventListener("visibilitychange",()=>{if(!document.hidden&&state.session){requestWakeLock();tick();}});
    window.addEventListener("beforeunload",(e)=>{if(state.reportDirty){e.preventDefault();e.returnValue="";}if(state.session){safeWrite(ACTIVE_SESSION_KEY,state.session);}});
    dom.backToTop.addEventListener("click",()=>scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion:reduce)").matches?"auto":"smooth"}));
    window.addEventListener("scroll",()=>{const show=scrollY>500;dom.backToTop.classList.toggle("is-visible",show);dom.backToTop.tabIndex=show?0:-1;},{passive:true});
  }

  function init() {
    loadData();initTheme();applyPrefsToDom();syncTagCustomVisibility();bindEvents();initSync();
    try{dom.keyboardShortcuts.checked=localStorage.getItem("locked_in_keyboard_shortcuts")!=="false";}catch(_){}
    dom.keyboardShortcuts.addEventListener("change",()=>{try{localStorage.setItem("locked_in_keyboard_shortcuts",String(dom.keyboardShortcuts.checked));}catch(_){}});
    dom.currentYear.textContent=new Date().getFullYear();
    const initial=screenMap[location.hash.slice(1)]||"setup-screen";
    navigate(initial,true);
    renderAll();
    restoreActiveSession();
    try{localStorage.setItem("locked_in_app_version","3.1.0");}catch(_){}
  }

  init();
})();