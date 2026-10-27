import { dom, state } from "./runtime.js?v=202";
import { showToast } from "./toast.js?v=202";
import { completedRecords, countedFocusRecords, currentWeekStartsOn, download, formatDuration, localDayKey, startOfWeek } from "./utils.js?v=202";
import { focusProgress, renderFocusGoals } from "./setup.js?v=202";

export function downloadWeekCard() {
  const focusRecords = countedFocusRecords();
  const completed = completedRecords();
  const p = focusProgress();
  const streaks = calculateStreaks(focusRecords);
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
  ctx.fillText(`${completed.length} completed · ${formatDuration(p.weeklySeconds)} focused`, 72, 440);
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

function focusDayCount(records) {
  const days = new Set();
  records.forEach((record) => {
    const key = localDayKey(record.completedAt);
    if (key) days.add(key);
  });
  return days.size;
}

function averageFocusLabel(records) {
  if (!records.length) return "—";
  const total = records.reduce((sum, record) => sum + (Number(record.focusSeconds) || 0), 0);
  return formatDuration(total / records.length);
}

function appendInsightStat(label, value, note) {
  const card = document.createElement("div");
  card.className = "insight-stat";
  const title = document.createElement("span");
  title.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  const hint = document.createElement("p");
  hint.textContent = note;
  card.append(title, strong, hint);
  dom.insightsStats.append(card);
}

export function renderInsights() {
  const completed=completedRecords();
  const focusRecords=countedFocusRecords();
  const totalFocus=focusRecords.reduce((s,r)=>s+r.focusSeconds,0);
  const attempts=state.history.length;
  const hasFocus=focusRecords.length > 0;
  dom.insightsStats.replaceChildren();
  [
    ["Focus time", formatDuration(totalFocus), "Includes sessions you ended early"],
    ["Sessions finished", attempts ? `${completed.length} of ${attempts}` : "—", "Reached 70% of the time you planned"],
    ["Avg session", averageFocusLabel(focusRecords), "Usual time you stayed focused"],
    ["Focus days", hasFocus ? String(focusDayCount(focusRecords)) : "—", "Days you showed up and focused"]
  ].forEach(([label, value, note]) => appendInsightStat(label, value, note));
  if (!attempts) {
    dom.insightsSummary.textContent = state.session
      ? "Finish this session to unlock your private insights."
      : "Start a session to build your private insights.";
  } else if (!hasFocus) {
    dom.insightsSummary.textContent = `${attempts} saved attempt${attempts === 1 ? "" : "s"} with no counted focus yet. Hardcore failures do not add focus time.`;
  } else {
    dom.insightsSummary.textContent = "Sessions finished means you reached 70% of the plan. Focus time still includes sessions you stopped early. Hardcore failures are left out.";
  }
  if (dom.insightsEmptyPatterns) {
    dom.insightsEmptyPatterns.hidden = hasFocus;
    if (!hasFocus) {
      if (dom.insightsEmptyTitle) {
        dom.insightsEmptyTitle.textContent = attempts
          ? "No counted focus yet"
          : "No patterns yet";
      }
      if (dom.insightsEmptyCopy) {
        dom.insightsEmptyCopy.textContent = attempts
          ? `You have ${attempts} saved attempt${attempts === 1 ? "" : "s"}, but none added focus time. Early-ended sessions count; Hardcore failures do not.`
          : "Charts, streaks, and the heatmap unlock after your first focused session.";
      }
    }
  }
  if (dom.insightsAnalyticsBody) dom.insightsAnalyticsBody.hidden = !hasFocus;
  if (hasFocus) {
    drawWeeklyChart(focusRecords);
    drawHeatmap(focusRecords, { insights: true, setup: false });
    renderInsightCharts(focusRecords);
    const streaks=calculateStreaks(focusRecords);dom.streakCurrent.textContent=String(streaks.current);dom.streakBest.textContent=String(streaks.best);
  } else {
    drawHeatmap(focusRecords, { insights: true, setup: false });
    if (dom.streakCurrent) dom.streakCurrent.textContent = "0";
    if (dom.streakBest) dom.streakBest.textContent = "0";
    clearInsightCharts();
  }
  renderFocusGoals();
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TAG_COLORS = [
  "var(--accent)",
  "color-mix(in srgb, var(--accent) 62%, white)",
  "color-mix(in srgb, var(--warning) 78%, var(--accent))",
  "color-mix(in srgb, var(--accent) 45%, var(--text))",
  "color-mix(in srgb, var(--text-muted) 70%, var(--accent))"
];

function chartRoot(id) {
  return document.getElementById(id);
}

function clearInsightCharts() {
  ["insight-hour-chart", "insight-weekday-chart", "insight-goal-chart", "insight-tag-chart"].forEach((id) => {
    chartRoot(id)?.replaceChildren();
  });
  const hourNote = chartRoot("insight-hour-note");
  if (hourNote) hourNote.textContent = "Focused time in each hour of the day.";
  const dayNote = chartRoot("insight-weekday-note");
  if (dayNote) dayNote.textContent = "Total focused time on each weekday.";
}

function groupedSeconds(records, keyFn) {
  const totals = new Map();
  records.forEach((record) => {
    const key = keyFn(record);
    if (!key) return;
    totals.set(key, (totals.get(key) || 0) + Math.max(0, Number(record.focusSeconds) || 0));
  });
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

function renderBarChart(root, rows, { wideLabels = false } = {}) {
  if (!root) return;
  root.replaceChildren();
  root.classList.toggle("is-wide-labels", wideLabels);
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "insight-chart-empty";
    empty.textContent = "Nothing to chart yet.";
    root.append(empty);
    return;
  }
  const max = Math.max(...rows.map((row) => row.seconds), 1);
  const list = document.createElement("div");
  list.className = "insight-bar-list";
  rows.forEach((row) => {
    const line = document.createElement("div");
    line.className = `insight-bar-row${row.top ? " is-top" : ""}`;
    const name = document.createElement("span");
    name.className = "insight-bar-label";
    name.textContent = row.label;
    name.title = row.label;
    const track = document.createElement("div");
    track.className = "insight-bar-track";
    const fill = document.createElement("span");
    fill.className = "insight-bar-fill";
    const pct = row.seconds > 0 ? Math.max(6, Math.round((row.seconds / max) * 100)) : 0;
    fill.style.width = `${pct}%`;
    track.append(fill);
    const value = document.createElement("span");
    value.className = "insight-bar-value";
    value.textContent = row.seconds > 0 ? formatDuration(row.seconds) : "0m";
    line.append(name, track, value);
    line.title = `${row.label} · ${formatDuration(row.seconds)}`;
    list.append(line);
  });
  root.append(list);
}

function renderHourChart(records) {
  const root = chartRoot("insight-hour-chart");
  const note = chartRoot("insight-hour-note");
  if (!root) return;
  const hours = Array.from({ length: 24 }, () => 0);
  records.forEach((record) => {
    const when = new Date(record.completedAt);
    if (Number.isNaN(when.getTime())) return;
    hours[when.getHours()] += Math.max(0, Number(record.focusSeconds) || 0);
  });
  const peak = Math.max(...hours);
  const peakHour = hours.indexOf(peak);
  root.replaceChildren();
  hours.forEach((seconds, hour) => {
    const col = document.createElement("span");
    col.className = `insight-hour${seconds > 0 && seconds === peak ? " is-peak" : ""}`;
    const bar = document.createElement("span");
    bar.className = "insight-hour-bar";
    const height = peak > 0 ? Math.max(seconds > 0 ? 8 : 4, Math.round((seconds / peak) * 100)) : 4;
    bar.style.height = `${height}%`;
    const end = (hour + 1) % 24;
    col.title = `${String(hour).padStart(2, "0")}:00–${String(end).padStart(2, "0")}:00 · ${formatDuration(seconds)}`;
    col.append(bar);
    root.append(col);
  });
  const summary = hours.map((seconds, hour) => `${String(hour).padStart(2, "0")}:00 ${formatDuration(seconds)}`).join(", ");
  root.setAttribute("aria-label", `Focus by hour. ${summary}`);
  if (note) {
    note.textContent = peak > 0
      ? `Most focus is ${String(peakHour).padStart(2, "0")}:00–${String((peakHour + 1) % 24).padStart(2, "0")}:00.`
      : "Focused time in each hour of the day.";
  }
}

function renderWeekdayChart(records) {
  const root = chartRoot("insight-weekday-chart");
  const note = chartRoot("insight-weekday-note");
  if (!root) return;
  const totals = Array.from({ length: 7 }, () => 0);
  records.forEach((record) => {
    const when = new Date(record.completedAt);
    if (Number.isNaN(when.getTime())) return;
    totals[when.getDay()] += Math.max(0, Number(record.focusSeconds) || 0);
  });
  const start = currentWeekStartsOn();
  const order = Array.from({ length: 7 }, (_, index) => (start + index) % 7);
  const peak = Math.max(...totals);
  const rows = order.map((day) => ({
    label: WEEKDAY_SHORT[day],
    seconds: totals[day],
    top: totals[day] > 0 && totals[day] === peak
  }));
  renderBarChart(root, rows);
  const summary = rows.map((row) => `${row.label} ${formatDuration(row.seconds)}`).join(", ");
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", `Hours by weekday. ${summary}`);
  if (note) {
    const best = rows.find((row) => row.top);
    note.textContent = best
      ? `${best.label} holds the most focused time.`
      : "Total focused time on each weekday.";
  }
}

function renderGoalChart(records) {
  const root = chartRoot("insight-goal-chart");
  if (!root) return;
  const ranked = groupedSeconds(records, (record) => String(record.intent || "").trim()).slice(0, 5);
  const peak = ranked[0]?.[1] || 0;
  renderBarChart(root, ranked.map(([label, seconds]) => ({
    label,
    seconds,
    top: seconds > 0 && seconds === peak
  })), { wideLabels: true });
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", ranked.length
    ? `Top goals. ${ranked.map(([label, seconds]) => `${label} ${formatDuration(seconds)}`).join(", ")}`
    : "No goals to chart yet.");
}

function renderTagChart(records) {
  const root = chartRoot("insight-tag-chart");
  if (!root) return;
  root.replaceChildren();
  const ranked = groupedSeconds(records, (record) => String(record.tag || "").trim());
  if (!ranked.length) {
    const empty = document.createElement("p");
    empty.className = "insight-chart-empty";
    empty.textContent = "Tag a session to see how your time splits.";
    root.append(empty);
    root.setAttribute("aria-label", "No tags yet.");
    return;
  }
  const top = ranked.slice(0, 4);
  const rest = ranked.slice(4).reduce((sum, [, seconds]) => sum + seconds, 0);
  const slices = rest > 0 ? [...top, ["Other", rest]] : top;
  const total = slices.reduce((sum, [, seconds]) => sum + seconds, 0) || 1;
  let cursor = 0;
  const stops = slices.map(([, seconds], index) => {
    const start = cursor;
    cursor += (seconds / total) * 100;
    return `${TAG_COLORS[index % TAG_COLORS.length]} ${start}% ${cursor}%`;
  });
  const layout = document.createElement("div");
  layout.className = "insight-donut-layout";
  const donut = document.createElement("div");
  donut.className = "insight-donut";
  donut.style.background = `conic-gradient(${stops.join(", ")})`;
  const hole = document.createElement("span");
  hole.className = "insight-donut-hole";
  const lead = Math.round((slices[0][1] / total) * 100);
  hole.textContent = `${lead}%`;
  donut.append(hole);
  const legend = document.createElement("ul");
  legend.className = "insight-donut-legend";
  slices.forEach(([label, seconds], index) => {
    const item = document.createElement("li");
    const swatch = document.createElement("i");
    swatch.style.background = TAG_COLORS[index % TAG_COLORS.length];
    const name = document.createElement("span");
    name.textContent = label;
    const value = document.createElement("strong");
    value.textContent = formatDuration(seconds);
    item.append(swatch, name, value);
    legend.append(item);
  });
  layout.append(donut, legend);
  root.append(layout);
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", `Focus by tag. ${slices.map(([label, seconds]) => `${label} ${formatDuration(seconds)}`).join(", ")}`);
}

function renderInsightCharts(records) {
  renderHourChart(records);
  renderWeekdayChart(records);
  renderGoalChart(records);
  renderTagChart(records);
}

export function drawWeeklyChart(records) {
  const c=dom.weeklyChart,ctx=c.getContext("2d");if(!ctx)return;
  const width=Math.max(300,c.clientWidth||700),height=230,dpr=devicePixelRatio||1;c.width=width*dpr;c.height=height*dpr;c.style.height=`${height}px`;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  const styles=getComputedStyle(document.documentElement);
  const accent=styles.getPropertyValue("--accent").trim();
  const label=styles.getPropertyValue("--text-muted").trim() || styles.getPropertyValue("--text").trim();
  const border=styles.getPropertyValue("--border").trim();
  const days=[];for(let i=6;i>=0;i--){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-i);days.push(d);}
  const vals=days.map(d=>records.filter(r=>localDayKey(r.completedAt)===localDayKey(d)).reduce((s,r)=>s+r.focusSeconds,0));const max=Math.max(3600,...vals);
  ctx.font="650 12px system-ui,sans-serif";ctx.fillStyle=label;ctx.strokeStyle=border;ctx.beginPath();ctx.moveTo(28,190);ctx.lineTo(width-16,190);ctx.stroke();
  const gap=12,bw=(width-44-gap*6)/7;vals.forEach((v,i)=>{const bh=Math.max(v?3:0,v/max*145),x=28+i*(bw+gap);ctx.fillStyle=accent;ctx.fillRect(x,190-bh,bw,bh);ctx.fillStyle=label;ctx.textAlign="center";ctx.fillText(days[i].toLocaleDateString([],{weekday:"short"}),x+bw/2,214);});
  c.setAttribute("aria-label",`Seven day focus chart: ${vals.map((v,i)=>`${days[i].toLocaleDateString([],{weekday:"short"})} ${formatDuration(v)}`).join(", ")}`);
}

