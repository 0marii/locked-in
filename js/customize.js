/** Customize pack: colors, fonts, nav SVG icons, export/import. */
import { CUSTOMIZE_KEY, MAX_SVG_BYTES, MAX_USER_THEMES, THEME_KEY, USER_THEMES_KEY } from "./constants.js?v=187";
import { dom, state } from "./runtime.js?v=187";
import { safeRead, safeWrite } from "./storage.js?v=187";
import { showToast } from "./toast.js?v=187";
import { download } from "./utils.js?v=187";

export const COLOR_ROLES = ["bg", "surface", "text", "accent", "navBg", "navText"];
export const NAV_ICON_KEYS = ["setup", "history", "insights", "notes", "todos", "customize", "settings"];

export const DEFAULT_SETTINGS_NAV_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;

/**
 * Suggested themes adapted from Adobe Color explore (community dark / mood palettes).
 * https://color.adobe.com/explore
 */
export const SUGGESTED_THEMES = [
  {
    id: "rose-villa",
    name: "Rose Villa",
    source: "Rose Villa Beluno V1 Dark",
    swatches: ["#bf8f98", "#363540", "#232226", "#98a6a1", "#f2af88"],
    colors: { bg: "#232226", surface: "#363540", text: "#f5ede8", accent: "#f2af88" }
  },
  {
    id: "sanctuary",
    name: "Sanctuary",
    source: "Sanctuary - Dark",
    swatches: ["#1a2625", "#838c7d", "#a197a6", "#59574c", "#e8e6e0"],
    colors: { bg: "#1a2625", surface: "#243330", text: "#e8e6e0", accent: "#838c7d" }
  },
  {
    id: "abyss",
    name: "Abyss",
    source: "dark theme_ai",
    swatches: ["#060e26", "#091740", "#223773", "#1d4259", "#1f8c81"],
    colors: { bg: "#060e26", surface: "#091740", text: "#e6f2f0", accent: "#1f8c81" }
  },
  {
    id: "sepia",
    name: "Sepia",
    source: "Dark Sepia",
    swatches: ["#272223", "#5b4d4e", "#8e827e", "#a89c99", "#d9d0ca"],
    colors: { bg: "#272223", surface: "#3a3233", text: "#d9d0ca", accent: "#a89c99" }
  },
  {
    id: "leaf",
    name: "Leaf",
    source: "leaf dark",
    swatches: ["#262015", "#4f5928", "#7c8c3f", "#bbbf3b", "#e8ead0"],
    colors: { bg: "#262015", surface: "#2f2c1c", text: "#e8ead0", accent: "#bbbf3b" }
  },
  {
    id: "gilded",
    name: "Gilded",
    source: "Gold bathroom dark",
    swatches: ["#413a31", "#592f00", "#a76714", "#f0b86c", "#f0e6bc"],
    colors: { bg: "#413a31", surface: "#4a4038", text: "#f0e6bc", accent: "#f0b86c" }
  }
];

export const FONT_FAMILIES = {
  system: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: 'Georgia, "Times New Roman", Times, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  georgia: 'Georgia, "Times New Roman", serif',
  verdana: 'Verdana, Geneva, sans-serif',
  trebuchet: '"Trebuchet MS", "Segoe UI", sans-serif',
  courier: '"Courier New", Courier, monospace'
};

const COLOR_VARS = [
  ["bg", "--bg"],
  ["surface", "--surface"],
  ["surfaceRaised", "--surface-raised"],
  ["surfaceSoft", "--surface-soft"],
  ["text", "--text"],
  ["textMuted", "--text-muted"],
  ["textSubtle", "--text-subtle"],
  ["border", "--border"],
  ["accent", "--accent"],
  ["accentStrong", "--accent-strong"],
  ["accentInk", "--accent-ink"],
  ["navBg", "--nav-bg"],
  ["navSurface", "--nav-surface"],
  ["navText", "--nav-text"],
  ["navTextMuted", "--nav-text-muted"]
];

const ROLE_LABELS = {
  bg: "Page",
  surface: "Cards",
  text: "Text",
  accent: "Accent",
  navBg: "Nav bar",
  navText: "Nav text"
};

const SAFE_SVG_TAGS = new Set([
  "svg", "g", "path", "circle", "rect", "ellipse", "line", "polyline", "polygon",
  "defs", "clipPath", "use", "title", "desc", "linearGradient", "radialGradient", "stop"
]);

let activeColorRole = "accent";
let wheelBuilt = false;
let wheelValue = 1; // HSV value (brightness), 0–1

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "").trim();
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return Number.isFinite(r + g + b) ? { r, g, b } : null;
  }
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return Number.isFinite(r + g + b) ? { r, g, b } : null;
}

function rgbToHex(r, g, b) {
  const to = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** HSV → RGB (canvas putImageData needs RGB). From standard cylindrical HSV mapping. */
function hsvToRgb(h, s, v) {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp01(s);
  const val = clamp01(v);
  const c = val * sat;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = val - c;
  let r = 0, g = 0, b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  };
}

