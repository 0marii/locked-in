/** Microsoft To Do–inspired tasks: lists, My Day, due dates, steps. */
import { MAX_TODO_LISTS, MAX_TODO_STEPS, MAX_TODO_TASKS, PREFS_KEY, TODOS_KEY } from "./constants.js?v=140";
import { dom, state, tabId } from "./runtime.js?v=140";
import { safeRead, safeWrite } from "./storage.js?v=140";
import { showToast } from "./toast.js?v=140";
import { formatDuration, formatShortDate, localDayKey } from "./utils.js?v=140";
import { broadcast } from "./sync.js?v=140";
import { askConfirm, navigate } from "./theme-nav.js?v=140";

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
let addDraft = { priority: "medium", dueDate: null };
let completedFilters = { date: "all", listId: "all", priority: "all", customDate: null };

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
  return `
    <div class="todos-completed-filters" role="search" aria-label="Filter completed tasks">
      <label class="todos-filter-field">
        <span class="visually-hidden">Filter by date</span>
        <select id="todos-completed-date" aria-label="Filter by date">
          ${dateOpts.map(([value, label]) => `
            <option value="${value}" ${completedFilters.date === value ? "selected" : ""}>${escapeHtml(label)}</option>
          `).join("")}
        </select>
      </label>
      ${completedFilters.date === "custom" ? `
        <button type="button" class="date-field-trigger todo-due-trigger todos-filter-day-btn" id="todos-completed-day-btn" data-date-picker-anchor aria-haspopup="dialog" aria-expanded="false" aria-label="Completed on date">
          <span class="date-field-value ${completedFilters.customDate ? "" : "is-empty"}" id="todos-completed-day-display">${escapeHtml(customLabel)}</span>
        </button>
      ` : ""}
      <label class="todos-filter-field">
        <span class="visually-hidden">Filter by list</span>
        <select id="todos-completed-list" aria-label="Filter by list">
          <option value="all" ${completedFilters.listId === "all" ? "selected" : ""}>All lists</option>
          ${lists.map((list) => `
            <option value="${escapeHtml(list.id)}" ${completedFilters.listId === list.id ? "selected" : ""}>${escapeHtml(list.name)}</option>
          `).join("")}
        </select>
      </label>
      <label class="todos-filter-field">
        <span class="visually-hidden">Filter by priority</span>
        <select id="todos-completed-priority" aria-label="Filter by priority">
          ${priorityOpts.map(([value, label]) => `
            <option value="${value}" ${completedFilters.priority === value ? "selected" : ""}>${escapeHtml(label)}</option>
          `).join("")}
        </select>
      </label>
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

function syncAddFormDraft() {
  const priority = document.getElementById("todos-add-priority");
  const dueDisplay = document.getElementById("todos-add-due-display");
  if (priority) {
    const p = normalizePriority(addDraft.priority);
    priority.className = `todo-action-btn todo-priority-btn is-${p}`;
    const value = priority.querySelector(".todo-action-value");
    if (value) value.textContent = priorityLabel(p);
    priority.setAttribute("aria-label", `Priority ${priorityLabel(p)}. Click to change`);
    priority.title = `Change priority (now ${priorityLabel(p)})`;
  }
  if (dueDisplay) {
    dueDisplay.textContent = dueLabel(addDraft.dueDate, { empty: "Add date" });
    dueDisplay.classList.toggle("is-empty", !addDraft.dueDate);
  }
}

async function openTodoDuePicker(anchor, { id, getValue, setValue, onCommit }) {
  if (!anchor) return;
  // Dynamic import avoids a circular dependency with history.js (backup uses todos).
  const { toggleCustomDatePicker } = await import("./history.js?v=140");
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

function normalizeStep(raw) {
  const title = String(raw?.title || "").trim().slice(0, 200);
  if (!title) return null;
  return {
    id: String(raw?.id || uid("step")),
    title,
    completedAt: raw?.completedAt ? String(raw.completedAt) : null
  };
}

function normalizeTask(raw) {
  if (!raw || typeof raw !== "object") return null;
  const title = String(raw.title || "").trim().slice(0, 200);
  if (!title) return null;
  const steps = (Array.isArray(raw.steps) ? raw.steps : [])
    .map(normalizeStep)
    .filter(Boolean)
    .slice(0, MAX_TODO_STEPS);
  return {
    id: String(raw.id || uid("task")),
    listId: String(raw.listId || ""),
    title,
    priority: normalizePriority(raw.priority),
    createdAt: raw.createdAt || new Date().toISOString(),
    completedAt: raw.completedAt ? String(raw.completedAt) : null,
    dueDate: raw.dueDate ? String(raw.dueDate).slice(0, 10) : null,
    myDayDate: raw.myDayDate ? String(raw.myDayDate).slice(0, 10) : null,
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

function findList(id) {
  return doc().lists.find((l) => l.id === id) || null;
}

export function isMyDay(task, day = todayKey()) {
  return Boolean(task?.myDayDate && task.myDayDate === day);
}

export function isOverdue(task, day = todayKey()) {
  return Boolean(task?.dueDate && !task.completedAt && task.dueDate < day);
}

export function completionDurationLabel(task) {
  if (!task?.completedAt || !task?.createdAt) return null;
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

function sortTasks(tasks, { completedFirst = false } = {}) {
  return tasks.slice().sort((a, b) => {
    if (completedFirst && a.completedAt && b.completedAt) {
      return String(b.completedAt).localeCompare(String(a.completedAt));
    }
    const ac = a.completedAt ? 1 : 0;
    const bc = b.completedAt ? 1 : 0;
    if (ac !== bc) return ac - bc;
    if (!a.completedAt && !b.completedAt) {
      const ap = { high: 0, medium: 1, low: 2 }[a.priority] ?? 1;
      const bp = { high: 0, medium: 1, low: 2 }[b.priority] ?? 1;
      if (ap !== bp) return ap - bp;
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
    }
    if (a.completedAt && b.completedAt) {
      return String(b.completedAt).localeCompare(String(a.completedAt));
    }
    return (a.sortOrder || 0) - (b.sortOrder || 0);
  });
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

export function addTodoList(name = "New list") {
  const d = doc();
  if (d.lists.length >= MAX_TODO_LISTS) {
    showToast(`You can have up to ${MAX_TODO_LISTS} lists.`);
    return null;
  }
  const list = normalizeList({
    id: uid("list"),
    name: String(name || "New list").trim().slice(0, 60) || "New list",
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
  const next = String(name || "").trim().slice(0, 60);
  if (!next) return false;
  list.name = next;
  saveTodos();
  renderTodos();
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
  const text = String(title || "").trim().slice(0, 200);
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
  const next = String(title || "").trim().slice(0, 200);
  if (!next) return false;
  task.title = next;
  saveTodos();
  renderTodos();
  return true;
}

export function toggleTaskComplete(id) {
  const task = findTask(id);
  if (!task) return false;
  if (task.completedAt) {
    task.completedAt = null;
  } else {
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
  expandedTaskIds.add(taskId);
  saveTodos();
  renderTodos();
  queueMicrotask(() => {
    const input = document.querySelector(`[data-todo-step-form="${taskId}"] input`);
    input?.focus();
  });
  return step;
}

export function updateStepTitle(taskId, stepId, title) {
  const task = findTask(taskId);
  if (!task) return false;
  const step = task.steps.find((s) => s.id === stepId);
  if (!step) return false;
  const next = String(title || "").trim().slice(0, 200);
  if (!next) return false;
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
    subtitle: "Custom list",
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
    <div class="todos-rail-section" role="list" aria-label="Your lists">
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

function priorityLabel(priority) {
  return { low: "Low", medium: "Med", high: "High" }[priority] || "Med";
}

function nextPriority(priority) {
  const order = ["low", "medium", "high"];
  const i = order.indexOf(normalizePriority(priority));
  return order[(i + 1) % order.length];
}

function priorityToggleHtml({ priority, attrs = "", disabled = false }) {
  const p = normalizePriority(priority);
  return `<button type="button" class="todo-action-btn todo-priority-btn is-${p}" ${attrs} aria-label="Priority ${priorityLabel(p)}. Click to change" title="Change priority (now ${priorityLabel(p)})" ${disabled ? "disabled" : ""}><span class="todo-action-label">Priority</span><span class="todo-action-value">${priorityLabel(p)}</span><span class="todo-action-caret" aria-hidden="true">▾</span></button>`;
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

function renderTaskRow(task) {
  const day = todayKey();
  const expanded = expandedTaskIds.has(task.id);
  const took = completionDurationLabel(task);
  const overdue = isOverdue(task, day);
  const stepsDone = task.steps.filter((s) => s.completedAt).length;
  const list = findList(task.listId);
  return `
    <article class="todo-task ${task.completedAt ? "is-completed" : ""} ${overdue ? "is-overdue" : ""}" data-task-id="${task.id}">
      <div class="todo-task-main">
        <label class="todo-check">
          <input type="checkbox" data-todo-complete="${task.id}" ${task.completedAt ? "checked" : ""} aria-label="Mark complete">
          <span aria-hidden="true"></span>
        </label>
        <div class="todo-task-body">
          <input class="todo-task-title" data-todo-title="${task.id}" value="${escapeHtml(task.title)}" aria-label="Task title" ${task.completedAt ? "readonly" : ""}>
          <div class="todo-task-meta">
            ${list && isSmartListId(doc().activeListId)
              ? `<span class="todo-chip">${escapeHtml(list.name)}</span>` : ""}
            ${task.completedAt
              ? `<span class="todo-chip">Done ${escapeHtml(dueLabel(localDayKey(task.completedAt), { empty: "" }))}</span>` : ""}
            ${took ? `<span class="todo-chip todo-chip-took">Took ${escapeHtml(took)}</span>` : ""}
            <button type="button" class="todo-chip todo-chip-steps ${expanded ? "is-open" : ""}" data-todo-expand="${task.id}" aria-expanded="${expanded}">
              ${task.steps.length ? `${stepsDone}/${task.steps.length} steps` : "+ Steps"}
            </button>
          </div>
        </div>
        <div class="todo-task-actions">
          ${priorityToggleHtml({
            priority: task.priority,
            attrs: `data-todo-priority="${task.id}"`,
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
          ${task.steps.map((step) => `
            <div class="todo-step ${step.completedAt ? "is-completed" : ""}" data-step-id="${step.id}">
              <label class="todo-check">
                <input type="checkbox" data-todo-step-complete="${task.id}" data-step-id="${step.id}" ${step.completedAt ? "checked" : ""} aria-label="Complete step">
                <span aria-hidden="true"></span>
              </label>
              <input class="todo-step-title" data-todo-step-title="${task.id}" data-step-id="${step.id}" value="${escapeHtml(step.title)}" aria-label="Step title" ${task.completedAt ? "readonly" : ""}>
              <button type="button" class="todo-icon-btn todo-danger" data-todo-step-delete="${task.id}" data-step-id="${step.id}" aria-label="Delete step">✕</button>
            </div>
          `).join("")}
          ${task.completedAt ? "" : `
            <form class="todo-step-form" data-todo-step-form="${task.id}">
              <span class="todo-check" aria-hidden="true"><span></span></span>
              <input type="text" maxlength="200" placeholder="Next step" aria-label="Add a step" autocomplete="off">
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
  const tasks = sortTasks(
    completedOnly ? filterCompletedTasks(rawTasks) : rawTasks,
    { completedFirst: completedOnly }
  );
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
          ? `<input class="todos-list-title-input" id="todos-list-title-input" value="${escapeHtml(meta.title)}" maxlength="60" aria-label="List name">`
          : `<h2 id="todos-main-title">${escapeHtml(meta.title)}</h2>`}
        <p class="local-data-note">${escapeHtml(meta.subtitle)}</p>
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

    ${completedOnly ? "" : `
    <form class="todos-add-form" id="todos-add-form" aria-label="Create a new task">
      <span class="todos-add-plus" aria-hidden="true">+</span>
      <div class="todos-add-fields">
        <label class="todos-add-label" for="todos-add-input">New task</label>
        <input id="todos-add-input" type="text" maxlength="200" placeholder="What needs doing?" aria-label="New task title" required autocomplete="off">
      </div>
      <div class="todos-add-tools">
        ${priorityToggleHtml({ priority: addDraft.priority, attrs: 'id="todos-add-priority"' })}
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
  `;
  syncAddFormDraft();
}

export function renderTodos() {
  if (!state.todos) loadTodos();
  renderRail();
  renderMain();
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
  const select = dom.setupTodosSource;
  if (!select) return;
  const source = setupTodosSource();
  const lists = doc().lists || [];
  select.innerHTML = `
    <option value="focus">Focus mix</option>
    <option value="myday">My Day</option>
    <option value="important">Important</option>
    <option value="overdue">Overdue</option>
    <option value="open">All open</option>
    ${lists.map((list) => `<option value="${escapeHtml(list.id)}">${escapeHtml(list.name)}</option>`).join("")}
  `;
  select.value = source;
  if (select.value !== source) select.value = "focus";
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
            <button type="button" class="setup-todos-row-open" data-setup-todo-open="${task.id}" aria-label="Open ${escapeHtml(task.title)} in To-Do">
              <span class="setup-todos-row-copy">
                <strong>${escapeHtml(task.title)}</strong>
                <span>${label}</span>
              </span>
            </button>
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
    dom.setupTodosSource?.addEventListener("change", () => {
      state.prefs.setupTodosSource = normalizeSetupTodosSource(dom.setupTodosSource.value);
      if (!safeWrite(PREFS_KEY, state.prefs)) {
        showToast("Could not save preferences — browser storage unavailable.");
      }
      renderSetupTodosWidget();
    });
    dom.setupTodosWidget.addEventListener("click", (event) => {
      const completeBtn = event.target.closest("[data-setup-todo-complete]");
      if (completeBtn) {
        event.preventDefault();
        toggleTaskComplete(completeBtn.dataset.setupTodoComplete);
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
      queueMicrotask(() => document.getElementById("todos-list-title-input")?.focus());
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
    if (event.target.closest("#todos-add-priority")) {
      addDraft.priority = nextPriority(addDraft.priority);
      syncAddFormDraft();
      return;
    }
    const priorityBtn = event.target.closest("[data-todo-priority]");
    if (priorityBtn) {
      const task = findTask(priorityBtn.dataset.todoPriority);
      if (task && !task.completedAt) {
        const next = nextPriority(task.priority);
        setTaskPriority(task.id, next);
      }
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
    const expandBtn = event.target.closest("[data-todo-expand]");
    if (expandBtn) {
      const id = expandBtn.dataset.todoExpand;
      const opening = !expandedTaskIds.has(id);
      if (opening) expandedTaskIds.add(id);
      else expandedTaskIds.delete(id);
      renderTodos();
      if (opening) {
        queueMicrotask(() => {
          document.querySelector(`[data-todo-step-form="${id}"] input`)?.focus();
        });
      }
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
      return;
    }
    if (event.target.id === "todos-completed-date") {
      completedFilters.date = event.target.value || "all";
      if (completedFilters.date !== "custom") completedFilters.customDate = null;
      if (completedFilters.date === "custom" && !completedFilters.customDate) {
        completedFilters.customDate = todayKey();
      }
      renderTodos();
      return;
    }
    if (event.target.id === "todos-completed-list") {
      completedFilters.listId = event.target.value || "all";
      renderTodos();
      return;
    }
    if (event.target.id === "todos-completed-priority") {
      completedFilters.priority = event.target.value || "all";
      renderTodos();
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
      }
      return;
    }
    const stepForm = event.target.closest("[data-todo-step-form]");
    if (stepForm) {
      event.preventDefault();
      const input = stepForm.querySelector("input");
      const text = String(input?.value || "").trim();
      if (!text) return;
      addStep(stepForm.dataset.todoStepForm, text);
    }
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
  });

  screen.addEventListener("keydown", (event) => {
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
        expandedTaskIds.delete(taskId);
        renderTodos();
      }
      return;
    }
    const titleInput = event.target.closest("[data-todo-title], #todos-list-title-input, [data-todo-step-title]");
    if (titleInput && event.key === "Enter") {
      event.preventDefault();
      titleInput.blur();
    }
  });

}
