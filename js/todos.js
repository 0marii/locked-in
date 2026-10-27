/** Microsoft To Do–inspired tasks: lists, My Day, due dates, steps. */
import {
  MAX_TODO_LISTS, MAX_TODO_STEP_TITLE, MAX_TODO_STEPS, MAX_TODO_TASKS, MAX_TODO_TITLE,
  PREFS_KEY, TODOS_KEY
} from "./constants.js?v=207";
import { dom, state, tabId } from "./runtime.js?v=207";
import { safeRead, safeWrite } from "./storage.js?v=207";
import { showToast } from "./toast.js?v=207";
import { formatDuration, formatShortDate, localDayKey } from "./utils.js?v=207";
import { broadcast } from "./sync.js?v=207";
import { askConfirm, navigate } from "./theme-nav.js?v=207";

export const SMART_MYDAY = "myday";
export const SMART_IMPORTANT = "important";
export const SMART_COMPLETED = "completed";
export const LIST_COLORS = ["#b7f36b", "#73baff", "#d0a5ff", "#f7b4ae", "#f2c66d", "#76e4a0", "#ff8d83", "#a89c99"];

function isSmartListId(id) {
  return id === SMART_MYDAY || id === SMART_IMPORTANT || id === SMART_COMPLETED;
}

const PRIORITIES = ["low", "medium", "high"];

let completedOpen = false;
let expandedTaskIds = new Set();
/** In-progress "Next step" text keyed by task id — survives re-renders until committed or discarded. */
const stepDraftByTaskId = new Map();
let addDraft = { priority: "medium", dueDate: null };
let completedFilters = { date: "all", listId: "all", priority: "all", customDate: null };
const TODO_SORT_KEY = "locked_in_todos_sort_v1";
const TODO_SORTS = [
  ["priority", "Priority"],
  ["due", "Due date"],
  ["created-new", "Newest created"],
  ["created-old", "Oldest created"]
];
let todoSort = null;
let todoTimerTickId = null;

function syncStepDraftFromDom(taskId) {
  const input = document.querySelector(`[data-todo-step-form="${CSS.escape(String(taskId))}"] input`);
  if (!input) return String(stepDraftByTaskId.get(taskId) || "").trim();
  const text = String(input.value || "").trim();
  if (text) stepDraftByTaskId.set(taskId, text);
  else stepDraftByTaskId.delete(taskId);
  return text;
}

function getStepDraft(taskId) {
  return syncStepDraftFromDom(taskId);
}

function clearStepDraft(taskId) {
  stepDraftByTaskId.delete(taskId);
}

