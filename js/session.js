import { ACTIVE_SESSION_KEY, BREAK_REMINDER_MS, HARDCORE_BREAK_LIMIT_SECONDS, MAX_HISTORY, MIN_SAVED_FOCUS_SECONDS } from "./constants.js?v=76";
import { dom, state, tabId } from "./runtime.js?v=76";
import { safeRead, safeWrite } from "./storage.js?v=76";
import { showToast } from "./toast.js?v=76";
import { formatClock, formatDate, formatDuration, normalizePomodoroMinutes, scoreFor } from "./utils.js?v=76";
import { broadcast } from "./sync.js?v=76";
import { navigate } from "./theme-nav.js?v=76";
import { currentTagValue, pomodoroIntervalSeconds, rememberRecentGoal, renderRecentGoals, resetSetupFormDefaults } from "./setup.js?v=76";
import { renderReportNotesList, saveHistory, syncLiveHistoryRow } from "./history.js?v=76";
import { composeNotesText, createNoteItemOptions, deleteEditedNote, ensureNoteItems, openNoteEditor, refreshNotesSurfaces } from "./notes.js?v=76";

export function normalizeRecord(record) {
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

export function persistSessionNotes() {
  if (!state.session) return false;
  state.session.notes = composeNotesText(ensureNoteItems(state.session));
  if (!safeWrite(ACTIVE_SESSION_KEY, state.session)) return false;
  state.lastPersistedAt = Date.now();
  return true;
}

export function notify(title, body) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
      new Notification(title, { body, icon: "./assets/icon-192.png", badge: "./assets/icon-192.png", silent: false });
  } catch (_) {}
}

export function requestNotificationPermission() {
  if (!("Notification" in window)) return Promise.resolve("denied");
  if (Notification.permission === "granted") return Promise.resolve("granted");
  if (Notification.permission === "denied") return Promise.resolve("denied");
  try {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (permission) => {
        if (settled) return;
        settled = true;
        resolve(permission || Notification.permission || "denied");
      };
      const result = Notification.requestPermission(finish);
      if (result && typeof result.then === "function") {
        result.then(finish).catch(() => finish(Notification.permission || "denied"));
      }
    });
  } catch (_) {
    return Promise.resolve(Notification.permission || "denied");
  }
}

export function clearBreakReminder() {
  if (state.breakReminderTimer) {
    clearTimeout(state.breakReminderTimer);
    state.breakReminderTimer = null;
  }
}

export function scheduleBreakReminder() {
  clearBreakReminder();
  if (!state.prefs.notifyBreak || !("Notification" in window) || Notification.permission !== "granted") return;
  state.breakReminderTimer = setTimeout(() => {
    state.breakReminderTimer = null;
    if (!state.session?.currentBreakStartedAt) return;
    notify("Still on break", "You’ve been on break for 5 minutes. Resume when you’re ready.");
  }, BREAK_REMINDER_MS);
}

export function parseDuration() {
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

export function activeFocusSeconds(s, now = Date.now()) {
  return s.accumulatedFocusSeconds + (!s.currentBreakStartedAt && s.activeWorkStartedAt ? Math.max(0, (now - s.activeWorkStartedAt) / 1000) : 0);
}

export function currentBreakSeconds(s, now = Date.now()) {
  return s.breakSeconds + (s.currentBreakStartedAt ? Math.max(0, (now - s.currentBreakStartedAt) / 1000) : 0);
}

export function elapsedSeconds(s, now = Date.now()) { return Math.max(0, (now - s.startedAt) / 1000); }

export async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try { const lock = await navigator.wakeLock.request("screen"); if (state.session) state.wakeLock = lock; else await lock.release(); } catch (_) {}
}

export async function releaseWakeLock() {
  try { await state.wakeLock?.release(); } catch (_) {}
  state.wakeLock = null;
}

export function startSession(event) {
  event?.preventDefault();
  if (state.readOnly) { showToast("This tab is read-only because another tab owns the active session."); return; }
  if (state.session) {
    resetSetupFormDefaults();
    navigate("timer-screen");
    return;
  }
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
  resetSetupFormDefaults();
  broadcast({type:"active-session", source:tabId, sessionId:state.session.id});
  state.lastPersistedAt = now;
  state.pomodoroNotifiedBucket = -1;
  clearBreakReminder();
  dom.reportTopic.value = "";
  if (dom.reportNoteInput) dom.reportNoteInput.value = "";
  if (dom.reportNotesList) dom.reportNotesList.replaceChildren();
  resetStickyNotes();
  renderRecentGoals();
  navigate("timer-screen");
  requestWakeLock();
  startTimerLoop();
  renderTimer(now);
}

