/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useUI } from '../lib/ui';
import { useUpdateCheck } from '../hooks/useVersion';
import { useProjectStore } from '../store';
import { 
  ProjectMetadata, 
  TaskList, 
  DocMetadata 
} from '../types';
import { dbGetAllKeys, dbGet } from '../lib/fs';
import JSZip from 'jszip';
import { 
  LogOut, 
  Plus, 
  Layers, 
  FileText, 
  Search, 
  Info,
  RefreshCw,
  ImageIcon,
  AlertTriangle,
  Download,
  X,
  Trash2,
  LayoutDashboard,
  ChevronLeft,
  Trash as TrashIcon
} from 'lucide-react';
import ThemeToggle from './ThemeToggle';

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
    trashItems
  } = useProjectStore();
  const { toast, confirm } = useUI();
  const { updateAvailable } = useUpdateCheck();

  const [showAddList, setShowAddList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListColor, setNewListColor] = useState('#8b5cf6');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmChecked, setDeleteConfirmChecked] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);

  const isVirtualMode = adapter?.getMode() === 'VIRTUAL';

  const handleExportZipFromModal = async () => {
    setIsExportingZip(true);
    try {
      const zip = new JSZip();
      const state = useProjectStore.getState();
      if (!state.adapter) return;

      const keys = await dbGetAllKeys();
      for (const key of keys) {
        const entry = await dbGet(key);
        if (entry) {
          const cleanPath = key.replace(/^\//, '');
          if (entry.isBinary) {
            zip.file(cleanPath, entry.content as Blob);
          } else {
            zip.file(cleanPath, entry.content as string);
          }
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${projectMeta?.name?.replace(/[^\w\u00C0-\u024F\s-]/g, '').replace(/\s+/g, '_') || 'Kora_Offline'}_workspace.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast('Respaldo ZIP descargado exitosamente', 'success');
    } catch (err: any) {
      toast('No se pudo generar el ZIP: ' + err.message, 'error');
    } finally {
      setIsExportingZip(false);
    }
  };

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
              {adapter?.getMode() === 'VIRTUAL' ? 'Disco Virtual' : 'Carpeta Local'}
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
                <div className="flex items-center gap-2 truncate">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: l.color }}></div>
                  <span className="text-xs font-semibold truncate">{l.name}</span>
                </div>
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
      <div className="p-3 border-t border-border bg-secondary mt-auto flex flex-col gap-2">
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

        <button 
          onClick={async () => {
            if (isVirtualMode) {
              setDeleteConfirmChecked(false);
              setShowDeleteModal(true);
            } else {
              const ok = await confirm({ title: 'Cambiar de carpeta', message: '¿Seguro que deseas salir del proyecto local actual? Se cerrará la sesión de la carpeta.', confirmLabel: 'Salir', variant: 'danger' });
              if (ok) closeProject();
            }
          }}
          className="w-full px-3 py-2 bg-card hover:bg-destructive/10 text-muted-foreground hover:text-destructive border border-border hover:border-destructive/30 rounded-xl text-[11px] transition-all flex items-center justify-center gap-1 mt-1 cursor-pointer"
        >
          {isVirtualMode ? (
            <>
              <Trash2 className="w-3.5 h-3.5" />
              Borrar datos / Salir
            </>
          ) : (
            <>
              <LogOut className="w-3.5 h-3.5" />
              Cambiar de Carpeta / Salir
            </>
          )}
        </button>
      </div>

    </aside>

    {/* Modal: Borrar datos del Disco Virtual — fuera del aside para cubrir pantalla completa */}
    {showDeleteModal && (
      <div
        className="fixed inset-0 z-[9998] flex items-center justify-center bg-foreground/20 backdrop-blur-[2px] animate-fade-in"
        onClick={() => setShowDeleteModal(false)}
      >
        <div
          className="bg-card border border-border rounded-2xl shadow-card-hover w-full max-w-md mx-4 overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
              <h2 className="text-sm font-bold text-foreground font-heading">Borrar datos del Disco Virtual</h2>
            </div>
            <button
              onClick={() => setShowDeleteModal(false)}
              className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 pb-4 space-y-3">
            <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3">
              <p className="text-xs text-destructive font-semibold leading-relaxed">
                ⚠️ Esta acción es permanente e irreversible. Todos los datos almacenados en el Disco Virtual del navegador (listas, tareas, documentos y archivos multimedia) serán eliminados definitivamente.
              </p>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Antes de continuar, te recomendamos descargar una copia de seguridad de tu proyecto en formato ZIP.
            </p>

            {/* Download ZIP button */}
            <button
              onClick={handleExportZipFromModal}
              disabled={isExportingZip}
              className="w-full px-4 py-2.5 bg-primary hover:opacity-90 text-primary-foreground font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              {isExportingZip ? 'Generando ZIP...' : 'Descargar copia de seguridad (.zip)'}
            </button>

            {/* Confirmation checkbox */}
            <label className="flex items-start gap-2.5 cursor-pointer pt-2 border-t border-border">
              <input
                type="checkbox"
                checked={deleteConfirmChecked}
                onChange={e => setDeleteConfirmChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 app-checkbox app-checkbox--danger shrink-0"
              />
              <span className="text-xs text-foreground leading-relaxed select-none">
                Entiendo que todos mis datos serán borrados permanentemente y que esta acción no se puede deshacer.
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-2 px-5 pb-5 justify-end">
            <button
              onClick={() => setShowDeleteModal(false)}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-secondary hover:bg-accent border border-border text-foreground transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                setShowDeleteModal(false);
                closeProject();
              }}
              disabled={!deleteConfirmChecked}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-destructive hover:opacity-90 text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Borrar todo y salir
            </button>
          </div>
        </div>
      </div>
    )}

    </>
  );
}
