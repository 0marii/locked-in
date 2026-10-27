import { THEME_KEY } from "./constants.js?v=202";
import { dom, state } from "./runtime.js?v=202";
import { safeWrite } from "./storage.js?v=202";
import { renderSetup } from "./setup.js?v=202";
import { renderTimer, syncFloatingTimer, syncStickyNotesUi } from "./session.js?v=202";
import { closeDatePicker, renderHistory } from "./history.js?v=202";
import { renderInsights } from "./insights.js?v=202";
import { renderNotes } from "./notes.js?v=202";
import {
  applyUserTheme,
  deleteUserTheme,
  findUserTheme,
  getActiveUserTheme,
  loadUserThemes,
  parseUserThemeKey,
  renderCustomize,
  restoreCustomizeBeforeEdits,
  saveCurrentLookAsTheme,
  setCustomizeNeedsSave,
  switchToPresetTheme
} from "./customize.js?v=202";
import { renderTodos } from "./todos.js?v=202";
import { renderSettings } from "./settings.js?v=202";

export const screenMap = {
  timer: "timer-screen", history: "history-screen", insights: "insights-screen", notes: "notes-screen",
  todos: "todos-screen", customize: "customize-screen", settings: "settings-screen",
  report: "report-screen", setup: "setup-screen"
};

const PRESET_THEMES = ["dark", "light", "forest", "violet", "pink", "blue"];

export function closeMenu() {
  dom.nav.classList.remove("is-open");
  dom.menuToggle.setAttribute("aria-expanded", "false");
  dom.menuToggle.setAttribute("aria-label", "Open navigation menu");
}

export function toggleMenu() {
  const open = dom.nav.classList.toggle("is-open");
  dom.menuToggle.setAttribute("aria-expanded", String(open));
  dom.menuToggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
}

export function validScreen(id) { return dom.screens.some(s => s.id === id); }