function shiftDayKey(key, days) {
  const d = new Date(`${key}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return localDayKey(d);
}

function completedFiltersActive() {
  return completedFilters.date !== "all"
    || completedFilters.listId !== "all"
    || completedFilters.priority !== "all";
}

function resetCompletedFilters() {
  completedFilters = { date: "all", listId: "all", priority: "all", customDate: null };
}

function filterCompletedTasks(tasks) {
  const day = todayKey();
  const yesterday = shiftDayKey(day, -1);
  const weekStart = shiftDayKey(day, -6);
  const monthStart = shiftDayKey(day, -29);
  return tasks.filter((task) => {
    if (!task.completedAt) return false;
    if (completedFilters.listId !== "all" && task.listId !== completedFilters.listId) return false;
    if (completedFilters.priority !== "all" && task.priority !== completedFilters.priority) return false;
    const completedDay = localDayKey(task.completedAt);
    if (!completedDay) return false;
    switch (completedFilters.date) {
      case "today":
        return completedDay === day;
      case "yesterday":
        return completedDay === yesterday;
      case "week":
        return completedDay >= weekStart && completedDay <= day;
      case "month":
        return completedDay >= monthStart && completedDay <= day;
      case "custom":
        return completedFilters.customDate ? completedDay === completedFilters.customDate : true;
      default:
        return true;
    }
  });
}

function completedFiltersHtml(lists) {
  const dateOpts = [
    ["all", "All dates"],
    ["today", "Today"],
    ["yesterday", "Yesterday"],
    ["week", "Last 7 days"],
    ["month", "Last 30 days"],
    ["custom", "Pick a day"]
  ];
  const priorityOpts = [
    ["all", "All priorities"],
    ["high", "High"],
    ["medium", "Med"],
    ["low", "Low"]
  ];
  const customLabel = completedFilters.customDate
    ? dueLabel(completedFilters.customDate, { empty: "Pick day" })
    : "Pick day";
  const dateActive = completedFilters.date !== "all";
  const listActive = completedFilters.listId !== "all";
  const priorityActive = completedFilters.priority !== "all";
  const dayActive = completedFilters.date === "custom" && Boolean(completedFilters.customDate);
  return `
    <div class="todos-completed-filters" role="search" aria-label="Filter completed tasks">
      <div class="todos-filter-field ${dateActive ? "is-filter-active" : ""}">
        ${todoMenuTriggerHtml({
          id: "todos-completed-date",
          label: "Filter by date",
          valueLabel: menuOptionLabel(dateOpts, completedFilters.date, "All dates")
        })}
      </div>
      ${completedFilters.date === "custom" ? `
        <button type="button" class="date-field-trigger todo-due-trigger todos-filter-day-btn ${dayActive ? "is-filter-active" : ""}" id="todos-completed-day-btn" data-date-picker-anchor aria-haspopup="dialog" aria-expanded="false" aria-label="Completed on date">
          <span class="date-field-value ${completedFilters.customDate ? "" : "is-empty"}" id="todos-completed-day-display">${escapeHtml(customLabel)}</span>
        </button>
      ` : ""}
      <div class="todos-filter-field ${listActive ? "is-filter-active" : ""}">
        ${todoMenuTriggerHtml({
          id: "todos-completed-list",
          label: "Filter by list",
          valueLabel: menuOptionLabel([["all", "All lists"], ...lists.map((list) => [list.id, list.name])], completedFilters.listId, "All lists")
        })}
      </div>
      <div class="todos-filter-field ${priorityActive ? "is-filter-active" : ""}">
        ${todoMenuTriggerHtml({
          id: "todos-completed-priority",
          label: "Filter by priority",
          valueLabel: menuOptionLabel(priorityOpts, completedFilters.priority, "All priorities")
        })}
      </div>
      ${completedFiltersActive() ? `
        <button type="button" class="button button-ghost button-small" id="todos-completed-filters-clear">Clear</button>
      ` : ""}
    </div>
  `;
}

function dueLabel(iso, { empty = "Due" } = {}) {
  if (!iso) return empty;
  try { return formatShortDate(iso); } catch (_) { return iso; }
}

function resetAddDraft() {
  addDraft = { priority: "medium", dueDate: null };
}

function priorityDisplayLabel(priority) {
  const p = normalizePriority(priority);
  return p === "low" ? "Low" : p === "high" ? "High" : "Med";
}

function syncAddFormDraft() {
  const priority = document.getElementById("todos-add-priority");
  const dueDisplay = document.getElementById("todos-add-due-display");
  if (priority) {
    const p = normalizePriority(addDraft.priority);
    const label = priorityDisplayLabel(p);
    priority.classList.remove("is-low", "is-medium", "is-high");
    priority.classList.add(`is-${p}`);
    const valueEl = priority.querySelector(".todo-action-value");
    if (valueEl) valueEl.textContent = label;
    priority.setAttribute("aria-label", `Priority, ${label}`);
  }
  if (dueDisplay) {
    dueDisplay.textContent = dueLabel(addDraft.dueDate, { empty: "Add date" });
    dueDisplay.classList.toggle("is-empty", !addDraft.dueDate);
  }
}

async function openTodoDuePicker(anchor, { id, getValue, setValue, onCommit }) {
  if (!anchor) return;
  // Dynamic import avoids a circular dependency with history.js (backup uses todos).
  const { toggleCustomDatePicker } = await import("./history.js?v=207");
  toggleCustomDatePicker({ id, getValue, setValue, onCommit, anchor });
}

function uid(prefix = "t") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function todayKey() {
  return localDayKey(new Date());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizePriority(value) {
  const p = String(value || "medium").toLowerCase();
  return PRIORITIES.includes(p) ? p : "medium";
}

function clampTodoTitle(value, max) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function normalizeStep(raw) {
  const title = clampTodoTitle(raw?.title, MAX_TODO_STEP_TITLE);
  if (!title) return null;
  return {
    id: String(raw?.id || uid("step")),
    title,
    completedAt: raw?.completedAt ? String(raw.completedAt) : null
  };
}

function normalizeTask(raw) {
  if (!raw || typeof raw !== "object") return null;
  const title = clampTodoTitle(raw.title, MAX_TODO_TITLE);
  if (!title) return null;
  const steps = (Array.isArray(raw.steps) ? raw.steps : [])
    .map(normalizeStep)
    .filter(Boolean)
    .slice(0, MAX_TODO_STEPS);
  const workedSeconds = Math.max(0, Math.floor(Number(raw.workedSeconds) || 0));
  const timerStartedAt = raw.timerStartedAt ? String(raw.timerStartedAt) : null;
  return {
    id: String(raw.id || uid("task")),
    listId: String(raw.listId || ""),
    title,
    priority: normalizePriority(raw.priority),
    createdAt: raw.createdAt || new Date().toISOString(),
    completedAt: raw.completedAt ? String(raw.completedAt) : null,
    dueDate: raw.dueDate ? String(raw.dueDate).slice(0, 10) : null,
    myDayDate: raw.myDayDate ? String(raw.myDayDate).slice(0, 10) : null,
    workedSeconds,
    timerStartedAt,
    timerUsed: Boolean(raw.timerUsed) || workedSeconds > 0 || Boolean(timerStartedAt),
    steps,
    sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : Date.now()
  };
}

function normalizeList(raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name || "").trim().slice(0, 60);
  if (!name) return null;
  const color = LIST_COLORS.includes(raw.color) ? raw.color : LIST_COLORS[index % LIST_COLORS.length];
  return {
    id: String(raw.id || uid("list")),
    name,
    description: String(raw.description || "").trim().slice(0, 160),
    color,
    createdAt: raw.createdAt || new Date().toISOString(),
    sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : index
  };
}

export function defaultTodosDoc() {
  const listId = uid("list");
  return {
    version: 1,
    lists: [{
      id: listId,
      name: "Tasks",
      color: LIST_COLORS[0],
      createdAt: new Date().toISOString(),
      sortOrder: 0
    }],
    tasks: [],
    activeListId: SMART_MYDAY
  };
}

export function normalizeTodosDoc(raw) {
  const base = defaultTodosDoc();
  if (!raw || typeof raw !== "object") return base;
  let lists = (Array.isArray(raw.lists) ? raw.lists : [])
    .map((item, i) => normalizeList(item, i))
    .filter(Boolean)
    .slice(0, MAX_TODO_LISTS);
  if (!lists.length) lists = base.lists;
  const listIds = new Set(lists.map((l) => l.id));
  const fallbackListId = lists[0].id;
  const tasks = (Array.isArray(raw.tasks) ? raw.tasks : [])
    .map(normalizeTask)
    .filter(Boolean)
    .map((task) => ({
      ...task,
      listId: listIds.has(task.listId) ? task.listId : fallbackListId
    }))
    .slice(0, MAX_TODO_TASKS);
  const active = String(raw.activeListId || SMART_MYDAY);
  const activeListId = isSmartListId(active) || listIds.has(active)
    ? active
    : SMART_MYDAY;
  return { version: 1, lists, tasks, activeListId };
}

export function loadTodos() {
  const doc = normalizeTodosDoc(safeRead(TODOS_KEY, null));
  state.todos = doc;
  return doc;
}

export function saveTodos() {
  if (state.readOnly) return false;
  const next = normalizeTodosDoc(state.todos || defaultTodosDoc());
  state.todos = next;
  const ok = safeWrite(TODOS_KEY, next);
  if (ok) broadcast({ type: "todos", source: tabId });
  else showToast("Could not save to-dos — browser storage unavailable.");
  return ok;
}

function doc() {
  if (!state.todos) loadTodos();
  return state.todos;
}

function findTask(id) {
  return doc().tasks.find((t) => t.id === id) || null;
}

export function findList(id) {
  return doc().lists.find((l) => l.id === id) || null;
}

export function isMyDay(task, day = todayKey()) {
  return Boolean(task?.myDayDate && task.myDayDate === day);
}

export function isOverdue(task, day = todayKey()) {
  return Boolean(task?.dueDate && !task.completedAt && task.dueDate < day);
}

/** Active work seconds (accumulated + current running segment). */
export function activeWorkSeconds(task, now = Date.now()) {
  const base = Math.max(0, Math.floor(Number(task?.workedSeconds) || 0));
  if (!task?.timerStartedAt) return base;
  const start = Date.parse(task.timerStartedAt);
  if (!Number.isFinite(start) || start > now) return base;
  return base + Math.max(0, Math.floor((now - start) / 1000));
}

function flushTaskTimer(task, now = Date.now()) {
  if (!task?.timerStartedAt) return false;
  task.workedSeconds = activeWorkSeconds(task, now);
  task.timerStartedAt = null;
  return true;
}

function anyRunningTodoTimer() {
  return doc().tasks.some((t) => t.timerStartedAt && !t.completedAt);
}

function stopTodoTimerTick() {
  if (todoTimerTickId) {
    clearInterval(todoTimerTickId);
    todoTimerTickId = null;
  }
}

function updateRunningTimerLabels() {
  document.querySelectorAll("[data-todo-timer-label]").forEach((el) => {
    const task = findTask(el.dataset.todoTimerLabel);
    if (!task?.timerStartedAt || task.completedAt) return;
    el.textContent = `Working ${formatDuration(activeWorkSeconds(task))}`;
  });
}

/** Keep a 1s tick while To-Do is open and a timer is running. */
export function syncTodoTimerTick() {
  if (state.activeScreen === "todos-screen" && anyRunningTodoTimer()) {
    if (!todoTimerTickId) {
      todoTimerTickId = setInterval(() => {
        if (state.activeScreen !== "todos-screen" || !anyRunningTodoTimer()) {
          stopTodoTimerTick();
          return;
        }
        updateRunningTimerLabels();
      }, 1000);
    }
    return;
  }
  stopTodoTimerTick();
}

export function pauseTaskTimer(id, { render = true } = {}) {
  const task = findTask(id);
  if (!task || task.completedAt || !task.timerStartedAt) return false;
  flushTaskTimer(task);
  saveTodos();
  if (render) renderTodos();
  else syncTodoTimerTick();
  return true;
}

/** Start or resume a task timer. Only one task may run at a time. */
export function startTaskTimer(id, { render = true } = {}) {
  const task = findTask(id);
  if (!task || task.completedAt) return false;
  const now = Date.now();
  doc().tasks.forEach((other) => {
    if (other.id !== id && other.timerStartedAt) flushTaskTimer(other, now);
  });
  if (!task.timerStartedAt) {
    task.timerUsed = true;
    task.timerStartedAt = new Date(now).toISOString();
  }
  saveTodos();
  if (render) renderTodos();
  else syncTodoTimerTick();
  return true;
}

/** Open (incomplete) tasks for session linking on Setup. */
export function listOpenTasksForSetup() {
  return doc().tasks
    .filter((t) => !t.completedAt)
    .slice()
    .sort((a, b) => {
      const aMy = isMyDay(a) ? 0 : 1;
      const bMy = isMyDay(b) ? 0 : 1;
      if (aMy !== bMy) return aMy - bMy;
      return String(a.title).localeCompare(String(b.title));
    });
}

export function completionDurationLabel(task) {
  if (!task?.completedAt) return null;
  const tracked = activeWorkSeconds(task);
  if (tracked > 0 || task.timerUsed) {
    return formatDuration(tracked);
  }
  // Legacy: wall-clock for tasks completed before work timers existed.
  if (!task.createdAt) return null;
  const start = Date.parse(task.createdAt);
  const end = Date.parse(task.completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return formatDuration((end - start) / 1000);
}

function tasksForView(activeListId) {
  const all = doc().tasks.slice();
  const day = todayKey();
  if (activeListId === SMART_MYDAY) {
    return all.filter((t) => isMyDay(t, day));
  }
  if (activeListId === SMART_IMPORTANT) {
    return all.filter((t) => t.priority === "high" && !t.completedAt);
  }
  if (activeListId === SMART_COMPLETED) {
    return all.filter((t) => t.completedAt);
  }
  return all.filter((t) => t.listId === activeListId);
}

function readTodoSort() {
  if (todoSort) return todoSort;
  const raw = String(safeRead(TODO_SORT_KEY, "priority") || "priority");
  todoSort = TODO_SORTS.some(([id]) => id === raw) ? raw : "priority";
  return todoSort;
}

function setTodoSort(value) {
  const next = TODO_SORTS.some(([id]) => id === value) ? value : "priority";
  todoSort = next;
  safeWrite(TODO_SORT_KEY, next);
}

function priorityRank(task) {
  return { high: 0, medium: 1, low: 2 }[normalizePriority(task?.priority)] ?? 1;
}

function createdTime(task) {
  const parsed = Date.parse(task?.createdAt || "");
  if (Number.isFinite(parsed)) return parsed;
  return Number(task?.sortOrder) || 0;
}

function compareByDue(a, b) {
  const ad = a.dueDate || "";
  const bd = b.dueDate || "";
  if (ad && bd && ad !== bd) return ad.localeCompare(bd);
  if (ad && !bd) return -1;
  if (!ad && bd) return 1;
  return 0;
}

function compareTasks(a, b, mode = readTodoSort()) {
  if (mode === "due") {
    const byDue = compareByDue(a, b);
    if (byDue) return byDue;
    const byPriority = priorityRank(a) - priorityRank(b);
    if (byPriority) return byPriority;
    return createdTime(a) - createdTime(b);
  }
  if (mode === "created-new") {
    const byCreated = createdTime(b) - createdTime(a);
    if (byCreated) return byCreated;
    return priorityRank(a) - priorityRank(b);
  }
  if (mode === "created-old") {
    const byCreated = createdTime(a) - createdTime(b);
    if (byCreated) return byCreated;
    return priorityRank(a) - priorityRank(b);
  }
  const byPriority = priorityRank(a) - priorityRank(b);
  if (byPriority) return byPriority;
  const byDue = compareByDue(a, b);
  if (byDue) return byDue;
  return createdTime(a) - createdTime(b);
}

function sortTasks(tasks) {
  return tasks.slice().sort((a, b) => {
    const ac = a.completedAt ? 1 : 0;
    const bc = b.completedAt ? 1 : 0;
    if (ac !== bc) return ac - bc;
    return compareTasks(a, b);
  });
}

function menuOptionLabel(options, value, fallback = "") {
  return options.find(([id]) => id === value)?.[1] || fallback;
}

function todoMenuTriggerHtml({ id, label, valueLabel }) {
  return `
    <button type="button" class="todo-menu-trigger" id="${id}" aria-haspopup="listbox" aria-expanded="false" aria-label="${escapeHtml(label)}">
      <span class="todo-menu-value">${escapeHtml(valueLabel)}</span>
      <span class="todo-menu-caret" aria-hidden="true"></span>
    </button>
  `;
}

function todoSortSelectHtml() {
  const current = readTodoSort();
  return `
    <div class="todos-sort-bar">
      <div class="todos-filter-field todos-sort-field">
        <span>Sort</span>
        ${todoMenuTriggerHtml({
          id: "todos-sort",
          label: "Sort tasks",
          valueLabel: menuOptionLabel(TODO_SORTS, current, "Priority")
        })}
      </div>
    </div>
  `;
}

export function getTodosSummary(day = todayKey()) {
  const tasks = doc().tasks;
  const incomplete = tasks.filter((t) => !t.completedAt);
  return {
    myDay: incomplete.filter((t) => isMyDay(t, day)).length,
    overdue: incomplete.filter((t) => isOverdue(t, day)).length,
    open: incomplete.length,
    important: incomplete.filter((t) => t.priority === "high").length,
    completed: tasks.filter((t) => t.completedAt).length
  };
}

export function setActiveTodoList(id) {
  const next = String(id || SMART_MYDAY);
  const d = doc();
  if (!isSmartListId(next) && !findList(next)) return;
  d.activeListId = next;
  saveTodos();
  renderTodos();
}

function listNameTaken(name, excludeId = null) {
  const needle = String(name || "").trim().toLowerCase();
  if (!needle) return false;
  return doc().lists.some((l) => l.id !== excludeId && String(l.name || "").trim().toLowerCase() === needle);
}

/** Ensure list names stay unique: "Test" → "Test 2", "Test 3", … */
export function uniqueListName(desired, excludeId = null) {
  const base = String(desired || "").trim().slice(0, 60) || "New list";
  if (!listNameTaken(base, excludeId)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const suffix = ` ${n}`;
    const maxBase = Math.max(1, 60 - suffix.length);
    const candidate = `${base.slice(0, maxBase)}${suffix}`;
    if (!listNameTaken(candidate, excludeId)) return candidate;
  }
  return `${base.slice(0, 48)} ${Date.now().toString(36)}`.slice(0, 60);
}

export function addTodoList(name = "New list") {
  const d = doc();
  if (d.lists.length >= MAX_TODO_LISTS) {
    showToast(`You can have up to ${MAX_TODO_LISTS} lists.`);
    return null;
  }
  const list = normalizeList({
    id: uid("list"),
    name: uniqueListName(name || "New list"),
    color: LIST_COLORS[d.lists.length % LIST_COLORS.length],
    sortOrder: Date.now()
  });
  d.lists.push(list);
  d.activeListId = list.id;
  saveTodos();
  renderTodos();
  showToast("List created.");
  return list;
}

export function renameTodoList(id, name) {
  const list = findList(id);
  if (!list) return false;
  // Empty input falls back to the default label (placeholder behavior).
  const next = uniqueListName(String(name || "").trim().slice(0, 60) || "New list", id);
  if (list.name === next) return true;
  list.name = next;
  saveTodos();
  renderTodos();
  return true;
}

function focusNewListTitleInput() {
  const input = document.getElementById("todos-list-title-input");
  if (!input) return;
  input.focus();
  const end = input.value.length;
  input.setSelectionRange(end, end);
}

export function setTodoListDescription(id, description) {
  const list = findList(id);
  if (!list) return false;
  const next = String(description || "").replace(/\s+/g, " ").trim().slice(0, 160);
  if ((list.description || "") === next) return true;
  list.description = next;
  saveTodos();
  return true;
}

export function setTodoListColor(id, color) {
  const list = findList(id);
  if (!list || !LIST_COLORS.includes(color)) return false;
  list.color = color;
  saveTodos();
  renderTodos();
  return true;
}

export function deleteTodoList(id) {
  const d = doc();
  if (d.lists.length <= 1) {
    showToast("Keep at least one list.");
    return;
  }
  const list = findList(id);
  if (!list) return;
  askConfirm(
    "Delete list?",
    `Delete “${list.name}” and its tasks? This cannot be undone.`,
    () => {
      const fallback = d.lists.find((l) => l.id !== id)?.id || SMART_MYDAY;
      d.lists = d.lists.filter((l) => l.id !== id);
      d.tasks = d.tasks.filter((t) => t.listId !== id);
      if (d.activeListId === id) d.activeListId = fallback;
      saveTodos();
      renderTodos();
      renderSetupTodosWidget();
      showToast("List deleted.");
    },
    "Delete list"
  );
}

export function addTask(title, options = {}) {
  const d = doc();
  if (d.tasks.length >= MAX_TODO_TASKS) {
    showToast(`You can have up to ${MAX_TODO_TASKS} tasks.`);
    return null;
  }
  const text = clampTodoTitle(title, MAX_TODO_TITLE);
  if (!text) return null;
  let listId = options.listId || null;
  if (isSmartListId(d.activeListId)) {
    listId = listId || d.lists[0]?.id;
  } else {
    listId = d.activeListId;
  }
  if (!findList(listId)) listId = d.lists[0]?.id;
  if (!listId) return null;
  const task = normalizeTask({
    id: uid("task"),
    listId,
    title: text,
    priority: options.priority || (d.activeListId === SMART_IMPORTANT ? "high" : "medium"),
    myDayDate: (options.myDay || d.activeListId === SMART_MYDAY) ? todayKey() : null,
    dueDate: options.dueDate || null,
    sortOrder: Date.now()
  });
  d.tasks.push(task);
  saveTodos();
  renderTodos();
  renderSetupTodosWidget();
  return task;
}

export function updateTaskTitle(id, title) {
  const task = findTask(id);
  if (!task) return false;
  const rawLen = String(title || "").replace(/\r\n/g, "\n").trim().length;
  const next = clampTodoTitle(title, MAX_TODO_TITLE);
  if (!next) return false;
  if (rawLen > MAX_TODO_TITLE) {
    showToast(`Task title capped at ${MAX_TODO_TITLE.toLocaleString()} characters.`);
  }
  task.title = next;
  saveTodos();
  renderTodos();
  return true;
}

function fitTodoMultilineField(el) {
  if (!(el instanceof HTMLTextAreaElement)) return;
  const focused = document.activeElement === el;
  el.classList.toggle("is-expanded", focused);
  el.closest(".todo-task")?.classList.toggle("is-title-expanded", focused && el.hasAttribute("data-todo-title"));
  el.closest(".todo-step")?.classList.toggle("is-title-expanded", focused && el.hasAttribute("data-todo-step-title"));
  el.style.height = "auto";
  if (focused) {
    // Tall enough for multi-paragraph titles; still scrollable past this.
    const maxPx = Math.round(Math.min(window.innerHeight * 0.55, 520));
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 0), maxPx)}px`;
  } else {
    el.style.height = "";
  }
}