function hsvToHex(h, s, v) {
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

export function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const lin = [rgb.r, rgb.g, rgb.b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  if (!A || !B) return a;
  return rgbToHex(
    A.r + (B.r - A.r) * t,
    A.g + (B.g - A.g) * t,
    A.b + (B.b - A.b) * t
  );
}

function darken(hex, amount = 0.14) {
  return mixHex(hex, "#000000", amount);
}

function lighten(hex, amount = 0.12) {
  return mixHex(hex, "#ffffff", amount);
}

export function pickInk(bgHex) {
  return relativeLuminance(bgHex) > 0.45 ? "#1a1a1a" : "#f5f5f5";
}

export function defaultPack() {
  return {
    version: 1,
    mode: "preset",
    colors: {
      bg: null,
      surface: null,
      surfaceRaised: null,
      surfaceSoft: null,
      text: null,
      textMuted: null,
      textSubtle: null,
      border: null,
      accent: null,
      accentStrong: null,
      accentInk: null,
      navBg: null,
      navSurface: null,
      navText: null,
      navTextMuted: null
    },
    font: { family: "system", color: null },
    icons: {
      setup: null,
      history: null,
      insights: null,
      notes: null,
      todos: null,
      customize: null
    }
  };
}

function normalizePack(raw) {
  const base = defaultPack();
  if (!raw || typeof raw !== "object") return base;
  const colors = { ...base.colors, ...(raw.colors || {}) };
  const icons = { ...base.icons };
  NAV_ICON_KEYS.forEach((key) => {
    const v = raw.icons?.[key];
    icons[key] = typeof v === "string" && v.trim() ? v : null;
  });
  const family = String(raw.font?.family || "system");
  return {
    version: 1,
    mode: raw.mode === "custom" ? "custom" : "preset",
    colors,
    font: {
      family: FONT_FAMILIES[family] ? family : "system",
      color: typeof raw.font?.color === "string" ? raw.font.color : null
    },
    icons
  };
}

export function loadCustomizePack() {
  const pack = normalizePack(safeRead(CUSTOMIZE_KEY, null));
  state.customizePack = pack;
  return pack;
}

export function saveCustomizePack(pack = state.customizePack) {
  const next = normalizePack(pack);
  state.customizePack = next;
  const ok = safeWrite(CUSTOMIZE_KEY, next);
  if (!ok) showToast("Could not save customize settings — browser storage unavailable.");
  return ok;
}

export function clearCustomCssVars() {
  const root = document.documentElement;
  COLOR_VARS.forEach(([, cssVar]) => root.style.removeProperty(cssVar));
  root.style.removeProperty("--font");
  root.style.removeProperty("color-scheme");
}

/** Keep native controls (selects, inputs) in sync with a custom page background. */
export function syncDocumentColorScheme(bgHex) {
  const root = document.documentElement;
  const hex = String(bgHex || "").trim();
  if (!hex || !hexToRgb(hex)) {
    root.style.removeProperty("color-scheme");
    return;
  }
  root.style.colorScheme = relativeLuminance(hex) > 0.45 ? "light" : "dark";
}

/** Lift/sink surface away from the page background so cards stay visible. */
function surfaceFromBg(bg) {
  const lum = relativeLuminance(bg);
  // Light pages → brighter/white cards. Dark pages → clearly lighter panels.
  return lum > 0.5 ? mixHex(bg, "#ffffff", 0.72) : lighten(bg, 0.14);
}

function surfacesTooClose(bg, surface) {
  if (!bg || !surface) return false;
  return Math.abs(relativeLuminance(bg) - relativeLuminance(surface)) < 0.045;
}

function deriveColors(colors) {
  const next = { ...colors };
  if (next.bg && !next.surface) next.surface = surfaceFromBg(next.bg);
  if (next.surface && !next.surfaceRaised) {
    next.surfaceRaised = relativeLuminance(next.surface) > 0.5
      ? mixHex(next.surface, "#ffffff", 0.35)
      : lighten(next.surface, 0.1);
  } else if (next.bg && !next.surfaceRaised) {
    next.surfaceRaised = lighten(next.bg, relativeLuminance(next.bg) > 0.5 ? 0.55 : 0.2);
  }
  if (next.surface && !next.surfaceSoft) {
    next.surfaceSoft = relativeLuminance(next.surface) > 0.5
      ? darken(next.surface, 0.06)
      : lighten(next.surface, 0.05);
  } else if (next.bg && !next.surfaceSoft) {
    next.surfaceSoft = lighten(next.bg, relativeLuminance(next.bg) > 0.5 ? 0.35 : 0.1);
  }
  if (next.bg && !next.border) {
    next.border = relativeLuminance(next.bg) > 0.5
      ? darken(next.bg, 0.16)
      : lighten(next.bg, 0.22);
  }
  if (next.text && !next.textMuted) next.textMuted = mixHex(next.text, next.bg || "#808080", 0.35);
  if (next.text && !next.textSubtle) next.textSubtle = mixHex(next.text, next.bg || "#808080", 0.5);
  if (next.accent && !next.accentStrong) next.accentStrong = darken(next.accent, 0.16);
  if (next.accent && !next.accentInk) next.accentInk = pickInk(next.accent);
  if (next.navBg && !next.navSurface) {
    next.navSurface = relativeLuminance(next.navBg) > 0.5
      ? darken(next.navBg, 0.08)
      : lighten(next.navBg, 0.1);
  }
  if (next.navText && !next.navTextMuted) {
    next.navTextMuted = mixHex(
      next.navText,
      next.navBg || next.bg || "#808080",
      0.42
    );
  }
  return next;
}

export function applyCustomizePack(pack = state.customizePack) {
  const p = normalizePack(pack || loadCustomizePack());
  state.customizePack = p;
  clearCustomCssVars();
  const root = document.documentElement;

  if (p.mode === "custom") {
    const colors = deriveColors(p.colors);
    COLOR_VARS.forEach(([key, cssVar]) => {
      if (colors[key]) root.style.setProperty(cssVar, colors[key]);
    });
    if (p.font.color) root.style.setProperty("--text", p.font.color);
    syncDocumentColorScheme(colors.bg || colors.surface);
  }

  const stack = FONT_FAMILIES[p.font.family] || FONT_FAMILIES.system;
  if (p.mode === "custom" || p.font.family !== "system") {
    root.style.setProperty("--font", stack);
  }

  applyNavIcons(p.icons);
  syncCustomizeForm(p);
  document.dispatchEvent(new CustomEvent("locked-in:customize-mode"));

  const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg || "#101310");
}

