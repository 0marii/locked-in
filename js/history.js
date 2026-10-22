import { HISTORY_KEY, MAX_HISTORY, MAX_IMPORT_BYTES } from "./constants.js?v=76";
import { dom, state, tabId } from "./runtime.js?v=76";
import { safeWrite } from "./storage.js?v=76";
import { showToast } from "./toast.js?v=76";
import { completedRecords, csvEscape, download, explainOutcome, explainScore, formatDate, formatDuration, formatShortDate, scoreBreakdown, scoreFor, toISODateLocal } from "./utils.js?v=76";
import { broadcast } from "./sync.js?v=76";
import { askConfirm, navigate } from "./theme-nav.js?v=76";
import { activeFocusSeconds, currentBreakSeconds, elapsedSeconds, normalizeRecord } from "./session.js?v=76";
import { renderInsights } from "./insights.js?v=76";
import { applyNoteItems, createNoteItemOptions, deleteEditedNote, openNoteEditor, refreshNotesSurfaces, renderNotes, saveInbox, sessionNoteItems } from "./notes.js?v=76";
import { renderAll } from "./bind.js?v=76";

export function liveSessionAsHistoryRow(now = Date.now()) {
  const s = state.session;
  if (!s) return null;
  const focusSeconds = Math.max(0, Math.floor(activeFocusSeconds(s, now)));
  const breakSeconds = Math.max(0, Math.floor(currentBreakSeconds(s, now)));
  const elapsed = Math.max(0, Math.floor(elapsedSeconds(s, now)));
  const noteItems = Array.isArray(s.noteItems) ? s.noteItems.slice() : [];
  return {
    id: s.id,
    intent: s.intent,
    tag: s.tag || "",
    topic: s.topic || "",
    notes: s.notes || "",
    noteItems,
    targetSeconds: s.targetSeconds,
    focusSeconds,
    elapsedSeconds: Math.max(elapsed, focusSeconds + breakSeconds),
    breakSeconds,
    breaks: Array.isArray(s.breaks) ? s.breaks.slice() : [],
    completedAt: new Date(s.startedAt).toISOString(),
    startedAt: s.startedAt,
    outcome: "active",
    live: true,
    hardcore: Boolean(s.hardcore),
    hardcoreFailed: false,
    score: null,
    reason: s.currentBreakStartedAt ? "On break" : "Focusing"
  };
}

export function populateHistoryTagFilter() {
  if (!dom.historyTagFilter) return;
  const current = dom.historyTagFilter.value;
  const tags = [...new Set([
    ...state.history.map((r) => r.tag).filter(Boolean),
    ...(state.session?.tag ? [state.session.tag] : [])
  ])].sort((a, b) => a.localeCompare(b));
  dom.historyTagFilter.replaceChildren();
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "All tags";
  dom.historyTagFilter.append(all);
  tags.forEach((tag) => {
    const opt = document.createElement("option");
    opt.value = tag;
    opt.textContent = tag;
    dom.historyTagFilter.append(opt);
  });
  if (tags.includes(current)) dom.historyTagFilter.value = current;
}

export function saveHistory() {
  if (state.readOnly) return false;
  const ok = safeWrite(HISTORY_KEY, state.history.slice(0, MAX_HISTORY));
  if (ok) broadcast({ type: "history", source: tabId });
  return ok;
}

export function syncDateFieldDisplay(field) {
  const input = field === "from" ? dom.historyDateFrom : dom.historyDateTo;
  const display = field === "from" ? dom.historyDateFromDisplay : dom.historyDateToDisplay;
  if (!input || !display) return;
  const value = String(input.value || "");
  display.textContent = formatShortDate(value);
  display.classList.toggle("is-empty", !value);
}

export function syncAllDateDisplays() {
  syncDateFieldDisplay("from");
  syncDateFieldDisplay("to");
}

export function clearHistoryFilters() {
  if (state.datePicker.field) closeDatePicker({ restoreFocus: false });
  if (dom.historySearch) dom.historySearch.value = "";
  if (dom.historyDateFrom) dom.historyDateFrom.value = "";
  if (dom.historyDateTo) dom.historyDateTo.value = "";
  if (dom.historySort) dom.historySort.value = "newest";
  if (dom.historyTagFilter) dom.historyTagFilter.value = "";
  syncAllDateDisplays();
  renderHistory();
  showToast("Filters cleared.");
}

export function getDatePickerFocusables() {
  if (!dom.datePickerPopover) return [];
  return [...dom.datePickerPopover.querySelectorAll("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")]
    .filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true");
}

