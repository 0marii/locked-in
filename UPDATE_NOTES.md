# Locked-In update notes

## Critical fixes in this update
- Fixed `scoredHistory` scope by moving eligibility filtering into `getScoredHistory()`, shared by setup stats and history.
- This prevents initialization, end-session reporting, and history rendering from failing due to a `ReferenceError`.
- Hardcore-failed and incomplete sessions now have a null score. Hardcore failure overrides the numerical score.
- Setup completed-session count and focus total now exclude incomplete and failed sessions.
- History and insights averages now average eligible session scores rather than the old focused-time / elapsed-time ratio.
- Report label and history summary label now say **Focus Score**.
- Hovering/focusing a score shows its formula inputs and penalties. Hovering/focusing an Incomplete outcome explains the 70% threshold; Hardcore failures explain the 15-minute break limit.
- Theme changes redraw the history chart using the active theme tokens.
- Bumped static asset cache versions to `v=6`.

## Validation
- `node --check app.js` passes.
- Browser end-to-end testing and Lighthouse have not been run in this environment. Please test Start → End session → Report, history navigation, refresh during an active session, theme changes while history is open, and incomplete/Hardcore outcomes in a browser before deployment.

## Follow-up polish
- Hardcore failures now display **Hardcore failed · no score** in the report instead of the generic incomplete label.
- Replaced the browser prompt-based session editor with a theme-aware modal containing topic/title and notes fields, Save changes, Cancel, and Delete session actions. Escape closes the native dialog and returns focus to the invoking control.
- Session deletion uses the app's themed confirmation dialog.
- Reset editor dirty states and Save buttons when a new session begins.
- Sticky notes update the active session notes directly without falsely marking the notes editor unsaved.
- Ctrl/Cmd+S now saves all dirty topic/notes editors regardless of which element has focus.
- Updated README feature documentation for Blue, Sticky notes, and the 70% scoring threshold.
- Removed unlinked enhancement files and updated package scripts to test only files used by the app.
- Restored a small `tests/` suite and added Open Graph/Twitter preview image metadata. The social preview artwork is `og-image.svg`.
- Updated the author metadata to Mohammad Al-Omari.

## Follow-up validation
- `node --check app.js` passes.
- `npm test` passes (5 static contract tests).
- These checks do not replace browser-based end-to-end testing; timer, dialog focus, storage failure, and theme behavior should still be exercised in a browser before release.
