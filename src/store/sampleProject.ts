/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Demo project loaded by "Con Datos de Ejemplo" in the onboarding. It tells the story
 * of a small team launching "Origen", a coffee subscription app, and touches every
 * feature of Kora: teammates with unread notes, lists with emoji icons and their own
 * statuses, tasks with every priority and effort level, subtasks, dependencies, due
 * dates, tags and a manual order, docs in folders with diagrams, tables, checklists
 * and images, media attachments and items in the trash to restore.
 */
import type {
  DocMetadata,
  SystemUser,
  Task,
  TaskActivityLog,
  TaskList,
  TaskStatus,
  TrashItem,
} from '../types';
import { hashPassword } from '../lib/crypto';

/** Password of the demo teammates, so the project can be opened as each of them */
export const SAMPLE_TEAMMATE_PASSWORD = 'kora1234';

/** Images copied from the app's public folder into the project's attachments */
export const SAMPLE_MEDIA: { from: string; to: string }[] = [
  { from: '/og-image.png', to: '/attachments/images/portada-origen.png' },
  { from: '/mobile-icon.png', to: '/attachments/images/icono-movil.png' },
  { from: '/desktop-icon.png', to: '/attachments/images/icono-escritorio.png' },
  { from: '/logo-light.svg', to: '/attachments/images/logo-claro.svg' },
  { from: '/logo-dark.svg', to: '/attachments/images/logo-oscuro.svg' },
  { from: '/screenshots/dashboard-v2.png', to: '/attachments/images/captura-tablero.png' },
  { from: '/screenshots/editor-bloques/editor.png', to: '/attachments/images/captura-editor.png' },
];

export interface SampleProject {
  users: SystemUser[];
  activeUser: SystemUser;
  lists: TaskList[];
  tasks: Task[];
  logs: TaskActivityLog[];
  docs: DocMetadata[];
  /** Markdown of each doc, by doc id */
  docContents: Record<string, string>;
  docFolders: string[];
  trashItems: TrashItem[];
  tags: string[];
}

const HOUR = 3600000;
const DAY = 24 * HOUR;

