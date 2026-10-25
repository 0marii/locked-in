import {
  DEFAULT_POMODORO_MINUTES,
  GOAL_LIMITS,
  POMODORO_CUSTOM_MAX,
  POMODORO_CUSTOM_MIN,
  POMODORO_MINUTE_OPTIONS
} from "./constants.js?v=187";
import { state } from "./runtime.js?v=187";

export function normalizePomodoroMinutes(value) {
  const mins = Math.floor(Number(value) || 0);
  if (POMODORO_MINUTE_OPTIONS.includes(mins)) return mins;
  if (mins >= POMODORO_CUSTOM_MIN && mins <= POMODORO_CUSTOM_MAX) return mins;
  return DEFAULT_POMODORO_MINUTES;
}

export function isPomodoroPresetMinutes(value) {
  return POMODORO_MINUTE_OPTIONS.includes(Math.floor(Number(value) || 0));
}

export function clampGoalMinutes(kind, minutes) {
  const lim = GOAL_LIMITS[kind] || GOAL_LIMITS.daily;
  const raw = Math.floor(Number(minutes) || 0);
  return Math.max(lim.min, Math.min(lim.max, raw));
}

export function formatGoalClock(totalMinutes) {
  const mins = Math.max(0, Math.floor(Number(totalMinutes) || 0));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** 0 = Sunday … 6 = Saturday. Defaults to Monday (1) for existing installs. */
export function normalizeWeekStartsOn(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 && n <= 6 ? n : 1;
}

export function currentWeekStartsOn() {
  return normalizeWeekStartsOn(state.focusGoals?.weekStartsOn);
}

export function startOfWeek(date = new Date(), weekStartsOn = currentWeekStartsOn()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const start = normalizeWeekStartsOn(weekStartsOn);
  const diff = (d.getDay() - start + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

export function endOfWeek(date = new Date(), weekStartsOn = currentWeekStartsOn()) {
  const start = startOfWeek(date, weekStartsOn);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export const WEEKDAY_OPTIONS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" }
];

export function formatClock(total, hours = false) {
  const s = Math.max(0, Math.floor(Number(total) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (hours || h > 0) return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}

export function formatDuration(total) {
  const s = Math.max(0, Math.floor(Number(total) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h) return `${h}h ${String(m).padStart(2,"0")}m`;
  if (m) return sec ? `${m}m ${sec}s` : `${m}m`;
  return `${sec}s`;
}

export function formatDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "Unknown date" : new Intl.DateTimeFormat(undefined, {year:"numeric", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit"}).format(d);
}

export function localDayKey(value) {
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function completedRecords() {
  return state.history.filter(r => r.outcome === "completed");
}

export function scoreFor(record) {
  if (record.scoreVersion === 2) return record.score;
  if (!record.targetSeconds) return null;
  return record.focusSeconds / record.targetSeconds >= .7 ? Math.round(record.focusSeconds / record.targetSeconds * 100) : null;
}

export function scoreBreakdown(record) {
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

export function explainScore(record) {
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

export function explainOutcome(record) {
  const b = scoreBreakdown(record);
  const reason = String(record.reason || "").trim();
  if (record.outcome === "active" || record.live) {
    return reason === "On break"
      ? "In progress — session is active and currently on a break."
      : "In progress — session is still running.";
  }
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

export function toISODateLocal(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatShortDate(iso) {
  if (!iso) return "Any date";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "Any date";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(d);
}

/** Theme-aware glow on filter controls while a non-default value is applied. */
export function setFilterGlow(el, active) {
  if (!el) return;
  const on = Boolean(active);
  const was = el.classList.contains("is-filter-active");
  el.classList.toggle("is-filter-active", on);
  if (!on) {
    el.classList.remove("is-filter-pulse");
    return;
  }
  if (was || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.classList.remove("is-filter-pulse");
  void el.offsetWidth;
  el.classList.add("is-filter-pulse");
  window.setTimeout(() => el.classList.remove("is-filter-pulse"), 900);
}

export function csvEscape(value) {
  let text=String(value??"");
  if(/^[\s]*[=+\-@]/.test(text))text="'"+text;
  return `"${text.replace(/"/g,'""')}"`;
}

export function download(name,data,type) {
  const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function noteFilename(label = "note") {
  const safe = String(label || "note").trim().replace(/[^\w\-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "note";
  return `locked-in-${safe}-${toISODateLocal(new Date())}.txt`;
}