export function trapDatePickerFocus(event) {
  if (event.key !== "Tab" || !state.datePicker.field || !dom.datePickerPopover || dom.datePickerPopover.hidden) return;
  const focusables = getDatePickerFocusables();
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function closeDatePicker({ restoreFocus = true } = {}) {
  if (!dom.datePickerPopover) return;
  dom.datePickerPopover.hidden = true;
  dom.datePickerPopover.classList.add("is-hidden");
  const field = state.datePicker.field;
  const previousFocus = state.datePicker.previousFocus;
  state.datePicker.field = null;
  state.datePicker.previousFocus = null;
  [dom.historyDateFromBtn, dom.historyDateToBtn].forEach((btn) => {
    if (btn) btn.setAttribute("aria-expanded", "false");
  });
  if (!restoreFocus) return;
  if (previousFocus && typeof previousFocus.focus === "function" && document.contains(previousFocus)) {
    previousFocus.focus();
    return;
  }
  if (field === "from") dom.historyDateFromBtn?.focus();
  else if (field === "to") dom.historyDateToBtn?.focus();
}

export function positionDatePicker(anchor) {
  if (!dom.datePickerPopover || !anchor) return;
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(248, window.innerWidth - 24);
  let left = rect.left;
  let top = rect.bottom + 8;
  if (left + width > window.innerWidth - 12) left = Math.max(12, window.innerWidth - width - 12);
  if (left < 12) left = 12;
  const estimatedHeight = 280;
  if (top + estimatedHeight > window.innerHeight - 12 && rect.top > estimatedHeight) {
    top = Math.max(12, rect.top - estimatedHeight - 8);
  }
  dom.datePickerPopover.style.left = `${left}px`;
  dom.datePickerPopover.style.top = `${top}px`;
}

export function renderDatePicker() {
  if (!dom.datePickerGrid || !dom.datePickerTitle) return;
  const { viewYear, viewMonth, field } = state.datePicker;
  const selected = field === "from" ? dom.historyDateFrom?.value : dom.historyDateTo?.value;
  const titleDate = new Date(viewYear, viewMonth, 1);
  dom.datePickerTitle.textContent = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(titleDate);

  const first = new Date(viewYear, viewMonth, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday-first
  const gridStart = new Date(viewYear, viewMonth, 1 - startOffset);
  const todayKey = toISODateLocal(new Date());
  dom.datePickerGrid.replaceChildren();

  for (let i = 0; i < 42; i++) {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + i);
    const key = toISODateLocal(day);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "date-picker-day";
    btn.textContent = String(day.getDate());
    btn.dataset.date = key;
    if (day.getMonth() !== viewMonth) btn.classList.add("is-outside");
    if (key === todayKey) btn.classList.add("is-today");
    if (selected && key === selected) btn.classList.add("is-selected");
    btn.setAttribute("aria-label", formatShortDate(key));
    if (selected && key === selected) btn.setAttribute("aria-current", "date");
    btn.addEventListener("click", () => selectDatePickerDay(key));
    dom.datePickerGrid.append(btn);
  }
}

export function selectDatePickerDay(iso) {
  const field = state.datePicker.field;
  if (!field) return;
  const input = field === "from" ? dom.historyDateFrom : dom.historyDateTo;
  if (!input) return;
  input.value = iso;
  if (field === "from" && dom.historyDateTo?.value && dom.historyDateTo.value < iso) {
    dom.historyDateTo.value = iso;
    syncDateFieldDisplay("to");
  }
  if (field === "to" && dom.historyDateFrom?.value && dom.historyDateFrom.value > iso) {
    dom.historyDateFrom.value = iso;
    syncDateFieldDisplay("from");
  }
  syncDateFieldDisplay(field);
  closeDatePicker();
  renderHistory();
}

export function openDatePicker(field) {
  if (!dom.datePickerPopover) return;
  const input = field === "from" ? dom.historyDateFrom : dom.historyDateTo;
  const anchor = field === "from" ? dom.historyDateFromBtn : dom.historyDateToBtn;
  const current = input?.value ? new Date(`${input.value}T00:00:00`) : new Date();
  state.datePicker.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : anchor;
  state.datePicker.field = field;
  state.datePicker.viewYear = current.getFullYear();
  state.datePicker.viewMonth = current.getMonth();
  renderDatePicker();
  dom.datePickerPopover.hidden = false;
  dom.datePickerPopover.classList.remove("is-hidden");
  positionDatePicker(anchor);
  [dom.historyDateFromBtn, dom.historyDateToBtn].forEach((btn) => {
    if (btn) btn.setAttribute("aria-expanded", btn === anchor ? "true" : "false");
  });
  const focusTarget = dom.datePickerGrid?.querySelector(".date-picker-day.is-selected, .date-picker-day.is-today, .date-picker-day")
    || getDatePickerFocusables()[0];
  focusTarget?.focus();
}

export function toggleDatePicker(field) {
  if (state.datePicker.field === field && !dom.datePickerPopover?.hidden) {
    closeDatePicker();
    return;
  }
  openDatePicker(field);
}

export function initDatePickers() {
  syncAllDateDisplays();
  dom.historyDateFromBtn?.addEventListener("click", () => toggleDatePicker("from"));
  dom.historyDateToBtn?.addEventListener("click", () => toggleDatePicker("to"));
  dom.datePickerPrev?.addEventListener("click", () => {
    if (!state.datePicker.field) return;
    state.datePicker.viewMonth -= 1;
    if (state.datePicker.viewMonth < 0) {
      state.datePicker.viewMonth = 11;
      state.datePicker.viewYear -= 1;
    }
    renderDatePicker();
  });
  dom.datePickerNext?.addEventListener("click", () => {
    if (!state.datePicker.field) return;
    state.datePicker.viewMonth += 1;
    if (state.datePicker.viewMonth > 11) {
      state.datePicker.viewMonth = 0;
      state.datePicker.viewYear += 1;
    }
    renderDatePicker();
  });
  dom.datePickerClear?.addEventListener("click", () => {
    const field = state.datePicker.field;
    if (!field) return;
    const input = field === "from" ? dom.historyDateFrom : dom.historyDateTo;
    if (input) input.value = "";
    syncDateFieldDisplay(field);
    closeDatePicker();
    renderHistory();
  });
  dom.datePickerToday?.addEventListener("click", () => {
    selectDatePickerDay(toISODateLocal(new Date()));
  });
  document.addEventListener("pointerdown", (event) => {
    if (!state.datePicker.field || !dom.datePickerPopover || dom.datePickerPopover.hidden) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (dom.datePickerPopover.contains(target)) return;
    if (dom.historyDateFromBtn?.contains(target) || dom.historyDateToBtn?.contains(target)) return;
    closeDatePicker();
  });
  document.addEventListener("keydown", (event) => {
    if (!state.datePicker.field) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeDatePicker();
      return;
    }
    trapDatePickerFocus(event);
  });
  window.addEventListener("resize", () => {
    if (!state.datePicker.field) return;
    const anchor = state.datePicker.field === "from" ? dom.historyDateFromBtn : dom.historyDateToBtn;
    positionDatePicker(anchor);
  }, { passive: true });
}