export function proceedNavigate(id, replace = false) {
  if (!validScreen(id)) id = "setup-screen";
  if (state.datePicker.field) closeDatePicker({ restoreFocus: false });
  state.activeScreen = id;
  dom.screens.forEach(s => s.classList.toggle("is-active", s.id === id));
  dom.navLinks.forEach(link => {
    const active = link.dataset.screen === id
      || (id === "timer-screen" && link.dataset.screen === "setup-screen");
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  });
  closeMenu();
  const hash = Object.entries(screenMap).find(([, value]) => value === id)?.[0] || "setup";
  const target = `${location.pathname}${location.search}#${hash}`;
  if (location.hash !== `#${hash}`) {
    if (replace) history.replaceState(null, "", target); else history.pushState(null, "", target);
  }
  if (id === "setup-screen") renderSetup();
  if (id === "history-screen") renderHistory();
  if (id === "insights-screen") renderInsights();
  if (id === "notes-screen") renderNotes();
  if (id === "todos-screen") renderTodos();
  if (id === "customize-screen") renderCustomize();
  if (id === "settings-screen") renderSettings();
  if (id === "timer-screen" && state.session) renderTimer();
  syncStickyNotesUi();
  syncFloatingTimer();
  if (id !== "timer-screen") safeWrite("locked_in_last_screen", id);
  const title = { "setup-screen": "Locked-In — Focus Timer", "timer-screen": "Focus session · Locked-In", "report-screen": "Session report · Locked-In", "history-screen": "History · Locked-In", "insights-screen": "Insights · Locked-In", "notes-screen": "Notes · Locked-In", "todos-screen": "To-Do · Locked-In", "customize-screen": "Customize · Locked-In", "settings-screen": "Settings · Locked-In" }[id];
  if (!state.session) document.title = title || "Locked-In";
  const heading = document.querySelector(`#${id} h1`);
  if (heading) {
    heading.tabIndex = -1;
    try { heading.focus({ preventScroll: true, focusVisible: false }); }
    catch (_) { heading.focus({ preventScroll: true }); }
  }
  window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

let leaveCustomizePending = null;

function setPageBlurred(on) {
  document.documentElement.classList.toggle("is-page-blurred", Boolean(on));
}

function closeLeaveCustomizeDialog() {
  leaveCustomizePending = null;
  setPageBlurred(false);
  if (dom.leaveCustomizeDialog?.open) dom.leaveCustomizeDialog.close();
}

function openLeaveCustomizeDialog(pendingId, replace) {
  if (!dom.leaveCustomizeDialog) {
    proceedNavigate(pendingId, replace);
    return;
  }
  if (dom.leaveCustomizeDialog.open || dom.confirmDialog?.open) return;
  leaveCustomizePending = { id: pendingId, replace: Boolean(replace) };
  const customizeUrl = `${location.pathname}${location.search}#customize`;
  if (location.hash !== "#customize") history.replaceState(null, "", customizeUrl);
  const active = getActiveUserTheme();
  if (dom.leaveCustomizeThemeName) {
    dom.leaveCustomizeThemeName.value = active?.name || "";
  }
  setPageBlurred(true);
  if (typeof dom.leaveCustomizeDialog.showModal === "function") {
    dom.leaveCustomizeDialog.showModal();
  } else {
    const name = window.prompt("Theme name (leave blank to discard and leave):", active?.name || "");
    setPageBlurred(false);
    if (name == null) {
      leaveCustomizePending = null;
      return;
    }
    if (String(name).trim()) {
      if (!saveCurrentLookAsTheme(name)) {
        leaveCustomizePending = null;
        return;
      }
      renderUserThemesInPicker();
      syncThemePicker(document.documentElement.dataset.theme || "dark");
    } else {
      setCustomizeNeedsSave(false);
    }
    const pending = leaveCustomizePending;
    leaveCustomizePending = null;
    if (pending) proceedNavigate(pending.id, pending.replace);
  }
  queueMicrotask(() => {
    dom.leaveCustomizeThemeName?.focus();
    dom.leaveCustomizeThemeName?.select?.();
  });
}

export function bindLeaveCustomizeDialog() {
  if (!dom.leaveCustomizeDialog) return;

  const stay = () => {
    closeLeaveCustomizeDialog();
  };

  const discardAndLeave = () => {
    const pending = leaveCustomizePending;
    restoreCustomizeBeforeEdits();
    renderUserThemesInPicker();
    syncThemePicker(document.documentElement.dataset.theme || "dark");
    closeLeaveCustomizeDialog();
    if (pending) proceedNavigate(pending.id, pending.replace);
  };

  const saveAndLeave = () => {
    const pending = leaveCustomizePending;
    const name = dom.leaveCustomizeThemeName?.value || "";
    const entry = saveCurrentLookAsTheme(name);
    if (!entry) {
      dom.leaveCustomizeThemeName?.focus();
      return;
    }
    renderUserThemesInPicker();
    syncThemePicker(document.documentElement.dataset.theme || "dark");
    closeLeaveCustomizeDialog();
    if (pending) proceedNavigate(pending.id, pending.replace);
  };

  dom.leaveCustomizeStay?.addEventListener("click", stay);
  dom.leaveCustomizeDiscard?.addEventListener("click", discardAndLeave);
  dom.leaveCustomizeSave?.addEventListener("click", saveAndLeave);
  dom.leaveCustomizeThemeName?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveAndLeave();
    }
  });
  dom.leaveCustomizeDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    stay();
  });
  dom.leaveCustomizeDialog.addEventListener("close", () => {
    setPageBlurred(false);
    leaveCustomizePending = null;
  });
}

export function navigate(id, replace = false) {
  if (!validScreen(id)) id = "setup-screen";
  // Setup is only for starting a session — send an active session back to the timer.
  if (id === "setup-screen" && state.session) id = "timer-screen";
  if (state.reportDirty && state.activeScreen === "report-screen" && id !== "report-screen") {
    const pendingId = id;
    const reportUrl = `${location.pathname}${location.search}#report`;
    if (location.hash !== "#report") history.replaceState(null, "", reportUrl);
    if (dom.confirmDialog.open) return;
    askConfirm(
      "Discard unsaved notes?",
      "You have unsaved report notes. Leave without saving?",
      () => {
        state.reportDirty = false;
        proceedNavigate(pendingId, replace);
      },
      "Discard"
    );
    return;
  }
  if (
    state.customizeNeedsSave
    && state.activeScreen === "customize-screen"
    && id !== "customize-screen"
  ) {
    openLeaveCustomizeDialog(id, replace);
    return;
  }
  proceedNavigate(id, replace);
}

function isCustomThemeActive() {
  return state.customizePack?.mode === "custom";
}

function themePickerButtons() {
  return [...(dom.themePopover?.querySelectorAll("[data-theme], [data-user-theme]") || [])];
}

function swatchColorForPack(pack) {
  const accent = pack?.colors?.accent;
  const bg = pack?.colors?.bg;
  return accent || bg || "#b7f36b";
}

