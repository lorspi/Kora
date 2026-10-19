#!/usr/bin/env -S npx tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Kora MCP server: lets Claude create and manage tasks ("tickets") and read and
 * write documents of a Kora project, over stdio.
 *
 * Configuration (environment variables):
 *   KORA_PROJECT_DIR      Folder of a local Kora project (the one chosen in the app).
 *   KORA_FIREBASE_CONFIG  For cloud projects instead: the Firebase config, as JSON
 *                         or as the path to a JSON file.
 *   KORA_FIREBASE_SPACE   Space inside the Firebase project (default "default").
 *   KORA_USER             Username of the Kora user actions are attributed to
 *                         (default: the project's first administrator).
 */

import { readFileSync, existsSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { SystemUser, Task, TaskList, TaskActivityLog, DocMetadata } from '../../src/types';
import { FirebaseStorage, LocalStorage, type FirebaseConfig, type Storage } from './storage';
import { EFFORT_LABELS, Kora, KoraError, PRIORITY_LABELS, isCompleted } from './kora';

function createStorage(): Storage {
  const dir = process.env.KORA_PROJECT_DIR?.trim();
  const fb = process.env.KORA_FIREBASE_CONFIG?.trim();
  if (dir) return new LocalStorage(dir);
  if (fb) {
    const raw = existsSync(fb) ? readFileSync(fb, 'utf-8') : fb;
    let config: FirebaseConfig;
    try {
      config = JSON.parse(raw);
    } catch {
      throw new Error('KORA_FIREBASE_CONFIG debe ser JSON válido o la ruta a un archivo JSON.');
    }
    return new FirebaseStorage(config, process.env.KORA_FIREBASE_SPACE?.trim() || 'default');
  }
  throw new Error('Configura KORA_PROJECT_DIR (proyecto en carpeta local) o KORA_FIREBASE_CONFIG (proyecto en la nube).');
}

const kora = new Kora(createStorage(), process.env.KORA_USER?.trim() || undefined);

// ---------- Formatting (Markdown, for Claude to read) ----------

const fmtDate = (ms?: number) => (ms ? new Date(ms).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const userName = (users: SystemUser[], id: string) => {
  const u = users.find((x) => x.id === id);
  return u ? `${u.name} (@${u.username})` : 'usuario desconocido';
};
const statusOf = (t: Task, lists: TaskList[]) => {
  const list = lists.find((l) => l.id === t.listId);
  return { list, status: list?.statuses.find((s) => s.id === t.statusId) };
};

function taskLine(t: Task, lists: TaskList[], users: SystemUser[]): string {
  const { list, status } = statusOf(t, lists);
  const parts = [`**${t.taskCode}** ${t.title}`, `${list?.name ?? '?'} › ${status?.name ?? t.statusId}`, `prioridad ${PRIORITY_LABELS[t.priority]}`];
  if (t.effort) parts.push(`esfuerzo ${EFFORT_LABELS[t.effort]}`);
  if (t.dueDate) parts.push(`vence ${t.dueDate}`);
  if (t.assignees.length) parts.push(t.assignees.map((a) => userName(users, a).replace(/ \(.*/, '')).join(', '));
  if (t.subtasks.length) parts.push(`subtareas ${t.subtasks.filter((s) => s.isCompleted).length}/${t.subtasks.length}`);
  if (t.tags.length) parts.push(t.tags.map((x) => `#${x}`).join(' '));
  return `- ${parts.join(' · ')}`;
}

function taskDetail(t: Task, all: Task[], lists: TaskList[], users: SystemUser[], logs: TaskActivityLog[]): string {
  const { list, status } = statusOf(t, lists);
  const ref = (id: string) => {
    const d = all.find((x) => x.id === id);
    if (!d) return null;
    return { task: d, text: `${d.taskCode} (${d.title}) — ${statusOf(d, lists).status?.name ?? '?'}` };
  };
  const deps = t.dependencies.map(ref).filter((x) => !!x);
  const blocking = deps.filter((d) => !isCompleted(d.task, lists));
  const dependents = all.filter((x) => x.dependencies.includes(t.id));
  const lines = [
    `# ${t.taskCode} · ${t.title}`,
    '',
    `- Lista: ${list?.name ?? '?'} · Estado: ${status?.name ?? t.statusId}${status?.isCompleted ? ' ✓' : ''}`,
    `- Prioridad: ${PRIORITY_LABELS[t.priority]}${t.effort ? ` · Esfuerzo: ${EFFORT_LABELS[t.effort]}` : ''}`,
    `- Fecha límite: ${t.dueDate || 'sin fecha'}`,
    `- Asignados: ${t.assignees.map((a) => userName(users, a)).join(', ') || 'nadie'}`,
  ];
  if (t.tags.length) lines.push(`- Etiquetas: ${t.tags.join(', ')}`);
  if (deps.length) lines.push(`- Depende de: ${deps.map((d) => d.text).join('; ')}`);
  if (blocking.length) lines.push(`- ⚠️ Bloqueada: faltan por completar ${blocking.map((d) => d.task.taskCode).join(', ')}`);
  if (dependents.length) lines.push(`- Bloquea a: ${dependents.map((d) => `${d.taskCode} (${d.title})`).join('; ')}`);
  if (t.lastEditedAt) lines.push(`- Última edición: ${t.lastEditedBy ? userName(users, t.lastEditedBy) : ''} ${fmtDate(t.lastEditedAt)}`.trimEnd());
  lines.push('', '## Descripción', '', t.description.trim() || '_Sin descripción._');
  if (t.subtasks.length) {
    lines.push('', `## Subtareas (${t.subtasks.filter((s) => s.isCompleted).length}/${t.subtasks.length})`, '');
    t.subtasks.forEach((s, i) => lines.push(`${i + 1}. [${s.isCompleted ? 'x' : ' '}] ${s.title}`));
  }
  const activity = logs.filter((l) => l.taskId === t.id);
  if (activity.length) {
    lines.push('', '## Actividad (más reciente primero)', '');
    for (const l of activity.slice(0, 30)) {
      lines.push(`- ${fmtDate(l.timestamp)} · ${l.username} ${l.action}${l.comment?.text ? `:\n  > ${l.comment.text.replace(/\n/g, '\n  > ')}` : ''}`);
    }
    if (activity.length > 30) lines.push(`- … y ${activity.length - 30} entradas más antiguas`);
  }
  return lines.join('\n');
}

const docLine = (d: DocMetadata) =>
  `- **${d.title}** — \`${d.folder ? `${d.folder}/` : ''}${d.filename}\`${d.editedAt ? ` · editado ${fmtDate(d.editedAt)}` : ''}`;

// ---------- Server ----------

const server = new McpServer(
  { name: 'kora', version: '1.0.0' },
  {
    instructions:
      'Kora es un gestor de proyectos. Las tareas (tickets) tienen un código como TSK-012, pertenecen a una lista con sus propios estados y pueden tener subtareas, dependencias y comentarios. ' +
      'Usa kora_get_project para conocer listas, estados y personas antes de crear o mover tareas. ' +
      'Para trabajar en un ticket, léelo con kora_get_task (incluye descripción, subtareas y actividad) y consulta los documentos relacionados con kora_search / kora_read_doc. ' +
      'Al avanzar, mantén Kora al día: cambia el estado, marca subtareas y deja un comentario con lo que se hizo.',
  }
);

type Content = { content: { type: 'text'; text: string }[]; isError?: boolean };
const text = (t: string): Content => ({ content: [{ type: 'text', text: t }] });

/** Errors become tool results Claude can read and act on, instead of protocol errors. */
function run<A>(fn: (args: A) => Promise<string>) {
  return async (args: A): Promise<Content> => {
    try {
      return text(await fn(args));
    } catch (err) {
      const msg = err instanceof KoraError ? err.message : `Error: ${err instanceof Error ? err.message : String(err)}`;
      return { ...text(msg), isError: true };
    }
  };
}

const priority = z.enum(['low', 'medium', 'high', 'urgent']).describe('low=Baja, medium=Media, high=Alta, urgent=Urgente');
const effort = z.enum(['easy', 'casual', 'moderate', 'hard', 'epic']).describe('easy=Fácil, casual=Casual, moderate=Moderado, hard=Difícil, epic=Épico');
const taskRef = z.string().describe('Código de la tarea (TSK-012, o solo 12)');
const readOnly = { readOnlyHint: true, openWorldHint: false };

server.registerTool(
  'kora_get_project',
  {
    title: 'Resumen del proyecto',
    description: 'Nombre y descripción del proyecto, sus listas con estados y número de tareas, personas del equipo y carpetas de documentos.',
    annotations: readOnly,
  },
  run(async () => {
    const [meta, lists, users, tasks, docs, actor] = await Promise.all([
      kora.meta(),
      kora.lists(),
      kora.users(),
      kora.tasks(),
      kora.docs(),
      kora.actor(),
    ]);
    const lines = [`# ${meta.name}`, '', meta.description || '', '', `Ubicación: ${kora.location}`, `Actuando como: ${actor.name} (@${actor.username})`, '', '## Listas'];
    for (const l of lists) {
      const inList = tasks.filter((t) => t.listId === l.id);
      lines.push(`- **${l.name}** (${inList.length} tareas)`);
      for (const s of l.statuses) {
        lines.push(`  - ${s.name}${s.isCompleted ? ' ✓' : ''}: ${inList.filter((t) => t.statusId === s.id).length}`);
      }
    }
    lines.push('', '## Equipo', ...users.map((u) => `- ${u.name} (@${u.username})${u.isSuperAdmin ? ' · admin' : ''}`));
    const folders = [...new Set(docs.map((d) => d.folder).filter(Boolean))];
    lines.push('', `## Documentos: ${docs.length}${folders.length ? ` · carpetas: ${folders.join(', ')}` : ''}`);
    return lines.join('\n');
  })
);

server.registerTool(
  'kora_list_tasks',
  {
    title: 'Listar tareas',
    description: 'Lista tareas con filtros opcionales. Por defecto omite las completadas (salvo que filtres por estado).',
    inputSchema: {
      list: z.string().optional().describe('Nombre de la lista'),
      status: z.string().optional().describe('Nombre del estado (p. ej. "En Desarrollo")'),
      assignee: z.string().optional().describe('Usuario o nombre de la persona asignada'),
      priority: priority.optional(),
      tag: z.string().optional(),
      text: z.string().optional().describe('Texto a buscar en código, título, descripción y etiquetas'),
      includeCompleted: z.boolean().optional(),
      limit: z.number().int().positive().max(500).optional().describe('Máximo de resultados (por defecto 100)'),
    },
    annotations: readOnly,
  },
  run(async ({ limit = 100, ...filter }) => {
    const { tasks, lists, users } = await kora.filterTasks(filter);
    if (tasks.length === 0) return 'No hay tareas que coincidan.';
    const shown = tasks.slice(0, limit);
    const out = [`${tasks.length} tarea(s):`, '', ...shown.map((t) => taskLine(t, lists, users))];
    if (tasks.length > shown.length) out.push(`… y ${tasks.length - shown.length} más (sube "limit" o afina los filtros).`);
    return out.join('\n');
  })
);

server.registerTool(
  'kora_get_task',
  {
    title: 'Ver tarea',
    description: 'Detalle completo de una tarea: descripción, subtareas, dependencias, asignados y actividad con comentarios. Úsala antes de trabajar en un ticket.',
    inputSchema: { task: taskRef },
    annotations: readOnly,
  },
  run(async ({ task }) => {
    const [all, lists, users, logs] = await Promise.all([kora.tasks(), kora.lists(), kora.users(), kora.logs()]);
    return taskDetail(kora.findTask(all, task), all, lists, users, logs);
  })
);

server.registerTool(
  'kora_create_tasks',
  {
    title: 'Crear tareas',
    description:
      'Crea una o varias tareas. La lista y el estado se indican por nombre (consulta kora_get_project); si no se da estado se usa el primero de la lista.',
    inputSchema: {
      tasks: z
        .array(
          z.object({
            title: z.string(),
            list: z.string().describe('Nombre de la lista'),
            status: z.string().optional(),
            priority: priority.optional().describe('Por defecto medium'),
            description: z.string().optional().describe('Markdown: contexto, criterios de aceptación, notas técnicas'),
            dueDate: z.string().optional().describe('AAAA-MM-DD'),
            assignees: z.array(z.string()).optional().describe('Usuarios o nombres'),
            tags: z.array(z.string()).optional(),
            effort: effort.optional(),
            dependencies: z.array(z.string()).optional().describe('Códigos de tareas de las que depende (pueden ser de este mismo lote)'),
            subtasks: z.array(z.string()).optional(),
          })
        )
        .min(1),
    },
  },
  run(async ({ tasks }) => {
    const created = await kora.createTasks(tasks);
    const [lists, users] = await Promise.all([kora.lists(), kora.users()]);
    return [`Creada(s) ${created.length} tarea(s):`, '', ...created.map((t) => taskLine(t, lists, users))].join('\n');
  })
);

server.registerTool(
  'kora_update_task',
  {
    title: 'Actualizar tarea',
    description:
      'Cambia campos de una tarea: estado, lista, título, descripción, prioridad, fecha, esfuerzo, asignados, etiquetas o dependencias. Solo envía los campos que cambian. Queda registrado en la actividad.',
    inputSchema: {
      task: taskRef,
      status: z.string().optional().describe('Nombre del estado nuevo'),
      list: z.string().optional().describe('Mover a otra lista (mantiene el estado si existe uno equivalente)'),
      title: z.string().optional(),
      description: z.string().optional().describe('Reemplaza la descripción completa'),
      appendDescription: z.string().optional().describe('Añade texto al final de la descripción'),
      priority: priority.optional(),
      dueDate: z.string().optional().describe('AAAA-MM-DD, o "" para quitarla'),
      effort: effort.nullable().optional().describe('null para quitarlo'),
      assignees: z.array(z.string()).optional().describe('Lista completa de asignados (reemplaza la actual)'),
      addTags: z.array(z.string()).optional(),
      removeTags: z.array(z.string()).optional(),
      dependencies: z.array(z.string()).optional().describe('Lista completa de códigos de los que depende (reemplaza la actual)'),
    },
  },
  run(async ({ task, ...patch }) => {
    const { task: t, changes } = await kora.updateTask(task, patch);
    if (changes.length === 0) return `${t.taskCode} no tenía cambios que aplicar.`;
    return `${t.taskCode} actualizada:\n${changes.map((c) => `- ${c}`).join('\n')}`;
  })
);

server.registerTool(
  'kora_add_comment',
  {
    title: 'Comentar tarea',
    description: 'Añade un comentario (Markdown) a la actividad de una tarea, p. ej. un resumen de lo implementado, decisiones o bloqueos.',
    inputSchema: { task: taskRef, comment: z.string() },
  },
  run(async ({ task, comment }) => {
    const t = await kora.addComment(task, comment);
    return `Comentario añadido a ${t.taskCode}.`;
  })
);

server.registerTool(
  'kora_update_subtasks',
  {
    title: 'Gestionar subtareas',
    description: 'Añade, completa, reabre o elimina subtareas. Las existentes se indican por su número (1, 2, …, como en kora_get_task) o por su título.',
    inputSchema: {
      task: taskRef,
      add: z.array(z.string()).optional(),
      complete: z.array(z.string()).optional(),
      reopen: z.array(z.string()).optional(),
      remove: z.array(z.string()).optional(),
    },
  },
  run(async ({ task, ...ops }) => {
    const t = await kora.changeSubtasks(task, ops);
    const done = t.subtasks.filter((s) => s.isCompleted).length;
    return [`Subtareas de ${t.taskCode} (${done}/${t.subtasks.length}):`, ...t.subtasks.map((s, i) => `${i + 1}. [${s.isCompleted ? 'x' : ' '}] ${s.title}`)].join('\n');
  })
);

server.registerTool(
  'kora_delete_task',
  {
    title: 'Eliminar tarea',
    description: 'Mueve una tarea a la papelera de Kora (se puede restaurar desde la app). Confirma con la persona antes de usarla.',
    inputSchema: { task: taskRef },
    annotations: { destructiveHint: true, openWorldHint: false },
  },
  run(async ({ task }) => {
    const t = await kora.deleteTask(task);
    return `${t.taskCode} "${t.title}" se movió a la papelera.`;
  })
);

server.registerTool(
  'kora_create_list',
  {
    title: 'Crear lista',
    description: 'Crea una lista de tareas con los estados por defecto de Kora (Por Hacer, En Desarrollo, Revisión, Listo / Completado).',
    inputSchema: { name: z.string(), color: z.string().optional().describe('Color hex, p. ej. #3b82f6') },
  },
  run(async ({ name, color }) => {
    const l = await kora.createList(name, color);
    return `Lista "${l.name}" creada con estados: ${l.statuses.map((s) => s.name).join(', ')}.`;
  })
);

server.registerTool(
  'kora_list_docs',
  {
    title: 'Listar documentos',
    description: 'Lista los documentos Markdown del proyecto (especificaciones, guías, notas técnicas), opcionalmente de una carpeta.',
    inputSchema: { folder: z.string().optional() },
    annotations: readOnly,
  },
  run(async ({ folder }) => {
    let docs = await kora.docs();
    if (folder) docs = docs.filter((d) => (d.folder ?? '').toLowerCase() === folder.toLowerCase());
    return docs.length ? docs.map(docLine).join('\n') : 'No hay documentos.';
  })
);

server.registerTool(
  'kora_read_doc',
  {
    title: 'Leer documento',
    description: 'Devuelve el contenido Markdown de un documento, buscándolo por título o nombre de archivo.',
    inputSchema: { doc: z.string().describe('Título o nombre de archivo') },
    annotations: readOnly,
  },
  run(async ({ doc }) => {
    const { doc: d, content } = await kora.readDoc(doc);
    return `# ${d.title}\n_${d.folder ? `${d.folder}/` : ''}${d.filename}_\n\n${content || '_Documento vacío._'}`;
  })
);

server.registerTool(
  'kora_create_doc',
  {
    title: 'Crear documento',
    description: 'Crea un documento Markdown en el proyecto (p. ej. notas técnicas o especificación de un ticket).',
    inputSchema: { title: z.string(), content: z.string(), folder: z.string().optional() },
  },
  run(async ({ title, content, folder }) => {
    const d = await kora.createDoc(title, content, folder);
    return `Documento "${d.title}" creado en docs/${d.folder ? `${d.folder}/` : ''}${d.filename}.`;
  })
);

server.registerTool(
  'kora_update_doc',
  {
    title: 'Editar documento',
    description: 'Reemplaza el contenido de un documento o le añade texto al final. No funciona si alguien lo tiene abierto en Kora.',
    inputSchema: {
      doc: z.string().describe('Título o nombre de archivo'),
      content: z.string().optional().describe('Contenido completo nuevo'),
      append: z.string().optional().describe('Texto a añadir al final'),
      title: z.string().optional().describe('Nuevo título'),
    },
  },
  run(async ({ doc, ...opts }) => {
    if (opts.content === undefined && !opts.append && !opts.title) throw new KoraError('Indica content, append o title.');
    const d = await kora.updateDoc(doc, opts);
    return `Documento "${d.title}" actualizado.`;
  })
);

server.registerTool(
  'kora_search',
  {
    title: 'Buscar',
    description: 'Busca un texto en tareas (código, título, descripción, etiquetas, incluidas las completadas) y en el título y contenido de los documentos.',
    inputSchema: { query: z.string() },
    annotations: readOnly,
  },
  run(async ({ query }) => {
    const [{ tasks, lists, users }, docs] = await Promise.all([kora.filterTasks({ text: query, includeCompleted: true }), kora.searchDocs(query)]);
    const out: string[] = [];
    if (tasks.length) out.push(`## Tareas (${tasks.length})`, ...tasks.slice(0, 50).map((t) => taskLine(t, lists, users)), '');
    if (docs.length) out.push(`## Documentos (${docs.length})`, ...docs.map(({ doc, snippet }) => `${docLine(doc)}${snippet ? `\n  > …${snippet}…` : ''}`));
    return out.length ? out.join('\n') : `Sin resultados para "${query}".`;
  })
);

server.registerPrompt(
  'desarrollar_ticket',
  {
    title: 'Desarrollar un ticket de Kora',
    description: 'Carga un ticket de Kora con su contexto y guía su desarrollo, manteniendo Kora actualizado.',
    argsSchema: { ticket: z.string().describe('Código del ticket, p. ej. TSK-012') },
  },
  ({ ticket }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text:
            `Quiero desarrollar el ticket ${ticket} de Kora.\n\n` +
            `1. Léelo con kora_get_task y revisa sus dependencias (si alguna está pendiente, avísame).\n` +
            `2. Busca contexto con kora_search y kora_read_doc (especificaciones, decisiones, notas técnicas).\n` +
            `3. Propón un plan breve alineado con la descripción, criterios de aceptación y subtareas. Si falta información, pregúntame.\n` +
            `4. Cuando empecemos, mueve el ticket al estado de su lista que indique trabajo en curso (p. ej. "En Desarrollo"); al avanzar, marca subtareas completadas.\n` +
            `5. Al terminar, deja un comentario con el resumen de lo hecho y mueve el ticket al estado de revisión de su lista (p. ej. "Revisión"). Los estados de cada lista aparecen en kora_get_project; si no hay uno equivalente, pregúntame.`,
        },
      },
    ],
  })
);

await server.connect(new StdioServerTransport());