function matchesHistoryFilters(r, q, from, to, tag) {
  const text = [r.intent, r.topic, r.notes, r.outcome, r.reason, r.tag, r.live ? "in progress active focusing" : ""].join(" ").toLocaleLowerCase();
  const d = new Date(r.completedAt);
  return (!q || text.includes(q)) && (!from || d >= from) && (!to || d <= to) && (!tag || r.tag === tag);
}

export function getFilteredHistory() {
  const q = dom.historySearch.value.trim().toLocaleLowerCase();
  const from = dom.historyDateFrom.value ? new Date(`${dom.historyDateFrom.value}T00:00:00`) : null;
  const to = dom.historyDateTo.value ? new Date(`${dom.historyDateTo.value}T23:59:59.999`) : null;
  const tag = String(dom.historyTagFilter?.value || "").trim();
  let rows = state.history.filter((r) => matchesHistoryFilters(r, q, from, to, tag));
  const sort = dom.historySort.value;
  rows.sort((a, b) => sort === "oldest" ? Date.parse(a.completedAt) - Date.parse(b.completedAt) : sort === "focus" ? b.focusSeconds - a.focusSeconds : Date.parse(b.completedAt) - Date.parse(a.completedAt));
  const live = liveSessionAsHistoryRow();
  if (live && matchesHistoryFilters(live, q, from, to, tag)) {
    // Keep the active session pinned to the top of the table.
    rows = [live, ...rows.filter((r) => r.id !== live.id)];
  }
  return rows;
}

export function syncHistoryTableScroll() {
  const shell = dom.historyTableShell;
  const scroller = dom.historyTableScroll;
  if (!shell || !scroller) return;
  const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  const left = scroller.scrollLeft;
  const canLeft = left > 4;
  const canRight = left < max - 4;
  shell.classList.toggle("can-scroll-left", canLeft);
  shell.classList.toggle("can-scroll-right", canRight);
  if (dom.historyScrollHint && !shell.classList.contains("is-hinting")) {
    dom.historyScrollHint.hidden = true;
  }
}

