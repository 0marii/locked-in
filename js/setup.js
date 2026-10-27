import {
  ACTIVE_SESSION_KEY, DEFAULT_POMODORO_MINUTES, FOCUS_GOALS_KEY, GOAL_LIMITS, HISTORY_KEY, LEGACY_HISTORY_KEYS,
  MAX_HISTORY, MAX_NOTE_GROUPS, NOTE_GROUPS_KEY, NOTES_INBOX_KEY, POMODORO_CUSTOM_MAX, POMODORO_CUSTOM_MIN,
  POMODORO_MINUTE_OPTIONS, PREFS_KEY, RECENT_GOALS_KEY
} from "./constants.js?v=207";
import { dom, state } from "./runtime.js?v=207";
import { safeRead, safeWrite } from "./storage.js?v=207";
import { showToast } from "./toast.js?v=207";
import {
  clampGoalMinutes, countedFocusRecords, formatClock, formatDuration, formatGoalClock, formatShortDate,
  localDayKey, normalizePomodoroMinutes, normalizeWeekStartsOn, startOfWeek, WEEKDAY_OPTIONS
} from "./utils.js?v=207";
import { normalizeRecord } from "./session.js?v=207";
import { drawHeatmap } from "./insights.js?v=207";
import { findList, listOpenTasksForSetup, loadTodos, renderSetupTodosWidget } from "./todos.js?v=207";
import { currentProgressWindow, ensureWeekRollover, loadWeekReports, renderWeekReports } from "./week-reports.js?v=207";

export const CHIME_HINTS = {
  off: "No sound for session end, break reminders, or break suggestions.",
  soft: "Quiet chime for session end (including early), break reminders, and suggestions.",
  full: "Louder chime for session end, break reminders, and break suggestions."
};

export function loadData() {
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
  state.inbox = Array.isArray(inbox) ? inbox.map((n) => {
    const title = String(n?.title || "").trim().slice(0, 120);
    const text = String(n?.text || "").trim().slice(0, 2000);
    if (!title && !text) return null;
    return {
      id: String(n?.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`),
      title,
      text,
      groupId: String(n?.groupId || "").trim().slice(0, 64),
      createdAt: n?.createdAt || new Date().toISOString()
    };
  }).filter(Boolean).slice(0, 200) : [];
  const groups = safeRead(NOTE_GROUPS_KEY, []);
  state.noteGroups = (Array.isArray(groups) ? groups : []).map((g) => {
    const name = String(g?.name || "").trim().slice(0, 48);
    if (!name) return null;
    return {
      id: String(g?.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`),
      name,
      createdAt: g?.createdAt || new Date().toISOString()
    };
  }).filter(Boolean).slice(0, MAX_NOTE_GROUPS);
  loadPrefs();
  loadFocusGoals();
  loadWeekReports();
  loadRecentGoals();
  loadTodos();
  ensureWeekRollover({ notify: true });
}

export function pomodoroIntervalSeconds() {
  return normalizePomodoroMinutes(state.prefs.pomodoroMinutes) * 60;
}

export function syncPomodoroCustomVisibility(showCustom) {
  const on = Boolean(showCustom);
  if (!dom.prefPomodoroCustomWrap) return;
  dom.prefPomodoroCustomWrap.hidden = !on;
  dom.prefPomodoroCustomWrap.classList.toggle("is-hidden", !on);
}

function pomodoroPresetLabel(mins) {
  return mins === 60 ? "1 hour" : `${mins} min`;
}

/** Presets strictly shorter than the current focus duration (all presets if focus unknown). */
export function allowedPomodoroPresets(focusMinutes = peekFocusDurationMinutes()) {
  const focusMin = focusMinutes == null ? null : Math.floor(Number(focusMinutes) || 0);
  if (focusMin == null || focusMin < 1) return POMODORO_MINUTE_OPTIONS.slice();
  return POMODORO_MINUTE_OPTIONS.filter((m) => m < focusMin);
}

/** Largest reminder interval that is still shorter than the focus session. */
export function fitBreakMinutesToFocus(breakMinutes, focusMinutes = peekFocusDurationMinutes()) {
  const focusMin = focusMinutes == null ? null : Math.floor(Number(focusMinutes) || 0);
  const breakMin = normalizePomodoroMinutes(breakMinutes);
  if (focusMin == null || focusMin < 2) return breakMin;
  if (breakMin > 0 && breakMin < focusMin) return breakMin;
  const allowed = allowedPomodoroPresets(focusMin);
  if (allowed.length) return allowed[allowed.length - 1];
  return Math.max(POMODORO_CUSTOM_MIN, focusMin - 1);
}

/** Keep saved remind-every under the current session length; returns true if prefs changed. */
export function ensureBreakFitsFocus({ persist = false } = {}) {
  const fitted = fitBreakMinutesToFocus(state.prefs.pomodoroMinutes);
  const changed = fitted !== normalizePomodoroMinutes(state.prefs.pomodoroMinutes);
  if (changed) state.prefs.pomodoroMinutes = fitted;
  applyPomodoroMinutesToDom(state.prefs.pomodoroMinutes);
  if (persist && changed) savePrefs();
  return changed;
}

