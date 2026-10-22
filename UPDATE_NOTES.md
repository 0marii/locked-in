# Locked-In update notes

## 3.1.1 — Safe release hardening
- Aligned app version `3.1.1`, asset query `?v=27`, and service worker cache `locked-in-v11` (precache uses the same versioned CSS/JS URLs as `index.html`).
- Regenerated PWA icons from the existing LI brand mark; added a maskable 512 icon and additive manifest fields (`id`, `lang`, `categories`).
- Added safe-area inset padding for fixed chrome and replaced `100vw` width formulas that could cause horizontal overflow (no layout redesign).
- Date picker keeps the same open/close UX and gains a Tab focus trap plus focus restore on close.
- Removed unused no-op `esc()` helper.
- Docs and static contracts updated for honesty (no false Ctrl/Cmd+S claim; 7 static contract tests).

## Critical fixes (earlier)
- Fixed `scoredHistory` scope by moving eligibility filtering into `getScoredHistory()`, shared by setup stats and history.
- This prevents initialization, end-session reporting, and history rendering from failing due to a `ReferenceError`.
- Hardcore-failed and incomplete sessions now have a null score. Hardcore failure overrides the numerical score.
- Setup completed-session count and focus total now exclude incomplete and failed sessions.
- History and insights averages now average eligible session scores rather than the old focused-time / elapsed-time ratio.
- Report and history continue to show the **COMPLETION SCORE** label (UI copy unchanged).
- Hovering/focusing a score shows its formula inputs and penalties. Hovering/focusing an Incomplete outcome explains the 70% threshold; Hardcore failures explain the 15-minute break limit.
- Theme changes redraw the history chart using the active theme tokens.

## Validation
- `npm run check` passes (syntax + 7 static contract tests).
- Browser end-to-end testing and Lighthouse have not been run in this environment. Please test Start → End session → Report, history navigation, date picker keyboard (Tab/Escape), refresh during an active session, theme changes while history is open, and incomplete/Hardcore outcomes in a browser before deployment.

## Follow-up polish (earlier)
- Hardcore failures now display **Hardcore failed · no score** in the report instead of the generic incomplete label.
- Replaced the browser prompt-based session editor with a theme-aware modal containing topic/title and notes fields, Save changes, Cancel, and Delete session actions. Escape closes the native dialog and returns focus to the invoking control.
- Session deletion uses the app's themed confirmation dialog.
- Reset editor dirty states and Save buttons when a new session begins.
- Sticky notes update the active session notes directly without falsely marking the notes editor unsaved.
- Sticky / viewed-note editors save with Ctrl/Cmd+Enter (not Ctrl/Cmd+S).
- Updated README feature documentation for Blue, Sticky notes, and the 70% scoring threshold.
- Removed unlinked enhancement files and updated package scripts to test only files used by the app.
- Restored a small `tests/` suite and added Open Graph/Twitter preview image metadata. The social preview artwork is `og-image.svg`.
- Updated the author metadata to Mohammad Al-Omari.