export function rowsVisibleInHistory() {
  return Boolean(dom.historyTableBody?.childElementCount);
}

export function maybeNudgeHistoryTable() {
  const shell = dom.historyTableShell;
  const scroller = dom.historyTableScroll;
  if (!shell || !scroller || state.historyScrollHinted) return;
  if (state.activeScreen !== "history-screen") return;
  if (!rowsVisibleInHistory()) return;
  syncHistoryTableScroll();
  if (!shell.classList.contains("can-scroll-right")) return;
  state.historyScrollHinted = true;
  shell.classList.add("is-hinting");
  if (dom.historyScrollHint) {
    dom.historyScrollHint.hidden = false;
    dom.historyScrollHint.setAttribute("role", "status");
    dom.historyScrollHint.setAttribute("aria-live", "polite");
  }
  setTimeout(() => {
    shell.classList.remove("is-hinting");
    if (dom.historyScrollHint) dom.historyScrollHint.hidden = true;
  }, 1500);
}

export function initHistoryTableScrollHint() {
  const shell = dom.historyTableShell;
  if (!shell || typeof IntersectionObserver !== "function") return;
  const observer = new IntersectionObserver((entries) => {
    const entry = entries[0];
    if (!entry?.isIntersecting) return;
    if (entry.intersectionRatio < 0.45) return;
    maybeNudgeHistoryTable();
  }, { threshold: [0.45, 0.7] });
  observer.observe(shell);
}

export function syncLiveHistoryRow(now = Date.now()) {
  if (state.activeScreen !== "history-screen" || !state.session) return;
  const tr = dom.historyTableBody?.querySelector("tr.is-live-session");
  if (!tr) return;
  const live = liveSessionAsHistoryRow(now);
  if (!live) return;
  const b = scoreBreakdown(live);
  const focusTd = tr.querySelector('[data-label="Focus"]');
  const elapsedTd = tr.querySelector('[data-label="Elapsed"]');
  const scoreTd = tr.querySelector('[data-label="Completion score"]');
  const pill = tr.querySelector(".outcome-pill");
  if (focusTd) {
    focusTd.textContent = formatDuration(live.focusSeconds);
    focusTd.title = `Active focus so far: ${formatDuration(live.focusSeconds)} of ${formatDuration(live.targetSeconds)} planned (${b.completionPct}%). Breaks are excluded.`;
  }
  if (elapsedTd) {
    elapsedTd.textContent = formatDuration(live.elapsedSeconds);
    elapsedTd.title = `Clock time so far including breaks: ${formatDuration(live.elapsedSeconds)} (breaks ${formatDuration(live.breakSeconds)}).`;
  }
  if (scoreTd) {
    scoreTd.textContent = "—";
    scoreTd.title = "Score is calculated when the session ends.";
  }
  if (pill) {
    pill.textContent = "In progress";
    pill.title = live.reason === "On break"
      ? "Session is active — currently on a break."
      : "Session is active — focusing now.";
    pill.setAttribute("aria-label", pill.title);
  }
}

