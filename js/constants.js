/** Locked-In constants — storage keys and limits. */
export const HISTORY_KEY = "locked_in_history_v2";
export const LEGACY_HISTORY_KEYS = ["focusforge_history_v1", "locked-in-history"];
export const ACTIVE_SESSION_KEY = "locked_in_active_session_v2";
export const THEME_KEY = "locked_in_theme";
export const NOTES_INBOX_KEY = "locked_in_notes_inbox_v1";
export const PREFS_KEY = "locked_in_prefs_v1";
export const RECENT_GOALS_KEY = "locked_in_recent_goals_v1";
export const FOCUS_GOALS_KEY = "locked_in_focus_goals_v1";
export const MAX_HISTORY = 1000;
export const BREAK_REMINDER_MS = 5 * 60 * 1000;
export const POMODORO_MINUTE_OPTIONS = [15, 20, 25, 30, 45, 60];
export const DEFAULT_POMODORO_MINUTES = 25;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const HARDCORE_BREAK_LIMIT_SECONDS = 15 * 60;
export const MIN_SAVED_FOCUS_SECONDS = 60;
export const CHANNEL_NAME = "locked-in-sync-v1";

export const GOAL_LIMITS = {
  daily: { min: 15, max: 1440, sliderMax: 720, step: 15 },
  weekly: { min: 30, max: 10080, sliderMax: 2520, step: 30 }
};