export async function buildSampleProject(firstUser: SystemUser): Promise<SampleProject> {
  const now = Date.now();
  const ago = (ms: number) => now - ms;
  /** YYYY-MM-DD, `days` from today (negative: in the past) */
  const due = (days: number) => {
    const d = new Date(now + days * DAY);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // ── Team ──────────────────────────────────────────────────────────────────
  const teammate = async (id: string, username: string, name: string, avatarColor: string, daysAgo: number): Promise<SystemUser> => {
    const salt = crypto.randomUUID().slice(0, 8);
    return {
      id,
      username,
      name,
      avatarColor,
      salt,
      passwordHash: await hashPassword(SAMPLE_TEAMMATE_PASSWORD, salt),
      createdAt: ago(daysAgo * DAY),
    };
  };
  const ana = await teammate('demo-user-ana', 'ana', 'Ana Torres', '#ec4899', 20);
  const diego = await teammate('demo-user-diego', 'diego', 'Diego Rivas', '#10b981', 20);
  const valeria = await teammate('demo-user-valeria', 'valeria', 'Valeria Gómez', '#f59e0b', 18);
  const me = firstUser;

  // ── Lists, each with its own workflow ─────────────────────────────────────
  const launchStatuses: TaskStatus[] = [
    { id: 'todo', name: 'Por hacer', color: '#d1d5db', isCompleted: false },
    { id: 'inprogress', name: 'En progreso', color: '#3b82f6', isCompleted: false },
    { id: 'review', name: 'En revisión', color: '#f59e0b', isCompleted: false },
    { id: 'done', name: 'Listo', color: '#10b981', isCompleted: true },
  ];
  const designStatuses: TaskStatus[] = [
    { id: 'ideas', name: 'Ideas', color: '#a78bfa', isCompleted: false },
    { id: 'sketching', name: 'Bocetando', color: '#ec4899', isCompleted: false },
    { id: 'prototype', name: 'Prototipo', color: '#06b6d4', isCompleted: false },
    { id: 'approved', name: 'Aprobado', color: '#10b981', isCompleted: true },
  ];
  const bugStatuses: TaskStatus[] = [
    { id: 'reported', name: 'Reportado', color: '#ef4444', isCompleted: false },
    { id: 'investigating', name: 'Investigando', color: '#f97316', isCompleted: false },
    { id: 'fixed', name: 'Corregido', color: '#10b981', isCompleted: true },
    { id: 'wontfix', name: 'Descartado', color: '#9ca3af', isCompleted: true },
  ];
  const marketingStatuses: TaskStatus[] = [
    { id: 'backlog', name: 'Backlog', color: '#6b7280', isCompleted: false },
    { id: 'thisweek', name: 'Esta semana', color: '#0ea5e9', isCompleted: false },
    { id: 'published', name: 'Publicado', color: '#10b981', isCompleted: true },
  ];

  // Names starting with an emoji show it instead of the color dot; "Marketing" keeps its dot
  const launch: TaskList = { id: 'demo-list-launch', name: '🚀 Lanzamiento v1.0', color: '#8b5cf6', statuses: launchStatuses, createdAt: ago(20 * DAY), order: 1024 };
  const design: TaskList = { id: 'demo-list-design', name: '🎨 Diseño', color: '#ec4899', statuses: designStatuses, createdAt: ago(20 * DAY), order: 2048 };
  const bugs: TaskList = { id: 'demo-list-bugs', name: '🐞 Errores', color: '#ef4444', statuses: bugStatuses, createdAt: ago(19 * DAY), order: 3072 };
  const marketing: TaskList = { id: 'demo-list-marketing', name: 'Marketing', color: '#f59e0b', statuses: marketingStatuses, createdAt: ago(18 * DAY), order: 4096 };
  const lists = [launch, design, bugs, marketing];

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const id = (n: number) => `demo-task-${String(n).padStart(3, '0')}`;
  const sub = (taskN: number, items: [string, boolean][]) =>
    items.map(([title, isCompleted], i) => ({ id: `${id(taskN)}-sub-${i + 1}`, title, isCompleted, createdAt: ago((10 - i) * DAY) }));
  const task = (n: number, fields: Omit<Task, 'id' | 'taskCode' | 'order'> & { order?: number }): Task => ({
    id: id(n),
    taskCode: `TSK-${String(n).padStart(3, '0')}`,
    order: n * 1024,
    ...fields,
  });

  const tasks: Task[] = [
    task(1, {
      listId: launch.id,
      title: 'Integrar la pasarela de pagos para las suscripciones',
      description: `### Objetivo
Cobrar las suscripciones mensuales y anuales de café directamente desde la app, con renovación automática.

### Planes
| Plan | Precio | Bolsas al mes | Envío |
|------|-------:|:-------------:|-------|
| Explorador | $12 | 1 | Incluido |
| Barista | $22 | 2 | Incluido |
| Tostador | $39 | 4 | Prioritario |

### Criterios de aceptación
- El usuario puede **pausar** o **cancelar** su plan desde *Mi cuenta*.
- Los pagos fallidos se reintentan 3 veces antes de pausar el envío.
- Todo cobro queda registrado en el historial de pedidos.

\`\`\`ts
// Webhook que confirma un cobro y agenda el siguiente envío
export async function onPaymentSucceeded(event: PaymentEvent) {
  const subscription = await subscriptions.get(event.subscriptionId);
  await shipments.schedule(subscription, nextShippingDate(subscription.plan));
}
\`\`\`
`,
      statusId: 'inprogress',
      dueDate: due(5),
      assignees: [diego.id, me.id],
      priority: 'high',
      effort: 'hard',
      tags: ['Pagos', 'Backend'],
      dependencies: [id(5)],
      subtasks: sub(1, [
        ['Crear los planes en la pasarela', true],
        ['Formulario de tarjeta con validación', true],
        ['Webhooks de cobro exitoso y fallido', false],
        ['Pruebas con tarjetas de prueba', false],
      ]),
      lastEditedBy: diego.id,
      lastEditedAt: ago(3 * HOUR),
    }),
    task(2, {
      listId: launch.id,
      title: 'Pantalla de bienvenida con perfil de sabor',
      description: `Tres preguntas rápidas para recomendar el primer café: **intensidad**, **notas favoritas** (frutal, chocolate, caramelo) y **método de preparación**.

El diseño aprobado está en la tarea del prototipo; esta es la captura de referencia:

![Referencia de la pantalla](attachments/images/captura-tablero.png)

> Mantener el flujo en menos de 30 segundos. Si el usuario lo salta, se recomienda el plan Explorador.
`,
      statusId: 'review',
      dueDate: due(2),
      assignees: [ana.id, diego.id],
      priority: 'medium',
      effort: 'moderate',
      tags: ['Frontend', 'UX'],
      dependencies: [id(6)],
      subtasks: sub(2, [
        ['Maquetar las tres preguntas', true],
        ['Animación de transición entre pasos', true],
        ['Guardar el perfil en la cuenta', true],
      ]),
      lastEditedBy: ana.id,
      lastEditedAt: ago(5 * HOUR),
    }),
    task(3, {
      listId: launch.id,
      title: 'Notificaciones push del estado del envío',
      description: `Avisar cuando el café se tuesta, cuando sale y cuando llega.

- [ ] Pedir permiso en el momento adecuado (después del primer pedido)
- [ ] Plantillas de los tres mensajes
- [ ] Preferencias para desactivarlas
`,
      statusId: 'todo',
      dueDate: due(9),
      assignees: [diego.id],
      priority: 'medium',
      effort: 'casual',
      tags: ['Móvil', 'Backend'],
      dependencies: [id(1)],
      subtasks: [],
      lastEditedBy: me.id,
      lastEditedAt: ago(2 * DAY),
    }),
    task(4, {
      listId: launch.id,
      title: 'Preparar la ficha en App Store y Google Play',
      description: `Textos, palabras clave, política de privacidad y clasificación por edad. Las capturas salen de la tarea de marketing.`,
      statusId: 'todo',
      dueDate: due(1),
      assignees: [valeria.id, me.id],
      priority: 'urgent',
      effort: 'moderate',
      tags: ['Lanzamiento'],
      dependencies: [id(12)],
      subtasks: sub(4, [
        ['Descripción corta y larga', false],
        ['Política de privacidad publicada', false],
        ['Cuestionario de clasificación por edad', false],
      ]),
      lastEditedBy: valeria.id,
      lastEditedAt: ago(1 * DAY),
    }),
    task(5, {
      listId: launch.id,
      title: 'Configurar el repositorio y la integración continua',
      description: 'Compilación y pruebas automáticas en cada cambio, con versiones de prueba para el equipo.',
      statusId: 'done',
      dueDate: due(-12),
      assignees: [diego.id],
      priority: 'low',
      effort: 'easy',
      tags: ['DevOps'],
      dependencies: [],
      subtasks: sub(5, [
        ['Repositorio y ramas protegidas', true],
        ['Pruebas en cada cambio', true],
      ]),
      lastEditedBy: diego.id,
      lastEditedAt: ago(12 * DAY),
    }),
    task(6, {
      listId: design.id,
      title: 'Prototipo del flujo de suscripción',
      description: `Prototipo navegable desde la bienvenida hasta el primer pago. Validado con 5 usuarios (ver *Investigación de usuarios* en Documentos › Diseño).`,
      statusId: 'approved',
      dueDate: due(-6),
      assignees: [ana.id],
      priority: 'high',
      effort: 'hard',
      tags: ['UX', 'Prototipo'],
      dependencies: [],
      subtasks: sub(6, [
        ['Flujo de bienvenida', true],
        ['Selección de plan', true],
        ['Pago y confirmación', true],
      ]),
      lastEditedBy: ana.id,
      lastEditedAt: ago(6 * DAY),
    }),
    task(7, {
      listId: design.id,
      title: 'Identidad visual completa: ilustraciones, empaques y app',
      description: `Unificar las ilustraciones de los orígenes del café, el empaque físico y la app. Es un trabajo grande: **conviene dividirlo** en tareas más pequeñas cuando se defina el alcance.`,
      statusId: 'sketching',
      dueDate: due(30),
      assignees: [ana.id, valeria.id],
      priority: 'low',
      effort: 'epic',
      tags: ['Marca', 'Ilustración'],
      dependencies: [],
      subtasks: sub(7, [
        ['Moodboard de referencias', true],
        ['Ilustración de cada región de origen', false],
        ['Diseño del empaque', false],
        ['Íconos de la app', false],
      ]),
      lastEditedBy: ana.id,
      lastEditedAt: ago(2 * DAY),
    }),
    task(8, {
      listId: design.id,
      title: 'Modo oscuro',
      description: 'Idea para después del lanzamiento: paleta oscura inspirada en el café tostado.',
      statusId: 'ideas',
      dueDate: '',
      assignees: [],
      priority: 'low',
      effort: 'moderate',
      tags: ['Idea'],
      dependencies: [],
      subtasks: [],
      lastEditedBy: me.id,
      lastEditedAt: ago(4 * DAY),
    }),
    task(9, {
      listId: bugs.id,
      title: 'La app se cierra al cambiar la dirección de envío',
      description: `### Pasos para reproducir
1. Iniciar sesión con una suscripción activa.
2. Ir a *Mi cuenta → Dirección de envío*.
3. Cambiar la ciudad y guardar.

**Resultado:** la app se cierra. **Esperado:** se guarda la nueva dirección.

\`\`\`
TypeError: Cannot read properties of undefined (reading 'zipCode')
    at AddressForm.save (AddressForm.tsx:88)
\`\`\`
`,
      statusId: 'investigating',
      dueDate: due(-1),
      assignees: [diego.id],
      priority: 'urgent',
      effort: 'hard',
      tags: ['iOS', 'Cierre inesperado'],
      dependencies: [],
      subtasks: [],
      lastEditedBy: diego.id,
      lastEditedAt: ago(4 * HOUR),
    }),
    task(10, {
      listId: bugs.id,
      title: 'El total no incluye el costo de envío en Android',
      description: 'El resumen del pedido mostraba el subtotal como total. Corregido en la versión de prueba 0.9.3.',
      statusId: 'fixed',
      dueDate: due(-4),
      assignees: [diego.id],
      priority: 'high',
      effort: 'casual',
      tags: ['Android', 'Pagos'],
      dependencies: [],
      subtasks: [],
      lastEditedBy: diego.id,
      lastEditedAt: ago(4 * DAY),
    }),
    task(11, {
      listId: bugs.id,
      title: 'Texto cortado en el botón "Suscribirme" en pantallas pequeñas',
      description: 'En teléfonos de 4,7" el texto del botón se corta. Probar con una fuente más pequeña o un texto más corto.',
      statusId: 'reported',
      dueDate: due(0),
      assignees: [ana.id],
      priority: 'low',
      effort: 'easy',
      tags: ['UI'],
      dependencies: [],
      subtasks: [],
      lastEditedBy: valeria.id,
      lastEditedAt: ago(20 * HOUR),
    }),
    task(12, {
      listId: marketing.id,
      title: 'Capturas y video promocional para las tiendas',
      description: `Seis capturas por tienda y un video de 30 segundos. Usar el logo y la portada de la galería de medios.`,
      statusId: 'thisweek',
      dueDate: due(3),
      assignees: [valeria.id, ana.id],
      priority: 'high',
      effort: 'moderate',
      tags: ['Lanzamiento', 'Contenido'],
      dependencies: [id(2)],
      subtasks: sub(12, [
        ['Guion del video', true],
        ['Capturas en iPhone', false],
        ['Capturas en Android', false],
        ['Edición final', false],
      ]),
      lastEditedBy: valeria.id,
      lastEditedAt: ago(7 * HOUR),
    }),
    task(13, {
      listId: marketing.id,
      title: 'Campaña de prelanzamiento en redes',
      description: 'Lista de espera con un mes gratis para los primeros 500 suscriptores.',
      statusId: 'backlog',
      dueDate: due(14),
      assignees: [valeria.id],
      priority: 'medium',
      effort: 'hard',
      tags: ['Redes', 'Campaña'],
      dependencies: [],
      subtasks: sub(13, [
        ['Calendario de publicaciones', false],
        ['Página de lista de espera', false],
      ]),
      lastEditedBy: valeria.id,
      lastEditedAt: ago(3 * DAY),
    }),
    task(14, {
      listId: marketing.id,
      title: 'Publicar el anuncio en el blog',
      description: '"Origen llega a tu taza": la historia del proyecto y de los caficultores con los que trabajamos.',
      statusId: 'published',
      dueDate: due(-3),
      assignees: [valeria.id],
      priority: 'low',
      effort: 'easy',
      tags: ['Contenido'],
      dependencies: [],
      subtasks: [],
      lastEditedBy: valeria.id,
      lastEditedAt: ago(3 * DAY),
    }),
  ];

  // ── Activity and notes ────────────────────────────────────────────────────
  let logN = 0;
  const log = (taskN: number, user: SystemUser, action: string, at: number, comment?: { text: string; attachments?: string[] }): TaskActivityLog => {
    logN++;
    return {
      id: `demo-log-${logN}`,
      taskId: id(taskN),
      userId: user.id,
      username: user.name,
      action,
      timestamp: at,
      ...(comment && {
        comment: { id: `demo-comment-${logN}`, userId: user.id, username: user.name, text: comment.text, createdAt: at, attachments: comment.attachments },
      }),
    };
  };

  // Tasks are created first, then the story unfolds
  const creations = tasks.map((t, i) => {
    const author = [me, diego, ana, valeria].find((u) => u.id === t.lastEditedBy) ?? me;
    return log(i + 1, author, 'creó esta tarea', ago((16 - i) * DAY));
  });
  const readNote = log(6, ana, 'comentó', ago(6 * DAY + 2 * HOUR), {
    text: 'El prototipo quedó aprobado en la sesión con usuarios. 4 de 5 completaron la suscripción sin ayuda 🎉',
    attachments: ['/attachments/images/icono-movil.png'],
  });
  const story = [
    log(5, diego, 'cambió el estado de "En progreso" a "Listo"', ago(12 * DAY)),
    log(6, ana, 'cambió el estado de "Prototipo" a "Aprobado"', ago(6 * DAY)),
    readNote,
    log(10, diego, 'cambió el estado de "Investigando" a "Corregido"', ago(4 * DAY)),
    log(14, valeria, 'cambió el estado de "Esta semana" a "Publicado"', ago(3 * DAY)),
    log(1, diego, 'completó la subtarea "Formulario de tarjeta con validación"', ago(1 * DAY)),
    log(1, me, 'comentó', ago(22 * HOUR), {
      text: '¿Probamos también el reintento de pagos fallidos antes de la revisión? Es lo que más preocupa al equipo de soporte.',
    }),
    log(1, diego, 'comentó', ago(3 * HOUR), {
      text: 'Sí, ya está en las pruebas. Los webhooks los termino mañana; dejo el endpoint aquí por si alguien quiere probar:\n\n`POST /api/webhooks/payments`',
    }),
    log(2, ana, 'cambió el estado de "En progreso" a "En revisión"', ago(6 * HOUR)),
    log(2, ana, 'comentó', ago(5 * HOUR), {
      text: 'Lista para revisión. Adjunto cómo se ve en el editor de diseño. **¿Alguien puede probarla en Android?**',
      attachments: ['/attachments/images/captura-editor.png'],
    }),
    log(9, diego, 'comentó', ago(4 * HOUR), {
      text: 'Lo reproduje: pasa solo cuando la ciudad nueva no tiene código postal. Trabajando en la corrección.',
    }),
    log(12, valeria, 'comentó', ago(2 * HOUR), {
      text: 'Primera versión de la portada para las tiendas. ¿Qué opinan?',
      attachments: ['/attachments/images/portada-origen.png'],
    }),
  ];
  const logs = [...creations, ...story].sort((a, b) => b.timestamp - a.timestamp);

  // The oldest teammate note is already read; the rest show up as unread in the sidebar
  const activeUser: SystemUser = { ...me, readNotes: { ...(me.readNotes || {}), [readNote.id]: ago(6 * DAY) } };
  const users = [activeUser, ana, diego, valeria];

  // ── Documents ─────────────────────────────────────────────────────────────
  const doc = (n: number, title: string, filename: string, editor: SystemUser, editedAgo: number, folder?: string): DocMetadata => ({
    id: `demo-doc-${n}`,
    title,
    filename,
    ...(folder && { folder }),
    editedBy: editor.id,
    editedAt: ago(editedAgo),
    createdAt: ago(editedAgo + 5 * DAY),
    order: n * 1024,
  });

  const welcome = doc(1, '👋 Bienvenida', 'bienvenida.md', me, 10 * 60000);
  const roadmap = doc(2, '🗺️ Hoja de ruta', 'hoja-de-ruta.md', valeria, 1 * DAY);
  const architecture = doc(3, '📐 Arquitectura de la app', 'arquitectura.md', diego, 2 * DAY);
  const writing = doc(4, 'Guía de escritura', 'guia-de-escritura.md', valeria, 6 * DAY);
  const designSystem = doc(5, '🎨 Sistema de diseño', 'sistema-de-diseno.md', ana, 3 * DAY, 'Diseño');
  const research = doc(6, 'Investigación de usuarios', 'investigacion-de-usuarios.md', ana, 7 * DAY, 'Diseño');
  const kickoff = doc(7, '📅 Reunión de inicio', 'reunion-de-inicio.md', me, 15 * DAY, 'Reuniones');
  const retro = doc(8, 'Retrospectiva del sprint 3', 'retro-sprint-3.md', diego, 2 * DAY, 'Reuniones');
  const docs = [welcome, roadmap, architecture, writing, designSystem, research, kickoff, retro];

  const docContents: Record<string, string> = {
    [welcome.id]: `# 👋 Bienvenida al proyecto de ejemplo

Este proyecto cuenta la historia de un equipo pequeño que lanza **Origen**, una app de suscripción de café de especialidad. Está pensado para recorrer todo lo que puede hacer Kora.

## Recorrido sugerido

- [x] Abrir este documento
- [ ] Revisar el **Tablero** del inicio: progreso, tareas vencidas y actividad reciente
- [ ] Abrir la lista **🚀 Lanzamiento v1.0** y cambiar entre las vistas Lista, Kanban y Tabla
- [ ] Arrastrar una tarea a otro estado o a otra posición
- [ ] Abrir **TSK-001** para ver subtareas, dependencias, nivel de esfuerzo y notas del equipo
- [ ] Ver las notas sin leer (el número azul junto a algunas listas)
- [ ] Explorar **Documentos**: carpetas, cuadrícula y vista de lista
- [ ] Abrir la **Galería de medios** y la **Papelera** (hay elementos para restaurar)
- [ ] Buscar cualquier cosa con **Ctrl + K**

## El equipo

| Persona | Rol | Usuario |
|---------|-----|---------|
| Ana Torres | Diseño | \`ana\` |
| Diego Rivas | Desarrollo | \`diego\` |
| Valeria Gómez | Marketing | \`valeria\` |

> Puedes entrar como cualquiera de ellos con la contraseña \`${SAMPLE_TEAMMATE_PASSWORD}\` (por ejemplo en otra ventana) para ver cómo se ven las notas, los bloqueos de edición y quién está editando cada documento.

## Trucos

- Si el nombre de una lista o de un documento empieza por un emoji, ese emoji se usa como su icono.
- Los documentos admiten diagramas **Mermaid**, tablas, listas de tareas, código e imágenes de la galería.
- Todo se guarda como archivos JSON y Markdown legibles, en tu carpeta o en tu propio Firebase.
`,
    [roadmap.id]: `# 🗺️ Hoja de ruta

Fechas tentativas del lanzamiento de Origen. Se actualizan en la reunión semanal.

\`\`\`mermaid
gantt
    title Lanzamiento de Origen
    dateFormat YYYY-MM-DD
    section Producto
    Prototipo           :done,    p1, ${due(-20)}, ${due(-6)}
    Pagos y suscripción :active,  p2, ${due(-8)}, ${due(5)}
    Notificaciones      :         p3, ${due(5)}, ${due(9)}
    section Lanzamiento
    Fichas de tiendas   :         l1, ${due(-2)}, ${due(1)}
    Campaña             :         l2, ${due(3)}, ${due(14)}
    Lanzamiento público :milestone, l3, ${due(15)}, 0d
\`\`\`

## Hitos

| Hito | Fecha | Estado |
|------|-------|--------|
| Beta cerrada con 50 usuarios | ${due(-3)} | ✅ Cumplido |
| Versión candidata | ${due(7)} | 🟡 En curso |
| Lanzamiento público | ${due(15)} | ⏳ Pendiente |

## Después del lanzamiento

- Modo oscuro
- Regalos de suscripción
- Programa de referidos
`,
    [architecture.id]: `# 📐 Arquitectura de la app

Vista general de cómo se conectan las piezas de Origen.

\`\`\`mermaid
graph LR
    A[App móvil] --> B[API]
    B --> C[(Base de datos)]
    B --> D[Pasarela de pagos]
    D -- webhooks --> B
    B --> E[Servicio de envíos]
    B --> F[Notificaciones push]
\`\`\`

## Servicios

| Servicio | Responsable | Tecnología |
|----------|-------------|------------|
| App móvil | Diego | React Native |
| API | Diego | Node.js |
| Pagos | Diego | Pasarela externa |
| Envíos | Valeria | Integración con transportadora |

## Flujo de una renovación

\`\`\`mermaid
sequenceDiagram
    participant P as Pasarela
    participant A as API
    participant E as Envíos
    P->>A: Cobro exitoso
    A->>E: Agendar envío
    E-->>A: Número de guía
    A-->>P: 200 OK
\`\`\`

## Convenciones

- Las variables de entorno van en \`.env\`, nunca en el repositorio.
- Cada cambio pasa por revisión y por la integración continua (ver **TSK-005**).

\`\`\`bash
npm install
npm run dev
\`\`\`
`,
    [writing.id]: `# Guía de escritura

Cómo le hablamos a quienes usan Origen.

## Tono

- **Cercano**, sin ser informal en exceso.
- Frases cortas. Una idea por frase.
- Evitamos tecnicismos: decimos *"tu café sale mañana"*, no *"pedido despachado"*.

## Palabras que usamos

| Sí | No |
|----|----|
| Suscripción | Membresía |
| Envío | Despacho |
| Pausar | Congelar |

> Si dudas, léelo en voz alta. Si suena a contrato, reescríbelo.
`,
    [designSystem.id]: `# 🎨 Sistema de diseño

## Logo

![Logo de Origen](attachments/images/logo-claro.svg)

## Colores

| Nombre | Hex | Uso |
|--------|-----|-----|
| Tostado | \`#6F4E37\` | Encabezados y botones principales |
| Crema | \`#F5EBDD\` | Fondos |
| Cereza | \`#C0392B\` | Alertas y ofertas |
| Hoja | \`#2E7D32\` | Confirmaciones |

## Tipografía

- **Encabezados:** una sans serif geométrica, en negrita.
- **Texto:** la misma familia en peso regular, mínimo 16 px en la app.

## Ícono de la app

![Ícono móvil](attachments/images/icono-movil.png)

## Pendientes

- [x] Paleta de colores
- [x] Logo en versión clara y oscura
- [ ] Ilustraciones de las regiones de origen
- [ ] Guía de fotografía de producto
`,
    [research.id]: `# Investigación de usuarios

Cinco entrevistas y pruebas del prototipo con personas que compran café de especialidad al menos una vez al mes.

## Hallazgos principales

1. **Quieren saber de dónde viene el café.** La historia del caficultor fue lo más comentado.
2. **Temen quedarse sin café o acumularlo.** Poder pausar la suscripción es decisivo.
3. **El perfil de sabor ayuda**, pero debe poder saltarse.

> "Si puedo pausarla cuando me voy de viaje, me suscribo hoy mismo." — Participante 3

## Métricas del prototipo

| Tarea | Completada sin ayuda | Tiempo promedio |
|-------|:--------------------:|----------------:|
| Elegir un plan | 5 de 5 | 40 s |
| Completar el perfil de sabor | 4 de 5 | 25 s |
| Pagar la suscripción | 4 de 5 | 70 s |

## Próximos pasos

- [x] Compartir resultados con el equipo
- [ ] Simplificar el formulario de pago
- [ ] Repetir la prueba con la versión candidata
`,
    [kickoff.id]: `# 📅 Reunión de inicio

**Asistentes:** ${me.name}, Ana, Diego y Valeria

## Objetivo del proyecto

Lanzar la primera versión de Origen en las dos tiendas de aplicaciones con suscripciones mensuales y anuales.

## Acuerdos

- Trabajamos en sprints de dos semanas.
- Las tareas se organizan en Kora; los documentos del proyecto viven en la sección **Documentos**.
- Los errores se reportan en la lista **🐞 Errores** con pasos para reproducirlos.

## Compromisos

- [x] Diego: configurar el repositorio y la integración continua
- [x] Ana: prototipo del flujo de suscripción
- [ ] Valeria: plan de la campaña de prelanzamiento
- [ ] ${me.name}: definir los precios finales con el equipo

Más información sobre la herramienta: [repositorio de Kora](https://github.com/lorspi/Kora).
`,
    [retro.id]: `# Retrospectiva del sprint 3

## ✅ Qué salió bien

- El prototipo se validó antes de lo previsto.
- La integración continua detectó dos errores antes de la beta.

## ⚠️ Qué mejorar

- Las tareas grandes (como la **identidad visual**) necesitan dividirse antes de empezar.
- Faltan pruebas en teléfonos Android de gama baja.

## Acciones

| Acción | Responsable | Para |
|--------|-------------|------|
| Dividir la tarea de identidad visual | Ana | Próximo sprint |
| Conseguir dos teléfonos Android de prueba | Diego | ${due(4)} |
| Revisar los textos de las tiendas | Valeria | ${due(1)} |
`,
  };

  // ── Trash: a task and a doc ready to be restored ──────────────────────────
  const trashedTask: Task = {
    id: 'demo-task-trashed',
    taskCode: 'TSK-015',
    listId: launch.id,
    title: 'Inicio de sesión con redes sociales',
    description: 'Se pospone para después del lanzamiento.',
    statusId: 'todo',
    dueDate: '',
    assignees: [diego.id],
    priority: 'medium',
    effort: 'moderate',
    tags: ['Backend'],
    dependencies: [],
    subtasks: [],
    lastEditedBy: diego.id,
    lastEditedAt: ago(5 * DAY),
  };
  const trashedDoc: DocMetadata = {
    id: 'demo-doc-trashed',
    title: 'Borrador de precios (obsoleto)',
    filename: 'borrador-de-precios.md',
    editedBy: me.id,
    editedAt: ago(9 * DAY),
    createdAt: ago(14 * DAY),
  };
  const trashItems: TrashItem[] = [
    {
      id: 'demo-trash-task',
      type: 'task',
      originalData: trashedTask,
      deletedAt: ago(5 * DAY),
      deletedBy: diego.id,
      deletedByName: diego.name,
      label: trashedTask.title,
      metadata: { taskCode: trashedTask.taskCode },
    },
    {
      id: 'demo-trash-doc',
      type: 'document',
      originalData: {
        ...trashedDoc,
        content: '# Borrador de precios (obsoleto)\n\nPrimera propuesta: un solo plan de $15 al mes. Reemplazada por los tres planes de la tarea TSK-001.\n',
      },
      deletedAt: ago(8 * DAY),
      deletedBy: me.id,
      deletedByName: me.name,
      label: trashedDoc.title,
      metadata: { docFilename: trashedDoc.filename },
    },
  ];

  return {
    users,
    activeUser,
    lists,
    tasks,
    logs,
    docs,
    docContents,
    docFolders: ['Diseño', 'Reuniones'],
    trashItems,
    tags: ['App móvil', 'Suscripciones', 'Lanzamiento'],
  };
}
