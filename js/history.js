import {
  CUSTOMIZE_KEY, FOCUS_GOALS_KEY, HISTORY_KEY, MAX_HISTORY, MAX_IMPORT_BYTES, MAX_NOTE_GROUPS, MAX_WEEK_REPORTS,
  PREFS_KEY, RECENT_GOALS_KEY, THEME_KEY, WEEK_REPORTS_KEY
} from "./constants.js?v=207";
import { dom, state, tabId } from "./runtime.js?v=207";
import { safeRead, safeWrite } from "./storage.js?v=207";
import { showToast } from "./toast.js?v=207";
import { completedRecords, countedFocusRecords, csvEscape, download, explainOutcome, explainScore, formatDate, formatDuration, formatShortDate, scoreBreakdown, scoreFor, setFilterGlow, toISODateLocal } from "./utils.js?v=207";
import { broadcast } from "./sync.js?v=207";
import { askConfirm, navigate, setTheme } from "./theme-nav.js?v=207";
import { activeFocusSeconds, currentBreakSeconds, elapsedSeconds, normalizeRecord } from "./session.js?v=207";
import { renderInsights } from "./insights.js?v=207";
import { applyNoteItems, createNoteItemOptions, createNoteOptionsMenu, deleteEditedNote, formatNotePlainText, normalizeNoteFields, normalizeNoteGroup, openNoteEditor, refreshNotesSurfaces, renderNotes, saveInbox, saveNoteGroups, sessionNoteItems } from "./notes.js?v=207";
import { normalizeTodosDoc, saveTodos } from "./todos.js?v=207";
import { applyPrefsToDom, loadFocusGoals, loadPrefs, loadRecentGoals, savePrefs } from "./setup.js?v=207";
import { loadWeekReports, saveWeekReports } from "./week-reports.js?v=207";
import {
  applyCustomizePack,
  applyUserTheme,
  loadCustomizePack,
  loadUserThemes,
  parseUserThemeKey,
  saveCustomizePack,
  saveUserThemes
} from "./customize.js?v=207";
import { renderAll } from "./bind.js?v=207";

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

/** Jump to History filtered to a single local day (YYYY-MM-DD). */
export function openHistoryForDay(dayKey) {
  const key = String(dayKey || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  if (state.datePicker.field) closeDatePicker({ restoreFocus: false });
  if (dom.historySearch) dom.historySearch.value = "";
  if (dom.historyTagFilter) dom.historyTagFilter.value = "";
  if (dom.historySort) dom.historySort.value = "newest";
  if (dom.historyDateFrom) dom.historyDateFrom.value = key;
  if (dom.historyDateTo) dom.historyDateTo.value = key;
  syncAllDateDisplays();
  navigate("history-screen");
  renderHistory();
  const label = formatShortDate(key);
  const count = getFilteredHistory().filter((r) => !r.live).length;
  showToast(
    count
      ? `${count} session${count === 1 ? "" : "s"} on ${label}.`
      : `No sessions on ${label}.`
  );
  requestAnimationFrame(() => {
    dom.historyTableBody?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start"
    });
  });
  return true;
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

function datePickerSelectedValue() {
  const custom = state.datePicker.custom;
  if (custom && state.datePicker.field === custom.id) {
    return String(custom.getValue?.() || "");
  }
  return state.datePicker.field === "from" ? dom.historyDateFrom?.value : dom.historyDateTo?.value;
}

function datePickerAnchor() {
  const custom = state.datePicker.custom;
  if (custom && state.datePicker.field === custom.id) return custom.anchor || null;
  return state.datePicker.field === "from" ? dom.historyDateFromBtn : dom.historyDateToBtn;
}

function syncDatePickerExpanded() {
  const anchor = datePickerAnchor();
  [dom.historyDateFromBtn, dom.historyDateToBtn].forEach((btn) => {
    if (btn) btn.setAttribute("aria-expanded", "false");
  });
  document.querySelectorAll("[data-date-picker-anchor]").forEach((btn) => {
    btn.setAttribute("aria-expanded", btn === anchor ? "true" : "false");
  });
  if (anchor && (anchor === dom.historyDateFromBtn || anchor === dom.historyDateToBtn)) {
    anchor.setAttribute("aria-expanded", "true");
  }
}