export function applyNavIcons(icons = state.customizePack?.icons) {
  const map = icons || {};
  document.querySelectorAll("[data-nav-icon]").forEach((el) => {
    const key = el.dataset.navIcon;
    const svg = map[key];
    if (svg) {
      el.innerHTML = svg;
      el.hidden = false;
    } else if (key === "settings") {
      el.innerHTML = DEFAULT_SETTINGS_NAV_ICON;
      el.hidden = false;
    } else {
      el.replaceChildren();
      el.hidden = true;
    }
  });
  syncIconPreviews(map);
}

export function syncCustomizeSaveReminder(needsSave = state.customizeNeedsSave) {
  const on = Boolean(needsSave);
  state.customizeNeedsSave = on;
  const el = dom.customizeSaveReminder;
  if (el) {
    el.hidden = !on;
    el.classList.toggle("is-hidden", !on);
  }
  dom.customizeSaveThemeBtn?.classList.toggle("is-needs-save", on);
  return on;
}

const PRESET_THEME_IDS = ["dark", "light", "forest", "violet", "pink", "blue"];

function captureCustomizeRestorePoint() {
  if (state.customizeRestore) return;
  const pack = state.customizePack || loadCustomizePack();
  const packSnap = snapshotPack(pack);
  const base = document.documentElement.dataset.theme;
  if (state.activeUserThemeId) {
    state.customizeRestore = { kind: "user", id: state.activeUserThemeId, pack: packSnap };
    return;
  }
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (_) {}
  if (saved === "custom" || pack?.mode === "custom") {
    state.customizeRestore = {
      kind: "custom",
      pack: packSnap,
      baseTheme: PRESET_THEME_IDS.includes(base) ? base : "dark"
    };
    return;
  }
  const theme = PRESET_THEME_IDS.includes(saved)
    ? saved
    : (PRESET_THEME_IDS.includes(base) ? base : "dark");
  state.customizeRestore = { kind: "preset", theme, pack: packSnap };
}

export function clearCustomizeRestorePoint() {
  state.customizeRestore = null;
}

/** Revert Customize edits to the theme that was active when editing began. */
export function restoreCustomizeBeforeEdits() {
  const restore = state.customizeRestore;
  state.customizeRestore = null;
  setCustomizeNeedsSave(false);

  if (!restore) {
    const base = PRESET_THEME_IDS.includes(document.documentElement.dataset.theme)
      ? document.documentElement.dataset.theme
      : "dark";
    document.documentElement.dataset.theme = base;
    switchToPresetTheme();
    try { localStorage.setItem(THEME_KEY, base); } catch (_) {}
    document.dispatchEvent(new CustomEvent("locked-in:customize-mode"));
    return { kind: "preset", theme: base };
  }

  if (restore.kind === "user" && restore.id) {
    if (applyUserTheme(restore.id)) {
      document.dispatchEvent(new CustomEvent("locked-in:customize-mode"));
      return { kind: "user", id: restore.id };
    }
    document.documentElement.dataset.theme = "dark";
    switchToPresetTheme();
    try { localStorage.setItem(THEME_KEY, "dark"); } catch (_) {}
    document.dispatchEvent(new CustomEvent("locked-in:customize-mode"));
    return { kind: "preset", theme: "dark" };
  }

  if (restore.kind === "custom" && restore.pack) {
    const base = PRESET_THEME_IDS.includes(restore.baseTheme) ? restore.baseTheme : "dark";
    document.documentElement.dataset.theme = base;
    const pack = normalizePack({
      version: 1,
      mode: "custom",
      colors: restore.pack.colors,
      font: restore.pack.font,
      icons: restore.pack.icons
    });
    pack.colors = { ...pack.colors, ...deriveColors(pack.colors) };
    state.activeUserThemeId = null;
    state.customizePack = pack;
    saveCustomizePack(pack);
    applyCustomizePack(pack);
    try { localStorage.setItem(THEME_KEY, "custom"); } catch (_) {}
    syncCustomizeForm(pack);
    document.dispatchEvent(new CustomEvent("locked-in:customize-mode"));
    return { kind: "custom" };
  }

  const theme = PRESET_THEME_IDS.includes(restore.theme) ? restore.theme : "dark";
  document.documentElement.dataset.theme = theme;
  const presetPack = normalizePack({
    version: 1,
    mode: "preset",
    colors: restore.pack?.colors || {},
    font: restore.pack?.font || { family: "system", color: null },
    icons: restore.pack?.icons || {}
  });
  Object.keys(presetPack.colors).forEach((key) => { presetPack.colors[key] = null; });
  presetPack.font.color = null;
  state.activeUserThemeId = null;
  state.customizePack = presetPack;
  saveCustomizePack(presetPack);
  clearCustomCssVars();
  applyNavIcons(presetPack.icons);
  const stack = FONT_FAMILIES[presetPack.font.family] || FONT_FAMILIES.system;
  if (presetPack.font.family !== "system") document.documentElement.style.setProperty("--font", stack);
  else document.documentElement.style.removeProperty("--font");
  try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
  syncCustomizeForm(presetPack);
  document.dispatchEvent(new CustomEvent("locked-in:customize-mode"));
  return { kind: "preset", theme };
}