function fitTodosAddInput() {
  const el = document.getElementById("todos-add-input");
  if (!(el instanceof HTMLTextAreaElement)) return;
  el.style.height = "auto";
  const maxPx = Math.round(Math.min(window.innerHeight * 0.35, 280));
  el.style.height = `${Math.min(Math.max(el.scrollHeight, 28), maxPx)}px`;
}

export function toggleTaskComplete(id) {
  const task = findTask(id);
  if (!task) return false;
  if (task.completedAt) {
    task.completedAt = null;
    // Leave workedSeconds as-is; timer stays paused until Start again.
  } else {
    flushTaskTimer(task);
    task.completedAt = new Date().toISOString();
  }
  saveTodos();
  renderTodos();
  renderSetupTodosWidget();
  return true;
}

export function setTaskPriority(id, priority) {
  const task = findTask(id);
  if (!task) return false;
  task.priority = normalizePriority(priority);
  saveTodos();
  renderTodos();
  renderSetupTodosWidget();
  return true;
}

export function setTaskDueDate(id, dueDate) {
  const task = findTask(id);
  if (!task) return false;
  const next = dueDate ? String(dueDate).slice(0, 10) : null;
  task.dueDate = next && /^\d{4}-\d{2}-\d{2}$/.test(next) ? next : null;
  saveTodos();
  renderTodos();
  renderSetupTodosWidget();
  return true;
}

export function deleteTask(id) {
  const d = doc();
  const prev = d.tasks.length;
  d.tasks = d.tasks.filter((t) => t.id !== id);
  if (d.tasks.length === prev) return false;
  expandedTaskIds.delete(id);
  clearStepDraft(id);
  saveTodos();
  renderTodos();
  renderSetupTodosWidget();
  showToast("Task deleted.");
  return true;
}

