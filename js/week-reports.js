/** Weekly goal rollover reports — history stays intact; progress window resets. */
import { FOCUS_GOALS_KEY, MAX_WEEK_REPORTS, WEEK_REPORTS_KEY } from "./constants.js?v=140";
import { dom, state } from "./runtime.js?v=140";
import { safeRead, safeWrite } from "./storage.js?v=140";
import { showToast } from "./toast.js?v=140";
import {
  download,
  endOfWeek,
  formatDuration,
  formatShortDate,
  localDayKey,
  scoreFor,
  startOfWeek,
  WEEKDAY_OPTIONS
} from "./utils.js?v=140";
import { completionDurationLabel } from "./todos.js?v=140";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function weekKeyFromDate(date, weekStartsOn) {
  return localDayKey(startOfWeek(date, weekStartsOn));
}

function dayStart(isoOrDate) {
  if (isoOrDate instanceof Date) {
    const d = new Date(isoOrDate);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const d = new Date(`${String(isoOrDate).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function inRange(iso, start, end) {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= start.getTime() && t <= end.getTime();
}

/** Active weekly progress window (supports mid-week manual resets). */
export function currentProgressWindow(now = new Date()) {
  const weekStartsOn = state.focusGoals?.weekStartsOn;
  const calendarStart = startOfWeek(now, weekStartsOn);
  const calendarEnd = endOfWeek(now, weekStartsOn);
  let startKey = state.focusGoals?.activeWeekKey || localDayKey(calendarStart);
  let start = dayStart(startKey);
  if (start < calendarStart) {
    start = new Date(calendarStart);
    startKey = localDayKey(start);
  }
  if (start > now) {
    start = new Date(calendarStart);
    startKey = localDayKey(start);
  }
  return { start, end: calendarEnd, startKey, calendarStartKey: localDayKey(calendarStart) };
}

function persistFocusGoalsMeta() {
  const g = state.focusGoals || {};
  return safeWrite(FOCUS_GOALS_KEY, {
    dailyMinutes: g.dailyMinutes,
    weeklyMinutes: g.weeklyMinutes,
    weekStartsOn: g.weekStartsOn,
    activeWeekKey: g.activeWeekKey || null
  });
}

export function loadWeekReports() {
  const raw = safeRead(WEEK_REPORTS_KEY, []);
  state.weekReports = (Array.isArray(raw) ? raw : [])
    .filter((r) => r && r.weekStartKey)
    .slice(0, MAX_WEEK_REPORTS);
  return state.weekReports;
}

export function saveWeekReports() {
  const list = (state.weekReports || []).slice(0, MAX_WEEK_REPORTS);
  state.weekReports = list;
  return safeWrite(WEEK_REPORTS_KEY, list);
}

export function buildWeekReportForRange(startInput, endInput, {
  weekStartsOn = state.focusGoals?.weekStartsOn,
  weeklyMinutes = state.focusGoals?.weeklyMinutes,
  dailyMinutes = state.focusGoals?.dailyMinutes,
  idSuffix = ""
} = {}) {
  const start = dayStart(startInput);
  const end = endInput instanceof Date ? new Date(endInput) : dayStart(endInput);
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return null;
  if (!(end instanceof Date) || Number.isNaN(end.getTime())) return null;
  if (end < start) return null;
  end.setHours(23, 59, 59, 999);

  const weekStartKey = localDayKey(start);
  const weekEndKey = localDayKey(end);
  const sessions = (state.history || []).filter((r) => inRange(r.completedAt, start, end));
  const completedSessions = sessions.filter((r) => r.outcome === "completed");
  const failedSessions = sessions.filter((r) => r.outcome === "failed");
  const otherSessions = sessions.filter((r) => r.outcome !== "completed" && r.outcome !== "failed");
  const focusSeconds = sessions.reduce((sum, r) => sum + Math.max(0, r.focusSeconds || 0), 0);
  const completedFocus = completedSessions.reduce((sum, r) => sum + Math.max(0, r.focusSeconds || 0), 0);
  const breakSeconds = sessions.reduce((sum, r) => sum + Math.max(0, r.breakSeconds || 0), 0);
  const scores = completedSessions.map((r) => scoreFor(r)).filter((s) => s != null);
  const avgScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;

  const byDayMap = {};
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const last = dayStart(end);
  while (cursor <= last) {
    byDayMap[localDayKey(cursor)] = 0;
    cursor.setDate(cursor.getDate() + 1);
  }
  sessions.forEach((r) => {
    const k = localDayKey(r.completedAt);
    if (k in byDayMap) byDayMap[k] += Math.max(0, r.focusSeconds || 0);
  });
  const byDay = Object.entries(byDayMap).map(([day, seconds]) => ({ day, focusSeconds: seconds }));
  const bestDay = byDay.slice().sort((a, b) => b.focusSeconds - a.focusSeconds)[0] || null;
  const daysActive = byDay.filter((d) => d.focusSeconds > 0).length;

  const byTag = {};
  sessions.forEach((r) => {
    const tag = String(r.tag || "").trim() || "Untagged";
    if (!byTag[tag]) byTag[tag] = { sessions: 0, focusSeconds: 0 };
    byTag[tag].sessions += 1;
    byTag[tag].focusSeconds += Math.max(0, r.focusSeconds || 0);
  });

  const todosDoc = state.todos || { lists: [], tasks: [] };
  const listName = (id) => todosDoc.lists?.find((l) => l.id === id)?.name || "List";
  const completedTodos = (todosDoc.tasks || [])
    .filter((t) => t.completedAt && inRange(t.completedAt, start, end))
    .map((t) => ({
      id: t.id,
      title: t.title,
      listName: listName(t.listId),
      completedAt: t.completedAt,
      priority: t.priority || "medium",
      took: completionDurationLabel(t)
    }))
    .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));

  const weeklyGoalSeconds = Math.max(0, Number(weeklyMinutes) || 0) * 60;
  const goalPct = weeklyGoalSeconds
    ? Math.round(Math.min(200, (completedFocus / weeklyGoalSeconds) * 100))
    : null;

  const hasActivity = sessions.length > 0 || completedTodos.length > 0;
  if (!hasActivity) return null;

  return {
    id: `week-${weekStartKey}${idSuffix ? `-${idSuffix}` : ""}-${weekEndKey}`,
    weekStartKey,
    weekEndKey,
    weekStartsOn: Number(weekStartsOn),
    createdAt: new Date().toISOString(),
    goals: {
      dailyMinutes: Number(dailyMinutes) || 0,
      weeklyMinutes: Number(weeklyMinutes) || 0
    },
    sessions: {
      total: sessions.length,
      completed: completedSessions.length,
      failed: failedSessions.length,
      other: otherSessions.length,
      focusSeconds,
      completedFocusSeconds: completedFocus,
      breakSeconds,
      avgScore,
      byDay,
      byTag,
      highlights: completedSessions
        .slice()
        .sort((a, b) => (b.focusSeconds || 0) - (a.focusSeconds || 0))
        .slice(0, 5)
        .map((r) => ({
          id: r.id,
          intent: r.intent,
          focusSeconds: r.focusSeconds,
          score: scoreFor(r),
          tag: r.tag || "",
          completedAt: r.completedAt
        }))
    },
    todos: {
      completedCount: completedTodos.length,
      items: completedTodos.slice(0, 40)
    },
    performance: {
      weeklyGoalPct: goalPct,
      daysActive,
      bestDay: bestDay?.focusSeconds ? bestDay : null,
      metWeeklyGoal: goalPct != null ? goalPct >= 100 : false
    }
  };
}

export function buildWeekReport(weekStartKey, options = {}) {
  if (!weekStartKey || !/^\d{4}-\d{2}-\d{2}$/.test(weekStartKey)) return null;
  const weekStartsOn = options.weekStartsOn ?? state.focusGoals?.weekStartsOn;
  const start = dayStart(weekStartKey);
  const end = endOfWeek(start, weekStartsOn);
  return buildWeekReportForRange(start, end, options);
}

export function upsertWeekReport(report) {
  if (!report?.id || !report?.weekStartKey) return false;
  const list = Array.isArray(state.weekReports) ? state.weekReports.slice() : [];
  const idx = list.findIndex((r) => r.id === report.id);
  if (idx >= 0) list[idx] = report;
  else list.unshift(report);
  list.sort((a, b) => String(b.weekEndKey || b.weekStartKey).localeCompare(String(a.weekEndKey || a.weekStartKey)));
  state.weekReports = list.slice(0, MAX_WEEK_REPORTS);
  return saveWeekReports();
}

/**
 * If the calendar week advanced past the active progress window, archive it.
 * Does not delete or mutate session history — only rolls the goal window.
 */
export function ensureWeekRollover({ notify = true } = {}) {
  if (!state.focusGoals) return false;
  const weekStartsOn = state.focusGoals.weekStartsOn;
  const now = new Date();
  const calendarKey = weekKeyFromDate(now, weekStartsOn);
  const prevKey = state.focusGoals.activeWeekKey;

  if (!prevKey) {
    state.focusGoals.activeWeekKey = calendarKey;
    persistFocusGoalsMeta();
    return false;
  }

  const prevStart = dayStart(prevKey);
  const calendarStart = startOfWeek(now, weekStartsOn);
  // Still inside the same calendar week (including mid-week manual reset).
  if (prevStart >= calendarStart) return false;

  const rangeEnd = endOfWeek(prevStart, weekStartsOn);
  const report = buildWeekReportForRange(prevStart, rangeEnd, {
    weekStartsOn: state.focusGoals.weekStartsOn,
    weeklyMinutes: state.focusGoals.weeklyMinutes,
    dailyMinutes: state.focusGoals.dailyMinutes
  });
  let created = false;
  if (report) {
    created = upsertWeekReport(report);
    if (created && notify) {
      showToast("New week started — last week's performance report is ready. History was kept.");
    }
  }

  state.focusGoals.activeWeekKey = calendarKey;
  persistFocusGoalsMeta();
  return created;
}

/**
 * Close the current progress window now, save a report, and start fresh.
 * Session history is never deleted.
 */
export function resetWeekNow({ notify = true } = {}) {
  if (!state.focusGoals) return false;
  const now = new Date();
  const window = currentProgressWindow(now);
  const report = buildWeekReportForRange(window.start, now, {
    weekStartsOn: state.focusGoals.weekStartsOn,
    weeklyMinutes: state.focusGoals.weeklyMinutes,
    dailyMinutes: state.focusGoals.dailyMinutes,
    idSuffix: "manual"
  });

  let created = false;
  if (report) {
    created = upsertWeekReport(report);
    state.openWeekReportId = report.id;
  }

  // Start a new progress window from today so weekly goal % resets immediately.
  state.focusGoals.activeWeekKey = localDayKey(now);
  persistFocusGoalsMeta();

  if (notify) {
    showToast(created
      ? "Week reset — performance report saved. History was kept."
      : "Week reset — progress starts fresh. History was kept.");
  }
  return true;
}

export function weekdayLabel(value) {
  return WEEKDAY_OPTIONS.find((d) => d.value === Number(value))?.label || "Monday";
}

function findWeekReport(id) {
  return (state.weekReports || []).find((r) => r.id === id) || null;
}

function weekReportFilename(report, ext) {
  const start = String(report.weekStartKey || "week").slice(0, 10);
  const end = String(report.weekEndKey || start).slice(0, 10);
  return `locked-in-week-${start}-to-${end}.${ext}`;
}

export function formatWeekReportText(report) {
  const sessions = report.sessions || {};
  const todos = report.todos || {};
  const perf = report.performance || {};
  const goals = report.goals || {};
  const lines = [
    "Locked-In — Weekly performance report",
    `${formatShortDate(report.weekStartKey)} – ${formatShortDate(report.weekEndKey)}`,
    `Generated ${report.createdAt ? formatShortDate(localDayKey(report.createdAt)) : "—"}`,
    "",
    "Goals",
    `- Daily: ${formatDuration((goals.dailyMinutes || 0) * 60)}`,
    `- Weekly: ${formatDuration((goals.weeklyMinutes || 0) * 60)}`,
    `- Progress: ${perf.weeklyGoalPct == null ? "—" : `${perf.weeklyGoalPct}%`}${perf.metWeeklyGoal ? " (met)" : ""}`,
    "",
    "Sessions",
    `- Completed focus: ${formatDuration(sessions.completedFocusSeconds || 0)}`,
    `- All focus logged: ${formatDuration(sessions.focusSeconds || 0)}`,
    `- Sessions: ${sessions.completed || 0} completed / ${sessions.total || 0} total`,
    `- Failed (hardcore): ${sessions.failed || 0}`,
    `- Break time: ${formatDuration(sessions.breakSeconds || 0)}`,
    `- Average score: ${sessions.avgScore == null ? "—" : `${sessions.avgScore}%`}`,
    `- Active days: ${perf.daysActive || 0}`,
    perf.bestDay?.day
      ? `- Best day: ${formatShortDate(perf.bestDay.day)} · ${formatDuration(perf.bestDay.focusSeconds)}`
      : "- Best day: —",
    "",
    "Focus by day"
  ];

  (sessions.byDay || []).forEach((d) => {
    lines.push(`- ${formatShortDate(d.day)}: ${formatDuration(d.focusSeconds)}`);
  });

  lines.push("", "By tag");
  const tags = Object.entries(sessions.byTag || {}).sort((a, b) => b[1].focusSeconds - a[1].focusSeconds);
  if (!tags.length) lines.push("- None");
  else tags.forEach(([tag, info]) => {
    lines.push(`- ${tag}: ${formatDuration(info.focusSeconds)} · ${info.sessions} session${info.sessions === 1 ? "" : "s"}`);
  });

  lines.push("", "Top sessions");
  if (!(sessions.highlights || []).length) lines.push("- None");
  else sessions.highlights.forEach((s) => {
    lines.push(`- ${s.intent} · ${formatDuration(s.focusSeconds)}${s.score != null ? ` · ${s.score}%` : ""}${s.tag ? ` · ${s.tag}` : ""}`);
  });

  lines.push("", `Todos completed (${todos.completedCount || 0})`);
  if (!(todos.items || []).length) lines.push("- None");
  else todos.items.forEach((t) => {
    lines.push(`- ${t.title} · ${t.listName}${t.took ? ` · Took ${t.took}` : ""}`);
  });

  lines.push("", "Note: Session history was kept. This report only archives weekly progress.");
  return `${lines.join("\n")}\n`;
}

export function downloadWeekReport(reportId, { format = "text" } = {}) {
  const report = findWeekReport(reportId);
  if (!report) {
    showToast("Week report not found.");
    return false;
  }
  if (format === "json") {
    download(
      weekReportFilename(report, "json"),
      JSON.stringify({
        schemaVersion: 1,
        app: "Locked-In",
        type: "week-report",
        exportedAt: new Date().toISOString(),
        report
      }, null, 2),
      "application/json"
    );
    showToast("Week report JSON ready.");
    return true;
  }
  download(weekReportFilename(report, "txt"), formatWeekReportText(report), "text/plain;charset=utf-8");
  showToast("Week report downloaded.");
  return true;
}

export function renderWeekReports() {
  const root = dom.weekReportsList || document.getElementById("week-reports-list");
  const empty = dom.weekReportsEmpty || document.getElementById("week-reports-empty");
  if (!root) return;
  if (!state.weekReports) loadWeekReports();
  const reports = state.weekReports || [];

  if (empty) empty.hidden = reports.length > 0;
  if (!reports.length) {
    root.replaceChildren();
    return;
  }

  root.innerHTML = reports.map((report) => {
    const pct = report.performance?.weeklyGoalPct;
    const pctLabel = pct == null ? "—" : `${pct}%`;
    const range = `${formatShortDate(report.weekStartKey)} – ${formatShortDate(report.weekEndKey)}`;
    const open = state.openWeekReportId === report.id;
    return `
      <article class="week-report-card ${open ? "is-open" : ""}" data-week-report-id="${escapeHtml(report.id)}">
        <div class="week-report-head">
          <button type="button" class="week-report-summary" data-week-report-toggle="${escapeHtml(report.id)}" aria-expanded="${open}">
            <span class="week-report-summary-main">
              <strong>${escapeHtml(range)}</strong>
              <span>${formatDuration(report.sessions?.completedFocusSeconds || 0)} focused · ${report.todos?.completedCount || 0} todos</span>
            </span>
            <span class="week-report-summary-meta">
              <span class="week-report-pct ${report.performance?.metWeeklyGoal ? "is-met" : ""}">${escapeHtml(pctLabel)} goal</span>
              <span class="week-report-caret" aria-hidden="true">${open ? "▴" : "▾"}</span>
            </span>
          </button>
          <div class="week-report-toolbar">
            <button type="button" class="button button-ghost button-small" data-week-report-download="${escapeHtml(report.id)}" data-week-report-format="text">Download</button>
            <button type="button" class="button button-ghost button-small" data-week-report-download="${escapeHtml(report.id)}" data-week-report-format="json">JSON</button>
          </div>
        </div>
        ${open ? weekReportDetailHtml(report) : ""}
      </article>
    `;
  }).join("");
}

function shortDayLabel(iso) {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return formatShortDate(iso);
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  return `${weekday} ${d.getDate()}`;
}

function weekReportDetailHtml(report) {
  const sessions = report.sessions || {};
  const todos = report.todos || {};
  const perf = report.performance || {};
  const days = sessions.byDay || [];
  const maxDay = Math.max(1, ...days.map((d) => d.focusSeconds || 0));
  const byTag = Object.entries(sessions.byTag || {})
    .sort((a, b) => b[1].focusSeconds - a[1].focusSeconds)
    .slice(0, 6);
  const maxTag = Math.max(1, ...byTag.map(([, info]) => info.focusSeconds || 0));
  const goalPct = perf.weeklyGoalPct;
  const focusLabel = formatDuration(sessions.completedFocusSeconds || 0);
  const goalLabel = goalPct == null ? "No weekly goal set" : `${goalPct}% of weekly goal`;
  const best = perf.bestDay
    ? `Best ${shortDayLabel(perf.bestDay.day)} · ${formatDuration(perf.bestDay.focusSeconds)}`
    : null;

  const dayBars = days.length
    ? days.map((d) => {
      const secs = d.focusSeconds || 0;
      const pct = Math.round((secs / maxDay) * 100);
      const active = secs > 0;
      return `
        <li class="${active ? "is-active" : ""}">
          <span class="week-report-bar-label">${escapeHtml(shortDayLabel(d.day))}</span>
          <span class="week-report-bar-track" aria-hidden="true"><i style="width:${pct}%"></i></span>
          <span class="week-report-bar-val">${formatDuration(secs)}</span>
        </li>`;
    }).join("")
    : `<li class="week-report-empty-row">No focus logged</li>`;

  const tagRows = byTag.length
    ? byTag.map(([tag, info]) => {
      const secs = info.focusSeconds || 0;
      const pct = Math.round((secs / maxTag) * 100);
      return `
        <li class="${secs > 0 ? "is-active" : ""}">
          <span class="week-report-bar-label">${escapeHtml(tag)}</span>
          <span class="week-report-bar-track" aria-hidden="true"><i style="width:${pct}%"></i></span>
          <span class="week-report-bar-val">${formatDuration(secs)}</span>
        </li>`;
    }).join("")
    : `<li class="week-report-empty-row">No tags</li>`;

  const sessionRows = (sessions.highlights || []).length
    ? sessions.highlights.map((s) => `
        <li>
          <div class="week-report-row-main">
            <strong>${escapeHtml(s.intent)}</strong>
            <span>${formatDuration(s.focusSeconds)}${s.score != null ? ` · ${s.score}%` : ""}${s.tag ? ` · ${escapeHtml(s.tag)}` : ""}</span>
          </div>
        </li>`).join("")
    : `<li class="week-report-empty-row">No completed sessions</li>`;

  const todoRows = (todos.items || []).length
    ? todos.items.map((t) => `
        <li>
          <div class="week-report-row-main">
            <strong>${escapeHtml(t.title)}</strong>
            <span>${escapeHtml(t.listName)}${t.took ? ` · ${escapeHtml(t.took)}` : ""}</span>
          </div>
        </li>`).join("")
    : `<li class="week-report-empty-row">No todos completed</li>`;

  return `
    <div class="week-report-detail">
      <div class="week-report-hero">
        <div class="week-report-hero-focus">
          <strong>${focusLabel}</strong>
          <span>${escapeHtml(goalLabel)}</span>
        </div>
        <div class="week-report-hero-goal" aria-hidden="true">
          <span class="week-report-goal-ring ${perf.metWeeklyGoal ? "is-met" : ""}" style="--goal-pct:${Math.min(100, goalPct || 0)}">
            <em>${goalPct == null ? "—" : `${goalPct}%`}</em>
          </span>
        </div>
      </div>
      <dl class="week-report-metrics">
        <div><dt>Sessions</dt><dd>${sessions.completed || 0}/${sessions.total || 0}</dd></div>
        <div><dt>Todos</dt><dd>${todos.completedCount || 0}</dd></div>
        <div><dt>Active days</dt><dd>${perf.daysActive || 0}/7</dd></div>
        <div><dt>Avg score</dt><dd>${sessions.avgScore == null ? "—" : `${sessions.avgScore}%`}</dd></div>
      </dl>
      ${best ? `<p class="week-report-best">${escapeHtml(best)}</p>` : ""}
      <section class="week-report-section">
        <h3>Focus by day</h3>
        <ul class="week-report-bars">${dayBars}</ul>
      </section>
      <div class="week-report-split">
        <section class="week-report-section">
          <h3>By tag</h3>
          <ul class="week-report-bars week-report-bars-compact">${tagRows}</ul>
        </section>
        <section class="week-report-section">
          <h3>Top sessions</h3>
          <ul class="week-report-plain-list">${sessionRows}</ul>
        </section>
      </div>
      <section class="week-report-section">
        <h3>Todos completed</h3>
        <ul class="week-report-plain-list">${todoRows}</ul>
      </section>
      ${sessions.failed
        ? `<p class="week-report-footnote">${sessions.failed} hardcore failure${sessions.failed === 1 ? "" : "s"} · ${formatDuration(sessions.breakSeconds || 0)} break</p>`
        : `<p class="week-report-footnote">History kept — only the weekly goal window reset.</p>`}
    </div>
  `;
}

export function bindWeekReportEvents() {
  const panel = document.getElementById("week-reports-panel");
  if (!panel || panel.dataset.bound === "1") return;
  panel.dataset.bound = "1";
  panel.addEventListener("click", (event) => {
    const downloadBtn = event.target.closest("[data-week-report-download]");
    if (downloadBtn) {
      event.preventDefault();
      event.stopPropagation();
      downloadWeekReport(downloadBtn.dataset.weekReportDownload, {
        format: downloadBtn.dataset.weekReportFormat === "json" ? "json" : "text"
      });
      return;
    }
    const toggle = event.target.closest("[data-week-report-toggle]");
    if (!toggle) return;
    const id = toggle.dataset.weekReportToggle;
    state.openWeekReportId = state.openWeekReportId === id ? null : id;
    renderWeekReports();
  });
}