/** Rebuild Remind-every options so only intervals under the focus length appear. */
export function syncPomodoroMinuteOptions() {
  const select = dom.prefPomodoroMinutes;
  if (!select) return allowedPomodoroPresets();

  const focusMin = peekFocusDurationMinutes();
  const allowed = allowedPomodoroPresets(focusMin);
  const wasCustom = select.value === "custom";
  const previous = wasCustom ? "custom" : Math.floor(Number(select.value) || 0);

  select.replaceChildren();
  allowed.forEach((mins) => {
    const opt = document.createElement("option");
    opt.value = String(mins);
    opt.textContent = pomodoroPresetLabel(mins);
    select.append(opt);
  });
  const customOpt = document.createElement("option");
  customOpt.value = "custom";
  customOpt.textContent = "Custom…";
  select.append(customOpt);

  if (wasCustom || previous === "custom") {
    select.value = "custom";
    syncPomodoroCustomVisibility(true);
  } else if (allowed.includes(previous)) {
    select.value = String(previous);
    syncPomodoroCustomVisibility(false);
  } else {
    const preferred = normalizePomodoroMinutes(state.prefs.pomodoroMinutes);
    if (allowed.includes(preferred)) {
      select.value = String(preferred);
      syncPomodoroCustomVisibility(false);
    } else if (allowed.length) {
      select.value = String(allowed[allowed.length - 1]);
      syncPomodoroCustomVisibility(false);
    } else {
      select.value = "custom";
      syncPomodoroCustomVisibility(true);
    }
  }
  return allowed;
}

export function syncPomodoroIntervalVisibility() {
  const on = Boolean(dom.prefPomodoro?.checked);
  if (!dom.prefPomodoroIntervalWrap) return;
  dom.prefPomodoroIntervalWrap.hidden = !on;
  dom.prefPomodoroIntervalWrap.classList.toggle("is-hidden", !on);
  if (on) {
    syncPomodoroMinuteOptions();
    syncPomodoroCustomVisibility(dom.prefPomodoroMinutes?.value === "custom");
  } else {
    syncPomodoroCustomVisibility(false);
  }
  syncBreakFocusValidation();
}

export function readPomodoroMinutesFromDom() {
  if (dom.prefPomodoroMinutes?.value === "custom") {
    const focusMin = peekFocusDurationMinutes();
    const hardMax = focusMin != null
      ? Math.max(POMODORO_CUSTOM_MIN, focusMin - 1)
      : POMODORO_CUSTOM_MAX;
    const raw = Math.floor(Number(dom.prefPomodoroCustomMinutes?.value) || 0);
    // Do not clamp down for validation — return the typed value when finite so warnings work.
    if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_POMODORO_MINUTES;
    return raw;
  }
  return normalizePomodoroMinutes(dom.prefPomodoroMinutes?.value);
}

export function applyPomodoroMinutesToDom(minutes = state.prefs.pomodoroMinutes) {
  const mins = normalizePomodoroMinutes(minutes);
  syncPomodoroMinuteOptions();
  if (!dom.prefPomodoroMinutes) return mins;
  const allowed = allowedPomodoroPresets();
  if (allowed.includes(mins)) {
    dom.prefPomodoroMinutes.value = String(mins);
    syncPomodoroCustomVisibility(false);
  } else {
    dom.prefPomodoroMinutes.value = "custom";
    if (dom.prefPomodoroCustomMinutes) dom.prefPomodoroCustomMinutes.value = String(mins);
    syncPomodoroCustomVisibility(true);
  }
  syncBreakFocusValidation();
  return mins;
}

/** Current focus length from the setup form, in whole minutes (null if incomplete). */
export function peekFocusDurationMinutes() {
  if (!dom.durationPreset) return null;
  if (dom.durationPreset.value !== "custom") {
    const mins = Math.floor(Number(dom.durationPreset.value) || 0);
    return mins > 0 ? mins : null;
  }
  const hRaw = String(dom.customHours?.value ?? "").trim();
  const mRaw = String(dom.customMinutes?.value ?? "").trim();
  if (hRaw === "" && mRaw === "") return null;
  const h = hRaw === "" ? 0 : Math.floor(Number(hRaw));
  const m = mRaw === "" ? 0 : Math.floor(Number(mRaw));
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  const total = h * 60 + m;
  return total >= 1 ? total : null;
}

function syncStartButtonBreakGate(valid) {
  const btn = dom.setupForm?.querySelector('button[type="submit"]');
  if (!btn) return;
  const pomodoroOn = Boolean(dom.prefPomodoro?.checked);
  const block = pomodoroOn && !valid;
  btn.disabled = block;
  btn.setAttribute("aria-disabled", String(block));
  btn.title = block ? "Fix break reminder — it must be shorter than focus time" : "";
}

/**
 * Break suggestion interval must be strictly less than the planned focus duration.
 * Returns true when valid (or when Suggest breaks is off / focus unknown).
 */