export function setStickyState(text, dataState = "saved") {
  if (!dom.stickyNotesState) return;
  dom.stickyNotesState.textContent = text;
  dom.stickyNotesState.dataset.state = dataState;
}

export function resetStickyNotes() {
  state.stickyDirty = false;
  state.stickyOpen = false;
  if (dom.stickyNotesInput) dom.stickyNotesInput.value = "";
  setStickyState("Ready", "saved");
  renderStickyNoteList();
  syncStickyNotesUi();
}

export function setStickyNotesOpen(open) {
  state.stickyOpen = Boolean(open);
  syncStickyNotesUi();
  if (state.stickyOpen) dom.stickyNotesInput?.focus();
}

export function syncStickyNotesUi() {
  const active = Boolean(state.session) && state.activeScreen === "timer-screen" && !state.readOnly;
  const count = state.session ? ensureNoteItems(state.session).length : 0;
  const open = active && state.stickyOpen;
  if (dom.stickyNotes) {
    dom.stickyNotes.hidden = !active;
    dom.stickyNotes.classList.toggle("is-open", open);
  }
  if (dom.stickyNotesToggle) {
    dom.stickyNotesToggle.setAttribute("aria-expanded", String(open));
    dom.stickyNotesToggle.setAttribute(
      "aria-label",
      open
        ? "Close session notes"
        : count
          ? `Add a session note, ${count} saved`
          : "Add a session note"
    );
  }
  if (dom.stickyNotesBody) dom.stickyNotesBody.hidden = !open;
  if (dom.stickyNotesCount) {
    dom.stickyNotesCount.textContent = count ? String(count) : "";
  }
  if (dom.stickyNotesHint) {
    if (open) dom.stickyNotesHint.textContent = "Close";
    else if (count) dom.stickyNotesHint.textContent = "Notes";
    else dom.stickyNotesHint.textContent = "Add note";
  }
  if (active) renderStickyNoteList();
}

export function renderStickyNoteList() {
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
  items.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "sticky-note-item";
    const text = document.createElement("p");
    text.textContent = item.text;
    const meta = document.createElement("div");
    meta.className = "sticky-note-item-meta";
    const time = document.createElement("small");
    time.textContent = formatDate(item.createdAt);
    const actions = document.createElement("div");
    actions.className = "note-card-actions";
    const session = state.session;
    actions.append(createNoteItemOptions({
      text: item.text,
      label: `${session?.intent || "session"}-${index + 1}`,
      onEdit: () => openNoteEditor({
        scope: "live",
        sessionId: session.id,
        noteId: item.id,
        intent: session.intent,
        live: true,
        text: item.text
      }),
      onDelete: () => {
        state.editingNote = {
          scope: "live",
          sessionId: session.id,
          noteId: item.id,
          intent: session.intent,
          live: true,
          text: item.text
        };
        deleteEditedNote();
      }
    }));
    meta.append(time, actions);
    li.append(text, meta);
    dom.stickyNotesList.append(li);
  });
}

export function addStickyNote(silent = false) {
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
  state.stickyOpen = true;
  setStickyState(`Added · ${items.length} note${items.length === 1 ? "" : "s"}`, "saved");
  renderStickyNoteList();
  syncStickyNotesUi();
  refreshNotesSurfaces();
  if (!silent) showToast("Note added to this session.");
  return true;
}

