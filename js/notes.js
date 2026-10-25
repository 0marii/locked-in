import { MAX_NOTE_GROUPS, NOTE_GROUPS_KEY, NOTES_INBOX_KEY } from "./constants.js?v=187";
import { dom, state, tabId } from "./runtime.js?v=187";
import { safeRead, safeWrite } from "./storage.js?v=187";
import { showToast } from "./toast.js?v=187";
import { download, formatDate, formatShortDate, localDayKey, noteFilename, setFilterGlow } from "./utils.js?v=187";
import { broadcast } from "./sync.js?v=187";
import { askConfirm } from "./theme-nav.js?v=187";
import { deleteStickyNote, persistSessionNotes, renderStickyNoteList, syncStickyNotesUi } from "./session.js?v=187";
import { renderHistory, renderReportNotesList, renderSessionNotesViewer, saveHistory, updateEditNotesSummary } from "./history.js?v=187";

const NEW_GROUP_OPTION = "__new__";

export function normalizeNoteFields(raw = {}) {
  const title = String(raw?.title || "").trim().slice(0, 120);
  const text = String(raw?.text || "").trim().slice(0, 2000);
  if (!title && !text) return null;
  return {
    id: String(raw?.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`),
    title,
    text,
    groupId: String(raw?.groupId || "").trim().slice(0, 64),
    createdAt: raw?.createdAt || new Date().toISOString()
  };
}

export function normalizeNoteGroup(raw = {}) {
  const name = String(raw?.name || "").trim().slice(0, 48);
  if (!name) return null;
  return {
    id: String(raw?.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`),
    name,
    createdAt: raw?.createdAt || new Date().toISOString()
  };
}

export function formatNotePlainText(note) {
  const title = String(note?.title || "").trim();
  const text = String(note?.text || "").trim();
  if (title && text) return `${title}\n\n${text}`;
  return title || text;
}

export function noteSearchBlob(note) {
  const groupName = findNoteGroup(note?.groupId)?.name || "";
  return [note?.title, note?.text, groupName].map((part) => String(part || "").trim()).filter(Boolean).join(" ");
}

export function findNoteGroup(id) {
  const key = String(id || "").trim();
  if (!key) return null;
  return (state.noteGroups || []).find((g) => g.id === key) || null;
}

export function loadNoteGroups() {
  const raw = safeRead(NOTE_GROUPS_KEY, []);
  state.noteGroups = (Array.isArray(raw) ? raw : [])
    .map((g) => normalizeNoteGroup(g))
    .filter(Boolean)
    .slice(0, MAX_NOTE_GROUPS);
  return state.noteGroups;
}

export function saveNoteGroups() {
  if (state.readOnly) return false;
  const ok = safeWrite(NOTE_GROUPS_KEY, (state.noteGroups || []).slice(0, MAX_NOTE_GROUPS));
  if (ok) broadcast({ type: "inbox", source: tabId });
  return ok;
}

export function createNoteGroup(name, { silent = false } = {}) {
  const group = normalizeNoteGroup({ name });
  if (!group) {
    if (!silent) showToast("Enter a group name.");
    return null;
  }
  const existing = state.noteGroups.find((g) => g.name.toLocaleLowerCase() === group.name.toLocaleLowerCase());
  if (existing) {
    if (!silent) showToast("That group already exists.");
    return existing;
  }
  if (state.noteGroups.length >= MAX_NOTE_GROUPS) {
    if (!silent) showToast(`You can have up to ${MAX_NOTE_GROUPS} groups.`);
    return null;
  }
  state.noteGroups = [...state.noteGroups, group];
  if (!saveNoteGroups()) {
    state.noteGroups = state.noteGroups.filter((g) => g.id !== group.id);
    if (!silent) showToast("Could not save group — browser storage unavailable.");
    return null;
  }
  if (!silent) showToast(`Group “${group.name}” created.`);
  return group;
}

let noteGroupDialogContext = null;

export function closeNoteGroupDialog({ cancelled = false } = {}) {
  const ctx = noteGroupDialogContext;
  noteGroupDialogContext = null;
  if (dom.noteGroupDialog?.open) dom.noteGroupDialog.close();
  if (cancelled) ctx?.onCancel?.();
}

export function openNoteGroupDialog({
  mode = "create",
  groupId = "",
  onDone = null,
  onCancel = null
} = {}) {
  const existing = mode === "rename" ? findNoteGroup(groupId) : null;
  if (mode === "rename" && !existing) return;
  noteGroupDialogContext = { mode, groupId: existing?.id || "", onDone, onCancel };
  if (dom.noteGroupHeading) {
    dom.noteGroupHeading.textContent = mode === "rename" ? "Rename group" : "New group";
  }
  if (dom.noteGroupCopy) {
    dom.noteGroupCopy.textContent = mode === "rename"
      ? "Update the name for this inbox folder."
      : "Name a folder for related notes.";
  }
  if (dom.noteGroupSave) {
    dom.noteGroupSave.textContent = mode === "rename" ? "Save name" : "Create group";
  }
  if (dom.noteGroupName) {
    dom.noteGroupName.value = existing?.name || "";
  }
  if (typeof dom.noteGroupDialog?.showModal === "function") {
    dom.noteGroupDialog.showModal();
    requestAnimationFrame(() => {
      dom.noteGroupName?.focus();
      dom.noteGroupName?.select?.();
    });
  }
}