export function syncBreakFocusValidation() {
  const hint = dom.prefPomodoroHint;
  const select = dom.prefPomodoroMinutes;
  const custom = dom.prefPomodoroCustomMinutes;
  const wrap = dom.prefPomodoroCustomWrap;
  const enabled = Boolean(dom.prefPomodoro?.checked);
  const clear = () => {
    if (hint) {
      hint.hidden = true;
      hint.textContent = "";
    }
    select?.classList.remove("is-invalid");
    wrap?.classList.remove("is-invalid");
    custom?.classList.remove("is-invalid");
    select?.setAttribute("aria-invalid", "false");
    custom?.setAttribute("aria-invalid", "false");
    if (custom) custom.max = String(POMODORO_CUSTOM_MAX);
  };

  if (!enabled) {
    clear();
    syncStartButtonBreakGate(true);
    return true;
  }

  const focusMin = peekFocusDurationMinutes();
  const breakMin = readPomodoroMinutesFromDom();
  const isCustom = select?.value === "custom";
  if (focusMin != null && custom) {
    custom.max = String(Math.max(POMODORO_CUSTOM_MIN, focusMin - 1));
  }

  if (focusMin == null) {
    clear();
    syncStartButtonBreakGate(true);
    return true;
  }

  if (breakMin < focusMin) {
    clear();
    syncStartButtonBreakGate(true);
    return true;
  }

  const message = isCustom
    ? `Custom break time must be under ${focusMin}m focus.`
    : `Break reminder must be under your focus time (${focusMin}m).`;
  if (hint) {
    hint.hidden = false;
    hint.textContent = message;
  }
  select?.classList.add("is-invalid");
  wrap?.classList.add("is-invalid");
  custom?.classList.add("is-invalid");
  select?.setAttribute("aria-invalid", "true");
  custom?.setAttribute("aria-invalid", "true");
  syncStartButtonBreakGate(false);
  return false;
}

export function breakIntervalFitsFocus(breakMinutes, focusMinutes) {
  const breakMin = Math.floor(Number(breakMinutes) || 0);
  const focusMin = Math.floor(Number(focusMinutes) || 0);
  if (focusMin < 1) return true;
  return breakMin > 0 && breakMin < focusMin;
}

export function loadPrefs() {
  const p = safeRead(PREFS_KEY, null);
  const legacyEnd = (() => { try { return localStorage.getItem("locked_in_notify_end"); } catch (_) { return null; } })();
  const legacyBreak = (() => { try { return localStorage.getItem("locked_in_notify_break"); } catch (_) { return null; } })();
  const legacyChime = (() => { try { return localStorage.getItem("locked_in_chime_mode"); } catch (_) { return null; } })();
  state.prefs = {
    notifyEnd: Boolean(p?.notifyEnd ?? (legacyEnd === "true")),
    notifyBreak: Boolean(p?.notifyBreak ?? (legacyBreak === "true")),
    pomodoro: p?.pomodoro === true,
    pomodoroMinutes: normalizePomodoroMinutes(p?.pomodoroMinutes ?? DEFAULT_POMODORO_MINUTES),
    chime: ["off", "soft", "full"].includes(p?.chime || legacyChime) ? (p?.chime || legacyChime) : "soft",
    panelOpen: Boolean(p?.panelOpen),
    showSetupGoal: p?.showSetupGoal !== false,
    showSetupHeatmap: p?.showSetupHeatmap !== false,
    showSetupTodos: p?.showSetupTodos !== false,
    setupTodosSource: String(p?.setupTodosSource || "focus")
  };
}

export function savePrefs() {
  return safeWrite(PREFS_KEY, state.prefs);
}

function applyPrefsPanelOpenUi(open = state.prefs.panelOpen) {
  const next = Boolean(open);
  dom.prefsPanel?.classList.toggle("is-open", next);
  dom.prefsPanel?.classList.toggle("is-collapsed", !next);
  if (dom.prefsBody) {
    dom.prefsBody.hidden = !next;
    dom.prefsBody.classList.toggle("is-hidden", !next);
  }
  if (dom.prefsToggleBtn) {
    dom.prefsToggleBtn.setAttribute("aria-expanded", next ? "true" : "false");
    dom.prefsToggleBtn.setAttribute("aria-label", next ? "Hide preferences" : "Show preferences");
  }
}

export function setPrefsPanelOpen(open) {
  state.prefs.panelOpen = Boolean(open);
  applyPrefsPanelOpenUi(state.prefs.panelOpen);
  savePrefs();
}

function setWidgetVisible(el, visible) {
  if (!el) return;
  el.hidden = !visible;
  el.classList.toggle("is-hidden", !visible);
  el.setAttribute("aria-hidden", String(!visible));
}

export function syncSetupWidgetVisibility() {
  setWidgetVisible(dom.setupFocusGoalCard, state.prefs.showSetupGoal !== false);
  setWidgetVisible(dom.setupHeatmapPanel || dom.setupHeatmapBtn, state.prefs.showSetupHeatmap !== false);
  setWidgetVisible(dom.setupTodosWidget, state.prefs.showSetupTodos !== false);
}

export function applyPrefsToDom() {
  if (dom.prefNotifyEnd) dom.prefNotifyEnd.checked = state.prefs.notifyEnd;
  if (dom.prefNotifyBreak) dom.prefNotifyBreak.checked = state.prefs.notifyBreak;
  if (dom.prefPomodoro) dom.prefPomodoro.checked = state.prefs.pomodoro === true;
  ensureBreakFitsFocus({ persist: false });
  if (dom.prefShowSetupGoal) dom.prefShowSetupGoal.checked = state.prefs.showSetupGoal !== false;
  if (dom.prefShowSetupHeatmap) dom.prefShowSetupHeatmap.checked = state.prefs.showSetupHeatmap !== false;
  if (dom.prefShowSetupTodos) dom.prefShowSetupTodos.checked = state.prefs.showSetupTodos !== false;
  const chime = ["off", "soft", "full"].includes(state.prefs.chime) ? state.prefs.chime : "soft";
  dom.prefChimeInputs.forEach((input) => {
    input.checked = input.value === chime;
  });
  syncChimeHint();
  syncPomodoroIntervalVisibility();
  syncSetupWidgetVisibility();
  applyPrefsPanelOpenUi(state.prefs.panelOpen);
}