/** Render saved named themes under the built-in list. */
export function renderUserThemesInPicker() {
  const list = dom.userThemeList;
  if (!list) return;
  const themes = loadUserThemes();
  list.replaceChildren();
  if (!themes.length) {
    list.hidden = true;
    return;
  }
  list.hidden = false;
  themes.forEach((theme) => {
    const row = document.createElement("div");
    row.className = "user-theme-row";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "user-theme-btn";
    button.dataset.userTheme = theme.id;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", "false");
    button.tabIndex = -1;

    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = swatchColorForPack(theme.pack);
    swatch.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "user-theme-name";
    label.textContent = theme.name;

    button.append(swatch, label);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "user-theme-delete";
    del.setAttribute("aria-label", `Delete theme ${theme.name}`);
    del.title = `Delete “${theme.name}”`;
    del.textContent = "×";
    del.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      askConfirm(
        "Delete theme?",
        `Remove “${theme.name}” from your saved themes?`,
        () => {
          const wasActive = state.activeUserThemeId === theme.id;
          if (!deleteUserTheme(theme.id)) return;
          if (wasActive) setTheme("dark", true);
          else {
            renderUserThemesInPicker();
            syncThemePicker(document.documentElement.dataset.theme || "dark");
          }
        },
        "Delete"
      );
    });

    button.addEventListener("click", () => {
      selectUserTheme(theme.id);
    });

    row.append(button, del);
    list.append(row);
  });
}

function confirmDiscardCustomizeEdits(then) {
  if (!state.customizeNeedsSave) {
    then();
    return;
  }
  if (dom.confirmDialog?.open) return;
  askConfirm(
    "Discard unsaved look?",
    "You haven’t saved this look to My Themes. Switch themes anyway? These unsaved edits will be replaced.",
    () => {
      setCustomizeNeedsSave(false);
      then();
    },
    "Switch"
  );
}

export function selectUserTheme(id) {
  confirmDiscardCustomizeEdits(() => {
    if (!applyUserTheme(id)) {
      renderUserThemesInPicker();
      syncThemePicker(document.documentElement.dataset.theme || "dark");
      return;
    }
    closeThemePopover();
    renderUserThemesInPicker();
    syncThemePicker(document.documentElement.dataset.theme || "dark");
    if (state.activeScreen === "insights-screen") renderInsights();
    if (state.activeScreen === "customize-screen") renderCustomize();
    dom.themeButton?.focus();
  });
}

/** Keep theme button + popover in sync with preset vs Custom vs named theme. */
export function syncThemePicker(chosen = document.documentElement.dataset.theme || "dark") {
  const custom = isCustomThemeActive();
  const activeNamed = custom ? getActiveUserTheme() : null;
  const label = activeNamed
    ? activeNamed.name
    : custom
      ? "Custom"
      : (PRESET_THEMES.includes(chosen) ? chosen[0].toUpperCase() + chosen.slice(1) : "Dark");
  dom.themeButton?.setAttribute("aria-label", `Theme: ${label}. Open theme picker`);
  const name = dom.themeButton?.querySelector(".theme-name");
  if (name) name.textContent = label;

  dom.themePopover?.querySelectorAll("[data-theme]").forEach((button) => {
    const active = activeNamed
      ? false
      : custom
        ? button.dataset.theme === "custom"
        : button.dataset.theme === chosen;
    button.classList.toggle("is-selected", active);
    button.setAttribute("aria-checked", String(active));
    button.tabIndex = active ? 0 : -1;
  });

  dom.themePopover?.querySelectorAll("[data-user-theme]").forEach((button) => {
    const active = Boolean(activeNamed && button.dataset.userTheme === activeNamed.id);
    button.classList.toggle("is-selected", active);
    button.setAttribute("aria-checked", String(active));
    button.tabIndex = active ? 0 : -1;
  });
}

export function openCustomizeFromTheme() {
  closeThemePopover();
  navigate("customize-screen");
}

export function setTheme(theme, persist = true) {
  if (theme === "custom") {
    openCustomizeFromTheme();
    syncThemePicker(document.documentElement.dataset.theme || "dark");
    return;
  }
  const apply = () => {
    const chosen = PRESET_THEMES.includes(theme) ? theme : "dark";
    document.documentElement.dataset.theme = chosen;
    // Preset selection clears custom color overrides (icons are kept).
    if (persist) {
      state.activeUserThemeId = null;
      switchToPresetTheme();
      try { localStorage.setItem(THEME_KEY, chosen); } catch (_) {}
    }
    syncThemePicker(chosen);
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg || "#101310");
    if (state.activeScreen === "insights-screen") renderInsights();
    if (state.activeScreen === "customize-screen") renderCustomize();
  };
  if (persist) confirmDiscardCustomizeEdits(apply);
  else apply();
}

