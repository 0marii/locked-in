import { showToast } from "./toast.js?v=202";

export function safeRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (error) {
    console.warn("Locked-In storage read failed.", error);
    return fallback;
  }
}

export function safeWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error("Locked-In storage write failed.", error);
    showToast("Browser storage is unavailable or full. Export a backup before continuing.");
    return false;
  }
}
