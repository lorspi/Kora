/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { 
  SystemUser, 
  ProjectConfig, 
  ProjectMetadata, 
  TaskList, 
  Task, 
  TaskActivityLog, 
  DocMetadata, 
  ProjectLocks, 
  TaskStatus, 
  Subtask,
  TaskLock,
  TrashItem,
  RegisteredProject,
  ProjectStorageType,
  DocCommentThread,
  DocCommentAnchor
} from '../types';
import { FileSystemAdapter, FsMode, normalizePath, saveDirectoryHandle, loadDirectoryHandle, clearDirectoryHandle, saveDirectoryHandleWithKey, loadDirectoryHandleByKey, deleteDirectoryHandleByKey, dbClear } from '../lib/fs';
import type { FirebaseAdapter, FirebaseConfig } from '../lib/firebase';
import { saveFirebaseConfigForProject, loadFirebaseConfigForProject, deleteFirebaseConfigForProject } from '../lib/firebaseConfigStore';
import type { CloudflareAdapter, CloudflareLink, CloudflareInvite } from '../lib/cloudflare';
import { saveCloudflareLinkForProject, loadCloudflareLinkForProject, deleteCloudflareLinkForProject } from '../lib/cloudflareConfigStore';
import { hashPassword } from '../lib/crypto';
import { buildSampleProject, SAMPLE_MEDIA } from './sampleProject';

/**
 * Storage engine used by the store. Both adapters share the same structural
 * interface (readTextFile/writeTextFile/listFiles/fileExists/...), so the entire
 * store, CRUD, locks and polling logic works against either one unchanged.
 */
export type StorageAdapter = FileSystemAdapter | FirebaseAdapter | CloudflareAdapter;

/** Close the realtime connection of an adapter that is no longer in use. */
function releaseAdapter(adapter: StorageAdapter | null) {
  if (adapter && adapter.getMode() === 'CLOUDFLARE') {
    (adapter as CloudflareAdapter).dispose().catch(() => {});
  }
}

interface ProjectState {
  // Engines
  adapter: StorageAdapter | null;
  fsMode: FsMode;
  isLoading: boolean;
  isPolling: boolean;
  
  // Data State
  projectMeta: ProjectMetadata | null;
  projectConfig: ProjectConfig | null;
  users: SystemUser[];
  activeUser: SystemUser | null;
  lists: TaskList[];
  tasks: Task[];
  docs: DocMetadata[];
  locks: ProjectLocks;
  /** Doc locks, kept apart from task `locks` (see docLockPath). */
  docLocks: ProjectLocks;
  logs: TaskActivityLog[];
  isOnboarding: boolean;
  
  // Selection / Navigation UI
  selectedListId: string | null;
  selectedTaskId: string | null;
  selectedDocId: string | null;
  searchQuery: string;
  isSearchOpen: boolean;
  
  // Doc unsaved changes tracking for navigation confirmation
  docHasUnsavedChanges: boolean;
  setDocHasUnsavedChanges: (has: boolean) => void;
  pendingNavigationAction: (() => void) | null;
  confirmPendingNavigation: () => void;
  cancelPendingNavigation: () => void;

  // Methods
  setFsMode: (mode: FsMode) => void;
  loadProjectDirectory: (handle: FileSystemDirectoryHandle | null, mode: FsMode) => Promise<void>;
  loadFromAdapter: (adapter: StorageAdapter) => Promise<void>;
  initialize: () => Promise<void>;
  createBlankProject: (name: string, desc: string) => Promise<void>;

  initializeNewProject: (projectName: string, projectDesc: string, firstUser: SystemUser, useSampleData: boolean) => Promise<void>;
  createListDirect: (name: string, color: string) => Promise<TaskList>;
  seedSampleProjectOnboarding: (projectMeta: ProjectMetadata, config: ProjectConfig, firstUser: SystemUser) => Promise<void>;
  backgroundReload: () => Promise<void>;
  importBackupZip: (file: File) => Promise<void>;
  
  // User Authentication
  registerUser: (username: string, name: string, password: string, avatarColor: string) => Promise<SystemUser>;
  loginUser: (username: string, password: string) => Promise<boolean>;
  logoutUser: () => void;
  closeProject: () => void;
  
  // Lists Management
  createList: (name: string, color: string) => Promise<TaskList>;
  /** Arrange the task lists in the sidebar: `ids` in their new order. */
  reorderLists: (ids: string[]) => Promise<void>;
  updateListConfig: (listId: string, name: string, color: string, statuses: TaskStatus[]) => Promise<void>;
  deleteList: (listId: string) => Promise<void>;
  
  // Tasks Management
  createTask: (title: string, listId: string, statusId: string, priority: Task['priority']) => Promise<Task>;
  /** Create several tasks at once (e.g. pasted lines); blank titles are skipped. */
  createTasks: (titles: string[], listId: string, statusId: string, priority: Task['priority']) => Promise<Task[]>;
  updateTask: (task: Task) => Promise<void>;
  /**
   * Place a task (dragged in the list or kanban) in `statusId`, at its position in
   * `orderedIds`: the ids of that status's tasks in their new order.
   */
  reorderTasks: (taskId: string, statusId: string, orderedIds: string[]) => Promise<void>;
  /**
   * Move a task to another list. It keeps its status when the list has one with the same
   * id or name (or takes the list's first status) and goes at the end of it.
   */
  moveTaskToList: (taskId: string, listId: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  
  // Subtasks
  addSubtask: (taskId: string, title: string) => Promise<void>;
  toggleSubtask: (taskId: string, subtaskId: string) => Promise<void>;
  deleteSubtask: (taskId: string, subtaskId: string) => Promise<void>;
  
  // Markdown Documents
  /** Creates a doc (opened right away unless `open` is false) */
  createDoc: (title: string, content: string, folder?: string, open?: boolean) => Promise<DocMetadata>;
  getDocContent: (docId: string) => Promise<string>;
  saveDocContent: (docId: string, title: string, content: string) => Promise<void>;
  deleteDoc: (docId: string) => Promise<void>;
  scanDocuments: () => Promise<number>;
  createDocFolder: (folderName: string) => Promise<void>;
  moveDocToFolder: (docId: string, folder: string | null) => Promise<void>;
  /** Stores the manual order of the docs of a folder (or of the root), in the given order */
  reorderDocs: (ids: string[]) => Promise<void>;
  getDocFolders: () => Promise<string[]>;
  /** Doc folders (subfolders of /docs), shared by the sidebar and the documents view */
  docFolders: string[];
  refreshDocFolders: () => Promise<void>;
  /** Returns the folder's new (sanitized) name */
  renameDocFolder: (oldName: string, newName: string) => Promise<string | void>;
  deleteDocFolder: (folderName: string) => Promise<void>;
  renameDocFile: (docId: string, newFilename: string) => Promise<void>;
  
  // Lock mechanism
  lockTask: (taskId: string) => Promise<boolean>;
  unlockTask: (taskId: string) => Promise<void>;
  /**
   * Acquire or renew a document lock for an editor `session`. `claimLive` says the
   * session has held the lock continuously until now: then a lock another session
   * wrote without having seen ours (a stale read) is reclaimed instead of obeyed.
   */
  /**
   * `takeOverShared`: exclusive editing (autosave off) may replace a realtime
   * session's lock; the caller checked that nobody is in that session anymore.
   */
  lockDoc: (docId: string, session: string, claimLive: boolean, collab?: boolean, takeOverShared?: boolean) => Promise<boolean>;
  unlockDoc: (docId: string) => Promise<void>;
  /** Read a doc's lock as stored right now (also refreshes it in `docLocks`). */
  readDocLock: (docId: string) => Promise<TaskLock | null>;

  // Document comments (threads on fragments of the open document)
  /** Comment threads of `docCommentsFor` (the open document). */
  docComments: DocCommentThread[];
  docCommentsFor: string | null;
  loadDocComments: (docId: string) => Promise<void>;
  addDocCommentThread: (docId: string, anchor: DocCommentAnchor, text: string) => Promise<DocCommentThread>;
  replyDocComment: (threadId: string, text: string) => Promise<void>;
  editDocComment: (threadId: string, commentId: string, text: string) => Promise<void>;
  /** Deletes the comment; the thread goes too if it was its last comment. */
  deleteDocComment: (threadId: string, commentId: string) => Promise<void>;
  deleteDocCommentThread: (threadId: string) => Promise<void>;
  setDocCommentResolved: (threadId: string, resolved: boolean) => Promise<void>;
  /** Store where the commented fragments are now (after the document changed). */
  updateDocCommentAnchors: (updates: { id: string; anchor: DocCommentAnchor }[]) => Promise<void>;
  
  // Activity logger & notes
  addComment: (taskId: string, commentText: string, attachments?: string[]) => Promise<void>;
  editComment: (logId: string, newText: string) => Promise<void>;
  deleteComment: (logId: string) => Promise<void>;
  markNoteAsRead: (logId: string) => Promise<void>;
  uploadAttachment: (file: File) => Promise<{ path: string; name: string }>;
  resolveAttachmentUrl: (path: string) => Promise<string>;
  
  // Trash system
  trashItems: TrashItem[];
  showTrash: boolean;
  restoreFromTrash: (trashItemId: string) => Promise<void>;
  permanentDeleteItem: (trashItemId: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  deleteMediaFile: (path: string, name: string, mediaType: 'image' | 'video') => Promise<void>;
  
  // General view toggle
  showMediaExplorer: boolean;
  setShowMediaExplorer: (show: boolean) => void;
  setShowTrash: (show: boolean) => void;
  setSelectedList: (listId: string | null) => void;
  setSelectedTask: (taskId: string | null) => void;
  setSelectedDoc: (docId: string | null) => void;
  setSearchQuery: (query: string) => void;
  setSearchOpen: (isOpen: boolean) => void;
  getDocViewMode: (docId: string | null) => 'edit' | 'preview' | 'split';
  setDocViewMode: (docId: string, mode: 'edit' | 'preview' | 'split') => Promise<void>;
  saveProjectConfig: (config?: ProjectConfig) => Promise<void>;
  
  // Project Administration
  updateProjectMeta: (name: string, description: string) => Promise<void>;
  updateUser: (userId: string, updates: { name?: string; isSuperAdmin?: boolean; avatarColor?: string }) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  showProjectSettings: boolean;
  setShowProjectSettings: (show: boolean) => void;
  showAbout: boolean;
  setShowAbout: (show: boolean) => void;
  /** Documents view (grid of folders and docs); docsFolder is the open folder (null: the root) */
  showDocs: boolean;
  docsFolder: string | null;
  setShowDocs: (show: boolean, folder?: string | null) => void;
  
  // Mobile sidebar
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  
  // Multi-project browser
  registeredProjects: RegisteredProject[];
  loadedProjectId: string | null;
  loadProjectById: (projectId: string) => Promise<void>;
  registerProject: (name: string, type: ProjectStorageType, pathHint?: string) => string;
  registerFirebaseProject: (name: string, config: FirebaseConfig, spaceId?: string) => string;
  registerCloudflareProject: (name: string, link: CloudflareLink) => string;
  /**
   * Join a Cloudflare project from an invitation: reuses the project if it is
   * already registered here (refreshing its token), otherwise registers it. Loads it.
   */
  joinCloudflareInvite: (invite: CloudflareInvite) => Promise<void>;
  /** Invitation opened through a link (#/unirse?i=...), waiting for confirmation. */
  pendingInvite: CloudflareInvite | null;
  setPendingInvite: (invite: CloudflareInvite | null) => void;
  unregisterProject: (projectId: string) => void;
  goToProjectBrowser: () => void;
}

/** Gap between the positions of arranged tasks, so a move usually rewrites only the moved task. */
const TASK_ORDER_STEP = 1024;

/**
 * Tasks in display order: arranged ones by their position, then the never-arranged ones
 * (e.g. new) by code, as before tasks could be arranged.
 */
export function sortTasksByOrder(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const ao = typeof a.order === 'number';
    const bo = typeof b.order === 'number';
    if (ao && bo) return a.order! - b.order!;
    if (ao !== bo) return ao ? -1 : 1;
    return a.taskCode.localeCompare(b.taskCode);
  });
}

/** Task lists in sidebar order: arranged ones by position, then the rest as created. */
function sortListsInPlace(lists: TaskList[]): TaskList[] {
  return lists.sort((a, b) => {
    const ao = typeof a.order === 'number';
    const bo = typeof b.order === 'number';
    if (ao && bo) return a.order! - b.order!;
    if (ao !== bo) return ao ? -1 : 1;
    return a.createdAt - b.createdAt;
  });
}

// Helper to save/load persistence state
const PERSISTENCE_KEY = 'gestor-de-proyectos-state';

/**
 * How long a document lock stays valid without a visible heartbeat. Generous on
 * purpose: background tabs may only tick once a minute and shared folders sync
 * with delay. Leaving the doc releases the lock explicitly, so this only matters
 * when a session dies without cleaning up.
 */
export const DOC_LOCK_TTL = 120000;
/** A lock whose own expiry is this far in the past is a leftover, whatever the clock skew. */
const DOC_LOCK_STALE_MARGIN = 10 * 60 * 1000;

/**
 * Each doc lock lives in its own file, so only the sessions contending for that
 * doc ever write it (a shared locks.json was rewritten whole by every task
 * lock/unlock and background cleanup, which silently dropped doc locks).
 */
function docLockPath(docId: string): string {
  return `/activity/doc-locks/${docId}.json`;
}

async function readDocLockFile(adapter: StorageAdapter, docId: string): Promise<TaskLock | null> {
  try {
    if (!(await adapter.fileExists(docLockPath(docId)))) return null;
    const lock = JSON.parse(await adapter.readTextFile(docLockPath(docId)));
    return lock && lock.userId ? lock : null;
  } catch {
    return null;
  }
}

/** Last heartbeat seen per doc lock, timed with OUR clock. */
const docLockSeen = new Map<string, { stamp: string; seenAt: number }>();

/**
 * Whether another session's doc lock is still alive. Liveness is judged by when we
 * last saw its heartbeat change, on our own clock — never by comparing its
 * expiresAt (the holder's clock) with ours, since machines' clocks drift.
 */
export function isDocLockAlive(docId: string, lock: TaskLock, now = Date.now()): boolean {
  const stamp = `${lock.session ?? lock.userId}:${lock.expiresAt}`;
  const seen = docLockSeen.get(docId);
  if (!seen || seen.stamp !== stamp) {
    if (lock.expiresAt < now - DOC_LOCK_STALE_MARGIN) return false;
    docLockSeen.set(docId, { stamp, seenAt: now });
    return true;
  }
  return now - seen.seenAt < DOC_LOCK_TTL;
}
const SAVED_SESSION_KEY = 'gestor-de-proyectos-saved-session';
const LAST_OPENED_PROJECT_KEY = 'kora-last-opened-project';
type PersistenceState = {
  hasActiveProject: boolean;
  fsMode: FsMode;
};