export function addStep(taskId, title) {
  const task = findTask(taskId);
  if (!task) return null;
  if (task.steps.length >= MAX_TODO_STEPS) {
    showToast(`Up to ${MAX_TODO_STEPS} steps per task.`);
    return null;
  }
  const step = normalizeStep({ id: uid("step"), title });
  if (!step) return null;
  task.steps.push(step);
  clearStepDraft(taskId);
  expandedTaskIds.add(taskId);
  saveTodos();
  renderTodos();
  queueMicrotask(() => {
    const input = document.querySelector(`[data-todo-step-form="${CSS.escape(String(taskId))}"] input`);
    input?.focus();
  });
  return step;
}

/** Commit the open "Next step" draft if any. Returns true when a step was added. */
export function commitStepDraft(taskId) {
  const text = getStepDraft(taskId);
  if (!text) return false;
  return Boolean(addStep(taskId, text));
}

export function updateStepTitle(taskId, stepId, title) {
  const task = findTask(taskId);
  if (!task) return false;
  const step = task.steps.find((s) => s.id === stepId);
  if (!step) return false;
  const rawLen = String(title || "").replace(/\r\n/g, "\n").trim().length;
  const next = clampTodoTitle(title, MAX_TODO_STEP_TITLE);
  if (!next) return false;
  if (rawLen > MAX_TODO_STEP_TITLE) {
    showToast(`Step title capped at ${MAX_TODO_STEP_TITLE.toLocaleString()} characters.`);
  }
  step.title = next;
  saveTodos();
  return true;
}

export function toggleStep(taskId, stepId) {
  const task = findTask(taskId);
  if (!task) return false;
  const step = task.steps.find((s) => s.id === stepId);
  if (!step) return false;
  step.completedAt = step.completedAt ? null : new Date().toISOString();
  saveTodos();
  renderTodos();
  return true;
}

export function deleteStep(taskId, stepId) {
  const task = findTask(taskId);
  if (!task) return false;
  task.steps = task.steps.filter((s) => s.id !== stepId);
  saveTodos();
  renderTodos();
  return true;
}

function viewMeta(activeListId) {
  if (activeListId === SMART_MYDAY) {
    return { title: "My Day", subtitle: new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date()), color: "var(--accent)", editable: false };
  }
  if (activeListId === SMART_IMPORTANT) {
    return { title: "Important", subtitle: "High priority tasks", color: "#f2c66d", editable: false };
  }
  if (activeListId === SMART_COMPLETED) {
    return { title: "Completed", subtitle: "Everything you've finished", color: "var(--text-muted)", editable: false, completedOnly: true };
  }
  const list = findList(activeListId);
  return {
    title: list?.name || "Tasks",
    subtitle: list?.description || "",
    color: list?.color || LIST_COLORS[0],
    editable: true,
    list
  };
}

function renderRail() {
  const rail = dom.todosRail;
  if (!rail) return;
  const d = doc();
  const day = todayKey();
  const summary = getTodosSummary(day);
  const active = d.activeListId;

  const smart = [
    { id: SMART_MYDAY, label: "My Day", count: summary.myDay },
    { id: SMART_IMPORTANT, label: "Important", count: summary.important },
    { id: SMART_COMPLETED, label: "Completed", count: summary.completed }
  ];

  rail.innerHTML = `
    <div class="todos-rail-section" role="list">
      ${smart.map((item) => `
        <button type="button" class="todos-rail-item ${active === item.id ? "is-active" : ""}" data-todo-list="${item.id}" role="listitem">
          <span>${escapeHtml(item.label)}</span>
          <span class="todos-rail-count">${item.count || ""}</span>
        </button>
      `).join("")}
    </div>
    <div class="todos-rail-divider" aria-hidden="true"></div>
    <div class="todos-rail-section todos-rail-lists" role="list" aria-label="Your lists">
      ${d.lists.map((list) => {
        const count = d.tasks.filter((t) => t.listId === list.id && !t.completedAt).length;
        return `
          <button type="button" class="todos-rail-item ${active === list.id ? "is-active" : ""}" data-todo-list="${list.id}" role="listitem">
            <span class="todos-rail-swatch" style="background:${list.color}" aria-hidden="true"></span>
            <span>${escapeHtml(list.name)}</span>
            <span class="todos-rail-count">${count || ""}</span>
          </button>
        `;
      }).join("")}
    </div>
    <button type="button" class="button button-secondary button-small todos-new-list-btn" id="todos-new-list-btn">+ New list</button>
  `;
}

const PRIORITY_MENU_OPTIONS = [
  ["low", "Low"],
  ["medium", "Medium"],
  ["high", "High"]
];

let priorityMenu = null;
let priorityMenuAnchor = null;

function prioritySelectHtml({ priority, selectId = "", taskId = "", disabled = false } = {}) {
  const p = normalizePriority(priority);
  const idAttr = selectId ? ` id="${selectId}"` : "";
  const taskAttr = taskId ? ` data-todo-priority="${escapeHtml(taskId)}"` : "";
  const label = priorityDisplayLabel(p);
  return `
    <button type="button" class="todo-action-btn todo-priority-trigger is-${p}"${idAttr}${taskAttr} aria-haspopup="listbox" aria-expanded="false" aria-label="Priority, ${label}" ${disabled ? "disabled" : ""}>
      <span class="todo-action-label">Priority</span>
      <span class="todo-action-value">${label}</span>
      <span class="todo-action-caret" aria-hidden="true">▾</span>
    </button>
  `;
}

function ensurePriorityMenu() {
  if (priorityMenu) return priorityMenu;
  const menu = document.createElement("div");
  menu.className = "todo-priority-menu";
  menu.hidden = true;
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", "Priority");
  menu.innerHTML = PRIORITY_MENU_OPTIONS.map(([value, label]) => `
    <button type="button" class="todo-priority-option is-${value}" role="option" data-value="${value}">
      <span class="todo-priority-dot" aria-hidden="true"></span>
      <span>${label}</span>
    </button>
  `).join("");
  document.body.appendChild(menu);
  menu.addEventListener("click", (event) => {
    const option = event.target.closest("[data-value]");
    if (!option) return;
    event.preventDefault();
    applyPriorityFromMenu(option.dataset.value);
  });
  menu.addEventListener("keydown", (event) => {
    event.stopPropagation();
    const options = [...menu.querySelectorAll("[data-value]")];
    const current = options.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      const anchor = priorityMenuAnchor;
      closePriorityMenu();
      anchor?.focus({ preventScroll: true });
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const dir = event.key === "ArrowDown" ? 1 : -1;
      const start = current < 0 ? (dir === 1 ? -1 : 0) : current;
      const next = options[(start + dir + options.length) % options.length];
      next?.focus({ preventScroll: true });
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      options[0]?.focus({ preventScroll: true });
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      options.at(-1)?.focus({ preventScroll: true });
    }
  });
  priorityMenu = menu;
  return menu;
}

function closePriorityMenu() {
  priorityMenuAnchor?.setAttribute("aria-expanded", "false");
  priorityMenuAnchor = null;
  if (!priorityMenu) return;
  priorityMenu.hidden = true;
}

let optionMenu = null;
let optionMenuAnchor = null;
let optionMenuOnSelect = null;

function closeOptionMenu() {
  optionMenuAnchor?.setAttribute("aria-expanded", "false");
  optionMenuAnchor = null;
  optionMenuOnSelect = null;
  if (!optionMenu) return;
  optionMenu.hidden = true;
}

function positionFloatingMenu(menu, anchor, minWidth) {
  menu.hidden = false;
  menu.style.visibility = "hidden";
  const rect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const margin = 8;
  const width = Math.max(menuRect.width, rect.width, minWidth);
  let top = rect.bottom + 6;
  if (top + menuRect.height > window.innerHeight - margin) {
    top = rect.top - menuRect.height - 6;
  }
  let left = rect.left;
  if (left + width > window.innerWidth - margin) {
    left = window.innerWidth - width - margin;
  }
  menu.style.top = `${Math.max(margin, Math.round(top))}px`;
  menu.style.left = `${Math.max(margin, Math.round(left))}px`;
  menu.style.minWidth = `${Math.round(Math.max(rect.width, minWidth))}px`;
  menu.style.visibility = "";
}

function ensureOptionMenu() {
  if (optionMenu) return optionMenu;
  const menu = document.createElement("div");
  menu.className = "todo-priority-menu todo-option-menu";
  menu.hidden = true;
  menu.setAttribute("role", "listbox");
  document.body.appendChild(menu);
  menu.addEventListener("click", (event) => {
    const option = event.target.closest("[data-value]");
    if (!option || !optionMenuOnSelect) return;
    event.preventDefault();
    const choose = optionMenuOnSelect;
    const value = option.dataset.value;
    closeOptionMenu();
    choose(value);
  });
  menu.addEventListener("keydown", (event) => {
    event.stopPropagation();
    const options = [...menu.querySelectorAll("[data-value]")];
    const current = options.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      const anchor = optionMenuAnchor;
      closeOptionMenu();
      anchor?.focus({ preventScroll: true });
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const dir = event.key === "ArrowDown" ? 1 : -1;
      const start = current < 0 ? (dir === 1 ? -1 : 0) : current;
      const next = options[(start + dir + options.length) % options.length];
      next?.focus({ preventScroll: true });
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      options[0]?.focus({ preventScroll: true });
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      options.at(-1)?.focus({ preventScroll: true });
    }
  });
  optionMenu = menu;
  return menu;
}

