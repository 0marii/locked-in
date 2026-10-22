import { NOTES_INBOX_KEY } from "./constants.js?v=76";
import { dom, state, tabId } from "./runtime.js?v=76";
import { safeWrite } from "./storage.js?v=76";
import { showToast } from "./toast.js?v=76";
import { download, formatDate, noteFilename } from "./utils.js?v=76";
import { broadcast } from "./sync.js?v=76";
import { askConfirm } from "./theme-nav.js?v=76";
import { deleteStickyNote, persistSessionNotes, renderStickyNoteList, syncStickyNotesUi } from "./session.js?v=76";
import { renderHistory, renderReportNotesList, renderSessionNotesViewer, saveHistory, updateEditNotesSummary } from "./history.js?v=76";

export function ensureNoteItems(session) {
  if (!session) return [];
  if (!Array.isArray(session.noteItems)) {
    const legacy = String(session.notes || "").trim();
    session.noteItems = legacy
      ? [{ id: `legacy-${session.id || Date.now()}`, text: legacy.slice(0, 2000), createdAt: new Date(session.startedAt || Date.now()).toISOString() }]
      : [];
  }
  return session.noteItems;
}

export function composeNotesText(noteItems) {
  return (Array.isArray(noteItems) ? noteItems : [])
    .map((n) => String(n?.text || "").trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4000);
}