export function submitNoteGroupDialog() {
  const ctx = noteGroupDialogContext;
  if (!ctx) return;
  const name = String(dom.noteGroupName?.value || "").trim();
  if (!name) {
    showToast("Enter a group name.");
    dom.noteGroupName?.focus();
    return;
  }

  if (ctx.mode === "rename") {
    const group = findNoteGroup(ctx.groupId);
    if (!group) {
      closeNoteGroupDialog();
      return;
    }
    const normalized = normalizeNoteGroup({ ...group, name });
    if (!normalized) {
      showToast("Group name cannot be empty.");
      return;
    }
    const clash = state.noteGroups.find(
      (g) => g.id !== group.id && g.name.toLocaleLowerCase() === normalized.name.toLocaleLowerCase()
    );
    if (clash) {
      showToast("Another group already uses that name.");
      return;
    }
    const previous = group.name;
    group.name = normalized.name;
    if (!saveNoteGroups()) {
      group.name = previous;
      showToast("Could not rename group — browser storage unavailable.");
      return;
    }
    const done = ctx.onDone;
    closeNoteGroupDialog();
    renderNotes();
    showToast("Group renamed.");
    done?.(group);
    return;
  }

  const group = createNoteGroup(name);
  if (!group) {
    dom.noteGroupName?.focus();
    return;
  }
  const done = ctx.onDone;
  closeNoteGroupDialog();
  renderNotes();
  done?.(group);
}

export function renameNoteGroup(id) {
  openNoteGroupDialog({ mode: "rename", groupId: id });
}

export function deleteNoteGroup(id) {
  const group = findNoteGroup(id);
  if (!group) return;
  askConfirm(
    "Delete this group?",
    `“${group.name}” will be removed. Notes inside stay in Inbox as ungrouped.`,
    () => {
      const previousGroups = state.noteGroups.slice();
      const previousInbox = state.inbox.map((n) => ({ ...n }));
      state.noteGroups = state.noteGroups.filter((g) => g.id !== id);
      state.inbox = state.inbox.map((n) => (n.groupId === id ? { ...n, groupId: "" } : n));
      const groupsOk = saveNoteGroups();
      const inboxOk = saveInbox();
      if (!groupsOk || !inboxOk) {
        state.noteGroups = previousGroups;
        state.inbox = previousInbox;
        saveNoteGroups();
        saveInbox();
        showToast("Could not delete group — browser storage unavailable.");
        return;
      }
      renderNotes();
      showToast("Group deleted.");
    },
    "Delete group"
  );
}

export function promptNewNoteGroup(options = {}) {
  openNoteGroupDialog({ mode: "create", ...options });
}

function syncNoteGroupSelect(selectedId = "") {
  const select = dom.editNoteGroup;
  if (!select) return;
  const current = String(selectedId || "");
  select.replaceChildren();
  const ungrouped = document.createElement("option");
  ungrouped.value = "";
  ungrouped.textContent = "Ungrouped";
  select.append(ungrouped);
  state.noteGroups.forEach((g) => {
    const opt = document.createElement("option");
    opt.value = g.id;
    opt.textContent = g.name;
    select.append(opt);
  });
  const create = document.createElement("option");
  create.value = NEW_GROUP_OPTION;
  create.textContent = "+ New group…";
  select.append(create);
  select.value = state.noteGroups.some((g) => g.id === current) ? current : "";
}

export function onNoteGroupSelectChange() {
  const select = dom.editNoteGroup;
  if (!select || select.value !== NEW_GROUP_OPTION) return;

  const draft = {
    ...(state.editingNote || { scope: "inbox", mode: "create" }),
    title: String(dom.editNoteTitle?.value || ""),
    text: String(dom.editNoteText?.value || ""),
    groupId: String(state.editingNote?.groupId || "")
  };
  const wasNoteOpen = Boolean(dom.editNoteDialog?.open);
  select.value = draft.groupId && findNoteGroup(draft.groupId) ? draft.groupId : "";

  if (wasNoteOpen) {
    // Browsers only allow one modal dialog; reopen the note after naming the group.
    dom.editNoteDialog.close();
  }

  openNoteGroupDialog({
    mode: "create",
    onDone: (group) => {
      if (wasNoteOpen) {
        openNoteEditor({
          ...draft,
          groupId: group?.id || draft.groupId || ""
        });
      } else {
        syncNoteGroupSelect(group?.id || "");
      }
    },
    onCancel: () => {
      if (wasNoteOpen) openNoteEditor(draft);
    }
  });
}

