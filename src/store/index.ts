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
  RegisteredProject
} from '../types';
import { FileSystemAdapter, FsMode, normalizePath, saveDirectoryHandle, loadDirectoryHandle, clearDirectoryHandle, saveDirectoryHandleWithKey, loadDirectoryHandleByKey, deleteDirectoryHandleByKey, dbClear } from '../lib/fs';
import { hashPassword } from '../lib/crypto';

interface ProjectState {
  // Engines
  adapter: FileSystemAdapter | null;
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
  initialize: () => Promise<void>;
  createBlankProject: (name: string, desc: string) => Promise<void>;

  initializeNewProject: (projectName: string, projectDesc: string, firstUser: SystemUser, useSampleData: boolean) => Promise<void>;
  createListDirect: (name: string, color: string) => Promise<TaskList>;
  seedSampleProjectOnboarding: (projectMeta: ProjectMetadata, config: ProjectConfig, firstUser: SystemUser) => Promise<void>;
  backgroundReload: () => Promise<void>;
  
  // User Authentication
  registerUser: (username: string, name: string, password: string, avatarColor: string) => Promise<SystemUser>;
  loginUser: (username: string, password: string) => Promise<boolean>;
  logoutUser: () => void;
  closeProject: () => void;
  
  // Lists Management
  createList: (name: string, color: string) => Promise<TaskList>;
  updateListConfig: (listId: string, name: string, color: string, statuses: TaskStatus[]) => Promise<void>;
  deleteList: (listId: string) => Promise<void>;
  
  // Tasks Management
  createTask: (title: string, listId: string, statusId: string, priority: Task['priority']) => Promise<Task>;
  updateTask: (task: Task) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  
  // Subtasks
  addSubtask: (taskId: string, title: string) => Promise<void>;
  toggleSubtask: (taskId: string, subtaskId: string) => Promise<void>;
  deleteSubtask: (taskId: string, subtaskId: string) => Promise<void>;
  
  // Markdown Documents
  createDoc: (title: string, content: string) => Promise<DocMetadata>;
  getDocContent: (docId: string) => Promise<string>;
  saveDocContent: (docId: string, title: string, content: string) => Promise<void>;
  deleteDoc: (docId: string) => Promise<void>;
  scanDocuments: () => Promise<number>;
  
  // Lock mechanism
  lockTask: (taskId: string) => Promise<boolean>;
  unlockTask: (taskId: string) => Promise<void>;
  lockDoc: (docId: string) => Promise<boolean>;
  unlockDoc: (docId: string) => Promise<void>;
  
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
  
  // Mobile sidebar
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  
  // Multi-project browser
  registeredProjects: RegisteredProject[];
  loadedProjectId: string | null;
  loadProjectById: (projectId: string) => Promise<void>;
  registerProject: (name: string, type: 'FSA_API', pathHint?: string) => string;
  unregisterProject: (projectId: string) => void;
  goToProjectBrowser: () => void;
}

// Helper to save/load persistence state
const PERSISTENCE_KEY = 'gestor-de-proyectos-state';
const SAVED_SESSION_KEY = 'gestor-de-proyectos-saved-session';
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