export function setCustomizeNeedsSave(needsSave, { toast = false } = {}) {
  const was = Boolean(state.customizeNeedsSave);
  const next = Boolean(needsSave);
  syncCustomizeSaveReminder(next);
  if (!next) clearCustomizeRestorePoint();
  if (next && !was && toast) {
    showToast("Save to My Themes — or export — or switching themes can lose these edits.");
  }
  return next;
}

export function enterCustomMode({ remind = true } = {}) {
  // Snapshot the prior theme before detaching from a named/preset look.
  if (remind && !state.customizeNeedsSave) captureCustomizeRestorePoint();
  const pack = state.customizePack || loadCustomizePack();
  pack.mode = "custom";
  state.customizePack = pack;
  // Edits detach from a named theme until the user saves again.
  if (state.activeUserThemeId) {
    state.activeUserThemeId = null;
    try {
      const saved = localStorage.getItem(THEME_KEY) || "";
      if (saved.startsWith("user:")) localStorage.setItem(THEME_KEY, "custom");
    } catch (_) {}
    document.dispatchEvent(new CustomEvent("locked-in:customize-mode"));
  }
  if (remind) setCustomizeNeedsSave(true, { toast: true });
}

export function userThemeKey(id) {
  return `user:${id}`;
}

export function parseUserThemeKey(value) {
  const raw = String(value || "");
  if (!raw.startsWith("user:")) return null;
  const id = raw.slice(5);
  return id || null;
}

function snapshotPack(pack = state.customizePack) {
  const p = normalizePack(pack || loadCustomizePack());
  return {
    colors: { ...p.colors },
    font: { family: p.font.family, color: p.font.color },
    icons: { ...p.icons }
  };
}

function normalizeUserTheme(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name || "").trim().slice(0, 40);
  const id = String(raw.id || "").trim();
  if (!name || !id) return null;
  const pack = normalizePack({
    version: 1,
    mode: "custom",
    colors: raw.pack?.colors || raw.colors || {},
    font: raw.pack?.font || raw.font || {},
    icons: raw.pack?.icons || raw.icons || {}
  });
  return {
    id,
    name,
    pack: snapshotPack(pack),
    updatedAt: raw.updatedAt || new Date().toISOString()
  };
}

export function loadUserThemes() {
  const raw = safeRead(USER_THEMES_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeUserTheme).filter(Boolean).slice(0, MAX_USER_THEMES);
}

export function saveUserThemes(list) {
  const next = (Array.isArray(list) ? list : []).map(normalizeUserTheme).filter(Boolean).slice(0, MAX_USER_THEMES);
  const ok = safeWrite(USER_THEMES_KEY, next);
  if (!ok) showToast("Could not save themes — browser storage unavailable.");
  return ok;
}

export function findUserTheme(id) {
  return loadUserThemes().find((t) => t.id === id) || null;
}

export function findUserThemeByName(name) {
  const needle = String(name || "").trim().toLowerCase();
  if (!needle) return null;
  return loadUserThemes().find((t) => t.name.toLowerCase() === needle) || null;
}