export function renderHistory() {
  populateHistoryTagFilter();
  const rows = getFilteredHistory();
  dom.historyTableBody.replaceChildren();
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    if (r.live) tr.classList.add("is-live-session");
    const score = r.live ? null : scoreFor(r);
    const b = scoreBreakdown(r);
    const noteItems = sessionNoteItems(r);
    const cells = [
      {
        label: "Date",
        text: formatDate(r.completedAt),
        title: r.live ? `Started ${formatDate(r.completedAt)}.` : `Saved ${formatDate(r.completedAt)}.`
      },
      { label: "Goal", text: r.intent, title: "Focus goal for this session." },
      { label: "Tag", text: r.tag || "—", title: r.tag ? `Tag: ${r.tag}.` : "No tag for this session." },
      { label: "Topics", text: r.topic || "—", title: r.topic ? "Topics / work tagged for this session." : "No topics saved for this session." },
      {
        label: "Focus",
        text: formatDuration(r.focusSeconds),
        title: r.live
          ? `Active focus so far: ${formatDuration(r.focusSeconds)} of ${formatDuration(r.targetSeconds)} planned (${b.completionPct}%). Breaks are excluded.`
          : `Active focus time: ${formatDuration(r.focusSeconds)} of ${formatDuration(r.targetSeconds)} planned (${b.completionPct}%). Breaks are excluded.`
      },
      {
        label: "Elapsed",
        text: formatDuration(r.elapsedSeconds),
        title: r.live
          ? `Clock time so far including breaks: ${formatDuration(r.elapsedSeconds)} (breaks ${formatDuration(r.breakSeconds)}).`
          : `Total clock time including breaks: ${formatDuration(r.elapsedSeconds)} (breaks ${formatDuration(r.breakSeconds)}).`
      },
      {
        label: "Completion score",
        text: r.live ? "—" : score == null ? "N/A" : `${score}%`,
        title: r.live ? "Score is calculated when the session ends." : explainScore(r),
        explain: !r.live
      }
    ];
    cells.forEach((cell) => {
      const td = document.createElement("td");
      td.textContent = cell.text;
      td.dataset.label = cell.label;
      td.title = cell.title;
      if (cell.explain) {
        td.tabIndex = 0;
        td.setAttribute("aria-label", `${cell.label}: ${cell.text}. ${cell.title}`);
      }
      tr.append(td);
    });
    const notesTd = document.createElement("td");
    notesTd.dataset.label = "Notes";
    notesTd.className = "history-notes-cell";
    if (!noteItems.length) {
      notesTd.textContent = "—";
      notesTd.title = r.live ? "No notes yet for this active session." : "No notes saved for this session.";
    } else {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "history-notes-btn";
      const preview = noteItems[0].text.replace(/\s+/g, " ").trim();
      const short = preview.length > 48 ? `${preview.slice(0, 48)}…` : preview;
      const count = document.createElement("strong");
      count.textContent = noteItems.length === 1 ? "1 note" : `${noteItems.length} notes`;
      const snippet = document.createElement("span");
      snippet.textContent = short;
      btn.append(count, snippet);
      btn.title = noteItems.map((n, i) => `Note ${i + 1}: ${n.text}`).join("\n\n");
      btn.setAttribute("aria-label", `${noteItems.length} note${noteItems.length === 1 ? "" : "s"} for ${r.intent}. Open in Notes with filter.`);
      btn.addEventListener("click", () => openNotesFilteredToSession(r.id));
      notesTd.append(btn);
    }
    const focusTd = tr.children[4];
    tr.insertBefore(notesTd, focusTd);
    const out = document.createElement("td");
    out.dataset.label = "Outcome";
    const pill = document.createElement("span");
    if (r.live) {
      pill.className = "outcome-pill active";
      pill.textContent = "In progress";
      pill.title = r.reason === "On break"
        ? "Session is active — currently on a break."
        : "Session is active — focusing now.";
    } else {
      pill.className = `outcome-pill ${r.outcome === "completed" ? "success" : r.outcome === "failed" ? "failed" : ""}`;
      pill.textContent = r.outcome === "completed" ? "Completed" : r.outcome === "failed" ? "Hardcore failed" : r.outcome === "incomplete" ? "Incomplete" : "Ended early";
      pill.title = explainOutcome(r);
    }
    pill.tabIndex = 0;
    pill.setAttribute("aria-label", `${pill.textContent}. ${pill.title}`);
    out.append(pill);
    tr.append(out);
    const actions = document.createElement("td");
    actions.dataset.label = "Actions";
    actions.className = "history-actions-cell";
    if (r.live) {
      const resume = document.createElement("button");
      resume.className = "button button-primary button-small";
      resume.type = "button";
      resume.textContent = "Return";
      resume.title = "Return to the active timer.";
      resume.addEventListener("click", () => navigate("timer-screen"));
      actions.append(resume);
    } else {
      const edit = document.createElement("button");
      edit.className = "button button-secondary button-small";
      edit.type = "button";
      edit.textContent = "Edit";
      edit.title = "Edit topics and notes for this session.";
      edit.addEventListener("click", () => openEdit(r.id));
      const del = document.createElement("button");
      del.className = "button button-danger-outline button-small";
      del.type = "button";
      del.textContent = "Delete";
      del.title = "Delete this session from local history.";
      del.addEventListener("click", () => deleteSession(r.id));
      actions.append(edit, del);
    }
    tr.append(actions);
    dom.historyTableBody.append(tr);
  });
  const filteredEmpty = rows.length === 0;
  const hasHistoryButFilteredOut = (state.history.length > 0 || Boolean(state.session)) && filteredEmpty;
  dom.historyEmpty.classList.toggle("is-visible", filteredEmpty);
  dom.historyEmpty.querySelector("h2").textContent = hasHistoryButFilteredOut ? "No matching sessions" : "No sessions yet";
  dom.historyEmpty.querySelector("p").textContent = hasHistoryButFilteredOut
    ? "Try a different search, date range, or sort."
    : "Completed and incomplete attempts will appear here.";
  dom.historyStartBtn.classList.toggle("is-hidden", hasHistoryButFilteredOut);
  const completed = completedRecords();
  dom.historyCompletedCount.textContent = String(completed.length);
  dom.historyAttemptCount.textContent = String(state.history.length);
  dom.historyTotalFocus.textContent = formatDuration(completed.reduce((s, r) => s + r.focusSeconds, 0));
  requestAnimationFrame(syncHistoryTableScroll);
}

