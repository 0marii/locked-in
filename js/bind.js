import { ACTIVE_SESSION_KEY, MIN_SAVED_FOCUS_SECONDS } from "./constants.js?v=202";
import { dom, state, tabId } from "./runtime.js?v=202";
import { safeRead, safeWrite } from "./storage.js?v=202";
import { showToast } from "./toast.js?v=202";
import { formatShortDate } from "./utils.js?v=202";
import { initSync } from "./sync.js?v=202";
import { askConfirm, bindLeaveCustomizeDialog, closeMenu, closeThemePopover, initTheme, navigate, screenMap, toggleMenu } from "./theme-nav.js?v=202";
import { bindCustomizeEvents, initCustomize } from "./customize.js?v=202";
import {
  applyPomodoroMinutesToDom, applyPrefsToDom, clearLinkedTodo, ensureBreakFitsFocus, fitBreakMinutesToFocus,
  linkTodoToSetup, loadData, markFocusGoalsEdited, syncLinkedTodoFromIntentInput,
  readGoalMinutesFromDom, readPomodoroMinutesFromDom, renderFocusGoals, renderSetup, resetSetupFormDefaults,
  restoreFocusGoalsDefault, saveFocusGoalsFromDom, savePrefs, selectedChimeMode, setPrefsPanelOpen,
  syncBreakFocusValidation, syncChimeHint, syncGoalEditor, syncGoalLimitHint, syncHardcoreHint,
  syncPomodoroCustomVisibility, syncPomodoroIntervalVisibility, syncPomodoroMinuteOptions,
  syncDurationChips, syncSetupWidgetVisibility, syncTagCustomVisibility
} from "./setup.js?v=202";
import { activeFocusSeconds, addStickyNote, closeEndSessionDialog, finishSession, initBreakSuggestionSchedule, playChime, requestNotificationPermission, requestWakeLock, rescheduleBreakSuggestionFromFocus, restoreActiveSession, setStickyNotesOpen, setStickyState, startSession, startTimerLoop, stopSession, tick, toggleBreak, unlockAudio } from "./session.js?v=202";
import { addNoteToViewedSession, addReportNote, clearHistory, clearHistoryFilters, closeSessionNotesViewer, deleteSession, exportCsv, importJson, initDatePickers, initHistoryTableScrollHint, openHistoryForDay, openNotesFilteredToSession, openSessionNotesViewer, renderHistory, saveEdit, saveReportNotes, syncHistoryTableScroll } from "./history.js?v=202";
import { downloadWeekCard, renderInsights } from "./insights.js?v=202";
import {
  clearNotesFilters, clearNotesSessionFilter, closeNoteGroupDialog, closeOpenNoteMenus, createNoteOptionsMenu,
  deleteEditedNote, onNoteGroupSelectChange, onNotesScopeFilterChange, onNotesSessionPickChange, openNoteComposer,
  openNotesDatePicker, promptNewNoteGroup, renderNotes, saveEditedNote, submitNoteGroupDialog
} from "./notes.js?v=202";
import { bindTodoEvents, renderTodos } from "./todos.js?v=202";
import { bindWeekReportEvents, renderWeekReports, resetWeekNow } from "./week-reports.js?v=202";
import { bindSettingsEvents, syncSettingsNotifyStatus } from "./settings.js?v=202";

function confirmResetWeekNow() {
  askConfirm(
    "Reset this week now?",
    "Today's progress and this week's progress both start over. A performance report is saved. Session history and todos stay.",
    () => {
      resetWeekNow({ notify: true });
      renderFocusGoals();
      renderWeekReports();
    },
    "Reset week"
  );
}

export function renderAll(){renderSetup();renderHistory();renderInsights();renderNotes();renderTodos();}

