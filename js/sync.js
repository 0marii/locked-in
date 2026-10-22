import { ACTIVE_SESSION_KEY, CHANNEL_NAME, HISTORY_KEY, NOTES_INBOX_KEY } from "./constants.js?v=76";
import { state, tabId } from "./runtime.js?v=76";
import { safeRead } from "./storage.js?v=76";
import { showToast } from "./toast.js?v=76";
import { navigate } from "./theme-nav.js?v=76";
import { loadData } from "./setup.js?v=76";
import { stopTimerLoop } from "./session.js?v=76";
import { renderAll } from "./bind.js?v=76";

export function broadcast(message) {
  try { state.channel?.postMessage(message); } catch (_) {}
}

export function initSync() {
  try {
    state.channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null;
    state.channel?.addEventListener("message", (event) => {
      if (!event.data || event.data.source === tabId) return;
      if (event.data.type === "active-session") {
        const active = safeRead(ACTIVE_SESSION_KEY, null);
        if (active && state.session?.id !== active.id) {
          state.readOnly = true;
          showToast("This session is active in another tab. This tab is read-only.");
        } else if (!active && state.session) {
          state.session = null;
          stopTimerLoop();
          navigate("setup-screen");
        }
      }
      if (event.data.type === "history" || event.data.type === "inbox") { loadData(); renderAll(); }
    });
  } catch (_) {}
  window.addEventListener("storage", (event) => {
    if (event.key === ACTIVE_SESSION_KEY) {
      const active = safeRead(ACTIVE_SESSION_KEY, null);
      if (active && active.tabId && active.tabId !== tabId) {
        if (state.session?.id !== active.id) {
          state.readOnly = true;
          showToast("A focus session is active in another tab.");
        }
      } else if (!active && state.session) {
        state.session = null; stopTimerLoop(); navigate("setup-screen");
      }
    }
    if (event.key === HISTORY_KEY || event.key === NOTES_INBOX_KEY) { loadData(); renderAll(); }
  });
}