export function deleteSession(id) {
  const item=state.history.find(r=>r.id===id); if(!item) return;
  const previous=state.history.slice();
  state.history=state.history.filter(r=>r.id!==id);
  if (!saveHistory()) {
    state.history=previous;
    showToast("Could not delete session — browser storage unavailable. Try Save backup.");
    return;
  }
  renderHistory(); renderNotes(); renderInsights();
  showUndoToast(`Deleted “${item.intent}”.`,()=>{
    state.history.push(item);
    state.history.sort((a,b)=>Date.parse(b.completedAt)-Date.parse(a.completedAt));
    if (!saveHistory()) { showToast("Could not restore session — browser storage unavailable."); return; }
    renderAll(); showToast("Session restored.");
  });
}

export function showUndoToast(message, undo) {
  clearTimeout(state.toastTimer);
  dom.toast.innerHTML="";
  const text=document.createElement("span");text.textContent=message;
  const b=document.createElement("button");b.type="button";b.textContent="Undo";b.className="toast-action";b.addEventListener("click",()=>{undo();dom.toast.classList.remove("is-visible");});
  dom.toast.append(text,b);dom.toast.classList.add("is-visible");state.toastTimer=setTimeout(()=>dom.toast.classList.remove("is-visible"),5000);
}

export function updateEditNotesSummary(item) {
  if (!dom.editNotesSummary) return;
  const items = sessionNoteItems(item);
  dom.editNotesSummary.textContent = items.length
    ? `${items.length} note${items.length === 1 ? "" : "s"} saved for this session.`
    : "No notes yet for this session.";
}

export function openEdit(id) {
  const item = state.history.find((r) => r.id === id); if (!item) return;
  state.editingId = id;
  dom.editTitle.value = item.topic || "";
  updateEditNotesSummary(item);
  if (typeof dom.editDialog.showModal === "function") dom.editDialog.showModal();
}

export function saveEdit() {
  const item = state.history.find((r) => r.id === state.editingId); if (!item) return;
  const prevTopic = item.topic;
  item.topic = item.topics = dom.editTitle.value.trim().slice(0, 240);
  if (!saveHistory()) {
    item.topic = item.topics = prevTopic;
    showToast("Could not update session — browser storage unavailable. Try Save backup.");
    return;
  }
  dom.editDialog.close();
  state.editingId = null;
  renderAll();
  showToast("Session updated.");
}

export function renderReportNotesList() {
  if (!dom.reportNotesList) return;
  const item = state.history.find((r) => r.id === state.reportId);
  dom.reportNotesList.replaceChildren();
  if (!item) return;
  const items = sessionNoteItems(item);
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty-inline";
    empty.textContent = "No notes yet. Add one below.";
    dom.reportNotesList.append(empty);
    return;
  }
  const list = document.createElement("ul");
  list.className = "session-note-items";
  items.forEach((note, index) => {
    const li = document.createElement("li");
    li.className = "session-note-item";
    const label = document.createElement("strong");
    label.textContent = `Note ${index + 1}`;
    const p = document.createElement("p");
    p.textContent = note.text;
    const foot = document.createElement("div");
    foot.className = "session-note-item-foot";
    const time = document.createElement("small");
    time.textContent = formatDate(note.createdAt);
    const actions = document.createElement("div");
    actions.className = "note-card-actions";
    actions.append(createNoteItemOptions({
      text: note.text,
      label: `${item.intent || "note"}-${index + 1}`,
      onEdit: () => openNoteEditor({
        scope: "history",
        sessionId: item.id,
        noteId: note.id,
        intent: item.intent,
        live: false,
        text: note.text
      }),
      onDelete: () => {
        state.editingNote = {
          scope: "history",
          sessionId: item.id,
          noteId: note.id,
          intent: item.intent,
          live: false,
          text: note.text
        };
        deleteEditedNote();
      }
    }));
    foot.append(time, actions);
    li.append(label, p, foot);
    list.append(li);
  });
  dom.reportNotesList.append(list);
}