export function handleKeyboard(e) {
  const target=e.target, tag=target?.tagName?.toLowerCase();
  const typing=["input","textarea","select"].includes(tag)||target?.isContentEditable;
  if(e.key==="Escape"){
    if(dom.themePopover.classList.contains("is-open")){closeThemePopover();dom.themeButton.focus();return;}
    if(state.stickyOpen){setStickyNotesOpen(false);return;}
    if(document.activeElement === dom.stickyNotesInput){dom.stickyNotesInput.blur();return;}
    if(dom.menuToggle.getAttribute("aria-expanded")==="true"){closeMenu();return;}
    if(dom.endSessionDialog?.open){closeEndSessionDialog();return;}
    if(dom.editDialog.open){dom.editDialog.close();return;}
    if(dom.noteGroupDialog?.open){closeNoteGroupDialog({ cancelled: true });return;}
    if(dom.editNoteDialog?.open){dom.editNoteDialog.close();state.editingNote=null;return;}

    if(dom.confirmDialog.open){dom.confirmDialog.close("cancel");return;}
  }
  if(typing||e.altKey||e.ctrlKey||e.metaKey)return;
  if(dom.endSessionDialog?.open||dom.confirmDialog.open||dom.noteGroupDialog?.open)return;
  if(!state.session||state.readOnly||!dom.keyboardShortcuts.checked)return;
  if(e.key.toLowerCase()==="b"){e.preventDefault();toggleBreak();}
  if(e.key.toLowerCase()==="s"){e.preventDefault();stopSession();}
}

