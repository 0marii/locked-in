/* Locked-In — local-first focus timer.
   No backend, dependencies, or build step required. */
(() => {
  "use strict";

  const HISTORY_KEY = "locked_in_history_v2";
  const ACTIVE_KEY = "locked_in_active_session_v1";
  const SETTINGS_KEY = "locked_in_settings_v1";
  const HARDCORE_LIMIT_MS = 15 * 60 * 1000;

  const $ = (id) => document.getElementById(id);
  const dom = {
    screens: [...document.querySelectorAll(".screen")],
    setup: $("setup-screen"), timer: $("timer-screen"), report: $("report-screen"), history: $("history-screen"),
    form: $("session-form"), intent: $("task-intent"), hours: $("duration-hours"), minutes: $("duration-minutes"),
    presets: [...document.querySelectorAll("[data-minutes]")], style: $("session-style"), hardcore: $("hardcore-mode"),
    setupError: $("setup-error"), status: $("status-badge"), displayIntent: $("display-intent"),
    styleLabel: $("session-style-label"), time: $("time-display"), timerCaption: $("timer-caption"),
    ring: $("timer-ring-progress"), breakWrapper: $("break-display-wrapper"), breakTimer: $("break-timer"),
    breakBtn: $("break-btn"), stopBtn: $("stop-btn"), focusHelp: $("focus-help"),
    reportBadge: $("report-type-badge"), reportTitle: $("report-title"), reportSubtitle: $("report-subtitle"),
    efficiency: $("efficiency-percent"), efficiencyBar: $("efficiency-bar"), stars: $("stars-display"),
    rank: $("rank-display"), verdict: $("judge-verdict"), repIntent: $("rep-intent"),
    repFocus: $("rep-focus"), repClock: $("rep-clock"), repBreaks: $("rep-breaks"), repPlanned: $("rep-planned"),
    breakListWrap: $("break-breakdown-wrapper"), breakList: $("break-breakdown-list"),
    reflection: $("session-reflection"), newSession: $("new-session-btn"), reportHistory: $("report-history-btn"),
    historyBody: $("history-table-body"), search: $("history-search"), historyMessage: $("history-message"),
    weeklyFocus: $("weekly-focus"), weeklySessions: $("weekly-sessions"), weeklyAverage: $("weekly-average"),
    weekBars: $("week-bars"), weekLabels: $("week-labels"),
    allFocus: $("all-time-focus"), allSessions: $("all-time-sessions"), allAverage: $("all-time-average"),
    themeToggle: $("theme-toggle"), importInput: $("import-json-input")
  };

  const state = {
    session: null,
    intervalId: null,
    history: loadHistory(),
    settings: loadSettings(),
    reportRecordId: null,
    selectedPreset: 25
  };

  function safeRead(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      console.warn(`Could not read ${key}:`, error);
      return fallback;
    }
  }

  function safeWrite(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Could not save ${key}:`, error);
      return false;
    }
  }

  function loadHistory() {
    const value = safeRead(HISTORY_KEY, null);
    if (Array.isArray(value)) return value.filter(isValidRecord);
    // One-time migration from the original app's history key.
    const old = safeRead("focusforge_history_v1", []);
    if (!Array.isArray(old)) return [];
    return old.map((item) => ({
      id: createId(),
      date: item.date || new Date().toISOString(),
      intent: String(item.intent || "Untitled session"),
      style: "deep-work",
      plannedSeconds: Number(item.focusSecs) || 0,
      focusSeconds: Number(item.focusSecs) || 0,
      elapsedSeconds: Number(item.clockSecs) || 0,
      breakSeconds: Math.max(0, (Number(item.clockSecs) || 0) - (Number(item.focusSecs) || 0)),
      breaks: [],
      efficiency: clamp(Number(item.efficiency) || 0, 0, 100),
      outcome: "migrated",
      hardcore: false,
      reflection: ""
    })).filter(isValidRecord);
  }

  function loadSettings() {
    const settings = safeRead(SETTINGS_KEY, {});
    return {
      theme: settings && settings.theme === "light" ? "light" : "dark",
      sound: settings?.sound !== false
    };
  }

  function isValidRecord(item) {
    return item && typeof item === "object" &&
      typeof item.id === "string" &&
      typeof item.intent === "string" &&
      Number.isFinite(Number(item.focusSeconds)) &&
      Number.isFinite(Number(item.elapsedSeconds));
  }

  function persistHistory() {
    const ok = safeWrite(HISTORY_KEY, state.history);
    if (!ok) showHistoryMessage("Could not save changes. Export a backup and free browser storage space.", true);
    return ok;
  }

  function persistActive() {
    if (!state.session || state.session.saved) {
      try { localStorage.removeItem(ACTIVE_KEY); } catch (error) { console.warn(error); }
      return;
    }
    if (!safeWrite(ACTIVE_KEY, state.session)) {
      showSetupError("Your browser could not save this session. Please export your history and free some storage.");
    }
  }

  function createId() {
    return globalThis.crypto?.randomUUID?.() ||
      `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatClock(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
    return `${m}m ${String(s).padStart(2, "0")}s`;
  }

  function formatShort(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
  }

  function showScreen(screen) {
    dom.screens.forEach((item) => item.classList.toggle("active", item === screen));
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    const heading = screen.querySelector("h1");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  }

  function showSetupError(message) {
    dom.setupError.textContent = message;
    dom.setupError.hidden = !message;
  }

  function showHistoryMessage(message, isError = false) {
    dom.historyMessage.textContent = message;
    dom.historyMessage.classList.toggle("error-text", isError);
  }

  function getDurationSeconds() {
    const hours = Number(dom.hours.value);
    const minutes = Number(dom.minutes.value);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes) ||
        hours < 0 || hours > 12 || minutes < 0 || minutes > 59) return null;
    const seconds = hours * 3600 + minutes * 60;
    return seconds >= 60 && seconds <= 12 * 3600 ? seconds : null;
  }

  function selectPreset(minutes) {
    state.selectedPreset = minutes;
    dom.presets.forEach((button) => {
      button.classList.toggle("selected", Number(button.dataset.minutes) === minutes);
      button.setAttribute("aria-pressed", String(Number(button.dataset.minutes) === minutes));
    });
    dom.hours.value = String(Math.floor(minutes / 60));
    dom.minutes.value = String(minutes % 60);
    showSetupError("");
  }

  function getFocusElapsedMs(session, now = Date.now()) {
    let elapsed = Math.max(0, now - session.startedAt);
    for (const item of session.breaks) {
      elapsed -= Math.max(0, (item.endedAt ?? now) - item.startedAt);
    }
    if (session.currentBreakStartedAt) elapsed -= Math.max(0, now - session.currentBreakStartedAt);
    return Math.max(0, elapsed);
  }

  function getBreakElapsedMs(session, now = Date.now()) {
    const completed = session.breaks.reduce((sum, item) =>
      sum + Math.max(0, (item.endedAt ?? now) - item.startedAt), 0);
    const current = session.currentBreakStartedAt ? Math.max(0, now - session.currentBreakStartedAt) : 0;
    return completed + current;
  }

  function getRemainingSeconds(session, now = Date.now()) {
    if (session.currentBreakStartedAt) return Math.max(0, session.remainingAtBreakStart);
    return Math.max(0, Math.ceil((session.plannedSeconds * 1000 - getFocusElapsedMs(session, now)) / 1000));
  }

  function startSession(event) {
    event?.preventDefault();
    showSetupError("");
    const plannedSeconds = getDurationSeconds();
    if (!plannedSeconds) {
      showSetupError("Choose a valid duration between 1 minute and 12 hours.");
      return;
    }

    if (state.session && !confirm("A session is already in progress. End it and start a new one?")) return;

    const now = Date.now();
    state.session = {
      id: createId(),
      intent: dom.intent.value.trim() || "Unspecified objective",
      style: dom.style.value,
      plannedSeconds,
      startedAt: now,
      currentBreakStartedAt: null,
      remainingAtBreakStart: plannedSeconds,
      breaks: [],
      hardcore: dom.hardcore.checked,
      outcome: "in-progress",
      saved: false,
      reflection: ""
    };
    dom.displayIntent.textContent = state.session.intent;
    dom.styleLabel.textContent = `${state.session.style.replaceAll("-", " ")} SESSION`.toUpperCase();
    dom.status.innerHTML = '<span class="dot"></span> FOCUSING';
    dom.status.classList.remove("on-break");
    dom.breakBtn.innerHTML = 'Take a break <kbd>B</kbd>';
    dom.breakWrapper.hidden = true;
    dom.focusHelp.textContent = "Protect this time. You can take a tracked break whenever you need one.";
    dom.timerCaption.textContent = "TIME TO FOCUS";
    showScreen(dom.timer);
    persistActive();
    renderTimer();
    startTicker();
  }

  function startTicker() {
    clearInterval(state.intervalId);
    state.intervalId = setInterval(tick, 250);
    tick();
  }

  function tick() {
    const session = state.session;
    if (!session || session.saved) return;
    const now = Date.now();

    if (session.currentBreakStartedAt && session.hardcore &&
        now - session.currentBreakStartedAt >= HARDCORE_LIMIT_MS) {
      finishSession("hardcore-failed");
      return;
    }

    if (!session.currentBreakStartedAt && getRemainingSeconds(session, now) <= 0) {
      finishSession("completed");
      return;
    }
    renderTimer(now);
  }

  function renderTimer(now = Date.now()) {
    const session = state.session;
    if (!session) return;
    const remaining = getRemainingSeconds(session, now);
    dom.time.textContent = formatClock(remaining);
    const focusElapsed = getFocusElapsedMs(session, now);
    const progress = clamp(focusElapsed / (session.plannedSeconds * 1000), 0, 1);
    dom.ring.style.strokeDashoffset = String(728.85 * (1 - progress));
    dom.ring.classList.toggle("break-progress", Boolean(session.currentBreakStartedAt));

    if (session.currentBreakStartedAt) {
      const elapsed = Math.floor((now - session.currentBreakStartedAt) / 1000);
      dom.breakWrapper.hidden = false;
      dom.breakTimer.textContent = formatClock(elapsed);
      dom.status.innerHTML = '<span class="dot"></span> ON BREAK';
      dom.status.classList.add("on-break");
      dom.breakBtn.innerHTML = 'Resume focus <kbd>B</kbd>';
      dom.timerCaption.textContent = "BREAK IN PROGRESS";
      dom.focusHelp.textContent = session.hardcore
        ? `Hardcore mode: a break must stay under 15 minutes. ${formatClock(Math.max(0, 900 - elapsed))} remaining.`
        : "Take the time you need, then return when you're ready.";
    } else {
      dom.breakWrapper.hidden = true;
      dom.status.innerHTML = '<span class="dot"></span> FOCUSING';
      dom.status.classList.remove("on-break");
      dom.breakBtn.innerHTML = 'Take a break <kbd>B</kbd>';
      dom.timerCaption.textContent = "TIME TO FOCUS";
      dom.focusHelp.textContent = `${formatDuration(Math.floor(focusElapsed / 1000))} focused so far`;
    }
  }

  function toggleBreak() {
    const session = state.session;
    if (!session || session.saved) return;
    const now = Date.now();

    if (!session.currentBreakStartedAt) {
      session.remainingAtBreakStart = getRemainingSeconds(session, now);
      session.currentBreakStartedAt = now;
    } else {
      const duration = Math.max(0, now - session.currentBreakStartedAt);
      session.breaks.push({ startedAt: session.currentBreakStartedAt, endedAt: now, durationMs: duration });
      session.currentBreakStartedAt = null;
      if (session.hardcore && duration >= HARDCORE_LIMIT_MS) {
        finishSession("hardcore-failed");
        return;
      }
    }
    persistActive();
    tick();
  }

  function classifyScore(efficiency, outcome) {
    if (outcome === "hardcore-failed") return { stars: "☆☆☆☆☆", rank: "Hardcore limit reached", verdict: "This session ended because a break reached 15 minutes.", tone: "danger" };
    if (outcome === "abandoned") return { stars: "☆☆☆☆☆", rank: "Session ended early", verdict: "You stopped this session early. The time you focused still counts.", tone: "warning" };
    if (efficiency >= 96) return { stars: "★★★★★", rank: "Highly consistent", verdict: "Very little time was spent away from the session. Nice consistency.", tone: "success" };
    if (efficiency >= 89) return { stars: "★★★★☆", rank: "Strong focus", verdict: "You kept a steady pace with a small amount of break time.", tone: "success" };
    if (efficiency >= 80) return { stars: "★★★☆☆", rank: "Balanced session", verdict: "A balanced session. Review your breaks if you want to tighten the rhythm.", tone: "warning" };
    if (efficiency >= 66) return { stars: "★★☆☆☆", rank: "Room to improve", verdict: "There was a fair amount of break time. Consider shorter focus blocks next time.", tone: "warning" };
    return { stars: "★☆☆☆☆", rank: "A session to learn from", verdict: "Every session gives you information. Try a smaller, clearer target next time.", tone: "danger" };
  }

  function finishSession(outcome = "abandoned") {
    const session = state.session;
    if (!session || session.saved) return;
    clearInterval(state.intervalId);
    state.intervalId = null;

    const endedAt = Date.now();
    if (session.currentBreakStartedAt) {
      session.breaks.push({
        startedAt: session.currentBreakStartedAt,
        endedAt,
        durationMs: Math.max(0, endedAt - session.currentBreakStartedAt)
      });
      session.currentBreakStartedAt = null;
    }

    const focusSeconds = Math.min(session.plannedSeconds, Math.floor(getFocusElapsedMs(session, endedAt) / 1000));
    const elapsedSeconds = Math.max(0, Math.floor((endedAt - session.startedAt) / 1000));
    const breakSeconds = Math.max(0, elapsedSeconds - focusSeconds);
    const efficiency = elapsedSeconds > 0 ? clamp((focusSeconds / elapsedSeconds) * 100, 0, 100) : 0;
    const record = {
      id: session.id,
      date: new Date(endedAt).toISOString(),
      intent: session.intent,
      style: session.style,
      plannedSeconds: session.plannedSeconds,
      focusSeconds,
      elapsedSeconds,
      breakSeconds,
      breaks: session.breaks.map((item) => ({
        startedAt: new Date(item.startedAt).toISOString(),
        endedAt: new Date(item.endedAt).toISOString(),
        durationSeconds: Math.floor(item.durationMs / 1000)
      })),
      efficiency: Number(efficiency.toFixed(1)),
      outcome,
      hardcore: session.hardcore,
      reflection: ""
    };

    session.saved = true;
    session.outcome = outcome;
    state.history.unshift(record);
    state.history = state.history.slice(0, 5000);
    persistHistory();
    persistActive();
    state.reportRecordId = record.id;
    renderReport(record);
    renderDashboard();
    showScreen(dom.report);
  }

  function renderReport(record) {
    const score = classifyScore(record.efficiency, record.outcome);
    dom.reportBadge.textContent = record.outcome === "completed" ? "SESSION COMPLETED" :
      record.outcome === "hardcore-failed" ? "HARDCORE LIMIT REACHED" : "STOPPED EARLY";
    dom.reportTitle.textContent = record.outcome === "completed" ? "You showed up." : "Every session counts.";
    dom.reportSubtitle.textContent = record.outcome === "completed"
      ? "Progress is built one session at a time."
      : "Use this session as information, not a reason to give up.";
    dom.efficiency.textContent = `${record.efficiency.toFixed(1)}%`;
    dom.efficiencyBar.style.width = `${record.efficiency}%`;
    dom.stars.textContent = score.stars;
    dom.rank.textContent = score.rank;
    dom.verdict.textContent = score.verdict;
    dom.repIntent.textContent = record.intent;
    dom.repFocus.textContent = formatDuration(record.focusSeconds);
    dom.repClock.textContent = formatDuration(record.elapsedSeconds);
    dom.repBreaks.textContent = `${record.breaks.length} · ${formatDuration(record.breakSeconds)}`;
    dom.repPlanned.textContent = formatDuration(record.plannedSeconds);
    dom.reflection.value = record.reflection || "";

    if (record.breaks.length) {
      dom.breakListWrap.hidden = false;
      dom.breakList.replaceChildren();
      record.breaks.forEach((item, index) => {
        const li = document.createElement("li");
        li.textContent = `Break ${index + 1} — ${formatDuration(item.durationSeconds)}`;
        dom.breakList.appendChild(li);
      });
    } else {
      dom.breakListWrap.hidden = true;
      dom.breakList.replaceChildren();
    }
  }

  function saveReflection() {
    if (!state.reportRecordId) return;
    const record = state.history.find((item) => item.id === state.reportRecordId);
    if (!record) return;
    record.reflection = dom.reflection.value.trim().slice(0, 500);
    persistHistory();
  }

  function renderDashboard() {
    const now = new Date();
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    const day = (monday.getDay() + 6) % 7;
    monday.setDate(monday.getDate() - day);
    const weekRecords = state.history.filter((item) => new Date(item.date) >= monday);
    const focus = weekRecords.reduce((sum, item) => sum + item.focusSeconds, 0);
    const average = weekRecords.length ? weekRecords.reduce((sum, item) => sum + item.efficiency, 0) / weekRecords.length : null;
    dom.weeklyFocus.textContent = formatShort(focus);
    dom.weeklySessions.textContent = String(weekRecords.length);
    dom.weeklyAverage.textContent = average === null ? "—" : `${Math.round(average)}%`;

    const days = [];
    for (let offset = 6; offset >= 0; offset--) {
      const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - offset);
      const key = date.toDateString();
      const seconds = state.history.filter((item) => new Date(item.date).toDateString() === key)
        .reduce((sum, item) => sum + item.focusSeconds, 0);
      days.push({ label: date.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 1), seconds });
    }
    const max = Math.max(1, ...days.map((item) => item.seconds));
    dom.weekBars.replaceChildren();
    dom.weekLabels.replaceChildren();
    days.forEach((item) => {
      const bar = document.createElement("div");
      bar.className = "week-bar";
      bar.style.height = `${Math.max(4, (item.seconds / max) * 54)}px`;
      bar.title = `${formatDuration(item.seconds)} focused`;
      bar.setAttribute("aria-label", `${item.label}: ${formatDuration(item.seconds)}`);
      dom.weekBars.appendChild(bar);
      const label = document.createElement("span"); label.textContent = item.label; dom.weekLabels.appendChild(label);
    });

    const total = state.history.reduce((sum, item) => sum + item.focusSeconds, 0);
    const avg = state.history.length ? state.history.reduce((sum, item) => sum + item.efficiency, 0) / state.history.length : null;
    dom.allFocus.textContent = formatShort(total);
    dom.allSessions.textContent = String(state.history.length);
    dom.allAverage.textContent = avg === null ? "—" : `${Math.round(avg)}%`;
  }

  function renderHistory() {
    const query = dom.search.value.trim().toLowerCase();
    const records = state.history.filter((item) => item.intent.toLowerCase().includes(query));
    dom.historyBody.replaceChildren();

    if (!records.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.className = "empty-cell";
      cell.textContent = query ? "No sessions match your search." : "No sessions yet. Start a focus session to see it here.";
      row.appendChild(cell);
      dom.historyBody.appendChild(row);
      return;
    }

    records.forEach((item) => {
      const row = document.createElement("tr");
      const values = [
        new Date(item.date).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        item.intent,
        formatDuration(item.focusSeconds),
        formatDuration(item.elapsedSeconds),
        `${Number(item.efficiency).toFixed(1)}%`,
        item.outcome === "completed" ? "Completed" : item.outcome === "hardcore-failed" ? "Hardcore fail" : item.outcome === "migrated" ? "Imported" : "Stopped early"
      ];
      values.forEach((value, index) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        if (index === 1) cell.className = "goal-cell";
        row.appendChild(cell);
      });
      dom.historyBody.appendChild(row);
    });
  }

  function openHistory() {
    renderHistory();
    renderDashboard();
    showHistoryMessage("");
    showScreen(dom.history);
  }

  function csvEscape(value) {
    let text = String(value ?? "");
    // Avoid spreadsheet formula injection for cells starting with formula markers.
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCsv() {
    if (!state.history.length) { showHistoryMessage("There is no session history to export.", true); return; }
    const headers = ["Date", "Goal", "Style", "PlannedSeconds", "FocusSeconds", "ElapsedSeconds", "BreakSeconds", "EfficiencyPercent", "Outcome", "Reflection"];
    const lines = [headers.map(csvEscape).join(",")];
    state.history.forEach((item) => {
      lines.push([
        item.date, item.intent, item.style, item.plannedSeconds, item.focusSeconds,
        item.elapsedSeconds, item.breakSeconds, item.efficiency, item.outcome, item.reflection
      ].map(csvEscape).join(","));
    });
    downloadFile(`locked-in-history-${new Date().toISOString().slice(0, 10)}.csv`, "\uFEFF" + lines.join("\r\n"), "text/csv;charset=utf-8");
    showHistoryMessage("CSV export created.");
  }

  function exportJson() {
    const backup = { app: "locked-in", schemaVersion: 2, exportedAt: new Date().toISOString(), sessions: state.history };
    downloadFile(`locked-in-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 2), "application/json");
    showHistoryMessage("Backup created. Keep it somewhere safe.");
  }

  async function importJson(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const records = Array.isArray(parsed) ? parsed : parsed.sessions;
      if (!Array.isArray(records) || !records.every(isValidRecord)) {
        throw new Error("This file does not contain a valid Locked-In session backup.");
      }
      const existingIds = new Set(state.history.map((item) => item.id));
      const imported = records.filter((item) => !existingIds.has(item.id));
      if (!imported.length) {
        showHistoryMessage("No new sessions found in this backup.");
        return;
      }
      if (!confirm(`Import ${imported.length} new session(s)? Existing sessions will be kept.`)) return;
      state.history = [...imported, ...state.history].slice(0, 5000);
      if (persistHistory()) {
        renderHistory(); renderDashboard();
        showHistoryMessage(`Restored ${imported.length} session(s).`);
      }
    } catch (error) {
      showHistoryMessage(error.message || "Could not read that backup file.", true);
    } finally {
      dom.importInput.value = "";
    }
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.settings.theme;
    dom.themeToggle.setAttribute("aria-label", state.settings.theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
  }

  dom.form.addEventListener("submit", startSession);
  dom.presets.forEach((button) => button.addEventListener("click", () => selectPreset(Number(button.dataset.minutes))));
  [dom.hours, dom.minutes].forEach((input) => input.addEventListener("input", () => {
    state.selectedPreset = null;
    dom.presets.forEach((button) => button.classList.remove("selected"));
    showSetupError("");
  }));
  $("view-history-btn").addEventListener("click", openHistory);
  $("back-to-setup-btn").addEventListener("click", () => showScreen(dom.setup));
  dom.reportHistory.addEventListener("click", openHistory);
  dom.newSession.addEventListener("click", () => {
    state.session = null; persistActive(); showScreen(dom.setup); dom.intent.focus();
  });
  $("minimize-session-btn").addEventListener("click", () => {
    if (state.session && confirm("Your session will keep running. Return to setup?")) showScreen(dom.setup);
  });
  dom.breakBtn.addEventListener("click", toggleBreak);
  dom.stopBtn.addEventListener("click", () => {
    if (confirm("End this session now? Your focused time will still be recorded.")) finishSession("abandoned");
  });
  dom.search.addEventListener("input", renderHistory);
  $("export-csv-btn").addEventListener("click", exportCsv);
  $("export-json-btn").addEventListener("click", exportJson);
  dom.importInput.addEventListener("change", () => importJson(dom.importInput.files?.[0]));
  $("clear-history-btn").addEventListener("click", () => {
    if (!state.history.length) { showHistoryMessage("History is already empty."); return; }
    if (!confirm("Delete all saved sessions from this browser? Export a backup first if you may need them.")) return;
    const previous = state.history;
    state.history = [];
    if (persistHistory()) {
      renderHistory(); renderDashboard(); showHistoryMessage("History cleared.");
    } else {
      state.history = previous;
    }
  });
  dom.reflection.addEventListener("change", saveReflection);
  dom.themeToggle.addEventListener("click", () => {
    state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
    safeWrite(SETTINGS_KEY, state.settings); applyTheme();
  });

  window.addEventListener("keydown", (event) => {
    const target = event.target;
    const isTyping = target instanceof HTMLElement &&
      (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName));
    if (isTyping || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key.toLowerCase() === "b" && state.session && !state.session.saved) {
      event.preventDefault(); toggleBreak();
    }
    if (event.key.toLowerCase() === "s" && state.session && !state.session.saved) {
      event.preventDefault();
      if (confirm("End this session now? Your focused time will still be recorded.")) finishSession("abandoned");
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.session && !state.session.saved) tick();
  });
  window.addEventListener("pageshow", () => {
    if (state.session && !state.session.saved) tick();
  });
  window.addEventListener("beforeunload", () => {
    if (state.session && !state.session.saved) persistActive();
  });

  function recoverActiveSession() {
    const saved = safeRead(ACTIVE_KEY, null);
    if (!saved || !saved.id || saved.saved || !saved.startedAt || !saved.plannedSeconds) return;
    if (!confirm("A focus session was in progress when you last left. Resume it?")) {
      // Do not silently discard it; offer to resume on the next visit.
      return;
    }
    state.session = saved;
    dom.displayIntent.textContent = saved.intent || "Unspecified objective";
    dom.styleLabel.textContent = `${String(saved.style || "deep-work").replaceAll("-", " ")} SESSION`.toUpperCase();
    showScreen(dom.timer);
    startTicker();
  }

  $("current-year").textContent = String(new Date().getFullYear());
  applyTheme();
  renderDashboard();
  recoverActiveSession();
})();
