/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useProjectStore } from '../store';
import { 
  ProjectMetadata, 
  TaskList, 
  DocMetadata, 
  SystemUser 
} from '../types';
import { 
  FolderLock, 
  LogOut, 
  Plus, 
  Layers, 
  FileText, 
  Search, 
  Users, 
  FileArchive, 
  CheckSquare, 
  HelpCircle,
  Database,
  ChevronsUpDown,
  Laptop
} from 'lucide-react';
import JSZip from 'jszip';

export default function Sidebar() {
  const { 
    projectMeta, 
    lists, 
    docs, 
    activeUser, 
    users, 
    switchUserSimulated, 
    logoutUser,
    createList,
    createDoc,
    selectedListId,
    selectedDocId,
    setSelectedList,
    setSelectedDoc,
    setSearchOpen,
    adapter
  } = useProjectStore();

  const [showAddList, setShowAddList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListColor, setNewListColor] = useState('#8b5cf6');

  const [showAddDoc, setShowAddDoc] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');

  const [showUserDropdown, setShowUserDropdown] = useState(false);

  // Helper colors list
  const LIST_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#db2777', '#06b6d4'];

  const handleAddListSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    try {
      await createList(newListName, newListColor);
      setNewListName('');
      setShowAddList(false);
    } catch (e) {
      alert('Error al crear la lista');
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
      alert('Error al crear el documento');
    }
  };

  // EXPORT THE FULL directory handle as a standard ZIP file!
  const handleExportZip = async () => {
    try {
      const zip = new JSZip();
      
      // Let's add standard lists, tasks, project, users, images structure!
      // Reading from direct FileSystem adapter keys (virtual IDB or FSA API recursively)
      const { normalizePath } = await import('../lib/fs');
      
      // We will loop through the current store's files and fetch them automatically
      // Let's write lists
      const state = useProjectStore.getState();
      if (!state.adapter) return;
      
      const fileAdapter = state.adapter;
      
      // If VIRTUAL, we can pull all keys in IndexedDB directly and put them in ZIP!
      if (fileAdapter.getMode() === 'VIRTUAL') {
        const { dbGetAllKeys, dbGet } = await import('../lib/fs');
        const keys = await dbGetAllKeys();
        
        for (const key of keys) {
          const entry = await dbGet(key);
          if (entry) {
            const cleanPath = key.replace(/^\//, ''); // relative path inside zip
            if (entry.isBinary) {
              zip.file(cleanPath, entry.content as Blob);
            } else {
              zip.file(cleanPath, entry.content as string);
            }
          }
        }
      } else {
        // FSA_API mode export!
        // We can zip project metadata and loaded lists/tasks/docs
        zip.file('config.json', JSON.stringify({ projectId: state.projectMeta?.id, projectName: state.projectMeta?.name, lastOpenedBy: state.activeUser?.id, lastModified: Date.now() }, null, 2));
        zip.file('project.json', JSON.stringify(state.projectMeta, null, 2));
        zip.file('users/users.json', JSON.stringify(state.users, null, 2));
        zip.file('activity/logs.json', JSON.stringify(state.logs, null, 2));
        zip.file('activity/locks.json', JSON.stringify({}, null, 2));
        
        for (const list of state.lists) {
          zip.file(`lists/${list.id}.json`, JSON.stringify(list, null, 2));
        }
        for (const task of state.tasks) {
          zip.file(`tasks/task-${task.id}.json`, JSON.stringify(task, null, 2));
        }
        
        // Docs
        zip.file('docs/info.json', JSON.stringify(state.docs, null, 2));
        for (const doc of state.docs) {
          try {
            const md = await fileAdapter.readTextFile(`/docs/${doc.filename}`);
            zip.file(`docs/${doc.filename}`, md);
          } catch (e) {}
        }
      }

      // Generate zip file as downloadable blob
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${projectMeta?.name.replace(/[^a-zA-Z0-9]/g, '_') || 'ClickUp_Offline'}_workspace.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (err: any) {
      alert('No se pudo generar el ZIP: ' + err.message);
    }
  };

  return (
    <aside id="app-sidebar" className="w-64 shrink-0 bg-white border-r border-slate-200 text-slate-700 flex flex-col h-full font-sans select-none relative">
      
      {/* Workspace App Name Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-black shadow-md shrink-0">
            C
          </div>
          <div className="leading-tight overflow-hidden">
            <span className="text-xs font-bold text-slate-800 block truncate">Offline Workspace</span>
            <span className="text-[10px] text-slate-500 block font-mono truncate">
              {adapter?.getMode() === 'VIRTUAL' ? '📁 Disco Virtual' : '💻 Carpeta Local'}
            </span>
          </div>
        </div>

        {/* Global Search trigger icon */}
        <button 
          onClick={() => setSearchOpen(true)}
          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          title="Buscar globalmente (Cmd+K)"
        >
          <Search className="w-4 h-4" />
        </button>
      </div>

      {/* Quick Switch User & Profile Box */}
      <div className="p-3 border-b border-slate-200 relative">
        {activeUser && (
          <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 overflow-hidden">
                <span 
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 uppercase"
                  style={{ backgroundColor: activeUser.avatarColor }}
                >
                  {activeUser.name.charAt(0)}
                </span>
                <span className="text-xs font-semibold text-slate-800 truncate block">
                  {activeUser.name}
                </span>
              </div>
              
              <button 
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-250 rounded transition-colors"
                title="Cambiar Usuario / Simulador de Concurrencia"
              >
                <ChevronsUpDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Simulated Multi-User dropdown to test task locking easily */}
            {showUserDropdown && (
              <div className="absolute left-3 right-3 top-16 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-30">
                <p className="text-[9px] font-bold uppercase text-indigo-600 tracking-wider mb-2 px-1">Simular cambio de sesión:</p>
                <div className="space-y-1">
                  {users.filter(u => u.id !== activeUser.id).map(u => (
                    <button
                      key={u.id}
                      onClick={() => {
                        switchUserSimulated(u.id);
                        setShowUserDropdown(false);
                      }}
                      className="w-full text-left p-1.5 rounded hover:bg-slate-50 flex items-center gap-2 transition-all group"
                    >
                      <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white uppercase shrink-0" style={{ backgroundColor: u.avatarColor }}>
                        {u.name.charAt(0)}
                      </span>
                      <span className="text-[11px] text-slate-700 group-hover:text-slate-900 truncate flex-1">{u.name}</span>
                      <span className="text-[8px] font-mono bg-slate-100 group-hover:bg-indigo-50 px-1 py-0.5 rounded text-slate-500 group-hover:text-indigo-600">Simular</span>
                    </button>
                  ))}
                  {users.length <= 1 && (
                    <span className="text-slate-500 text-[10px] block p-2 text-center">Registra más usuarios para testear el Bloqueo Multi-Usuario.</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation Groups */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-6">
        
        {/* LISTS GROUP */}
        <div>
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              Listas de Tareas
            </span>
            <button 
              onClick={() => setShowAddList(!showAddList)}
              className="p-0.5 rounded hover:bg-slate-100 text-slate-500 hover:text-indigo-600 transition-colors"
              title="Nueva Lista"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {showAddList && (
            <form onSubmit={handleAddListSubmit} className="p-2 bg-slate-50 rounded-xl mb-2 mx-1 border border-slate-200 space-y-2">
              <input 
                type="text" 
                required
                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                placeholder="Nombre de Lista..." 
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
              />
              <div className="flex items-center justify-between gap-2.5">
                <span className="text-[10px] text-slate-500">Color:</span>
                <div className="flex gap-1 overflow-x-auto">
                  {LIST_COLORS.map(c => (
                    <button 
                      key={c}
                      type="button"
                      className="w-3.5 h-3.5 rounded-full border border-slate-200 shrink-0"
                      style={{ 
                        backgroundColor: c, 
                        boxShadow: newListColor === c ? '0 0 0 2px #cbd5e1' : 'none' 
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
                  className="flex-1 bg-slate-200 hover:bg-slate-300 py-1 rounded text-[10px] text-slate-700"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 py-1 rounded text-[10px] text-white font-semibold"
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
                    ? 'bg-indigo-50 text-indigo-700 border-l-2 border-indigo-500 font-bold' 
                    : 'hover:bg-slate-50 text-slate-600 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: l.color }}></div>
                  <span className="text-xs font-semibold truncate">{l.name}</span>
                </div>
              </button>
            ))}
            {lists.length === 0 && (
              <span className="text-[10px] text-slate-400 italic px-3 block">Ninguna lista creada.</span>
            )}
          </div>
        </div>

        {/* DOCUMENTS GROUP */}
        <div>
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              Documentos MD
            </span>
            <button 
              onClick={() => setShowAddDoc(!showAddDoc)}
              className="p-0.5 rounded hover:bg-slate-100 text-slate-550 hover:text-indigo-650 transition-colors"
              title="Nuevo Doc"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {showAddDoc && (
            <form onSubmit={handleAddDocSubmit} className="p-2 bg-slate-50 rounded-xl mb-2 mx-1 border border-slate-200 space-y-2">
              <input 
                type="text" 
                required
                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                placeholder="Título del Doc..." 
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
              />
              <div className="flex gap-1.5 pt-1">
                <button 
                  type="button" 
                  onClick={() => setShowAddDoc(false)}
                  className="flex-1 bg-slate-200 hover:bg-slate-300 py-1 rounded text-[10px] text-slate-700"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 py-1 rounded text-[10px] text-white font-semibold"
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
                    ? 'bg-violet-50 text-violet-750 border-l-2 border-violet-500 font-bold' 
                    : 'hover:bg-slate-50 text-slate-650 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span className="text-xs font-semibold truncate flex-1">{d.title}</span>
              </button>
            ))}
            {docs.length === 0 && (
              <span className="text-[10px] text-slate-400 italic px-3 block">Ningún documento.</span>
            )}
          </div>
        </div>

      </div>

      {/* Backup Sync Settings Utilities */}
      <div className="p-3 border-t border-slate-200 bg-slate-50 mt-auto flex flex-col gap-2">
        <button 
          onClick={handleExportZip}
          className="w-full px-3 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-700 text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer font-semibold leading-none shadow-sm"
          title="Conserva copia física legible de tu proyecto en un ZIP"
        >
          <FileArchive className="w-4 h-4 text-indigo-600" />
          Respaldar como ZIP
        </button>

        <button 
          onClick={() => {
            if (confirm('¿Seguro que deseas salir del proyecto local actual? Se cerrará la sesión de la carpeta.')) {
              logoutUser();
              window.location.reload(); // Hard reloading resets the adapter
            }
          }}
          className="w-full px-3 py-2 bg-white hover:bg-red-50 text-slate-600 hover:text-red-650 border border-slate-200 hover:border-red-200 rounded-xl text-[11px] transition-all flex items-center justify-center gap-1 mt-1 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          Cambiar de Carpeta / Salir
        </button>
      </div>

    </aside>
  );
}
