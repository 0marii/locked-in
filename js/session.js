import { ACTIVE_SESSION_KEY, BREAK_REMINDER_MS, HARDCORE_BREAK_LIMIT_SECONDS, MAX_HISTORY, MIN_SAVED_FOCUS_SECONDS } from "./constants.js?v=207";
import { dom, state, tabId } from "./runtime.js?v=207";
import { safeRead, safeWrite } from "./storage.js?v=207";
import { showToast } from "./toast.js?v=207";
import { formatClock, formatDate, formatDuration, normalizePomodoroMinutes, scoreFor } from "./utils.js?v=207";
import { broadcast } from "./sync.js?v=207";
import { navigate } from "./theme-nav.js?v=207";
import {
  breakIntervalFitsFocus, currentTagValue, pomodoroIntervalSeconds, readPomodoroMinutesFromDom,
  rememberRecentGoal, renderRecentGoals, resetSetupFormDefaults,
  syncBreakFocusValidation, syncPomodoroIntervalVisibility, syncPomodoroMinuteOptions
} from "./setup.js?v=207";
import { renderReportNotesList, saveHistory, syncLiveHistoryRow } from "./history.js?v=207";
import { composeNotesText, createNoteItemOptions, deleteEditedNote, ensureNoteItems, formatNotePlainText, openNoteEditor, refreshNotesSurfaces } from "./notes.js?v=207";
import { pauseTaskTimer, startTaskTimer } from "./todos.js?v=207";

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
      ? record.noteItems.map((n) => {
          const title = String(n?.title || "").trim().slice(0, 120);
          const text = String(n?.text || "").trim().slice(0, 2000);
          if (!title && !text) return null;
          return {
            id: String(n?.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`),
            title,
            text,
            createdAt: n?.createdAt || new Date().toISOString()
          };
        }).filter(Boolean).slice(0, 100)
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

export function notify(title, body, { sound = false } = {}) {
  if (sound) playAlertCue();
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, {
      body,
      icon: "./assets/icon-192.png",
      badge: "./assets/icon-192.png",
      silent: false,
      tag: "locked-in-alert",
      renotify: true
    });
  } catch (_) {}
}

/** Shared AudioContext — browsers suspend new contexts without a recent gesture. */
let sharedAudioCtx = null;
let lastAudioKeepAliveAt = 0;
let htmlBeepUrl = null;

export async function unlockAudio() {
  const ctx = await ensureAudioContext();
  return Boolean(ctx && ctx.state === "running");
}

async function ensureAudioContext() {
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return null;
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
      sharedAudioCtx = new C();
    }
    if (sharedAudioCtx.state === "suspended") {
      await sharedAudioCtx.resume();
    }
    return sharedAudioCtx;
  } catch (_) {
    return null;
  }
}

function scheduleTone(ctx, frequency, startAt, { peak = 0.08, hold = 0.18, type = "sine" } = {}) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), startAt + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + hold);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + hold + 0.02);
}

async function playToneSequence(freqs, { peak, gap, hold, type = "sine" } = {}) {
  const ctx = await ensureAudioContext();
  if (ctx && ctx.state === "running") {
    const now = ctx.currentTime;
    freqs.forEach((f, i) => {
      scheduleTone(ctx, f, now + i * gap, { peak, hold, type });
    });
    return true;
  }
  // Timer callbacks often cannot resume AudioContext — fall back to HTMLAudioElement.
  return playHtmlBeepFallback(peak);
}

function buildBeepDataUri() {
  const sampleRate = 22050;
  const durationSec = 0.22;
  const samples = Math.floor(sampleRate * durationSec);
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t * 18) * Math.max(0, 1 - (t / durationSec));
    // Two short chirps in one buffer so the fallback is still noticeable.
    const f = t < 0.11 ? 523.25 : 659.25;
    const sample = Math.max(-1, Math.min(1, Math.sin(2 * Math.PI * f * t) * env * 0.55));
    view.setInt16(44 + i * 2, sample * 0x7fff, true);
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function playHtmlBeepFallback(peak = 0.12) {
  try {
    if (!htmlBeepUrl) htmlBeepUrl = buildBeepDataUri();
    const audio = new Audio(htmlBeepUrl);
    audio.volume = Math.max(0.2, Math.min(1, peak * 4));
    const play = audio.play();
    if (play && typeof play.catch === "function") play.catch(() => {});
    return true;
  } catch (_) {
    return false;
  }
}

/** Keep the shared AudioContext from going cold during a long focus (so cues can play later). */
function keepAudioAlive(now = Date.now()) {
  if (!state.session) return;
  if (now - lastAudioKeepAliveAt < 15000) return;
  lastAudioKeepAliveAt = now;
  void (async () => {
    const ctx = await ensureAudioContext();
    if (!ctx || ctx.state !== "running") return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.00001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = ctx.currentTime;
      osc.start(t);
      osc.stop(t + 0.02);
    } catch (_) {}
  })();
}

/** Soft cue for break reminders / suggestions (respects chime Off). */
export function playAlertCue() {
  const mode = state.prefs.chime || "soft";
  if (mode === "off") return;
  void playToneSequence([392, 523.25, 659.25], {
    peak: mode === "full" ? 0.16 : 0.11,
    gap: 0.13,
    hold: 0.2
  });
}

/** Louder dedicated cue when a suggested-break interval is reached. */
export function playBreakSuggestionCue() {
  const mode = state.prefs.chime || "soft";
  if (mode === "off") return;
  void playToneSequence([523.25, 659.25, 783.99], {
    peak: mode === "full" ? 0.18 : 0.13,
    gap: 0.12,
    hold: 0.22
  });
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([80, 40, 80]);
    }
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
    notify("Still on break", "You’ve been on break for 5 minutes. Resume when you’re ready.", { sound: true });
  }, BREAK_REMINDER_MS);
}

/** Next suggestion fires when focused seconds reach this value. null = cancelled for this session. */
function breakSuggestionFits(session, focusThresholdSec) {
  if (!session || !Number.isFinite(focusThresholdSec)) return false;
  return focusThresholdSec > 0 && focusThresholdSec < session.targetSeconds;
}

export function initBreakSuggestionSchedule(session) {
  if (!session) return;
  if (!state.prefs.pomodoro) {
    session.nextBreakSuggestionAt = null;
    return;
  }
  const intervalSec = pomodoroIntervalSeconds();
  session.nextBreakSuggestionAt = breakSuggestionFits(session, intervalSec) ? intervalSec : null;
}

/**
 * After a break resume (or after a suggestion fires): schedule one full interval from
 * current focus. If that would land at/after session end, cancel further suggestions.
 */
export function rescheduleBreakSuggestionFromFocus(session, focusSeconds) {
  if (!session) return { scheduled: false, cancelled: false };
  if (!state.prefs.pomodoro) {
    session.nextBreakSuggestionAt = null;
    return { scheduled: false, cancelled: false };
  }
  const intervalSec = pomodoroIntervalSeconds();
  if (!intervalSec || intervalSec <= 0) {
    session.nextBreakSuggestionAt = null;
    return { scheduled: false, cancelled: true };
  }
  const focus = Math.max(0, Number(focusSeconds) || 0);
  const nextAt = focus + intervalSec;
  if (!breakSuggestionFits(session, nextAt)) {
    session.nextBreakSuggestionAt = null;
    return { scheduled: false, cancelled: true };
  }
  session.nextBreakSuggestionAt = nextAt;
  return { scheduled: true, cancelled: false };
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
  const suggestBreaks = Boolean(dom.prefPomodoro?.checked || state.prefs.pomodoro);
  if (suggestBreaks) {
    const focusMin = Math.floor(targetSeconds / 60);
    syncPomodoroMinuteOptions();
    const breakMin = readPomodoroMinutesFromDom();
    if (!breakIntervalFitsFocus(breakMin, focusMin) || !syncBreakFocusValidation()) {
      showToast(
        dom.prefPomodoroMinutes?.value === "custom"
          ? `Custom break time (${breakMin}m) must be under focus time (${focusMin}m).`
          : `Break reminder (${breakMin}m) must be under focus time (${focusMin}m).`
      );
      import("./settings.js?v=207").then(({ openSettingsForBreaks }) => openSettingsForBreaks());
      return;
    }
    state.prefs.pomodoro = true;
    state.prefs.pomodoroMinutes = breakMin;
  }
  const now = Date.now();
  const linkedTodoId = state.linkedTodoTaskId || null;
  state.session = {
    id: `${now}-${Math.random().toString(36).slice(2, 9)}`, tabId, intent: intent.slice(0,120),
    targetSeconds, hardcore: dom.sessionStyle.value === "hardcore", startedAt: now,
    activeWorkStartedAt: now, accumulatedFocusSeconds: 0, currentBreakStartedAt: null,
    breakSeconds: 0, breaks: [], topic: "", notes: "", noteItems: [], tag,
    todoTaskId: linkedTodoId,
    nextBreakSuggestionAt: null
  };
  initBreakSuggestionSchedule(state.session);
  if (!safeWrite(ACTIVE_SESSION_KEY, state.session)) { state.session = null; return; }
  if (linkedTodoId) startTaskTimer(linkedTodoId, { render: false });
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
  void unlockAudio();
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
    if (item.title) {
      const title = document.createElement("strong");
      title.className = "note-card-title";
      title.textContent = item.title;
      li.append(title);
    }
    if (item.text) {
      const text = document.createElement("p");
      text.textContent = item.text;
      li.append(text);
    }
    const meta = document.createElement("div");
    meta.className = "sticky-note-item-meta";
    const time = document.createElement("small");
    time.textContent = formatDate(item.createdAt);
    const actions = document.createElement("div");
    actions.className = "note-card-actions";
    const session = state.session;
    const plain = formatNotePlainText(item);
    actions.append(createNoteItemOptions({
      text: plain,
      label: item.title || `${session?.intent || "session"}-${index + 1}`,
      onEdit: () => openNoteEditor({
        scope: "live",
        sessionId: session.id,
        noteId: item.id,
        intent: session.intent,
        live: true,
        title: item.title || "",
        text: item.text || ""
      }),
      onDelete: () => {
        state.editingNote = {
          scope: "live",
          sessionId: session.id,
          noteId: item.id,
          intent: session.intent,
          live: true,
          title: item.title || "",
          text: item.text || ""
        };
        deleteEditedNote();
      }
    }));
    meta.append(time, actions);
    li.append(meta);
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
    title: "",
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
  keepAudioAlive(now);
  const breakTotal = currentBreakSeconds(s, now);
  if (s.hardcore && breakTotal >= HARDCORE_BREAK_LIMIT_SECONDS) {
    finishSession("failed", "Hardcore break limit reached.", false);
    return;
  }
  if (!s.currentBreakStartedAt) {
    s.remainingSeconds = Math.max(0, s.targetSeconds - activeFocusSeconds(s, now));
    if (s.remainingSeconds <= 0) { finishSession("completed", "Target duration reached.", false); return; }
    if (state.prefs.pomodoro) {
      const focus = activeFocusSeconds(s, now);
      // Migrate older in-progress sessions that lack the new schedule field.
      if (!("nextBreakSuggestionAt" in s)) initBreakSuggestionSchedule(s);
      const nextAt = s.nextBreakSuggestionAt;
      if (nextAt != null && focus >= nextAt) {
        const focusedMin = Math.max(1, Math.round(focus / 60));
        // Sound first (does not depend on notification permission), then toast + OS notify.
        playBreakSuggestionCue();
        showToast(`Break suggestion · ${focusedMin}m focused — take a short break?`);
        notify("Break suggestion", `You’ve focused ${focusedMin} minutes. A short break can help.`);
        // Queue the next full interval from this mark; cancel if it won't fit before session end.
        const intervalSec = pomodoroIntervalSeconds();
        const following = nextAt + intervalSec;
        s.nextBreakSuggestionAt = breakSuggestionFits(s, following) ? following : null;
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
  void unlockAudio();
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
    // Reset suggestion to one full interval from resume; cancel if not enough session time left.
    const focusNow = activeFocusSeconds(s, now);
    const result = rescheduleBreakSuggestionFromFocus(s, focusNow);
    if (state.prefs.pomodoro && result.cancelled) {
      showToast("Focus resumed · not enough time left for another break suggestion.");
    } else if (state.prefs.pomodoro && result.scheduled) {
      const mins = normalizePomodoroMinutes(state.prefs.pomodoroMinutes);
      showToast(`Focus resumed · next break suggestion in ${mins}m of focus.`);
    } else {
      showToast("Break ended. Focus resumed.");
    }
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

function syncNextBreakHint(session, focusSeconds, onBreak) {
  const el = dom.timerNextBreak;
  if (!el) return;
  if (!state.prefs.pomodoro) {
    el.hidden = true;
    el.classList.add("is-hidden");
    el.textContent = "";
    el.removeAttribute("title");
    return;
  }
  const intervalSec = pomodoroIntervalSeconds();
  const intervalMin = normalizePomodoroMinutes(state.prefs.pomodoroMinutes);
  el.hidden = false;
  el.classList.remove("is-hidden");
  el.title = `After you resume from a break, the next suggestion resets to a full ${intervalMin}m of focus. If that would pass the session end, suggestions are cancelled.`;
  if (onBreak) {
    const focusAtResume = focusSeconds; // focus already excludes the open break
    const wouldBe = focusAtResume + intervalSec;
    if (!breakSuggestionFits(session, wouldBe)) {
      el.textContent = `On break · resume will cancel further break suggestions (not enough time left)`;
    } else {
      el.textContent = `On break · resume resets next suggestion to ${intervalMin}m of focus`;
    }
    return;
  }
  if (!intervalSec || intervalSec <= 0) {
    el.textContent = "";
    el.hidden = true;
    el.classList.add("is-hidden");
    return;
  }
  if (!("nextBreakSuggestionAt" in session)) initBreakSuggestionSchedule(session);
  const nextAt = session.nextBreakSuggestionAt;
  if (nextAt == null) {
    el.textContent = `Break every ${intervalMin}m · no more suggestions this session`;
    return;
  }
  const remain = Math.max(0, Math.ceil(nextAt - focusSeconds));
  el.textContent = `Next break suggestion in ${formatClock(remain)}`;
}

let liveFavicon = null;
let lastTimerChromeKey = "";

function faviconClockLabel(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function ensureLiveFavicon() {
  if (liveFavicon) return liveFavicon;
  const link = document.createElement("link");
  link.id = "live-timer-icon";
  link.rel = "icon";
  link.type = "image/png";
  document.head.append(link);
  liveFavicon = link;
  return link;
}

/** Tab icon + Windows taskbar badge while a session is running. */
export function syncTimerChrome({ seconds = 0, onBreak = false, progress = 0 } = {}) {
  const label = faviconClockLabel(seconds);
  const key = `${onBreak ? "b" : "f"}:${label}:${Math.round(progress * 20)}`;
  if (key !== lastTimerChromeKey) {
    lastTimerChromeKey = key;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, 64, 64);
      ctx.beginPath();
      ctx.arc(32, 32, 30, 0, Math.PI * 2);
      ctx.fillStyle = "#101310";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(32, 32, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, Math.max(0, progress)));
      ctx.strokeStyle = onBreak ? "#f2c66d" : "#b7f36b";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.fillStyle = "#f4f6ee";
      ctx.font = "700 15px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 32, 33);
      ensureLiveFavicon().href = canvas.toDataURL("image/png");
    }
  }
  const minutes = Math.max(1, Math.ceil(Math.max(0, seconds) / 60));
  if (typeof navigator.setAppBadge === "function") {
    navigator.setAppBadge(minutes).catch(() => {});
  }
}

export function clearTimerChrome() {
  lastTimerChromeKey = "";
  liveFavicon?.remove();
  liveFavicon = null;
  if (typeof navigator.clearAppBadge === "function") {
    navigator.clearAppBadge().catch(() => {});
  }
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
  syncNextBreakHint(s, focus, onBreak);
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
  const completionPct = s.targetSeconds
    ? Math.min(100, Math.round((focus / s.targetSeconds) * 100))
    : 0;
  if (dom.timerCompletionPercent) {
    dom.timerCompletionPercent.textContent = `${completionPct}%`;
    dom.timerCompletionPercent.title = `Focused ${formatDuration(focus)} of ${formatDuration(s.targetSeconds)} planned (${completionPct}%). Breaks are excluded — same basis as the completion score.`;
  }
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
  syncTimerChrome({ seconds: faceSeconds, onBreak, progress: onBreak ? 1 : focus / Math.max(1, s.targetSeconds) });
  syncFloatingTimer(now);
}

export function stopSession() {
  if (!state.session) return;
  if (dom.endSessionDialog?.open) return;
  void unlockAudio();
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

function pauseLinkedTodoFromSession(session) {
  const todoId = session?.todoTaskId;
  if (!todoId) return;
  pauseTaskTimer(todoId, { render: false });
}

export function finishSession(outcome, reason, discard) {
  const s = state.session; if (!s) return;
  void unlockAudio();
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
    pauseLinkedTodoFromSession(s);
    clearBreakReminder();
    stopTimerLoop(); releaseWakeLock(); state.session = null; safeWrite(ACTIVE_SESSION_KEY, null); broadcast({type:"active-session", source:tabId, sessionId:null});
    resetStickyNotes();
    clearTimerChrome();
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
  pauseLinkedTodoFromSession(s);
  clearBreakReminder();
  stopTimerLoop(); releaseWakeLock(); state.session = null; safeWrite(ACTIVE_SESSION_KEY, null); broadcast({type:"active-session", source:tabId, sessionId:null});
  resetStickyNotes();
  clearTimerChrome();
  syncFloatingTimer();
  state.history.unshift(record); state.history = state.history.slice(0, MAX_HISTORY);
  if (!saveHistory()) {
    showToast("Session finished, but history could not be saved. Use Save backup before closing this tab.");
  }
  state.reportId = record.id;
  renderReport(record); navigate("report-screen");
  // Chime for every saved ending (complete, early, incomplete, hardcore fail) unless Off.
  playChime();
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
  const notes = mode === "full" ? [523.25, 659.25, 783.99] : [523.25, 659.25];
  const peak = mode === "full" ? 0.16 : 0.1;
  const gap = mode === "full" ? 0.12 : 0.1;
  const hold = mode === "full" ? 0.25 : 0.18;
  void playToneSequence(notes, { peak, gap, hold });
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
  if (!("nextBreakSuggestionAt" in state.session)) {
    if (state.prefs.pomodoro && !state.session.currentBreakStartedAt) {
      rescheduleBreakSuggestionFromFocus(state.session, activeFocusSeconds(state.session));
    } else {
      initBreakSuggestionSchedule(state.session);
    }
  }
  resetStickyNotes();
  if (state.session.currentBreakStartedAt && state.session.hardcore && currentBreakSeconds(state.session) >= HARDCORE_BREAK_LIMIT_SECONDS) {
    finishSession("failed","Hardcore break limit reached.",false); return;
  }
  navigate("timer-screen", true);
  requestWakeLock();
  if (state.session.currentBreakStartedAt) scheduleBreakReminder();
  startTimerLoop(); tick(); showToast("Your active session was restored.");
}