export function selectedChimeMode() {
  const chosen = dom.prefChimeInputs.find((input) => input.checked)?.value;
  return ["off", "soft", "full"].includes(chosen) ? chosen : "soft";
}

export function syncChimeHint() {
  if (!dom.prefChimeHint) return;
  dom.prefChimeHint.textContent = CHIME_HINTS[selectedChimeMode()] || CHIME_HINTS.soft;
}

export const DEFAULT_FOCUS_GOALS = { dailyMinutes: 120, weeklyMinutes: 600, weekStartsOn: 1 };

export function loadFocusGoals() {
  const g = safeRead(FOCUS_GOALS_KEY, null);
  state.focusGoals = {
    dailyMinutes: clampGoalMinutes("daily", g?.dailyMinutes ?? DEFAULT_FOCUS_GOALS.dailyMinutes),
    weeklyMinutes: clampGoalMinutes("weekly", g?.weeklyMinutes ?? DEFAULT_FOCUS_GOALS.weeklyMinutes),
    weekStartsOn: normalizeWeekStartsOn(g?.weekStartsOn ?? DEFAULT_FOCUS_GOALS.weekStartsOn),
    activeWeekKey: typeof g?.activeWeekKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(g.activeWeekKey)
      ? g.activeWeekKey
      : null,
    progressResetAt: Number.isFinite(Date.parse(g?.progressResetAt)) ? new Date(g.progressResetAt).toISOString() : null
  };
}

export function readWeekStartsOnFromDom() {
  const el = dom.goalWeekStartsOn || document.getElementById("goal-week-starts-on");
  return normalizeWeekStartsOn(el?.value ?? state.focusGoals.weekStartsOn);
}

export function syncWeekStartsOnEditor(value = state.focusGoals.weekStartsOn) {
  const el = dom.goalWeekStartsOn || document.getElementById("goal-week-starts-on");
  const next = normalizeWeekStartsOn(value);
  if (el) el.value = String(next);
  updateWeekResetChrome(next);
  return next;
}

