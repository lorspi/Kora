/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useUI } from '../lib/ui';
import { useUpdateCheck } from '../hooks/useVersion';
import { useProjectStore } from '../store';
import { 
  ProjectMetadata, 
  TaskList, 
  DocMetadata,
  RegisteredProject
} from '../types';

import {
  SignOut as LogOut,
  Plus,
  Stack as Layers,
  FileText,
  MagnifyingGlass as Search,
  Info,
  Image as ImageIcon,
  X,
  SquaresFour as LayoutDashboard,
  CaretLeft as ChevronLeft,
  TrashSimple as TrashIcon,
  FolderOpen,
  FolderSimple,
  PencilSimple as Pencil,
  HardDrive,
  Cloud,
  ArrowRight,
  House as Home
} from '@phosphor-icons/react';
import ThemeToggle from './ThemeToggle';
import { ContextMenu, ContextMenuItem } from './ContextMenu';
import { useDocDrop, useDocFolderActions, DOCS_ROOT } from './DocumentsBrowser';
import { loadSavedSessions } from '../store/sessions';
import { saveDirectoryHandleWithKey } from '../lib/fs';

export default function Sidebar() {
  const { 
    projectMeta, 
    lists, 
    docs, 
    activeUser, 
    logoutUser,
    closeProject,
    createList,
    docFolders,
    refreshDocFolders,
    showDocs,
    docsFolder,
    setShowDocs,
    selectedListId,
    selectedDocId,
    setSelectedList,
    setSelectedDoc,
    setSearchOpen,
    showMediaExplorer,
    setShowMediaExplorer,
    showAbout,
    setShowAbout,
    adapter,
    sidebarOpen,
    setSidebarOpen,
    showTrash,
    setShowTrash,
    trashItems,
    tasks,
    logs
  } = useProjectStore();
  const { toast, confirm } = useUI();
  const { updateAvailable } = useUpdateCheck();

  const [showAddList, setShowAddList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListColor, setNewListColor] = useState('#8b5cf6');
  
  // Project manager dropdown
  const [showProjectManager, setShowProjectManager] = useState(false);
  const projectManagerRef = useRef<HTMLDivElement>(null);
  const [authStatuses, setAuthStatuses] = useState<Record<string, boolean>>({});
  
  const { registeredProjects, registerProject, unregisterProject, goToProjectBrowser, loadedProjectId, loadProjectById } = useProjectStore();

  // Storage type of the currently loaded project ('FIREBASE' for cloud, else local folder).
  const currentProjectType = registeredProjects.find(p => p.id === loadedProjectId)?.type;

  // Update auth statuses — solely from localStorage (persisted sessions)
  useEffect(() => {
    const sessions = loadSavedSessions();
    const statuses: Record<string, boolean> = {};
    for (const p of registeredProjects) {
      statuses[p.id] = !!sessions[p.id];
    }
    setAuthStatuses(statuses);
  }, [registeredProjects, showProjectManager]);

  // Handle adding a new project directly from the dropdown
  const handleAddNewProject = async () => {
    setShowProjectManager(false);
    try {
      if (!('showDirectoryPicker' in window)) {
        toast('Tu navegador no es compatible con la API de Acceso a Archivos Locales.', 'error');
        return;
      }
      const directoryHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      
      const projId = registerProject('Cargando...', 'FSA_API');
      await saveDirectoryHandleWithKey(directoryHandle, `fsa-handle-${projId}`);
      await loadProjectById(projId);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        toast(err?.message || 'Error al agregar proyecto', 'error');
      }
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (projectManagerRef.current && !projectManagerRef.current.contains(e.target as Node)) {
        setShowProjectManager(false);
      }
    };
    if (showProjectManager) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProjectManager]);

  // Doc folders (the documents themselves are in the documents view)
  const { dropZone, dropClass } = useDocDrop();
  const { renameFolder, deleteFolder } = useDocFolderActions();
  const [folderMenu, setFolderMenu] = useState<{ x: number; y: number; folder: string } | null>(null);
  const closeFolderMenu = useCallback(() => setFolderMenu(null), []);
  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    docs.forEach(d => {
      if (d.folder) counts.set(d.folder, (counts.get(d.folder) ?? 0) + 1);
    });
    return counts;
  }, [docs]);
  // The folder being browsed, or the one of the open doc
  const openDoc = selectedDocId ? docs.find(d => d.id === selectedDocId) : undefined;
  const inDocs = showDocs || !!openDoc;
  const activeDocsFolder = showDocs ? docsFolder : openDoc?.folder ?? null;

  const buildFolderMenuItems = (folder: string): ContextMenuItem[] => [
    { label: 'Abrir', onSelect: () => setShowDocs(true, folder) },
    { label: 'Renombrar…', onSelect: () => renameFolder(folder) },
    'separator',
    { label: 'Eliminar carpeta', danger: true, onSelect: () => deleteFolder(folder) },
  ];

  const LIST_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#db2777', '#06b6d4'];

  const handleAddListSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    try {
      await createList(newListName, newListColor);
      setNewListName('');
      setShowAddList(false);
    } catch (e) {
      toast('Error al crear la lista', 'error');
    }
  };

  // Compute unread notes count per list
  const unreadNotesByList = useMemo(() => {
    if (!activeUser) return new Map<string, number>();
    const readNotes = activeUser.readNotes || {};
    const counts = new Map<string, number>();
    for (const log of logs) {
      if (!log.comment) continue;
      if (log.userId === activeUser.id) continue;
      if (readNotes[log.id]) continue;
      const task = tasks.find(t => t.id === log.taskId);
      if (!task) continue;
      const current = counts.get(task.listId) || 0;
      counts.set(task.listId, current + 1);
    }
    return counts;
  }, [logs, activeUser?.readNotes, tasks]);

  // Doc folders from the filesystem (also created by other users)
  useEffect(() => {
    refreshDocFolders().catch(() => {});
  }, [docs, refreshDocFolders]);

  return (
    <>
      {/* Overlay backdrop for mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside 
        id="app-sidebar" 
        className={`
          fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw]
          bg-card border-r border-border text-card-foreground 
          flex flex-col h-full font-body select-none
          transform transition-transform duration-300 ease-in-out
          lg:relative lg:inset-auto lg:z-auto lg:w-64 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:transition-none
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
      
      {/* Workspace App Name Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-hidden">
          <img src="/icon.svg" alt="Kora" className="w-8 h-8 shrink-0" />
          <div className="leading-tight overflow-hidden">
            <span className="text-xs font-bold text-foreground block truncate font-heading">{projectMeta?.name || 'Kora Workspace'}</span>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono truncate">
              {currentProjectType === 'FIREBASE' ? (
                <>
                  <Cloud className="w-2.5 h-2.5 text-bento-orange shrink-0" />
                  En la nube
                </>
              ) : (
                <>
                  <HardDrive className="w-2.5 h-2.5 text-bento-blue shrink-0" />
                  Carpeta Local
                </>
              )}
            </span>
          </div>
        </div>

        {/* Global Search trigger icon – hidden on mobile (already in MobileHeader) */}
        <div className="hidden lg:flex items-center gap-1">
          <ThemeToggle />
          <button 
            onClick={() => setSearchOpen(true)}
            className="p-1.5 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            data-tooltip="Buscar globalmente"
            data-shortcut="Ctrl+K"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
        {/* Close sidebar button – visible only on mobile */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden p-1.5 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          aria-label="Cerrar menú"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Quick Switch User & Profile Box */}
      <div className="p-3 border-b border-border relative">
        {activeUser && (
          <div className="bg-secondary rounded-xl p-2.5 border border-border flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 overflow-hidden">
                <span 
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 uppercase"
                  style={{ backgroundColor: activeUser.avatarColor }}
                >
                  {activeUser.name.charAt(0)}
                </span>
                <span className="text-xs font-semibold text-foreground truncate block">
                  {activeUser.name}
                </span>
              </div>
              
              <button 
                onClick={() => logoutUser()}
                className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
                data-tooltip="Cerrar Sesión"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Groups */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-6">

        {/* DASHBOARD HOME LINK */}
        <div>
          <div className="space-y-0.5">
            <button
              onClick={() => setSelectedList(null)}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 transition-colors ${
                !selectedListId && !selectedDocId && !showTrash && !showMediaExplorer && !showAbout && !showDocs
                  ? 'bg-bento-purple-light text-bento-purple border-l-2 border-bento-purple font-bold'
                  : 'hover:bg-accent text-muted-foreground hover:text-foreground'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs font-semibold">Inicio</span>
            </button>
          </div>
        </div>
        
        {/* LISTS GROUP */}
        <div>
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" />
              Listas de Tareas
            </span>
            <button 
              onClick={() => setShowAddList(!showAddList)}
              className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-bento-blue transition-colors"
              data-tooltip="Nueva Lista"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {showAddList && (
            <form onSubmit={handleAddListSubmit} className="p-2 bg-secondary rounded-xl mb-2 mx-1 border border-border space-y-2">
              <input 
                type="text" 
                required
                className="w-full bg-card border border-input rounded-lg px-2 py-1 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                placeholder="Nombre de Lista..." 
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
              />
              <div className="flex items-center justify-between gap-2.5">
                <span className="text-[10px] text-muted-foreground">Color:</span>
                <div className="flex gap-1 overflow-x-auto">
                  {LIST_COLORS.map(c => (
                    <button 
                      key={c}
                      type="button"
                      className="w-3.5 h-3.5 rounded-full border border-border shrink-0"
                      style={{ 
                        backgroundColor: c, 
                        boxShadow: newListColor === c ? '0 0 0 2px hsl(var(--ring))' : 'none' 
                      }}
                      onClick={() => setNewListColor(c)}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-1.5 pt-1">
                <button 
                  type="button" 
                  onClick={() => setShowAddList(false)}
                  className="flex-1 bg-muted hover:bg-accent py-1 rounded text-[10px] text-muted-foreground"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-primary hover:opacity-90 py-1 rounded text-[10px] text-primary-foreground font-semibold"
                >
                  Guardar
                </button>
              </div>
            </form>
          )}

          <div className="space-y-0.5">
            {lists.map(l => (
              <button
                key={l.id}
                onClick={() => setSelectedList(l.id)}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors group ${
                  selectedListId === l.id && selectedDocId === null
                    ? 'bg-bento-blue-light text-bento-blue border-l-2 border-bento-blue font-bold' 
                    : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-2 truncate min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: l.color }}></div>
                  <span className="text-xs font-semibold truncate">{l.name}</span>
                </div>
                {(() => {
                  const count = unreadNotesByList.get(l.id) || 0;
                  if (count === 0) return null;
                  return (
                    <span className="text-[9px] font-bold bg-bento-blue text-white px-1.5 py-0.5 rounded-full leading-none shrink-0 animate-pulse" data-tooltip={`${count} nota${count !== 1 ? 's' : ''} sin leer`}>
                      {count}
                    </span>
                  );
                })()}
              </button>
            ))}
            {lists.length === 0 && (
              <span className="text-[10px] text-muted-foreground italic px-3 block">Ninguna lista creada.</span>
            )}
          </div>
        </div>

        {/* DOCUMENTS: the documents view and its folders */}
        <div>
          <div className="space-y-0.5">
            <button
              onClick={() => setShowDocs(true, null)}
              {...dropZone(DOCS_ROOT)}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 transition-colors cursor-pointer ${
                inDocs && !activeDocsFolder
                  ? 'bg-bento-orange-light text-bento-orange border-l-2 border-bento-orange font-bold'
                  : 'hover:bg-accent text-muted-foreground hover:text-foreground'
              } ${dropClass(DOCS_ROOT)}`}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs font-semibold flex-1">Documentos</span>
              {docs.length > 0 && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border bg-secondary text-muted-foreground border-border">
                  {docs.length}
                </span>
              )}
            </button>
            {docFolders.length > 0 && (
              <div className="ml-3 pl-1.5 border-l border-border space-y-0.5 py-0.5">
                {docFolders.map(folder => {
                  const active = inDocs && activeDocsFolder === folder;
                  return (
                    <div
                      key={folder}
                      {...dropZone(folder)}
                      className={`group/folder rounded-lg transition-colors ${dropClass(folder)}`}
                    >
                      <button
                        onClick={() => setShowDocs(true, folder)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setFolderMenu({ x: e.clientX, y: e.clientY, folder });
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                          active
                            ? 'bg-bento-orange-light text-bento-orange border-l-2 border-bento-orange font-bold'
                            : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {active ? (
                          <FolderOpen className="w-3.5 h-3.5 shrink-0 text-bento-yellow" weight="fill" />
                        ) : (
                          <FolderSimple className="w-3.5 h-3.5 shrink-0 text-bento-yellow" weight="fill" />
                        )}
                        <span className="text-xs font-semibold truncate flex-1">{folder}</span>
                        <span
                          className="flex items-center gap-0.5 opacity-0 group-hover/folder:opacity-100 focus-within:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={() => renameFolder(folder)}
                            className="p-0.5 rounded hover:text-foreground hover:bg-accent/50 cursor-pointer"
                            data-tooltip="Renombrar carpeta"
                            aria-label="Renombrar carpeta"
                          >
                            <Pencil className="w-3 h-3" />
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={() => deleteFolder(folder)}
                            className="p-0.5 rounded hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                            data-tooltip="Eliminar carpeta"
                            aria-label="Eliminar carpeta"
                          >
                            <TrashIcon className="w-3 h-3" />
                          </span>
                        </span>
                        <span className="text-[9px] font-mono text-muted-foreground min-w-3 text-right">
                          {folderCounts.get(folder) ?? 0}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* MEDIA EXPLORER */}
        <div>
          <div className="space-y-0.5">
            <button
              onClick={() => setShowMediaExplorer(true)}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 transition-colors ${
                showMediaExplorer
                  ? 'bg-bento-purple-light text-bento-purple border-l-2 border-bento-purple font-bold'
                  : 'hover:bg-accent text-muted-foreground hover:text-foreground'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs font-semibold">Explorador de Medios</span>
            </button>
          </div>
        </div>

        {/* TRASH */}
        <div>
          <div className="space-y-0.5">
            <button
              onClick={() => setShowTrash(true)}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 transition-colors ${
                showTrash
                  ? 'bg-destructive/10 text-destructive border-l-2 border-destructive font-bold'
                  : 'hover:bg-accent text-muted-foreground hover:text-foreground'
              }`}
            >
              <TrashIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs font-semibold flex-1">Papelera</span>
              {trashItems.length > 0 && (
                <span className="text-[9px] font-bold bg-destructive/20 text-destructive border border-destructive/30 px-1.5 py-0.5 rounded-full">
                  {trashItems.length}
                </span>
              )}
            </button>
          </div>
        </div>

      </div>

      {/* Utilities */}
      <div className="p-3 border-t border-border bg-secondary mt-auto flex flex-col gap-2 relative">
        {/* Project Manager Dropdown */}
        <div className="relative" ref={projectManagerRef}>
          <button
            onClick={() => setShowProjectManager(!showProjectManager)}
            className="w-full px-3 py-2 bg-card hover:bg-accent border border-border rounded-xl text-foreground text-[11px] transition-all flex items-center justify-center gap-1.5 cursor-pointer font-semibold shadow-card"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Administrar Proyectos
            <ChevronLeft className={`w-3 h-3 transition-transform ${showProjectManager ? '-rotate-90' : ''}`} />
          </button>

          {showProjectManager && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-card border border-border rounded-xl shadow-card-hover z-50 overflow-hidden animate-fade-in">
              {/* Current project indicator */}
              <div className="p-3 border-b border-border">
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Proyectos Vinculados</span>
              </div>

              <div className="max-h-60 overflow-y-auto">
                {registeredProjects.map(project => {
                  const isAuthenticated = !!authStatuses[project.id];
                  const isCurrent = project.id === loadedProjectId;
                  return (
                    <div
                      key={project.id}
                      onClick={async () => {
                        if (isCurrent) return;
                        setShowProjectManager(false);
                        try {
                          await loadProjectById(project.id);
                        } catch (e: any) {
                          toast(e?.message || 'Error al cambiar de proyecto', 'error');
                        }
                      }}
                      className={`flex items-center gap-2 px-3 py-2.5 border-b border-border last:border-b-0 transition-colors cursor-pointer ${
                        isCurrent ? 'bg-accent cursor-default' : 'hover:bg-accent/50'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        project.type === 'FIREBASE'
                          ? 'bg-bento-orange-light text-bento-orange'
                          : 'bg-bento-blue-light text-bento-blue'
                      }`}>
                        {project.type === 'FIREBASE' ? <Cloud className="w-3.5 h-3.5" /> : <HardDrive className="w-3.5 h-3.5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <span className="truncate">{project.name}</span>
                          {isCurrent && <span className="text-[9px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-bold leading-none shrink-0">ACTUAL</span>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">
                            {project.type === 'FIREBASE' ? 'Proyecto en la nube' : 'Carpeta Local'}
                          </span>
                          {/* Auth indicator dot */}
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${isAuthenticated ? 'bg-bento-green' : 'bg-muted-foreground'}`} 
                            data-tooltip={isAuthenticated ? 'Sesión activa' : 'Sin sesión'} />
                        </div>
                      </div>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const confirmed = await confirm({
                            title: 'Desvincular proyecto',
                            message: `¿Estás seguro de que deseas desvincular "${project.name}"? Los datos del proyecto no se eliminarán, solo se quitará de la lista.`,
                            confirmLabel: 'Desvincular',
                            cancelLabel: 'Cancelar',
                            variant: 'danger'
                          });
                          if (confirmed) {
                            unregisterProject(project.id);
                          }
                        }}
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        data-tooltip="Desvincular proyecto"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
                {registeredProjects.length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    No hay proyectos vinculados
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="border-t border-border p-2 flex flex-col gap-1">
                <button
                  onClick={handleAddNewProject}
                  className="w-full px-3 py-1.5 bg-primary hover:opacity-90 rounded-lg text-[11px] font-bold text-primary-foreground transition-colors flex items-center gap-1.5 justify-center"
                >
                  <Plus className="w-3 h-3" />
                  Vincular Nuevo Proyecto
                </button>
                <button
                  onClick={() => {
                    setShowProjectManager(false);
                    goToProjectBrowser();
                  }}
                  className="w-full px-3 py-1.5 bg-secondary hover:bg-accent rounded-lg text-[11px] font-semibold text-foreground transition-colors flex items-center gap-1.5 justify-center"
                >
                  <Home className="w-3 h-3" />
                  Volver al inicio
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => setShowAbout(true)}
          className={`relative w-full px-3 py-2 border rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer font-semibold leading-none shadow-card ${
            showAbout
              ? 'bg-accent border-ring/40 text-foreground'
              : 'bg-card hover:bg-accent border-border text-foreground'
          }`}
          aria-current={showAbout ? 'page' : undefined}
        >
          <Info className="w-4 h-4 text-muted-foreground" />
          Acerca de Kora
          {updateAvailable && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" />
          )}
        </button>
      </div>

    </aside>

    {folderMenu && (
      <ContextMenu x={folderMenu.x} y={folderMenu.y} items={buildFolderMenuItems(folderMenu.folder)} onClose={closeFolderMenu} />
    )}

    </>
  );
}
