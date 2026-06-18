/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  LogOut, 
  Plus, 
  Layers, 
  FileText, 
  Search, 
  Info,
  RefreshCw,
  ImageIcon,
  X,
  LayoutDashboard,
  ChevronLeft,
  Trash as TrashIcon,
  FolderOpen,
  HardDrive,
  ArrowRight,
  Home
} from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import { loadSavedSessions } from '../store/sessions';

export default function Sidebar() {
  const { 
    projectMeta, 
    lists, 
    docs, 
    activeUser, 
    logoutUser,
    closeProject,
    createList,
    createDoc,
    scanDocuments,
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
      const { saveDirectoryHandleWithKey } = await import('../lib/fs');
      
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

  const [showAddDoc, setShowAddDoc] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');

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

  const handleAddDocSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocTitle.trim()) return;
    try {
      const docHeader = `# ${newDocTitle}\n\nEscribe contenido en Markdown aquí...\n`;
      await createDoc(newDocTitle, docHeader);
      setNewDocTitle('');
      setShowAddDoc(false);
    } catch (e) {
      toast('Error al crear el documento', 'error');
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

  const handleScanDocuments = async () => {
    try {
      const newDocs = await scanDocuments();
      if (newDocs > 0) {
        toast(`Se detectaron ${newDocs} documento(s) nuevo(s)`, 'success');
      } else {
        toast('No se encontraron documentos nuevos', 'info');
      }
    } catch (e) {
      toast('Error al escanear documentos', 'error');
    }
  };

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
            <span className="text-[10px] text-muted-foreground block font-mono truncate">
              Carpeta Local
            </span>
          </div>
        </div>

        {/* Global Search trigger icon – hidden on mobile (already in MobileHeader) */}
        <div className="hidden lg:flex items-center gap-1">
          <ThemeToggle />
          <button 
            onClick={() => setSearchOpen(true)}
            className="p-1.5 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Buscar globalmente (Cmd+K)"
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
                title="Cerrar Sesión"
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
                !selectedListId && !selectedDocId && !showTrash && !showMediaExplorer && !showAbout
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
              title="Nueva Lista"
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
                    <span className="text-[9px] font-bold bg-bento-blue text-white px-1.5 py-0.5 rounded-full leading-none shrink-0 animate-pulse" title={`${count} nota${count !== 1 ? 's' : ''} sin leer`}>
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

        {/* DOCUMENTS GROUP */}
        <div>
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" />
              Documentos
            </span>
            <div className="flex items-center gap-0.5">
              <button 
                onClick={handleScanDocuments}
                className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-bento-blue transition-colors"
                title="Escanear documentos"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => setShowAddDoc(!showAddDoc)}
                className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-bento-orange transition-colors"
                title="Nuevo Doc"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {showAddDoc && (
            <form onSubmit={handleAddDocSubmit} className="p-2 bg-secondary rounded-xl mb-2 mx-1 border border-border space-y-2">
              <input 
                type="text" 
                required
                className="w-full bg-card border border-input rounded-lg px-2 py-1 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                placeholder="Título del Doc..." 
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
              />
              <div className="flex gap-1.5 pt-1">
                <button 
                  type="button" 
                  onClick={() => setShowAddDoc(false)}
                  className="flex-1 bg-muted hover:bg-accent py-1 rounded text-[10px] text-muted-foreground"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-primary hover:opacity-90 py-1 rounded text-[10px] text-primary-foreground font-semibold"
                >
                  Crear
                </button>
              </div>
            </form>
          )}

          <div className="space-y-0.5">
            {docs.map(d => (
              <button
                key={d.id}
                onClick={() => setSelectedDoc(d.id)}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 transition-colors ${
                  selectedDocId === d.id 
                    ? 'bg-bento-orange-light text-bento-orange border-l-2 border-bento-orange font-bold' 
                    : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span className="text-xs font-semibold truncate flex-1">{d.title}</span>
              </button>
            ))}
            {docs.length === 0 && (
              <span className="text-[10px] text-muted-foreground italic px-3 block">Ningún documento.</span>
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
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-bento-blue-light text-bento-blue">
                        <HardDrive className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <span className="truncate">{project.name}</span>
                          {isCurrent && <span className="text-[9px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-bold leading-none shrink-0">ACTUAL</span>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">
                            Carpeta Local
                          </span>
                          {/* Auth indicator dot */}
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${isAuthenticated ? 'bg-bento-green' : 'bg-muted-foreground'}`} 
                            title={isAuthenticated ? 'Sesión activa' : 'Sin sesión'} />
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
                        title="Desvincular proyecto"
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
          className="relative w-full px-3 py-2 bg-card hover:bg-accent border border-border rounded-xl text-foreground text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer font-semibold leading-none shadow-card"
          title="Acerca de esta aplicación"
        >
          <Info className="w-4 h-4 text-muted-foreground" />
          Acerca de Kora
          {updateAvailable && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" />
          )}
        </button>
      </div>

    </aside>

    </>
  );
}