export function updateWeekResetChrome(weekStartsOn = state.focusGoals.weekStartsOn) {
  const next = normalizeWeekStartsOn(weekStartsOn);
  const hint = dom.goalWeekResetHint || document.getElementById("goal-week-reset-hint");
  if (hint) {
    const label = WEEKDAY_OPTIONS.find((d) => d.value === next)?.label || "Monday";
    hint.textContent = `Auto-resets every ${label}. History stays.`;
  }
  const status = dom.goalWeekResetStatus || document.getElementById("goal-week-reset-status");
  if (status) {
    const window = currentProgressWindow();
    const cutoff = Date.parse(state.focusGoals?.progressResetAt);
    let since = formatShortDateSafe(window.startKey);
    if (Number.isFinite(cutoff) && localDayKey(cutoff) === window.startKey) {
      const when = new Date(cutoff);
      if (when.getHours() || when.getMinutes() || when.getSeconds()) {
        since = `${since}, ${when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
      }
    }
    status.textContent = `Current window · since ${since}`;
  }
}

function formatShortDateSafe(iso) {
  try { return formatShortDate(iso); } catch (_) { return iso; }
}

function maxGoalHours(kind) {
  const lim = GOAL_LIMITS[kind] || GOAL_LIMITS.daily;
  return Math.floor(lim.max / 60);
}

function goalLimitHintEls(kind) {
  return {
    hint: kind === "daily" ? dom.goalDailyLimitHint : dom.goalWeeklyLimitHint,
    edit: kind === "daily" ? dom.goalDailyTimeEdit : dom.goalWeeklyTimeEdit,
    hoursEl: kind === "daily" ? dom.goalDailyHours : dom.goalWeeklyHours,
    minsEl: kind === "daily" ? dom.goalDailyMins : dom.goalWeeklyMins
  };
}

/** Raw typed values — not clamped — so we can warn when outside the slider range. */
function peekRawGoalFields(kind) {
  const { hoursEl, minsEl } = goalLimitHintEls(kind);
  const hoursRaw = String(hoursEl?.value ?? "").trim();
  const minsRaw = String(minsEl?.value ?? "").trim();
  if (hoursRaw === "" && minsRaw === "") return null;
  const hours = hoursRaw === "" ? 0 : Math.floor(Number(hoursRaw));
  const mins = minsRaw === "" ? 0 : Math.floor(Number(minsRaw));
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  return { hours, mins, total: hours * 60 + mins };
}

export function syncGoalLimitHint(kind) {
  const lim = GOAL_LIMITS[kind] || GOAL_LIMITS.daily;
  const { hint, edit, hoursEl, minsEl } = goalLimitHintEls(kind);
  const raw = peekRawGoalFields(kind);
  const maxHours = maxGoalHours(kind);
  let message = "";

  if (raw) {
    if (raw.mins > 59 || raw.mins < 0) {
      message = "Minutes must be 0–59";
    } else if (raw.hours < 0) {
      message = `Min ${formatGoalClock(lim.min)} · Max ${formatGoalClock(lim.max)}`;
    } else if (raw.total > lim.max || raw.hours > maxHours) {
      message = `Max ${formatGoalClock(lim.max)} · Min ${formatGoalClock(lim.min)}`;
    } else if (raw.total < lim.min) {
      message = `Min ${formatGoalClock(lim.min)} · Max ${formatGoalClock(lim.max)}`;
    }
  }

  const invalid = Boolean(message);
  if (hint) {
    hint.hidden = !invalid;
    hint.textContent = message;
    hint.classList.toggle("is-visible", invalid);
  }
  edit?.classList.toggle("is-out-of-range", invalid);
  hoursEl?.classList.toggle("is-out-of-range", invalid);
  minsEl?.classList.toggle("is-out-of-range", invalid);
  hoursEl?.setAttribute("aria-invalid", invalid ? "true" : "false");
  minsEl?.setAttribute("aria-invalid", invalid ? "true" : "false");
  return !invalid;
}

export function syncAllGoalLimitHints() {
  syncGoalLimitHint("daily");
  syncGoalLimitHint("weekly");
}

/** Read hour/minute fields without rewriting them. Empty/partial input stays usable while typing. */
export function readGoalMinutesFromDom(kind, { commit = false } = {}) {
  const hoursEl = kind === "daily" ? dom.goalDailyHours : dom.goalWeeklyHours;
  const minsEl = kind === "daily" ? dom.goalDailyMins : dom.goalWeeklyMins;
  const lim = GOAL_LIMITS[kind];
  const hoursRaw = String(hoursEl?.value ?? "").trim();
  const minsRaw = String(minsEl?.value ?? "").trim();
  let hours = hoursRaw === "" ? (commit ? 0 : NaN) : Math.floor(Number(hoursRaw));
  let mins = minsRaw === "" ? (commit ? 0 : NaN) : Math.floor(Number(minsRaw));

  if (!commit) {
    if (!Number.isFinite(hours) && !Number.isFinite(mins)) {
      return state.focusGoals?.[kind === "daily" ? "dailyMinutes" : "weeklyMinutes"] ?? lim.min;
    }
    hours = Number.isFinite(hours) ? Math.max(0, hours) : 0;
    mins = Number.isFinite(mins) ? Math.max(0, Math.min(59, mins)) : 0;
    return Math.max(0, Math.min(lim.max, hours * 60 + mins));
  }

  if (!Number.isFinite(hours)) hours = 0;
  if (!Number.isFinite(mins)) mins = 0;
  hours = Math.max(0, Math.min(maxGoalHours(kind), hours));
  mins = Math.max(0, Math.min(59, mins));
  return clampGoalMinutes(kind, hours * 60 + mins);
}

function syncGoalSliderOnly(kind, totalMinutes) {
  const lim = GOAL_LIMITS[kind];
  const total = clampGoalMinutes(kind, totalMinutes);
  const sliderEl = kind === "daily" ? dom.goalDailySlider : dom.goalWeeklySlider;
  const displayEl = kind === "daily" ? dom.goalDailyDisplay : dom.goalWeeklyDisplay;
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

export function syncGoalEditor(kind, totalMinutes) {
  const lim = GOAL_LIMITS[kind];
  const total = clampGoalMinutes(kind, totalMinutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  const hoursEl = kind === "daily" ? dom.goalDailyHours : dom.goalWeeklyHours;
  const minsEl = kind === "daily" ? dom.goalDailyMins : dom.goalWeeklyMins;
  if (hoursEl) hoursEl.value = String(hours);
  if (minsEl) minsEl.value = String(mins);
  syncGoalSliderOnly(kind, total);
  if (hoursEl) hoursEl.max = String(maxGoalHours(kind));
  syncGoalLimitHint(kind);
  return total;
}

/** Preview draft from the fields without forcing the inputs to rewrite mid-edit. */
export function draftFocusGoalsFromDom({ commit = false } = {}) {
  const daily = commit
    ? syncGoalEditor("daily", readGoalMinutesFromDom("daily", { commit: true }))
    : readGoalMinutesFromDom("daily");
  const weekly = commit
    ? syncGoalEditor("weekly", readGoalMinutesFromDom("weekly", { commit: true }))
    : readGoalMinutesFromDom("weekly");
  if (!commit) {
    syncGoalSliderOnly("daily", daily);
    syncGoalSliderOnly("weekly", weekly);
  }
  return {
    dailyMinutes: daily,
    weeklyMinutes: weekly,
    weekStartsOn: syncWeekStartsOnEditor(readWeekStartsOnFromDom()),
    activeWeekKey: state.focusGoals.activeWeekKey || null,
    progressResetAt: state.focusGoals.progressResetAt || null
  };
}

export function syncFocusGoalsDirtyUi() {
  const dirty = Boolean(state.focusGoalsDirty);
  const panel = dom.focusGoalsPanel || document.getElementById("focus-goals-panel");
  panel?.classList.toggle("is-dirty", dirty);
  if (dom.focusGoalsActions) {
    dom.focusGoalsActions.hidden = !dirty;
  }
}

export function setFocusGoalsDirty(dirty, { notify = false } = {}) {
  const next = Boolean(dirty);
  const becameDirty = next && !state.focusGoalsDirty;
  state.focusGoalsDirty = next;
  syncFocusGoalsDirtyUi();
  if (notify && becameDirty) {
    showToast("Save to apply your new goals.");
  }
}

export function markFocusGoalsEdited() {
  const draft = draftFocusGoalsFromDom({ commit: false });
  syncAllGoalLimitHints();
  const dirty = draft.dailyMinutes !== state.focusGoals.dailyMinutes
    || draft.weeklyMinutes !== state.focusGoals.weeklyMinutes
    || draft.weekStartsOn !== state.focusGoals.weekStartsOn;
  setFocusGoalsDirty(dirty, { notify: dirty });
}

export function saveFocusGoalsFromDom() {
  const prevStartsOn = state.focusGoals.weekStartsOn;
  const next = draftFocusGoalsFromDom({ commit: true });
  const scheduleChanged = next.weekStartsOn !== prevStartsOn;
  // Changing reset day re-anchors the current week window without fabricating a report.
  if (scheduleChanged) {
    next.activeWeekKey = localDayKey(startOfWeek(new Date(), next.weekStartsOn));
  } else {
    next.activeWeekKey = state.focusGoals.activeWeekKey || localDayKey(startOfWeek(new Date(), next.weekStartsOn));
  }
  state.focusGoals = next;
  if (!safeWrite(FOCUS_GOALS_KEY, {
    dailyMinutes: next.dailyMinutes,
    weeklyMinutes: next.weeklyMinutes,
    weekStartsOn: next.weekStartsOn,
    activeWeekKey: next.activeWeekKey,
    progressResetAt: next.progressResetAt || null
  })) {
    showToast("Could not save focus goals — browser storage unavailable.");
    return false;
  }
  setFocusGoalsDirty(false);
  renderFocusGoals();
  showToast(scheduleChanged
    ? "Focus goals saved. Weekly reset day updated — history kept."
    : "Focus goals saved.");
  return true;
}

/** Persist week-start day from Settings without touching goal minute drafts. */
export function saveFocusGoalsWeekStartsOn() {
  const prevStartsOn = state.focusGoals.weekStartsOn;
  const weekStartsOn = readWeekStartsOnFromDom();
  if (weekStartsOn === prevStartsOn) return true;
  const next = {
    ...state.focusGoals,
    weekStartsOn,
    activeWeekKey: localDayKey(startOfWeek(new Date(), weekStartsOn))
  };
  state.focusGoals = next;
  syncWeekStartsOnEditor(weekStartsOn);
  if (!safeWrite(FOCUS_GOALS_KEY, {
    dailyMinutes: next.dailyMinutes,
    weeklyMinutes: next.weeklyMinutes,
    weekStartsOn: next.weekStartsOn,
    activeWeekKey: next.activeWeekKey,
    progressResetAt: next.progressResetAt || null
  })) {
    showToast("Could not save week start — browser storage unavailable.");
    return false;
  }
  updateWeekResetChrome(weekStartsOn);
  renderFocusGoals();
  showToast("Week start updated — history kept.");
  return true;
}

export function restoreFocusGoalsDefault() {
  syncGoalEditor("daily", DEFAULT_FOCUS_GOALS.dailyMinutes);
  syncGoalEditor("weekly", DEFAULT_FOCUS_GOALS.weeklyMinutes);
  syncWeekStartsOnEditor(DEFAULT_FOCUS_GOALS.weekStartsOn);
  markFocusGoalsEdited();
  showToast("Goals reset to 2h daily / 10h weekly. Save to apply.");
}

export function loadRecentGoals() {
  const raw = safeRead(RECENT_GOALS_KEY, []);
  state.recentGoals = Array.isArray(raw) ? raw.map((g) => ({
    intent: String(g?.intent || "").trim().slice(0, 120),
    durationPreset: String(g?.durationPreset || "45"),
    customSeconds: Math.max(0, Math.floor(Number(g?.customSeconds) || 0)),
    style: g?.style === "hardcore" ? "hardcore" : "standard",
    tag: String(g?.tag || "").trim().slice(0, 24)
  })).filter((g) => g.intent.length >= 2).slice(0, 5) : [];
}

export function rememberRecentGoal(entry) {
  const next = [
    entry,
    ...state.recentGoals.filter((g) => g.intent.toLocaleLowerCase() !== entry.intent.toLocaleLowerCase())
  ].slice(0, 5);
  state.recentGoals = next;
  safeWrite(RECENT_GOALS_KEY, next);
}

export function removeRecentGoal(intent) {
  const key = String(intent || "").trim().toLocaleLowerCase();
  if (!key) return;
  state.recentGoals = state.recentGoals.filter((g) => g.intent.toLocaleLowerCase() !== key);
  safeWrite(RECENT_GOALS_KEY, state.recentGoals);
  renderRecentGoals();
}

export function currentTagValue() {
  const selected = String(dom.goalTag?.value || "").trim();
  if (selected === "Other") {
    return String(dom.goalTagCustom?.value || "").trim().slice(0, 24);
  }
  return selected.slice(0, 24);
}

export function syncTagCustomVisibility() {
  const other = dom.goalTag?.value === "Other";
  if (!dom.goalTagCustom) return;
  dom.goalTagCustom.classList.toggle("is-hidden", !other);
  dom.goalTagCustom.setAttribute("aria-hidden", String(!other));
  if (other) dom.goalTagCustom.focus();
}

export function syncHardcoreHint() {
  if (!dom.hardcoreHint) return;
  const hardcore = dom.sessionStyle?.value === "hardcore";
  dom.hardcoreHint.classList.toggle("is-hidden", !hardcore);
  dom.hardcoreHint.hidden = !hardcore;
}

export function clearLinkedTodo({ refreshPick = true, clearIntent = false } = {}) {
  state.linkedTodoTaskId = null;
  if (dom.setupTodoPick) dom.setupTodoPick.value = "";
  if (clearIntent && dom.taskIntent) dom.taskIntent.value = "";
  syncLinkedTodoBar();
  if (refreshPick) renderSetupTodoPick();
}

export function syncLinkedTodoBar() {
  const id = state.linkedTodoTaskId;
  const task = id ? listOpenTasksForSetup().find((t) => t.id === id) : null;
  const bar = dom.setupTodoLinkBar;
  if (!bar) return;
  const linked = Boolean(task);
  bar.hidden = !linked;
  bar.classList.toggle("is-hidden", !linked);
  if (dom.setupTodoLinkName) {
    const listName = task ? findList(task.listId)?.name : "";
    dom.setupTodoLinkName.textContent = task
      ? (listName ? `${task.title} · ${listName}` : task.title)
      : "";
  }
  dom.setupIntentField?.classList.toggle("has-linked-todo", linked);
}

export function linkTodoToSetup(taskId) {
  loadTodos();
  const task = listOpenTasksForSetup().find((t) => t.id === taskId) || null;
  if (!task) {
    clearLinkedTodo();
    return false;
  }
  state.linkedTodoTaskId = task.id;
  if (dom.taskIntent) dom.taskIntent.value = String(task.title || "").slice(0, 120);
  if (dom.setupTodoPick) dom.setupTodoPick.value = task.id;
  syncLinkedTodoBar();
  return true;
}

/** Keep link only while the goal text still matches the linked task. */
export function syncLinkedTodoFromIntentInput() {
  const id = state.linkedTodoTaskId;
  if (!id) return;
  const task = listOpenTasksForSetup().find((t) => t.id === id);
  const typed = String(dom.taskIntent?.value || "").trim();
  if (!task || typed !== String(task.title || "").trim()) {
    clearLinkedTodo();
  }
}

export function renderSetupTodoPick() {
  const select = dom.setupTodoPick;
  if (!select) return;
  loadTodos();
  const selected = state.linkedTodoTaskId || "";
  const tasks = listOpenTasksForSetup();
  const stillOpen = tasks.some((t) => t.id === selected);
  if (selected && !stillOpen) state.linkedTodoTaskId = null;
  const current = stillOpen ? selected : "";
  select.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = tasks.length ? "Link a to-do (optional)…" : "No open to-dos yet";
  select.append(empty);

  const byList = new Map();
  tasks.forEach((task) => {
    const listName = findList(task.listId)?.name || "Tasks";
    if (!byList.has(listName)) byList.set(listName, []);
    byList.get(listName).push(task);
  });
  byList.forEach((listTasks, listName) => {
    const group = document.createElement("optgroup");
    group.label = listName;
    listTasks.forEach((task) => {
      const opt = document.createElement("option");
      opt.value = task.id;
      opt.textContent = task.title;
      group.append(opt);
    });
    select.append(group);
  });
  select.value = current;
  select.disabled = tasks.length === 0 && !current;
  syncLinkedTodoBar();
}

export function syncDurationChips() {
  const value = String(dom.durationPreset?.value || "45");
  document.querySelectorAll(".duration-chip").forEach((chip) => {
    const on = chip.dataset.duration === value;
    chip.classList.toggle("is-selected", on);
    chip.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

export function resetSetupFormDefaults() {
  if (dom.taskIntent) dom.taskIntent.value = "";
  clearLinkedTodo();
  if (dom.goalTag) dom.goalTag.value = "";
  if (dom.goalTagCustom) dom.goalTagCustom.value = "";
  if (dom.durationPreset) dom.durationPreset.value = "45";
  if (dom.customHours) dom.customHours.value = "1";
  if (dom.customMinutes) dom.customMinutes.value = "30";
  if (dom.customDuration) {
    dom.customDuration.classList.add("is-hidden");
    dom.customDuration.setAttribute("aria-hidden", "true");
  }
  if (dom.sessionStyle) dom.sessionStyle.value = "standard";
  syncHardcoreHint();
  syncDurationChips();
  if (dom.goalTagCustom) {
    dom.goalTagCustom.classList.add("is-hidden");
    dom.goalTagCustom.setAttribute("aria-hidden", "true");
  }
  renderSetupTodoPick();
}

export function completedFocusInRange(start, end) {
  return countedFocusRecords().reduce((sum, r) => {
    const t = Date.parse(r.completedAt);
    if (!Number.isFinite(t) || t < start.getTime() || t > end.getTime()) return sum;
    return sum + Math.max(0, r.focusSeconds || 0);
  }, 0);
}

export function focusProgress() {
  ensureWeekRollover({ notify: true });
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart); todayEnd.setHours(23, 59, 59, 999);
  const window = currentProgressWindow(now);
  const dailyStart = window.start > todayStart ? window.start : todayStart;
  return {
    dailySeconds: completedFocusInRange(dailyStart, todayEnd),
    weeklySeconds: completedFocusInRange(window.start, window.end),
    dailyGoal: state.focusGoals.dailyMinutes * 60,
    weeklyGoal: state.focusGoals.weeklyMinutes * 60,
    weekStart: window.start,
    weekEnd: window.end
  };
}

export function renderFocusGoals() {
  const p = focusProgress();
  const dailyPct = Math.min(100, p.dailyGoal ? (p.dailySeconds / p.dailyGoal) * 100 : 0);
  const weeklyPct = Math.min(100, p.weeklyGoal ? (p.weeklySeconds / p.weeklyGoal) * 100 : 0);
  const dailyLabel = `${formatDuration(p.dailySeconds)} / ${formatDuration(p.dailyGoal)}`;
  const weeklyLabel = `${formatDuration(p.weeklySeconds)} / ${formatDuration(p.weeklyGoal)}`;
  if (dom.setupDailyProgressLabel) dom.setupDailyProgressLabel.textContent = dailyLabel;
  if (dom.setupDailyProgressBar) dom.setupDailyProgressBar.style.width = `${dailyPct}%`;
  if (dom.setupWeeklyProgressHint) dom.setupWeeklyProgressHint.textContent = `This week: ${weeklyLabel}`;
  // Keep in-progress edits when the panel is dirty; only sync editors from saved goals when clean.
  if (!state.focusGoalsDirty) {
    syncGoalEditor("daily", state.focusGoals.dailyMinutes);
    syncGoalEditor("weekly", state.focusGoals.weeklyMinutes);
    syncWeekStartsOnEditor(state.focusGoals.weekStartsOn);
  } else {
    updateWeekResetChrome(readWeekStartsOnFromDom());
  }
  if (dom.insightsDailyProgressBar) dom.insightsDailyProgressBar.style.width = `${dailyPct}%`;
  if (dom.insightsDailyProgressLabel) dom.insightsDailyProgressLabel.textContent = `${dailyLabel} today`;
  if (dom.insightsWeeklyProgressBar) dom.insightsWeeklyProgressBar.style.width = `${weeklyPct}%`;
  if (dom.insightsWeeklyProgressLabel) dom.insightsWeeklyProgressLabel.textContent = `${weeklyLabel} this week`;
  syncFocusGoalsDirtyUi();
  renderWeekReports();
}

export function renderRecentGoals() {
  if (!dom.recentGoals) return;
  dom.recentGoals.replaceChildren();
  const empty = !state.recentGoals.length;
  dom.recentGoals.classList.toggle("is-hidden", empty);
  dom.recentGoalsLabel?.classList.toggle("is-hidden", empty);
  if (empty) return;
  state.recentGoals.forEach((goal) => {
    const chip = document.createElement("div");
    chip.className = "recent-goal-chip";
    const mins = goal.durationPreset === "custom"
      ? Math.max(1, Math.round((goal.customSeconds || 0) / 60))
      : Number(goal.durationPreset) || 45;
    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = "recent-goal-apply";
    applyBtn.setAttribute("aria-label", `Use recent goal ${goal.intent}`);
    const title = document.createElement("span");
    title.textContent = goal.intent;
    const meta = document.createElement("small");
    meta.textContent = `${mins}m · ${goal.style === "hardcore" ? "Hardcore" : "Standard"}${goal.tag ? ` · ${goal.tag}` : ""}`;
    applyBtn.append(title, meta);
    applyBtn.addEventListener("click", () => applyRecentGoal(goal));
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "recent-goal-remove";
    removeBtn.setAttribute("aria-label", `Remove recent goal ${goal.intent}`);
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeRecentGoal(goal.intent);
    });
    chip.append(applyBtn, removeBtn);
    dom.recentGoals.append(chip);
  });
}

export function applyRecentGoal(goal) {
  if (!goal) return;
  clearLinkedTodo({ refreshPick: true });
  dom.taskIntent.value = goal.intent;
  const DURATION_PRESETS = ["15", "25", "30", "45", "60", "120"];
  if (goal.durationPreset === "custom" && goal.customSeconds >= 60) {
    dom.durationPreset.value = "custom";
    dom.customDuration.classList.remove("is-hidden");
    dom.customDuration.setAttribute("aria-hidden", "false");
    const totalMin = Math.floor(goal.customSeconds / 60);
    dom.customHours.value = String(Math.floor(totalMin / 60));
    dom.customMinutes.value = String(totalMin % 60);
  } else if (DURATION_PRESETS.includes(String(goal.durationPreset))) {
    dom.durationPreset.value = String(goal.durationPreset);
    dom.customDuration.classList.add("is-hidden");
    dom.customDuration.setAttribute("aria-hidden", "true");
  } else {
    // Legacy presets (25 / 90 / etc.) become Custom so the saved length is kept.
    const legacyMins = Math.floor(Number(goal.durationPreset) || 0);
    if (legacyMins >= 1) {
      dom.durationPreset.value = "custom";
      dom.customDuration.classList.remove("is-hidden");
      dom.customDuration.setAttribute("aria-hidden", "false");
      dom.customHours.value = String(Math.floor(legacyMins / 60));
      dom.customMinutes.value = String(legacyMins % 60);
    } else {
      dom.durationPreset.value = "45";
      dom.customDuration.classList.add("is-hidden");
      dom.customDuration.setAttribute("aria-hidden", "true");
    }
  }
  if (dom.sessionStyle) dom.sessionStyle.value = goal.style === "hardcore" ? "hardcore" : "standard";
  syncHardcoreHint();
  syncDurationChips();
  if (dom.goalTag) {
    const known = ["Study", "Code", "Writing", "Testing"];
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

export function renderSetup() {
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
  syncHardcoreHint();
  if (state.prefs.showSetupHeatmap !== false) {
    drawHeatmap(countedFocusRecords(), { setup: true, insights: false });
  }
  renderSetupTodosWidget();
  renderSetupTodoPick();
}