export function paintHeatmap(grid, textList, records, monthsEl) {
  if (!grid) return;
  grid.replaceChildren();
  if (textList) textList.replaceChildren();
  if (monthsEl) monthsEl.replaceChildren();

  const weeks = 12;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisWeekStart = startOfWeek(today);
  const start = new Date(thisWeekStart);
  start.setDate(thisWeekStart.getDate() - (weeks - 1) * 7);

  const byDay = {};
  records.forEach((r) => {
    const k = localDayKey(r.completedAt);
    if (k) byDay[k] = (byDay[k] || 0) + r.focusSeconds;
  });
  const max = Math.max(1, ...Object.values(byDay));

  if (monthsEl) {
    const gutter = document.createElement("span");
    gutter.className = "heatmap-months-gutter";
    gutter.setAttribute("aria-hidden", "true");
    monthsEl.append(gutter);
    for (let w = 0; w < weeks; w++) {
      const weekStart = new Date(start);
      weekStart.setDate(start.getDate() + w * 7);
      const prev = new Date(weekStart);
      prev.setDate(weekStart.getDate() - 7);
      const show = w === 0 || weekStart.getMonth() !== prev.getMonth();
      const label = document.createElement("span");
      label.textContent = show
        ? weekStart.toLocaleDateString(undefined, { month: "short" })
        : "";
      monthsEl.append(label);
    }
  }

  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const k = localDayKey(d);
    const v = byDay[k] || 0;
    const future = d > today;
    const label = future
      ? `${d.toLocaleDateString()}: upcoming`
      : `${d.toLocaleDateString()}: ${formatDuration(v)} focused`;
    const cell = document.createElement(future ? "span" : "button");
    cell.className = "heat-cell";
    const level = (!future && v) ? String(Math.min(4, Math.ceil((v / max) * 4))) : "0";
    if (future) {
      cell.classList.add("is-future");
    } else {
      cell.type = "button";
      cell.dataset.day = k;
      cell.setAttribute(
        "aria-label",
        v
          ? `${label}. Open this day in History.`
          : `${d.toLocaleDateString()}: no activity.`
      );
    }
    cell.dataset.level = level;
    cell.title = future
      ? label
      : v
        ? `${label} · Open in History`
        : `${d.toLocaleDateString()}: no activity`;
    grid.append(cell);
    if (textList && !future && v) {
      const li = document.createElement("li");
      li.textContent = label;
      textList.append(li);
    }
  }
  if (textList && !textList.childElementCount) {
    const li = document.createElement("li");
    li.textContent = "No focused time in the last 12 weeks.";
    textList.append(li);
  }
}

export function drawHeatmap(records, { setup = true, insights = true } = {}) {
  if (insights && dom.heatmap) {
    const insightsMonths = dom.heatmap.closest("[data-heatmap-root]")?.querySelector("[data-heatmap-months]");
    paintHeatmap(dom.heatmap, dom.heatmapText, records, insightsMonths);
  }
  if (setup && dom.setupHeatmap) {
    const setupMonths = dom.setupHeatmap.closest("[data-heatmap-root]")?.querySelector("[data-heatmap-months]");
    paintHeatmap(dom.setupHeatmap, dom.setupHeatmapText, records, setupMonths);
  }
}

export function calculateStreaks(records) {
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