export const useProjectStore = create<ProjectState>((set, get) => {
  
  // Save specific logs helper
  const saveLogsAndRefresh = async (adapter: FileSystemAdapter, newLogs: TaskActivityLog[]) => {
    await adapter.writeTextFile('/activity/logs.json', JSON.stringify(newLogs, null, 2));
    set({ logs: newLogs });
  };

  // Write a single project activity note
  const logActivityAction = async (taskId: string, action: string, commentText?: string, attachments?: string[]) => {
    const { adapter, logs, activeUser } = get();
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

    const updatedLogs = [newLog, ...logs];
    await saveLogsAndRefresh(adapter, updatedLogs);
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

    // Read full project contents on load
    loadProjectDirectory: async (handle, mode) => {
      set({ isLoading: true });
      const adapter = new FileSystemAdapter(mode, handle);
      
      try {
        const configExists = await adapter.fileExists('/config.json');
        
        if (!configExists) {
          // New folder setup! Enable onboarding flow instead of seeding automatically
          set({ adapter, isOnboarding: true });
          // Save persistence state with mode
          savePersistenceState({ hasActiveProject: true, fsMode: mode });
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
        const listFiles = await adapter.listFiles('/lists');
        const lists: TaskList[] = [];
        for (const file of listFiles) {
          if (file.endsWith('.json')) {
            try {
              const listRaw = await adapter.readTextFile(`/lists/${file}`);
              lists.push(JSON.parse(listRaw));
            } catch (e) {
              console.warn(`Error reading list file: ${file}`, e);
            }
          }
        }

        // Load tasks
        const taskFiles = await adapter.listFiles('/tasks');
        const tasks: Task[] = [];
        for (const file of taskFiles) {
          if (file.endsWith('.json')) {
            try {
              const taskRaw = await adapter.readTextFile(`/tasks/${file}`);
              tasks.push(JSON.parse(taskRaw));
            } catch (e) {
              console.warn(`Error reading task file: ${file}`, e);
            }
          }
        }

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
        lists.sort((a, b) => a.createdAt - b.createdAt);
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
          isLoading: false
        });

        await saveDirectoryHandle(handle);
        savePersistenceState({ hasActiveProject: true, fsMode: mode });

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

    // Auto-initialize on app load — migrate old single-project to multi-project browser
    initialize: async () => {
      // Try migration from old single-project system (old PERSISTENCE_KEY)
      const migrated = migrateOldProject();
      if (migrated.length > 0) {
        set({ registeredProjects: migrated, isLoading: false });
        return;
      }

      // Projects are already loaded synchronously in the initial state from localStorage
      set({ isLoading: false });
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
        logs: [],
        selectedListId: null,
        selectedTaskId: null,
        selectedDocId: null,
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
          logs: [],
          isOnboarding: false,
          selectedListId: blankList.id,
          selectedTaskId: null,
          selectedDocId: null,
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

    // Seed sample data adapted for onboarding (keeps first user instead of demo users)
    seedSampleProjectOnboarding: async (projectMeta, config, firstUser) => {
      const { adapter } = get();
      if (!adapter) return;

      // Keep only first user as superadmin
      const users: SystemUser[] = [firstUser];

      // 1. Lists with complete structure
      const listAId = 'list-sprint-id';
      const listStatusesA: TaskStatus[] = [
        { id: 'todo', name: 'Por Hacer', color: '#d1d5db', isCompleted: false },
        { id: 'inprogress', name: 'En Desarrollo', color: '#2563eb', isCompleted: false },
        { id: 'review', name: 'Revisión / QA', color: '#eab308', isCompleted: false },
        { id: 'done', name: 'Listo / Desplegado', color: '#10b981', isCompleted: true }
      ];
      const listA: TaskList = {
        id: listAId,
        name: 'Sprint Core Active',
        color: '#8b5cf6',
        statuses: listStatusesA,
        createdAt: Date.now() - 3600000 * 50
      };

      const listBId = 'list-backlog-id';
      const listStatusesB: TaskStatus[] = [
        { id: 'backlog', name: 'Backlog Ideas', color: '#6b7280', isCompleted: false },
        { id: 'selected', name: 'Para Próximo Sprint', color: '#0ea5e9', isCompleted: false },
        { id: 'closed', name: 'Archivado', color: '#9ca3af', isCompleted: true }
      ];
      const listB: TaskList = {
        id: listBId,
        name: 'Product Backlog',
        color: '#f59e0b',
        statuses: listStatusesB,
        createdAt: Date.now() - 3600000 * 48
      };

      // 2. All sample tasks (with IDs adjusted to firstUser)
      const task1Id = 'task-001-id';
      const task2Id = 'task-002-id';
      const task3Id = 'task-003-id';
      const task4Id = 'task-004-id';

      const tasks: Task[] = [
        {
          id: task1Id,
          taskCode: 'TSK-001',
          listId: listAId,
          title: 'Implementar Persistencia con File System Access API',
          description: `### Objetivo
Desarrollar la capa de persistencia directa en el navegador para que lea y escriba directamente sobre la carpeta local seleccionada.

### Requerimientos de formato
Adherirse estricto al siguiente formato de JSON de almacenamiento:
- \`config.json\` en la raíz.
- Guardar tareas individuales en nombres secuenciales dentro de \`/tasks/\`.

### Notas de implementación
- La File System Access API requiere permisos de escritura del usuario.
- Siempre tener un plan de escape virtual para navegadores embebidos como el iframe de AI Studio (usar IndexedDB).
`,
          statusId: 'inprogress',
          dueDate: new Date(Date.now() + 3600000 * 24 * 3).toISOString().split('T')[0],
          assignees: [firstUser.id],
          priority: 'high',
          tags: ['File System', 'TypeScript', 'Durable'],
          dependencies: [],
          subtasks: [
            { id: 'subtask-1-1', title: 'Crear adapter con soporte FSA API', isCompleted: true, createdAt: Date.now() },
            { id: 'subtask-1-2', title: 'Crear fallback transparente en IndexedDB', isCompleted: true, createdAt: Date.now() },
            { id: 'subtask-1-3', title: 'Exportar/Importar estructura como archivo .zip', isCompleted: false, createdAt: Date.now() }
          ],
          lastEditedBy: firstUser.id,
          lastEditedAt: Date.now()
        },
        {
          id: task2Id,
          taskCode: 'TSK-002',
          listId: listAId,
          title: 'Diseñar Interfaz Minimalista & Altamente Interactiva',
          description: `### Concepto de diseño
Queremos un aspecto ultra profesional, limpio, denso y responsivo con colores sobrios y elegantes.
- **Lista agrupada por estados** con capacidad colapsable.
- **Vista de tablero Kanban** completo con tarjetas arrastrables.
- **Vista de tabla estructurada** con edición rápida de campos.

### Tipografía recomendada
- Encabezados modernos y limpios.
- JetBrains Mono para códigos de tareas e indicadores.
`,
          statusId: 'done',
          dueDate: new Date(Date.now() - 3600000 * 24).toISOString().split('T')[0],
          assignees: [firstUser.id],
          priority: 'medium',
          tags: ['UI/UX', 'Tailwind', 'Framer Motion'],
          dependencies: [],
          subtasks: [
            { id: 'subtask-2-1', title: 'Definir paleta de colores de estados', isCompleted: true, createdAt: Date.now() },
            { id: 'subtask-2-2', title: 'Crear componentes de lista reactivos', isCompleted: true, createdAt: Date.now() }
          ],
          lastEditedBy: firstUser.id,
          lastEditedAt: Date.now()
        },
        {
          id: task3Id,
          taskCode: 'TSK-003',
          listId: listAId,
          title: 'Sistema de Locks (Bloqueos de Coflicto de Edición)',
          description: `### Caso de uso
Cuando el **Usuario A** está editando una tarea, el **Usuario B** que comparte la misma carpeta de Drive sincronizada no debe poder guardarle cambios ni editar esa tarea simultáneamente.

### Implementación
- Escribir en un archivo temporal o en \`/activity/locks.json\`.
- Cada bloqueo expira automáticamente tras un período de inactividad (e.g. 10 segundos de latido offline).
`,
          statusId: 'todo',
          dueDate: new Date(Date.now() + 3600000 * 24 * 7).toISOString().split('T')[0],
          assignees: [firstUser.id],
          priority: 'urgent',
          tags: ['Locks', 'Sincronización', 'Drive'],
          dependencies: [task1Id],
          subtasks: [
            { id: 'subtask-3-1', title: 'Simulador multiusuario interactivo', isCompleted: false, createdAt: Date.now() },
            { id: 'subtask-3-2', title: 'Escribir locks.json en el disco', isCompleted: false, createdAt: Date.now() }
          ],
          lastEditedBy: firstUser.id,
          lastEditedAt: Date.now()
        },
        {
          id: task4Id,
          taskCode: 'TSK-004',
          listId: listBId,
          title: 'Compilar Ejecutable de Escritorio con Tauri',
          description: `### Escalar en el futuro
Este MVP se diseña pensando en empaquetarse en el futuro usando **Tauri** para exportar ejecutables nativos sumamente livianos en Windows, macOS y Linux.
`,
          statusId: 'backlog',
          dueDate: '',
          assignees: [],
          priority: 'low',
          tags: ['Tauri', 'Desktop', 'Escalabilidad'],
          dependencies: [],
          subtasks: [],
          lastEditedBy: firstUser.id,
          lastEditedAt: Date.now()
        }
      ];

      // 3. Documentation
      const docA: DocMetadata = {
        id: 'doc-guia-id',
        title: 'Guía de Arquitectura de Almacenamiento',
        filename: 'guia.md',
        editedBy: firstUser.id,
        editedAt: Date.now(),
        createdAt: Date.now() - 3600000 * 2
      };
      
      const docAContent = `# Guía - Almacenamiento de Datos del Proyecto

Este proyecto está diseñado para funcionar de manera **totalmente local y privada**. No hay un servidor de base de datos intermedio.

## ¿Cómo funciona la sincronización?
Tú eres dueño de tus datos. El directorio elegido contiene archivos con formatos legibles por humanos:
- Las tareas e información del proyecto se almacenan como archivos **JSON** (ej., \`tasks/task-001.json\`).
- Los documentos son archivos **Markdown (.md)** estándar.

## Sincronización en la Nube
Puedes sincronizar esta carpeta simplemente alojándola en repositorios como **Google Drive, Dropbox, OneDrive o repositorios Git** en tu computadora. La aplicación detectará los cambios de forma automática gracias al escaneo en segundo plano.

> **Importante:** Al editar en paralelo, el sistema bloqueará archivos que estén siendo leídos y editados por otros compañeros utilizando la sincronización local en el archivo locks.json.
`;

      const docB: DocMetadata = {
        id: 'doc-diagrama-id',
        title: 'Diagrama de Arquitectura del Proyecto',
        filename: 'diagrama-arquitectura.md',
        editedBy: firstUser.id,
        editedAt: Date.now(),
        createdAt: Date.now() - 3600000 * 1
      };

      const docBContent = `# Diagrama de Arquitectura del Proyecto

Este documento describe la arquitectura general del sistema **Kora** y cómo fluyen los datos a través de sus componentes principales.

## Diagrama de Flujo de Datos

\`\`\`mermaid
graph TD
    A[Usuario] --> B[Interfaz UI - React + Tailwind]
    B --> C[Zustand Store - Estado Global]
    C --> D[FileSystemAdapter - Capa de Persistencia]
    D --> E[(Virtual FS - IndexedDB)]
    D --> F[(Local FS - File System Access API)]
    C --> G[Sistema de Locks - Control de Edición Concurrente]
    G --> H[activitylocks.json]
    C --> I[Documentos Markdown]
    I --> J[docs/ - Archivos .md]
    C --> K[Tareas JSON]
    K --> L[tasks/ - Archivos .json]
    C --> M[Actividad y Comentarios]
    M --> N[activity/logs.json]
    C --> O[Explorador de Medios]
    O --> P[attachments/ - Imágenes y Videos]
    C --> Q[Papelera de Reciclaje]
    Q --> R[trash/items.json]
\`\`\`

## Componentes Clave

| Componente        | Tecnología     | Propósito                              |
|-------------------|----------------|----------------------------------------|
| UI Frontend       | React + TSX    | Interfaz de usuario interactiva        |
| Estado            | Zustand        | Manejo de estado global centralizado   |
| Persistencia      | FSA API / IDB  | Lectura/escritura de archivos locales  |
| Documentos        | Markdown       | Documentación y notas del proyecto     |
| Tareas            | JSON           | Gestión de tareas y subtareas          |
| Medios            | Archivos       | Adjuntos multimedia del proyecto       |

## Vista Previa del Proyecto

![Vista previa del proyecto Kora](attachments/images/og-image.png)

*Imagen promocional del proyecto, ubicada en la carpeta pública de la aplicación.*
`;

      const docsCatalog = [docA, docB];

      // 4. Activity logs
      const logs: TaskActivityLog[] = [
        {
          id: 'log-1',
          taskId: task1Id,
          userId: firstUser.id,
          username: firstUser.name,
          action: 'creó la tarea de persistencia FSA',
          timestamp: Date.now() - 3600000 * 4
        },
        {
          id: 'log-2',
          taskId: task2Id,
          userId: firstUser.id,
          username: firstUser.name,
          action: 'completó el diseño de la interfaz Kanban y Lists',
          timestamp: Date.now() - 3600000 * 3
        },
        {
          id: 'log-3',
          taskId: task3Id,
          userId: firstUser.id,
          username: firstUser.name,
          action: 'comentó sobre la lógica del archivo locks.json',
          timestamp: Date.now() - 3600000 * 2,
          comment: {
            id: 'comment-1',
            userId: firstUser.id,
            username: firstUser.name,
            text: 'He revisado el flujo. Creo que escribir latidos en `/activity/locks.json` cada 5 a 10 segundos es la forma offline de simular sincronización en tiempo real sin sobrecargar el almacenamiento ni la red local.',
            createdAt: Date.now() - 3600000 * 2
          }
        },
        {
          id: 'log-4',
          taskId: task3Id,
          userId: firstUser.id,
          username: firstUser.name,
          action: 'adjuntó el icono móvil del proyecto',
          timestamp: Date.now() - 3600000 * 1,
          comment: {
            id: 'comment-2',
            userId: firstUser.id,
            username: firstUser.name,
            text: 'Aquí está el icono que usaremos para la aplicación móvil. ¿Qué opinan del diseño?',
            createdAt: Date.now() - 3600000 * 1,
            attachments: ['/attachments/images/mobile-icon.png']
          }
        }
      ];

      // 5. Write ALL files to directory
      await adapter.writeTextFile('/config.json', JSON.stringify(config, null, 2));
      await adapter.writeTextFile('/project.json', JSON.stringify(projectMeta, null, 2));
      await adapter.writeTextFile('/users/users.json', JSON.stringify(users, null, 2));
      await adapter.writeTextFile('/docs/info.json', JSON.stringify(docsCatalog, null, 2));
      await adapter.writeTextFile(`/docs/${docA.filename}`, docAContent);
      await adapter.writeTextFile(`/docs/${docB.filename}`, docBContent);
      await adapter.writeTextFile('/activity/locks.json', JSON.stringify({}, null, 2));
      await adapter.writeTextFile('/activity/logs.json', JSON.stringify(logs, null, 2));
      await adapter.writeTextFile('/trash/items.json', JSON.stringify([], null, 2));

      // Individual task writes
      for (const t of tasks) {
        await adapter.writeTextFile(`/tasks/task-${t.id}.json`, JSON.stringify(t, null, 2));
      }

      // Individual lists writes
      await adapter.writeTextFile(`/lists/${listA.id}.json`, JSON.stringify(listA, null, 2));
      await adapter.writeTextFile(`/lists/${listB.id}.json`, JSON.stringify(listB, null, 2));

      // Copy images from public folder to attachments for demo purposes
      const copyPublicImage = async (publicPath: string, destPath: string) => {
        try {
          const response = await fetch(publicPath);
          if (response.ok) {
            const blob = await response.blob();
            await adapter.writeBinaryFile(destPath, blob);
          } else {
            console.warn(`Image ${publicPath} not found, skipping`);
          }
        } catch (e) {
          console.warn(`Could not copy public image: ${publicPath}`, e);
        }
      };

      // Copy demo images from public assets to project attachments
      await copyPublicImage('/og-image.png', '/attachments/images/og-image.png');
      await copyPublicImage('/mobile-icon.png', '/attachments/images/mobile-icon.png');
      await copyPublicImage('/logo-dark.svg', '/attachments/images/logo-dark.svg');
      await copyPublicImage('/logo-light.svg', '/attachments/images/logo-light.svg');

      // Update state
      set({
        projectMeta,
        projectConfig: config,
        users,
        activeUser: firstUser,
        lists: [listA, listB],
        tasks,
        docs: docsCatalog,
        locks: {},
        logs,
        trashItems: [],
        isOnboarding: false,
        selectedListId: listAId,
        selectedTaskId: null,
        selectedDocId: null,
        showMediaExplorer: false
      });
    },

    // Seed beautiful demo project data for full interaction review out-of-the-box
    // Background interval check to load recent updates from syncing folders
    backgroundReload: async () => {
      const { adapter, isPolling } = get();
      if (!adapter || isPolling) return;
      
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
        
        // Rewrite locked statuses back to filesystem if they expired/cleaned
        if (locksChanged) {
          await adapter.writeTextFile('/activity/locks.json', JSON.stringify(cleanedLocks, null, 2));
        }

        // Re-read lists catalog
        const listFiles = await adapter.listFiles('/lists');
        const lists: TaskList[] = [];
        for (const file of listFiles) {
          if (file.endsWith('.json')) {
            const listRaw = await adapter.readTextFile(`/lists/${file}`);
            lists.push(JSON.parse(listRaw));
          }
        }
        lists.sort((a, b) => a.createdAt - b.createdAt);

        // Re-read tasks
        const taskFiles = await adapter.listFiles('/tasks');
        const tasks: Task[] = [];
        for (const file of taskFiles) {
          if (file.endsWith('.json')) {
            const taskRaw = await adapter.readTextFile(`/tasks/${file}`);
            tasks.push(JSON.parse(taskRaw));
          }
        }
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
        const currentActiveUser = get().activeUser;
        let activeUser = currentActiveUser;
        if (currentActiveUser && !users.find(u => u.id === currentActiveUser.id)) {
          activeUser = null;
        }

        set({
          lists,
          tasks,
          docs,
          logs,
          locks: cleanedLocks,
          users,
          activeUser,
          trashItems,
          isPolling: false
        });
      } catch (err) {
        console.warn('Sync background check bypassed/idle', err);
        set({ isPolling: false });
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
      // Clear persistence state and stored FSA handle
      localStorage.removeItem(PERSISTENCE_KEY);
      localStorage.removeItem(SAVED_SESSION_KEY);
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
        logs: [],
        isOnboarding: false,
        selectedListId: null,
        selectedTaskId: null,
        selectedDocId: null,
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
      const project = { id: projectId, name, type, createdAt: Date.now(), pathHint };
      const projects = [...get().registeredProjects, project];
      saveRegisteredProjects(projects);
      set({ registeredProjects: projects, loadedProjectId: projectId });
      return projectId;
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
        if (project.type === 'FSA_API') {
          const handle = await loadDirectoryHandleByKey('fsa-handle-' + projectId);
          if (!handle) {
            throw new Error('No se pudo recuperar el manejador de la carpeta.');
          }
          const permState = await (handle).queryPermission({ mode: 'readwrite' });
          if (permState !== 'granted') {
            throw new Error('Permisos de carpeta perdidos.');
          }
          await get().loadProjectDirectory(handle, 'FSA_API');
        }
      } catch (err) {
        console.error('Failed to load project', err);
        set({ adapter: null, isLoading: false, loadedProjectId: null });
        throw err;
      }
    },

    goToProjectBrowser: () => {
      localStorage.removeItem(PERSISTENCE_KEY);
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
        logs: [],
        isOnboarding: false,
        selectedListId: null,
        selectedTaskId: null,
        selectedDocId: null,
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
      const { adapter, tasks, activeUser } = get();
      if (!adapter) throw new Error('Cargar directorio primero');

      // Generate next numeric Code for visually pleasing tasks
      const projectTasksLength = tasks.length;
      const formattedCode = `TSK-${String(projectTasksLength + 1).padStart(3, '0')}`;
      
      const newTaskId = crypto.randomUUID();
      const newTask: Task = {
        id: newTaskId,
        taskCode: formattedCode,
        listId,
        title: title.trim(),
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

      const updatedTasks = [...tasks, newTask];
      await adapter.writeTextFile(`/tasks/task-${newTaskId}.json`, JSON.stringify(newTask, null, 2));

      set({ tasks: updatedTasks });
      
      // Log task action
      await logActivityAction(newTaskId, 'creó esta tarea');
      
      return newTask;
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
    createDoc: async (title, content) => {
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
      const existingFilenames = new Set(docs.map(d => d.filename));
      
      while (existingFilenames.has(filename)) {
        filename = `${baseFilename}-${counter}.md`;
        counter++;
      }

      const newDocMeta: DocMetadata = {
        id: docId,
        title: title.trim(),
        filename,
        editedBy: activeUser?.id,
        editedAt: Date.now(),
        createdAt: Date.now()
      };

      const updatedDocs = [...docs, newDocMeta];

      // Save document md raw context
      await adapter.writeTextFile(`/docs/${filename}`, content);
      
      // Save doc index file info
      await adapter.writeTextFile('/docs/info.json', JSON.stringify(updatedDocs, null, 2));

      set({ docs: updatedDocs, selectedDocId: docId });
      return newDocMeta;
    },

    getDocContent: async (docId) => {
      const { adapter, docs } = get();
      if (!adapter) return '';
      const doc = docs.find(d => d.id === docId);
      if (!doc) return '';

      try {
        return await adapter.readTextFile(`/docs/${doc.filename}`);
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

      // Check for existing filenames
      let newFilename = `${baseFilename}.md`;
      let counter = 1;
      const existingFilenames = new Set(
        docs.filter(d => d.id !== docId).map(d => d.filename)
      );
      
      while (existingFilenames.has(newFilename)) {
        newFilename = `${baseFilename}-${counter}.md`;
        counter++;
      }

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
        await adapter.writeTextFile(`/docs/${newFilename}`, content);
        // Delete old file
        try {
          await adapter.deleteFile(`/docs/${oldDoc.filename}`);
        } catch (err) {
          console.warn('Could not delete old file:', err);
        }
      } else {
        // Just update the content without renaming
        await adapter.writeTextFile(`/docs/${newDoc.filename}`, content);
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

      // Read doc content before deleting so we can restore it later
      let docContent = '';
      try {
        docContent = await adapter.readTextFile(`/docs/${doc.filename}`);
      } catch (e) {
        // File might not exist, that's ok
      }

      const updatedDocs = docs.filter(d => d.id !== docId);

      // Remove markdown file
      await adapter.deleteFile(`/docs/${doc.filename}`);
      
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

      set({ docs: updatedDocs, trashItems: updatedTrash, selectedDocId: null });
    },

    scanDocuments: async () => {
      const { adapter, docs, activeUser } = get();
      if (!adapter) throw new Error('No open folder');
      
      let newDocCount = 0;

      try {
        const docFilenames = await adapter.listFiles('/docs');
        
        // Get existing filenames from catalog
        const existingFilenames = new Set(docs.map(d => d.filename));
        
        // Iterate over files in docs folder
        for (const filename of docFilenames) {
          // Skip info.json and only process .md files
          if (filename === 'info.json' || !filename.endsWith('.md')) {
            continue;
          }
          
          // Check if this file is already in the catalog
          if (existingFilenames.has(filename)) {
            continue;
          }
          
          // Create a new document entry for this file
          const docId = crypto.randomUUID();
          const title = filename.replace(/\.md$/i, '').replace(/[-_]/g, ' '); // Use filename as title (without extension)
          
          const newDocMeta: DocMetadata = {
            id: docId,
            title: title,
            filename: filename,
            editedBy: activeUser?.id,
            editedAt: Date.now(),
            createdAt: Date.now()
          };
          
          docs.push(newDocMeta);
          newDocCount++;
        }
        
        // Save updated catalog
        if (newDocCount > 0) {
          await adapter.writeTextFile('/docs/info.json', JSON.stringify(docs, null, 2));
          set({ docs: [...docs] });
        }
        
        return newDocCount;
        
      } catch (e) {
        // If docs directory doesn't exist or any other error
        console.warn('Error scanning documents:', e);
        return 0;
      }
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

    lockDoc: async (docId) => {
      const { adapter, activeUser } = get();
      if (!adapter || !activeUser) return false;

      try {
        let locks: ProjectLocks = {};
        if (await adapter.fileExists('/activity/locks.json')) {
          const locksRaw = await adapter.readTextFile('/activity/locks.json');
          locks = JSON.parse(locksRaw);
        }

        const now = Date.now();
        const activeLock = locks[docId];

        if (activeLock && activeLock.userId !== activeUser.id && activeLock.expiresAt > now) {
          set({ locks });
          return false;
        }

        locks[docId] = {
          userId: activeUser.id,
          username: activeUser.name,
          expiresAt: now + 15000
        };

        await adapter.writeTextFile('/activity/locks.json', JSON.stringify(locks, null, 2));
        set({ locks });
        return true;
      } catch (err) {
        console.warn('Silent doc locking failure', err);
        return true;
      }
    },

    unlockDoc: async (docId) => {
      const { adapter, activeUser, locks } = get();
      if (!adapter || !activeUser) return;

      try {
        if (!locks[docId] || locks[docId].userId !== activeUser.id) {
          return;
        }

        let freshLocks: ProjectLocks = {};
        if (await adapter.fileExists('/activity/locks.json')) {
          const locksRaw = await adapter.readTextFile('/activity/locks.json');
          freshLocks = JSON.parse(locksRaw);
        }

        if (freshLocks[docId] && freshLocks[docId].userId === activeUser.id) {
          delete freshLocks[docId];
          await adapter.writeTextFile('/activity/locks.json', JSON.stringify(freshLocks, null, 2));
          set({ locks: freshLocks });
        }
      } catch (e) {
        console.warn('Doc unlock bypass', e);
      }
    },

    addComment: async (taskId, commentText, attachments) => {
      await logActivityAction(taskId, 'comentó', commentText, attachments);
    },

    editComment: async (logId, newText) => {
      const { adapter, logs } = get();
      if (!adapter) return;
      const updatedLogs = logs.map(log => {
        if (log.id === logId && log.comment) {
          return { ...log, comment: { ...log.comment, text: newText } };
        }
        return log;
      });
      await saveLogsAndRefresh(adapter, updatedLogs);
    },

    deleteComment: async (logId) => {
      const { adapter, logs } = get();
      if (!adapter) return;
      const updatedLogs = logs.filter(log => log.id !== logId);
      await saveLogsAndRefresh(adapter, updatedLogs);
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
            set({ showTrash: show, selectedListId: null, selectedTaskId: null, selectedDocId: null, showMediaExplorer: false, showProjectSettings: false, showAbout: false, sidebarOpen: false });
          }
        });
        return;
      }
      set({ showTrash: show, selectedListId: null, selectedTaskId: null, selectedDocId: null, showMediaExplorer: false, showProjectSettings: false, showAbout: false, sidebarOpen: false });
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
            await adapter.writeTextFile(`/docs/${docMeta.filename}`, docContent);
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

      // Delete all trash media files
      for (const item of trashItems) {
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
            set({ showMediaExplorer: show, selectedListId: null, selectedTaskId: null, selectedDocId: null, showTrash: false, showProjectSettings: false, showAbout: false, sidebarOpen: false });
          }
        });
        return;
      }
      set({ showMediaExplorer: show, selectedListId: null, selectedTaskId: null, selectedDocId: null, showTrash: false, showProjectSettings: false, showAbout: false, sidebarOpen: false });
    },
    setSelectedList: (listId) => {
      const state = get();
      if (state.docHasUnsavedChanges && state.selectedDocId) {
        set({
          pendingNavigationAction: () => {
            const currentState = get();
            if (currentState.selectedDocId) get().unlockDoc(currentState.selectedDocId);
            set({ selectedListId: listId, selectedTaskId: null, selectedDocId: null, showTrash: false, showMediaExplorer: false, showProjectSettings: false, showAbout: false, sidebarOpen: false });
          }
        });
        return;
      }
      set({ selectedListId: listId, selectedTaskId: null, selectedDocId: null, showTrash: false, showMediaExplorer: false, showProjectSettings: false, showAbout: false, sidebarOpen: false });
    },
    setSelectedTask: (taskId) => {
      const prevTaskId = get().selectedTaskId;
      if (prevTaskId && prevTaskId !== taskId) {
        get().unlockTask(prevTaskId);
      }
      set({ selectedTaskId: taskId, selectedDocId: null, showTrash: false });
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
      const prevDocId = state.selectedDocId;

      // If there are unsaved changes and navigating to a different doc, intercept
      if (state.docHasUnsavedChanges && prevDocId && prevDocId !== docId) {
        set({
          pendingNavigationAction: () => {
            if (prevDocId && prevDocId !== docId) get().unlockDoc(prevDocId);
            set({ selectedDocId: docId, selectedTaskId: null, showTrash: false, showMediaExplorer: false, showProjectSettings: false, showAbout: false, sidebarOpen: false });
          }
        });
        return;
      }

      if (prevDocId && prevDocId !== docId) {
        get().unlockDoc(prevDocId);
      }
      set({ selectedDocId: docId, selectedTaskId: null, showTrash: false, showMediaExplorer: false, showProjectSettings: false, showAbout: false, sidebarOpen: false });
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
            set({ showProjectSettings: show, selectedListId: show ? null : get().selectedListId, selectedDocId: null, selectedTaskId: null, showTrash: false, showMediaExplorer: false, showAbout: false, sidebarOpen: false });
          }
        });
        return;
      }
      set({ showProjectSettings: show, selectedListId: show ? null : get().selectedListId, selectedDocId: null, selectedTaskId: null, showTrash: false, showMediaExplorer: false, showAbout: false, sidebarOpen: false });
    },

    // Project Administration
    updateProjectMeta: async (name, description) => {
      const { adapter, projectMeta } = get();
      if (!adapter || !projectMeta) return;
      const updated: ProjectMetadata = { ...projectMeta, name, description };
      await adapter.writeTextFile('/project.json', JSON.stringify(updated, null, 2));
      set({ projectMeta: updated });
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
            set({ showAbout: show, selectedListId: show ? null : get().selectedListId, selectedDocId: null, selectedTaskId: null, showTrash: false, showMediaExplorer: false, showProjectSettings: false, sidebarOpen: false });
          }
        });
        return;
      }
      set({ showAbout: show, selectedListId: show ? null : get().selectedListId, selectedDocId: null, selectedTaskId: null, showTrash: false, showMediaExplorer: false, showProjectSettings: false, sidebarOpen: false });
    },

    // Mobile sidebar
    sidebarOpen: false,
    setSidebarOpen: (open) => set({ sidebarOpen: open })
  };
});
