import { ACTIVE_SESSION_KEY, DEFAULT_POMODORO_MINUTES, FOCUS_GOALS_KEY, GOAL_LIMITS, HISTORY_KEY, LEGACY_HISTORY_KEYS, MAX_HISTORY, NOTES_INBOX_KEY, PREFS_KEY, RECENT_GOALS_KEY } from "./constants.js?v=76";
import { dom, state } from "./runtime.js?v=76";
import { safeRead, safeWrite } from "./storage.js?v=76";
import { showToast } from "./toast.js?v=76";
import { clampGoalMinutes, completedRecords, formatClock, formatDuration, formatGoalClock, normalizePomodoroMinutes, startOfWeek } from "./utils.js?v=76";
import { normalizeRecord } from "./session.js?v=76";
import { drawHeatmap } from "./insights.js?v=76";

export const CHIME_HINTS = {
  off: "No sound when a session completes.",
  soft: "Quiet two-note chime when a session completes.",
  full: "Louder three-note chime so you notice the session ending."
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
  state.inbox = Array.isArray(inbox) ? inbox.map((n) => ({
    id: String(n?.id || `${Date.now()}-${Math.random()}`),
    text: String(n?.text || "").slice(0, 2000),
    createdAt: n?.createdAt || new Date().toISOString()
  })).filter(n => n.text.trim()).slice(0, 200) : [];
  loadPrefs();
  loadFocusGoals();
  loadRecentGoals();
}

export function pomodoroIntervalSeconds() {
  return normalizePomodoroMinutes(state.prefs.pomodoroMinutes) * 60;
}

export function syncPomodoroIntervalVisibility() {
  const on = Boolean(dom.prefPomodoro?.checked);
  if (!dom.prefPomodoroIntervalWrap) return;
  dom.prefPomodoroIntervalWrap.hidden = !on;
  dom.prefPomodoroIntervalWrap.classList.toggle("is-hidden", !on);
}

export function loadPrefs() {
  const p = safeRead(PREFS_KEY, null);
  const legacyEnd = (() => { try { return localStorage.getItem("locked_in_notify_end"); } catch (_) { return null; } })();
  const legacyBreak = (() => { try { return localStorage.getItem("locked_in_notify_break"); } catch (_) { return null; } })();
  const legacyChime = (() => { try { return localStorage.getItem("locked_in_chime_mode"); } catch (_) { return null; } })();
  state.prefs = {
    notifyEnd: Boolean(p?.notifyEnd ?? (legacyEnd === "true")),
    notifyBreak: Boolean(p?.notifyBreak ?? (legacyBreak === "true")),
    pomodoro: Boolean(p?.pomodoro),
    pomodoroMinutes: normalizePomodoroMinutes(p?.pomodoroMinutes ?? DEFAULT_POMODORO_MINUTES),
    chime: ["off", "soft", "full"].includes(p?.chime || legacyChime) ? (p?.chime || legacyChime) : "soft",
    panelOpen: Boolean(p?.panelOpen),
    showSetupGoal: p?.showSetupGoal !== false,
    showSetupHeatmap: p?.showSetupHeatmap !== false
  };
}

export function savePrefs() {
  return safeWrite(PREFS_KEY, state.prefs);
}

export function setPrefsPanelOpen(open) {
  const next = Boolean(open);
  state.prefs.panelOpen = next;
  if (dom.prefsPanel) {
    dom.prefsPanel.classList.toggle("is-open", next);
    dom.prefsPanel.classList.toggle("is-collapsed", !next);
  }
  if (dom.prefsToggleBtn) {
    dom.prefsToggleBtn.setAttribute("aria-expanded", next ? "true" : "false");
    dom.prefsToggleBtn.setAttribute("aria-label", next ? "Hide preferences" : "Show preferences");
  }
  if (dom.prefsBody) {
    dom.prefsBody.hidden = !next;
    dom.prefsBody.classList.toggle("is-hidden", !next);
  }
}

function setWidgetVisible(el, visible) {
  if (!el) return;
  el.hidden = !visible;
  el.classList.toggle("is-hidden", !visible);
  el.setAttribute("aria-hidden", String(!visible));
}

export function syncSetupWidgetVisibility() {
  setWidgetVisible(dom.setupFocusGoalCard, state.prefs.showSetupGoal !== false);
  setWidgetVisible(dom.setupHeatmapBtn, state.prefs.showSetupHeatmap !== false);
}

export function applyPrefsToDom() {
  if (dom.prefNotifyEnd) dom.prefNotifyEnd.checked = state.prefs.notifyEnd;
  if (dom.prefNotifyBreak) dom.prefNotifyBreak.checked = state.prefs.notifyBreak;
  if (dom.prefPomodoro) dom.prefPomodoro.checked = state.prefs.pomodoro;
  if (dom.prefPomodoroMinutes) dom.prefPomodoroMinutes.value = String(normalizePomodoroMinutes(state.prefs.pomodoroMinutes));
  if (dom.prefShowSetupGoal) dom.prefShowSetupGoal.checked = state.prefs.showSetupGoal !== false;
  if (dom.prefShowSetupHeatmap) dom.prefShowSetupHeatmap.checked = state.prefs.showSetupHeatmap !== false;
  const chime = ["off", "soft", "full"].includes(state.prefs.chime) ? state.prefs.chime : "soft";
  dom.prefChimeInputs.forEach((input) => {
    input.checked = input.value === chime;
  });
  syncChimeHint();
  syncPomodoroIntervalVisibility();
  syncSetupWidgetVisibility();
  setPrefsPanelOpen(state.prefs.panelOpen);
}

export function selectedChimeMode() {
  const chosen = dom.prefChimeInputs.find((input) => input.checked)?.value;
  return ["off", "soft", "full"].includes(chosen) ? chosen : "soft";
}

export function syncChimeHint() {
  if (!dom.prefChimeHint) return;
  dom.prefChimeHint.textContent = CHIME_HINTS[selectedChimeMode()] || CHIME_HINTS.soft;
}

export function loadFocusGoals() {
  const g = safeRead(FOCUS_GOALS_KEY, null);
  state.focusGoals = {
    dailyMinutes: clampGoalMinutes("daily", g?.dailyMinutes ?? 120),
    weeklyMinutes: clampGoalMinutes("weekly", g?.weeklyMinutes ?? 600)
  };
}

export function readGoalMinutesFromDom(kind) {
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

export function syncGoalEditor(kind, totalMinutes) {
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

export function draftFocusGoalsFromDom() {
  return {
    dailyMinutes: syncGoalEditor("daily", readGoalMinutesFromDom("daily")),
    weeklyMinutes: syncGoalEditor("weekly", readGoalMinutesFromDom("weekly"))
  };
}

export function saveFocusGoalsFromDom() {
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

export function resetSetupFormDefaults() {
  if (dom.taskIntent) dom.taskIntent.value = "";
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
  if (dom.goalTagCustom) {
    dom.goalTagCustom.classList.add("is-hidden");
    dom.goalTagCustom.setAttribute("aria-hidden", "true");
  }
}

export function completedFocusInRange(start, end) {
  return completedRecords().reduce((sum, r) => {
    const t = Date.parse(r.completedAt);
    if (!Number.isFinite(t) || t < start.getTime() || t > end.getTime()) return sum;
    return sum + Math.max(0, r.focusSeconds || 0);
  }, 0);
}

export function focusProgress() {
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

export function renderFocusGoals() {
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
  syncHardcoreHint();
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

export function renderSetup() {
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
  syncHardcoreHint();
  drawHeatmap(completed);
}