export function bindEvents() {
  dom.menuToggle.addEventListener("click",toggleMenu);
  dom.navLinks.forEach(link=>link.addEventListener("click",()=>navigate(link.dataset.screen)));
  dom.setupForm.addEventListener("submit",startSession);
  dom.setupTodoPick?.addEventListener("change", () => {
    const id = dom.setupTodoPick.value;
    if (!id) {
      clearLinkedTodo();
      return;
    }
    if (linkTodoToSetup(id)) {
      showToast("To-do linked — its timer starts when you focus.");
      dom.taskIntent?.focus();
    } else {
      showToast("That to-do is no longer open.");
    }
  });
  dom.setupTodoUnlink?.addEventListener("click", () => {
    clearLinkedTodo({ clearIntent: true });
    dom.taskIntent?.focus();
    showToast("To-do unlinked.");
  });
  dom.taskIntent?.addEventListener("input", syncLinkedTodoFromIntentInput);
  const refreshBreakOptionsForFocus = () => {
    ensureBreakFitsFocus({ persist: Boolean(state.prefs.pomodoro) });
    syncPomodoroIntervalVisibility();
  };
  dom.durationPreset.addEventListener("change",()=>{
    const custom=dom.durationPreset.value==="custom";
    dom.customDuration.classList.toggle("is-hidden",!custom);
    dom.customDuration.setAttribute("aria-hidden",String(!custom));
    syncDurationChips();
    if(custom)dom.customHours.focus();
    refreshBreakOptionsForFocus();
  });
  document.querySelector(".duration-chips")?.addEventListener("click", (event) => {
    const chip = event.target.closest(".duration-chip");
    if (!chip || !dom.durationPreset) return;
    dom.durationPreset.value = chip.dataset.duration || "45";
    dom.durationPreset.dispatchEvent(new Event("change", { bubbles: true }));
  });
  [dom.customHours, dom.customMinutes].filter(Boolean).forEach((el) => {
    el.addEventListener("input", refreshBreakOptionsForFocus);
    el.addEventListener("change", refreshBreakOptionsForFocus);
  });
  dom.sessionStyle?.addEventListener("change", syncHardcoreHint);
  const returnToActiveTimer = () => {
    resetSetupFormDefaults();
    navigate("timer-screen");
  };
  dom.resumeSessionBtn.addEventListener("click",()=>{
    if (state.session) { returnToActiveTimer(); return; }
    const active=safeRead(ACTIVE_SESSION_KEY,null);
    if(active&&active.tabId===tabId){
      state.session=active;
      resetSetupFormDefaults();
      navigate("timer-screen");
      startTimerLoop();
    }
    else showToast("The active session belongs to another tab.");
  });
  dom.floatingTimer?.addEventListener("click",()=>{
    if (state.session) returnToActiveTimer();
    else showToast("No active session in this tab.");
  });
  dom.timerBackBtn.addEventListener("click",()=>{
    const last = safeRead("locked_in_last_screen", null);
    const allowed = ["history-screen", "insights-screen", "notes-screen"];
    navigate(allowed.includes(last) ? last : "history-screen");
  });
  dom.stickyNotesToggle?.addEventListener("click",()=>{
    if (!state.session || state.readOnly) return;
    setStickyNotesOpen(!state.stickyOpen);
  });
  dom.stickyNotesSave?.addEventListener("click",()=>addStickyNote(false));
  dom.stickyNotesInput?.addEventListener("input",()=>{
    state.stickyDirty = Boolean(dom.stickyNotesInput.value.trim());
    setStickyState(state.stickyDirty ? "Ready to add" : "Ready", state.stickyDirty ? "dirty" : "saved");
  });
  dom.stickyNotesInput?.addEventListener("keydown",(e)=>{
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); addStickyNote(false); }
  });
  dom.breakBtn.addEventListener("click",toggleBreak);dom.stopBtn.addEventListener("click",stopSession);
  dom.newSessionBtn.addEventListener("click",()=>{dom.taskIntent.value="";clearLinkedTodo();navigate("setup-screen");dom.taskIntent.focus();});
  dom.reportHistoryBtn.addEventListener("click",()=>navigate("history-screen"));dom.historyStartBtn.addEventListener("click",()=>navigate("setup-screen"));
  [dom.historySearch,dom.historySort,dom.historyTagFilter].filter(Boolean).forEach(el=>el.addEventListener("input",renderHistory));
  dom.clearHistoryFiltersBtn?.addEventListener("click", clearHistoryFilters);
  dom.historyTableScroll?.addEventListener("scroll", syncHistoryTableScroll, { passive: true });
  window.addEventListener("resize", () => {
    if (state.activeScreen === "history-screen") syncHistoryTableScroll();
  }, { passive: true });
  initHistoryTableScrollHint();
  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (target.closest?.(".note-options")) return;
    closeOpenNoteMenus();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeOpenNoteMenus();
  });
  initDatePickers();
  dom.goalTag?.addEventListener("change", syncTagCustomVisibility);
  const syncNotifyCheckbox = (key, on) => {
    if (key === "notifyEnd" && dom.prefNotifyEnd) dom.prefNotifyEnd.checked = on;
    if (key === "notifyBreak" && dom.prefNotifyBreak) dom.prefNotifyBreak.checked = on;
  };
  const persistPrefToggle = async (key, checked, needsPermission) => {
    if (!checked) {
      state.prefs[key] = false;
      syncNotifyCheckbox(key, false);
      if (!savePrefs()) showToast("Could not save preferences — browser storage unavailable.");
      return;
    }
    if (needsPermission) {
      if (!("Notification" in window)) {
        state.prefs[key] = false;
        syncNotifyCheckbox(key, false);
        showToast("This browser does not support notifications.");
        if (!savePrefs()) showToast("Could not save preferences — browser storage unavailable.");
        return;
      }
      if (!window.isSecureContext) {
        state.prefs[key] = false;
        syncNotifyCheckbox(key, false);
        showToast("Notifications need https or localhost — open the site over a secure connection.");
        if (!savePrefs()) showToast("Could not save preferences — browser storage unavailable.");
        return;
      }
      const permission = await requestNotificationPermission();
      if (permission !== "granted") {
        state.prefs[key] = false;
        syncNotifyCheckbox(key, false);
        showToast(permission === "denied"
          ? "Notifications are blocked for this site. Enable them in browser settings."
          : "Notification permission was not granted.");
        if (!savePrefs()) showToast("Could not save preferences — browser storage unavailable.");
        return;
      }
    }
    state.prefs[key] = true;
    syncNotifyCheckbox(key, true);
    if (!savePrefs()) showToast("Could not save preferences — browser storage unavailable.");
    import("./settings.js?v=202").then(({ syncSettingsNotifyStatus }) => syncSettingsNotifyStatus()).catch(() => {});
  };
  dom.prefsToggleBtn?.addEventListener("click", () => {
    setPrefsPanelOpen(!state.prefs.panelOpen);
  });
  dom.prefNotifyEnd?.addEventListener("change", () => {
    void persistPrefToggle("notifyEnd", dom.prefNotifyEnd.checked, true);
  });
  dom.prefNotifyBreak?.addEventListener("change", () => {
    void persistPrefToggle("notifyBreak", dom.prefNotifyBreak.checked, true);
  });
  dom.prefPomodoro?.addEventListener("change", () => {
    state.prefs.pomodoro = dom.prefPomodoro.checked === true;
    if (state.prefs.pomodoro) {
      state.prefs.pomodoroMinutes = fitBreakMinutesToFocus(state.prefs.pomodoroMinutes);
      applyPomodoroMinutesToDom(state.prefs.pomodoroMinutes);
    }
    syncPomodoroIntervalVisibility();
    if (state.prefs.pomodoro && dom.prefPomodoroMinutes) {
      if (!syncBreakFocusValidation()) {
        showToast("Break reminder must be shorter than your focus time.");
        dom.prefPomodoroMinutes.focus();
      } else {
        dom.prefPomodoroMinutes.focus();
      }
    }
    if (state.session) {
      if (!state.prefs.pomodoro) state.session.nextBreakSuggestionAt = null;
      else if (!state.session.currentBreakStartedAt) {
        rescheduleBreakSuggestionFromFocus(state.session, activeFocusSeconds(state.session));
      } else {
        initBreakSuggestionSchedule(state.session);
      }
    }
    if (!savePrefs()) showToast("Could not save preferences — browser storage unavailable.");
  });
  dom.prefPomodoroMinutes?.addEventListener("change", () => {
    const isCustom = dom.prefPomodoroMinutes.value === "custom";
    syncPomodoroCustomVisibility(isCustom);
    if (isCustom) {
      if (dom.prefPomodoroCustomMinutes && !String(dom.prefPomodoroCustomMinutes.value || "").trim()) {
        dom.prefPomodoroCustomMinutes.value = String(state.prefs.pomodoroMinutes || 30);
      }
      syncBreakFocusValidation();
      dom.prefPomodoroCustomMinutes?.focus();
      dom.prefPomodoroCustomMinutes?.select?.();
      return;
    }
    if (!syncBreakFocusValidation()) {
      showToast("Break reminder must be shorter than your focus time.");
      applyPomodoroMinutesToDom(state.prefs.pomodoroMinutes);
      return;
    }
    state.prefs.pomodoroMinutes = readPomodoroMinutesFromDom();
    applyPomodoroMinutesToDom(state.prefs.pomodoroMinutes);
    state.pomodoroNotifiedBucket = -1;
    if (state.session && !state.session.currentBreakStartedAt) {
      rescheduleBreakSuggestionFromFocus(state.session, activeFocusSeconds(state.session));
    } else if (state.session) {
      initBreakSuggestionSchedule(state.session);
    }
    if (!savePrefs()) showToast("Could not save preferences — browser storage unavailable.");
  });
  const commitPomodoroCustom = () => {
    if (dom.prefPomodoroMinutes?.value !== "custom") return;
    const typed = readPomodoroMinutesFromDom();
    if (!syncBreakFocusValidation()) {
      showToast("Custom break time must be shorter than your focus time.");
      if (dom.prefPomodoroCustomMinutes) dom.prefPomodoroCustomMinutes.value = String(typed);
      syncBreakFocusValidation();
      return;
    }
    state.prefs.pomodoroMinutes = typed;
    applyPomodoroMinutesToDom(state.prefs.pomodoroMinutes);
    state.pomodoroNotifiedBucket = -1;
    if (state.session && !state.session.currentBreakStartedAt) {
      rescheduleBreakSuggestionFromFocus(state.session, activeFocusSeconds(state.session));
    } else if (state.session) {
      initBreakSuggestionSchedule(state.session);
    }
    if (!savePrefs()) showToast("Could not save preferences — browser storage unavailable.");
  };
  dom.prefPomodoroCustomMinutes?.addEventListener("input", syncBreakFocusValidation);
  dom.prefPomodoroCustomMinutes?.addEventListener("change", commitPomodoroCustom);
  dom.prefPomodoroCustomMinutes?.addEventListener("blur", commitPomodoroCustom);
  dom.prefShowSetupGoal?.addEventListener("change", () => {
    state.prefs.showSetupGoal = dom.prefShowSetupGoal.checked;
    syncSetupWidgetVisibility();
    if (!savePrefs()) showToast("Could not save preferences — browser storage unavailable.");
  });
  dom.prefShowSetupHeatmap?.addEventListener("change", () => {
    state.prefs.showSetupHeatmap = dom.prefShowSetupHeatmap.checked;
    syncSetupWidgetVisibility();
    if (!savePrefs()) showToast("Could not save preferences — browser storage unavailable.");
  });
  dom.prefShowSetupTodos?.addEventListener("change", () => {
    state.prefs.showSetupTodos = dom.prefShowSetupTodos.checked;
    syncSetupWidgetVisibility();
    if (!savePrefs()) showToast("Could not save preferences — browser storage unavailable.");
  });
  dom.prefChimeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      state.prefs.chime = selectedChimeMode();
      syncChimeHint();
      if (!savePrefs()) showToast("Could not save preferences — browser storage unavailable.");
      // Preview unlocks AudioContext under this click so later timer sounds can play.
      if (state.prefs.chime !== "off") playChime();
      else void unlockAudio();
    });
  });
  // Warm audio on gestures / tab focus so timer cues are less likely to be blocked.
  const warmAudio = () => { void unlockAudio(); };
  document.addEventListener("pointerdown", warmAudio, true);
  document.addEventListener("keydown", warmAudio, true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.session) warmAudio();
  });
  dom.setupEditGoalsBtn?.addEventListener("click", () => {
    navigate("insights-screen");
    dom.goalDailySlider?.focus();
  });
  dom.setupHeatmapBtn?.addEventListener("click", () => {
    navigate("insights-screen");
    dom.heatmap?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  });
  const onHeatmapDayClick = (event) => {
    const cell = event.target.closest("button.heat-cell[data-day]");
    if (!cell) return;
    event.preventDefault();
    const day = cell.dataset.day;
    if (cell.dataset.level === "0") {
      showToast(`No activity on ${formatShortDate(day)}.`);
      return;
    }
    openHistoryForDay(day);
  };
  dom.heatmap?.addEventListener("click", onHeatmapDayClick);
  dom.setupHeatmap?.addEventListener("click", onHeatmapDayClick);
  const bindGoalEditor = (kind) => {
    const slider = kind === "daily" ? dom.goalDailySlider : dom.goalWeeklySlider;
    const hours = kind === "daily" ? dom.goalDailyHours : dom.goalWeeklyHours;
    const mins = kind === "daily" ? dom.goalDailyMins : dom.goalWeeklyMins;
    const onSlider = () => {
      syncGoalEditor(kind, Number(slider.value));
      markFocusGoalsEdited();
    };
    const onFieldsInput = () => {
      // Keep typed digits intact; only move the slider preview + show limit hint.
      markFocusGoalsEdited();
      syncGoalLimitHint(kind);
    };
    const onFieldsCommit = () => {
      syncGoalEditor(kind, readGoalMinutesFromDom(kind, { commit: true }));
      markFocusGoalsEdited();
      syncGoalLimitHint(kind);
    };
    slider?.addEventListener("input", onSlider);
    hours?.addEventListener("input", onFieldsInput);
    mins?.addEventListener("input", onFieldsInput);
    hours?.addEventListener("change", onFieldsCommit);
    mins?.addEventListener("change", onFieldsCommit);
    hours?.addEventListener("blur", onFieldsCommit);
    mins?.addEventListener("blur", onFieldsCommit);
  };
  bindGoalEditor("daily");
  bindGoalEditor("weekly");
  dom.resetWeekNowBtn?.addEventListener("click", confirmResetWeekNow);
  dom.saveFocusGoalsBtn?.addEventListener("click", saveFocusGoalsFromDom);
  bindWeekReportEvents();
  if (dom.focusGoalsOptions && !dom.focusGoalsOptions.childElementCount) {
    const menu = createNoteOptionsMenu([
      { label: "Restore default", onClick: restoreFocusGoalsDefault },
      { label: "Reset week now", onClick: confirmResetWeekNow },
      { label: "Download week card", onClick: downloadWeekCard }
    ]);
    const toggle = menu.querySelector(".note-options-toggle");
    if (toggle) {
      toggle.setAttribute("aria-label", "Focus goals options");
      toggle.title = "Focus goals options";
    }
    dom.focusGoalsOptions.append(menu);
  }
  if (dom.historyActions && !dom.historyActions.childElementCount) {
    const menu = createNoteOptionsMenu([
      { label: "Download spreadsheet", onClick: exportCsv },
      { label: "Delete session history", danger: true, onClick: clearHistory }
    ]);
    const toggle = menu.querySelector(".note-options-toggle");
    if (toggle) {
      toggle.setAttribute("aria-label", "History actions");
      toggle.title = "History actions";
    }
    dom.historyActions.append(menu);
  }
  dom.importJsonInput?.addEventListener("change", () => importJson(dom.importJsonInput.files?.[0]));
  dom.reportTopic.addEventListener("input",()=>{state.reportDirty=true;dom.reportSaveState.textContent="Unsaved changes";});
  dom.reportNoteInput?.addEventListener("input",()=>{
    if (String(dom.reportNoteInput.value || "").trim()) {
      state.reportDirty = true;
      dom.reportSaveState.textContent = "Unsaved draft";
    }
  });
  dom.reportNoteInput?.addEventListener("keydown",(e)=>{
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); addReportNote(); }
  });
  dom.reportAddNoteBtn?.addEventListener("click", addReportNote);
  document.querySelector("#report-save-btn").addEventListener("click",saveReportNotes);
  dom.notesNewBtn?.addEventListener("click", () => openNoteComposer());
  dom.notesNewGroupBtn?.addEventListener("click", () => promptNewNoteGroup());
  dom.notesSearch?.addEventListener("input", renderNotes);
  dom.notesScopeFilter?.addEventListener("change", onNotesScopeFilterChange);
  dom.notesGroupFilter?.addEventListener("change", renderNotes);
  dom.notesSessionPick?.addEventListener("change", onNotesSessionPickChange);
  dom.notesDateFromBtn?.addEventListener("click", () => openNotesDatePicker("from"));
  dom.notesDateToBtn?.addEventListener("click", () => openNotesDatePicker("to"));
  dom.notesClearFiltersBtn?.addEventListener("click", clearNotesFilters);
  dom.editNoteGroup?.addEventListener("change", onNoteGroupSelectChange);
  dom.noteGroupCancel?.addEventListener("click", () => closeNoteGroupDialog({ cancelled: true }));
  dom.noteGroupForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    submitNoteGroupDialog();
  });
  dom.noteGroupDialog?.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeNoteGroupDialog({ cancelled: true });
  });
  dom.endSessionCancel?.addEventListener("click", () => closeEndSessionDialog());
  dom.endSessionDiscard?.addEventListener("click", () => {
    closeEndSessionDialog();
    const focus = state.session ? Math.floor(activeFocusSeconds(state.session, Date.now())) : 0;
    finishSession("ended", focus < MIN_SAVED_FOCUS_SECONDS
      ? "Discarded because it was under one minute."
      : "Discarded by user.", true);
  });
  dom.endSessionSave?.addEventListener("click", () => {
    closeEndSessionDialog();
    finishSession("ended", "Ended early.", false);
  });
  dom.endSessionDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeEndSessionDialog();
  });
  dom.confirmDialog.addEventListener("close",()=>{const a=state.confirmAction;state.confirmAction=null;if(dom.confirmDialog.returnValue==="confirm"&&a)a();});
  dom.editCancel.addEventListener("click",()=>{state.editingId=null;dom.editDialog.close();});
  dom.editDelete.addEventListener("click",()=>{const id=state.editingId;state.editingId=null;dom.editDialog.close();if(id)deleteSession(id);});
  dom.editForm.addEventListener("submit",e=>{e.preventDefault();saveEdit();});
  dom.editOpenNotes?.addEventListener("click",()=>{
    if (!state.editingId) return;
    const id = state.editingId;
    openSessionNotesViewer(id);
  });
  dom.viewNotesClose?.addEventListener("click", closeSessionNotesViewer);
  dom.viewNotesCloseX?.addEventListener("click", closeSessionNotesViewer);
  dom.viewNotesDialog?.addEventListener("close", () => { state.viewingNotesId = null; });
  dom.viewNoteAdd?.addEventListener("click", addNoteToViewedSession);
  dom.viewNoteInput?.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); addNoteToViewedSession(); }
  });
  dom.viewNotesOpenTab?.addEventListener("click", () => {
    const id = state.viewingNotesId;
    if (id) openNotesFilteredToSession(id);
    else {
      closeSessionNotesViewer();
      navigate("notes-screen");
    }
  });
  dom.notesFilterClear?.addEventListener("click", clearNotesSessionFilter);
  dom.editNoteCancel?.addEventListener("click",()=>{state.editingNote=null;dom.editNoteDialog.close();});
  dom.editNoteDelete?.addEventListener("click",deleteEditedNote);
  dom.editNoteForm?.addEventListener("submit",(e)=>{e.preventDefault();saveEditedNote();});
  dom.editNoteForm?.addEventListener("keydown",(e)=>{
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      saveEditedNote();
    }
  });
  document.addEventListener("keydown",handleKeyboard);
  window.addEventListener("popstate",()=>navigate(screenMap[location.hash.slice(1)]||"setup-screen",true));
  window.addEventListener("hashchange",()=>navigate(screenMap[location.hash.slice(1)]||"setup-screen",true));
  window.addEventListener("resize",()=>{
    if(innerWidth>760)closeMenu();
    if(state.activeScreen==="insights-screen") renderInsights();
  });
  document.addEventListener("visibilitychange",()=>{if(!document.hidden&&state.session){requestWakeLock();tick();}});
  window.addEventListener("beforeunload",(e)=>{if(state.reportDirty){e.preventDefault();e.returnValue="";}if(state.session){safeWrite(ACTIVE_SESSION_KEY,state.session);}});
  dom.backToTop.addEventListener("click",()=>scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion:reduce)").matches?"auto":"smooth"}));
  window.addEventListener("scroll",()=>{const show=scrollY>500;dom.backToTop.classList.toggle("is-visible",show);dom.backToTop.tabIndex=show?0:-1;},{passive:true});
}

export function init() {
  loadData();initTheme();initCustomize();applyPrefsToDom();syncSettingsNotifyStatus();syncTagCustomVisibility();syncDurationChips();bindEvents();bindCustomizeEvents();bindLeaveCustomizeDialog();bindSettingsEvents();bindTodoEvents();initSync();
  try{dom.keyboardShortcuts.checked=localStorage.getItem("locked_in_keyboard_shortcuts")!=="false";}catch(_){}
  dom.keyboardShortcuts.addEventListener("change",()=>{try{localStorage.setItem("locked_in_keyboard_shortcuts",String(dom.keyboardShortcuts.checked));}catch(_){}});
  dom.currentYear.textContent=new Date().getFullYear();
  const initial=screenMap[location.hash.slice(1)]||"setup-screen";
  navigate(initial,true);
  // Avoid renderAll() on boot — navigate already paints the active screen.
  // Cross-tab sync still calls renderAll() when data changes.
  restoreActiveSession();
  try{localStorage.setItem("locked_in_app_version","3.1.1");}catch(_){}
}