function completedDateOptions() {
  return [
    ["all", "All dates"],
    ["today", "Today"],
    ["yesterday", "Yesterday"],
    ["week", "Last 7 days"],
    ["month", "Last 30 days"],
    ["custom", "Pick a day"]
  ];
}

function completedListOptions() {
  return [["all", "All lists"], ...(doc().lists || []).map((list) => [list.id, list.name])];
}

function completedPriorityOptions() {
  return [
    ["all", "All priorities"],
    ["high", "High"],
    ["medium", "Med"],
    ["low", "Low"]
  ];
}

function setupSourceOptions() {
  return [
    ["focus", "Focus mix"],
    ["myday", "My Day"],
    ["important", "Important"],
    ["overdue", "Overdue"],
    ["open", "All open"],
    ...(doc().lists || []).map((list) => [list.id, list.name])
  ];
}

function todoMenuSpec(id) {
  if (id === "todos-sort") {
    return { label: "Sort tasks", value: readTodoSort(), options: TODO_SORTS };
  }
  if (id === "todos-completed-date") {
    return { label: "Filter by date", value: completedFilters.date, options: completedDateOptions() };
  }
  if (id === "todos-completed-list") {
    return { label: "Filter by list", value: completedFilters.listId, options: completedListOptions() };
  }
  if (id === "todos-completed-priority") {
    return { label: "Filter by priority", value: completedFilters.priority, options: completedPriorityOptions() };
  }
  if (id === "setup-todos-source") {
    return { label: "Choose which tasks to show", value: setupTodosSource(), options: setupSourceOptions() };
  }
  return null;
}

function applyTodoMenuValue(id, value) {
  if (id === "todos-sort") {
    setTodoSort(value);
    renderTodos();
  } else if (id === "todos-completed-date") {
    completedFilters.date = value || "all";
    if (completedFilters.date !== "custom") completedFilters.customDate = null;
    if (completedFilters.date === "custom" && !completedFilters.customDate) {
      completedFilters.customDate = todayKey();
    }
    renderTodos();
  } else if (id === "todos-completed-list") {
    completedFilters.listId = value || "all";
    renderTodos();
  } else if (id === "todos-completed-priority") {
    completedFilters.priority = value || "all";
    renderTodos();
  } else if (id === "setup-todos-source") {
    state.prefs.setupTodosSource = normalizeSetupTodosSource(value);
    if (!safeWrite(PREFS_KEY, state.prefs)) {
      showToast("Could not save preferences — browser storage unavailable.");
    }
    renderSetupTodosWidget();
  } else {
    return;
  }
  queueMicrotask(() => document.getElementById(id)?.focus({ preventScroll: true }));
}

function openTodoOptionMenu(anchor) {
  if (!anchor) return;
  if (optionMenuAnchor === anchor && optionMenu && !optionMenu.hidden) {
    closeOptionMenu();
    return;
  }
  const spec = todoMenuSpec(anchor.id);
  if (!spec) return;
  closeOptionMenu();
  closePriorityMenu();
  const menu = ensureOptionMenu();
  menu.setAttribute("aria-label", spec.label);
  menu.replaceChildren();
  spec.options.forEach(([value, label]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "todo-priority-option";
    btn.setAttribute("role", "option");
    btn.dataset.value = value;
    btn.textContent = label;
    const selected = value === spec.value;
    btn.classList.toggle("is-selected", selected);
    btn.setAttribute("aria-selected", selected ? "true" : "false");
    menu.append(btn);
  });
  optionMenuOnSelect = (value) => applyTodoMenuValue(anchor.id, value);
  optionMenuAnchor = anchor;
  anchor.setAttribute("aria-expanded", "true");
  positionFloatingMenu(menu, anchor, Math.max(148, anchor.getBoundingClientRect().width));
  const selected = menu.querySelector(".is-selected") || menu.querySelector("[data-value]");
  selected?.focus({ preventScroll: true });
}

function positionPriorityMenu(anchor) {
  const menu = ensurePriorityMenu();
  menu.hidden = false;
  menu.style.visibility = "hidden";
  const rect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const margin = 8;
  const width = Math.max(menuRect.width, rect.width, 148);
  let top = rect.bottom + 6;
  if (top + menuRect.height > window.innerHeight - margin) {
    top = rect.top - menuRect.height - 6;
  }
  let left = rect.left;
  if (left + width > window.innerWidth - margin) {
    left = window.innerWidth - width - margin;
  }
  menu.style.top = `${Math.max(margin, Math.round(top))}px`;
  menu.style.left = `${Math.max(margin, Math.round(left))}px`;
  menu.style.minWidth = `${Math.round(Math.max(rect.width, 148))}px`;
  menu.style.visibility = "";
}

function priorityValueForTrigger(anchor) {
  if (!anchor) return "medium";
  if (anchor.id === "todos-add-priority") return normalizePriority(addDraft.priority);
  return normalizePriority(findTask(anchor.dataset.todoPriority)?.priority);
}