export function closeDatePicker({ restoreFocus = true } = {}) {
  if (!dom.datePickerPopover) return;
  dom.datePickerPopover.hidden = true;
  dom.datePickerPopover.classList.add("is-hidden");
  const field = state.datePicker.field;
  const previousFocus = state.datePicker.previousFocus;
  const custom = state.datePicker.custom;
  state.datePicker.field = null;
  state.datePicker.previousFocus = null;
  state.datePicker.custom = null;
  [dom.historyDateFromBtn, dom.historyDateToBtn].forEach((btn) => {
    if (btn) btn.setAttribute("aria-expanded", "false");
  });
  document.querySelectorAll("[data-date-picker-anchor]").forEach((btn) => {
    btn.setAttribute("aria-expanded", "false");
  });
  if (!restoreFocus) return;
  if (previousFocus && typeof previousFocus.focus === "function" && document.contains(previousFocus)) {
    previousFocus.focus();
    return;
  }
  if (custom?.anchor && document.contains(custom.anchor)) custom.anchor.focus();
  else if (field === "from") dom.historyDateFromBtn?.focus();
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
  const { viewYear, viewMonth } = state.datePicker;
  const selected = datePickerSelectedValue();
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
  const custom = state.datePicker.custom;
  if (custom && field === custom.id) {
    custom.setValue?.(iso);
    closeDatePicker();
    custom.onCommit?.(iso);
    return;
  }
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

export function openCustomDatePicker({ id, getValue, setValue, onCommit, anchor }) {
  if (!dom.datePickerPopover || !anchor) return;
  const raw = String(getValue?.() || "");
  const current = raw ? new Date(`${raw}T00:00:00`) : new Date();
  state.datePicker.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : anchor;
  state.datePicker.custom = { id, getValue, setValue, onCommit, anchor };
  state.datePicker.field = id;
  state.datePicker.viewYear = Number.isNaN(current.getTime()) ? new Date().getFullYear() : current.getFullYear();
  state.datePicker.viewMonth = Number.isNaN(current.getTime()) ? new Date().getMonth() : current.getMonth();
  renderDatePicker();
  dom.datePickerPopover.hidden = false;
  dom.datePickerPopover.classList.remove("is-hidden");
  positionDatePicker(anchor);
  syncDatePickerExpanded();
  const focusTarget = dom.datePickerGrid?.querySelector(".date-picker-day.is-selected, .date-picker-day.is-today, .date-picker-day")
    || getDatePickerFocusables()[0];
  focusTarget?.focus();
}

export function toggleCustomDatePicker(opts) {
  if (state.datePicker.field === opts.id && !dom.datePickerPopover?.hidden) {
    closeDatePicker();
    return;
  }
  openCustomDatePicker(opts);
}

export function openDatePicker(field) {
  if (!dom.datePickerPopover) return;
  const input = field === "from" ? dom.historyDateFrom : dom.historyDateTo;
  const anchor = field === "from" ? dom.historyDateFromBtn : dom.historyDateToBtn;
  const current = input?.value ? new Date(`${input.value}T00:00:00`) : new Date();
  state.datePicker.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : anchor;
  state.datePicker.custom = null;
  state.datePicker.field = field;
  state.datePicker.viewYear = current.getFullYear();
  state.datePicker.viewMonth = current.getMonth();
  renderDatePicker();
  dom.datePickerPopover.hidden = false;
  dom.datePickerPopover.classList.remove("is-hidden");
  positionDatePicker(anchor);
  syncDatePickerExpanded();
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
    const custom = state.datePicker.custom;
    if (custom && field === custom.id) {
      custom.setValue?.("");
      closeDatePicker();
      custom.onCommit?.(null);
      return;
    }
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
    const customAnchor = state.datePicker.custom?.anchor;
    if (customAnchor?.contains?.(target)) return;
    if (target instanceof Element && target.closest("[data-date-picker-anchor]")) return;
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
    positionDatePicker(datePickerAnchor());
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
  const card = dom.historyTableBody?.querySelector(".history-session.is-live-session");
  if (!card) return;
  const live = liveSessionAsHistoryRow(now);
  if (!live) return;
  const b = scoreBreakdown(live);
  const focusEl = card.querySelector("[data-history-focus]");
  const elapsedEl = card.querySelector("[data-history-elapsed]");
  const scoreEl = card.querySelector("[data-history-score]");
  const pill = card.querySelector(".outcome-pill");
  if (focusEl) {
    focusEl.textContent = formatDuration(live.focusSeconds);
    focusEl.title = `Active focus so far: ${formatDuration(live.focusSeconds)} of ${formatDuration(live.targetSeconds)} planned (${b.completionPct}%). Breaks are excluded.`;
  }
  if (elapsedEl) {
    elapsedEl.textContent = formatDuration(live.elapsedSeconds);
    elapsedEl.title = `Clock time so far including breaks: ${formatDuration(live.elapsedSeconds)} (breaks ${formatDuration(live.breakSeconds)}).`;
  }
  if (scoreEl) {
    scoreEl.textContent = "—";
    scoreEl.title = "Score is calculated when the session ends.";
  }
  if (pill) {
    pill.textContent = "Live";
    pill.title = live.reason === "On break"
      ? "Session is active — currently on a break."
      : "Session is active — focusing now.";
    pill.setAttribute("aria-label", `${pill.textContent}. ${pill.title}`);
  }
}

function syncHistoryFilterGlows() {
  const q = Boolean(dom.historySearch?.value?.trim());
  const from = Boolean(dom.historyDateFrom?.value);
  const to = Boolean(dom.historyDateTo?.value);
  const sort = String(dom.historySort?.value || "newest");
  const tag = Boolean(String(dom.historyTagFilter?.value || "").trim());
  setFilterGlow(dom.historySearch?.closest(".search-field"), q);
  setFilterGlow(dom.historyDateFromBtn?.closest(".compact-field"), from);
  setFilterGlow(dom.historyDateToBtn?.closest(".compact-field"), to);
  setFilterGlow(dom.historySort?.closest(".compact-field"), sort !== "newest");
  setFilterGlow(dom.historyTagFilter?.closest(".compact-field"), tag);
}

export function renderHistory() {
  populateHistoryTagFilter();
  syncHistoryFilterGlows();
  const rows = getFilteredHistory();
  dom.historyTableBody.replaceChildren();
  rows.forEach((r) => {
    const score = r.live ? null : scoreFor(r);
    const b = scoreBreakdown(r);
    const noteItems = sessionNoteItems(r);
    const card = document.createElement("article");
    card.className = `history-session${r.live ? " is-live-session" : ""}`;
    card.dataset.sessionId = r.id;
    card.setAttribute("role", "listitem");

    const main = document.createElement("div");
    main.className = "history-session-main";

    const titleWrap = document.createElement("div");
    titleWrap.className = "history-session-title-wrap";
    const title = document.createElement("h3");
    title.className = "history-session-title";
    title.textContent = r.intent;
    title.title = "Focus goal for this session.";
    titleWrap.append(title);

    const actions = document.createElement("div");
    actions.className = "history-session-actions";
    const pill = document.createElement("span");
    if (r.live) {
      pill.className = "outcome-pill active";
      pill.textContent = "Live";
      pill.title = r.reason === "On break"
        ? "Session is active — currently on a break."
        : "Session is active — focusing now.";
    } else {
      pill.className = `outcome-pill ${r.outcome === "completed" ? "success" : r.outcome === "failed" ? "failed" : ""}`;
      pill.textContent = r.outcome === "completed" ? "Done" : r.outcome === "failed" ? "Failed" : r.outcome === "incomplete" ? "Incomplete" : "Early";
      pill.title = explainOutcome(r);
    }
    pill.tabIndex = 0;
    pill.setAttribute("aria-label", `${pill.textContent}. ${pill.title}`);
    const menuItems = r.live
      ? [{ label: "Return to timer", onClick: () => navigate("timer-screen") }]
      : [
          { label: "Edit session", onClick: () => openEdit(r.id) },
          ...(noteItems.length
            ? [
                { label: "View notes", onClick: () => openSessionNotesViewer(r.id) },
                { label: "Open in Notes", onClick: () => openNotesFilteredToSession(r.id) }
              ]
            : []),
          { label: "Delete", danger: true, onClick: () => deleteSession(r.id) }
        ];
    const menu = createNoteOptionsMenu(menuItems);
    const toggle = menu.querySelector(".note-options-toggle");
    if (toggle) {
      toggle.setAttribute("aria-label", "Session options");
      toggle.title = "Session options";
    }
    actions.append(pill, menu);

    const head = document.createElement("div");
    head.className = "history-session-head";
    head.append(titleWrap, actions);

    const sub = document.createElement("div");
    sub.className = "history-session-sub";
    const focusText = formatDuration(r.focusSeconds);
    const elapsedText = formatDuration(r.elapsedSeconds);
    const scoreText = r.live ? "—" : score == null ? "N/A" : `${score}%`;
    const dateSpan = document.createElement("time");
    dateSpan.className = "history-session-date";
    dateSpan.dateTime = r.completedAt;
    dateSpan.textContent = formatDate(r.completedAt);
    dateSpan.title = r.live ? `Started ${formatDate(r.completedAt)}.` : `Saved ${formatDate(r.completedAt)}.`;

    const stats = document.createElement("div");
    stats.className = "history-session-stats";
    const makeStat = (labelText, valueEl) => {
      const item = document.createElement("div");
      item.className = "history-stat";
      const labelEl = document.createElement("span");
      labelEl.className = "history-stat-label";
      labelEl.textContent = labelText;
      item.append(labelEl, valueEl);
      return item;
    };
    const focusSpan = document.createElement("strong");
    focusSpan.className = "history-metric-value";
    focusSpan.dataset.historyFocus = "";
    focusSpan.textContent = focusText;
    focusSpan.title = r.live
      ? `Active focus so far: ${focusText} of ${formatDuration(r.targetSeconds)} planned (${b.completionPct}%). Breaks are excluded.`
      : `Active focus time: ${focusText} of ${formatDuration(r.targetSeconds)} planned (${b.completionPct}%). Breaks are excluded.`;
    const elapsedSpan = document.createElement("strong");
    elapsedSpan.className = "history-metric-value";
    elapsedSpan.dataset.historyElapsed = "";
    elapsedSpan.textContent = elapsedText;
    elapsedSpan.title = r.live
      ? `Clock time so far including breaks: ${elapsedText} (breaks ${formatDuration(r.breakSeconds)}).`
      : `Total clock time including breaks: ${elapsedText} (breaks ${formatDuration(r.breakSeconds)}).`;
    const scoreSpan = document.createElement("strong");
    scoreSpan.className = "history-metric-value";
    scoreSpan.dataset.historyScore = "";
    scoreSpan.textContent = scoreText;
    scoreSpan.title = r.live ? "Score is calculated when the session ends." : explainScore(r);
    if (!r.live) {
      scoreSpan.tabIndex = 0;
      scoreSpan.setAttribute("aria-label", `Score: ${scoreText}. ${scoreSpan.title}`);
    }
    stats.append(
      makeStat("Focus", focusSpan),
      makeStat("Elapsed", elapsedSpan),
      makeStat("Score", scoreSpan)
    );
    sub.append(dateSpan, stats);

    const meta = document.createElement("div");
    meta.className = "history-session-meta";
    if (r.tag) {
      const tag = document.createElement("span");
      tag.className = "history-chip";
      tag.textContent = r.tag;
      tag.title = `Tag: ${r.tag}.`;
      meta.append(tag);
    }
    if (r.topic) {
      const topics = document.createElement("span");
      topics.className = "history-chip history-chip-muted";
      topics.textContent = r.topic;
      topics.title = "Topics / work tagged for this session.";
      meta.append(topics);
    }
    if (noteItems.length) {
      const notesChip = document.createElement("button");
      notesChip.type = "button";
      notesChip.className = "history-chip history-chip-notes";
      notesChip.textContent = noteItems.length === 1 ? "1 note" : `${noteItems.length} notes`;
      notesChip.title = noteItems.map((n, i) => `Note ${i + 1}: ${formatNotePlainText(n)}`).join("\n\n");
      notesChip.setAttribute(
        "aria-label",
        `${noteItems.length} note${noteItems.length === 1 ? "" : "s"} for ${r.intent}. Open notes.`
      );
      notesChip.addEventListener("click", () => {
        if (r.live) openNotesFilteredToSession(r.id);
        else openSessionNotesViewer(r.id);
      });
      meta.append(notesChip);
    }

    main.append(head, sub);
    if (meta.childElementCount) main.append(meta);
    card.append(main);
    dom.historyTableBody.append(card);
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
  const focusRecords = countedFocusRecords();
  dom.historyCompletedCount.textContent = String(completed.length);
  dom.historyAttemptCount.textContent = String(state.history.length);
  dom.historyTotalFocus.textContent = formatDuration(focusRecords.reduce((s, r) => s + r.focusSeconds, 0));
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
    label.className = "note-card-title";
    label.textContent = note.title || `Note ${index + 1}`;
    const p = document.createElement("p");
    p.className = "note-card-body";
    p.textContent = note.text || "";
    const foot = document.createElement("div");
    foot.className = "session-note-item-foot";
    const time = document.createElement("small");
    time.textContent = formatDate(note.createdAt);
    const actions = document.createElement("div");
    actions.className = "note-card-actions";
    const plain = formatNotePlainText(note);
    actions.append(createNoteItemOptions({
      text: plain,
      label: note.title || `${item.intent || "note"}-${index + 1}`,
      onEdit: () => openNoteEditor({
        scope: "history",
        sessionId: item.id,
        noteId: note.id,
        intent: item.intent,
        live: false,
        title: note.title || "",
        text: note.text || ""
      }),
      onDelete: () => {
        state.editingNote = {
          scope: "history",
          sessionId: item.id,
          noteId: note.id,
          intent: item.intent,
          live: false,
          title: note.title || "",
          text: note.text || ""
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
    normalizeNoteFields({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, title: "", text, createdAt: new Date().toISOString() })
  ].filter(Boolean);
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
  if (dom.notesScopeFilter) dom.notesScopeFilter.value = "sessions";
  if (dom.notesGroupFilter) dom.notesGroupFilter.value = "all";
  if (dom.notesSessionPick) {
    // Ensure the option exists before selecting.
    const has = Array.from(dom.notesSessionPick.options).some((o) => o.value === sessionId);
    if (!has) {
      const opt = document.createElement("option");
      opt.value = sessionId;
      opt.textContent = `${source.intent || "Session"}`;
      dom.notesSessionPick.append(opt);
    }
    dom.notesSessionPick.value = sessionId;
  }
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
    label.className = "note-card-title";
    label.textContent = note.title || `Note ${index + 1}`;
    const p = document.createElement("p");
    p.className = "note-card-body";
    p.textContent = note.text || "";
    const foot = document.createElement("div");
    foot.className = "session-note-item-foot";
    const time = document.createElement("small");
    time.textContent = formatDate(note.createdAt);
    const actions = document.createElement("div");
    actions.className = "note-card-actions";
    const plain = formatNotePlainText(note);
    actions.append(createNoteItemOptions({
      text: plain,
      label: note.title || `${item.intent || "note"}-${index + 1}`,
      onEdit: () => openNoteEditor({
        scope: "history",
        sessionId: item.id,
        noteId: note.id,
        intent: item.intent,
        live: false,
        title: note.title || "",
        text: note.text || ""
      }),
      onDelete: () => {
        state.editingNote = {
          scope: "history",
          sessionId: item.id,
          noteId: note.id,
          intent: item.intent,
          live: false,
          title: note.title || "",
          text: note.text || ""
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
    normalizeNoteFields({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, title: "", text, createdAt: new Date().toISOString() })
  ].filter(Boolean);
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

function readThemeKey() {
  try { return localStorage.getItem(THEME_KEY) || "dark"; } catch (_) { return "dark"; }
}

function cloneJson(value) {
  try { return value == null ? value : JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
}

function normalizeImportedInbox(raw) {
  if (!Array.isArray(raw)) return null;
  return raw
    .map((n) => normalizeNoteFields(n))
    .filter(Boolean)
    .slice(0, 200);
}

function normalizeImportedRecentGoals(raw) {
  if (!Array.isArray(raw)) return null;
  return raw.map((g) => ({
    intent: String(g?.intent || "").trim().slice(0, 120),
    durationPreset: String(g?.durationPreset || "45"),
    customSeconds: Math.max(0, Math.floor(Number(g?.customSeconds) || 0)),
    style: g?.style === "hardcore" ? "hardcore" : "standard",
    tag: String(g?.tag || "").trim().slice(0, 24)
  })).filter((g) => g.intent.length >= 2).slice(0, 5);
}

function normalizeImportedFocusGoals(raw) {
  if (!raw || typeof raw !== "object") return null;
  loadFocusGoals();
  const base = { ...state.focusGoals };
  return {
    dailyMinutes: Number.isFinite(Number(raw.dailyMinutes)) ? Number(raw.dailyMinutes) : base.dailyMinutes,
    weeklyMinutes: Number.isFinite(Number(raw.weeklyMinutes)) ? Number(raw.weeklyMinutes) : base.weeklyMinutes,
    weekStartsOn: Number.isFinite(Number(raw.weekStartsOn)) ? Number(raw.weekStartsOn) : base.weekStartsOn,
    activeWeekKey: typeof raw.activeWeekKey === "string" ? raw.activeWeekKey : base.activeWeekKey,
    progressResetAt: Number.isFinite(Date.parse(raw.progressResetAt))
      ? new Date(raw.progressResetAt).toISOString()
      : (base.progressResetAt || null)
  };
}

function persistFocusGoalsSnapshot(goals) {
  if (!goals) return true;
  state.focusGoals = goals;
  return safeWrite(FOCUS_GOALS_KEY, {
    dailyMinutes: goals.dailyMinutes,
    weeklyMinutes: goals.weeklyMinutes,
    weekStartsOn: goals.weekStartsOn,
    activeWeekKey: goals.activeWeekKey || null,
    progressResetAt: goals.progressResetAt || null
  });
}

function applyImportedLook(themeValue) {
  const theme = String(themeValue || "").trim();
  const userId = parseUserThemeKey(theme);
  if (userId) {
    if (applyUserTheme(userId)) return;
  }
  if (theme === "custom" || state.customizePack?.mode === "custom") {
    applyCustomizePack(state.customizePack);
    try { localStorage.setItem(THEME_KEY, theme || "custom"); } catch (_) {}
    document.dispatchEvent(new CustomEvent("locked-in:customize-mode"));
    return;
  }
  const presets = ["dark", "light", "forest", "violet", "pink", "blue"];
  setTheme(presets.includes(theme) ? theme : "dark", true);
}

/** Full device backup for moving Locked-In data between browsers/devices. */
export function exportJson() {
  loadCustomizePack();
  const payload = {
    schemaVersion: 5,
    exportedAt: new Date().toISOString(),
    app: "Locked-In",
    sessions: state.history || [],
    notesInbox: state.inbox || [],
    noteGroups: state.noteGroups || [],
    todos: state.todos || null,
    prefs: state.prefs || safeRead(PREFS_KEY, null),
    focusGoals: state.focusGoals || safeRead(FOCUS_GOALS_KEY, null),
    weekReports: state.weekReports || safeRead(WEEK_REPORTS_KEY, []),
    recentGoals: state.recentGoals || safeRead(RECENT_GOALS_KEY, []),
    customize: state.customizePack || safeRead(CUSTOMIZE_KEY, null),
    userThemes: loadUserThemes(),
    theme: readThemeKey()
  };
  download(
    "locked-in-device-backup.json",
    JSON.stringify(payload, null, 2),
    "application/json"
  );
  showToast("Device backup ready.");
}

export async function importJson(file) {
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) {
    showToast("That file is larger than 5 MB.");
    dom.importJsonInput.value = "";
    return;
  }
  try {
    const parsed = JSON.parse(await file.text());
    const isObjectBackup = parsed && typeof parsed === "object" && !Array.isArray(parsed);
    const incoming = Array.isArray(parsed) ? parsed : parsed?.sessions;
    if (!Array.isArray(incoming) || incoming.length > MAX_HISTORY) throw new Error("schema");
    if (incoming.some((r) => !r || typeof r !== "object" || !String(r.intent ?? r.goal ?? r.task ?? "").trim())) {
      throw new Error("schema");
    }
    // Empty session list is OK for full device backups (themes/todos-only).
    if (!incoming.length && !(isObjectBackup && (parsed.schemaVersion >= 5 || parsed.todos || parsed.customize || parsed.prefs))) {
      throw new Error("schema");
    }
    const normalized = incoming.map(normalizeRecord).filter(Boolean);
    const replace = window.confirm(
      "Import device backup: OK replaces data on this device (history + linked settings). Cancel merges sessions and still applies themes/settings from the file."
    );

    const previous = {
      history: state.history.slice(),
      inbox: state.inbox.slice(),
      noteGroups: cloneJson(state.noteGroups),
      todos: cloneJson(state.todos),
      prefs: cloneJson(state.prefs),
      focusGoals: cloneJson(state.focusGoals),
      weekReports: cloneJson(state.weekReports),
      recentGoals: cloneJson(state.recentGoals),
      customize: cloneJson(state.customizePack),
      userThemes: loadUserThemes(),
      theme: readThemeKey()
    };

    if (replace) state.history = normalized;
    else {
      const map = new Map(state.history.map((r) => [r.id, r]));
      normalized.forEach((r) => map.set(r.id, r));
      state.history = [...map.values()]
        .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
        .slice(0, MAX_HISTORY);
    }

    const nextInbox = isObjectBackup ? normalizeImportedInbox(parsed.notesInbox) : null;
    if (nextInbox) state.inbox = nextInbox;

    const hasNoteGroups = isObjectBackup && Array.isArray(parsed.noteGroups);
    if (hasNoteGroups) {
      state.noteGroups = parsed.noteGroups.map((g) => normalizeNoteGroup(g)).filter(Boolean).slice(0, MAX_NOTE_GROUPS);
    }

    const hasTodos = isObjectBackup && parsed.todos && typeof parsed.todos === "object";
    if (hasTodos) state.todos = normalizeTodosDoc(parsed.todos);

    const hasPrefs = isObjectBackup && parsed.prefs && typeof parsed.prefs === "object";
    if (hasPrefs) {
      state.prefs = { ...state.prefs, ...parsed.prefs };
    }

    const nextGoals = isObjectBackup ? normalizeImportedFocusGoals(parsed.focusGoals) : null;
    if (nextGoals) state.focusGoals = nextGoals;

    const hasWeekReports = isObjectBackup && Array.isArray(parsed.weekReports);
    if (hasWeekReports) {
      state.weekReports = parsed.weekReports
        .filter((r) => r && r.weekStartKey)
        .slice(0, MAX_WEEK_REPORTS);
    }

    const nextRecent = isObjectBackup ? normalizeImportedRecentGoals(parsed.recentGoals) : null;
    if (nextRecent) state.recentGoals = nextRecent;

    const hasCustomize = isObjectBackup && parsed.customize && typeof parsed.customize === "object";
    const hasUserThemes = isObjectBackup && Array.isArray(parsed.userThemes);
    const nextUserThemes = hasUserThemes ? parsed.userThemes : null;
    const nextTheme = isObjectBackup && typeof parsed.theme === "string" ? parsed.theme : null;

    const historyOk = saveHistory();
    const inboxOk = nextInbox ? saveInbox() : true;
    const groupsOk = hasNoteGroups ? saveNoteGroups() : true;
    const todosOk = hasTodos ? saveTodos() : true;
    const prefsOk = hasPrefs ? savePrefs() : true;
    const goalsOk = nextGoals ? persistFocusGoalsSnapshot(nextGoals) : true;
    const weekOk = hasWeekReports ? saveWeekReports() : true;
    const recentOk = nextRecent ? safeWrite(RECENT_GOALS_KEY, nextRecent) : true;
    const customizeOk = hasCustomize ? saveCustomizePack(parsed.customize) : true;
    const themesOk = nextUserThemes ? saveUserThemes(nextUserThemes) : true;
    let themeOk = true;
    if (nextTheme) {
      try { localStorage.setItem(THEME_KEY, nextTheme); } catch (_) { themeOk = false; }
    }

    if (!historyOk || !inboxOk || !groupsOk || !todosOk || !prefsOk || !goalsOk || !weekOk || !recentOk || !customizeOk || !themesOk || !themeOk) {
      state.history = previous.history;
      state.inbox = previous.inbox;
      state.noteGroups = previous.noteGroups || [];
      state.todos = previous.todos;
      state.prefs = previous.prefs;
      state.focusGoals = previous.focusGoals;
      state.weekReports = previous.weekReports;
      state.recentGoals = previous.recentGoals;
      state.customizePack = previous.customize;
      saveHistory();
      saveInbox();
      saveNoteGroups();
      if (previous.todos) { state.todos = previous.todos; saveTodos(); }
      if (previous.prefs) { state.prefs = previous.prefs; savePrefs(); }
      if (previous.focusGoals) persistFocusGoalsSnapshot(previous.focusGoals);
      if (previous.weekReports) { state.weekReports = previous.weekReports; saveWeekReports(); }
      if (previous.recentGoals) safeWrite(RECENT_GOALS_KEY, previous.recentGoals);
      if (previous.customize) { state.customizePack = previous.customize; saveCustomizePack(previous.customize); }
      saveUserThemes(previous.userThemes || []);
      try { localStorage.setItem(THEME_KEY, previous.theme); } catch (_) {}
      showToast("Could not import — browser storage unavailable. Export a backup first.");
      return;
    }

    loadPrefs();
    applyPrefsToDom();
    loadFocusGoals();
    loadRecentGoals();
    loadWeekReports();
    loadCustomizePack();
    applyImportedLook(nextTheme || readThemeKey());
    renderAll();
    const parts = [];
    if (normalized.length) parts.push(`${normalized.length} session${normalized.length === 1 ? "" : "s"}`);
    if (hasTodos) parts.push("to-dos");
    if (hasCustomize || hasUserThemes || nextTheme) parts.push("themes");
    if (hasPrefs || nextGoals || hasWeekReports) parts.push("progress");
    showToast(parts.length ? `Imported ${parts.join(", ")}.` : "Device backup imported.");
  } catch (_) {
    showToast("Could not import that file. Choose a Locked-In device backup.");
  } finally {
    dom.importJsonInput.value = "";
  }
}

export function clearHistory() {
  if(!state.history.length){showToast("History is already empty.");return;}
  askConfirm(
    "Delete session history?",
    "This removes saved focus attempts only. Notes, to-dos, themes, and preferences stay. Export a backup first if you want to keep the sessions.",
    ()=>{
    const previous=state.history.slice();
    state.history=[];
    if (!saveHistory()) {
      state.history=previous;
      showToast("Could not clear history — browser storage unavailable.");
      return;
    }
    renderAll();showToast("Session history deleted.");
  },
    "Delete history"
  );
}
