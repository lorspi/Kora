/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Kora project operations for the MCP server. They follow the same rules as the
 * app's store (src/store/index.ts): one JSON file per task, TSK-### codes, Spanish
 * activity entries in /activity/logs.json (newest first), deleted items go to the
 * trash, and nothing is written over a task or document someone has open.
 *
 * Every operation re-reads what it needs from storage: the app may be editing the
 * same project at the same time, and it picks up our files on its next reload.
 */

import { randomUUID } from 'node:crypto';
import type {
  DocMetadata,
  ProjectLocks,
  ProjectMetadata,
  Subtask,
  SystemUser,
  Task,
  TaskActivityLog,
  TaskEffort,
  TaskList,
  TaskLock,
  TrashItem,
} from '../../src/types';
import type { Storage } from './storage';

export type Priority = Task['priority'];

export const PRIORITY_LABELS: Record<Priority, string> = { low: 'Baja', medium: 'Media', high: 'Alta', urgent: 'Urgente' };
export const EFFORT_LABELS: Record<TaskEffort, string> = {
  easy: 'Fácil',
  casual: 'Casual',
  moderate: 'Moderado',
  hard: 'Difícil',
  epic: 'Épico',
};

/** Statuses of a new list, as the app creates them. */
const DEFAULT_STATUSES = [
  { id: 'todo', name: 'Por Hacer', color: '#d1d5db', isCompleted: false },
  { id: 'inprogress', name: 'En Desarrollo', color: '#3b82f6', isCompleted: false },
  { id: 'review', name: 'Revisión', color: '#f59e0b', isCompleted: false },
  { id: 'done', name: 'Listo / Completado', color: '#10b981', isCompleted: true },
];

/** Error whose message is meant for the person (shown as the tool result). */
export class KoraError extends Error {}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

/** Exact match on id or (accent/case-insensitive) name, then a unique partial name match. */
function pick<T>(items: T[], ref: string, keys: (item: T) => string[], what: string, names: (item: T) => string): T {
  const q = fold(ref);
  const exact = items.find((i) => keys(i).some((k) => fold(k) === q));
  if (exact) return exact;
  const partial = items.filter((i) => keys(i).some((k) => fold(k).includes(q)));
  if (partial.length === 1) return partial[0];
  const options = (partial.length > 1 ? partial : items).map(names).join(', ');
  throw new KoraError(
    partial.length > 1
      ? `"${ref}" coincide con varios ${what}: ${options}. Sé más específico.`
      : `No encontré "${ref}" entre los ${what}. Opciones: ${options || '(ninguno)'}.`
  );
}

async function readJson<T>(storage: Storage, p: string, fallback: T): Promise<T> {
  try {
    if (!(await storage.fileExists(p))) return fallback;
    return JSON.parse(await storage.readTextFile(p)) as T;
  } catch {
    return fallback;
  }
}

const writeJson = (storage: Storage, p: string, data: unknown) => storage.writeTextFile(p, JSON.stringify(data, null, 2));

