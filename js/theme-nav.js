import { THEME_KEY } from "./constants.js?v=140";
import { dom, state } from "./runtime.js?v=140";
import { safeWrite } from "./storage.js?v=140";
import { renderSetup } from "./setup.js?v=140";
import { renderTimer, syncFloatingTimer, syncStickyNotesUi } from "./session.js?v=140";
import { closeDatePicker, renderHistory } from "./history.js?v=140";
import { renderInsights } from "./insights.js?v=140";
import { renderNotes } from "./notes.js?v=140";
import { renderCustomize, switchToPresetTheme } from "./customize.js?v=140";
import { renderTodos } from "./todos.js?v=140";

export const screenMap = {
  timer: "timer-screen", history: "history-screen", insights: "insights-screen", notes: "notes-screen",
  todos: "todos-screen", customize: "customize-screen", report: "report-screen", setup: "setup-screen"
};


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
  if (id === "timer-screen" && state.session) renderTimer();
  syncStickyNotesUi();
  syncFloatingTimer();
  if (id !== "timer-screen") safeWrite("locked_in_last_screen", id);
  const title = { "setup-screen": "Locked-In — Focus Timer", "timer-screen": "Focus session · Locked-In", "report-screen": "Session report · Locked-In", "history-screen": "History · Locked-In", "insights-screen": "Insights · Locked-In", "notes-screen": "Notes · Locked-In", "todos-screen": "To-Do · Locked-In", "customize-screen": "Customize · Locked-In" }[id];
  document.title = title || "Locked-In";
  const heading = document.querySelector(`#${id} h1`);
  if (heading) {
    heading.tabIndex = -1;
    try { heading.focus({ preventScroll: true, focusVisible: false }); }
    catch (_) { heading.focus({ preventScroll: true }); }
  }
  window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
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
  proceedNavigate(id, replace);
}

function isCustomThemeActive() {
  return state.customizePack?.mode === "custom";
}

/** Keep theme button + popover in sync with preset vs Custom mode. */
export function syncThemePicker(chosen = document.documentElement.dataset.theme || "dark") {
  const custom = isCustomThemeActive();
  const label = custom ? "Custom" : chosen[0].toUpperCase() + chosen.slice(1);
  dom.themeButton?.setAttribute("aria-label", `Theme: ${label}. Open theme picker`);
  const name = dom.themeButton?.querySelector(".theme-name");
  if (name) name.textContent = label;
  dom.themePopover?.querySelectorAll("[data-theme]").forEach((button) => {
    const active = custom ? button.dataset.theme === "custom" : button.dataset.theme === chosen;
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
  const themes = ["dark", "light", "forest", "violet", "pink", "blue"];
  const chosen = themes.includes(theme) ? theme : "dark";
  document.documentElement.dataset.theme = chosen;
  // Preset selection clears custom color overrides (icons are kept).
  if (persist) switchToPresetTheme();
  syncThemePicker(chosen);
  if (persist) { try { localStorage.setItem(THEME_KEY, chosen); } catch (_) {} }
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg || "#101310");
  if (state.activeScreen === "insights-screen") renderInsights();
  if (state.activeScreen === "customize-screen") renderCustomize();
}

export function closeThemePopover() {
  dom.themePopover.classList.remove("is-open");
  dom.themeButton.setAttribute("aria-expanded", "false");
}

export function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (_) {}
  const system = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  setTheme(saved || system, false);
  document.addEventListener("locked-in:customize-mode", () => {
    syncThemePicker(document.documentElement.dataset.theme || "dark");
  });
  const themeButtons = [...dom.themePopover.querySelectorAll("[data-theme]")];
  const syncThemeTabStops = () => {
    themeButtons.forEach((button) => {
      const selected = button.getAttribute("aria-checked") === "true";
      button.tabIndex = selected ? 0 : -1;
    });
  };
  syncThemeTabStops();
  dom.themeButton.addEventListener("click", () => {
    const open = dom.themePopover.classList.toggle("is-open");
    dom.themeButton.setAttribute("aria-expanded", String(open));
    if (open) {
      syncThemeTabStops();
      (themeButtons.find((b) => b.getAttribute("aria-checked") === "true") || themeButtons[0])?.focus();
    }
  });
  themeButtons.forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.theme === "custom") {
      openCustomizeFromTheme();
      return;
    }
    setTheme(b.dataset.theme);
    closeThemePopover();
    dom.themeButton.focus();
  }));
  dom.themePopover.addEventListener("keydown", (e) => {
    if (!dom.themePopover.classList.contains("is-open")) return;
    const current = themeButtons.indexOf(document.activeElement);
    if (current < 0) return;
    let next = current;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); next = (current + 1) % themeButtons.length; }
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); next = (current - 1 + themeButtons.length) % themeButtons.length; }
    else if (e.key === "Home") { e.preventDefault(); next = 0; }
    else if (e.key === "End") { e.preventDefault(); next = themeButtons.length - 1; }
    else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      const theme = themeButtons[current].dataset.theme;
      if (theme === "custom") openCustomizeFromTheme();
      else {
        setTheme(theme);
        closeThemePopover();
        dom.themeButton.focus();
      }
      return;
    } else return;
    const nextTheme = themeButtons[next].dataset.theme;
    // Preview presets while browsing; Custom only activates on Enter/click.
    if (nextTheme !== "custom") setTheme(nextTheme);
    else syncThemeTabStops();
    themeButtons[next].focus();
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
