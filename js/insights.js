import { dom, state } from "./runtime.js?v=75";
import { showToast } from "./toast.js?v=75";
import { completedRecords, download, formatDuration, localDayKey, scoreFor } from "./utils.js?v=75";
import { focusProgress, renderFocusGoals } from "./setup.js?v=75";

export function downloadWeekCard() {
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

export function renderInsights() {
  const completed=completedRecords();
  const totalFocus=completed.reduce((s,r)=>s+r.focusSeconds,0);
  const scores=completed.map(scoreFor).filter(v=>v!=null);
  const avg=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):null;
  const attempts=state.history.length;
  const incomplete=Math.max(0, attempts - completed.length);
  const completionRate=attempts?Math.round(completed.length/attempts*100):0;
  const hasCompleted=completed.length > 0;
  dom.insightsStats.replaceChildren();
  [["Completed",completed.length],["Completion rate",attempts?`${completionRate}%`:"—"],["Focus time",formatDuration(totalFocus)],["Avg completion",avg==null?"—":`${avg}%`]].forEach(([l,v])=>{
    const card=document.createElement("div");card.className="insight-stat";const s=document.createElement("span");s.textContent=l;const strong=document.createElement("strong");strong.textContent=v;card.append(s,strong);dom.insightsStats.append(card);
  });
  if (!attempts) {
    dom.insightsSummary.textContent = "Start a session to build your private insights.";
  } else if (!hasCompleted) {
    dom.insightsSummary.textContent = `${attempts} saved attempt${attempts === 1 ? "" : "s"}, 0 completed. Zeros are expected until a session reaches 70% of planned focus.`;
  } else {
    dom.insightsSummary.textContent = `${completed.length} completed of ${attempts} attempt${attempts === 1 ? "" : "s"}${incomplete ? ` · ${incomplete} incomplete or failed` : ""}. Charts use completed focus only.`;
  }
  if (dom.insightsEmptyPatterns) {
    dom.insightsEmptyPatterns.hidden = hasCompleted;
    if (!hasCompleted) {
      if (dom.insightsEmptyTitle) {
        dom.insightsEmptyTitle.textContent = attempts
          ? "No completed sessions yet"
          : "No patterns yet";
      }
      if (dom.insightsEmptyCopy) {
        dom.insightsEmptyCopy.textContent = attempts
          ? `You have ${attempts} saved attempt${attempts === 1 ? "" : "s"}, but none reached 70% of planned focus. Finish one session to unlock charts, streaks, and the heatmap.`
          : "Charts, streaks, and the heatmap unlock after your first completed session.";
      }
    }
  }
  if (dom.insightsAnalyticsBody) dom.insightsAnalyticsBody.hidden = !hasCompleted;
  if (hasCompleted) {
    drawWeeklyChart(completed);
    drawHeatmap(completed);
    const groups={};completed.forEach(r=>{const h=new Date(r.completedAt).getHours();groups[h]=(groups[h]||0)+r.focusSeconds;});
    const best=Object.entries(groups).sort((a,b)=>b[1]-a[1])[0];dom.bestTime.textContent=best?`${String(Number(best[0])).padStart(2,"0")}:00–${String((Number(best[0])+1)%24).padStart(2,"0")}:00`:"—";
    const goals={};completed.forEach(r=>{goals[r.intent]=(goals[r.intent]||0)+r.focusSeconds;});const bg=Object.entries(goals).sort((a,b)=>b[1]-a[1])[0];dom.bestGoal.textContent=bg?`${bg[0]} · ${formatDuration(bg[1])}`:"—";
    const tags={};completed.forEach(r=>{if(!r.tag)return;tags[r.tag]=(tags[r.tag]||0)+r.focusSeconds;});
    const bt=Object.entries(tags).sort((a,b)=>b[1]-a[1])[0];
    if (dom.bestTag) dom.bestTag.textContent=bt?`${bt[0]} · ${formatDuration(bt[1])}`:"—";
    const streaks=calculateStreaks(completed);dom.streakCurrent.textContent=String(streaks.current);dom.streakBest.textContent=String(streaks.best);
  } else {
    // Keep setup heatmap in sync even when Insights charts are collapsed.
    drawHeatmap(completed);
    if (dom.streakCurrent) dom.streakCurrent.textContent = "0";
    if (dom.streakBest) dom.streakBest.textContent = "0";
    if (dom.bestTime) dom.bestTime.textContent = "—";
    if (dom.bestGoal) dom.bestGoal.textContent = "—";
    if (dom.bestTag) dom.bestTag.textContent = "—";
  }
  renderFocusGoals();
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
  c.setAttribute("aria-label",`Seven day completed focus chart: ${vals.map((v,i)=>`${days[i].toLocaleDateString([],{weekday:"short"})} ${formatDuration(v)}`).join(", ")}`);
}

export function paintHeatmap(grid, textList, records, monthsEl) {
  if (!grid) return;
  grid.replaceChildren();
  if (textList) textList.replaceChildren();
  if (monthsEl) monthsEl.replaceChildren();

  const weeks = 12;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mondayOffset = (today.getDay() + 6) % 7; // Monday-first, matches app calendars
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - mondayOffset);
  const start = new Date(thisMonday);
  start.setDate(thisMonday.getDate() - (weeks - 1) * 7);

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
      : `${d.toLocaleDateString()}: ${formatDuration(v)} completed focus`;
    const cell = document.createElement("span");
    cell.className = "heat-cell";
    if (future) cell.classList.add("is-future");
    cell.dataset.level = (!future && v) ? String(Math.min(4, Math.ceil((v / max) * 4))) : "0";
    cell.title = label;
    grid.append(cell);
    if (textList && !future && v) {
      const li = document.createElement("li");
      li.textContent = label;
      textList.append(li);
    }
  }
  if (textList && !textList.childElementCount) {
    const li = document.createElement("li");
    li.textContent = "No completed focus in the last 12 weeks.";
    textList.append(li);
  }
}

export function drawHeatmap(records) {
  const insightsMonths = dom.heatmap?.closest("[data-heatmap-root]")?.querySelector("[data-heatmap-months]");
  const setupMonths = dom.setupHeatmap?.closest("[data-heatmap-root]")?.querySelector("[data-heatmap-months]");
  paintHeatmap(dom.heatmap, dom.heatmapText, records, insightsMonths);
  paintHeatmap(dom.setupHeatmap, dom.setupHeatmapText, records, setupMonths);
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
