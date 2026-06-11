/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { useProjectStore } from './store';
import LoadFolderScreen from './components/LoadFolderScreen';
import AuthScreen from './components/AuthScreen';
import Sidebar from './components/Sidebar';
import ListViews from './components/ListViews';
import DocView from './components/DocView';
import TaskDrawer from './components/TaskDrawer';
import SearchDialog from './components/SearchDialog';
import { 
  ProjectMetadata 
} from './types';
import { 
  Calendar, 
  CheckCircle2, 
  Layers, 
  FileText, 
  Users, 
  Activity, 
  Cpu, 
  Terminal, 
  AlertTriangle 
} from 'lucide-react';

export default function App() {
  const { 
    adapter, 
    activeUser, 
    projectMeta, 
    lists, 
    tasks, 
    docs, 
    selectedListId, 
    selectedDocId, 
    backgroundReload,
    logs,
    initialize,
    isLoading
  } = useProjectStore();

  // Initialize the app on load
  useEffect(() => {
    initialize();
  }, []);

  // Polling interval loop to detect directory/IDB modifications during other simulations
  useEffect(() => {
    if (!adapter) return;

    // Run background reload of project state every 7 seconds
    const interval = setInterval(() => {
      backgroundReload();
    }, 7000);

    return () => clearInterval(interval);
  }, [adapter]);

  // Initial loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-200">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500 mx-auto mb-4"></div>
          <p className="font-mono">Cargando...</p>
        </div>
      </div>
    );
  }

  // Stage 1: Load Directory Workspace
  if (!adapter) {
    return <LoadFolderScreen />;
  }

  // Stage 2: Register/Authenticate Local User inside selected folder
  if (!activeUser) {
    return <AuthScreen />;
  }

  // Metrics calculators
  const totalTasks = tasks.length;
  // Calculate completed tasks: look up status completion is true inside corresponding lists
  let completedTasksCount = 0;
  tasks.forEach(t => {
    const listObj = lists.find(l => l.id === t.listId);
    const statusObj = listObj?.statuses.find(s => s.id === t.statusId);
    if (statusObj?.isCompleted) {
      completedTasksCount++;
    }
  });

  const completionPercent = totalTasks > 0 ? Math.round((completedTasksCount / totalTasks) * 100) : 0;

  // Stage 3: Full Workspace Dashboard Layout
  return (
    <div id="full-dashboard" className="h-screen w-screen flex bg-slate-100 text-slate-800 overflow-hidden font-sans">
      
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Work Area Container */}
      <main id="main-content-flow" className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedDocId ? (
            /* Document view active style */
            <DocView />
          ) : selectedListId ? (
            /* Tasks List view active style */
            <ListViews />
          ) : (
            /* Default Project Overview Welcome Screen dashboard */
            <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
              <div className="max-w-4xl mx-auto space-y-8 text-left">
                
                {/* Profile welcome */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
                  <div>
                    <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                      ¡Hola de nuevo, {activeUser.name.split(' ')[0]}! 👋
                    </h1>
                    <p className="text-slate-550 text-xs mt-1.5 leading-normal">
                      Has cargado exitosamente la carpeta local de tu proyecto. Tu base de conocimientos está lista y 100% desconectada.
                    </p>
                  </div>

                  <div className="text-xs font-mono bg-white border border-slate-200 p-3 rounded-xl shadow-sm">
                    <div className="flex items-center gap-2 mb-1 text-slate-500">
                      <Cpu className="w-4 h-4 text-indigo-500" />
                      <span>Motor de Base de Datos:</span>
                    </div>
                    <strong className="text-indigo-600 font-semibold uppercase font-mono text-[11px]">
                      {adapter.getMode() === 'VIRTUAL' ? 'Directorio Virtual (IndexedDB)' : 'Acceso Directo al Disco'}
                    </strong>
                  </div>
                </div>

                {/* Stats Bento Grid Panel */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  
                  {/* Stats A: List Count */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center justify-between gap-3">
                    <div className="space-y-1.5">
                      <span className="text-[10px] bg-slate-100 font-bold uppercase text-slate-500 px-2 py-0.5 rounded tracking-wide">
                        Flujos listados
                      </span>
                      <h3 className="text-2xl font-bold text-slate-900 font-mono">{lists.length}</h3>
                    </div>
                    <Layers className="w-8 h-8 text-indigo-500" />
                  </div>

                  {/* Stats B: Real-time task completeness */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center justify-between gap-3">
                    <div className="space-y-1.5">
                      <span className="text-[10px] bg-slate-100 font-bold uppercase text-slate-500 px-2 py-0.5 rounded tracking-wide">
                        Completitud de Tareas
                      </span>
                      <h3 className="text-2xl font-bold text-slate-900 font-mono">
                        {completedTasksCount}/{totalTasks}
                        <span className="text-xs text-slate-500 ml-1.5 font-sans">({completionPercent}%)</span>
                      </h3>
                    </div>
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  </div>

                  {/* Stats C: Document index count */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center justify-between gap-3">
                    <div className="space-y-1.5">
                      <span className="text-[10px] bg-slate-100 font-bold uppercase text-slate-500 px-2 py-0.5 rounded tracking-wide">
                        Documentos MD (.md)
                      </span>
                      <h3 className="text-2xl font-bold text-slate-900 font-mono">{docs.length}</h3>
                    </div>
                    <FileText className="w-8 h-8 text-violet-500" />
                  </div>

                </div>

                {/* Dual layout sections */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  
                  {/* Section Left: General Audit Log Action feed */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                    <span className="text-xs uppercase font-bold text-slate-700 tracking-wider flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-indigo-500" />
                      Bitácora de Sincronización del Proyecto
                    </span>

                    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                      {logs.slice(0, 15).map(log => {
                        const logTask = tasks.find(t => t.id === log.taskId);

                        return (
                          <div key={log.id} className="text-left text-xs leading-relaxed border-b border-slate-100 pb-2.5">
                            <div className="flex items-center gap-1 text-slate-600">
                              <span className="text-slate-800 font-semibold font-mono text-[11px] block">@{log.username.split(' ')[0]}</span>
                              <span>{log.action}</span>
                            </div>
                            {logTask && (
                              <span className="text-[10px] text-indigo-600 font-bold font-mono mt-0.5 block truncate">
                                &gt;&gt; {logTask.taskCode}: {logTask.title}
                              </span>
                            )}
                            <span className="text-[9px] text-slate-400 block mt-1 font-mono">
                              {new Date(log.timestamp).toLocaleString()}
                            </span>
                          </div>
                        );
                      })}
                      {logs.length === 0 && (
                        <span className="text-xs text-slate-500 italic block text-center py-4">Sin actividad para reportar en esta carpeta.</span>
                      )}
                    </div>
                  </div>

                  {/* Section Right: Quick guide on Tauri and Folder structures */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                    <span className="text-xs uppercase font-bold text-slate-700 tracking-wider flex items-center gap-1.5">
                      <Terminal className="w-4 h-4 text-violet-500" />
                      Estructura del Repositorio de Disco
                    </span>

                    <div className="text-xs text-slate-600 leading-normal space-y-3">
                      <p>Los archivos dentro de tu carpeta tienen nombres estándar para que sean legibles por otros programas:</p>
                      <pre className="p-3 bg-slate-50 text-slate-750 rounded-xl font-mono text-[10px] max-h-56 overflow-y-auto border border-slate-200 select-text leading-relaxed">
{`Proyecto/
├── config.json (Ajustes de Sesión)
├── project.json (Metadatos Generales)
├── users/
│   └── users.json (Cuentas Locales en la Carpeta)
├── lists/
│   ├── backlog.json
│   └── sprint.json (Estados & Configs por Lista)
├── tasks/
│   ├── task-001.json (Fichas JSON Individuales)
│   └── task-002.json
├── docs/
│   ├── info.json (Catalog de Documentos)
│   └── guia.md (Contenido Raw de Docs)
└── attachments/
    ├── images/ (Imágenes de Tareas / Notas)
    └── videos/ (Videos Incrustados)`}
                      </pre>

                      <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-[11px] text-indigo-700 flex items-start gap-2">
                        <AlertTriangle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                        <div>
                          <strong>¿Listo para escalar?</strong> Este código es totalmente portátil y escalable en el futuro para convertirse en un binario ejecutable portable de Windows, mac y Linux mediante un bundler como <strong>Tauri</strong>.
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

              </div>
            </div>
          )}
        </div>

        {/* Footer Status Bar matching Clean Utility Design Theme */}
        <footer className="h-6 bg-indigo-600 text-white flex items-center px-4 justify-between text-[10px] flex-none">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
              Syncing Local Storage
            </span>
            <span>Real-time Active Client</span>
          </div>
          <div className="flex items-center gap-4">
            <span>Sesión: Activa</span>
            <span className="font-mono">v0.1.0-alpha</span>
          </div>
        </footer>

      </main>

      {/* Task detail context panel drawer */}
      <TaskDrawer />

      {/* Global Command palette search dialog */}
      <SearchDialog />

    </div>
  );
}