export function applyNoteItems(record, items) {
  if (!record) return;
  const next = (Array.isArray(items) ? items : [])
    .map((n) => ({
      id: String(n?.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`),
      text: String(n?.text || "").trim().slice(0, 2000),
      createdAt: n?.createdAt || new Date().toISOString()
    }))
    .filter((n) => n.text)
    .slice(0, 100);
  record.noteItems = next;
  record.notes = record.studied = composeNotesText(next);
}

export function noteItemsFromComposedText(record, text, previousItems) {
  const trimmed = String(text || "").trim().slice(0, 4000);
  const prev = Array.isArray(previousItems) ? previousItems : sessionNoteItems(record);
  const prevText = composeNotesText(prev);
  if (trimmed === prevText) return prev;
  if (!trimmed) return [];
  if (prev.length <= 1) {
    const base = prev[0] || { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, createdAt: record.completedAt || new Date().toISOString() };
    return [{ ...base, text: trimmed.slice(0, 2000) }];
  }
  return trimmed.split(/\n\n+/).map((part, i) => ({
    id: prev[i]?.id || `${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
    text: part.trim().slice(0, 2000),
    createdAt: prev[i]?.createdAt || record.completedAt || new Date().toISOString()
  })).filter((n) => n.text);
}

export function refreshNotesSurfaces() {
  renderNotes();
  renderHistory();
  if (state.viewingNotesId) renderSessionNotesViewer();
  if (state.reportId && state.activeScreen === "report-screen") renderReportNotesList();
  if (state.editingId && dom.editNotesSummary) {
    const item = state.history.find((r) => r.id === state.editingId);
    if (item) updateEditNotesSummary(item);
  }
}

export function saveInbox() {
  if (state.readOnly) return false;
  const ok = safeWrite(NOTES_INBOX_KEY, state.inbox.slice(0, 200));
  if (ok) broadcast({ type: "inbox", source: tabId });
  return ok;
}

export function sessionNoteItems(record) {
  if (Array.isArray(record.noteItems) && record.noteItems.length) return record.noteItems.slice();
  const legacy = String(record.notes || "").trim();
  if (!legacy && !record.topic) return [];
  return legacy ? [{ id: "legacy", text: legacy, createdAt: record.completedAt || new Date().toISOString() }] : [];
}

export function openNoteEditor(target) {
  state.editingNote = target;
  const label = target.scope === "inbox"
    ? "Inbox note"
    : `${target.intent || "Session"}${target.live ? " · in progress" : ""}`;
  if (dom.editNoteContext) dom.editNoteContext.textContent = label;
  dom.editNoteText.value = target.text || "";
  if (typeof dom.editNoteDialog.showModal === "function") dom.editNoteDialog.showModal();
  else {
    const next = window.prompt("Edit note", target.text || "");
    if (next == null) return;
    state.editingNote = { ...target, text: next };
    saveEditedNote();
  }
}

export function saveEditedNote() {
  const target = state.editingNote;
  if (!target) return;
  const text = String(dom.editNoteText?.value || "").trim().slice(0, 2000);
  if (!text) {
    showToast("Note text cannot be empty.");
    dom.editNoteText?.focus();
    return;
  }
  if (target.scope === "inbox") {
    const item = state.inbox.find((n) => n.id === target.noteId);
    if (!item) return;
    const previous = item.text;
    item.text = text;
    if (!saveInbox()) {
      item.text = previous;
      showToast("Could not save note — browser storage unavailable.");
      return;
    }
  } else if (target.live) {
    if (!state.session || state.session.id !== target.sessionId) return;
    const items = ensureNoteItems(state.session);
    const item = items.find((n) => n.id === target.noteId);
    if (!item) return;
    const previous = item.text;
    item.text = text;
    if (!persistSessionNotes()) {
      item.text = previous;
      showToast("Could not save note — browser storage unavailable.");
      return;
    }
    renderStickyNoteList();
    syncStickyNotesUi();
    refreshNotesSurfaces();
    state.editingNote = null;
    dom.editNoteDialog?.close();
    showToast("Note updated.");
    return;
  } else {
    const record = state.history.find((r) => r.id === target.sessionId);
    if (!record) return;
    const items = sessionNoteItems(record);
    const note = items.find((n) => n.id === target.noteId) || items[0];
    if (!note) return;
    const previousItems = sessionNoteItems(record);
    note.text = text;
    applyNoteItems(record, items);
    if (!saveHistory()) {
      applyNoteItems(record, previousItems);
      showToast("Could not save note — browser storage unavailable.");
      return;
    }
  }
  state.editingNote = null;
  dom.editNoteDialog?.close();
  refreshNotesSurfaces();
  showToast("Note updated.");
}

export function deleteEditedNote() {
  const target = state.editingNote;
  if (!target) return;
  askConfirm("Delete this note?", "This removes only this note. Other notes in the session stay.", () => {
    let ok = false;
    if (target.scope === "inbox") {
      const previous = state.inbox.slice();
      state.inbox = state.inbox.filter((n) => n.id !== target.noteId);
      ok = saveInbox();
      if (!ok) {
        state.inbox = previous;
        showToast("Could not delete note — browser storage unavailable.");
        return;
      }
    } else if (target.live) {
      if (!state.session || state.session.id !== target.sessionId) return;
      ok = deleteStickyNote(target.noteId);
      if (!ok) return;
    } else {
      const record = state.history.find((r) => r.id === target.sessionId);
      if (!record) return;
      const previousItems = sessionNoteItems(record);
      applyNoteItems(record, previousItems.filter((n) => n.id !== target.noteId));
      ok = saveHistory();
      if (!ok) {
        applyNoteItems(record, previousItems);
        showToast("Could not delete note — browser storage unavailable.");
        return;
      }
    }
    state.editingNote = null;
    if (dom.editNoteDialog?.open) dom.editNoteDialog.close();
    refreshNotesSurfaces();
    showToast("Note deleted.");
  }, "Delete note");
}

export function syncNotesFilterBar() {
  const filter = state.notesSessionFilter;
  const active = Boolean(filter?.id);
  if (dom.notesFilterBar) {
    dom.notesFilterBar.hidden = !active;
    dom.notesFilterBar.classList.toggle("is-hidden", !active);
    dom.notesFilterBar.classList.toggle("is-flashing", active);
    if (active) {
      window.setTimeout(() => dom.notesFilterBar?.classList.remove("is-flashing"), 1600);
    }
  }
  if (dom.notesFilterLabel) {
    dom.notesFilterLabel.textContent = active
      ? `“${filter.intent}” session notes`
      : "";
  }
  document.getElementById("notes-screen")?.classList.toggle("has-session-filter", active);
}

export function clearNotesSessionFilter() {
  state.notesSessionFilter = null;
  syncNotesFilterBar();
  renderNotes();
  showToast("Notes filter cleared.");
  dom.notesSearch?.focus();
}

export function renderNotes() {
  const q = dom.notesSearch.value.trim().toLocaleLowerCase();
  const sessionFilterId = state.notesSessionFilter?.id || null;
  syncNotesFilterBar();
  dom.notesInbox.replaceChildren();
  dom.notesSessions.replaceChildren();

  const inboxRows = sessionFilterId
    ? []
    : state.inbox.filter((n) => !q || n.text.toLocaleLowerCase().includes(q));
  inboxRows.forEach((n) => {
    const card = document.createElement("article");
    card.className = "note-card";
    const p = document.createElement("p");
    p.textContent = n.text;
    const meta = document.createElement("small");
    meta.textContent = `Inbox · ${formatDate(n.createdAt)}`;
    const actions = document.createElement("div");
    actions.className = "note-card-actions";
    actions.append(createNoteItemOptions({
      text: n.text,
      label: "inbox-note",
      onEdit: () => openNoteEditor({ scope: "inbox", noteId: n.id, text: n.text }),
      onDelete: () => {
        state.editingNote = { scope: "inbox", noteId: n.id, text: n.text };
        deleteEditedNote();
      }
    }));
    card.append(p, meta, actions);
    dom.notesInbox.append(card);
  });

  const groups = [];
  if (state.session && (!sessionFilterId || state.session.id === sessionFilterId)) {
    const items = ensureNoteItems(state.session);
    const filtered = items.filter((item) => !q || [state.session.intent, item.text].join(" ").toLocaleLowerCase().includes(q));
    if (filtered.length) {
      groups.push({
        sessionId: state.session.id,
        intent: state.session.intent,
        live: true,
        outcome: "active",
        completedAt: state.session.startedAt,
        topic: state.session.topic || "",
        items: filtered
      });
    }
  }
  state.history.forEach((r) => {
    if (sessionFilterId && r.id !== sessionFilterId) return;
    const items = sessionNoteItems(r);
    if (!items.length && !r.topic) return;
    const filtered = items.filter((item) => !q || [r.intent, r.topic, item.text].join(" ").toLocaleLowerCase().includes(q));
    if (!filtered.length && q) return;
    if (!filtered.length && !items.length && r.topic && (!q || [r.intent, r.topic].join(" ").toLocaleLowerCase().includes(q))) {
      groups.push({
        sessionId: r.id, intent: r.intent, live: false, outcome: r.outcome,
        completedAt: r.completedAt, topic: r.topic || "", items: []
      });
      return;
    }
    if (!filtered.length) return;
    groups.push({
      sessionId: r.id,
      intent: r.intent,
      live: false,
      outcome: r.outcome,
      completedAt: r.completedAt,
      topic: r.topic || "",
      items: filtered
    });
  });

  groups.forEach((group) => {
    const card = document.createElement("article");
    card.className = "session-notes-group";
    if (group.live) card.classList.add("is-live");

    const head = document.createElement("div");
    head.className = "session-notes-group-head";
    const title = document.createElement("h3");
    title.textContent = group.intent;
    const meta = document.createElement("small");
    const countLabel = `${group.items.length} note${group.items.length === 1 ? "" : "s"}`;
    meta.textContent = group.live
      ? `In progress · ${countLabel}`
      : `${formatDate(group.completedAt)} · ${group.outcome === "completed" ? "Completed" : "Attempt"} · ${countLabel}`;
    head.append(title, meta);
    if (group.topic) {
      const topic = document.createElement("strong");
      topic.className = "session-notes-group-topic";
      topic.textContent = group.topic;
      head.append(topic);
    }
    if (group.items.length) {
      const groupActions = document.createElement("div");
      groupActions.className = "note-card-actions session-notes-group-actions";
      const allText = group.items.map((item, i) => `Note ${i + 1}\n${item.text}`).join("\n\n");
      groupActions.append(createNoteOptionsMenu([
        { label: "Copy all in this group", onClick: () => copyNoteText(allText) },
        { label: "Download all in this group", onClick: () => downloadNoteText(allText, group.intent || "session-notes") }
      ]));
      head.append(groupActions);
    }
    card.append(head);

    if (!group.items.length) {
      const empty = document.createElement("p");
      empty.className = "empty-inline";
      empty.textContent = "No notes in this session yet.";
      card.append(empty);
    } else {
      const list = document.createElement("ul");
      list.className = "session-note-items";
      group.items.forEach((item, index) => {
        const li = document.createElement("li");
        li.className = "session-note-item";
        const label = document.createElement("strong");
        label.textContent = `Note ${index + 1}`;
        const p = document.createElement("p");
        p.textContent = item.text;
        const foot = document.createElement("div");
        foot.className = "session-note-item-foot";
        const time = document.createElement("small");
        time.textContent = formatDate(item.createdAt);
        const actions = document.createElement("div");
        actions.className = "note-card-actions";
        actions.append(createNoteItemOptions({
          text: item.text,
          label: `${group.intent || "note"}-${index + 1}`,
          onEdit: () => openNoteEditor({
            scope: group.live ? "live" : "history",
            sessionId: group.sessionId,
            noteId: item.id,
            intent: group.intent,
            live: group.live,
            text: item.text
          }),
          onDelete: () => {
            state.editingNote = {
              scope: group.live ? "live" : "history",
              sessionId: group.sessionId,
              noteId: item.id,
              intent: group.intent,
              live: group.live,
              text: item.text
            };
            deleteEditedNote();
          }
        }));
        foot.append(time, actions);
        li.append(label, p, foot);
        list.append(li);
      });
      card.append(list);
    }
    dom.notesSessions.append(card);
  });

  const inboxEmpty = !inboxRows.length;
  const sessionsEmpty = !groups.length;
  if (sessionFilterId) {
    const empty = document.createElement("div");
    empty.className = "notes-empty-state";
    empty.innerHTML = "<strong>Inbox hidden</strong><p>Clear the session filter to see quick thoughts again.</p>";
    dom.notesInbox.append(empty);
  } else if (!state.inbox.length) {
    const empty = document.createElement("div");
    empty.className = "notes-empty-state";
    empty.innerHTML = "<strong>No quick thoughts yet</strong><p>Use Quick capture above to save a thought without an active session.</p>";
    dom.notesInbox.append(empty);
  } else if (!inboxRows.length) {
    const empty = document.createElement("div");
    empty.className = "notes-empty-state";
    empty.innerHTML = "<strong>No matches</strong><p>No inbox notes match your search.</p>";
    dom.notesInbox.append(empty);
  }
  if (!groups.length) {
    const empty = document.createElement("div");
    empty.className = "notes-empty-state";
    empty.innerHTML = sessionFilterId
      ? "<strong>No notes for this session</strong><p>Clear the filter to browse all session notes.</p>"
      : q
        ? "<strong>No matches</strong><p>No session notes match your search.</p>"
        : "<strong>No session notes yet</strong><p>Notes you add during a focus session will show up here.</p>";
    dom.notesSessions.append(empty);
  }
  const collapseInbox = Boolean(sessionFilterId) || (!state.inbox.length && !q);
  dom.notesColumns?.classList.toggle("is-inbox-empty", collapseInbox);
  dom.notesColumns?.classList.toggle("is-sessions-empty", sessionsEmpty && !collapseInbox);
  dom.notesInboxPanel?.classList.toggle("is-empty", inboxEmpty);
  dom.notesSessionsPanel?.classList.toggle("is-empty", sessionsEmpty);
  if (sessionFilterId && groups.length) {
    const first = dom.notesSessions.querySelector(".session-notes-group");
    first?.classList.add("is-filter-target");
    first?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
}

export function addInboxNote() {
  const text=dom.noteCaptureInput.value.trim();if(!text)return;
  const note={id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,text,createdAt:new Date().toISOString()};
  state.inbox.unshift(note);
  if (!saveInbox()) {
    state.inbox=state.inbox.filter(n=>n.id!==note.id);
    showToast("Could not save note — browser storage unavailable. Try Save backup.");
    return;
  }
  dom.noteCaptureInput.value="";renderNotes();showToast("Note added to your inbox.");
}

export async function copyNoteText(text) {
  const value = String(text ?? "");
  if (!value.trim()) {
    showToast("Nothing to copy.");
    return false;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    showToast("Note copied.");
    return true;
  } catch (_) {
    showToast("Could not copy note.");
    return false;
  }
}

export function downloadNoteText(text, label = "note") {
  const value = String(text ?? "");
  if (!value.trim()) {
    showToast("Nothing to download.");
    return false;
  }
  download(noteFilename(label), value, "text/plain;charset=utf-8");
  showToast("Note download ready.");
  return true;
}

export function closeOpenNoteMenus(except = null) {
  document.querySelectorAll(".note-options.is-open").forEach((menu) => {
    if (except && menu === except) return;
    menu.classList.remove("is-open");
    const toggle = menu.querySelector(".note-options-toggle");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  });
}

export function createNoteOptionsMenu(items) {
  const wrap = document.createElement("div");
  wrap.className = "note-options";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "note-options-toggle";
  toggle.setAttribute("aria-haspopup", "menu");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Note options");
  toggle.title = "Options";
  toggle.textContent = "⋯";
  const menu = document.createElement("div");
  menu.className = "note-options-menu";
  menu.setAttribute("role", "menu");
  (items || []).forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `note-options-item${item.danger ? " is-danger" : ""}`;
    btn.setAttribute("role", "menuitem");
    btn.textContent = item.label;
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      closeOpenNoteMenus();
      item.onClick?.();
    });
    menu.append(btn);
  });
  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const willOpen = !wrap.classList.contains("is-open");
    closeOpenNoteMenus();
    if (!willOpen) return;
    wrap.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
  });
  wrap.append(toggle, menu);
  return wrap;
}

export function createNoteItemOptions({ text, label = "note", onEdit, onDelete }) {
  const items = [
    { label: "Copy", onClick: () => copyNoteText(text) },
    { label: "Download", onClick: () => downloadNoteText(text, label) }
  ];
  if (onEdit) items.push({ label: "Edit", onClick: onEdit });
  if (onDelete) items.push({ label: "Delete", danger: true, onClick: onDelete });
  return createNoteOptionsMenu(items);
}