export function deleteStickyNote(id) {
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

export function startTimerLoop() {
  stopTimerLoop();
  state.intervalId = setInterval(tick, 250);
}

export function stopTimerLoop() {
  if (state.intervalId) clearInterval(state.intervalId);
  state.intervalId = null;
}

export function tick() {
  const s = state.session;
  if (!s) return;
  const now = Date.now();
  const breakTotal = currentBreakSeconds(s, now);
  if (s.hardcore && breakTotal >= HARDCORE_BREAK_LIMIT_SECONDS) {
    finishSession("failed", "Hardcore break limit reached.", false);
    return;
  }
  if (!s.currentBreakStartedAt) {
    s.remainingSeconds = Math.max(0, s.targetSeconds - activeFocusSeconds(s, now));
    if (s.remainingSeconds <= 0) { finishSession("completed", "Target duration reached.", false); return; }
    if (state.prefs.pomodoro) {
      const intervalSec = pomodoroIntervalSeconds();
      const intervalMin = normalizePomodoroMinutes(state.prefs.pomodoroMinutes);
      const focus = activeFocusSeconds(s, now);
      const bucket = Math.floor(focus / intervalSec);
      if (bucket > 0 && bucket > state.pomodoroNotifiedBucket) {
        state.pomodoroNotifiedBucket = bucket;
        const focusedMin = bucket * intervalMin;
        showToast(`You’ve focused ${focusedMin} minutes — consider a short break.`);
        notify("Break suggestion", `You’ve focused ${focusedMin} minutes. A short break can help.`);
      }
    }
  }
  if (now - state.lastPersistedAt >= 3000) {
    safeWrite(ACTIVE_SESSION_KEY, s);
    state.lastPersistedAt = now;
  }
  renderTimer(now);
}

export function toggleBreak() {
  const s = state.session;
  if (!s || state.readOnly) return;
  const now = Date.now();
  if (!s.currentBreakStartedAt) {
    s.accumulatedFocusSeconds += Math.max(0, (now - s.activeWorkStartedAt) / 1000);
    s.activeWorkStartedAt = null; s.currentBreakStartedAt = now;
    showToast("Break started.");
    scheduleBreakReminder();
  } else {
    clearBreakReminder();
    const duration = Math.max(0, (now - s.currentBreakStartedAt) / 1000);
    s.breakSeconds += duration;
    s.breaks.push({startedAt:new Date(s.currentBreakStartedAt).toISOString(), endedAt:new Date(now).toISOString(), durationSeconds:Math.floor(duration)});
    s.currentBreakStartedAt = null; s.activeWorkStartedAt = now;
    if (s.hardcore && s.breakSeconds >= HARDCORE_BREAK_LIMIT_SECONDS) { finishSession("failed", "Hardcore break limit reached.", false); return; }
    showToast("Break ended. Focus resumed.");
  }
  safeWrite(ACTIVE_SESSION_KEY, s); state.lastPersistedAt = now; renderTimer(now);
}

function currentBreakElapsedSeconds(s, now = Date.now()) {
  if (!s?.currentBreakStartedAt) return 0;
  return Math.max(0, (now - s.currentBreakStartedAt) / 1000);
}

export function syncFloatingTimer(now = Date.now()) {
  syncLiveHistoryRow(now);
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
  const breakElapsed = currentBreakElapsedSeconds(s, now);
  const clock = onBreak
    ? formatClock(breakElapsed, breakElapsed >= 3600)
    : formatClock(remaining, s.targetSeconds >= 3600);
  dom.floatingTimer.classList.toggle("is-break", onBreak);
  if (dom.floatingTimerStatus) dom.floatingTimerStatus.textContent = onBreak ? "On break" : "Focusing";
  if (dom.floatingTimerIntent) dom.floatingTimerIntent.textContent = s.intent;
  if (dom.floatingTimerClock) dom.floatingTimerClock.textContent = clock;
  dom.floatingTimer.setAttribute(
    "aria-label",
    onBreak
      ? `Return to timer. On break: ${s.intent}, ${clock} elapsed`
      : `Return to timer. Focusing: ${s.intent}, ${clock} remaining`
  );
}

export function renderTimer(now = Date.now()) {
  const s = state.session; if (!s) return;
  const onBreak = Boolean(s.currentBreakStartedAt);
  const focus = activeFocusSeconds(s, now);
  const elapsed = elapsedSeconds(s, now);
  const breaks = currentBreakSeconds(s, now);
  const remaining = Math.max(0, s.targetSeconds - focus);
  const breakElapsed = currentBreakElapsedSeconds(s, now);
  const faceSeconds = onBreak ? breakElapsed : remaining;
  const faceClock = formatClock(faceSeconds, onBreak ? breakElapsed >= 3600 : s.targetSeconds >= 3600);
  dom.timerHeading.textContent = s.intent;
  if (onBreak) {
    dom.timerSubtitle.textContent = s.hardcore
      ? `On break · ${formatClock(breaks)} / 15:00 hardcore limit`
      : "On break · resume when you're ready";
  } else {
    dom.timerSubtitle.textContent = s.hardcore ? "Hardcore · 15m total break limit" : "Stay with one thing.";
  }
  dom.timeDisplay.textContent = faceClock;
  if (dom.timeDisplay) {
    dom.timeDisplay.setAttribute("aria-label", onBreak ? "Break time elapsed" : "Time remaining");
  }
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
      ? `Was ${scheduledLabel}`
      : scheduledLabel;
    dom.expectedEndScheduled.title = `Original plan without breaks: ${scheduledLabel}.`;
    dom.expectedEndScheduled.classList.toggle("is-delayed", delayed);
  }
  if (dom.timerStatusMessage) {
    const showStatus = onBreak && s.hardcore;
    dom.timerStatusMessage.classList.toggle("is-hidden", !showStatus);
    dom.timerStatusMessage.textContent = showStatus
      ? `Hardcore break total: ${formatClock(breaks)} / 15:00`
      : "";
  }
  const pct = Math.min(100, Math.max(0, focus / s.targetSeconds * 100));
  dom.timerProgressBar.style.width = `${pct}%`;
  dom.timerProgress.setAttribute("aria-valuenow", String(Math.round(pct)));
  document.title = onBreak ? `Break ${faceClock} · Locked-In` : `${faceClock} · Locked-In`;
  syncFloatingTimer(now);
}

