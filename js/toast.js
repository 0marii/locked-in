import { dom, state } from "./runtime.js?v=76";

export function showToast(message) {
  if (!dom.toast) return;
  dom.toast.textContent = message;
  dom.toast.classList.add("is-visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => dom.toast.classList.remove("is-visible"), 3600);
}
