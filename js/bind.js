import { ACTIVE_SESSION_KEY, MIN_SAVED_FOCUS_SECONDS } from "./constants.js?v=76";
import { dom, state, tabId } from "./runtime.js?v=76";
import { safeRead, safeWrite } from "./storage.js?v=76";
import { showToast } from "./toast.js?v=76";
import { normalizePomodoroMinutes } from "./utils.js?v=76";
import { initSync } from "./sync.js?v=76";
import { closeMenu, closeThemePopover, initTheme, navigate, screenMap, toggleMenu } from "./theme-nav.js?v=76";
import { applyPrefsToDom, loadData, readGoalMinutesFromDom, renderSetup, resetSetupFormDefaults, saveFocusGoalsFromDom, savePrefs, selectedChimeMode, setPrefsPanelOpen, syncChimeHint, syncGoalEditor, syncHardcoreHint, syncPomodoroIntervalVisibility, syncSetupWidgetVisibility, syncTagCustomVisibility } from "./setup.js?v=76";
import { activeFocusSeconds, addStickyNote, closeEndSessionDialog, finishSession, requestNotificationPermission, requestWakeLock, restoreActiveSession, setStickyNotesOpen, setStickyState, startSession, startTimerLoop, stopSession, tick, toggleBreak } from "./session.js?v=76";
import { addNoteToViewedSession, addReportNote, clearHistory, clearHistoryFilters, closeSessionNotesViewer, deleteSession, exportCsv, exportJson, importJson, initDatePickers, initHistoryTableScrollHint, openNotesFilteredToSession, openSessionNotesViewer, renderHistory, saveEdit, saveReportNotes, syncHistoryTableScroll } from "./history.js?v=76";
import { downloadWeekCard, renderInsights } from "./insights.js?v=76";
import { addInboxNote, clearNotesSessionFilter, closeOpenNoteMenus, deleteEditedNote, renderNotes, saveEditedNote } from "./notes.js?v=76";

export function renderAll(){renderSetup();renderHistory();renderInsights();renderNotes();}

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
    if(dom.editNoteDialog?.open){dom.editNoteDialog.close();state.editingNote=null;return;}
    if(dom.confirmDialog.open){dom.confirmDialog.close("cancel");return;}
  }
  if(typing||e.altKey||e.ctrlKey||e.metaKey)return;
  if(dom.endSessionDialog?.open||dom.confirmDialog.open)return;
  if(!state.session||state.readOnly||!dom.keyboardShortcuts.checked)return;
  if(e.key.toLowerCase()==="b"){e.preventDefault();toggleBreak();}
  if(e.key.toLowerCase()==="s"){e.preventDefault();stopSession();}
}

export function bindEvents() {
  dom.menuToggle.addEventListener("click",toggleMenu);
  dom.navLinks.forEach(link=>link.addEventListener("click",()=>navigate(link.dataset.screen)));
  dom.setupForm.addEventListener("submit",startSession);
  dom.durationPreset.addEventListener("change",()=>{const custom=dom.durationPreset.value==="custom";dom.customDuration.classList.toggle("is-hidden",!custom);dom.customDuration.setAttribute("aria-hidden",String(!custom));if(custom)dom.customHours.focus();});
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
  dom.newSessionBtn.addEventListener("click",()=>{dom.taskIntent.value="";navigate("setup-screen");dom.taskIntent.focus();});
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
  };
  dom.prefsToggleBtn?.addEventListener("click", () => {
    setPrefsPanelOpen(!state.prefs.panelOpen);
    if (!savePrefs()) showToast("Could not save preferences — browser storage unavailable.");
  });
  dom.prefNotifyEnd?.addEventListener("change", () => {
    void persistPrefToggle("notifyEnd", dom.prefNotifyEnd.checked, true);
  });
  dom.prefNotifyBreak?.addEventListener("change", () => {
    void persistPrefToggle("notifyBreak", dom.prefNotifyBreak.checked, true);
  });
  dom.prefPomodoro?.addEventListener("change", () => {
    state.prefs.pomodoro = dom.prefPomodoro.checked;
    syncPomodoroIntervalVisibility();
    if (state.prefs.pomodoro && dom.prefPomodoroMinutes) {
      state.prefs.pomodoroMinutes = normalizePomodoroMinutes(dom.prefPomodoroMinutes.value);
      dom.prefPomodoroMinutes.focus();
    }
    if (!savePrefs()) showToast("Could not save preferences — browser storage unavailable.");
  });
  dom.prefPomodoroMinutes?.addEventListener("change", () => {
    state.prefs.pomodoroMinutes = normalizePomodoroMinutes(dom.prefPomodoroMinutes.value);
    if (dom.prefPomodoroMinutes) dom.prefPomodoroMinutes.value = String(state.prefs.pomodoroMinutes);
    state.pomodoroNotifiedBucket = -1;
    if (!savePrefs()) showToast("Could not save preferences — browser storage unavailable.");
  });
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
  dom.prefChimeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      state.prefs.chime = selectedChimeMode();
      syncChimeHint();
      if (!savePrefs()) showToast("Could not save preferences — browser storage unavailable.");
    });
  });
  dom.setupEditGoalsBtn?.addEventListener("click", () => {
    navigate("insights-screen");
    dom.goalDailySlider?.focus();
  });
  dom.setupHeatmapBtn?.addEventListener("click", () => {
    navigate("insights-screen");
    dom.heatmap?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  });
  const bindGoalEditor = (kind) => {
    const slider = kind === "daily" ? dom.goalDailySlider : dom.goalWeeklySlider;
    const hours = kind === "daily" ? dom.goalDailyHours : dom.goalWeeklyHours;
    const mins = kind === "daily" ? dom.goalDailyMins : dom.goalWeeklyMins;
    const onSlider = () => {
      syncGoalEditor(kind, Number(slider.value));
    };
    const onFields = () => {
      syncGoalEditor(kind, readGoalMinutesFromDom(kind));
    };
    slider?.addEventListener("input", onSlider);
    hours?.addEventListener("input", onFields);
    mins?.addEventListener("input", onFields);
    hours?.addEventListener("change", onFields);
    mins?.addEventListener("change", onFields);
  };
  bindGoalEditor("daily");
  bindGoalEditor("weekly");
  dom.saveFocusGoalsBtn?.addEventListener("click", saveFocusGoalsFromDom);
  dom.shareWeekCardBtn?.addEventListener("click", downloadWeekCard);
  dom.exportCsvBtn.addEventListener("click",exportCsv);dom.exportJsonBtn.addEventListener("click",exportJson);dom.importJsonInput.addEventListener("change",()=>importJson(dom.importJsonInput.files?.[0]));dom.clearHistoryBtn.addEventListener("click",clearHistory);
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
  dom.noteCaptureForm.addEventListener("submit",e=>{e.preventDefault();addInboxNote();});dom.notesSearch.addEventListener("input",renderNotes);
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
  loadData();initTheme();applyPrefsToDom();syncTagCustomVisibility();bindEvents();initSync();
  try{dom.keyboardShortcuts.checked=localStorage.getItem("locked_in_keyboard_shortcuts")!=="false";}catch(_){}
  dom.keyboardShortcuts.addEventListener("change",()=>{try{localStorage.setItem("locked_in_keyboard_shortcuts",String(dom.keyboardShortcuts.checked));}catch(_){}});
  dom.currentYear.textContent=new Date().getFullYear();
  const initial=screenMap[location.hash.slice(1)]||"setup-screen";
  navigate(initial,true);
  renderAll();
  restoreActiveSession();
  try{localStorage.setItem("locked_in_app_version","3.1.1");}catch(_){}
}