export function closeThemePopover() {
  dom.themePopover.classList.remove("is-open");
  dom.themeButton.setAttribute("aria-expanded", "false");
}

export function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (_) {}
  const system = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  const userId = parseUserThemeKey(saved);

  if (userId) {
    const theme = findUserTheme(userId);
    if (theme) {
      state.activeUserThemeId = userId;
      // Keep FOUC/base preset on <html>; pack apply happens in initCustomize.
      const base = PRESET_THEMES.includes(document.documentElement.dataset.theme)
        ? document.documentElement.dataset.theme
        : system;
      document.documentElement.dataset.theme = base;
    } else {
      try { localStorage.setItem(THEME_KEY, system); } catch (_) {}
      setTheme(system, false);
    }
  } else if (saved === "custom") {
    // Unsaved custom — pack apply in initCustomize; keep base preset.
    const base = PRESET_THEMES.includes(document.documentElement.dataset.theme)
      ? document.documentElement.dataset.theme
      : system;
    document.documentElement.dataset.theme = base;
  } else {
    setTheme(saved || system, false);
  }

  renderUserThemesInPicker();
  syncThemePicker(document.documentElement.dataset.theme || "dark");

  document.addEventListener("locked-in:customize-mode", () => {
    syncThemePicker(document.documentElement.dataset.theme || "dark");
  });
  document.addEventListener("locked-in:user-themes-changed", () => {
    renderUserThemesInPicker();
    syncThemePicker(document.documentElement.dataset.theme || "dark");
  });

  const syncThemeTabStops = () => {
    themePickerButtons().forEach((button) => {
      const selected = button.getAttribute("aria-checked") === "true";
      button.tabIndex = selected ? 0 : -1;
    });
  };

  dom.themeButton.addEventListener("click", () => {
    const open = dom.themePopover.classList.toggle("is-open");
    dom.themeButton.setAttribute("aria-expanded", String(open));
    if (open) {
      renderUserThemesInPicker();
      syncThemePicker(document.documentElement.dataset.theme || "dark");
      syncThemeTabStops();
      const buttons = themePickerButtons();
      (buttons.find((b) => b.getAttribute("aria-checked") === "true") || buttons[0])?.focus();
    }
  });

  // Built-in theme buttons (static).
  dom.themePopover.querySelectorAll("[data-theme]").forEach((b) => {
    b.addEventListener("click", () => {
      if (b.dataset.theme === "custom") {
        openCustomizeFromTheme();
        return;
      }
      setTheme(b.dataset.theme);
      closeThemePopover();
      dom.themeButton.focus();
    });
  });

  dom.themePopover.addEventListener("keydown", (e) => {
    if (!dom.themePopover.classList.contains("is-open")) return;
    const buttons = themePickerButtons();
    const current = buttons.indexOf(document.activeElement);
    if (current < 0) return;
    let next = current;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); next = (current + 1) % buttons.length; }
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); next = (current - 1 + buttons.length) % buttons.length; }
    else if (e.key === "Home") { e.preventDefault(); next = 0; }
    else if (e.key === "End") { e.preventDefault(); next = buttons.length - 1; }
    else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      const btn = buttons[current];
      const theme = btn.dataset.theme;
      const userTheme = btn.dataset.userTheme;
      if (userTheme) {
        selectUserTheme(userTheme);
        return;
      }
      if (theme === "custom") openCustomizeFromTheme();
      else {
        setTheme(theme);
        closeThemePopover();
        dom.themeButton.focus();
      }
      return;
    } else return;
    const nextBtn = buttons[next];
    const nextTheme = nextBtn.dataset.theme;
    const nextUser = nextBtn.dataset.userTheme;
    // Preview presets while browsing; Custom / named only activate on Enter/click.
    if (nextTheme && nextTheme !== "custom") setTheme(nextTheme, false);
    else if (nextUser) syncThemeTabStops();
    else syncThemeTabStops();
    nextBtn.focus();
  });
  document.addEventListener("click", (e) => {
    if (!dom.themePopover.contains(e.target) && !dom.themeButton.contains(e.target)) closeThemePopover();
  });
}

export function askConfirm(title, message, action, acceptText) {
  dom.confirmTitle.textContent=title; dom.confirmMessage.textContent=message; dom.confirmAccept.textContent=acceptText || "Confirm";
  state.confirmAction=action; dom.confirmDialog.returnValue="";
  if (typeof dom.confirmDialog.showModal === "function") dom.confirmDialog.showModal(); else if (window.confirm(message)) action();
}