function uidTheme() {
  return `utm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Persist current look under a user-chosen name (create or update by name). */
export function saveCurrentLookAsTheme(name) {
  const trimmed = String(name || "").trim().slice(0, 40);
  if (!trimmed) {
    showToast("Enter a theme name.");
    return null;
  }
  const pack = state.customizePack || loadCustomizePack();
  if (pack.mode !== "custom") {
    enterCustomMode({ remind: false });
  }
  // Re-enter without clearing the id we're about to set: temporarily skip detach.
  const snap = snapshotPack(state.customizePack);
  // Ensure mode custom and derived colors filled.
  const live = normalizePack({ ...state.customizePack, mode: "custom", colors: snap.colors, font: snap.font, icons: snap.icons });
  live.colors = { ...live.colors, ...deriveColors(live.colors) };
  state.customizePack = live;
  saveCustomizePack(live);

  const list = loadUserThemes();
  const existing = findUserThemeByName(trimmed);
  let entry;
  let updated = false;
  if (existing) {
    entry = {
      ...existing,
      name: trimmed,
      pack: snapshotPack(live),
      updatedAt: new Date().toISOString()
    };
    const idx = list.findIndex((t) => t.id === existing.id);
    if (idx >= 0) list[idx] = entry;
    updated = true;
  } else {
    if (list.length >= MAX_USER_THEMES) {
      showToast(`You can save up to ${MAX_USER_THEMES} themes. Delete one first.`);
      return null;
    }
    entry = {
      id: uidTheme(),
      name: trimmed,
      pack: snapshotPack(live),
      updatedAt: new Date().toISOString()
    };
    list.unshift(entry);
  }
  if (!saveUserThemes(list)) return null;

  state.activeUserThemeId = entry.id;
  try { localStorage.setItem(THEME_KEY, userThemeKey(entry.id)); } catch (_) {}
  setCustomizeNeedsSave(false);
  document.dispatchEvent(new CustomEvent("locked-in:customize-mode"));
  document.dispatchEvent(new CustomEvent("locked-in:user-themes-changed"));
  showToast(updated ? `Updated “${entry.name}”.` : `Saved “${entry.name}”.`);
  return entry;
}

export function applyUserTheme(id) {
  const theme = findUserTheme(id);
  if (!theme) {
    showToast("That theme is no longer saved.");
    return false;
  }
  const pack = normalizePack({
    version: 1,
    mode: "custom",
    colors: theme.pack.colors,
    font: theme.pack.font,
    icons: theme.pack.icons
  });
  pack.colors = { ...pack.colors, ...deriveColors(pack.colors) };
  // Set active id before apply so enterCustomMode isn't triggered incorrectly.
  state.activeUserThemeId = theme.id;
  setCustomizeNeedsSave(false);
  state.customizePack = pack;
  if (!saveCustomizePack(pack)) return false;
  applyCustomizePack(pack);
  try { localStorage.setItem(THEME_KEY, userThemeKey(theme.id)); } catch (_) {}
  return true;
}

export function deleteUserTheme(id) {
  const list = loadUserThemes();
  const next = list.filter((t) => t.id !== id);
  if (next.length === list.length) return false;
  if (!saveUserThemes(next)) return false;
  if (state.activeUserThemeId === id) {
    state.activeUserThemeId = null;
  }
  document.dispatchEvent(new CustomEvent("locked-in:user-themes-changed"));
  return true;
}

export function getActiveUserTheme() {
  if (!state.activeUserThemeId) return null;
  return findUserTheme(state.activeUserThemeId);
}

export function switchToPresetTheme() {
  const pack = state.customizePack || loadCustomizePack();
  pack.mode = "preset";
  state.activeUserThemeId = null;
  // Keep icons; clear color overrides so preset tokens show through.
  Object.keys(pack.colors).forEach((k) => { pack.colors[k] = null; });
  pack.font.color = null;
  state.customizePack = pack;
  saveCustomizePack(pack);
  clearCustomCssVars();
  applyNavIcons(pack.icons);
  const stack = FONT_FAMILIES[pack.font.family] || FONT_FAMILIES.system;
  if (pack.font.family !== "system") document.documentElement.style.setProperty("--font", stack);
  else document.documentElement.style.removeProperty("--font");
  setCustomizeNeedsSave(false);
  syncCustomizeForm(pack);
  document.dispatchEvent(new CustomEvent("locked-in:customize-mode"));
}

export function resetCustomizeToPreset() {
  const pack = defaultPack();
  pack.mode = "preset";
  state.activeUserThemeId = null;
  state.customizePack = pack;
  saveCustomizePack(pack);
  clearCustomCssVars();
  applyNavIcons(pack.icons);
  document.documentElement.style.removeProperty("--font");
  setCustomizeNeedsSave(false);
  syncCustomizeForm(pack);
  document.dispatchEvent(new CustomEvent("locked-in:customize-mode"));
  showToast("Back to the theme preset.");
}

function setSaveThemeFormOpen(open) {
  if (!dom.customizeSaveThemeForm) return;
  dom.customizeSaveThemeForm.hidden = !open;
  if (open) {
    const active = getActiveUserTheme();
    if (dom.customizeThemeName) {
      dom.customizeThemeName.value = active?.name || "";
      dom.customizeThemeName.focus();
      dom.customizeThemeName.select?.();
    }
  } else if (dom.customizeThemeName) {
    dom.customizeThemeName.value = "";
  }
}

function commitSaveThemeFromForm() {
  const name = dom.customizeThemeName?.value || "";
  const entry = saveCurrentLookAsTheme(name);
  if (entry) setSaveThemeFormOpen(false);
}

function setRoleColor(role, hex) {
  enterCustomMode();
  const pack = state.customizePack;
  if (role === "bg") {
    pack.colors.bg = hex;
    // Keep a user-picked card color. Only fill surface if they never set one.
    // Soft/raised/border follow the kept surface (or derived surface) below.
    pack.colors.surfaceRaised = null;
    pack.colors.surfaceSoft = null;
    pack.colors.border = null;
    if (pack.colors.surface && surfacesTooClose(hex, pack.colors.surface)) {
      showToast("Your card color is very close to this background — panels may be hard to see.");
    }
  } else if (role === "surface") {
    let surfaceHex = hex;
    if (pack.colors.bg && surfacesTooClose(pack.colors.bg, surfaceHex)) {
      showToast("Card color is very close to the page background — panels may be hard to see.");
    }
    pack.colors.surface = surfaceHex;
    pack.colors.surfaceRaised = null;
    pack.colors.surfaceSoft = null;
  } else if (role === "text") {
    pack.colors.text = hex;
    pack.font.color = hex;
    pack.colors.textMuted = null;
    pack.colors.textSubtle = null;
  } else if (role === "accent") {
    pack.colors.accent = hex;
    pack.colors.accentStrong = null;
    pack.colors.accentInk = null;
  } else if (role === "navBg") {
    pack.colors.navBg = hex;
    pack.colors.navSurface = null;
    if (pack.colors.navText && contrastRatio(pack.colors.navText, hex) < 3) {
      showToast("Low contrast between nav text and nav bar — consider a stronger pair.");
    }
  } else if (role === "navText") {
    pack.colors.navText = hex;
    pack.colors.navTextMuted = null;
    if (pack.colors.navBg && contrastRatio(hex, pack.colors.navBg) < 3) {
      showToast("Low contrast between nav text and nav bar — consider a stronger pair.");
    }
  }
  const derived = deriveColors(pack.colors);
  pack.colors = { ...pack.colors, ...derived };
  if (pack.colors.text && pack.colors.bg && contrastRatio(pack.colors.text, pack.colors.bg) < 3) {
    showToast("Low contrast between text and background — consider a stronger pair.");
  } else if (pack.colors.bg && pack.colors.surface && surfacesTooClose(pack.colors.bg, pack.colors.surface)) {
    showToast("Background and surface still look similar — try a lighter or darker surface.");
  }
  saveCustomizePack(pack);
  applyCustomizePack(pack);
}

/**
 * Canvas HSV color wheel (Cory Forsyth / bantic approach):
 * https://medium.com/@bantic/hand-coding-a-color-wheel-with-canvas-78256c9d7d43
 * - Pixel loop with createImageData / putImageData
 * - Circle mask via distance from center
 * - Hue ← angle (atan2), Saturation ← radius, Value ← brightness slider
 */
export function drawColorWheel(canvas = dom.colorWheel, value = wheelValue) {
  if (!canvas?.getContext) return;
  const cssSize = Math.round(Math.min(220, canvas.clientWidth || 220));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const size = Math.max(2, Math.round(cssSize * dpr));
  if (canvas.width !== size || canvas.height !== size) {
    canvas.width = size;
    canvas.height = size;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const radius = size / 2;
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const val = clamp01(value);

  // Pixel loop per Forsyth: circle mask, hue←atan2 angle, sat←radius/radiusMax
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = px - radius;
      const y = py - radius;
      const distance = Math.sqrt(x * x + y * y);
      if (distance > radius) continue;
      const index = (px + py * size) * 4;
      let hue = Math.atan2(y, x) * (180 / Math.PI);
      if (hue < 0) hue += 360;
      const sat = distance / radius;
      const { r, g, b } = hsvToRgb(hue, sat, val);
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function pickColorFromWheelEvent(event, canvas = dom.colorWheel) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const size = canvas.width;
  if (!size || !rect.width) return null;
  const scale = size / rect.width;
  const x = (event.clientX - rect.left) * scale - size / 2;
  const y = (event.clientY - rect.top) * scale - size / 2;
  const distance = Math.sqrt(x * x + y * y);
  const radius = size / 2;
  if (distance > radius) return null;
  let hue = Math.atan2(y, x) * (180 / Math.PI);
  if (hue < 0) hue += 360;
  const sat = distance / radius;
  return hsvToHex(hue, sat, wheelValue);
}

export function buildColorWheel(container = dom.colorWheel) {
  const canvas = container?.tagName === "CANVAS" ? container : container?.querySelector?.("canvas") || dom.colorWheel;
  if (!canvas?.getContext) return;
  drawColorWheel(canvas, wheelValue);
  if (wheelBuilt) return;
  const pick = (event) => {
    const hex = pickColorFromWheelEvent(event, canvas);
    if (!hex) return;
    setRoleColor(activeColorRole, hex);
    updateColorReadout(hex);
  };
  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture?.(event.pointerId);
    pick(event);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.buttons !== 1) return;
    pick(event);
  });
  canvas.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    showToast(`Click the wheel to pick a color for ${ROLE_LABELS[activeColorRole] || activeColorRole}.`);
  });
  if (!canvas.hasAttribute("tabindex")) canvas.tabIndex = 0;
  wheelBuilt = true;
  window.addEventListener("resize", () => {
    if (state.activeScreen === "customize-screen") drawColorWheel(canvas, wheelValue);
  }, { passive: true });
}

function resolveRoleHex(role, pack = state.customizePack) {
  const p = pack || loadCustomizePack();
  const override = {
    bg: p.colors.bg,
    surface: p.colors.surface,
    text: p.font.color || p.colors.text,
    accent: p.colors.accent,
    navBg: p.colors.navBg,
    navText: p.colors.navText
  }[role];
  if (override) return override;
  const cssVar = {
    bg: "--bg",
    surface: "--surface",
    text: "--text",
    accent: "--accent",
    navBg: "--nav-bg",
    navText: "--nav-text"
  }[role];
  if (!cssVar) return null;
  let raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  // Unset nav overrides fall back to page tokens for the readout.
  if (!raw && role === "navBg") raw = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (!raw && role === "navText") raw = getComputedStyle(document.documentElement).getPropertyValue("--text").trim();
  if (!raw) return null;
  if (raw.startsWith("#")) return raw.length === 4 || raw.length === 7 ? raw.toLowerCase() : raw;
  const probe = document.createElement("div");
  probe.style.color = raw;
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return raw;
  return rgbToHex(Number(m[1]), Number(m[2]), Number(m[3]));
}

function updateColorReadout(hex) {
  if (dom.customizeColorHex) dom.customizeColorHex.textContent = hex || "—";
  const swatch = document.getElementById("customize-color-swatch");
  if (swatch) swatch.style.background = hex || "var(--accent)";
}

export function setActiveColorRole(role) {
  if (!COLOR_ROLES.includes(role)) return;
  activeColorRole = role;
  document.querySelectorAll("[data-color-role]").forEach((btn) => {
    const on = btn.dataset.colorRole === role;
    btn.classList.toggle("is-selected", on);
    btn.setAttribute("aria-checked", String(on));
  });
  updateColorReadout(resolveRoleHex(role));
}

function syncIconPreviews(icons) {
  NAV_ICON_KEYS.forEach((key) => {
    const preview = document.querySelector(`[data-icon-preview="${key}"]`);
    if (!preview) return;
    const svg = icons?.[key] || (key === "settings" ? DEFAULT_SETTINGS_NAV_ICON : null);
    if (svg) {
      preview.innerHTML = svg;
      preview.classList.add("has-icon");
    } else {
      preview.replaceChildren();
      preview.classList.remove("has-icon");
      preview.textContent = "—";
    }
  });
}

function updateFontPreview(familyKey) {
  const preview = document.getElementById("customize-font-preview");
  if (!preview) return;
  const stack = FONT_FAMILIES[familyKey] || FONT_FAMILIES.system;
  preview.style.fontFamily = stack;
}

export function syncCustomizeForm(pack = state.customizePack) {
  const p = normalizePack(pack);
  if (dom.customizeFontFamily) dom.customizeFontFamily.value = p.font.family;
  updateFontPreview(p.font.family);
  if (dom.customizeModeLabel) {
    dom.customizeModeLabel.textContent = p.mode === "custom" ? "Custom theme active" : "Using preset theme";
  }
  syncCustomizeSaveReminder(state.customizeNeedsSave);
  setActiveColorRole(activeColorRole);
  syncIconPreviews(p.icons);
}

export function sanitizeSvg(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  if (new Blob([text]).size > MAX_SVG_BYTES) return null;
  let doc;
  try {
    doc = new DOMParser().parseFromString(text, "image/svg+xml");
  } catch (_) {
    return null;
  }
  if (doc.querySelector("parsererror")) return null;
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== "svg") return null;

  const walk = (node) => {
    [...node.children].forEach((child) => {
      const tag = child.tagName?.toLowerCase?.() || "";
      if (!SAFE_SVG_TAGS.has(tag)) {
        child.remove();
        return;
      }
      [...child.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value || "";
        if (name.startsWith("on") || name === "href" || name === "xlink:href") {
          if (/^\s*javascript:/i.test(value) || name.startsWith("on")) child.removeAttribute(attr.name);
        }
        if (/^\s*javascript:/i.test(value)) child.removeAttribute(attr.name);
      });
      walk(child);
    });
  };
  walk(svg);
  svg.setAttribute("fill", svg.getAttribute("fill") || "currentColor");
  if (!svg.getAttribute("viewBox") && svg.getAttribute("width") && svg.getAttribute("height")) {
    svg.setAttribute("viewBox", `0 0 ${svg.getAttribute("width")} ${svg.getAttribute("height")}`);
  }
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  return new XMLSerializer().serializeToString(svg);
}

export async function handleIconUpload(key, file) {
  if (!NAV_ICON_KEYS.includes(key)) return false;
  if (!file) return false;
  if (file.size > MAX_SVG_BYTES) {
    showToast("SVG must be 50 KB or smaller.");
    return false;
  }
  const name = String(file.name || "").toLowerCase();
  if (file.type && file.type !== "image/svg+xml" && !name.endsWith(".svg")) {
    showToast("Please upload an .svg file.");
    return false;
  }
  const text = await file.text();
  const clean = sanitizeSvg(text);
  if (!clean) {
    showToast("Could not use that SVG — invalid or unsafe markup.");
    return false;
  }
  enterCustomMode();
  const pack = state.customizePack;
  pack.icons[key] = clean;
  saveCustomizePack(pack);
  applyNavIcons(pack.icons);
  showToast("Nav icon updated.");
  return true;
}

export function clearNavIcon(key) {
  if (!NAV_ICON_KEYS.includes(key)) return;
  enterCustomMode();
  const pack = state.customizePack || loadCustomizePack();
  pack.icons[key] = null;
  saveCustomizePack(pack);
  applyNavIcons(pack.icons);
  showToast("Nav icon cleared.");
}

export function setFontFamily(family) {
  enterCustomMode();
  const pack = state.customizePack;
  pack.font.family = FONT_FAMILIES[family] ? family : "system";
  saveCustomizePack(pack);
  applyCustomizePack(pack);
  updateFontPreview(pack.font.family);
}

export function applySuggestedTheme(id) {
  const theme = SUGGESTED_THEMES.find((t) => t.id === id);
  if (!theme) return false;
  enterCustomMode();
  const pack = state.customizePack || loadCustomizePack();
  Object.keys(pack.colors).forEach((key) => { pack.colors[key] = null; });
  pack.colors.bg = theme.colors.bg;
  pack.colors.surface = theme.colors.surface;
  pack.colors.text = theme.colors.text;
  pack.colors.accent = theme.colors.accent;
  pack.font.color = theme.colors.text;
  pack.colors = { ...pack.colors, ...deriveColors(pack.colors) };
  state.customizePack = pack;
  saveCustomizePack(pack);
  applyCustomizePack(pack);
  showToast(`Applied ${theme.name}`);
  return true;
}

function renderSuggestedThemes() {
  const grid = document.getElementById("suggested-theme-grid");
  if (!grid || grid.dataset.built === "1") return;
  grid.replaceChildren();
  SUGGESTED_THEMES.forEach((theme) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "suggested-theme-card";
    btn.dataset.suggestedTheme = theme.id;
    btn.setAttribute("role", "listitem");
    btn.setAttribute("aria-label", `Apply ${theme.name} theme from Adobe Color`);
    btn.title = theme.source;

    const bar = document.createElement("span");
    bar.className = "suggested-theme-swatches";
    bar.setAttribute("aria-hidden", "true");
    theme.swatches.forEach((hex) => {
      const chip = document.createElement("span");
      chip.style.background = hex;
      bar.appendChild(chip);
    });

    const label = document.createElement("span");
    label.className = "suggested-theme-name";
    label.textContent = theme.name;

    btn.append(bar, label);
    btn.addEventListener("click", () => applySuggestedTheme(theme.id));
    grid.appendChild(btn);
  });
  grid.dataset.built = "1";
}

export function exportCustomizePack() {
  const pack = state.customizePack || loadCustomizePack();
  download("locked-in-theme.json", JSON.stringify(pack, null, 2), "application/json");
  setCustomizeNeedsSave(false);
  showToast("Theme file ready to download.");
}

export async function importCustomizePack(file) {
  if (!file) return false;
  if (file.size > 2 * 1024 * 1024) {
    showToast("That file is larger than 2 MB.");
    return false;
  }
  let raw;
  try {
    raw = JSON.parse(await file.text());
  } catch (_) {
    showToast("Could not read that customize file.");
    return false;
  }
  if (!raw || raw.version !== 1) {
    showToast("Unsupported customize file version.");
    return false;
  }
  const pack = normalizePack(raw);
  NAV_ICON_KEYS.forEach((key) => {
    if (pack.icons[key]) {
      const clean = sanitizeSvg(pack.icons[key]);
      pack.icons[key] = clean;
    }
  });
  pack.mode = "custom";
  state.activeUserThemeId = null;
  state.customizePack = pack;
  if (!saveCustomizePack(pack)) return false;
  try { localStorage.setItem(THEME_KEY, "custom"); } catch (_) {}
  applyCustomizePack(pack);
  setCustomizeNeedsSave(false);
  showToast("Theme imported.");
  return true;
}

export function renderCustomize() {
  if (dom.colorWheel) {
    if (!wheelBuilt) buildColorWheel(dom.colorWheel);
    else drawColorWheel(dom.colorWheel, wheelValue);
  }
  if (dom.customizeColorValue) {
    dom.customizeColorValue.value = String(Math.round(wheelValue * 100));
    dom.customizeColorValue.setAttribute("aria-valuetext", `${Math.round(wheelValue * 100)} percent`);
  }
  renderSuggestedThemes();
  syncCustomizeForm(state.customizePack || loadCustomizePack());
}

export function bindCustomizeEvents() {
  document.querySelectorAll("[data-color-role]").forEach((btn) => {
    btn.addEventListener("click", () => setActiveColorRole(btn.dataset.colorRole));
  });
  if (dom.colorWheel) buildColorWheel(dom.colorWheel);
  renderSuggestedThemes();

  dom.customizeColorValue?.addEventListener("input", () => {
    const pct = Number(dom.customizeColorValue.value);
    wheelValue = clamp01((Number.isFinite(pct) ? pct : 100) / 100);
    dom.customizeColorValue.setAttribute("aria-valuetext", `${Math.round(wheelValue * 100)} percent`);
    drawColorWheel(dom.colorWheel, wheelValue);
  });

  dom.customizeFontFamily?.addEventListener("change", () => {
    setFontFamily(dom.customizeFontFamily.value);
  });

  NAV_ICON_KEYS.forEach((key) => {
    const input = document.getElementById(`icon-upload-${key}`);
    const clearBtn = document.getElementById(`icon-clear-${key}`);
    input?.addEventListener("change", async () => {
      const file = input.files?.[0];
      await handleIconUpload(key, file);
      input.value = "";
    });
    clearBtn?.addEventListener("click", () => clearNavIcon(key));
  });

  dom.customizeExportBtn?.addEventListener("click", exportCustomizePack);
  dom.customizeImportInput?.addEventListener("change", async () => {
    const file = dom.customizeImportInput.files?.[0];
    await importCustomizePack(file);
    dom.customizeImportInput.value = "";
  });
  dom.customizeResetBtn?.addEventListener("click", () => {
    resetCustomizeToPreset();
    let theme = "dark";
    try {
      const saved = localStorage.getItem(THEME_KEY) || "dark";
      theme = (parseUserThemeKey(saved) || saved === "custom") ? "dark" : saved;
      if (!["dark", "light", "forest", "violet", "pink", "blue"].includes(theme)) theme = "dark";
      localStorage.setItem(THEME_KEY, theme);
    } catch (_) {}
    document.documentElement.dataset.theme = theme;
    // Re-read preset CSS vars after clearing overrides
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg || "#101310");
  });

  dom.customizeSaveThemeBtn?.addEventListener("click", () => {
    setSaveThemeFormOpen(true);
  });
  dom.customizeSaveThemeCancel?.addEventListener("click", () => {
    setSaveThemeFormOpen(false);
  });
  dom.customizeSaveThemeConfirm?.addEventListener("click", () => {
    commitSaveThemeFromForm();
  });
  dom.customizeThemeName?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitSaveThemeFromForm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setSaveThemeFormOpen(false);
      dom.customizeSaveThemeBtn?.focus();
    }
  });
}

export function initCustomize() {
  loadCustomizePack();
  if (state.activeUserThemeId) {
    if (!applyUserTheme(state.activeUserThemeId)) {
      state.activeUserThemeId = null;
      applyCustomizePack(state.customizePack);
    }
  } else {
    applyCustomizePack(state.customizePack);
  }
}