export function stopSession() {
  if (!state.session) return;
  if (dom.endSessionDialog?.open) return;
  openEndSessionDialog();
}

export function openEndSessionDialog() {
  if (!state.session) return;
  const focus = Math.floor(activeFocusSeconds(state.session, Date.now()));
  const short = focus < MIN_SAVED_FOCUS_SECONDS;
  if (dom.endSessionEyebrow) dom.endSessionEyebrow.textContent = short ? "SHORT SESSION" : "END SESSION";
  if (dom.endSessionTitle) {
    dom.endSessionTitle.textContent = short ? "Less than one minute." : "End this session?";
  }
  if (dom.endSessionMessage) {
    dom.endSessionMessage.textContent = short
      ? "This attempt is probably accidental. Save it as incomplete, discard it, or cancel to keep the timer running."
      : `You've focused for ${formatDuration(focus)}. Save as an incomplete attempt (it will not count as completed), discard it, or cancel to keep going.`;
  }
  if (typeof dom.endSessionDialog?.showModal === "function") {
    dom.endSessionDialog.showModal();
    return;
  }
  if (window.confirm(short
    ? "Save this short attempt as incomplete? Cancel keeps the timer running."
    : `Save ${formatDuration(focus)} as an incomplete attempt? Cancel keeps the timer running.`)) {
    finishSession("ended", "Ended early.", false);
  }
}

export function closeEndSessionDialog() {
  if (dom.endSessionDialog?.open) dom.endSessionDialog.close();
}

export function finishSession(outcome, reason, discard) {
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
  // Only discard when the caller asked to discard (e.g. short-session Discard).
  // Explicit "Save as incomplete" must persist even under one minute of focus.
  if (discard) {
    clearBreakReminder();
    stopTimerLoop(); releaseWakeLock(); state.session = null; safeWrite(ACTIVE_SESSION_KEY, null); broadcast({type:"active-session", source:tabId, sessionId:null});
    resetStickyNotes();
    syncFloatingTimer();
    showToast(focusSeconds < MIN_SAVED_FOCUS_SECONDS
      ? "Short session discarded. Nothing was added to history."
      : "Session discarded. Nothing was added to history.");
    navigate("setup-screen"); dom.taskIntent.focus(); return;
  }
  const draft = String(dom.stickyNotesInput?.value || "").trim();
  if (draft) addStickyNote(true);
  const noteItems = ensureNoteItems(s).slice();
  s.topic = String(dom.reportTopic.value || s.topic || "").trim().slice(0,240);
  s.notes = composeNotesText(noteItems) || String(s.notes || "").trim().slice(0,4000);
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
    showToast("Session finished, but history could not be saved. Use Save backup before closing this tab.");
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

export function playChime() {
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

export function renderReport(record) {
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
  if (dom.reportNoteInput) dom.reportNoteInput.value = "";
  dom.reportSaveState.textContent = "Saved";
  state.reportDirty = false;
  renderReportNotesList();
  dom.breakBreakdownList.replaceChildren();
  record.breaks.forEach((b,i) => { const li=document.createElement("li"); li.textContent=`Break ${i+1}: ${formatDuration(b.durationSeconds)}`; dom.breakBreakdownList.append(li); });
  dom.breakBreakdownWrapper.classList.toggle("is-hidden", !record.breaks.length);
}

export function restoreActiveSession() {
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