function savePersistenceState(state: PersistenceState) {
  try {
    localStorage.setItem(PERSISTENCE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save persistence state', e);
  }
}

function loadPersistenceState(): PersistenceState {
  try {
    const stored = localStorage.getItem(PERSISTENCE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Could not load persistence state', e);
  }
  return { hasActiveProject: false, fsMode: 'FSA_API' };
}

// ── Multi-project persistence helpers ─────────────────────────────────────────

const REGISTERED_PROJECTS_KEY = 'kora-registered-projects';
const SAVED_SESSIONS_KEY = 'kora-saved-sessions';

type SavedSessions = Record<string, { username: string; savedAt: number }>;

function loadRegisteredProjects(): RegisteredProject[] {
  try {
    const raw = localStorage.getItem(REGISTERED_PROJECTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Could not load registered projects', e);
  }
  return [];
}

function saveRegisteredProjects(projects: RegisteredProject[]) {
  try {
    localStorage.setItem(REGISTERED_PROJECTS_KEY, JSON.stringify(projects));
  } catch (e) {
    console.warn('Could not save registered projects', e);
  }
}

function _loadSavedSessions(): SavedSessions {
  try {
    const raw = localStorage.getItem(SAVED_SESSIONS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Could not load saved sessions', e);
  }
  return {};
}

function _saveSavedSessions(sessions: SavedSessions) {
  try {
    localStorage.setItem(SAVED_SESSIONS_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.warn('Could not save saved sessions', e);
  }
}

function saveLastOpenedProjectId(projectId: string) {
  try {
    localStorage.setItem(LAST_OPENED_PROJECT_KEY, projectId);
  } catch (e) {
    console.warn('Could not save last opened project', e);
  }
}

function loadLastOpenedProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_OPENED_PROJECT_KEY);
  } catch (e) {
    console.warn('Could not load last opened project', e);
    return null;
  }
}

function clearLastOpenedProjectId() {
  try {
    localStorage.removeItem(LAST_OPENED_PROJECT_KEY);
  } catch (e) {
    console.warn('Could not clear last opened project', e);
  }
}

/** Migrate old single-project persistence to the new multi-project system */
function migrateOldProject(): RegisteredProject[] {
  const persistence = loadPersistenceState();
  if (!persistence.hasActiveProject) return [];

  const existing = loadRegisteredProjects();
  if (existing.length > 0) return existing;

  const projectId = crypto.randomUUID();
  const projName = 'Mi Proyecto Local';
  const project: RegisteredProject = {
    id: projectId,
    name: projName,
    type: persistence.fsMode,
    createdAt: Date.now()
  };

  // Migrate saved session
  try {
    const oldSessionRaw = localStorage.getItem(SAVED_SESSION_KEY);
    if (oldSessionRaw) {
      const oldSession = JSON.parse(oldSessionRaw);
      const sessions = _loadSavedSessions();
      sessions[projectId] = { username: oldSession.username, savedAt: oldSession.savedAt || Date.now() };
      _saveSavedSessions(sessions);
    }
  } catch (e) { /* ignore */ }

  const projects = [project];
  saveRegisteredProjects(projects);

  // Migrate FSA handle if needed (fire and forget - will complete before user clicks)
  if (persistence.fsMode === 'FSA_API') {
    (async () => {
      try {
        const handle = await loadDirectoryHandle();
        if (handle) {
          await saveDirectoryHandleWithKey(handle, `fsa-handle-${projectId}`);
        }
      } catch (e) {
        console.warn('Could not migrate FSA handle', e);
      }
    })();
  }

  return projects;
}

/**
 * Read and parse the .json files of a folder in parallel, keeping their order.
 * Files that can't be read or parsed are skipped with a warning.
 */
async function readJsonFiles<T>(adapter: StorageAdapter, folder: string, files: string[], what: string): Promise<T[]> {
  const results = await Promise.all(
    files.filter((file) => file.endsWith('.json')).map(async (file) => {
      try {
        return JSON.parse(await adapter.readTextFile(`${folder}/${file}`)) as T;
      } catch (e) {
        console.warn(`Error reading ${what} file: ${file}`, e);
        return null;
      }
    })
  );
  return results.filter((x): x is Awaited<T> & {} => x !== null) as T[];
}

/** Folder of the comment threads of a document: one JSON file per thread. */
export function docCommentsFolder(docId: string): string {
  return `/comments/${docId}`;
}

function docCommentPath(docId: string, threadId: string): string {
  return `${docCommentsFolder(docId)}/${threadId}.json`;
}

/** All comment threads of a document (none if it has no comments folder yet). */
async function readDocCommentThreads(adapter: StorageAdapter, docId: string): Promise<DocCommentThread[]> {
  let files: string[] = [];
  try {
    files = (await adapter.listFiles(docCommentsFolder(docId))).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const threads = await Promise.all(
    files.map(async (f) => {
      try {
        return JSON.parse(await adapter.readTextFile(`${docCommentsFolder(docId)}/${f}`)) as DocCommentThread;
      } catch {
        return null;
      }
    })
  );
  return threads.filter((t): t is DocCommentThread => !!t && Array.isArray(t.comments)).sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Bumped by every local change to document comments. A read of the comments that
 * started before a change must not overwrite it when it lands (see backgroundReload).
 */
let docCommentsRev = 0;

/** Local changes to comment threads, applied one after another (see mutateDocThread). */
let docCommentQueue: Promise<void> = Promise.resolve();

/**
 * This tab's writes to the project, per part of the state they feed. A background
 * reload that overlapped a write to, say, the notes may have read them from before
 * that write: it keeps the local notes and applies the rest (see backgroundReload).
 */
let writeSeq = 0;
const sliceWrites: Record<string, number> = {};

/** The part of the state a file feeds (null: none that a background reload sets). */
function stateSliceOf(path: unknown): string | null {
  if (typeof path !== 'string') return null;
  const p = normalizePath(path);
  if (p.startsWith('/lists')) return 'lists';
  if (p.startsWith('/tasks')) return 'tasks';
  if (p === '/docs/info.json') return 'docs';
  if (p === '/activity/logs.json') return 'logs';
  if (p === '/activity/locks.json') return 'locks';
  if (p.startsWith('/activity/doc-locks')) return 'docLocks';
  if (p.startsWith('/users')) return 'users';
  if (p.startsWith('/trash')) return 'trash';
  if (p.startsWith('/comments')) return 'comments';
  return null;
}

/** Record the writes of an adapter in sliceWrites (once per adapter instance). */
function trackLocalWrites(adapter: StorageAdapter) {
  const target = adapter as unknown as Record<string, unknown> & { __koraTracked?: boolean };
  if (target.__koraTracked) return;
  target.__koraTracked = true;
  for (const method of ['writeTextFile', 'writeBinaryFile', 'deleteFile', 'deleteDirectory']) {
    const original = target[method];
    if (typeof original !== 'function') continue;
    target[method] = async (...args: unknown[]) => {
      const slice = stateSliceOf(args[0]);
      if (slice) sliceWrites[slice] = ++writeSeq;
      try {
        return await (original as (...a: unknown[]) => Promise<unknown>).apply(adapter, args);
      } finally {
        if (slice) sliceWrites[slice] = ++writeSeq;
      }
    };
  }
}

/** A background reload was requested while one was running (see backgroundReload). */
let reloadAgain = false;

/** The app-load initialization in progress or done (see initialize). */
let initializeOnce: Promise<void> | null = null;

export const useProjectStore = create<ProjectState>((set, get) => {
  
  /**
   * Change the activity log (notes and task history). Changes run one after another,
   * each on the log as the previous one left it: two at once (e.g. the history entry
   * of an edited description and a new note) would otherwise each write the log
   * without the other's entry.
   */
  let logsQueue: Promise<void> = Promise.resolve();
  const updateLogs = (adapter: StorageAdapter, fn: (logs: TaskActivityLog[]) => TaskActivityLog[]): Promise<void> => {
    const run = logsQueue.then(async () => {
      const next = fn(get().logs);
      set({ logs: next });
      await adapter.writeTextFile('/activity/logs.json', JSON.stringify(next, null, 2));
    });
    logsQueue = run.catch(() => {});
    return run;
  };

  // Write a single project activity note
  const logActivityAction = async (taskId: string, action: string, commentText?: string, attachments?: string[]) => {
    const { adapter, activeUser } = get();
    if (!adapter || !activeUser) return;
    
    let commentObj = undefined;
    if (commentText || (attachments && attachments.length > 0)) {
      commentObj = {
        id: crypto.randomUUID(),
        userId: activeUser.id,
        username: activeUser.name,
        text: commentText || '',
        createdAt: Date.now(),
        attachments
      };
    }

    const newLog: TaskActivityLog = {
      id: crypto.randomUUID(),
      taskId,
      userId: activeUser.id,
      username: activeUser.name,
      action,
      timestamp: Date.now(),
      comment: commentObj
    };

    await updateLogs(adapter, (logs) => [newLog, ...logs]);
  };

  /**
   * Change one comment thread of the open document: re-read its file, apply `fn`
   * (null deletes the thread) and write it back. `touch` bumps updatedAt.
   */
  const mutateDocThread = (
    threadId: string,
    fn: (t: DocCommentThread) => DocCommentThread | null,
    touch = true
  ): Promise<void> => {
    // Show it right away; the file is written next (and the state replaced with it).
    const shown = get().docComments.find((t) => t.id === threadId);
    if (shown) {
      docCommentsRev++;
      const optimistic = fn(shown);
      set((st) => ({
        docComments: optimistic
          ? st.docComments.map((t) => (t.id === threadId ? optimistic : t))
          : st.docComments.filter((t) => t.id !== threadId),
      }));
    }
    // One change at a time: two changes read concurrently would each write back the
    // file without the other's (e.g. resolving while the anchor is being updated).
    const run = docCommentQueue.then(() => applyDocThreadChange(threadId, fn, touch, shown));
    docCommentQueue = run.catch(() => {});
    return run;
  };

  const applyDocThreadChange = async (
    threadId: string,
    fn: (t: DocCommentThread) => DocCommentThread | null,
    touch: boolean,
    known: DocCommentThread | undefined
  ) => {
    const { adapter, docCommentsFor } = get();
    if (!adapter || !known || !docCommentsFor) return;
    const path = docCommentPath(known.docId, threadId);
    let current = known;
    try {
      current = JSON.parse(await adapter.readTextFile(path)) as DocCommentThread;
    } catch {
      // Deleted meanwhile by someone else: nothing left to change.
      set((st) => ({ docComments: st.docComments.filter((t) => t.id !== threadId) }));
      return;
    }
    const next = fn(current);
    docCommentsRev++;
    if (next) {
      const stamped = touch ? { ...next, updatedAt: Date.now() } : next;
      await adapter.writeTextFile(path, JSON.stringify(stamped, null, 2));
      docCommentsRev++;
      set((st) => ({ docComments: st.docComments.map((t) => (t.id === threadId ? stamped : t)) }));
    } else {
      await adapter.deleteFile(path);
      set((st) => ({ docComments: st.docComments.filter((t) => t.id !== threadId) }));
    }
  };

  return {
    // Engine State
    adapter: null,
    fsMode: 'FSA_API',
    isLoading: true, // Start loading to check persistence
    isPolling: false,
    
    // Data State
    projectMeta: null,
    projectConfig: null,
    users: [],
    activeUser: null,
    lists: [],
    tasks: [],
    docs: [],
    locks: {},
    docLocks: {},
    logs: [],    isOnboarding: false,

    // Doc unsaved changes tracking
    docHasUnsavedChanges: false,
    pendingNavigationAction: null,

    // Selection / Navigation UI
    selectedListId: null,
    selectedTaskId: null,
    selectedDocId: null,
    searchQuery: '',
    isSearchOpen: false,
    showTrash: false,
    trashItems: [],
    showMediaExplorer: false,

    // Multi-project browser state
    registeredProjects: loadRegisteredProjects(),
    loadedProjectId: null,
    pendingInvite: null,
    setPendingInvite: (invite) => set({ pendingInvite: invite }),
    docComments: [],
    docCommentsFor: null,

    // Read full project contents on load (local folder mode)
    loadProjectDirectory: async (handle, mode) => {
      const adapter = new FileSystemAdapter(mode, handle);
      await get().loadFromAdapter(adapter);
    },

    // Generic loader that works for any storage adapter (local folder or Firebase).
    loadFromAdapter: async (adapter) => {
      trackLocalWrites(adapter);
      const previous = get().adapter;
      if (previous && previous !== adapter) releaseAdapter(previous);
      set({ isLoading: true });

      try {
        const configExists = await adapter.fileExists('/config.json');
        
        if (!configExists) {
          // New project setup! Enable onboarding flow instead of seeding automatically
          set({ adapter, isOnboarding: true });
          set({ isLoading: false });
          return;
        }

        // Existing project folder! Load everything
        const projectRaw = await adapter.readTextFile('/project.json');
        const projectMeta: ProjectMetadata = JSON.parse(projectRaw);

        let projectConfig: ProjectConfig = {
          projectId: projectMeta.id,
          projectName: projectMeta.name,
          lastModified: Date.now()
        };

        try {
          if (await adapter.fileExists('/config.json')) {
            const configRaw = await adapter.readTextFile('/config.json');
            const loadedConfig = JSON.parse(configRaw) as ProjectConfig;
            projectConfig = {
              ...projectConfig,
              ...loadedConfig
            };
          }
        } catch (e) {
          console.warn('Error loading project config', e);
        }

        // Load users
        let users: SystemUser[] = [];
        try {
          const usersRaw = await adapter.readTextFile('/users/users.json');
          users = JSON.parse(usersRaw);
        } catch (e) {
          console.warn('Error reading users list', e);
        }

        // Load lists
        // (Files are read in parallel: in cloud projects each read is a network round trip.)
        const listFiles = await adapter.listFiles('/lists');
        const lists: TaskList[] = (await readJsonFiles<TaskList>(adapter, '/lists', listFiles, 'list'));

        // Load tasks
        const taskFiles = await adapter.listFiles('/tasks');
        const tasks: Task[] = (await readJsonFiles<Task>(adapter, '/tasks', taskFiles, 'task'));

        // Load doc list from index file in /docs/info.json
        let docs: DocMetadata[] = [];
        try {
          if (await adapter.fileExists('/docs/info.json')) {
            const docsRaw = await adapter.readTextFile('/docs/info.json');
            docs = JSON.parse(docsRaw);
          }
        } catch (e) {
          console.warn('Error loading documents catalog', e);
        }

        // Load locks
        let locks: ProjectLocks = {};
        try {
          if (await adapter.fileExists('/activity/locks.json')) {
            const locksRaw = await adapter.readTextFile('/activity/locks.json');
            locks = JSON.parse(locksRaw);
          }
        } catch (e) {
          // Locks might not exist
        }

        // Load logs
        let logs: TaskActivityLog[] = [];
        try {
          if (await adapter.fileExists('/activity/logs.json')) {
            const logsRaw = await adapter.readTextFile('/activity/logs.json');
            logs = JSON.parse(logsRaw);
          }
        } catch (e) {
          // Logs empty or failure
        }

        // Load trash items
        let trashItems: TrashItem[] = [];
        try {
          if (await adapter.fileExists('/trash/items.json')) {
            const trashRaw = await adapter.readTextFile('/trash/items.json');
            trashItems = JSON.parse(trashRaw);
          }
        } catch (e) {
          // Trash might not exist yet
        }

        // Sort structures
        sortListsInPlace(lists);
        tasks.sort((a, b) => a.taskCode.localeCompare(b.taskCode));

        // Check for saved session (remember me) — per-project only
        let activeUser: SystemUser | null = null;
        const currentProjectId = get().loadedProjectId;
        try {
          if (currentProjectId) {
            const sessions = _loadSavedSessions();
            const saved = sessions[currentProjectId];
            if (saved) {
              const matchedUser = users.find(u => u.username === saved.username);
              if (matchedUser) activeUser = matchedUser;
            }
          }
        } catch (e) {
          // Invalid or missing saved session
        }

        set({
          adapter,
          projectMeta,
          projectConfig,
          users,
          activeUser, // null if no saved session, auto-login if remember me was checked
          lists,
          tasks,
          docs,
          locks,
          logs,
          trashItems,
          selectedListId: lists[0]?.id || null,
          selectedTaskId: null,
          selectedDocId: null,
          showDocs: false,
          docsFolder: null,
          docFolders: [],
          isLoading: false
        });

        // Persist the FSA handle as the "last opened" one (local mode only).
        if (adapter instanceof FileSystemAdapter) {
          const h = adapter.getDirectoryHandle();
          if (h) await saveDirectoryHandle(h);
        }

        // Update registered project name with real name from project.json
        const loadedId = get().loadedProjectId;
        if (loadedId && projectMeta) {
          const currentProjects = loadRegisteredProjects();
          const updatedProjects = currentProjects.map(p =>
            p.id === loadedId ? { ...p, name: projectMeta.name } : p
          );
          saveRegisteredProjects(updatedProjects);
          set({ registeredProjects: updatedProjects });
        }

      } catch (err) {
        console.error('Failed to load project from folder', err);
        set({ isLoading: false });
        throw err;
      }
    },

    // Auto-initialize on app load — migrate old single-project to multi-project browser.
    // Runs once even if called twice (React StrictMode runs mount effects twice in
    // development): a second, concurrent load would reset the selection restored
    // from the URL when it finished.
    initialize: () => {
      if (!initializeOnce) {
        initializeOnce = (async () => {
          // Try migration from old single-project system (old PERSISTENCE_KEY)
          const migrated = migrateOldProject();
          if (migrated.length > 0) {
            set({ registeredProjects: migrated });
            // COMENTARIO: No retornamos aqui — continuamos para intentar
            // auto-cargar el ultimo proyecto abierto.
          }

          // Check if there's a last opened project to auto-restore on reload
          const lastOpenedId = loadLastOpenedProjectId();
          if (lastOpenedId) {
            const projectExists = get().registeredProjects.some(p => p.id === lastOpenedId);
            if (projectExists) {
              try {
                await get().loadProjectById(lastOpenedId);
                return; // loadProjectById sets isLoading to false
              } catch (e) {
                console.warn('Could not auto-load last project', e);
                // Clear the stale reference so we don't keep trying
                clearLastOpenedProjectId();
              }
            } else {
              // Project no longer registered, clean up
              clearLastOpenedProjectId();
            }
          }

          // Projects are already loaded synchronously in the initial state from localStorage
          set({ isLoading: false });
        })();
      }
      return initializeOnce;
    },

    saveProjectConfig: async (config) => {
      const { adapter, projectConfig } = get();
      if (!adapter) return;
      const configToSave = config || projectConfig;
      if (!configToSave) return;

      await adapter.writeTextFile('/config.json', JSON.stringify(configToSave, null, 2));
      set({ projectConfig: configToSave });
    },

    getDocViewMode: (docId) => {
      const { activeUser } = get();
      if (!docId || !activeUser) return 'split';
      return activeUser.docViewModes?.[docId] || 'split';
    },

    setDocViewMode: async (docId, mode) => {
      const { activeUser, adapter, users } = get();
      if (!activeUser || !adapter) return;

      const updatedUser: SystemUser = {
        ...activeUser,
        docViewModes: {
          ...activeUser.docViewModes,
          [docId]: mode
        }
      };

      const updatedUsers = users.map(user => user.id === updatedUser.id ? updatedUser : user);
      await adapter.writeTextFile('/users/users.json', JSON.stringify(updatedUsers, null, 2));
      set({ activeUser: updatedUser, users: updatedUsers });
    },

    // Initialize an empty layout project
    createBlankProject: async (name, desc) => {
      const { adapter } = get();
      if (!adapter) return;
      
      const projectId = crypto.randomUUID();
      const meta: ProjectMetadata = {
        id: projectId,
        name,
        description: desc,
        created: Date.now(),
        tags: ['MVP', 'Offline']
      };

      const config: ProjectConfig = {
        projectId,
        projectName: name,
        lastModified: Date.now()
      };

      // Create folder schema
      await adapter.writeTextFile('/config.json', JSON.stringify(config, null, 2));
      await adapter.writeTextFile('/project.json', JSON.stringify(meta, null, 2));
      await adapter.writeTextFile('/users/users.json', JSON.stringify([], null, 2));
      await adapter.writeTextFile('/docs/info.json', JSON.stringify([], null, 2));
      await adapter.writeTextFile('/activity/locks.json', JSON.stringify({}, null, 2));
      await adapter.writeTextFile('/activity/logs.json', JSON.stringify([], null, 2));
      await adapter.writeTextFile('/trash/items.json', JSON.stringify([], null, 2));

      // Standard list creation
      set({
        projectMeta: meta,
        projectConfig: config,
        users: [],
        activeUser: null,
        lists: [],
        tasks: [],
        docs: [],
        locks: {},
        docLocks: {},
        logs: [],
        selectedListId: null,
        selectedTaskId: null,
        selectedDocId: null,
        showDocs: false,
        docsFolder: null,
        docFolders: [],
        showTrash: false,
        trashItems: [],
        showMediaExplorer: false
      });

      // Quick seed a initial list
      await get().createList('Lista General', '#3b82f6');
    },

    // Initialize new project from onboarding wizard
    initializeNewProject: async (projectName, projectDesc, firstUser, useSampleData) => {
      const { adapter } = get();
      if (!adapter) throw new Error('No project adapter available');

      const projectId = crypto.randomUUID();
      const projectMeta: ProjectMetadata = {
        id: projectId,
        name: projectName,
        description: projectDesc,
        created: Date.now(),
        tags: ['Nuevo Proyecto']
      };

      const config: ProjectConfig = {
        projectId,
        projectName: projectName,
        lastModified: Date.now()
      };

      // Create base file structure
      await adapter.writeTextFile('/config.json', JSON.stringify(config, null, 2));
      await adapter.writeTextFile('/project.json', JSON.stringify(projectMeta, null, 2));

      // Save first user as superadmin
      const usersToSave = [firstUser];
      await adapter.writeTextFile('/users/users.json', JSON.stringify(usersToSave, null, 2));
      
      await adapter.writeTextFile('/docs/info.json', JSON.stringify([], null, 2));
      await adapter.writeTextFile('/activity/locks.json', JSON.stringify({}, null, 2));
      await adapter.writeTextFile('/activity/logs.json', JSON.stringify([], null, 2));
      await adapter.writeTextFile('/trash/items.json', JSON.stringify([], null, 2));

      // Use existing loadedProjectId from initial registration (handleSelectVirtual/FSA)
      // Update its name/type instead of creating a duplicate registration
      const existingId = get().loadedProjectId;
      if (existingId) {
        const projects = loadRegisteredProjects();
        const updated = projects.map(p =>
          p.id === existingId ? { ...p, name: projectName } : p
        );
        saveRegisteredProjects(updated);
        set({ registeredProjects: updated, loadedProjectId: existingId });
      } else {
        // Fallback: create new registration (should not happen)
        const { fsMode } = get();
        const registeredId = get().registerProject(projectName, fsMode);
        set({ loadedProjectId: registeredId });
      }

      // Save session for the new project so it shows 'Sesión activa'
      const loadedId = get().loadedProjectId;
      if (loadedId) {
        const sessions = _loadSavedSessions();
        sessions[loadedId] = { username: firstUser.username, savedAt: Date.now() };
        _saveSavedSessions(sessions);
      }

      if (useSampleData) {
        // Seed with sample data (using similar structure to seedSampleProject but adapted)
        await get().seedSampleProjectOnboarding(projectMeta, config, firstUser);
      } else {
        // Initialize blank project with one empty list
        const blankList = await get().createListDirect('Lista General', '#3b82f6');
        
        set({
          projectMeta,
          projectConfig: config,
          users: usersToSave,
          activeUser: firstUser,
          lists: [blankList],
          tasks: [],
          docs: [],
          locks: {},
          docLocks: {},
          logs: [],
          isOnboarding: false,
          selectedListId: blankList.id,
          selectedTaskId: null,
          selectedDocId: null,
          showDocs: false,
          docsFolder: null,
          docFolders: [],
          showTrash: false,
          trashItems: [],
          showMediaExplorer: false
        });
      }
    },

    // Helper to create list without side effects for initialization
    createListDirect: async (name, color): Promise<TaskList> => {
      const listId = crypto.randomUUID();
      const defaultStatuses: TaskStatus[] = [
        { id: 'todo', name: 'Por Hacer', color: '#d1d5db', isCompleted: false },
        { id: 'inprogress', name: 'En Desarrollo', color: '#3b82f6', isCompleted: false },
        { id: 'review', name: 'Revisión', color: '#f59e0b', isCompleted: false },
        { id: 'done', name: 'Listo / Completado', color: '#10b981', isCompleted: true }
      ];

      const newList: TaskList = {
        id: listId,
        name,
        color,
        statuses: defaultStatuses,
        createdAt: Date.now()
      };

      const { adapter } = get();
      if (adapter) {
        await adapter.writeTextFile(`/lists/${listId}.json`, JSON.stringify(newList, null, 2));
      }

      return newList;
    },

    // Seed the demo project (see sampleProject.ts): the first user leads a team of demo teammates
    seedSampleProjectOnboarding: async (projectMeta, config, firstUser) => {
      const { adapter } = get();
      if (!adapter) return;

      const sample = await buildSampleProject(firstUser);
      const meta: ProjectMetadata = { ...projectMeta, tags: sample.tags };

      await adapter.writeTextFile('/config.json', JSON.stringify(config, null, 2));
      await adapter.writeTextFile('/project.json', JSON.stringify(meta, null, 2));
      await adapter.writeTextFile('/users/users.json', JSON.stringify(sample.users, null, 2));
      await adapter.writeTextFile('/docs/info.json', JSON.stringify(sample.docs, null, 2));
      for (const doc of sample.docs) {
        const docPath = doc.folder ? `/docs/${doc.folder}/${doc.filename}` : `/docs/${doc.filename}`;
        await adapter.writeTextFile(docPath, sample.docContents[doc.id]);
      }
      await adapter.writeTextFile('/activity/locks.json', JSON.stringify({}, null, 2));
      await adapter.writeTextFile('/activity/logs.json', JSON.stringify(sample.logs, null, 2));
      await adapter.writeTextFile('/trash/items.json', JSON.stringify(sample.trashItems, null, 2));
      for (const t of sample.tasks) {
        await adapter.writeTextFile(`/tasks/task-${t.id}.json`, JSON.stringify(t, null, 2));
      }
      for (const l of sample.lists) {
        await adapter.writeTextFile(`/lists/${l.id}.json`, JSON.stringify(l, null, 2));
      }

      // Images for the media gallery, the docs and the notes, from the app's public folder
      for (const { from, to } of SAMPLE_MEDIA) {
        try {
          const response = await fetch(from);
          if (response.ok) await adapter.writeBinaryFile(to, await response.blob());
          else console.warn(`Image ${from} not found, skipping`);
        } catch (e) {
          console.warn(`Could not copy public image: ${from}`, e);
        }
      }

      set({
        projectMeta: meta,
        projectConfig: config,
        users: sample.users,
        activeUser: sample.activeUser,
        lists: sample.lists,
        tasks: sample.tasks,
        docs: sample.docs,
        locks: {},
        docLocks: {},
        logs: sample.logs,
        trashItems: sample.trashItems,
        isOnboarding: false,
        selectedListId: sample.lists[0].id,
        selectedTaskId: null,
        selectedDocId: null,
        showDocs: false,
        docsFolder: null,
        docFolders: sample.docFolders,
        showMediaExplorer: false
      });
    },

    // Seed beautiful demo project data for full interaction review out-of-the-box
    // Background interval check to load recent updates from syncing folders
    backgroundReload: async () => {
      const { adapter, isPolling } = get();
      if (!adapter) return;
      // A change announced while a reload is running may not be in what it reads:
      // reload once more when it finishes.
      if (isPolling) {
        reloadAgain = true;
        return;
      }
      reloadAgain = false;
      const startSeq = writeSeq;
      // Parts written by us while this reload was reading keep their local state.
      const fresh = (slice: string) => !((sliceWrites[slice] ?? 0) > startSeq);

      set({ isPolling: true });
      try {
        // Read locks list
        let locks: ProjectLocks = {};
        if (await adapter.fileExists('/activity/locks.json')) {
          const locksRaw = await adapter.readTextFile('/activity/locks.json');
          locks = JSON.parse(locksRaw);
        }

        // Keep active locks only if they haven't expired
        const now = Date.now();
        const cleanedLocks: ProjectLocks = {};
        let locksChanged = false;
        
        for (const [taskId, lockInfo] of Object.entries(locks)) {
          if (lockInfo.expiresAt > now) {
            cleanedLocks[taskId] = lockInfo;
          } else {
            locksChanged = true;
          }
        }
        
        // Expired entries are only dropped in memory. Rewriting locks.json here raced
        // with other users' lock writes and erased them.
        void locksChanged;

        // Refresh the open doc's lock. The documents view also shows who is editing
        // each doc, so there every lock is read.
        const openDocId = get().selectedDocId;
        let docLocks = get().docLocks;
        if (get().showDocs) {
          docLocks = {};
          try {
            for (const file of await adapter.listFiles('/activity/doc-locks')) {
              if (!file.endsWith('.json')) continue;
              const id = file.slice(0, -5);
              const lock = await readDocLockFile(adapter, id);
              if (lock) docLocks[id] = lock;
            }
          } catch {
            // No doc locks folder yet
          }
        } else if (openDocId) {
          const docLock = await readDocLockFile(adapter, openDocId);
          docLocks = { ...docLocks };
          if (docLock) docLocks[openDocId] = docLock;
          else delete docLocks[openDocId];
        }

        // Re-read lists catalog and tasks (in parallel; any failed read skips this round)
        const readAll = async <T,>(folder: string): Promise<T[]> => {
          const files = (await adapter.listFiles(folder)).filter((f) => f.endsWith('.json'));
          return Promise.all(files.map(async (f) => JSON.parse(await adapter.readTextFile(`${folder}/${f}`)) as T));
        };
        const [lists, tasks] = await Promise.all([readAll<TaskList>('/lists'), readAll<Task>('/tasks')]);
        sortListsInPlace(lists);
        tasks.sort((a, b) => a.taskCode.localeCompare(b.taskCode));

        // Re-read doc info
        let docs: DocMetadata[] = [];
        if (await adapter.fileExists('/docs/info.json')) {
          const docsRaw = await adapter.readTextFile('/docs/info.json');
          docs = JSON.parse(docsRaw);
        }

        // Re-read logs
        let logs: TaskActivityLog[] = [];
        if (await adapter.fileExists('/activity/logs.json')) {
          const logsRaw = await adapter.readTextFile('/activity/logs.json');
          logs = JSON.parse(logsRaw);
        }

        // Re-read trash
        let trashItems: TrashItem[] = [];
        if (await adapter.fileExists('/trash/items.json')) {
          const trashRaw = await adapter.readTextFile('/trash/items.json');
          trashItems = JSON.parse(trashRaw);
        }

        // Read users list to see if new user got registered
        let users = get().users;
        if (await adapter.fileExists('/users/users.json')) {
          const uRaw = await adapter.readTextFile('/users/users.json');
          users = JSON.parse(uRaw);
        }

        // Check if current active user is still in the list
        // Comments of the open document
        const commentsDocId = get().selectedDocId;
        let commentsUpdate: Partial<ProjectState> = {};
        if (commentsDocId) {
          const rev = docCommentsRev;
          const threads = await readDocCommentThreads(adapter, commentsDocId);
          if (get().selectedDocId === commentsDocId && rev === docCommentsRev && fresh('comments')) {
            const st = get();
            if (st.docCommentsFor !== commentsDocId || JSON.stringify(threads) !== JSON.stringify(st.docComments)) {
              commentsUpdate = { docComments: threads, docCommentsFor: commentsDocId };
            }
          }
        }

        // We wrote something meanwhile: what was read may predate it. Read again.

        const currentActiveUser = get().activeUser;
        let activeUser = currentActiveUser;
        if (currentActiveUser && !users.find(u => u.id === currentActiveUser.id)) {
          activeUser = null;
        }

        set({
          ...(fresh('lists') ? { lists } : {}),
          ...(fresh('tasks') ? { tasks } : {}),
          ...(fresh('docs') ? { docs } : {}),
          ...(fresh('logs') ? { logs } : {}),
          ...(fresh('locks') ? { locks: cleanedLocks } : {}),
          ...(fresh('docLocks') ? { docLocks } : {}),
          ...(fresh('users') ? { users, activeUser } : {}),
          ...(fresh('trash') ? { trashItems } : {}),
          ...commentsUpdate,
          isPolling: false
        });
      } catch (err) {
        console.warn('Sync background check bypassed/idle', err);
        set({ isPolling: false });
      }
      if (reloadAgain && get().adapter === adapter) void get().backgroundReload();
    },

    // Import a backup ZIP into the currently loaded project, replacing its contents.
    // Works for both local (FSA) and cloud (Firebase) projects since it operates
    // through the shared storage adapter. The caller is responsible for confirming
    // the destructive replace with the user beforehand.
    importBackupZip: async (file) => {
      const { adapter } = get();
      if (!adapter) throw new Error('No hay un proyecto activo para importar el respaldo.');

      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(file);

      // Validate the archive looks like a Kora backup before wiping anything.
      const hasProject = zip.file('project.json') != null;
      if (!hasProject) {
        throw new Error('El archivo ZIP no parece un respaldo válido de Kora (falta project.json).');
      }

      set({ isLoading: true });
      try {
        // 1. Clear existing per-item files (lists, tasks, docs) so removed items
        //    don't linger after the import.
        const clearFolder = async (folder: string) => {
          try {
            const files = await adapter.listFiles(folder);
            for (const f of files) {
              try { await adapter.deleteFile(`${folder}/${f}`); } catch (e) { /* ignore */ }
            }
          } catch (e) { /* folder may not exist */ }
        };
        await clearFolder('/lists');
        await clearFolder('/tasks');
        await clearFolder('/docs');

        // 2. Write every entry from the ZIP back to its canonical path.
        const entries = Object.values(zip.files).filter(e => !e.dir);
        for (const entry of entries) {
          const path = '/' + entry.name.replace(/^\/+/, '');
          const isText = /\.(json|md|txt|markdown)$/i.test(path);
          if (isText) {
            const content = await entry.async('string');
            await adapter.writeTextFile(path, content);
          } else {
            const blob = await entry.async('blob');
            await adapter.writeBinaryFile(path, blob);
          }
        }

        // 3. Preserve this project's own id in config.json so it keeps loading
        //    under the current registration instead of the backup's original id.
        const currentId = get().projectMeta?.id;
        try {
          if (currentId && await adapter.fileExists('/project.json')) {
            const projRaw = await adapter.readTextFile('/project.json');
            const proj = JSON.parse(projRaw) as ProjectMetadata;
            proj.id = currentId;
            await adapter.writeTextFile('/project.json', JSON.stringify(proj, null, 2));

            let cfg: ProjectConfig = { projectId: currentId, projectName: proj.name, lastModified: Date.now() };
            if (await adapter.fileExists('/config.json')) {
              cfg = { ...cfg, ...JSON.parse(await adapter.readTextFile('/config.json')) };
            }
            cfg.projectId = currentId;
            await adapter.writeTextFile('/config.json', JSON.stringify(cfg, null, 2));
          }
        } catch (e) {
          console.warn('Could not reconcile imported project id', e);
        }

        // 4. Re-read everything from the adapter to refresh in-memory state.
        await get().loadFromAdapter(adapter);
      } catch (err) {
        set({ isLoading: false });
        throw err;
      }
    },

    // Register active user
    registerUser: async (username, name, password, avatarColor) => {
      const { adapter, users } = get();
      if (!adapter) throw new Error('No project folder active');

      const normalizedUsername = username.toLowerCase().trim();
      const userExists = users.some(u => u.username === normalizedUsername);
      if (userExists) {
        throw new Error('El nombre de usuario ya está registrado.');
      }

      const salt = crypto.randomUUID().slice(0, 8);
      const passwordHash = await hashPassword(password, salt);

      const newUser: SystemUser = {
        id: crypto.randomUUID(),
        username: normalizedUsername,
        name,
        avatarColor,
        passwordHash,
        salt,
        createdAt: Date.now(),
        docViewModes: {}
      };

      const updatedUsers = [...users, newUser];
      await adapter.writeTextFile('/users/users.json', JSON.stringify(updatedUsers, null, 2));

      // Save session for this project so it shows 'Sesión activa'
      try {
        const loadedProjectId = get().loadedProjectId;
        if (loadedProjectId) {
          const sessions = _loadSavedSessions();
          sessions[loadedProjectId] = { username: newUser.username, savedAt: Date.now() };
          _saveSavedSessions(sessions);
        }
      } catch (e) {}

      set({ users: updatedUsers, activeUser: newUser });
      return newUser;
    },

    // Login user with salt calculation
    loginUser: async (username, password) => {
      const { users, adapter } = get();
      if (!adapter) throw new Error('No folder loaded');
      
      const normalizedUsername = username.toLowerCase().trim();
      const user = users.find(u => u.username === normalizedUsername);
      if (!user) {
        throw new Error('Nombre de usuario no encontrado.');
      }

      const hashToVerify = await hashPassword(password, user.salt);
      if (hashToVerify === user.passwordHash) {
        // Save last opened session in config
        try {
          const configRaw = await adapter.readTextFile('/config.json');
          const config: ProjectConfig = JSON.parse(configRaw);
          config.lastOpenedBy = user.id;
          config.lastModified = Date.now();
          await adapter.writeTextFile('/config.json', JSON.stringify(config, null, 2));
        } catch (e) {}

        set({ activeUser: user });
        return true;
      } else {
        throw new Error('Contraseña incorrecta.');
      }
    },

    logoutUser: () => {
      // Clear per-project saved session
      const { loadedProjectId } = get();
      if (loadedProjectId) {
        const sessions = _loadSavedSessions();
        if (sessions[loadedProjectId]) {
          delete sessions[loadedProjectId];
          _saveSavedSessions(sessions);
        }
      }
      // Also clear old global session key
      try {
        localStorage.removeItem(SAVED_SESSION_KEY);
      } catch (e) {}
      // Go back to project browser so the user sees the project list
      get().goToProjectBrowser();
    },

    closeProject: async () => {
      releaseAdapter(get().adapter);
      // Clear persistence state and stored FSA handle
      localStorage.removeItem(PERSISTENCE_KEY);
      localStorage.removeItem(SAVED_SESSION_KEY);
      clearLastOpenedProjectId();
      await clearDirectoryHandle();
      
      // Clear IndexedDB (legacy virtual data, safe to clean)
      await dbClear();
      
      // Reset all state but keep registered projects (they're persisted separately)
      set({
        adapter: null,
        fsMode: 'FSA_API',
        projectMeta: null,
        projectConfig: null,
        users: [],
        activeUser: null,
        lists: [],
        tasks: [],
        docs: [],
        locks: {},
        docLocks: {},
        logs: [],
        isOnboarding: false,
        selectedListId: null,
        selectedTaskId: null,
        selectedDocId: null,
        showDocs: false,
        docsFolder: null,
        docFolders: [],
        showMediaExplorer: false,
        showTrash: false,
        trashItems: [],
        isLoading: false,
        loadedProjectId: null
      });
    },

    // ─── Multi-Project Browser Methods ─────────────────────────────────────

    registerProject: (name, type, pathHint?) => {
      const projectId = crypto.randomUUID();
      const project: RegisteredProject = { id: projectId, name, type, createdAt: Date.now(), pathHint };
      const projects = [...get().registeredProjects, project];
      saveRegisteredProjects(projects);
      saveLastOpenedProjectId(projectId);
      set({ registeredProjects: projects, loadedProjectId: projectId });
      return projectId;
    },

    // Register a cloud (Firebase) project and persist its public config locally.
    registerFirebaseProject: (name, config, spaceId = 'default') => {
      const projectId = crypto.randomUUID();
      const project: RegisteredProject = {
        id: projectId,
        name,
        type: 'FIREBASE',
        createdAt: Date.now(),
        pathHint: config.projectId,
      };
      const projects = [...get().registeredProjects, project];
      saveRegisteredProjects(projects);
      saveFirebaseConfigForProject(projectId, config, spaceId);
      saveLastOpenedProjectId(projectId);
      set({ registeredProjects: projects, loadedProjectId: projectId });
      return projectId;
    },

    // Register a cloud project on the team's own Cloudflare backend.
    registerCloudflareProject: (name, link) => {
      const projectId = crypto.randomUUID();
      let host = link.url;
      try {
        host = new URL(link.url).host;
      } catch { /* keep as is */ }
      const project: RegisteredProject = {
        id: projectId,
        name,
        type: 'CLOUDFLARE',
        createdAt: Date.now(),
        pathHint: link.spaceId && link.spaceId !== 'default' ? `${host} · ${link.spaceId}` : host,
      };
      const projects = [...get().registeredProjects, project];
      saveRegisteredProjects(projects);
      saveCloudflareLinkForProject(projectId, link);
      saveLastOpenedProjectId(projectId);
      set({ registeredProjects: projects, loadedProjectId: projectId });
      return projectId;
    },

    joinCloudflareInvite: async (invite) => {
      const { testCloudflareConnection } = await import('../lib/cloudflare');
      const link: CloudflareLink = { url: invite.url, token: invite.token, spaceId: invite.spaceId || 'default' };
      // Fails early (and with a friendly message) if the invitation was revoked.
      await testCloudflareConnection(link);
      const existing = get().registeredProjects.find((p) => {
        if (p.type !== 'CLOUDFLARE') return false;
        const l = loadCloudflareLinkForProject(p.id);
        return !!l && l.url === link.url && l.spaceId === link.spaceId;
      });
      let projectId: string;
      if (existing) {
        projectId = existing.id;
        saveCloudflareLinkForProject(projectId, link);
      } else {
        projectId = get().registerCloudflareProject(invite.name?.trim() || 'Proyecto en la nube', link);
      }
      await get().loadProjectById(projectId);
      set({ pendingInvite: null });
    },

    unregisterProject: (projectId) => {
      const projects = get().registeredProjects.filter(p => p.id !== projectId);
      saveRegisteredProjects(projects);
      set({ registeredProjects: projects });

      const sessions = _loadSavedSessions();
      if (sessions[projectId]) {
        delete sessions[projectId];
        _saveSavedSessions(sessions);
      }

      (async () => {
        try {
          await deleteDirectoryHandleByKey('fsa-handle-' + projectId);
        } catch (e) { /* ignore */ }
      })();

      // Clean up any stored backend link for cloud projects.
      deleteFirebaseConfigForProject(projectId);
      deleteCloudflareLinkForProject(projectId);

      // If the unregistered project is the currently loaded one, go back to home
      if (get().loadedProjectId === projectId) {
        get().goToProjectBrowser();
      }
    },

    loadProjectById: async (projectId) => {
      const project = get().registeredProjects.find(p => p.id === projectId);
      if (!project) {
        console.error('Project not found', projectId);
        return;
      }

      set({ loadedProjectId: projectId, isLoading: true });

      try {
        if (project.type === 'FIREBASE') {
          const link = loadFirebaseConfigForProject(projectId);
          if (!link) {
            throw new Error('No se encontró la configuración de Firebase para este proyecto.');
          }
          // Lazy-load the Firebase SDK only when cloud mode is actually used,
          // so local-only users don't pay the bundle cost.
          const { FirebaseAdapter } = await import('../lib/firebase');
          const adapter = new FirebaseAdapter(link.config, link.spaceId);
          // Surface auth/connection errors early with a friendly message.
          await adapter.ready();
          set({ fsMode: 'FSA_API' });
          await get().loadFromAdapter(adapter);
        } else if (project.type === 'CLOUDFLARE') {
          const link = loadCloudflareLinkForProject(projectId);
          if (!link) {
            throw new Error('No se encontró la conexión con el backend de Cloudflare de este proyecto.');
          }
          const { CloudflareAdapter } = await import('../lib/cloudflare');
          const adapter = new CloudflareAdapter(link);
          try {
            await adapter.ready();
          } catch (err) {
            adapter.dispose();
            throw err;
          }
          set({ fsMode: 'FSA_API' });
          await get().loadFromAdapter(adapter);
        } else {
          // Local folder (FSA API)
          const handle = await loadDirectoryHandleByKey('fsa-handle-' + projectId);
          if (!handle) {
            throw new Error('No se pudo recuperar el manejador de la carpeta.');
          }
          const permState = await (handle as any).queryPermission({ mode: 'readwrite' });
          if (permState !== 'granted') {
            throw new Error('Permisos de carpeta perdidos.');
          }
          await get().loadProjectDirectory(handle, 'FSA_API');
        }

        // Save this project as the last opened one for auto-restore on reload
        saveLastOpenedProjectId(projectId);
      } catch (err) {
        console.error('Failed to load project', err);
        set({ adapter: null, isLoading: false, loadedProjectId: null });
        throw err;
      }
    },

    goToProjectBrowser: () => {
      releaseAdapter(get().adapter);
      localStorage.removeItem(PERSISTENCE_KEY);
      clearLastOpenedProjectId();
      clearDirectoryHandle();

      // Re-read registered projects from localStorage to ensure the list is current
      const savedProjects = loadRegisteredProjects();

      set({
        registeredProjects: savedProjects,
        adapter: null,
        fsMode: 'FSA_API',
        projectMeta: null,
        projectConfig: null,
        users: [],
        activeUser: null,
        lists: [],
        tasks: [],
        docs: [],
        locks: {},
        docLocks: {},
        logs: [],
        isOnboarding: false,
        selectedListId: null,
        selectedTaskId: null,
        selectedDocId: null,
        showDocs: false,
        docsFolder: null,
        docFolders: [],
        showMediaExplorer: false,
        showTrash: false,
        trashItems: [],
        isLoading: false,
        loadedProjectId: null
      });
    },

    // Create standard task list
    createList: async (name, color) => {
      const { adapter, lists } = get();
      if (!adapter) throw new Error('Cargar directorio primero');

      const listId = crypto.randomUUID();
      const defaultStatuses: TaskStatus[] = [
        { id: 'todo', name: 'Por Hacer', color: '#d1d5db', isCompleted: false },
        { id: 'inprogress', name: 'En Desarrollo', color: '#3b82f6', isCompleted: false },
        { id: 'review', name: 'Revisión', color: '#f59e0b', isCompleted: false },
        { id: 'done', name: 'Listo / Completado', color: '#10b981', isCompleted: true }
      ];

      const newList: TaskList = {
        id: listId,
        name,
        color,
        statuses: defaultStatuses,
        createdAt: Date.now()
      };

      const updatedLists = [...lists, newList];
      await adapter.writeTextFile(`/lists/${listId}.json`, JSON.stringify(newList, null, 2));
      
      set({ lists: updatedLists, selectedListId: listId });
      return newList;
    },

    // Update list settings, names, and status flow
    reorderLists: async (ids) => {
      const { adapter, lists } = get();
      if (!adapter) return;
      const position = new Map(ids.map((id, i) => [id, i]));
      const changed: TaskList[] = [];
      const updatedLists = sortListsInPlace(lists.map((l) => {
        const order = position.get(l.id);
        if (order === undefined || l.order === order) return l;
        const next = { ...l, order };
        changed.push(next);
        return next;
      }));
      // Shown right away; the files are written after
      set({ lists: updatedLists });
      for (const l of changed) {
        await adapter.writeTextFile(`/lists/${l.id}.json`, JSON.stringify(l, null, 2));
      }
    },

    updateListConfig: async (listId, name, color, statuses) => {
      const { adapter, lists } = get();
      if (!adapter) return;

      const updatedLists = lists.map(l => {
        if (l.id === listId) {
          return { ...l, name, color, statuses };
        }
        return l;
      });

      const listObj = updatedLists.find(l => l.id === listId);
      if (listObj) {
        await adapter.writeTextFile(`/lists/${listId}.json`, JSON.stringify(listObj, null, 2));
      }

      set({ lists: updatedLists });
    },

    // Delete full task list with all its tasks!
    deleteList: async (listId) => {
      const { adapter, lists, tasks } = get();
      if (!adapter) return;

      const updatedLists = lists.filter(l => l.id !== listId);
      
      // Delete task list config file
      await adapter.deleteFile(`/lists/${listId}.json`);

      // Delete tasks that belonged to this list
      const tasksToKeep: Task[] = [];
      for (const t of tasks) {
        if (t.listId === listId) {
          await adapter.deleteFile(`/tasks/task-${t.id}.json`);
        } else {
          tasksToKeep.push(t);
        }
      }

      set({ 
        lists: updatedLists, 
        tasks: tasksToKeep, 
        selectedListId: updatedLists[0]?.id || null,
        selectedTaskId: null 
      });
    },

    // Create individual task structure file
    createTask: async (title, listId, statusId, priority) => {
      const [task] = await get().createTasks([title], listId, statusId, priority);
      if (!task) throw new Error('El título de la tarea está vacío');
      return task;
    },

    // Create one JSON file per task; state and the activity log are updated once.
    createTasks: async (titles, listId, statusId, priority) => {
      const { adapter, tasks, activeUser } = get();
      if (!adapter) throw new Error('Cargar directorio primero');

      const cleanTitles = titles.map(t => t.trim()).filter(Boolean);
      const created: Task[] = [];
      let codeNumber = tasks.length;

      try {
        for (const title of cleanTitles) {
          // Generate next numeric Code for visually pleasing tasks
          codeNumber++;
          const newTaskId = crypto.randomUUID();
          const newTask: Task = {
            id: newTaskId,
            taskCode: `TSK-${String(codeNumber).padStart(3, '0')}`,
            listId,
            title,
            description: '',
            statusId,
            dueDate: '',
            assignees: [],
            priority,
            tags: [],
            dependencies: [],
            subtasks: [],
            lastEditedBy: activeUser?.id,
            lastEditedAt: Date.now()
          };
          await adapter.writeTextFile(`/tasks/task-${newTaskId}.json`, JSON.stringify(newTask, null, 2));
          created.push(newTask);
        }
      } finally {
        // Keep whatever was written, even if a later write failed.
        if (created.length > 0) {
          set({ tasks: [...get().tasks, ...created] });
          if (activeUser) {
            const now = Date.now();
            const newLogs: TaskActivityLog[] = created.map((task, i) => ({
              id: crypto.randomUUID(),
              taskId: task.id,
              userId: activeUser.id,
              username: activeUser.name,
              action: 'creó esta tarea',
              timestamp: now + i
            })).reverse(); // logs are stored newest first
            await updateLogs(adapter, (logs) => [...newLogs, ...logs]);
          }
        }
      }

      return created;
    },

    // Update existing task file and refresh react state
    updateTask: async (task) => {
      const { adapter, tasks, activeUser } = get();
      if (!adapter) return;

      const originalTask = tasks.find(t => t.id === task.id);
      
      const updatedTask: Task = {
        ...task,
        lastEditedBy: activeUser?.id,
        lastEditedAt: Date.now()
      };

      const updatedTasks = tasks.map(t => {
        if (t.id === task.id) return updatedTask;
        return t;
      });

      await adapter.writeTextFile(`/tasks/task-${task.id}.json`, JSON.stringify(updatedTask, null, 2));
      set({ tasks: updatedTasks });

      // Build nice contextual log
      if (originalTask) {
        let changeDesc = '';
        if (originalTask.statusId !== task.statusId) {
          const listObj = get().lists.find(l => l.id === task.listId);
          const oldSt = listObj?.statuses.find(s => s.id === originalTask.statusId)?.name || originalTask.statusId;
          const newSt = listObj?.statuses.find(s => s.id === task.statusId)?.name || task.statusId;
          changeDesc = `cambió el estado de "${oldSt}" a "${newSt}"`;
        } else if (originalTask.priority !== task.priority) {
          changeDesc = `cambió la prioridad de "${originalTask.priority}" a "${task.priority}"`;
        } else if (originalTask.title !== task.title) {
          changeDesc = `cambió el título a "${task.title}"`;
        } else if (originalTask.dueDate !== task.dueDate) {
          changeDesc = `cambió la fecha límite a "${task.dueDate || 'Sin fecha'}"`;
        } else if ((originalTask.effort ?? '') !== (task.effort ?? '')) {
          const effortNames: Record<string, string> = { easy: 'Fácil', casual: 'Casual', moderate: 'Moderado', hard: 'Difícil', epic: 'Épico' };
          changeDesc = task.effort
            ? `cambió el nivel de esfuerzo a "${effortNames[task.effort] ?? task.effort}"`
            : 'quitó el nivel de esfuerzo';
        } else if (originalTask.assignees.length !== task.assignees.length) {
          changeDesc = `actualizó el equipo asignado`;
        } else if (originalTask.description !== task.description) {
          changeDesc = `actualizó la descripción de la tarea`;
        } else {
          changeDesc = `modificó campos de la tarea`;
        }
        await logActivityAction(task.id, changeDesc);
      }
    },

    reorderTasks: async (taskId, statusId, orderedIds) => {
      const { adapter, tasks, activeUser } = get();
      if (!adapter) return;
      const byId = new Map(tasks.map((t) => [t.id, t]));
      const moved = byId.get(taskId);
      const at = orderedIds.indexOf(taskId);
      if (!moved || at < 0) return;

      // Usually only the moved task changes: it takes a position between its new neighbors.
      // The first arrangement of a status (or a gap worn too thin) numbers them all.
      const others = orderedIds.filter((id) => id !== taskId).map((id) => byId.get(id)).filter((t): t is Task => !!t);
      const lo = others[at - 1]?.order;
      const hi = others[at]?.order;
      let order: number | null = null;
      if (others.every((t) => typeof t.order === 'number')) {
        if (lo === undefined && hi === undefined) order = TASK_ORDER_STEP;
        else if (lo === undefined) order = hi! - TASK_ORDER_STEP;
        else if (hi === undefined) order = lo + TASK_ORDER_STEP;
        else if (hi - lo > 1e-6) order = (lo + hi) / 2;
      }

      const statusChanged = moved.statusId !== statusId;
      const movedTask: Task = {
        ...moved,
        statusId,
        order: order ?? (at + 1) * TASK_ORDER_STEP,
        ...(statusChanged ? { lastEditedBy: activeUser?.id, lastEditedAt: Date.now() } : {}),
      };
      const changed: Task[] = [movedTask];
      if (order === null) {
        orderedIds.forEach((id, i) => {
          const t = byId.get(id);
          if (!t || id === taskId || t.order === (i + 1) * TASK_ORDER_STEP) return;
          changed.push({ ...t, order: (i + 1) * TASK_ORDER_STEP });
        });
      }

      // Shown right away; the files are written after
      const changedById = new Map(changed.map((t) => [t.id, t]));
      set({ tasks: get().tasks.map((t) => changedById.get(t.id) ?? t) });
      for (const t of changed) {
        await adapter.writeTextFile(`/tasks/task-${t.id}.json`, JSON.stringify(t, null, 2));
      }

      if (statusChanged) {
        const listObj = get().lists.find((l) => l.id === moved.listId);
        const oldSt = listObj?.statuses.find((s) => s.id === moved.statusId)?.name || moved.statusId;
        const newSt = listObj?.statuses.find((s) => s.id === statusId)?.name || statusId;
        await logActivityAction(taskId, `cambió el estado de "${oldSt}" a "${newSt}"`);
      }
    },

    moveTaskToList: async (taskId, listId) => {
      const { adapter, tasks, lists, activeUser } = get();
      if (!adapter) return;
      const task = tasks.find((t) => t.id === taskId);
      const target = lists.find((l) => l.id === listId);
      if (!task || !target || task.listId === listId || target.statuses.length === 0) return;
      const source = lists.find((l) => l.id === task.listId);
      const statusName = source?.statuses.find((s) => s.id === task.statusId)?.name.trim().toLowerCase();
      const status =
        target.statuses.find((s) => s.id === task.statusId) ??
        target.statuses.find((s) => s.name.trim().toLowerCase() === statusName) ??
        target.statuses[0];

      const { order: _order, ...rest } = task;
      const movedTask: Task = { ...rest, listId, statusId: status.id, lastEditedBy: activeUser?.id, lastEditedAt: Date.now() };
      set({ tasks: get().tasks.map((t) => (t.id === taskId ? movedTask : t)) });
      await adapter.writeTextFile(`/tasks/task-${taskId}.json`, JSON.stringify(movedTask, null, 2));
      await logActivityAction(taskId, `movió la tarea de la lista "${source?.name ?? task.listId}" a "${target.name}"`);
    },

    // Move task to trash instead of permanently deleting
    deleteTask: async (taskId) => {
      const { adapter, tasks, trashItems, activeUser } = get();
      if (!adapter || !activeUser) return;

      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      // Remove dependencies
      const updatedTasks = tasks
        .filter(t => t.id !== taskId)
        .map(t => {
          if (t.dependencies.includes(taskId)) {
            const cleanDep = t.dependencies.filter(id => id !== taskId);
            const revised = { ...t, dependencies: cleanDep };
            adapter.writeTextFile(`/tasks/task-${t.id}.json`, JSON.stringify(revised, null, 2));
            return revised;
          }
          return t;
        });

      // Clear lock references
      const { locks } = get();
      if (locks[taskId]) {
        const cleanedLocks = { ...locks };
        delete cleanedLocks[taskId];
        await adapter.writeTextFile('/activity/locks.json', JSON.stringify(cleanedLocks, null, 2));
        set({ locks: cleanedLocks });
      }

      // Delete file from disk
      await adapter.deleteFile(`/tasks/task-${taskId}.json`);

      // Add to trash
      const trashItem: TrashItem = {
        id: crypto.randomUUID(),
        type: 'task',
        originalData: task,
        deletedAt: Date.now(),
        deletedBy: activeUser.id,
        deletedByName: activeUser.name,
        label: task.title,
        metadata: { taskCode: task.taskCode }
      };

      const updatedTrash = [trashItem, ...trashItems];
      await adapter.writeTextFile('/trash/items.json', JSON.stringify(updatedTrash, null, 2));

      set({ tasks: updatedTasks, trashItems: updatedTrash, selectedTaskId: null });
    },

    // Subtask quick helpers
    addSubtask: async (taskId, title) => {
      const { tasks } = get();
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      const newSub: Subtask = {
        id: crypto.randomUUID(),
        title: title.trim(),
        isCompleted: false,
        createdAt: Date.now()
      };

      const updatedTask = {
        ...task,
        subtasks: [...task.subtasks, newSub]
      };

      await get().updateTask(updatedTask);
      await logActivityAction(taskId, `creó la subtarea "${newSub.title}"`);
    },

    toggleSubtask: async (taskId, subtaskId) => {
      const { tasks } = get();
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      let subTitle = '';
      let isComp = false;

      const updatedSubs = task.subtasks.map(s => {
        if (s.id === subtaskId) {
          subTitle = s.title;
          isComp = !s.isCompleted;
          return { ...s, isCompleted: isComp };
        }
        return s;
      });

      const updatedTask = {
        ...task,
        subtasks: updatedSubs
      };

      await get().updateTask(updatedTask);
      await logActivityAction(taskId, `${isComp ? 'completó' : 'desmarcó'} la subtarea "${subTitle}"`);
    },

    deleteSubtask: async (taskId, subtaskId) => {
      const { tasks } = get();
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      const subObj = task.subtasks.find(s => s.id === subtaskId);
      const updatedSubs = task.subtasks.filter(s => s.id !== subtaskId);
      const updatedTask = {
        ...task,
        subtasks: updatedSubs
      };

      await get().updateTask(updatedTask);
      if (subObj) {
        await logActivityAction(taskId, `eliminó la subtarea "${subObj.title}"`);
      }
    },

    // Documents (Docs in Markdown format)
    createDoc: async (title, content, folder, open = true) => {
      const { adapter, docs, activeUser } = get();
      if (!adapter) throw new Error('No open folder');

      const docId = crypto.randomUUID();
      
      // Sanitize title to make it a valid filename
      let baseFilename = title.trim()
        .replace(/[<>:"/\\|?*]/g, '_')  // Replace invalid file chars with underscores
        .toLowerCase()
        .replace(/\s+/g, '-')          // Replace spaces with dashes
        .replace(/-+/g, '-')           // Replace multiple dashes with single dash
        .replace(/^-+|-+$/g, '');      // Remove leading/trailing dashes
      
      if (!baseFilename) {
        baseFilename = 'untitled';
      }
      
      // Check if filename already exists, append number if necessary
      let filename = `${baseFilename}.md`;
      let counter = 1;
      const existingFilenames = new Set(docs.filter(d => d.folder === (folder || undefined)).map(d => d.filename));
      
      while (existingFilenames.has(filename)) {
        filename = `${baseFilename}-${counter}.md`;
        counter++;
      }

      const newDocMeta: DocMetadata = {
        id: docId,
        title: title.trim(),
        filename,
        folder: folder || undefined,
        editedBy: activeUser?.id,
        editedAt: Date.now(),
        createdAt: Date.now()
      };

      const updatedDocs = [...docs, newDocMeta];

      // Save document md raw content in the appropriate folder
      const docPath = folder ? `/docs/${folder}/${filename}` : `/docs/${filename}`;
      await adapter.writeTextFile(docPath, content);
      
      // Save doc index file info
      await adapter.writeTextFile('/docs/info.json', JSON.stringify(updatedDocs, null, 2));

      set({ docs: updatedDocs });
      if (open) get().setSelectedDoc(docId);
      return newDocMeta;
    },

    getDocContent: async (docId) => {
      const { adapter, docs } = get();
      if (!adapter) return '';
      const doc = docs.find(d => d.id === docId);
      if (!doc) return '';

      try {
        const docPath = doc.folder ? `/docs/${doc.folder}/${doc.filename}` : `/docs/${doc.filename}`;
        return await adapter.readTextFile(docPath);
      } catch (err) {
        console.warn('Doc physical file missing, initializing empty template', err);
        return '';
      }
    },

    saveDocContent: async (docId, title, content) => {
      const { adapter, docs, activeUser } = get();
      if (!adapter) return;

      const oldDoc = docs.find(d => d.id === docId);
      if (!oldDoc) return;

      // Sanitize new title to get new filename
      let baseFilename = title.trim()
        .replace(/[<>:"/\\|?*]/g, '_')
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      if (!baseFilename) {
        baseFilename = 'untitled';
      }

      // Check for existing filenames (within the same folder)
      let newFilename = `${baseFilename}.md`;
      let counter = 1;
      const existingFilenames = new Set(
        docs.filter(d => d.id !== docId && d.folder === oldDoc.folder).map(d => d.filename)
      );
      
      while (existingFilenames.has(newFilename)) {
        newFilename = `${baseFilename}-${counter}.md`;
        counter++;
      }

      const folderPrefix = oldDoc.folder ? `/docs/${oldDoc.folder}` : '/docs';

      // Update metadata
      const updatedDocs = docs.map(d => {
        if (d.id === docId) {
          return {
            ...d,
            title: title.trim(),
            filename: newFilename,
            editedBy: activeUser?.id,
            editedAt: Date.now()
          };
        }
        return d;
      });

      const newDoc = updatedDocs.find(d => d.id === docId);
      if (!newDoc) return;

      // If filename changed, handle renaming the file
      if (oldDoc.filename !== newFilename) {
        // Write new file
        await adapter.writeTextFile(`${folderPrefix}/${newFilename}`, content);
        // Delete old file
        try {
          await adapter.deleteFile(`${folderPrefix}/${oldDoc.filename}`);
        } catch (err) {
          console.warn('Could not delete old file:', err);
        }
      } else {
        // Just update the content without renaming
        await adapter.writeTextFile(`${folderPrefix}/${newDoc.filename}`, content);
      }
      
      // Write Index file catalog
      await adapter.writeTextFile('/docs/info.json', JSON.stringify(updatedDocs, null, 2));

      set({ docs: updatedDocs });
    },

    // Move doc to trash instead of permanently deleting
    deleteDoc: async (docId) => {
      const { adapter, docs, activeUser, trashItems } = get();
      if (!adapter || !activeUser) return;

      const doc = docs.find(d => d.id === docId);
      if (!doc) return;

      const docPath = doc.folder ? `/docs/${doc.folder}/${doc.filename}` : `/docs/${doc.filename}`;

      // Read doc content before deleting so we can restore it later
      let docContent = '';
      try {
        docContent = await adapter.readTextFile(docPath);
      } catch (e) {
        // File might not exist, that's ok
      }

      const updatedDocs = docs.filter(d => d.id !== docId);

      // Remove markdown file
      await adapter.deleteFile(docPath);
      
      // Re-save index Catalog
      await adapter.writeTextFile('/docs/info.json', JSON.stringify(updatedDocs, null, 2));

      const allUsers = get().users;
      const updatedUsers = allUsers.map(user => {
        if (!user.docViewModes || !user.docViewModes[docId]) return user;
        const updatedDocViewModes = { ...user.docViewModes };
        delete updatedDocViewModes[docId];
        return { ...user, docViewModes: updatedDocViewModes };
      });

      if (JSON.stringify(updatedUsers) !== JSON.stringify(allUsers)) {
        await adapter.writeTextFile('/users/users.json', JSON.stringify(updatedUsers, null, 2));
        const activeUserObj = updatedUsers.find(u => u.id === get().activeUser?.id) || null;
        set({ users: updatedUsers, activeUser: activeUserObj });
      }

      // Add to trash with content saved
      const trashItem: TrashItem = {
        id: crypto.randomUUID(),
        type: 'document',
        originalData: { ...doc, content: docContent },
        deletedAt: Date.now(),
        deletedBy: activeUser.id,
        deletedByName: activeUser.name,
        label: doc.title,
        metadata: { docFilename: doc.filename }
      };

      const updatedTrash = [trashItem, ...trashItems];
      await adapter.writeTextFile('/trash/items.json', JSON.stringify(updatedTrash, null, 2));

      const wasOpen = get().selectedDocId === docId;
      set({
        docs: updatedDocs,
        trashItems: updatedTrash,
        ...(wasOpen ? { selectedDocId: null, showDocs: true, docsFolder: doc.folder ?? null } : {}),
      });
    },

    scanDocuments: async () => {
      const { adapter, docs, activeUser } = get();
      if (!adapter) throw new Error('No open folder');
      
      let newDocCount = 0;
      let removedDocCount = 0;

      try {
        // Build a set of existing files (folder + filename combo)
        const existingFiles = new Set(docs.map(d => `${d.folder || ''}/${d.filename}`));

        // Collect all actual files on disk
        const actualFiles = new Set<string>();

        // Scan root /docs/ folder
        const docFilenames = await adapter.listFiles('/docs');
        
        for (const filename of docFilenames) {
          if (filename === 'info.json' || !filename.endsWith('.md')) continue;
          actualFiles.add(`/${filename}`);
          if (existingFiles.has(`/${filename}`)) continue;
          
          const docId = crypto.randomUUID();
          const title = filename.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
          
          const newDocMeta: DocMetadata = {
            id: docId,
            title,
            filename,
            editedBy: activeUser?.id,
            editedAt: Date.now(),
            createdAt: Date.now()
          };
          
          docs.push(newDocMeta);
          newDocCount++;
        }

        // Scan subdirectories
        const subDirs = await adapter.listDirectories('/docs');
        for (const dirName of subDirs) {
          // Skip hidden/system folders
          if (dirName.startsWith('.') || dirName === 'media') continue;
          
          const filesInDir = await adapter.listFiles(`/docs/${dirName}`);
          for (const filename of filesInDir) {
            if (!filename.endsWith('.md')) continue;
            actualFiles.add(`${dirName}/${filename}`);
            if (existingFiles.has(`${dirName}/${filename}`)) continue;
            
            const docId = crypto.randomUUID();
            const title = filename.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
            
            const newDocMeta: DocMetadata = {
              id: docId,
              title,
              filename,
              folder: dirName,
              editedBy: activeUser?.id,
              editedAt: Date.now(),
              createdAt: Date.now()
            };
            
            docs.push(newDocMeta);
            newDocCount++;
          }
        }

        // Remove docs from catalog that no longer exist on disk
        const filteredDocs = docs.filter(d => {
          const key = `${d.folder || ''}/${d.filename}`;
          return actualFiles.has(key);
        });
        removedDocCount = docs.length - filteredDocs.length;
        
        // Save updated catalog
        if (newDocCount > 0 || removedDocCount > 0) {
          await adapter.writeTextFile('/docs/info.json', JSON.stringify(filteredDocs, null, 2));
          set({ docs: [...filteredDocs] });
        }
        
        return newDocCount;
        
      } catch (e) {
        console.warn('Error scanning documents:', e);
        return 0;
      }
    },

    createDocFolder: async (folderName) => {
      const { adapter } = get();
      if (!adapter) throw new Error('No open folder');
      
      // Sanitize folder name
      const sanitized = folderName.trim()
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      if (!sanitized) throw new Error('Nombre de carpeta no válido');
      if ((await get().getDocFolders()).includes(sanitized)) throw new Error(`Ya existe una carpeta llamada "${sanitized}"`);
      
      // Create the folder by writing a placeholder (FSA API creates dirs on path traversal)
      // We write and immediately delete a temp file to ensure the directory is created
      const tempPath = `/docs/${sanitized}/.folder`;
      await adapter.writeTextFile(tempPath, '');
      await get().refreshDocFolders();
    },

    moveDocToFolder: async (docId, folder) => {
      const { adapter, docs } = get();
      if (!adapter) return;

      const doc = docs.find(d => d.id === docId);
      if (!doc) return;

      // Don't move if already in same folder
      if ((doc.folder || null) === folder) return;

      // Check for filename collision in target folder
      const docsInTarget = docs.filter(d => d.id !== docId && (d.folder || null) === folder);
      const existingFilenames = new Set(docsInTarget.map(d => d.filename));
      
      let targetFilename = doc.filename;
      if (existingFilenames.has(targetFilename)) {
        // Add number suffix to avoid collision
        const baseName = targetFilename.replace(/\.md$/i, '');
        let counter = 2;
        while (existingFilenames.has(`${baseName}${counter}.md`)) {
          counter++;
        }
        targetFilename = `${baseName}${counter}.md`;
      }

      const oldPath = doc.folder ? `/docs/${doc.folder}/${doc.filename}` : `/docs/${doc.filename}`;
      const newPath = folder ? `/docs/${folder}/${targetFilename}` : `/docs/${targetFilename}`;

      // Read content, write to new location, delete old
      let content = '';
      try {
        content = await adapter.readTextFile(oldPath);
      } catch (e) {
        console.warn('Could not read doc for move:', e);
        return;
      }

      await adapter.writeTextFile(newPath, content);
      
      try {
        await adapter.deleteFile(oldPath);
      } catch (e) {
        console.warn('Could not delete old file after move:', e);
      }

      // Update metadata
      const updatedDocs = docs.map(d => {
        if (d.id === docId) {
          // A doc just moved has no place in its new folder yet: it goes first in the manual order
          return { ...d, folder: folder || undefined, filename: targetFilename, order: undefined };
        }
        return d;
      });

      await adapter.writeTextFile('/docs/info.json', JSON.stringify(updatedDocs, null, 2));
      set({ docs: updatedDocs });
    },

    reorderDocs: async (ids) => {
      const { adapter, docs } = get();
      if (!adapter) return;
      const position = new Map(ids.map((id, i) => [id, i]));
      const updatedDocs = docs.map(d => (position.has(d.id) ? { ...d, order: position.get(d.id)! } : d));
      // Shown right away; the file is written after
      set({ docs: updatedDocs });
      await adapter.writeTextFile('/docs/info.json', JSON.stringify(updatedDocs, null, 2));
    },

    getDocFolders: async () => {
      const { adapter } = get();
      if (!adapter) return [];
      
      try {
        const dirs = await adapter.listDirectories('/docs');
        // Filter out system/hidden folders
        return dirs.filter(d => !d.startsWith('.') && d !== 'media');
      } catch (e) {
        return [];
      }
    },

    docFolders: [],
    refreshDocFolders: async () => {
      const folders = await get().getDocFolders();
      const current = get().docFolders;
      if (folders.length !== current.length || folders.some((f, i) => f !== current[i])) set({ docFolders: folders });
    },

    renameDocFolder: async (oldName, newName) => {
      const { adapter, docs } = get();
      if (!adapter) return;

      // Sanitize new name
      const sanitized = newName.trim()
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      if (!sanitized || sanitized === oldName) return;
      if ((await get().getDocFolders()).includes(sanitized)) throw new Error(`Ya existe una carpeta llamada "${sanitized}"`);

      // Move all files from old folder to new folder
      const docsInFolder = docs.filter(d => d.folder === oldName);
      for (const doc of docsInFolder) {
        try {
          const content = await adapter.readTextFile(`/docs/${oldName}/${doc.filename}`);
          await adapter.writeTextFile(`/docs/${sanitized}/${doc.filename}`, content);
        } catch (e) {
          console.warn(`Could not move ${doc.filename} to new folder:`, e);
        }
      }

      // Delete old folder entirely
      try {
        await adapter.deleteDirectory(`/docs/${oldName}`);
      } catch (e) {
        console.warn('Could not delete old folder:', e);
      }

      // Update metadata
      const updatedDocs = docs.map(d => {
        if (d.folder === oldName) {
          return { ...d, folder: sanitized };
        }
        return d;
      });

      // An empty folder has no docs to recreate it
      if (docsInFolder.length === 0) await adapter.writeTextFile(`/docs/${sanitized}/.folder`, '');

      await adapter.writeTextFile('/docs/info.json', JSON.stringify(updatedDocs, null, 2));
      set({ docs: updatedDocs, docsFolder: get().docsFolder === oldName ? sanitized : get().docsFolder });
      await get().refreshDocFolders();
      return sanitized;
    },

    deleteDocFolder: async (folderName) => {
      const { adapter, docs } = get();
      if (!adapter) return;

      // Move all docs in this folder to root (remove their folder assignment)
      const docsInFolder = docs.filter(d => d.folder === folderName);
      for (const doc of docsInFolder) {
        try {
          const content = await adapter.readTextFile(`/docs/${folderName}/${doc.filename}`);
          await adapter.writeTextFile(`/docs/${doc.filename}`, content);
        } catch (e) {
          console.warn(`Could not move ${doc.filename} out of folder:`, e);
        }
      }

      // Delete the folder directory
      try {
        await adapter.deleteDirectory(`/docs/${folderName}`);
      } catch (e) {
        console.warn('Could not delete folder:', e);
      }

      // Update metadata: remove folder reference from all docs that were in it
      const updatedDocs = docs.map(d => {
        if (d.folder === folderName) {
          const { folder, ...rest } = d;
          return rest as DocMetadata;
        }
        return d;
      });

      await adapter.writeTextFile('/docs/info.json', JSON.stringify(updatedDocs, null, 2));
      set({ docs: updatedDocs, docsFolder: get().docsFolder === folderName ? null : get().docsFolder });
      await get().refreshDocFolders();
    },

    renameDocFile: async (docId, newFilename) => {
      const { adapter, docs } = get();
      if (!adapter) return;

      const doc = docs.find(d => d.id === docId);
      if (!doc) return;

      // Sanitize and ensure .md extension
      let sanitized = newFilename.trim()
        .replace(/[<>:"/\\|?*]/g, '_')
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      if (!sanitized) return;
      if (!sanitized.endsWith('.md')) sanitized += '.md';
      if (sanitized === doc.filename) return;

      // Check for collision within same folder
      const docsInSameFolder = docs.filter(d => d.id !== docId && (d.folder || null) === (doc.folder || null));
      const existingFilenames = new Set(docsInSameFolder.map(d => d.filename));
      
      if (existingFilenames.has(sanitized)) {
        const baseName = sanitized.replace(/\.md$/i, '');
        let counter = 2;
        while (existingFilenames.has(`${baseName}${counter}.md`)) {
          counter++;
        }
        sanitized = `${baseName}${counter}.md`;
      }

      const folderPrefix = doc.folder ? `/docs/${doc.folder}` : '/docs';
      const oldPath = `${folderPrefix}/${doc.filename}`;
      const newPath = `${folderPrefix}/${sanitized}`;

      // Read, write new, delete old
      try {
        const content = await adapter.readTextFile(oldPath);
        await adapter.writeTextFile(newPath, content);
        await adapter.deleteFile(oldPath);
      } catch (e) {
        console.warn('Could not rename doc file:', e);
        return;
      }

      // Update metadata
      const updatedDocs = docs.map(d => {
        if (d.id === docId) {
          return { ...d, filename: sanitized };
        }
        return d;
      });

      await adapter.writeTextFile('/docs/info.json', JSON.stringify(updatedDocs, null, 2));
      set({ docs: updatedDocs });
    },

    // File locks system for single folder syncing multi-user environments
    lockTask: async (taskId) => {
      const { adapter, activeUser } = get();
      if (!adapter || !activeUser) return false;

      // Periodically refresh the lock file
      try {
        let locks: ProjectLocks = {};
        if (await adapter.fileExists('/activity/locks.json')) {
          const locksRaw = await adapter.readTextFile('/activity/locks.json');
          locks = JSON.parse(locksRaw);
        }

        const now = Date.now();
        const activeLock = locks[taskId];

        if (activeLock && activeLock.userId !== activeUser.id && activeLock.expiresAt > now) {
          // Locked by someone else! Tell user they can't edit
          // Sync state
          set({ locks });
          return false;
        }

        // We can safely acquire or renew the lock!
        locks[taskId] = {
          userId: activeUser.id,
          username: activeUser.name,
          expiresAt: now + 15000 // locked for next 15 seconds
        };

        await adapter.writeTextFile('/activity/locks.json', JSON.stringify(locks, null, 2));
        set({ locks });
        return true;
      } catch (err) {
        console.warn('Silent locking failure during sync write', err);
        return true; // Bypass on transient issues to stay offline functional
      }
    },

    unlockTask: async (taskId) => {
      const { adapter, activeUser, locks } = get();
      if (!adapter || !activeUser) return;

      try {
        if (!locks[taskId] || locks[taskId].userId !== activeUser.id) {
          return; // Not locked by us
        }

        let freshLocks: ProjectLocks = {};
        if (await adapter.fileExists('/activity/locks.json')) {
          const locksRaw = await adapter.readTextFile('/activity/locks.json');
          freshLocks = JSON.parse(locksRaw);
        }

        if (freshLocks[taskId] && freshLocks[taskId].userId === activeUser.id) {
          delete freshLocks[taskId];
          await adapter.writeTextFile('/activity/locks.json', JSON.stringify(freshLocks, null, 2));
          set({ locks: freshLocks });
        }
      } catch (e) {
        console.warn('Unlock bypass', e);
      }
    },

    lockDoc: async (docId, session, claimLive, collab = false, takeOverShared = false) => {
      const { adapter, activeUser } = get();
      if (!adapter || !activeUser) return false;

      try {
        const existing = await readDocLockFile(adapter, docId);
        let replaces = existing?.replaces;

        if (existing && existing.session !== session) {
          // Same user in another tab/session: take it over, as before. Collaborative
          // sessions share the doc, so they just take turns refreshing the lock.
          if (existing.userId !== activeUser.id && !(collab && existing.collab) && !(takeOverShared && existing.collab)) {
            const alive = isDocLockAlive(docId, existing);
            const wroteBlindOverOurs = claimLive && existing.replaces !== session;
            if (alive && !wroteBlindOverOurs) {
              set((st) => ({ docLocks: { ...st.docLocks, [docId]: existing } }));
              return false;
            }
          }
          replaces = existing.session;
        }

        const lock: TaskLock = {
          userId: activeUser.id,
          username: activeUser.name,
          expiresAt: Date.now() + DOC_LOCK_TTL,
          session,
          ...(replaces ? { replaces } : {}),
          ...(collab ? { collab: true } : {}),
        };
        await adapter.writeTextFile(docLockPath(docId), JSON.stringify(lock, null, 2));
        set((st) => ({ docLocks: { ...st.docLocks, [docId]: lock } }));
        return true;
      } catch (err) {
        // Not a claim: counting a failed write as ours could later "reclaim" a live
        // lock from its real holder. Without a known holder the doc stays editable.
        console.warn('Silent doc locking failure', err);
        return false;
      }
    },

    unlockDoc: async (docId) => {
      const { adapter, activeUser } = get();
      if (!adapter || !activeUser) return;

      try {
        const existing = await readDocLockFile(adapter, docId);
        if (existing && existing.userId === activeUser.id) {
          await adapter.deleteFile(docLockPath(docId));
          set((st) => {
            const docLocks = { ...st.docLocks };
            delete docLocks[docId];
            return { docLocks };
          });
        }
      } catch (e) {
        console.warn('Doc unlock bypass', e);
      }
    },

    readDocLock: async (docId) => {
      const { adapter } = get();
      if (!adapter) return null;
      const lock = await readDocLockFile(adapter, docId);
      set((st) => {
        const docLocks = { ...st.docLocks };
        if (lock) docLocks[docId] = lock;
        else delete docLocks[docId];
        return { docLocks };
      });
      return lock;
    },

    // ─── Document comments ─────────────────────────────────────────────────────
    // Each thread is its own file, and every change re-reads it first, so people
    // commenting on the same document at once don't overwrite each other.

    loadDocComments: async (docId) => {
      const { adapter } = get();
      if (!adapter) return;
      const rev = docCommentsRev;
      const threads = await readDocCommentThreads(adapter, docId);
      // Only if that document is still the open one, and nothing changed meanwhile.
      if (get().selectedDocId === docId && rev === docCommentsRev) set({ docComments: threads, docCommentsFor: docId });
    },

    addDocCommentThread: async (docId, anchor, text) => {
      const { adapter, activeUser } = get();
      if (!adapter || !activeUser) throw new Error('Sin proyecto abierto');
      const now = Date.now();
      const thread: DocCommentThread = {
        id: crypto.randomUUID(),
        docId,
        anchor,
        createdAt: now,
        createdBy: activeUser.id,
        updatedAt: now,
        resolved: null,
        comments: [{ id: crypto.randomUUID(), userId: activeUser.id, userName: activeUser.name, text: text.trim(), createdAt: now }],
      };
      docCommentsRev++;
      await adapter.writeTextFile(docCommentPath(docId, thread.id), JSON.stringify(thread, null, 2));
      if (get().docCommentsFor === docId) set((st) => ({ docComments: [...st.docComments, thread] }));
      return thread;
    },

    replyDocComment: async (threadId, text) => {
      const { activeUser } = get();
      if (!activeUser) return;
      await mutateDocThread(threadId, (t) => ({
        ...t,
        comments: [...t.comments, { id: crypto.randomUUID(), userId: activeUser.id, userName: activeUser.name, text: text.trim(), createdAt: Date.now() }],
      }));
    },

    editDocComment: async (threadId, commentId, text) => {
      await mutateDocThread(threadId, (t) => ({
        ...t,
        comments: t.comments.map((c) => (c.id === commentId ? { ...c, text: text.trim(), editedAt: Date.now() } : c)),
      }));
    },

    deleteDocComment: async (threadId, commentId) => {
      await mutateDocThread(threadId, (t) => {
        const comments = t.comments.filter((c) => c.id !== commentId);
        return comments.length ? { ...t, comments } : null;
      });
    },

    deleteDocCommentThread: async (threadId) => {
      await mutateDocThread(threadId, () => null);
    },

    setDocCommentResolved: async (threadId, resolved) => {
      const { activeUser } = get();
      if (!activeUser) return;
      await mutateDocThread(threadId, (t) => ({
        ...t,
        resolved: resolved ? { userId: activeUser.id, userName: activeUser.name, at: Date.now() } : null,
      }));
    },

    updateDocCommentAnchors: async (updates) => {
      for (const u of updates) {
        await mutateDocThread(u.id, (t) => ({ ...t, anchor: u.anchor }), false);
      }
    },

    addComment: async (taskId, commentText, attachments) => {
      await logActivityAction(taskId, 'comentó', commentText, attachments);
    },

    editComment: async (logId, newText) => {
      const { adapter } = get();
      if (!adapter) return;
      await updateLogs(adapter, (logs) => logs.map(log => {
        if (log.id === logId && log.comment) {
          return { ...log, comment: { ...log.comment, text: newText } };
        }
        return log;
      }));
    },

    deleteComment: async (logId) => {
      const { adapter } = get();
      if (!adapter) return;
      await updateLogs(adapter, (logs) => logs.filter(log => log.id !== logId));
    },

    // Mark a note as read with debounce to avoid excessive disk writes on hover
    markNoteAsRead: (() => {
      let pendingIds: Set<string> = new Set();
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;

      const flush = async () => {
        const { adapter, activeUser, users } = get();
        if (!adapter || !activeUser || pendingIds.size === 0) {
          pendingIds = new Set();
          return;
        }

        const idsToFlush = pendingIds;
        pendingIds = new Set();

        const updatedReadNotes = { ...(activeUser.readNotes || {}) };
        let hasNew = false;
        idsToFlush.forEach(id => {
          if (!updatedReadNotes[id]) {
            updatedReadNotes[id] = Date.now();
            hasNew = true;
          }
        });

        if (!hasNew) return;

        const updatedUser: SystemUser = {
          ...activeUser,
          readNotes: updatedReadNotes
        };

        const updatedUsers = users.map(u =>
          u.id === updatedUser.id ? updatedUser : u
        );

        await adapter.writeTextFile(
          '/users/users.json',
          JSON.stringify(updatedUsers, null, 2)
        );

        set({ activeUser: updatedUser, users: updatedUsers });
      };

      return async (logId: string) => {
        const { activeUser } = get();
        if (!activeUser) return;

        // Skip if already marked as read
        if (activeUser.readNotes?.[logId]) return;

        pendingIds.add(logId);

        // Debounce: reset timer on each call, flush after 2s of inactivity
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(flush, 2000);
      };
    })(),

    // Handle user attachment uploaded local files
    // Saves them directly into attachments/images/ or attachments/videos/ inside their local project workspace!
    uploadAttachment: async (file: File) => {
      const { adapter } = get();
      if (!adapter) throw new Error('Cargar directorio primero');

      const isVideo = file.type.startsWith('video/');
      const subFolder = isVideo ? '/attachments/videos/' : '/attachments/images/';
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const uniqueFileName = `${Date.now()}_${cleanFileName}`;
      const relativePath = `${subFolder}${uniqueFileName}`;

      // Write binary file blob content
      await adapter.writeBinaryFile(relativePath, file);

      return {
        path: relativePath,
        name: file.name
      };
    },

    // Resolves attachment local paths (e.g. /attachments/images/foo.png) to a browser renderable URL
    resolveAttachmentUrl: async (filePath: string) => {
      const { adapter } = get();
      if (!adapter) return '';
      try {
        const fileBlob = await adapter.readBinaryFile(filePath);
        // Create client memory Object URL
        return URL.createObjectURL(fileBlob);
      } catch (e) {
        console.warn(`Could not resolve binary file URL for: ${filePath}`, e);
        return '';
      }
    },

    // ─── Trash System Methods ─────────────────────────────────────────────────

    setShowTrash: (show) => {
      const state = get();
      if (show && state.docHasUnsavedChanges && state.selectedDocId) {
        set({
          pendingNavigationAction: () => {
            const currentState = get();
            if (currentState.selectedDocId) get().unlockDoc(currentState.selectedDocId);
            set({ showTrash: show, selectedListId: null, selectedTaskId: null, selectedDocId: null, showMediaExplorer: false, showProjectSettings: false, showAbout: false, showDocs: false, sidebarOpen: false });
          }
        });
        return;
      }
      set({ showTrash: show, selectedListId: null, selectedTaskId: null, selectedDocId: null, showMediaExplorer: false, showProjectSettings: false, showAbout: false, showDocs: false, sidebarOpen: false });
    },

    deleteMediaFile: async (path: string, name: string, mediaType: 'image' | 'video') => {
      const { adapter, trashItems, activeUser } = get();
      if (!adapter || !activeUser) return;

      // Move the file to /trash/media/ instead of embedding binary in JSON
      let trashFilePath: string | null = null;
      try {
        const blob = await adapter.readBinaryFile(path);
        const trashFilename = `${Date.now()}_${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        trashFilePath = `/trash/media/${trashFilename}`;
        await adapter.writeBinaryFile(trashFilePath, blob);
      } catch (e) {
        console.warn(`Could not read binary file for trash: ${path}`, e);
      }

      // Delete the actual file from its original location
      await adapter.deleteFile(path);

      // Add to trash with reference to the moved file
      const trashItem: TrashItem = {
        id: crypto.randomUUID(),
        type: 'media',
        originalData: { path, name, mediaType, trashFilePath },
        originalPath: path,
        deletedAt: Date.now(),
        deletedBy: activeUser.id,
        deletedByName: activeUser.name,
        label: name,
        metadata: { mediaType }
      };

      const updatedTrash = [trashItem, ...trashItems];
      await adapter.writeTextFile('/trash/items.json', JSON.stringify(updatedTrash, null, 2));
      set({ trashItems: updatedTrash });
    },

    restoreFromTrash: async (trashItemId) => {
      const { adapter, trashItems, tasks, docs } = get();
      if (!adapter) return;

      const item = trashItems.find(t => t.id === trashItemId);
      if (!item) return;

      const updatedTrash = trashItems.filter(t => t.id !== trashItemId);

      switch (item.type) {
        case 'task': {
          const task = item.originalData as Task;
          // Restore task file
          await adapter.writeTextFile(`/tasks/task-${task.id}.json`, JSON.stringify(task, null, 2));
          // Add back to tasks state
          const updatedTasks = [...tasks, task].sort((a, b) => a.taskCode.localeCompare(b.taskCode));
          set({ tasks: updatedTasks });
          break;
        }
        case 'document': {
          const { content: docContent, ...docMeta } = item.originalData as any;
          // Restore doc metadata to catalog (without the content property)
          const updatedDocs = [...docs, docMeta as DocMetadata];
          await adapter.writeTextFile('/docs/info.json', JSON.stringify(updatedDocs, null, 2));
          // Restore the actual .md file content if available
          if (docContent) {
            const docPath = docMeta.folder ? `/docs/${docMeta.folder}/${docMeta.filename}` : `/docs/${docMeta.filename}`;
            await adapter.writeTextFile(docPath, docContent);
          }
          set({ docs: updatedDocs });
          break;
        }
        case 'media': {
          const mediaData = item.originalData as { path: string; name: string; mediaType: string; trashFilePath?: string | null };
          if (mediaData.trashFilePath) {
            try {
              const blob = await adapter.readBinaryFile(mediaData.trashFilePath);
              await adapter.writeBinaryFile(mediaData.path, blob);
              // Clean up the trash file after successful restore
              await adapter.deleteFile(mediaData.trashFilePath);
            } catch (e) {
              console.warn(`Could not restore media file from trash: ${mediaData.trashFilePath}`, e);
            }
          }
          break;
        }
      }

      await adapter.writeTextFile('/trash/items.json', JSON.stringify(updatedTrash, null, 2));
      set({ trashItems: updatedTrash });
    },

    permanentDeleteItem: async (trashItemId) => {
      const { adapter, trashItems } = get();
      if (!adapter) return;

      const item = trashItems.find(t => t.id === trashItemId);

      // A document deleted for good takes its comments with it.
      if (item?.type === 'document' && item.originalData?.id) {
        try { await adapter.deleteDirectory(docCommentsFolder(item.originalData.id)); } catch { /* no comments */ }
      }

      // If it's a media item with a trash file, delete the trash file too
      if (item?.type === 'media') {
        const mediaData = item.originalData as { trashFilePath?: string | null };
        if (mediaData.trashFilePath) {
          try {
            await adapter.deleteFile(mediaData.trashFilePath);
          } catch (e) {
            console.warn(`Could not delete trash media file: ${mediaData.trashFilePath}`, e);
          }
        }
      }

      const updatedTrash = trashItems.filter(t => t.id !== trashItemId);
      await adapter.writeTextFile('/trash/items.json', JSON.stringify(updatedTrash, null, 2));
      set({ trashItems: updatedTrash });
    },

    emptyTrash: async () => {
      const { adapter, trashItems } = get();
      if (!adapter) return;

      // Delete all trash media files (and the comments of the documents)
      for (const item of trashItems) {
        if (item.type === 'document' && item.originalData?.id) {
          try { await adapter.deleteDirectory(docCommentsFolder(item.originalData.id)); } catch { /* no comments */ }
        }
        if (item.type === 'media') {
          const mediaData = item.originalData as { trashFilePath?: string | null };
          if (mediaData.trashFilePath) {
            try {
              await adapter.deleteFile(mediaData.trashFilePath);
            } catch (e) {
              console.warn(`Could not delete trash media file: ${mediaData.trashFilePath}`, e);
            }
          }
        }
      }

      await adapter.writeTextFile('/trash/items.json', JSON.stringify([], null, 2));
      set({ trashItems: [] });
    },

    // Navigation and quick search parameters
    setShowMediaExplorer: (show) => {
      const state = get();
      if (show && state.docHasUnsavedChanges && state.selectedDocId) {
        set({
          pendingNavigationAction: () => {
            const currentState = get();
            if (currentState.selectedDocId) get().unlockDoc(currentState.selectedDocId);
            set({ showMediaExplorer: show, selectedListId: null, selectedTaskId: null, selectedDocId: null, showTrash: false, showProjectSettings: false, showAbout: false, showDocs: false, sidebarOpen: false });
          }
        });
        return;
      }
      set({ showMediaExplorer: show, selectedListId: null, selectedTaskId: null, selectedDocId: null, showTrash: false, showProjectSettings: false, showAbout: false, showDocs: false, sidebarOpen: false });
    },
    setSelectedList: (listId) => {
      const state = get();
      if (state.docHasUnsavedChanges && state.selectedDocId) {
        set({
          pendingNavigationAction: () => {
            const currentState = get();
            if (currentState.selectedDocId) get().unlockDoc(currentState.selectedDocId);
            set({ selectedListId: listId, selectedTaskId: null, selectedDocId: null, showTrash: false, showMediaExplorer: false, showProjectSettings: false, showAbout: false, showDocs: false, sidebarOpen: false });
          }
        });
        return;
      }
      set({ selectedListId: listId, selectedTaskId: null, selectedDocId: null, showTrash: false, showMediaExplorer: false, showProjectSettings: false, showAbout: false, showDocs: false, sidebarOpen: false });
    },
    setSelectedTask: (taskId) => {
      const prevTaskId = get().selectedTaskId;
      if (prevTaskId && prevTaskId !== taskId) {
        get().unlockTask(prevTaskId);
      }
      // The task opens in a column beside the open view; an open document stays open
      // (e.g. one referenced from the task).
      set({ selectedTaskId: taskId, showTrash: false });
    },
    setFsMode: (mode) => set({ fsMode: mode }),
    setDocHasUnsavedChanges: (has) => set({ docHasUnsavedChanges: has }),

    confirmPendingNavigation: () => {
      const action = get().pendingNavigationAction;
      if (action) action();
      set({ pendingNavigationAction: null, docHasUnsavedChanges: false });
    },

    cancelPendingNavigation: () => {
      set({ pendingNavigationAction: null });
    },

    setSelectedDoc: (docId) => {
      const state = get();
      // The documents view reopens on the folder of the last doc opened
      const docsFolderOf = (id: string | null) => {
        const doc = id ? get().docs.find(d => d.id === id) : undefined;
        return doc ? { docsFolder: doc.folder ?? null } : {};
      };
      const prevDocId = state.selectedDocId;

      // If there are unsaved changes and navigating to a different doc, intercept
      if (state.docHasUnsavedChanges && prevDocId && prevDocId !== docId) {
        set({
          pendingNavigationAction: () => {
            if (prevDocId && prevDocId !== docId) get().unlockDoc(prevDocId);
            set({ selectedDocId: docId, selectedTaskId: null, showTrash: false, showMediaExplorer: false, showProjectSettings: false, showAbout: false, showDocs: false, ...docsFolderOf(docId), sidebarOpen: false });
          }
        });
        return;
      }

      if (prevDocId && prevDocId !== docId) {
        get().unlockDoc(prevDocId);
      }
      set({ selectedDocId: docId, selectedTaskId: null, showTrash: false, showMediaExplorer: false, showProjectSettings: false, showAbout: false, showDocs: false, ...docsFolderOf(docId), sidebarOpen: false });
    },
    setSearchQuery: (query) => set({ searchQuery: query }),
    setSearchOpen: (isOpen) => set({ isSearchOpen: isOpen }),

    // Project settings view
    showProjectSettings: false,
    setShowProjectSettings: (show) => {
      const state = get();
      if (show && state.docHasUnsavedChanges && state.selectedDocId) {
        set({
          pendingNavigationAction: () => {
            const currentState = get();
            if (currentState.selectedDocId) get().unlockDoc(currentState.selectedDocId);
            set({ showProjectSettings: show, selectedListId: show ? null : get().selectedListId, selectedDocId: null, selectedTaskId: null, showTrash: false, showMediaExplorer: false, showAbout: false, showDocs: false, sidebarOpen: false });
          }
        });
        return;
      }
      set({ showProjectSettings: show, selectedListId: show ? null : get().selectedListId, selectedDocId: null, selectedTaskId: null, showTrash: false, showMediaExplorer: false, showAbout: false, showDocs: false, sidebarOpen: false });
    },

    // Project Administration
    updateProjectMeta: async (name, description) => {
      const { adapter, projectMeta } = get();
      if (!adapter || !projectMeta) return;
      const updated: ProjectMetadata = { ...projectMeta, name, description };
      await adapter.writeTextFile('/project.json', JSON.stringify(updated, null, 2));
      set({ projectMeta: updated });
      document.title = `${name} — Kora`;
    },

    updateUser: async (userId, updates) => {
      const { adapter, users, activeUser } = get();
      if (!adapter) return;
      const updatedUsers = users.map(u => {
        if (u.id !== userId) return u;
        return {
          ...u,
          ...(updates.name !== undefined ? { name: updates.name } : {}),
          ...(updates.isSuperAdmin !== undefined ? { isSuperAdmin: updates.isSuperAdmin } : {}),
          ...(updates.avatarColor !== undefined ? { avatarColor: updates.avatarColor } : {})
        };
      });
      await adapter.writeTextFile('/users/users.json', JSON.stringify(updatedUsers, null, 2));
      // Update activeUser if it was the one modified
      const updatedActive = activeUser && activeUser.id === userId 
        ? updatedUsers.find(u => u.id === userId) || activeUser 
        : activeUser;
      set({ users: updatedUsers, activeUser: updatedActive });
    },

    deleteUser: async (userId) => {
      const { adapter, users, activeUser } = get();
      if (!adapter) return;
      if (activeUser?.id === userId) throw new Error('No puedes eliminar tu propio usuario.');
      const updatedUsers = users.filter(u => u.id !== userId);
      await adapter.writeTextFile('/users/users.json', JSON.stringify(updatedUsers, null, 2));
      set({ users: updatedUsers });
    },

    // About view
    showAbout: false,
    setShowAbout: (show) => {
      const state = get();
      if (show && state.docHasUnsavedChanges && state.selectedDocId) {
        set({
          pendingNavigationAction: () => {
            const currentState = get();
            if (currentState.selectedDocId) get().unlockDoc(currentState.selectedDocId);
            set({ showAbout: show, selectedListId: show ? null : get().selectedListId, selectedDocId: null, selectedTaskId: null, showTrash: false, showMediaExplorer: false, showProjectSettings: false, showDocs: false, sidebarOpen: false });
          }
        });
        return;
      }
      set({ showAbout: show, selectedListId: show ? null : get().selectedListId, selectedDocId: null, selectedTaskId: null, showTrash: false, showMediaExplorer: false, showProjectSettings: false, showDocs: false, sidebarOpen: false });
    },

    // Documents view
    showDocs: false,
    docsFolder: null,
    setShowDocs: (show, folder) => {
      const state = get();
      const next = {
        showDocs: show,
        ...(folder !== undefined ? { docsFolder: folder } : {}),
        selectedListId: null,
        selectedDocId: null,
        selectedTaskId: null,
        showTrash: false,
        showMediaExplorer: false,
        showProjectSettings: false,
        showAbout: false,
        sidebarOpen: false,
      };
      if (show && state.docHasUnsavedChanges && state.selectedDocId) {
        set({
          pendingNavigationAction: () => {
            const currentState = get();
            if (currentState.selectedDocId) get().unlockDoc(currentState.selectedDocId);
            set(next);
          }
        });
        return;
      }
      if (state.selectedDocId) get().unlockDoc(state.selectedDocId);
      set(next);
    },

    // Mobile sidebar
    sidebarOpen: false,
    setSidebarOpen: (open) => set({ sidebarOpen: open })
  };
});
