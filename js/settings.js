/** Settings screen — backup, delete, and about. Preferences live on Timer. */
import {
  ACTIVE_SESSION_KEY,
  CUSTOMIZE_KEY,
  FOCUS_GOALS_KEY,
  HISTORY_KEY,
  LEGACY_HISTORY_KEYS,
  NOTE_GROUPS_KEY,
  NOTES_INBOX_KEY,
  PREFS_KEY,
  RECENT_GOALS_KEY,
  THEME_KEY,
  TODOS_KEY,
  USER_THEMES_KEY,
  WEEK_REPORTS_KEY
} from "./constants.js?v=207";
import { dom } from "./runtime.js?v=207";
import { showToast } from "./toast.js?v=207";
import { askConfirm, navigate } from "./theme-nav.js?v=207";
import { setPrefsPanelOpen } from "./setup.js?v=207";
import { requestNotificationPermission } from "./session.js?v=207";

export const DEFAULT_PREFS = {
  notifyEnd: false,
  notifyBreak: false,
  pomodoro: false,
  pomodoroMinutes: 30,
  chime: "soft",
  panelOpen: false,
  showSetupGoal: true,
  showSetupHeatmap: true,
  showSetupTodos: true,
  setupTodosSource: "focus"
};

function notificationPermissionLabel() {
  if (!("Notification" in window)) return "Notifications are not supported in this browser.";
  if (!window.isSecureContext) return "Notifications need https or localhost.";
  const p = Notification.permission;
  if (p === "granted") return "Browser notifications: allowed.";
  if (p === "denied") return "Browser notifications: blocked. Enable them in browser settings.";
  return "Browser notifications: not decided yet.";
}

export function syncSettingsNotifyStatus() {
  if (dom.settingsNotifyStatus) {
    dom.settingsNotifyStatus.textContent = notificationPermissionLabel();
  }
  if (dom.settingsNotifyPermitBtn) {
    const granted = ("Notification" in window) && window.isSecureContext && Notification.permission === "granted";
    const unsupported = !("Notification" in window) || !window.isSecureContext;
    dom.settingsNotifyPermitBtn.hidden = granted || unsupported;
    dom.settingsNotifyPermitBtn.disabled = unsupported;
  }
}

export function renderSettings() {}

function removeStorageKey(key) {
  try { localStorage.removeItem(key); } catch (_) {}
}

export function eraseEverything() {
  askConfirm(
    "Wipe all Locked-In data?",
    "This factory-resets Locked-In on this browser — sessions, notes, to-dos, themes, preferences, and customize data. Export a backup first if you want to keep anything. This cannot be undone.",
    () => {
      const keys = [
        HISTORY_KEY,
        ...LEGACY_HISTORY_KEYS,
        ACTIVE_SESSION_KEY,
        NOTES_INBOX_KEY,
        NOTE_GROUPS_KEY,
        PREFS_KEY,
        RECENT_GOALS_KEY,
        FOCUS_GOALS_KEY,
        WEEK_REPORTS_KEY,
        CUSTOMIZE_KEY,
        USER_THEMES_KEY,
        TODOS_KEY,
        THEME_KEY,
        "locked_in_last_screen",
        "locked_in_notify_end",
        "locked_in_notify_break",
        "locked_in_chime_mode"
      ];
      keys.forEach(removeStorageKey);
      showToast("All local data wiped. Reloading…");
      window.setTimeout(() => {
        location.hash = "#setup";
        location.reload();
      }, 500);
    },
    "Wipe all data"
  );
}

async function historyApi() {
  return import("./history.js?v=207");
}

export function bindSettingsEvents() {
  dom.setupOpenSettingsBtn?.addEventListener("click", () => navigate("settings-screen"));
  dom.settingsExportBtn?.addEventListener("click", async () => {
    const { exportJson } = await historyApi();
    exportJson();
  });
  dom.settingsImportBtn?.addEventListener("click", () => dom.importJsonInput?.click());
  dom.settingsCsvBtn?.addEventListener("click", async () => {
    const { exportCsv } = await historyApi();
    exportCsv();
  });
  dom.settingsClearHistoryBtn?.addEventListener("click", async () => {
    const { clearHistory } = await historyApi();
    clearHistory();
  });
  dom.settingsEraseAllBtn?.addEventListener("click", eraseEverything);
  dom.settingsNotifyPermitBtn?.addEventListener("click", async () => {
    const permission = await requestNotificationPermission();
    syncSettingsNotifyStatus();
    if (permission === "granted") showToast("Notifications allowed.");
    else if (permission === "denied") showToast("Notifications are blocked for this site.");
    else showToast("Notification permission was not granted.");
  });
  dom.goalWeekStartsOn?.addEventListener("change", () => {
    import("./setup.js?v=207").then(({ saveFocusGoalsWeekStartsOn }) => saveFocusGoalsWeekStartsOn());
  });
}

/** Open Timer preferences and focus break settings. */
export function openSettingsForBreaks() {
  navigate("setup-screen");
  queueMicrotask(() => {
    setPrefsPanelOpen(true);
    syncSettingsNotifyStatus();
    const target = dom.prefPomodoroCustomMinutes?.offsetParent
      ? dom.prefPomodoroCustomMinutes
      : dom.prefPomodoroMinutes || dom.prefPomodoro;
    target?.focus?.();
    target?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  });
}
