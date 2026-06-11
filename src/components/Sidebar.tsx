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
  LogOut, 
  Plus, 
  Layers, 
  FileText, 
  Search, 
  FileArchive, 
  HelpCircle,
  Laptop,
  Github,
  RefreshCw
} from 'lucide-react';
import JSZip from 'jszip';
import { normalizePath, dbGetAllKeys, dbGet } from '../lib/fs';
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
    adapter
  } = useProjectStore();

  const [showAddList, setShowAddList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListColor, setNewListColor] = useState('#8b5cf6');

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
  
  const handleScanDocuments = async () => {
    try {
      const newDocs = await scanDocuments();
      if (newDocs > 0) {
        alert(`Se detectaron ${newDocs} documento(s) nuevo(s)`);
      } else {
        alert('No se encontraron documentos nuevos');
      }
    } catch (e) {
      alert('Error al escanear documentos');
    }
  };

  const handleExportZip = async () => {
    try {
      const zip = new JSZip();
      const state = useProjectStore.getState();
      if (!state.adapter) return;
      const fileAdapter = state.adapter;
      
      if (fileAdapter.getMode() === 'VIRTUAL') {
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
      } else {
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
        zip.file('docs/info.json', JSON.stringify(state.docs, null, 2));
        for (const doc of state.docs) {
          try {
            const md = await fileAdapter.readTextFile(`/docs/${doc.filename}`);
            zip.file(`docs/${doc.filename}`, md);
          } catch (e) {}
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${projectMeta?.name.replace(/[^a-zA-Z0-9]/g, '_') || 'Kora_Offline'}_workspace.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('No se pudo generar el ZIP: ' + err.message);
    }
  };

  return (
    <aside id="app-sidebar" className="w-64 shrink-0 bg-card border-r border-border text-card-foreground flex flex-col h-full font-body select-none relative">
      
      {/* Workspace App Name Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-hidden">
          <img src="/icon.svg" alt="Kora" className="w-8 h-8 shrink-0" />
          <div className="leading-tight overflow-hidden">
            <span className="text-xs font-bold text-foreground block truncate font-heading">Kora Workspace</span>
            <span className="text-[10px] text-muted-foreground block font-mono truncate">
              {adapter?.getMode() === 'VIRTUAL' ? 'Disco Virtual' : 'Carpeta Local'}
            </span>
          </div>
        </div>

        {/* Global Search trigger icon */}
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button 
            onClick={() => setSearchOpen(true)}
            className="p-1.5 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Buscar globalmente (Cmd+K)"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
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
              Documentos MD
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

      </div>

      {/* Backup Sync Settings Utilities */}
      <div className="p-3 border-t border-border bg-secondary mt-auto flex flex-col gap-2">
        <button 
          onClick={handleExportZip}
          className="w-full px-3 py-2 bg-card hover:bg-accent border border-border rounded-xl text-foreground text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer font-semibold leading-none shadow-card"
          title="Conserva copia física legible de tu proyecto en un ZIP"
        >
          <FileArchive className="w-4 h-4 text-bento-blue" />
          Respaldar como ZIP
        </button>

        <a
          href="https://github.com/lorspi/Kora"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full px-3 py-2 bg-card hover:bg-accent border border-border rounded-xl text-foreground text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer font-semibold leading-none shadow-card"
          title="Ver repositorio en GitHub"
        >
          <Github className="w-4 h-4 text-muted-foreground" />
          Repositorio en GitHub
        </a>

        <button 
          onClick={() => {
            if (confirm('¿Seguro que deseas salir del proyecto local actual? Se cerrará la sesión de la carpeta.')) {
              closeProject();
            }
          }}
          className="w-full px-3 py-2 bg-card hover:bg-destructive/10 text-muted-foreground hover:text-destructive border border-border hover:border-destructive/30 rounded-xl text-[11px] transition-all flex items-center justify-center gap-1 mt-1 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          Cambiar de Carpeta / Salir
        </button>
      </div>

    </aside>
  );
}