function fillNoteContent(container, note) {
  const title = String(note?.title || "").trim();
  const text = String(note?.text || "").trim();
  if (title) {
    const heading = document.createElement("strong");
    heading.className = "note-card-title";
    heading.textContent = title;
    container.append(heading);
  }
  if (text) {
    const body = document.createElement("p");
    body.className = "note-card-body";
    body.textContent = text;
    container.append(body);
  } else if (!title) {
    const body = document.createElement("p");
    body.className = "note-card-body";
    body.textContent = "";
    container.append(body);
  }
}

export function ensureNoteItems(session) {
  if (!session) return [];
  if (!Array.isArray(session.noteItems)) {
    const legacy = String(session.notes || "").trim();
    session.noteItems = legacy
      ? [{ id: `legacy-${session.id || Date.now()}`, title: "", text: legacy.slice(0, 2000), createdAt: new Date(session.startedAt || Date.now()).toISOString() }]
      : [];
  }
  return session.noteItems;
}

export function composeNotesText(noteItems) {
  return (Array.isArray(noteItems) ? noteItems : [])
    .map((n) => formatNotePlainText(n))
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4000);
}

export function applyNoteItems(record, items) {
  if (!record) return;
  const next = (Array.isArray(items) ? items : [])
    .map((n) => normalizeNoteFields(n))
    .filter(Boolean)
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
    return [normalizeNoteFields({ ...base, title: base.title || "", text: trimmed.slice(0, 2000) })].filter(Boolean);
  }
  return trimmed.split(/\n\n+/).map((part, i) => normalizeNoteFields({
    id: prev[i]?.id || `${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
    title: prev[i]?.title || "",
    text: part.trim().slice(0, 2000),
    createdAt: prev[i]?.createdAt || record.completedAt || new Date().toISOString()
  })).filter(Boolean);
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

function resolveComposerGroupId() {
  const raw = String(dom.editNoteGroup?.value || "").trim();
  if (!raw || raw === NEW_GROUP_OPTION) return "";
  return findNoteGroup(raw) ? raw : "";
}

export function sessionNoteItems(record) {
  if (Array.isArray(record.noteItems) && record.noteItems.length) {
    return record.noteItems.map((n) => normalizeNoteFields(n)).filter(Boolean);
  }
  const legacy = String(record.notes || "").trim();
  if (!legacy && !record.topic) return [];
  return legacy
    ? [normalizeNoteFields({ id: "legacy", title: "", text: legacy, createdAt: record.completedAt || new Date().toISOString() })].filter(Boolean)
    : [];
}

function readComposerFields() {
  return {
    title: String(dom.editNoteTitle?.value || "").trim().slice(0, 120),
    text: String(dom.editNoteText?.value || "").trim().slice(0, 2000),
    groupId: resolveComposerGroupId()
  };
}

function closeNoteComposer() {
  state.editingNote = null;
  if (dom.editNoteDialog?.open) dom.editNoteDialog.close();
}

function setComposerGroupVisible(show) {
  const select = dom.editNoteGroup;
  if (!select) return;
  const label = select.previousElementSibling;
  select.hidden = !show;
  if (label?.classList?.contains("note-composer-label")) label.hidden = !show;
}

/** Open the title + body composer for a new inbox note. */
export function openNoteComposer(options = {}) {
  openNoteEditor({ scope: "inbox", mode: "create", groupId: options.groupId || "" });
}

export function openNoteEditor(target) {
  const isCreate = target?.mode === "create" || (target?.scope === "inbox" && !target?.noteId);
  const isInbox = isCreate || target?.scope === "inbox";
  state.editingNote = { ...target, mode: isCreate ? "create" : (target?.mode || "edit") };
  const label = isCreate
    ? "Saved to your inbox"
    : target.scope === "inbox"
      ? "Inbox note"
      : `${target.intent || "Session"}${target.live ? " · in progress" : ""}`;
  if (dom.editNoteHeading) dom.editNoteHeading.textContent = isCreate ? "New note" : "Edit note";
  if (dom.editNoteContext) {
    dom.editNoteContext.textContent = label;
    dom.editNoteContext.hidden = !label;
  }
  if (dom.editNoteDelete) dom.editNoteDelete.hidden = isCreate;
  if (dom.editNoteSave) dom.editNoteSave.textContent = isCreate ? "Save note" : "Save changes";
  if (dom.editNoteTitle) dom.editNoteTitle.value = target.title || "";
  if (dom.editNoteText) dom.editNoteText.value = target.text || "";
  setComposerGroupVisible(isInbox);
  if (isInbox) syncNoteGroupSelect(target.groupId || "");
  if (typeof dom.editNoteDialog?.showModal === "function") {
    dom.editNoteDialog.showModal();
    requestAnimationFrame(() => {
      const focusEl = isCreate || !String(target.title || "").trim()
        ? dom.editNoteTitle
        : dom.editNoteText;
      focusEl?.focus();
      if (focusEl?.setSelectionRange && typeof focusEl.value === "string") {
        const end = focusEl.value.length;
        try { focusEl.setSelectionRange(end, end); } catch (_) {}
      }
    });
  } else {
    const title = window.prompt("Note title (optional)", target.title || "");
    if (title == null) return;
    const text = window.prompt("Note body", target.text || "");
    if (text == null) return;
    state.editingNote = { ...state.editingNote, title, text };
    if (dom.editNoteTitle) dom.editNoteTitle.value = title;
    if (dom.editNoteText) dom.editNoteText.value = text;
    saveEditedNote();
  }
}

export function saveEditedNote() {
  const target = state.editingNote;
  if (!target) return;
  const fields = readComposerFields();
  if (!fields.title && !fields.text) {
    showToast("Add a title or some text.");
    dom.editNoteTitle?.focus();
    return;
  }
  const isCreate = target.mode === "create" || (target.scope === "inbox" && !target.noteId);

  if (isCreate) {
    const note = normalizeNoteFields({ ...fields });
    if (!note) return;
    state.inbox.unshift(note);
    if (!saveInbox()) {
      state.inbox = state.inbox.filter((n) => n.id !== note.id);
      showToast("Could not save note — browser storage unavailable.");
      return;
    }
    closeNoteComposer();
    refreshNotesSurfaces();
    showToast("Note added to your inbox.");
    return;
  }

  if (target.scope === "inbox") {
    const item = state.inbox.find((n) => n.id === target.noteId);
    if (!item) return;
    const previous = { title: item.title || "", text: item.text, groupId: item.groupId || "" };
    item.title = fields.title;
    item.text = fields.text;
    item.groupId = fields.groupId || "";
    if (!saveInbox()) {
      item.title = previous.title;
      item.text = previous.text;
      item.groupId = previous.groupId;
      showToast("Could not save note — browser storage unavailable.");
      return;
    }
  } else if (target.live) {
    if (!state.session || state.session.id !== target.sessionId) return;
    const items = ensureNoteItems(state.session);
    const item = items.find((n) => n.id === target.noteId);
    if (!item) return;
    const previous = { title: item.title || "", text: item.text };
    item.title = fields.title;
    item.text = fields.text;
    if (!persistSessionNotes()) {
      item.title = previous.title;
      item.text = previous.text;
      showToast("Could not save note — browser storage unavailable.");
      return;
    }
    renderStickyNoteList();
    syncStickyNotesUi();
    closeNoteComposer();
    refreshNotesSurfaces();
    showToast("Note updated.");
    return;
  } else {
    const record = state.history.find((r) => r.id === target.sessionId);
    if (!record) return;
    const items = sessionNoteItems(record);
    const note = items.find((n) => n.id === target.noteId) || items[0];
    if (!note) return;
    const previousItems = sessionNoteItems(record);
    note.title = fields.title;
    note.text = fields.text;
    applyNoteItems(record, items);
    if (!saveHistory()) {
      applyNoteItems(record, previousItems);
      showToast("Could not save note — browser storage unavailable.");
      return;
    }
  }
  closeNoteComposer();
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
    closeNoteComposer();
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
  if (dom.notesSessionPick) dom.notesSessionPick.value = "all";
  syncNotesFilterBar();
  renderNotes();
  showToast("Notes filter cleared.");
  dom.notesSearch?.focus();
}

function buildInboxNoteItem(n, index, groupLabel) {
  const li = document.createElement("li");
  li.className = "session-note-item";
  const content = document.createElement("div");
  content.className = "note-card-content";
  fillNoteContent(content, n);
  const foot = document.createElement("div");
  foot.className = "session-note-item-foot";
  const time = document.createElement("small");
  time.textContent = formatDate(n.createdAt);
  const actions = document.createElement("div");
  actions.className = "note-card-actions";
  const plain = formatNotePlainText(n);
  actions.append(createNoteItemOptions({
    text: plain,
    label: n.title || `${groupLabel || "inbox"}-${index + 1}`,
    onEdit: () => openNoteEditor({
      scope: "inbox",
      noteId: n.id,
      title: n.title || "",
      text: n.text || "",
      groupId: n.groupId || ""
    }),
    onDelete: () => {
      state.editingNote = {
        scope: "inbox",
        noteId: n.id,
        title: n.title || "",
        text: n.text || "",
        groupId: n.groupId || ""
      };
      deleteEditedNote();
    }
  }));
  foot.append(time);
  li.append(content, foot, actions);
  return li;
}

function renderInboxGroupCard({ id, name, items, query }) {
  const card = document.createElement("article");
  card.className = "session-notes-group inbox-notes-group";
  if (!id) card.classList.add("is-ungrouped");

  const head = document.createElement("div");
  head.className = "session-notes-group-head";
  const title = document.createElement("h3");
  title.textContent = name;
  const meta = document.createElement("small");
  meta.textContent = `${items.length} note${items.length === 1 ? "" : "s"}`;
  head.append(title, meta);

  const groupActions = document.createElement("div");
  groupActions.className = "note-card-actions session-notes-group-actions";
  const menuItems = [
    { label: "Add note here", onClick: () => openNoteComposer({ groupId: id || "" }) }
  ];
  if (items.length) {
    const allText = items.map((item, i) => `Note ${i + 1}\n${formatNotePlainText(item)}`).join("\n\n");
    menuItems.push(
      { label: "Copy all in this group", onClick: () => copyNoteText(allText) },
      { label: "Download all in this group", onClick: () => downloadNoteText(allText, name || "inbox-group") }
    );
  }
  if (id) {
    menuItems.push(
      { label: "Rename group", onClick: () => renameNoteGroup(id) },
      { label: "Delete group", danger: true, onClick: () => deleteNoteGroup(id) }
    );
  }
  groupActions.append(createNoteOptionsMenu(menuItems));
  head.append(groupActions);
  card.append(head);

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty-inline";
    empty.textContent = query
      ? "No matching notes in this group."
      : "No notes in this group yet.";
    card.append(empty);
  } else {
    const list = document.createElement("ul");
    list.className = "session-note-items";
    items.forEach((item, index) => list.append(buildInboxNoteItem(item, index, name)));
    card.append(list);
  }
  return card;
}

function readNotesScopeFilter() {
  const value = String(dom.notesScopeFilter?.value || "all");
  return ["all", "inbox", "sessions"].includes(value) ? value : "all";
}

function readNotesGroupFilter() {
  return String(dom.notesGroupFilter?.value || "all");
}

function readNotesSessionPick() {
  return String(dom.notesSessionPick?.value || "all");
}

function readNotesDateRange() {
  const fromKey = String(dom.notesDateFrom?.value || "").trim();
  const toKey = String(dom.notesDateTo?.value || "").trim();
  return { fromKey, toKey };
}

function sessionDayKey(record) {
  const raw = record?.completedAt || record?.startedAt || "";
  return raw ? localDayKey(raw) : "";
}

function matchesNotesDateRange(dayKey, fromKey, toKey) {
  if (!dayKey) return !(fromKey || toKey);
  if (fromKey && dayKey < fromKey) return false;
  if (toKey && dayKey > toKey) return false;
  return true;
}

function sessionPickLabel(record, { live = false } = {}) {
  const intent = String(record?.intent || "Session").trim() || "Session";
  const day = sessionDayKey(record);
  const when = live ? "In progress" : (day ? formatShortDate(day) : "No date");
  return `${intent} · ${when}`;
}

export function syncNotesGroupFilterOptions() {
  const select = dom.notesGroupFilter;
  if (!select) return;
  const current = readNotesGroupFilter();
  select.replaceChildren();
  const add = (value, label) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    select.append(opt);
  };
  add("all", "All groups");
  add("ungrouped", "Ungrouped");
  state.noteGroups.forEach((g) => add(g.id, g.name));
  const valid = current === "all" || current === "ungrouped" || state.noteGroups.some((g) => g.id === current);
  select.value = valid ? current : "all";
}

export function syncNotesSessionPickOptions() {
  const select = dom.notesSessionPick;
  if (!select) return;
  const preferred = state.notesSessionFilter?.id || readNotesSessionPick();
  select.replaceChildren();
  const add = (value, label) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    select.append(opt);
  };
  add("all", "All sessions");
  const seen = new Set();
  if (state.session?.id) {
    add(state.session.id, sessionPickLabel(state.session, { live: true }));
    seen.add(state.session.id);
  }
  state.history.forEach((r) => {
    if (!r?.id || seen.has(r.id)) return;
    seen.add(r.id);
    add(r.id, sessionPickLabel(r));
  });
  const valid = preferred === "all" || seen.has(preferred);
  select.value = valid ? preferred : "all";
  if (!valid && state.notesSessionFilter) state.notesSessionFilter = null;
}

function syncNotesDateDisplay(field) {
  const input = field === "from" ? dom.notesDateFrom : dom.notesDateTo;
  const display = field === "from" ? dom.notesDateFromDisplay : dom.notesDateToDisplay;
  const value = String(input?.value || "");
  if (display) {
    display.textContent = formatShortDate(value);
    display.classList.toggle("is-empty", !value);
  }
}

export function syncNotesDateDisplays() {
  syncNotesDateDisplay("from");
  syncNotesDateDisplay("to");
}

function setNotesDateValue(field, iso) {
  const input = field === "from" ? dom.notesDateFrom : dom.notesDateTo;
  const other = field === "from" ? dom.notesDateTo : dom.notesDateFrom;
  if (!input) return;
  input.value = iso || "";
  if (iso && other?.value) {
    if (field === "from" && other.value < iso) other.value = iso;
    if (field === "to" && other.value > iso) other.value = iso;
  }
  syncNotesDateDisplays();
}

export async function openNotesDatePicker(field) {
  const anchor = field === "from" ? dom.notesDateFromBtn : dom.notesDateToBtn;
  if (!anchor) return;
  const { toggleCustomDatePicker } = await import("./history.js?v=187");
  toggleCustomDatePicker({
    id: `notes-${field}`,
    getValue: () => String((field === "from" ? dom.notesDateFrom : dom.notesDateTo)?.value || ""),
    setValue: (iso) => setNotesDateValue(field, iso),
    onCommit: () => renderNotes(),
    anchor
  });
}

export function onNotesScopeFilterChange() {
  const scope = readNotesScopeFilter();
  if (scope === "sessions") {
    if (dom.notesGroupFilter) dom.notesGroupFilter.value = "all";
  } else {
    if (dom.notesSessionPick) dom.notesSessionPick.value = "all";
    if (state.notesSessionFilter) state.notesSessionFilter = null;
  }
  if (scope === "all") {
    if (dom.notesDateFrom) dom.notesDateFrom.value = "";
    if (dom.notesDateTo) dom.notesDateTo.value = "";
    syncNotesDateDisplays();
  }
  renderNotes();
}

export function onNotesSessionPickChange() {
  const id = readNotesSessionPick();
  if (!id || id === "all") {
    state.notesSessionFilter = null;
  } else {
    const live = state.session?.id === id ? state.session : null;
    const record = live || state.history.find((r) => r.id === id);
    state.notesSessionFilter = {
      id,
      intent: record?.intent || "Session"
    };
  }
  syncNotesFilterBar();
  renderNotes();
}

function syncNotesFilterControls() {
  syncNotesGroupFilterOptions();
  syncNotesSessionPickOptions();
  syncNotesDateDisplays();
  const scope = readNotesScopeFilter();
  const sessionsMode = scope === "sessions";
  const thoughtsMode = scope === "inbox";
  // Mutual exclusivity: Thoughts → Group (+ dates); Sessions → Session (+ dates); All → Group only.
  const showGroup = !sessionsMode;
  const showSession = sessionsMode;
  const showDates = sessionsMode || thoughtsMode;

  const toggleFilter = (el, show) => {
    if (!el) return;
    el.hidden = !show;
    el.classList.toggle("is-hidden", !show);
  };
  toggleFilter(dom.notesGroupFilterWrap || dom.notesGroupFilter?.closest(".compact-field"), showGroup);
  if (dom.notesGroupFilter) dom.notesGroupFilter.disabled = !showGroup;
  toggleFilter(dom.notesSessionPickWrap, showSession);
  toggleFilter(dom.notesDateFromWrap, showDates);
  toggleFilter(dom.notesDateToWrap, showDates);

  const q = String(dom.notesSearch?.value || "").trim();
  const group = readNotesGroupFilter();
  const sessionPick = readNotesSessionPick();
  const { fromKey, toKey } = readNotesDateRange();
  const scopeActive = scope !== "all";
  const groupActive = showGroup && group !== "all";
  const sessionActive = showSession && (sessionPick !== "all" || Boolean(state.notesSessionFilter?.id));
  const fromActive = showDates && Boolean(fromKey);
  const toActive = showDates && Boolean(toKey);
  const active = Boolean(q) || scopeActive || groupActive || sessionActive || fromActive || toActive;

  setFilterGlow(dom.notesSearch?.closest(".search-field"), Boolean(q));
  setFilterGlow(dom.notesScopeFilter?.closest(".compact-field"), scopeActive);
  setFilterGlow(dom.notesGroupFilterWrap || dom.notesGroupFilter?.closest(".compact-field"), groupActive);
  setFilterGlow(dom.notesSessionPickWrap, sessionActive);
  setFilterGlow(dom.notesDateFromWrap, fromActive);
  setFilterGlow(dom.notesDateToWrap, toActive);

  if (dom.notesClearFiltersBtn) {
    dom.notesClearFiltersBtn.hidden = !active;
    dom.notesClearFiltersBtn.classList.toggle("is-hidden", !active);
  }
}

export function clearNotesFilters() {
  if (dom.notesSearch) dom.notesSearch.value = "";
  if (dom.notesScopeFilter) dom.notesScopeFilter.value = "all";
  if (dom.notesGroupFilter) dom.notesGroupFilter.value = "all";
  if (dom.notesSessionPick) dom.notesSessionPick.value = "all";
  if (dom.notesDateFrom) dom.notesDateFrom.value = "";
  if (dom.notesDateTo) dom.notesDateTo.value = "";
  state.notesSessionFilter = null;
  syncNotesDateDisplays();
  syncNotesFilterBar();
  renderNotes();
  showToast("Notes filters cleared.");
  dom.notesSearch?.focus();
}

function renderInboxGroups(inboxRows, { query = "", sessionFilterId = null, groupFilter = "all" } = {}) {
  if (sessionFilterId) {
    const empty = document.createElement("div");
    empty.className = "notes-empty-state";
    empty.innerHTML = "<strong>Inbox hidden</strong><p>Clear the session filter to see grouped notes again.</p>";
    dom.notesInbox.append(empty);
    return;
  }

  if (!state.inbox.length && !state.noteGroups.length) {
    const empty = document.createElement("div");
    empty.className = "notes-empty-state";
    empty.innerHTML = "<strong>Inbox is empty</strong><p>Create a group, then add notes with a title and body.</p>";
    dom.notesInbox.append(empty);
    return;
  }

  const knownIds = new Set(state.noteGroups.map((g) => g.id));
  const buckets = new Map(state.noteGroups.map((g) => [g.id, []]));
  const ungrouped = [];
  inboxRows.forEach((n) => {
    if (n.groupId && knownIds.has(n.groupId)) buckets.get(n.groupId).push(n);
    else ungrouped.push(n);
  });

  let sections = state.noteGroups.map((g) => ({ id: g.id, name: g.name, items: buckets.get(g.id) || [] }));
  if (groupFilter === "ungrouped") {
    sections = [];
  } else if (groupFilter !== "all") {
    sections = sections.filter((g) => g.id === groupFilter);
  }
  sections = sections.filter((g) => !query || g.items.length || groupFilter === g.id);

  const showUngrouped = groupFilter === "all" || groupFilter === "ungrouped";
  const ungroupedItems = showUngrouped ? ungrouped : [];

  if ((query || groupFilter !== "all") && !sections.length && !ungroupedItems.length) {
    const empty = document.createElement("div");
    empty.className = "notes-empty-state";
    empty.innerHTML = query
      ? "<strong>No matches</strong><p>No inbox notes match your search.</p>"
      : "<strong>No notes here</strong><p>Nothing in this group yet.</p>";
    dom.notesInbox.append(empty);
    return;
  }

  sections.forEach((section) => {
    // When filtering to one group, still show empty shell so the group remains visible.
    if (query && !section.items.length && groupFilter === "all") return;
    dom.notesInbox.append(renderInboxGroupCard({ ...section, query }));
  });

  if (showUngrouped && (ungroupedItems.length || (!query && !state.noteGroups.length) || groupFilter === "ungrouped")) {
    dom.notesInbox.append(renderInboxGroupCard({
      id: "",
      name: "Ungrouped",
      items: ungroupedItems,
      query
    }));
  }
}

export function renderNotes() {
  const q = dom.notesSearch.value.trim().toLocaleLowerCase();
  const scope = readNotesScopeFilter();
  const groupFilter = scope === "sessions" ? "all" : readNotesGroupFilter();
  const sessionPick = scope === "sessions" ? readNotesSessionPick() : "all";
  const sessionFilterId = state.notesSessionFilter?.id
    || (sessionPick !== "all" ? sessionPick : null);
  const dateScope = scope === "sessions" || scope === "inbox";
  const { fromKey, toKey } = dateScope ? readNotesDateRange() : { fromKey: "", toKey: "" };
  const useDateFilter = Boolean(fromKey || toKey);
  syncNotesFilterBar();
  syncNotesFilterControls();
  dom.notesInbox.replaceChildren();
  dom.notesSessions.replaceChildren();

  const showInbox = !sessionFilterId && scope !== "sessions";
  const showSessions = scope !== "inbox";

  const inboxRows = showInbox
    ? state.inbox.filter((n) => {
      if (q && !noteSearchBlob(n).toLocaleLowerCase().includes(q)) return false;
      if (useDateFilter && scope === "inbox") {
        const dayKey = n.createdAt ? localDayKey(n.createdAt) : "";
        if (!matchesNotesDateRange(dayKey, fromKey, toKey)) return false;
      }
      if (groupFilter === "all") return true;
      if (groupFilter === "ungrouped") return !n.groupId || !state.noteGroups.some((g) => g.id === n.groupId);
      return n.groupId === groupFilter;
    })
    : [];
  if (showInbox) renderInboxGroups(inboxRows, { query: q, sessionFilterId, groupFilter });
  else if (scope === "sessions" && !sessionFilterId) {
    const empty = document.createElement("div");
    empty.className = "notes-empty-state";
    empty.innerHTML = "<strong>Thoughts hidden</strong><p>Showing session notes only. Change Show to All notes or Thoughts.</p>";
    dom.notesInbox.append(empty);
  }

  const groups = [];
  if (showSessions) {
    if (state.session && (!sessionFilterId || state.session.id === sessionFilterId)) {
      const dayKey = sessionDayKey(state.session);
      if (!useDateFilter || matchesNotesDateRange(dayKey, fromKey, toKey)) {
        const items = ensureNoteItems(state.session);
        const filtered = items.filter((item) => !q || [state.session.intent, noteSearchBlob(item)].join(" ").toLocaleLowerCase().includes(q));
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
    }
    state.history.forEach((r) => {
      if (sessionFilterId && r.id !== sessionFilterId) return;
      if (useDateFilter && !matchesNotesDateRange(sessionDayKey(r), fromKey, toKey)) return;
      const items = sessionNoteItems(r);
      if (!items.length && !r.topic) return;
      const filtered = items.filter((item) => !q || [r.intent, r.topic, noteSearchBlob(item)].join(" ").toLocaleLowerCase().includes(q));
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
  }

  if (showSessions) {
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
        const allText = group.items.map((item, i) => {
          const body = formatNotePlainText(item);
          return `Note ${i + 1}\n${body}`;
        }).join("\n\n");
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
          const content = document.createElement("div");
          content.className = "note-card-content";
          fillNoteContent(content, item);
          const foot = document.createElement("div");
          foot.className = "session-note-item-foot";
          const time = document.createElement("small");
          time.textContent = formatDate(item.createdAt);
          const actions = document.createElement("div");
          actions.className = "note-card-actions";
          const plain = formatNotePlainText(item);
          actions.append(createNoteItemOptions({
            text: plain,
            label: item.title || `${group.intent || "note"}-${index + 1}`,
            onEdit: () => openNoteEditor({
              scope: group.live ? "live" : "history",
              sessionId: group.sessionId,
              noteId: item.id,
              intent: group.intent,
              live: group.live,
              title: item.title || "",
              text: item.text || ""
            }),
            onDelete: () => {
              state.editingNote = {
                scope: group.live ? "live" : "history",
                sessionId: group.sessionId,
                noteId: item.id,
                intent: group.intent,
                live: group.live,
                title: item.title || "",
                text: item.text || ""
              };
              deleteEditedNote();
            }
          }));
          foot.append(time);
          li.append(content, foot, actions);
          list.append(li);
        });
        card.append(list);
      }
      dom.notesSessions.append(card);
    });
  }

  const inboxEmpty = showInbox ? (!inboxRows.length && !(groupFilter === "all" && state.noteGroups.length && !q)) : true;
  const sessionsEmpty = !groups.length;
  if (showSessions && !groups.length) {
    const empty = document.createElement("div");
    empty.className = "notes-empty-state";
    empty.innerHTML = sessionFilterId
      ? "<strong>No notes for this session</strong><p>Clear the filter to browse all session notes.</p>"
      : (useDateFilter || q)
        ? "<strong>No matches</strong><p>No session notes match your filters.</p>"
        : scope === "inbox"
          ? "<strong>Sessions hidden</strong><p>Showing inbox only.</p>"
          : "<strong>No session notes yet</strong><p>Notes you add during a focus session will show up here.</p>";
    dom.notesSessions.append(empty);
  } else if (!showSessions) {
    const empty = document.createElement("div");
    empty.className = "notes-empty-state";
    empty.innerHTML = "<strong>Sessions hidden</strong><p>Showing inbox only. Change Show to All notes or Sessions.</p>";
    dom.notesSessions.append(empty);
  }

  const collapseInbox = !showInbox || Boolean(sessionFilterId) || (!state.inbox.length && !state.noteGroups.length && !q && groupFilter === "all");
  const collapseSessions = !showSessions || (sessionsEmpty && showInbox && !collapseInbox);
  dom.notesColumns?.classList.toggle("is-inbox-empty", collapseInbox);
  dom.notesColumns?.classList.toggle("is-sessions-empty", collapseSessions);
  dom.notesInboxPanel?.classList.toggle("is-empty", !showInbox || (showInbox && !dom.notesInbox.childElementCount));
  dom.notesSessionsPanel?.classList.toggle("is-empty", !showSessions || sessionsEmpty);
  if (sessionFilterId && groups.length) {
    const first = dom.notesSessions.querySelector(".session-notes-group");
    first?.classList.add("is-filter-target");
    first?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
}

/** @deprecated Use openNoteComposer — kept as alias for older callers. */
export function addInboxNote() {
  openNoteComposer();
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