export function addReportNote() {
  const item = state.history.find((r) => r.id === state.reportId);
  if (!item) return;
  const text = String(dom.reportNoteInput?.value || "").trim().slice(0, 2000);
  if (!text) {
    showToast("Write a note before adding.");
    dom.reportNoteInput?.focus();
    return;
  }
  const previous = sessionNoteItems(item);
  const next = [
    ...previous,
    { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, text, createdAt: new Date().toISOString() }
  ];
  applyNoteItems(item, next);
  if (!saveHistory()) {
    applyNoteItems(item, previous);
    showToast("Could not save note — browser storage unavailable.");
    return;
  }
  if (dom.reportNoteInput) dom.reportNoteInput.value = "";
  state.reportDirty = Boolean(String(dom.reportTopic?.value || "").trim() !== String(item.topic || "").trim());
  if (!state.reportDirty) {
    dom.reportSaveState.textContent = `Saved · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  refreshNotesSurfaces();
  showToast("Note added.");
}

export function saveReportNotes() {
  const item = state.history.find((r) => r.id === state.reportId); if (!item) return;
  const draft = String(dom.reportNoteInput?.value || "").trim();
  if (draft) {
    addReportNote();
    if (String(dom.reportNoteInput?.value || "").trim()) return;
  }
  const previousTopic = item.topic;
  item.topic = item.topics = dom.reportTopic.value.trim().slice(0, 240);
  if (!saveHistory()) {
    item.topic = item.topics = previousTopic;
    state.reportDirty = true;
    dom.reportSaveState.textContent = "Not saved — browser storage unavailable";
    return;
  }
  state.reportDirty = false;
  dom.reportSaveState.textContent = `Saved · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  renderAll();
  showToast("Session notes saved.");
  navigate("history-screen");
}

export function openNotesFilteredToSession(sessionId) {
  const item = state.history.find((r) => r.id === sessionId);
  const live = state.session?.id === sessionId ? state.session : null;
  const source = item || live;
  if (!source) {
    showToast("Session not found.");
    return;
  }
  state.notesSessionFilter = {
    id: sessionId,
    intent: source.intent || "Session"
  };
  if (dom.notesSearch) dom.notesSearch.value = "";
  closeSessionNotesViewer();
  if (dom.editDialog?.open) {
    state.editingId = null;
    dom.editDialog.close();
  }
  navigate("notes-screen");
  showToast(`Filtered Notes to “${source.intent}”. Clear the filter anytime.`);
}

export function openSessionNotesViewer(sessionId) {
  const item = state.history.find((r) => r.id === sessionId);
  if (!item) return;
  state.viewingNotesId = sessionId;
  if (dom.viewNoteInput) dom.viewNoteInput.value = "";
  renderSessionNotesViewer();
  if (typeof dom.viewNotesDialog?.showModal === "function") dom.viewNotesDialog.showModal();
}

export function closeSessionNotesViewer() {
  state.viewingNotesId = null;
  if (dom.viewNotesDialog?.open) dom.viewNotesDialog.close();
}

export function renderSessionNotesViewer() {
  if (!dom.viewNotesList) return;
  const item = state.history.find((r) => r.id === state.viewingNotesId);
  if (!item) {
    closeSessionNotesViewer();
    return;
  }
  const items = sessionNoteItems(item);
  if (dom.viewNotesHeading) dom.viewNotesHeading.textContent = item.intent;
  if (dom.viewNotesMeta) {
    dom.viewNotesMeta.textContent = `${formatDate(item.completedAt)} · ${items.length} note${items.length === 1 ? "" : "s"}`;
  }
  dom.viewNotesList.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty-inline";
    empty.textContent = "No notes yet. Add one below.";
    dom.viewNotesList.append(empty);
    return;
  }
  const list = document.createElement("ul");
  list.className = "session-note-items";
  items.forEach((note, index) => {
    const li = document.createElement("li");
    li.className = "session-note-item";
    const label = document.createElement("strong");
    label.textContent = `Note ${index + 1}`;
    const p = document.createElement("p");
    p.textContent = note.text;
    const foot = document.createElement("div");
    foot.className = "session-note-item-foot";
    const time = document.createElement("small");
    time.textContent = formatDate(note.createdAt);
    const actions = document.createElement("div");
    actions.className = "note-card-actions";
    actions.append(createNoteItemOptions({
      text: note.text,
      label: `${item.intent || "note"}-${index + 1}`,
      onEdit: () => openNoteEditor({
        scope: "history",
        sessionId: item.id,
        noteId: note.id,
        intent: item.intent,
        live: false,
        text: note.text
      }),
      onDelete: () => {
        state.editingNote = {
          scope: "history",
          sessionId: item.id,
          noteId: note.id,
          intent: item.intent,
          live: false,
          text: note.text
        };
        deleteEditedNote();
      }
    }));
    foot.append(time, actions);
    li.append(label, p, foot);
    list.append(li);
  });
  dom.viewNotesList.append(list);
}

