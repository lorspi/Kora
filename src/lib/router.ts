/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Addresses for every view of a project, kept in the URL hash so they survive a
 * reload, can be shared and work with the browser's back and forward buttons.
 * The hash (rather than the path) works the same on every way of serving Kora:
 * the hosted app, Vite and the local server of the release (python http.server),
 * which has no fallback to index.html for unknown paths.
 *
 *   #/                              Project home
 *   #/listas/{listId}               A task list
 *   #/documentos                    Documents (root)
 *   #/documentos/carpeta/{folder}   Documents of a folder
 *   #/documentos/{docId}            An open document
 *   #/medios  #/papelera  #/acerca  Media, trash, about
 *   ...?tarea={TASK-001}            Any of them with a task open in the side panel
 *   #/tareas/{TASK-001}             Shortcut: the task, over its own list
 *
 * Invitation links (#/unirse?i=...) are handled apart (see App).
 */
import { useEffect } from 'react';
import { useProjectStore } from '../store';

type View =
  | { v: 'home' }
  | { v: 'list'; listId: string }
  | { v: 'docs'; folder: string | null }
  | { v: 'doc'; docId: string }
  | { v: 'media' }
  | { v: 'trash' }
  | { v: 'about' }
  /** #/tareas/{code}: the list of the task, resolved when applied */
  | { v: 'taskList' };

interface Route {
  view: View;
  /** Task code (or id) of the task open in the side panel */
  task: string | null;
}

type State = ReturnType<typeof useProjectStore.getState>;

const enc = encodeURIComponent;

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Whether the hash is an invitation link. */
export function isInviteHash(hash: string): boolean {
  return /^#\/unirse(\?|$)/.test(hash);
}

/** Read a route from a hash. Null if the hash isn't a project route. */
export function parseHash(hash: string): Route | null {
  if (!hash || hash === '#' || !hash.startsWith('#/') || isInviteHash(hash)) return null;
  const [rawPath, rawQuery = ''] = hash.slice(1).split('?');
  const parts = rawPath.split('/').filter(Boolean).map(safeDecode);
  const task = new URLSearchParams(rawQuery).get('tarea');

  let view: View = { v: 'home' };
  switch (parts[0]) {
    case undefined:
      break;
    case 'listas':
      if (parts[1]) view = { v: 'list', listId: parts[1] };
      break;
    case 'documentos':
      if (parts[1] === 'carpeta' && parts[2]) view = { v: 'docs', folder: parts.slice(2).join('/') };
      else if (parts[1]) view = { v: 'doc', docId: parts[1] };
      else view = { v: 'docs', folder: null };
      break;
    case 'medios':
      view = { v: 'media' };
      break;
    case 'papelera':
      view = { v: 'trash' };
      break;
    case 'acerca':
      view = { v: 'about' };
      break;
    case 'tareas':
      if (parts[1]) return { view: { v: 'taskList' }, task: parts[1] };
      break;
    default:
      return null;
  }
  return { view, task };
}

/** Path part of the hash for the view the store shows (same precedence as App). */
function viewPath(s: State): string {
  if (s.showAbout) return '/acerca';
  if (s.showTrash) return '/papelera';
  if (s.showMediaExplorer) return '/medios';
  if (s.showDocs) return s.docsFolder ? `/documentos/carpeta/${s.docsFolder.split('/').map(enc).join('/')}` : '/documentos';
  if (s.selectedDocId) return `/documentos/${enc(s.selectedDocId)}`;
  if (s.selectedListId) return `/listas/${enc(s.selectedListId)}`;
  return '/';
}

/** The hash that describes what the store shows. */
export function stateToHash(s: State): string {
  let hash = '#' + viewPath(s);
  if (s.selectedTaskId) {
    const task = s.tasks.find((t) => t.id === s.selectedTaskId);
    hash += `?tarea=${enc(task?.taskCode || s.selectedTaskId)}`;
  }
  return hash;
}

function findTask(s: State, codeOrId: string) {
  const key = codeOrId.toUpperCase();
  return s.tasks.find((t) => t.taskCode.toUpperCase() === key) || s.tasks.find((t) => t.id === codeOrId);
}

/** Bring the store to a route. Unknown lists, docs or tasks fall back gracefully. */
function applyRoute(route: Route) {
  const s = useProjectStore.getState();
  const task = route.task ? findTask(s, route.task) : undefined;

  let view = route.view;
  if (view.v === 'taskList') view = task ? { v: 'list', listId: task.listId } : { v: 'home' };
  if (view.v === 'list') {
    const listId = view.listId;
    if (!s.lists.some((l) => l.id === listId)) view = { v: 'home' };
  }
  if (view.v === 'doc') {
    const docId = view.docId;
    if (!s.docs.some((d) => d.id === docId)) view = { v: 'docs', folder: null };
  }

  const target: Route = { view, task: route.task };
  const wantedPath = routePath(target);
  if (wantedPath !== viewPath(s)) {
    switch (view.v) {
      case 'home': s.setSelectedList(null); break;
      case 'list': s.setSelectedList(view.listId); break;
      case 'docs': s.setShowDocs(true, view.folder); break;
      case 'doc': s.setSelectedDoc(view.docId); break;
      case 'media': s.setShowMediaExplorer(true); break;
      case 'trash': s.setShowTrash(true); break;
      case 'about': s.setShowAbout(true); break;
    }
  }

  // Navigation may be on hold (unsaved document): the task waits with it.
  const now = useProjectStore.getState();
  if (now.pendingNavigationAction) return;
  const wantedTaskId = task?.id ?? null;
  if (now.selectedTaskId !== wantedTaskId) now.setSelectedTask(wantedTaskId);
}

function routePath(route: Route): string {
  const v = route.view;
  switch (v.v) {
    case 'list': return `/listas/${enc(v.listId)}`;
    case 'docs': return v.folder ? `/documentos/carpeta/${v.folder.split('/').map(enc).join('/')}` : '/documentos';
    case 'doc': return `/documentos/${enc(v.docId)}`;
    case 'media': return '/medios';
    case 'trash': return '/papelera';
    case 'about': return '/acerca';
    default: return '/';
  }
}

function currentHash(): string {
  return window.location.hash || '#/';
}

/**
 * Keep the URL and the open view in sync while a project is open (`active`):
 * the hash present when the project opens is applied, then every navigation
 * adds a history entry, and back/forward (or an edited hash) navigates.
 */
export function useHashRouter(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let applying = false;

    const syncUrl = (mode: 'push' | 'replace') => {
      const hash = stateToHash(useProjectStore.getState());
      if (hash === currentHash()) return;
      const url = `${window.location.pathname}${window.location.search}${hash}`;
      if (mode === 'push') window.history.pushState(null, '', url);
      else window.history.replaceState(null, '', url);
    };

    const applyFromLocation = () => {
      const route = parseHash(window.location.hash);
      if (!route) return false;
      applying = true;
      try {
        applyRoute(route);
      } finally {
        applying = false;
      }
      // What could actually be shown (unknown ids, a navigation on hold) wins.
      syncUrl('replace');
      return true;
    };

    if (!applyFromLocation()) syncUrl('replace');

    const unsubscribe = useProjectStore.subscribe(() => {
      if (!applying) syncUrl('push');
    });
    const onHashChange = () => {
      if (!isInviteHash(window.location.hash)) applyFromLocation();
    };
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onHashChange);
    return () => {
      unsubscribe();
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onHashChange);
    };
  }, [active]);
}

/** Remove the project route from the URL (back at the project browser). */
export function clearRouteHash() {
  if (window.location.hash && !isInviteHash(window.location.hash)) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }
}
