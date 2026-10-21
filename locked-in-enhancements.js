/* Locked-In additive enhancements.
   Load AFTER the existing ./app.js. Keeps locked_in_history_v2 and existing records intact. */
(() => {
  "use strict";
  const KEY = "locked_in_history_v2";
  const $ = (id) => document.getElementById(id);
  const safeRead = () => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (_) { return []; }
  };
  const safeWrite = (records) => localStorage.setItem(KEY, JSON.stringify(records));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
  const fmt = (sec) => {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h ? `${h}h ${m}m` : `${m}m`;
  };
  const toast = (msg) => {
    const node = $("toast");
    if (node) { node.textContent = msg; node.classList.add("is-visible"); setTimeout(() => node.classList.remove("is-visible"), 3500); }
    else alert(msg);
  };
  const download = (name, data, type) => {
    const url = URL.createObjectURL(new Blob([data], {type}));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  };
  const addStyles = () => {
    if ($("li-extra-style")) return;
    const style = document.createElement("style"); style.id = "li-extra-style";
    style.textContent = `
      .li-extra-panel{margin:18px 0;padding:20px;border:1px solid var(--border);border-radius:var(--radius,18px);background:var(--surface, #171b17);color:var(--text,#f2f4ed)}
      .li-extra-panel h2{margin:0 0 12px;font-size:18px}.li-extra-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
      .li-extra-panel input,.li-extra-panel textarea{width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--border);background:var(--bg);color:var(--text);font:inherit}
      .li-extra-panel textarea{min-height:82px;resize:vertical}.li-extra-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
      .li-extra-stat{padding:12px;border-radius:10px;background:var(--surface-raised,var(--surface));border:1px solid var(--border)}
      .li-extra-stat small{display:block;color:var(--text-muted)}.li-extra-stat strong{font-size:21px}
      .li-extra-canvas{width:100%;max-height:260px;display:block}.li-extra-hint{font-size:12px;color:var(--text-muted)}
      @media(max-width:600px){.li-extra-panel{padding:14px}}
    `;
    document.head.append(style);
  };
  const button = (label, fn, cls="button button-secondary button-small") => {
    const b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = label; b.addEventListener("click", fn); return b;
  };
  const panel = (id, title) => {
    let p = $(id); if (p) return p;
    p = document.createElement("section"); p.id = id; p.className = "li-extra-panel";
    const h = document.createElement("h2"); h.textContent = title; p.append(h); return p;
  };

  function injectFeedback() {
    const about = $("about");
    const target = $("history-screen") || about || document.querySelector("main");
    if (!target || $("li-feedback")) return;
    const p = panel("li-feedback", "Help improve Locked-In");
    const hint = document.createElement("p"); hint.className = "li-extra-hint";
    hint.textContent = "Share feedback or report a reproducible issue through the project repository.";
    p.append(hint);
    const actions = document.createElement("div"); actions.className = "li-extra-actions";
    actions.append(button("Request a feature", () => location.href = "https://github.com/0marii/locked-in/issues/new?title=" + encodeURIComponent("Feature request") + "&body=" + encodeURIComponent("## Feature idea\n\n## Why it would help\n")));
    actions.append(button("Report a bug", () => location.href = "https://github.com/0marii/locked-in/issues/new?title=" + encodeURIComponent("Bug report") + "&body=" + encodeURIComponent("## What happened?\n\n## Steps to reproduce\n1. \n\n## Browser/device\n")));
    p.append(actions); target.append(p);
  }

  function injectExpectedEnd() {
    const meta = document.querySelector(".timer-meta");
    if (!meta || $("li-expected-end")) return;
    const cell = document.createElement("div"); cell.id = "li-expected-end";
    cell.innerHTML = '<span>EXPECTED END</span><strong id="li-expected-end-value">—</strong>';
    meta.append(cell);
    const update = () => {
      const display = $("time-display");
      const screen = $("timer-screen");
      const value = $("li-expected-end-value");
      if (!display || !value || !screen) return;
      if (!screen.classList.contains("is-active")) { value.textContent = "—"; return; }
      const parts = display.textContent.trim().split(":").map(Number);
      let seconds = 0;
      if (parts.every(Number.isFinite)) seconds = parts.length === 3 ? parts[0]*3600+parts[1]*60+parts[2] : parts[0]*60+parts[1];
      const end = new Date(Date.now() + seconds*1000);
      value.textContent = end.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
    };
    update(); setInterval(update, 1000);
  }

  function injectHistoryTools() {
    const history = $("history-screen");
    if (!history || $("li-history-tools")) return;
    const p = panel("li-history-tools", "Session analysis & backup");
    const search = document.createElement("input"); search.id = "li-topic-search"; search.type = "search";
    search.placeholder = "Filter by goal, topic, or notes (e.g. Java)";
    search.setAttribute("aria-label", "Filter sessions by goal, topic, or notes");
    const stats = document.createElement("div"); stats.id = "li-analysis-stats"; stats.className = "li-extra-grid";
    const results = document.createElement("p"); results.id = "li-analysis-results"; results.className = "li-extra-hint";
    const canvas = document.createElement("canvas"); canvas.id = "li-analysis-chart"; canvas.className = "li-extra-canvas"; canvas.height = 220;
    const actions = document.createElement("div"); actions.className = "li-extra-actions";
    actions.append(button("Export full JSON backup", exportBackup));
    const importLabel = document.createElement("label"); importLabel.className = "button button-secondary button-small"; importLabel.textContent = "Import JSON backup";
    const file = document.createElement("input"); file.type = "file"; file.accept = ".json,application/json"; file.hidden = true;
    file.addEventListener("change", () => importBackup(file.files && file.files[0]));
    importLabel.append(file); importLabel.addEventListener("click", () => file.click());
    actions.append(importLabel);
    p.append(search, stats, results, canvas, actions);
    const toolbar = history.querySelector(".history-toolbar");
    if (toolbar) toolbar.after(p); else history.append(p);
    search.addEventListener("input", () => renderAnalysis(search.value));
    renderAnalysis("");
  }
  function renderAnalysis(query) {
    const stats = $("li-analysis-stats"), result = $("li-analysis-results"), canvas = $("li-analysis-chart");
    if (!stats || !result || !canvas) return;
    const q = String(query || "").trim().toLocaleLowerCase();
    const all = safeRead();
    const matches = all.filter(r => [r.intent, r.topic, r.topics, r.notes, r.studied].flat().join(" ").toLocaleLowerCase().includes(q));
    const focus = matches.reduce((s,r)=>s+(Number(r.focusSeconds)||0),0);
    const breaks = matches.reduce((s,r)=>s+(Number(r.breakSeconds)||0),0);
    const elapsed = matches.reduce((s,r)=>s+(Number(r.elapsedSeconds)||0),0);
    const avg = matches.length ? Math.round(matches.reduce((s,r)=>s+((Number(r.elapsedSeconds)||0)?(Number(r.focusSeconds)||0)/(Number(r.elapsedSeconds)||1):0),0)/matches.length*100) : 0;
    stats.innerHTML = [
      ["Matching sessions",matches.length],["Total focus time",fmt(focus)],["Total break time",fmt(breaks)],["Total elapsed",fmt(elapsed)],["Average focus ratio",matches.length?avg+"%":"—"]
    ].map(([label,value])=>`<div class="li-extra-stat"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join("");
    result.textContent = q ? `Showing ${matches.length} of ${all.length} sessions matching “${query}”. The summary above covers only matching sessions.` : `Showing all ${matches.length} saved sessions. Add topics and notes to make subject searches more useful.`;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const w = canvas.width = Math.max(320, canvas.clientWidth || 640), h = canvas.height = 220;
    ctx.clearRect(0,0,w,h);
    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue("--accent").trim() || "#b7f36b";
    const muted = styles.getPropertyValue("--text-muted").trim() || "#a0aa9e";
    ctx.fillStyle = muted; ctx.font = "12px system-ui"; ctx.fillText("Focus time by session (most recent matches)", 8, 18);
    const recent = matches.slice(0,12).reverse(), max = Math.max(1,...recent.map(r=>Number(r.focusSeconds)||0));
    if (!recent.length) { ctx.fillText("No matching sessions yet",8,52); return; }
    const left=8, top=32, bottom=24, gap=6, usable=h-top-bottom, barW=(w-left-8-gap*(recent.length-1))/recent.length;
    recent.forEach((r,i)=>{
      const val=Number(r.focusSeconds)||0, bh=Math.max(2,(val/max)*(usable-25)), x=left+i*(barW+gap);
      ctx.fillStyle=accent; ctx.fillRect(x,top+usable-bh,Math.max(3,barW),bh);
      ctx.fillStyle=muted; ctx.save(); ctx.translate(x+barW/2,h-5); ctx.rotate(-Math.PI/4); ctx.textAlign="right"; ctx.fillText(new Date(r.completedAt).toLocaleDateString([], {month:"short",day:"numeric"}),0,0); ctx.restore();
    });
  }
  function exportBackup() {
    const records = safeRead();
    download("locked-in-backup.json", JSON.stringify({schemaVersion:2,exportedAt:new Date().toISOString(),app:"Locked-In",sessions:records},null,2), "application/json");
    toast("JSON backup exported.");
  }
  function importBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        const incoming = Array.isArray(parsed) ? parsed : parsed.sessions;
        if (!Array.isArray(incoming) || incoming.some(r => !r || typeof r !== "object" || !("intent" in r))) throw new Error("Invalid backup format");
        const current = safeRead(), byId = new Map(current.map(r=>[String(r.id),r]));
        incoming.slice(0,1000).forEach(r => {
          const id = String(r.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
          byId.set(id, {...r,id,topic:String(r.topic||r.topics||""),notes:String(r.notes||r.studied||"")});
        });
        safeWrite([...byId.values()].sort((a,b)=>new Date(b.completedAt)-new Date(a.completedAt)).slice(0,1000));
        toast("Backup imported. Refreshing history…");
        setTimeout(()=>location.reload(),600);
      } catch (_) { toast("Could not import that file. Choose a valid Locked-In JSON backup."); }
    };
    reader.readAsText(file);
  }

  function addSessionNotesEditor() {
    const report = $("report-screen");
    if (!report || $("li-session-notes")) return;
    const p = panel("li-session-notes", "What did you study?");
    const topic = document.createElement("input"); topic.id = "li-session-topic"; topic.placeholder = "Topics (e.g. Java, arrays, OOP)";
    const notes = document.createElement("textarea"); notes.id = "li-session-note"; notes.placeholder = "Notes, what you learned, or what to continue next time…";
    const save = button("Save session notes", () => {
      const records = safeRead();
      if (!records.length) { toast("No saved session found yet."); return; }
      const latest = records[0];
      latest.topic = topic.value.trim(); latest.topics = topic.value.trim(); latest.notes = notes.value.trim(); latest.studied = notes.value.trim();
      safeWrite(records); toast("Session notes saved."); renderAnalysisIfVisible();
    }, "button button-primary");
    p.append(topic, notes, save);
    const actions = report.querySelector(".report-actions");
    if (actions) actions.before(p); else report.append(p);
    // Restore fields when revisiting the latest report.
    const latest = safeRead()[0];
    if (latest) { topic.value = latest.topic || latest.topics || ""; notes.value = latest.notes || latest.studied || ""; }
  }
  function renderAnalysisIfVisible() { renderAnalysis(($("li-topic-search")||{}).value || ""); }

  function setupLogoHome() {
    const brand = document.querySelector(".brand");
    if (!brand || brand.dataset.liHomeFixed) return;
    brand.dataset.liHomeFixed = "true";
    brand.addEventListener("click", (event) => {
      event.preventDefault();
      const focusButton = document.querySelector('[data-screen="setup-screen"]');
      if (focusButton) focusButton.click();
      else {
        document.querySelectorAll(".screen").forEach(s=>s.classList.toggle("is-active",s.id==="setup-screen"));
        window.scrollTo({top:0,behavior:"smooth"});
      }
      history.replaceState(null,"",location.pathname+location.search+"#setup");
    });
  }

  function setupBackToTop() {
    const button = $("back-to-top");
    if (!button || button.dataset.liBound === "true") return;
    button.dataset.liBound = "true";
    let ticking = false;
    const update = () => {
      const visible = window.scrollY > 420;
      if (visible) button.hidden = false;
      button.classList.toggle("is-visible", visible);
      if (!visible) window.setTimeout(() => { if (window.scrollY <= 420) button.hidden = true; }, 220);
      ticking = false;
    };
    window.addEventListener("scroll", () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }, { passive: true });
    button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
    update();
  }

  function init() {
    addStyles(); setupLogoHome(); setupBackToTop(); injectExpectedEnd(); injectHistoryTools(); injectFeedback(); addSessionNotesEditor();
    // Existing app writes the authoritative history key; observe it without replacing its storage behavior.
    const originalSetItem = Storage.prototype.setItem;
    if (!Storage.prototype.__liEnhanced) {
      Storage.prototype.setItem = function(key, value) {
        const result = originalSetItem.call(this,key,value);
        if (key === KEY) setTimeout(() => {
          renderAnalysisIfVisible();
          addSessionNotesEditor();
          injectHistoryTools();
        }, 0);
        return result;
      };
      Storage.prototype.__liEnhanced = true;
    }
    // Observe screen transitions and the app's report/history rendering.
    const observer = new MutationObserver(() => {
      addSessionNotesEditor();
      if ($("history-screen")?.classList.contains("is-active")) renderAnalysisIfVisible();
    });
    observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:["class"]});
    // Update notes editor when a new session report appears.
    document.addEventListener("click", (e) => {
      if (e.target.closest("#new-session-btn")) setTimeout(()=>{ const t=$("li-session-topic"),n=$("li-session-note"); if(t)t.value="";if(n)n.value=""; },50);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",init,{once:true}); else init();
})();