function openPriorityMenu(anchor) {
  if (!anchor || anchor.disabled) return;
  if (priorityMenuAnchor === anchor && priorityMenu && !priorityMenu.hidden) {
    closePriorityMenu();
    return;
  }
  closeOptionMenu();
  closePriorityMenu();
  const menu = ensurePriorityMenu();
  const current = priorityValueForTrigger(anchor);
  menu.querySelectorAll("[data-value]").forEach((btn) => {
    const on = btn.dataset.value === current;
    btn.classList.toggle("is-selected", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
  priorityMenuAnchor = anchor;
  anchor.setAttribute("aria-expanded", "true");
  positionPriorityMenu(anchor);
  const selected = menu.querySelector(".is-selected") || menu.querySelector("[data-value]");
  selected?.focus({ preventScroll: true });
}

function applyPriorityFromMenu(value) {
  const anchor = priorityMenuAnchor;
  const next = normalizePriority(value);
  closePriorityMenu();
  if (!anchor) return;
  if (anchor.id === "todos-add-priority") {
    addDraft.priority = next;
    syncAddFormDraft();
    anchor.focus({ preventScroll: true });
    return;
  }
  const taskId = anchor.dataset.todoPriority;
  const task = findTask(taskId);
  if (!task || task.completedAt) return;
  setTaskPriority(task.id, next);
  const safeId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(task.id) : String(task.id).replace(/"/g, "");
  queueMicrotask(() => {
    document.querySelector(`[data-todo-priority="${safeId}"]`)?.focus({ preventScroll: true });
  });
}

function dueTriggerHtml({
  dueDate = null,
  overdue = false,
  disabled = false,
  buttonId = "",
  displayId = "",
  taskId = "",
  extraAttrs = ""
} = {}) {
  const has = Boolean(dueDate);
  const label = has ? "Change due date" : "Add due date";
  const btnIdAttr = buttonId ? ` id="${buttonId}"` : "";
  const taskAttr = taskId ? ` data-todo-due-btn="${taskId}"` : "";
  const valueIdAttr = displayId ? ` id="${displayId}"` : "";
  const valueDataAttr = taskId ? ` data-todo-due-display="${taskId}"` : "";
  return `<button type="button" class="todo-action-btn date-field-trigger todo-due-trigger"${btnIdAttr}${taskAttr} ${extraAttrs} data-date-picker-anchor aria-haspopup="dialog" aria-expanded="false" aria-label="${label}" title="${label}" ${disabled ? "disabled" : ""}><span class="todo-action-label">Due</span><span class="todo-action-value ${has ? "" : "is-empty"} ${overdue ? "is-overdue" : ""}"${valueIdAttr}${valueDataAttr}>${escapeHtml(dueLabel(dueDate, { empty: "Add date" }))}</span><span class="todo-action-caret" aria-hidden="true">▾</span></button>`;
}

function taskTimerControlsHtml(task) {
  if (task.completedAt) return "";
  const running = Boolean(task.timerStartedAt);
  const accrued = activeWorkSeconds(task);
  const accruedLabel = accrued > 0 ? formatDuration(accrued) : "";
  if (running) {
    return `
      <span class="todo-chip todo-chip-working" data-todo-timer-label="${task.id}">Working ${escapeHtml(formatDuration(accrued))}</span>
      <button type="button" class="todo-chip todo-chip-timer is-running" data-todo-timer="pause" data-todo-timer-id="${task.id}" aria-label="Pause work timer">Pause</button>
    `;
  }
  const label = accruedLabel ? `Resume · ${accruedLabel}` : "Start";
  const aria = accruedLabel ? `Resume work timer (${accruedLabel} so far)` : "Start work timer";
  return `
    <button type="button" class="todo-chip todo-chip-timer" data-todo-timer="start" data-todo-timer-id="${task.id}" aria-label="${escapeHtml(aria)}">${escapeHtml(label)}</button>
  `;
}

function renderTaskRow(task) {
  const day = todayKey();
  const expanded = expandedTaskIds.has(task.id);
  const took = completionDurationLabel(task);
  const overdue = isOverdue(task, day);
  const stepsDone = task.steps.filter((s) => s.completedAt).length;
  const list = findList(task.listId);
  return `
    <article class="todo-task ${task.completedAt ? "is-completed" : ""} ${overdue ? "is-overdue" : ""} ${task.timerStartedAt ? "is-timing" : ""}" data-task-id="${task.id}">
      <div class="todo-task-main">
        <label class="todo-check">
          <input type="checkbox" data-todo-complete="${task.id}" ${task.completedAt ? "checked" : ""} aria-label="Mark complete">
          <span aria-hidden="true"></span>
        </label>
        <div class="todo-task-body">
          <textarea class="todo-task-title" data-todo-title="${task.id}" rows="1" maxlength="${MAX_TODO_TITLE}" aria-label="Task title" ${task.completedAt ? "readonly" : ""}>${escapeHtml(task.title)}</textarea>
          <div class="todo-task-meta">
            ${list && isSmartListId(doc().activeListId)
              ? `<span class="todo-chip">${escapeHtml(list.name)}</span>` : ""}
            ${task.completedAt
              ? `<span class="todo-chip">Done ${escapeHtml(dueLabel(localDayKey(task.completedAt), { empty: "" }))}</span>` : ""}
            ${took ? `<span class="todo-chip todo-chip-took">Took ${escapeHtml(took)}</span>` : ""}
            ${taskTimerControlsHtml(task)}
            <button type="button" class="todo-chip todo-chip-steps ${expanded ? "is-open" : ""}" data-todo-expand="${task.id}" aria-expanded="${expanded}" title="${expanded ? "Hide steps" : (task.steps.length ? "Show steps" : "Add steps")}">
              ${task.steps.length ? `${stepsDone}/${task.steps.length} steps` : "+ Steps"}
            </button>
          </div>
        </div>
        <div class="todo-task-actions">
          ${prioritySelectHtml({
            priority: task.priority,
            taskId: task.id,
            disabled: Boolean(task.completedAt)
          })}
          ${dueTriggerHtml({
            dueDate: task.dueDate,
            overdue,
            disabled: Boolean(task.completedAt),
            taskId: task.id
          })}
          <button type="button" class="todo-icon-btn todo-danger" data-todo-delete="${task.id}" aria-label="Delete task">✕</button>
        </div>
      </div>
      ${expanded ? `
        <div class="todo-steps">
          ${task.steps.length ? `
            <div class="todo-steps-list" role="list" aria-label="Steps">
              ${task.steps.map((step) => `
                <div class="todo-step ${step.completedAt ? "is-completed" : ""}" data-step-id="${step.id}" role="listitem">
                  <label class="todo-check">
                    <input type="checkbox" data-todo-step-complete="${task.id}" data-step-id="${step.id}" ${step.completedAt ? "checked" : ""} aria-label="Complete step">
                    <span aria-hidden="true"></span>
                  </label>
                  <textarea class="todo-step-title" data-todo-step-title="${task.id}" data-step-id="${step.id}" rows="1" maxlength="${MAX_TODO_STEP_TITLE}" aria-label="Step title" ${task.completedAt ? "readonly" : ""}>${escapeHtml(step.title)}</textarea>
                  <button type="button" class="todo-icon-btn todo-danger" data-todo-step-delete="${task.id}" data-step-id="${step.id}" aria-label="Delete step">✕</button>
                </div>
              `).join("")}
            </div>
          ` : `<p class="todo-steps-empty">Break this task into smaller steps.</p>`}
          ${task.completedAt ? "" : `
            <form class="todo-step-form" data-todo-step-form="${task.id}">
              <span class="todo-step-add-mark" aria-hidden="true">+</span>
              <input type="text" maxlength="${MAX_TODO_STEP_TITLE}" placeholder="Add a step" aria-label="Add a step" autocomplete="off" value="${escapeHtml(stepDraftByTaskId.get(task.id) || "")}">
              <button type="submit" class="todo-step-add-btn">Add</button>
            </form>
          `}
        </div>
      ` : ""}
    </article>
  `;
}

function renderMain() {
  const main = dom.todosMain;
  if (!main) return;
  const d = doc();
  const meta = viewMeta(d.activeListId);
  const completedOnly = Boolean(meta.completedOnly);
  const rawTasks = tasksForView(d.activeListId);
  const tasks = sortTasks(completedOnly ? filterCompletedTasks(rawTasks) : rawTasks);
  const open = completedOnly ? [] : tasks.filter((t) => !t.completedAt);
  const done = completedOnly ? tasks : tasks.filter((t) => t.completedAt);
  const totalCompleted = completedOnly ? rawTasks.length : 0;
  const emptyCompletedMsg = completedFiltersActive()
    ? "No completed tasks match these filters."
    : "Nothing completed yet. Finish a task and it will show up here.";

  main.innerHTML = `
    <header class="todos-main-header" style="--todo-list-accent:${meta.color}">
      <div class="todos-main-heading">
        ${meta.editable
          ? `<input class="todos-list-title-input" id="todos-list-title-input" value="${escapeHtml(meta.title)}" maxlength="60" placeholder="List name" aria-label="List name" autocomplete="off" spellcheck="false">`
          : `<h2 id="todos-main-title">${escapeHtml(meta.title)}</h2>`}
        ${meta.editable
          ? `<input class="todos-list-desc-input" id="todos-list-desc-input" value="${escapeHtml(meta.list?.description || "")}" maxlength="160" placeholder="Add a description" aria-label="List description" autocomplete="off">`
          : `<p class="local-data-note">${escapeHtml(meta.subtitle)}</p>`}
      </div>
      ${meta.editable ? `
        <div class="todos-list-tools">
          <div class="todos-color-row" role="group" aria-label="List color">
            ${LIST_COLORS.map((c) => `
              <button type="button" class="todos-color-swatch ${meta.list?.color === c ? "is-selected" : ""}" data-todo-list-color="${c}" style="background:${c}" aria-label="Color ${c}"></button>
            `).join("")}
          </div>
          <button type="button" class="button button-ghost button-small" id="todos-delete-list-btn">Delete list</button>
        </div>
      ` : ""}
    </header>
    ${todoSortSelectHtml()}

    ${completedOnly ? "" : `
    <form class="todos-add-form" id="todos-add-form" aria-label="Create a new task">
      <span class="todos-add-plus" aria-hidden="true">+</span>
      <div class="todos-add-fields">
        <label class="todos-add-label" for="todos-add-input">New task</label>
        <textarea id="todos-add-input" rows="1" maxlength="${MAX_TODO_TITLE}" placeholder="What needs doing?" aria-label="New task title" required autocomplete="off"></textarea>
      </div>
      <div class="todos-add-tools">
        ${prioritySelectHtml({ priority: addDraft.priority, selectId: "todos-add-priority" })}
        ${dueTriggerHtml({
          dueDate: addDraft.dueDate,
          buttonId: "todos-add-due-btn",
          displayId: "todos-add-due-display"
        })}
        <button class="button button-primary button-small todos-add-submit" type="submit">Add</button>
        <button class="todo-icon-btn" id="todos-add-clear" type="button" aria-label="Clear draft">✕</button>
      </div>
    </form>
    `}

    <div class="todos-list-scroll">
    ${completedOnly ? `
    ${completedFiltersHtml(d.lists)}
    <p class="todos-filter-count" aria-live="polite">
      ${done.length === totalCompleted
        ? `${done.length} completed`
        : `Showing ${done.length} of ${totalCompleted}`}
    </p>
    <div class="todos-task-list" id="todos-done-list">
      ${done.length ? done.map(renderTaskRow).join("") : `<p class="todos-empty">${escapeHtml(emptyCompletedMsg)}</p>`}
    </div>
    ` : `
    <div class="todos-task-list" id="todos-open-list">
      ${open.length ? open.map(renderTaskRow).join("") : `<p class="todos-empty">No open tasks here. Add one above.</p>`}
    </div>

    ${done.length ? `
      <section class="todos-completed-section">
        <button type="button" class="todos-completed-toggle" id="todos-completed-toggle" aria-expanded="${completedOpen}">
          Completed (${done.length})
        </button>
        <div class="todos-task-list" id="todos-done-list" ${completedOpen ? "" : "hidden"}>
          ${done.map(renderTaskRow).join("")}
        </div>
      </section>
    ` : ""}
    `}
    </div>
  `;
  syncAddFormDraft();
}

export function renderTodos() {
  closePriorityMenu();
  closeOptionMenu();
  if (!state.todos) loadTodos();
  renderRail();
  renderMain();
  syncTodoTimerTick();
}

const SETUP_PREVIEW_SMART = new Set(["focus", "myday", "important", "overdue", "open"]);

function normalizeSetupTodosSource(value) {
  const v = String(value || "focus");
  if (SETUP_PREVIEW_SMART.has(v)) return v;
  if (findList(v)) return v;
  return "focus";
}

function setupTodosSource() {
  return normalizeSetupTodosSource(state.prefs?.setupTodosSource);
}

function setupPreviewTasks(day = todayKey(), source = setupTodosSource()) {
  const open = doc().tasks.filter((t) => !t.completedAt);
  if (source === "myday") {
    return sortTasks(open.filter((t) => isMyDay(t, day))).slice(0, 4);
  }
  if (source === "important") {
    return sortTasks(open.filter((t) => t.priority === "high")).slice(0, 4);
  }
  if (source === "overdue") {
    return open
      .filter((t) => isOverdue(t, day))
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
      .slice(0, 4);
  }
  if (source === "open") {
    return sortTasks(open).slice(0, 4);
  }
  if (findList(source)) {
    return sortTasks(open.filter((t) => t.listId === source)).slice(0, 4);
  }
  const overdue = open.filter((t) => isOverdue(t, day)).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const myDay = open.filter((t) => isMyDay(t, day) && !isOverdue(t, day));
  const rest = open.filter((t) => !isMyDay(t, day) && !isOverdue(t, day));
  return [...overdue, ...myDay, ...sortTasks(rest)].slice(0, 4);
}

function syncSetupTodosSourceSelect() {
  const trigger = dom.setupTodosSource;
  if (!trigger) return;
  const source = setupTodosSource();
  const label = menuOptionLabel(setupSourceOptions(), source, "Focus mix");
  const valueEl = trigger.querySelector(".todo-menu-value");
  if (valueEl) valueEl.textContent = label;
  trigger.dataset.value = source;
}

function setupSourceLabel(source = setupTodosSource()) {
  if (source === "myday") return "My Day";
  if (source === "important") return "Important";
  if (source === "overdue") return "Overdue";
  if (source === "open") return "Open tasks";
  if (source === "focus") return "Focus mix";
  return findList(source)?.name || "Tasks";
}

export function renderSetupTodosWidget() {
  const root = dom.setupTodosWidget;
  if (!root) return;
  if (!state.todos) loadTodos();
  const day = todayKey();
  const summary = getTodosSummary(day);
  const source = setupTodosSource();
  if (state.prefs && state.prefs.setupTodosSource !== source) {
    state.prefs.setupTodosSource = source;
  }
  if (dom.setupTodosMyDay) dom.setupTodosMyDay.textContent = String(summary.myDay);
  if (dom.setupTodosOverdue) dom.setupTodosOverdue.textContent = String(summary.overdue);
  if (dom.setupTodosOpen) dom.setupTodosOpen.textContent = String(summary.open);

  root.querySelectorAll(".setup-todos-metric").forEach((el) => el.classList.remove("is-warn", "is-accent"));
  const metrics = root.querySelectorAll(".setup-todos-metric");
  if (metrics[0] && summary.myDay) metrics[0].classList.add("is-accent");
  if (metrics[1] && summary.overdue) metrics[1].classList.add("is-warn");
  if (metrics[2] && summary.open && source === "open") metrics[2].classList.add("is-accent");

  syncSetupTodosSourceSelect();
  const preview = setupPreviewTasks(day, source);
  const sourceName = setupSourceLabel(source);

  if (dom.setupTodosHeadline) {
    if (!preview.length && !summary.open) dom.setupTodosHeadline.textContent = "Nothing planned";
    else if (source === "focus") {
      if (summary.overdue) dom.setupTodosHeadline.textContent = summary.overdue === 1 ? "1 overdue" : `${summary.overdue} overdue`;
      else if (summary.myDay) dom.setupTodosHeadline.textContent = summary.myDay === 1 ? "1 for today" : `${summary.myDay} for today`;
      else if (summary.open) dom.setupTodosHeadline.textContent = summary.open === 1 ? "1 open task" : `${summary.open} open tasks`;
      else dom.setupTodosHeadline.textContent = "Nothing planned";
    } else {
      const totalOpen = source === "myday" ? summary.myDay
        : source === "important" ? summary.important
        : source === "overdue" ? summary.overdue
        : source === "open" ? summary.open
        : doc().tasks.filter((t) => !t.completedAt && t.listId === source).length;
      dom.setupTodosHeadline.textContent = totalOpen
        ? `${totalOpen} in ${sourceName}`
        : `No ${sourceName.toLowerCase()} tasks`;
    }
  }

  if (dom.setupTodosHint) {
    if (!preview.length) {
      dom.setupTodosHint.textContent = source === "focus"
        ? "Add a few tasks, then start focusing."
        : `Nothing in ${sourceName} right now. Switch the Show menu or open To-Do.`;
    } else if (source === "important") {
      dom.setupTodosHint.textContent = "High-priority tasks — pick one and start focusing.";
    } else if (source === "overdue") {
      dom.setupTodosHint.textContent = "Clear overdue items, then start a session.";
    } else if (source === "myday") {
      dom.setupTodosHint.textContent = "Pick one My Day task and start focusing.";
    } else {
      dom.setupTodosHint.textContent = `Showing ${sourceName}. Tap a task to open it.`;
    }
  }

  if (dom.setupTodosPreview) {
    if (!preview.length) {
      dom.setupTodosPreview.replaceChildren();
    } else {
      dom.setupTodosPreview.innerHTML = preview.map((task) => {
        const overdue = isOverdue(task, day);
        const label = overdue
          ? `Due ${escapeHtml(dueLabel(task.dueDate, { empty: task.dueDate || "" }))}`
          : (isMyDay(task, day) ? "My Day" : (findList(task.listId)?.name || "Task"));
        return `
          <div class="setup-todos-row ${overdue ? "is-overdue" : ""}">
            <button type="button" class="setup-todos-row-check" data-setup-todo-complete="${task.id}" aria-label="Complete ${escapeHtml(task.title)}"></button>
            <button type="button" class="setup-todos-row-focus" data-setup-todo-focus="${task.id}" aria-label="Focus on ${escapeHtml(task.title)}">
              <span class="setup-todos-row-copy">
                <strong>${escapeHtml(task.title)}</strong>
                <span>${label} · tap to focus</span>
              </span>
            </button>
            <button type="button" class="setup-todos-row-open" data-setup-todo-open="${task.id}" aria-label="Open ${escapeHtml(task.title)} in To-Do" title="Open in To-Do">↗</button>
          </div>
        `;
      }).join("");
    }
  }
}

function openTodosFromSetup(view = "myday") {
  const d = doc();
  const day = todayKey();
  if (view === "overdue") {
    const overdue = d.tasks
      .filter((t) => isOverdue(t, day))
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
    setActiveTodoList(overdue?.listId || SMART_MYDAY);
  } else if (view === "open") {
    setActiveTodoList(d.lists[0]?.id || SMART_MYDAY);
  } else if (view === "important") {
    setActiveTodoList(SMART_IMPORTANT);
  } else if (view === "focus") {
    setActiveTodoList(SMART_MYDAY);
  } else if (findList(view)) {
    setActiveTodoList(view);
  } else {
    setActiveTodoList(SMART_MYDAY);
  }
  navigate("todos-screen");
}

function openTaskInTodos(taskId) {
  const task = findTask(taskId);
  if (task) {
    setActiveTodoList(task.listId);
    expandedTaskIds.add(task.id);
  } else {
    setActiveTodoList(SMART_MYDAY);
  }
  navigate("todos-screen");
  queueMicrotask(() => {
    const safeId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(taskId) : String(taskId).replace(/"/g, "");
    document.querySelector(`#todos-screen [data-task-id="${safeId}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
}

export function bindTodoEvents() {
  if (dom.setupTodosWidget && dom.setupTodosWidget.dataset.bound !== "1") {
    dom.setupTodosWidget.dataset.bound = "1";
    dom.setupTodosOpenBtn?.addEventListener("click", () => openTodosFromSetup(setupTodosSource()));
    dom.setupTodosWidget.addEventListener("click", (event) => {
      const completeBtn = event.target.closest("[data-setup-todo-complete]");
      if (completeBtn) {
        event.preventDefault();
        toggleTaskComplete(completeBtn.dataset.setupTodoComplete);
        return;
      }
      const focusTask = event.target.closest("[data-setup-todo-focus]");
      if (focusTask) {
        event.preventDefault();
        const id = focusTask.dataset.setupTodoFocus;
        import("./setup.js?v=207").then(({ linkTodoToSetup }) => {
          if (linkTodoToSetup(id)) {
            showToast("To-do linked to your focus goal.");
            dom.taskIntent?.focus();
            dom.setupForm?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
          } else {
            showToast("That to-do is no longer open.");
          }
        });
        return;
      }
      const openTask = event.target.closest("[data-setup-todo-open]");
      if (openTask) {
        openTaskInTodos(openTask.dataset.setupTodoOpen);
        return;
      }
      const viewBtn = event.target.closest("[data-setup-todo-view]");
      if (viewBtn) {
        openTodosFromSetup(viewBtn.dataset.setupTodoView);
      }
    });
  }

  const screen = document.getElementById("todos-screen");
  if (!screen || screen.dataset.bound === "1") return;
  screen.dataset.bound = "1";

  screen.addEventListener("click", (event) => {
    const listBtn = event.target.closest("[data-todo-list]");
    if (listBtn) {
      setActiveTodoList(listBtn.dataset.todoList);
      return;
    }
    if (event.target.closest("#todos-new-list-btn")) {
      addTodoList("New list");
      queueMicrotask(focusNewListTitleInput);
      return;
    }
    if (event.target.closest("#todos-delete-list-btn")) {
      const id = doc().activeListId;
      if (!isSmartListId(id)) deleteTodoList(id);
      return;
    }
    const colorBtn = event.target.closest("[data-todo-list-color]");
    if (colorBtn) {
      const id = doc().activeListId;
      setTodoListColor(id, colorBtn.dataset.todoListColor);
      return;
    }
    if (event.target.closest("#todos-completed-toggle")) {
      completedOpen = !completedOpen;
      renderTodos();
      return;
    }
    if (event.target.closest("#todos-completed-filters-clear")) {
      resetCompletedFilters();
      renderTodos();
      return;
    }
    if (event.target.closest("#todos-completed-day-btn")) {
      const btn = document.getElementById("todos-completed-day-btn");
      openTodoDuePicker(btn, {
        id: "todo-completed-day",
        getValue: () => completedFilters.customDate || "",
        setValue: (iso) => {
          completedFilters.customDate = iso || null;
          completedFilters.date = "custom";
        },
        onCommit: () => renderTodos()
      });
      return;
    }
    const priorityTrigger = event.target.closest(".todo-priority-trigger");
    if (priorityTrigger) {
      event.preventDefault();
      openPriorityMenu(priorityTrigger);
      return;
    }
    if (event.target.closest("#todos-add-clear")) {
      resetAddDraft();
      const input = document.getElementById("todos-add-input");
      if (input) input.value = "";
      syncAddFormDraft();
      input?.focus();
      return;
    }
    if (event.target.closest("#todos-add-due-btn")) {
      const btn = document.getElementById("todos-add-due-btn");
      openTodoDuePicker(btn, {
        id: "todo-add-due",
        getValue: () => addDraft.dueDate || "",
        setValue: (iso) => { addDraft.dueDate = iso || null; syncAddFormDraft(); },
        onCommit: () => syncAddFormDraft()
      });
      return;
    }
    const dueBtn = event.target.closest("[data-todo-due-btn]");
    if (dueBtn) {
      const taskId = dueBtn.dataset.todoDueBtn;
      openTodoDuePicker(dueBtn, {
        id: `todo-due-${taskId}`,
        getValue: () => findTask(taskId)?.dueDate || "",
        setValue: (iso) => { setTaskDueDate(taskId, iso || null); },
        onCommit: () => {}
      });
      return;
    }
    const timerBtn = event.target.closest("[data-todo-timer]");
    if (timerBtn) {
      const id = timerBtn.dataset.todoTimerId;
      if (timerBtn.dataset.todoTimer === "pause") pauseTaskTimer(id);
      else startTaskTimer(id);
      return;
    }
    const expandBtn = event.target.closest("[data-todo-expand]");
    if (expandBtn) {
      const id = expandBtn.dataset.todoExpand;
      const isOpen = expandedTaskIds.has(id);
      if (isOpen) {
        // Save any typed draft, then collapse — Add / Enter keep the panel open for the next step.
        commitStepDraft(id);
        clearStepDraft(id);
        expandedTaskIds.delete(id);
        renderTodos();
        return;
      }
      expandedTaskIds.add(id);
      renderTodos();
      queueMicrotask(() => {
        document.querySelector(`[data-todo-step-form="${CSS.escape(String(id))}"] input`)?.focus();
      });
      return;
    }
    const delBtn = event.target.closest("[data-todo-delete]");
    if (delBtn) {
      const task = findTask(delBtn.dataset.todoDelete);
      if (!task) return;
      askConfirm(
        "Delete task?",
        `Delete “${task.title}”? This cannot be undone.`,
        () => deleteTask(task.id),
        "Delete"
      );
      return;
    }
    const stepDel = event.target.closest("[data-todo-step-delete]");
    if (stepDel) {
      deleteStep(stepDel.dataset.todoStepDelete, stepDel.dataset.stepId);
      return;
    }
  });

  screen.addEventListener("change", (event) => {
    const complete = event.target.closest("[data-todo-complete]");
    if (complete) {
      toggleTaskComplete(complete.dataset.todoComplete);
      return;
    }
    const stepComplete = event.target.closest("[data-todo-step-complete]");
    if (stepComplete) {
      toggleStep(stepComplete.dataset.todoStepComplete, stepComplete.dataset.stepId);
    }
  });

  screen.addEventListener("submit", (event) => {
    const addForm = event.target.closest("#todos-add-form");
    if (addForm) {
      event.preventDefault();
      const input = addForm.querySelector("#todos-add-input");
      const created = addTask(input?.value, {
        priority: addDraft.priority,
        dueDate: addDraft.dueDate
      });
      if (created) {
        if (input) input.value = "";
        resetAddDraft();
        syncAddFormDraft();
        input?.focus();
        fitTodosAddInput();
      }
      return;
    }
    const stepForm = event.target.closest("[data-todo-step-form]");
    if (stepForm) {
      event.preventDefault();
      const taskId = stepForm.dataset.todoStepForm;
      syncStepDraftFromDom(taskId);
      commitStepDraft(taskId);
    }
  });

  screen.addEventListener("input", (event) => {
    const stepAdd = event.target.closest("[data-todo-step-form] input");
    if (stepAdd) {
      const taskId = stepAdd.closest("[data-todo-step-form]")?.dataset.todoStepForm;
      if (taskId) syncStepDraftFromDom(taskId);
      return;
    }
    if (event.target.id === "todos-add-input") {
      fitTodosAddInput();
      return;
    }
    const multiTitle = event.target.closest("textarea[data-todo-title], textarea[data-todo-step-title]");
    if (multiTitle) fitTodoMultilineField(multiTitle);
  });

  screen.addEventListener("focusin", (event) => {
    if (event.target.id === "todos-add-input") {
      fitTodosAddInput();
      return;
    }
    const multiTitle = event.target.closest("textarea[data-todo-title], textarea[data-todo-step-title]");
    if (multiTitle) {
      fitTodoMultilineField(multiTitle);
      return;
    }
  });

  screen.addEventListener("focusout", (event) => {
    const multiTitle = event.target.closest("textarea[data-todo-title], textarea[data-todo-step-title]");
    if (!multiTitle) return;
    // Collapse after the related blur/change handlers run.
    queueMicrotask(() => fitTodoMultilineField(multiTitle));
  });

  screen.addEventListener("change", (event) => {
    const titleInput = event.target.closest("[data-todo-title]");
    if (titleInput) updateTaskTitle(titleInput.dataset.todoTitle, titleInput.value);
    const stepTitle = event.target.closest("[data-todo-step-title]");
    if (stepTitle) {
      updateStepTitle(stepTitle.dataset.todoStepTitle, stepTitle.dataset.stepId, stepTitle.value);
      return;
    }
    const listTitle = event.target.closest("#todos-list-title-input");
    if (listTitle) renameTodoList(doc().activeListId, listTitle.value);
    const listDesc = event.target.closest("#todos-list-desc-input");
    if (listDesc) setTodoListDescription(doc().activeListId, listDesc.value);
  });

  screen.addEventListener("keydown", (event) => {
    const priorityTrigger = event.target.closest(".todo-priority-trigger");
    if (priorityTrigger && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      openPriorityMenu(priorityTrigger);
      return;
    }
    const stepAdd = event.target.closest("[data-todo-step-form] input");
    if (stepAdd && event.key === "Enter") {
      event.preventDefault();
      stepAdd.closest("form")?.requestSubmit();
      return;
    }
    if (stepAdd && event.key === "Escape") {
      event.preventDefault();
      const taskId = stepAdd.closest("[data-todo-step-form]")?.dataset.todoStepForm;
      if (taskId) {
        clearStepDraft(taskId);
        expandedTaskIds.delete(taskId);
        renderTodos();
      }
      return;
    }
    if (event.target.id === "todos-add-input" && event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.target.closest("form")?.requestSubmit();
      return;
    }
    const multiTitle = event.target.closest("textarea[data-todo-title], textarea[data-todo-step-title]");
    if (multiTitle) {
      // Enter inserts a new line; Escape collapses.
      if (event.key === "Escape") {
        event.preventDefault();
        multiTitle.blur();
      }
      return;
    }
    const titleInput = event.target.closest("#todos-list-title-input, #todos-list-desc-input");
    if (titleInput && event.key === "Enter") {
      event.preventDefault();
      titleInput.blur();
    }
  });

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest(".todo-menu-trigger");
    if (!trigger) return;
    event.preventDefault();
    openTodoOptionMenu(trigger);
  });
  document.addEventListener("keydown", (event) => {
    const trigger = event.target.closest?.(".todo-menu-trigger");
    if (!trigger || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
    event.preventDefault();
    event.stopPropagation();
    openTodoOptionMenu(trigger);
  });
  document.addEventListener("pointerdown", (event) => {
    if (optionMenu && !optionMenu.hidden && !optionMenu.contains(event.target) && !optionMenuAnchor?.contains(event.target)) {
      closeOptionMenu();
    }
    if (!priorityMenu || priorityMenu.hidden) return;
    if (priorityMenu.contains(event.target)) return;
    if (priorityMenuAnchor?.contains(event.target)) return;
    closePriorityMenu();
  }, true);
  window.addEventListener("resize", () => {
    closePriorityMenu();
    closeOptionMenu();
  });
  window.addEventListener("scroll", () => {
    if (priorityMenu && !priorityMenu.hidden) closePriorityMenu();
    if (optionMenu && !optionMenu.hidden) closeOptionMenu();
  }, true);
}