export function addNoteToViewedSession() {
  const item = state.history.find((r) => r.id === state.viewingNotesId);
  if (!item) return;
  const text = String(dom.viewNoteInput?.value || "").trim().slice(0, 2000);
  if (!text) {
    showToast("Write a note before adding.");
    dom.viewNoteInput?.focus();
    return;
  }
  const previous = sessionNoteItems(item);
  const next = [
    ...previous,
    { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, text, createdAt: new Date().toISOString() }
  ];
  applyNoteItems(item, next);
  if (!saveHistory()) {
    applyNoteItems(item, previous);
    showToast("Could not save note — browser storage unavailable.");
    return;
  }
  if (dom.viewNoteInput) dom.viewNoteInput.value = "";
  refreshNotesSurfaces();
  showToast("Note added.");
}

export function exportCsv() {
  if(!state.history.length){showToast("There are no attempts to export.");return;}
  const header=["Completed At","Goal","Tag","Planned","Focus","Elapsed","Breaks","Completion score","Style","Outcome","Reason","Topics","Notes"];
  const rows=state.history.map(r=>[r.completedAt,r.intent,r.tag||"",formatDuration(r.targetSeconds),formatDuration(r.focusSeconds),formatDuration(r.elapsedSeconds),formatDuration(r.breakSeconds),scoreFor(r)==null?"":scoreFor(r),r.hardcore?"Hardcore":"Standard",r.outcome,r.reason,r.topic,r.notes]);
  download("locked-in-history.csv","\uFEFF"+[header,...rows].map(row=>row.map(csvEscape).join(",")).join("\r\n"),"text/csv;charset=utf-8");showToast("Spreadsheet download ready.");
}

export function exportJson() {
  if (!state.history.length) {
    showToast("There are no sessions to back up.");
    return;
  }
  download("locked-in-backup.json",JSON.stringify({schemaVersion:3,exportedAt:new Date().toISOString(),app:"Locked-In",sessions:state.history,notesInbox:state.inbox},null,2),"application/json");showToast("Backup file ready.");
}

export async function importJson(file) {
  if(!file)return;
  if(file.size>MAX_IMPORT_BYTES){showToast("That file is larger than 2 MB.");dom.importJsonInput.value="";return;}
  try{
    const parsed=JSON.parse(await file.text());
    const incoming=Array.isArray(parsed)?parsed:parsed?.sessions;
    if(!Array.isArray(incoming)||incoming.length>MAX_HISTORY||incoming.some(r=>!r||typeof r!=="object"||!String(r.intent??r.goal??r.task??"").trim()))throw new Error("schema");
    const normalized=incoming.map(normalizeRecord).filter(Boolean);
    const replace=window.confirm("Restore backup: press OK to replace your history, or Cancel to merge it with your existing sessions.");
    const previousHistory=state.history.slice();
    const previousInbox=state.inbox.slice();
    if(replace)state.history=normalized;else{const map=new Map(state.history.map(r=>[r.id,r]));normalized.forEach(r=>map.set(r.id,r));state.history=[...map.values()].sort((a,b)=>Date.parse(b.completedAt)-Date.parse(a.completedAt)).slice(0,MAX_HISTORY);}
    if(Array.isArray(parsed.notesInbox))state.inbox=parsed.notesInbox.map(n=>({id:String(n.id||`${Date.now()}-${Math.random()}`),text:String(n.text||"").slice(0,2000),createdAt:n.createdAt||new Date().toISOString()})).filter(n=>n.text.trim()).slice(0,200);
    const historyOk=saveHistory();
    const inboxOk=Array.isArray(parsed.notesInbox) ? saveInbox() : true;
    if (!historyOk || !inboxOk) {
      state.history=previousHistory;
      state.inbox=previousInbox;
      showToast("Could not restore — browser storage unavailable. Try Save backup first.");
      return;
    }
    renderAll();showToast(`Restored ${normalized.length} session${normalized.length===1?"":"s"}.`);
  }catch(_){showToast("Could not restore that file. Choose a Locked-In backup.");}
  finally{dom.importJsonInput.value="";}
}

export function clearHistory() {
  if(!state.history.length){showToast("History is already empty.");return;}
  askConfirm("Clear all history?","This removes saved attempts from this browser. Export a backup first if you want to keep them.",()=>{
    const previous=state.history.slice();
    state.history=[];
    if (!saveHistory()) {
      state.history=previous;
      showToast("Could not clear history — browser storage unavailable.");
      return;
    }
    renderAll();showToast("History cleared.");
  },"Clear history");
}