/** Same filename rule as the app's createDoc / saveDocContent. */
function docBaseFilename(title: string): string {
  return (
    title
      .trim()
      .replace(/[<>:"/\\|?*]/g, '_')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '') || 'untitled'
  );
}

const docPath = (d: Pick<DocMetadata, 'folder' | 'filename'>) => (d.folder ? `/docs/${d.folder}/${d.filename}` : `/docs/${d.filename}`);

export interface TaskInput {
  title: string;
  list: string;
  status?: string;
  priority?: Priority;
  description?: string;
  dueDate?: string;
  assignees?: string[];
  tags?: string[];
  effort?: TaskEffort;
  dependencies?: string[];
  subtasks?: string[];
}

export interface TaskPatch {
  title?: string;
  description?: string;
  appendDescription?: string;
  list?: string;
  status?: string;
  priority?: Priority;
  dueDate?: string;
  assignees?: string[];
  addTags?: string[];
  removeTags?: string[];
  effort?: TaskEffort | null;
  dependencies?: string[];
}

export interface TaskFilter {
  list?: string;
  status?: string;
  assignee?: string;
  priority?: Priority;
  tag?: string;
  text?: string;
  includeCompleted?: boolean;
}

export class Kora {
  constructor(
    private storage: Storage,
    /** Username, name or id of the Kora user that actions are attributed to. */
    private actorRef?: string
  ) {}

  get location() {
    return this.storage.label;
  }

  // ---------- Loading ----------

  async meta(): Promise<ProjectMetadata> {
    const meta = await readJson<ProjectMetadata | null>(this.storage, '/project.json', null);
    if (!meta) throw new KoraError(`No hay un proyecto de Kora en ${this.storage.label} (falta project.json).`);
    return meta;
  }

  async users(): Promise<SystemUser[]> {
    return readJson<SystemUser[]>(this.storage, '/users/users.json', []);
  }

  async lists(): Promise<TaskList[]> {
    const lists: TaskList[] = [];
    for (const f of await this.storage.listFiles('/lists')) {
      if (f.endsWith('.json')) {
        const l = await readJson<TaskList | null>(this.storage, `/lists/${f}`, null);
        if (l?.id) lists.push(l);
      }
    }
    return lists.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.createdAt - b.createdAt);
  }

  async tasks(): Promise<Task[]> {
    const tasks: Task[] = [];
    for (const f of await this.storage.listFiles('/tasks')) {
      if (f.endsWith('.json')) {
        const t = await readJson<Task | null>(this.storage, `/tasks/${f}`, null);
        if (t?.id) tasks.push(t);
      }
    }
    return tasks.sort((a, b) => codeNumber(a.taskCode) - codeNumber(b.taskCode));
  }

  async docs(): Promise<DocMetadata[]> {
    return readJson<DocMetadata[]>(this.storage, '/docs/info.json', []);
  }

  async logs(): Promise<TaskActivityLog[]> {
    return readJson<TaskActivityLog[]>(this.storage, '/activity/logs.json', []);
  }

  /** The user actions are attributed to: the configured one, else the first admin. */
  async actor(): Promise<SystemUser> {
    const users = await this.users();
    if (users.length === 0) throw new KoraError('El proyecto no tiene usuarios. Crea uno en Kora primero.');
    if (this.actorRef) {
      return pick(users, this.actorRef, (u) => [u.id, u.username, u.name], 'usuarios', (u) => `${u.name} (@${u.username})`);
    }
    return users.find((u) => u.isSuperAdmin) ?? users[0];
  }

  // ---------- Lookups ----------

  findList(lists: TaskList[], ref: string): TaskList {
    return pick(lists, ref, (l) => [l.id, l.name], 'listas', (l) => `"${l.name}"`);
  }

  findStatus(list: TaskList, ref: string) {
    return pick(list.statuses, ref, (s) => [s.id, s.name], `estados en "${list.name}"`, (s) => `"${s.name}"`);
  }

  /** By code ("TSK-012", "tsk-12", "12") or id. */
  findTask(tasks: Task[], ref: string): Task {
    const r = ref.trim();
    const byId = tasks.find((t) => t.id === r);
    if (byId) return byId;
    const n = codeNumber(r);
    const byCode = Number.isFinite(n) ? tasks.find((t) => codeNumber(t.taskCode) === n) : undefined;
    if (byCode) return byCode;
    throw new KoraError(`No encontré la tarea "${ref}". Usa su código (p. ej. TSK-012).`);
  }

  findUsers(users: SystemUser[], refs: string[]): SystemUser[] {
    return refs.map((r) =>
      pick(users, r.replace(/^@/, ''), (u) => [u.id, u.username, u.name], 'usuarios', (u) => `${u.name} (@${u.username})`)
    );
  }

  findDoc(docs: DocMetadata[], ref: string): DocMetadata {
    return pick(
      docs,
      ref,
      (d) => [d.id, d.title, d.filename, d.folder ? `${d.folder}/${d.filename}` : d.filename],
      'documentos',
      (d) => `"${d.title}"`
    );
  }

  // ---------- Locks ----------

  private async assertTaskFree(task: Task, actor: SystemUser) {
    const locks = await readJson<ProjectLocks>(this.storage, '/activity/locks.json', {});
    const lock = locks[task.id];
    if (lock && lock.userId !== actor.id && lock.expiresAt > Date.now()) {
      throw new KoraError(
        `${lock.username} está editando ${task.taskCode} en Kora ahora mismo. Inténtalo de nuevo cuando cierre la tarea.`
      );
    }
  }

  private async assertDocFree(d: DocMetadata) {
    const lock = await readJson<TaskLock | null>(this.storage, `/activity/doc-locks/${d.id}.json`, null);
    if (lock?.userId && lock.expiresAt > Date.now()) {
      throw new KoraError(
        `${lock.username} tiene abierto "${d.title}" en Kora. Inténtalo de nuevo cuando cierre el documento.`
      );
    }
  }

  // ---------- Activity ----------

  private async log(actor: SystemUser, entries: { taskId: string; action: string; comment?: string }[]) {
    if (entries.length === 0) return;
    const now = Date.now();
    const newLogs: TaskActivityLog[] = entries
      .map((e, i) => ({
        id: randomUUID(),
        taskId: e.taskId,
        userId: actor.id,
        username: actor.name,
        action: e.action,
        timestamp: now + i,
        ...(e.comment
          ? { comment: { id: randomUUID(), userId: actor.id, username: actor.name, text: e.comment, createdAt: now + i } }
          : {}),
      }))
      .reverse(); // stored newest first
    // Re-read right before writing so entries made meanwhile in the app are kept.
    await writeJson(this.storage, '/activity/logs.json', [...newLogs, ...(await this.logs())]);
  }

  // ---------- Tasks ----------

  private async writeTask(task: Task) {
    await writeJson(this.storage, `/tasks/task-${task.id}.json`, task);
  }

  async createTasks(inputs: TaskInput[]): Promise<Task[]> {
    const [actor, lists, users, tasks] = await Promise.all([this.actor(), this.lists(), this.users(), this.tasks()]);
    // Next free code. The app counts tasks; the highest code also covers deleted ones.
    let next = Math.max(tasks.length, ...tasks.map((t) => codeNumber(t.taskCode)).filter(Number.isFinite));
    const known = [...tasks];
    const created: Task[] = [];

    // Resolve everything first so a bad reference doesn't leave half the batch written.
    const prepared = inputs.map((input) => {
      const title = input.title.trim();
      if (!title) throw new KoraError('El título de la tarea está vacío.');
      const list = this.findList(lists, input.list);
      if (list.statuses.length === 0) throw new KoraError(`La lista "${list.name}" no tiene estados.`);
      const status = input.status ? this.findStatus(list, input.status) : list.statuses[0];
      return { input, title, list, status };
    });

    for (const { input, title, list, status } of prepared) {
      next++;
      const task: Task = {
        id: randomUUID(),
        taskCode: `TSK-${String(next).padStart(3, '0')}`,
        listId: list.id,
        title,
        description: input.description ?? '',
        statusId: status.id,
        dueDate: input.dueDate ? checkDate(input.dueDate) : '',
        assignees: this.findUsers(users, input.assignees ?? []).map((u) => u.id),
        priority: input.priority ?? 'medium',
        ...(input.effort ? { effort: input.effort } : {}),
        tags: cleanTags(input.tags ?? []),
        dependencies: (input.dependencies ?? []).map((d) => this.findTask(known, d).id),
        subtasks: (input.subtasks ?? [])
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s, i) => ({ id: randomUUID(), title: s, isCompleted: false, createdAt: Date.now() + i })),
        lastEditedBy: actor.id,
        lastEditedAt: Date.now(),
      };
      await this.writeTask(task);
      known.push(task);
      created.push(task);
    }
    await this.log(
      actor,
      created.map((t) => ({ taskId: t.id, action: 'creó esta tarea' }))
    );
    return created;
  }

  async updateTask(ref: string, patch: TaskPatch): Promise<{ task: Task; changes: string[] }> {
    const [actor, lists, users, tasks] = await Promise.all([this.actor(), this.lists(), this.users(), this.tasks()]);
    const original = this.findTask(tasks, ref);
    await this.assertTaskFree(original, actor);
    const task: Task = { ...original };
    const changes: string[] = [];
    const listOf = (t: Task) => lists.find((l) => l.id === t.listId);
    const statusName = (t: Task) => listOf(t)?.statuses.find((s) => s.id === t.statusId)?.name ?? t.statusId;

    if (patch.list !== undefined) {
      const target = this.findList(lists, patch.list);
      if (target.id !== task.listId) {
        if (target.statuses.length === 0) throw new KoraError(`La lista "${target.name}" no tiene estados.`);
        const source = listOf(task);
        // Keep the status by id or by name when the target has it, like the app.
        const name = fold(statusName(task));
        const status =
          target.statuses.find((s) => s.id === task.statusId) ??
          target.statuses.find((s) => fold(s.name) === name) ??
          target.statuses[0];
        delete task.order;
        task.listId = target.id;
        task.statusId = status.id;
        changes.push(`movió la tarea de la lista "${source?.name ?? original.listId}" a "${target.name}"`);
      }
    }
    if (patch.status !== undefined) {
      const list = listOf(task);
      if (!list) throw new KoraError(`La lista de ${task.taskCode} no existe.`);
      const status = this.findStatus(list, patch.status);
      if (status.id !== task.statusId) {
        const before = statusName(task);
        task.statusId = status.id;
        delete task.order; // goes to the end of its new column
        changes.push(`cambió el estado de "${before}" a "${status.name}"`);
      }
    }
    if (patch.title !== undefined && patch.title.trim() && patch.title.trim() !== task.title) {
      task.title = patch.title.trim();
      changes.push(`cambió el título a "${task.title}"`);
    }
    if (patch.priority !== undefined && patch.priority !== task.priority) {
      changes.push(`cambió la prioridad de "${task.priority}" a "${patch.priority}"`);
      task.priority = patch.priority;
    }
    if (patch.dueDate !== undefined) {
      const due = patch.dueDate ? checkDate(patch.dueDate) : '';
      if (due !== task.dueDate) {
        task.dueDate = due;
        changes.push(`cambió la fecha límite a "${due || 'Sin fecha'}"`);
      }
    }
    if (patch.effort !== undefined && (patch.effort ?? '') !== (task.effort ?? '')) {
      if (patch.effort) {
        task.effort = patch.effort;
        changes.push(`cambió el nivel de esfuerzo a "${EFFORT_LABELS[patch.effort]}"`);
      } else {
        delete task.effort;
        changes.push('quitó el nivel de esfuerzo');
      }
    }
    if (patch.assignees !== undefined) {
      const ids = this.findUsers(users, patch.assignees).map((u) => u.id);
      if (ids.join() !== task.assignees.join()) {
        task.assignees = [...new Set(ids)];
        changes.push('actualizó el equipo asignado');
      }
    }
    if (patch.description !== undefined || patch.appendDescription) {
      let description = patch.description ?? task.description;
      if (patch.appendDescription) description = description ? `${description.trimEnd()}\n\n${patch.appendDescription}` : patch.appendDescription;
      if (description !== task.description) {
        task.description = description;
        changes.push('actualizó la descripción de la tarea');
      }
    }
    if (patch.addTags?.length || patch.removeTags?.length) {
      const remove = new Set((patch.removeTags ?? []).map(fold));
      const tags = cleanTags([...task.tags.filter((t) => !remove.has(fold(t))), ...(patch.addTags ?? [])]);
      if (tags.join() !== task.tags.join()) {
        task.tags = tags;
        changes.push('actualizó las etiquetas');
      }
    }
    if (patch.dependencies !== undefined) {
      const deps = [...new Set(patch.dependencies.map((d) => this.findTask(tasks, d).id))];
      if (deps.includes(task.id)) throw new KoraError('Una tarea no puede depender de sí misma.');
      if (deps.join() !== task.dependencies.join()) {
        task.dependencies = deps;
        changes.push('actualizó las dependencias');
      }
    }

    if (changes.length === 0) return { task: original, changes };
    task.lastEditedBy = actor.id;
    task.lastEditedAt = Date.now();
    await this.writeTask(task);
    await this.log(actor, changes.map((action) => ({ taskId: task.id, action })));
    return { task, changes };
  }

  async addComment(ref: string, text: string): Promise<Task> {
    const [actor, tasks] = await Promise.all([this.actor(), this.tasks()]);
    const task = this.findTask(tasks, ref);
    if (!text.trim()) throw new KoraError('El comentario está vacío.');
    await this.log(actor, [{ taskId: task.id, action: 'comentó', comment: text }]);
    return task;
  }

  async changeSubtasks(
    ref: string,
    ops: { add?: string[]; complete?: string[]; reopen?: string[]; remove?: string[] }
  ): Promise<Task> {
    const [actor, tasks] = await Promise.all([this.actor(), this.tasks()]);
    const task = this.findTask(tasks, ref);
    await this.assertTaskFree(task, actor);
    let subtasks: Subtask[] = [...task.subtasks];
    const find = (r: string) => {
      const n = Number(r);
      // 1-based position as shown by kora_get_task, or the subtask's title / id.
      if (Number.isInteger(n) && n >= 1 && n <= subtasks.length) return subtasks[n - 1];
      return pick(subtasks, r, (s) => [s.id, s.title], `subtareas en ${task.taskCode}`, (s) => `"${s.title}"`);
    };
    const set = (refs: string[] | undefined, done: boolean) => {
      const ids = new Set((refs ?? []).map((r) => find(r).id));
      subtasks = subtasks.map((s) => (ids.has(s.id) ? { ...s, isCompleted: done } : s));
    };
    set(ops.complete, true);
    set(ops.reopen, false);
    if (ops.remove?.length) {
      const ids = new Set(ops.remove.map((r) => find(r).id));
      subtasks = subtasks.filter((s) => !ids.has(s.id));
    }
    for (const [i, title] of (ops.add ?? []).map((s) => s.trim()).filter(Boolean).entries()) {
      subtasks.push({ id: randomUUID(), title, isCompleted: false, createdAt: Date.now() + i });
    }
    const updated: Task = { ...task, subtasks, lastEditedBy: actor.id, lastEditedAt: Date.now() };
    await this.writeTask(updated);
    await this.log(actor, [{ taskId: task.id, action: 'actualizó las subtareas' }]);
    return updated;
  }

  /** Moves the task to the trash, like deleting it in the app. */
  async deleteTask(ref: string): Promise<Task> {
    const [actor, tasks] = await Promise.all([this.actor(), this.tasks()]);
    const task = this.findTask(tasks, ref);
    await this.assertTaskFree(task, actor);
    for (const t of tasks) {
      if (t.dependencies.includes(task.id)) {
        await this.writeTask({ ...t, dependencies: t.dependencies.filter((d) => d !== task.id) });
      }
    }
    await this.storage.deleteFile(`/tasks/task-${task.id}.json`);
    const trash = await readJson<TrashItem[]>(this.storage, '/trash/items.json', []);
    const item: TrashItem = {
      id: randomUUID(),
      type: 'task',
      originalData: task,
      deletedAt: Date.now(),
      deletedBy: actor.id,
      deletedByName: actor.name,
      label: task.title,
      metadata: { taskCode: task.taskCode },
    };
    await writeJson(this.storage, '/trash/items.json', [item, ...trash]);
    return task;
  }

  async filterTasks(filter: TaskFilter) {
    const [lists, users, tasks] = await Promise.all([this.lists(), this.users(), this.tasks()]);
    let result = tasks;
    if (filter.list) {
      const list = this.findList(lists, filter.list);
      result = result.filter((t) => t.listId === list.id);
      if (filter.status) {
        const status = this.findStatus(list, filter.status);
        result = result.filter((t) => t.statusId === status.id);
      }
    } else if (filter.status) {
      const q = fold(filter.status);
      result = result.filter((t) => {
        const s = lists.find((l) => l.id === t.listId)?.statuses.find((s) => s.id === t.statusId);
        return s && (fold(s.name).includes(q) || s.id === filter.status);
      });
    }
    if (!filter.includeCompleted && !filter.status) {
      result = result.filter((t) => !isCompleted(t, lists));
    }
    if (filter.assignee) {
      const [u] = this.findUsers(users, [filter.assignee]);
      result = result.filter((t) => t.assignees.includes(u.id));
    }
    if (filter.priority) result = result.filter((t) => t.priority === filter.priority);
    if (filter.tag) {
      const q = fold(filter.tag);
      result = result.filter((t) => t.tags.some((tag) => fold(tag) === q));
    }
    if (filter.text) {
      const q = fold(filter.text);
      result = result.filter((t) => fold(`${t.taskCode} ${t.title} ${t.description} ${t.tags.join(' ')}`).includes(q));
    }
    return { tasks: result, lists, users, all: tasks };
  }

  // ---------- Lists ----------

  async createList(name: string, color = '#3b82f6'): Promise<TaskList> {
    const lists = await this.lists();
    if (lists.some((l) => fold(l.name) === fold(name))) throw new KoraError(`Ya existe una lista llamada "${name}".`);
    const list: TaskList = { id: randomUUID(), name: name.trim(), color, statuses: DEFAULT_STATUSES, createdAt: Date.now() };
    await writeJson(this.storage, `/lists/${list.id}.json`, list);
    return list;
  }

  // ---------- Documents ----------

  async readDoc(ref: string): Promise<{ doc: DocMetadata; content: string }> {
    const d = this.findDoc(await this.docs(), ref);
    let content = '';
    try {
      content = await this.storage.readTextFile(docPath(d));
    } catch {
      // Listed but the file is missing: the app shows it empty too.
    }
    return { doc: d, content };
  }

  async createDoc(title: string, content: string, folder?: string): Promise<DocMetadata> {
    const [actor, docs] = await Promise.all([this.actor(), this.docs()]);
    if (!title.trim()) throw new KoraError('El título del documento está vacío.');
    const cleanFolder = folder ? cleanFolderName(folder) : undefined;
    const base = docBaseFilename(title);
    const taken = new Set(docs.filter((d) => d.folder === cleanFolder).map((d) => d.filename));
    let filename = `${base}.md`;
    for (let i = 1; taken.has(filename); i++) filename = `${base}-${i}.md`;
    const now = Date.now();
    const meta: DocMetadata = {
      id: randomUUID(),
      title: title.trim(),
      filename,
      ...(cleanFolder ? { folder: cleanFolder } : {}),
      editedBy: actor.id,
      editedAt: now,
      createdAt: now,
    };
    await this.storage.writeTextFile(docPath(meta), content);
    await writeJson(this.storage, '/docs/info.json', [...(await this.docs()), meta]);
    return meta;
  }

  /** Replaces or appends to a document's Markdown. The filename stays (only the title changes). */
  async updateDoc(ref: string, opts: { content?: string; append?: string; title?: string }): Promise<DocMetadata> {
    const actor = await this.actor();
    const { doc: d, content } = await this.readDoc(ref);
    await this.assertDocFree(d);
    let next = opts.content ?? content;
    if (opts.append) next = next ? `${next.trimEnd()}\n\n${opts.append}` : opts.append;
    await this.storage.writeTextFile(docPath(d), next);
    const docs = await this.docs();
    const updated: DocMetadata = { ...d, title: opts.title?.trim() || d.title, editedBy: actor.id, editedAt: Date.now() };
    await writeJson(
      this.storage,
      '/docs/info.json',
      docs.map((x) => (x.id === d.id ? updated : x))
    );
    return updated;
  }

  async searchDocs(text: string): Promise<{ doc: DocMetadata; snippet: string }[]> {
    const q = fold(text);
    const hits: { doc: DocMetadata; snippet: string }[] = [];
    for (const d of await this.docs()) {
      const { content } = await this.readDoc(d.id).catch(() => ({ content: '' }));
      const inTitle = fold(d.title).includes(q);
      const at = fold(content).indexOf(q);
      if (inTitle || at >= 0) {
        const start = Math.max(0, at - 80);
        hits.push({ doc: d, snippet: at >= 0 ? content.slice(start, at + q.length + 120).replace(/\s+/g, ' ').trim() : '' });
      }
    }
    return hits;
  }
}

// ---------- Helpers ----------

export function codeNumber(code: string): number {
  const m = /(\d+)\s*$/.exec(code ?? '');
  return m ? Number(m[1]) : NaN;
}

export function isCompleted(task: Task, lists: TaskList[]): boolean {
  return !!lists.find((l) => l.id === task.listId)?.statuses.find((s) => s.id === task.statusId)?.isCompleted;
}

function checkDate(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.trim())) throw new KoraError(`Fecha inválida "${d}". Usa el formato AAAA-MM-DD.`);
  return d.trim();
}

function cleanTags(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags
    .map((t) => t.trim())
    .filter((t) => t && !seen.has(fold(t)) && seen.add(fold(t)));
}

function cleanFolderName(folder: string): string {
  const clean = folder.trim().replace(/[<>:"/\\|?*]/g, '_').replace(/^\.+/, '');
  if (!clean) throw new KoraError('Nombre de carpeta inválido.');
  return clean;
}
