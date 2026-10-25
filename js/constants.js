/** Locked-In constants — storage keys and limits. */
/** Keep in sync with sw.js ASSET_V (npm run assets:bump / assets:verify). */
export const APP_ASSET_V = "187";
export const HISTORY_KEY = "locked_in_history_v2";
export const LEGACY_HISTORY_KEYS = ["focusforge_history_v1", "locked-in-history"];
export const ACTIVE_SESSION_KEY = "locked_in_active_session_v2";
export const THEME_KEY = "locked_in_theme";
export const NOTES_INBOX_KEY = "locked_in_notes_inbox_v1";
export const NOTE_GROUPS_KEY = "locked_in_note_groups_v1";
export const MAX_NOTE_GROUPS = 40;
export const PREFS_KEY = "locked_in_prefs_v1";
export const RECENT_GOALS_KEY = "locked_in_recent_goals_v1";
export const FOCUS_GOALS_KEY = "locked_in_focus_goals_v1";
export const WEEK_REPORTS_KEY = "locked_in_week_reports_v1";
export const CUSTOMIZE_KEY = "locked_in_customize_v1";
export const USER_THEMES_KEY = "locked_in_user_themes_v1";
export const MAX_USER_THEMES = 12;
export const TODOS_KEY = "locked_in_todos_v1";
export const MAX_WEEK_REPORTS = 52;
export const MAX_SVG_BYTES = 50 * 1024;
export const MAX_TODO_LISTS = 40;
export const MAX_TODO_TASKS = 500;
export const MAX_TODO_STEPS = 20;
export const MAX_HISTORY = 1000;
export const BREAK_REMINDER_MS = 5 * 60 * 1000;
/** Suggest-breaks reminder presets (minutes). Other values use Custom. */
export const POMODORO_MINUTE_OPTIONS = [30, 45, 60];
export const DEFAULT_POMODORO_MINUTES = 30;
export const POMODORO_CUSTOM_MIN = 5;
export const POMODORO_CUSTOM_MAX = 180;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const HARDCORE_BREAK_LIMIT_SECONDS = 15 * 60;
export const MIN_SAVED_FOCUS_SECONDS = 60;
export const CHANNEL_NAME = "locked-in-sync-v1";

/** Daily max 12h; weekly max 12h × 7 days = 84h (minutes). */
export const GOAL_LIMITS = {
  daily: { min: 15, max: 720, sliderMax: 720, step: 15 },
  weekly: { min: 30, max: 5040, sliderMax: 5040, step: 30 }
};
