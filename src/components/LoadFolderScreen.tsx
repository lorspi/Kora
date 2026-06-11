/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useProjectStore } from '../store';
import { FolderOpen, HardDrive, Cpu, HelpCircle, AlertTriangle, FileArchive, ArrowRight } from 'lucide-react';
import { FsMode, FileSystemAdapter } from '../lib/fs';
import JSZip from 'jszip';

export default function LoadFolderScreen() {
  const { loadProjectDirectory, createBlankProject, seedSampleProject, adapter } = useProjectStore();
  const [fsaSupported] = useState<boolean>(() => 'showDirectoryPicker' in window);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // New project setup state
  const [showConfig, setShowConfig] = useState(false);
  const [projName, setProjName] = useState('');
  const [projDesc, setProjDesc] = useState('');

  // Handle standard File System Access API directory entry
  const handleSelectFSA = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      if (!('showDirectoryPicker' in window)) {
        throw new Error('Tu navegador no es compatible con la API de Acceso a Archivos Locales. Usa Chrome o Edge, o selecciona el "Disco Virtual".');
      }
      
      // Let user pick a local computer folder
      const directoryHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite'
      });
      
      await loadProjectDirectory(directoryHandle, 'FSA_API');
    } catch (err: any) {
      console.warn(err);
      if (err.name === 'AbortError') {
        setErrorMsg('Selección de carpeta cancelada por el usuario.');
      } else {
        setErrorMsg(
          'Error al abrir la carpeta. Nota: Las políticas de iframe de Chrome a veces bloquean el diálogo en previsualizaciones. Si esto falla, te sugerimos abrir en una pestaña nueva o usar "Disco Virtual en Navegador".'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle IndexedDB simulation drive load
  const handleSelectVirtual = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      // In virtual mode, we pass null as directory handle
      await loadProjectDirectory(null, 'VIRTUAL');
    } catch (err: any) {
      setErrorMsg('Error al cargar el entorno virtual persistente: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Setup simple empty layout project
  const handleCreateEmpty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projName.trim()) return;
    setLoading(true);
    try {
      await createBlankProject(projName, projDesc);
    } catch (err: any) {
      setErrorMsg('Error de configuración: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle import zip
  const handleZipImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setErrorMsg(null);
    setLoading(true);
    try {
      const zip = await JSZip.loadAsync(file);
      
      // Initialize a virtual workspace adapter first
      const virtualAdapter = useProjectStore.getState().adapter || new FileSystemAdapter('VIRTUAL', null);
      
      // Clear current Virtual storage keys
      const { dbClear, dbSet, normalizePath } = await import('../lib/fs');
      await dbClear();
      
      // Loop files in ZIP and store them into IDB
      let containsConfig = false;
      
      for (const [relativePath, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const normalized = normalizePath(relativePath);
        if (normalized.endsWith('config.json')) {
          containsConfig = true;
        }
        
        const isBinary = normalized.includes('/attachments/');
        if (isBinary) {
          const blob = await entry.async('blob');
          await dbSet(normalized, {
            content: blob,
            isBinary: true,
            lastModified: Date.now()
          });
        } else {
          const text = await entry.async('text');
          await dbSet(normalized, {
            content: text,
            isBinary: false,
            lastModified: Date.now()
          });
        }
      }
      
      if (!containsConfig) {
        throw new Error('Archivo ZIP no es un proyecto compatible. Debe contener config.json en su estructura raíz.');
      }
      
      // Successfully loaded! Join project in virtual engine
      await loadProjectDirectory(null, 'VIRTUAL');
      
    } catch (err: any) {
      setErrorMsg('Error al importar el ZIP: ' + err.message);
    } finally {
      setLoading(false);
      // reset file input
      e.target.value = '';
    }
  };

  return (
    <div id="loader-screen" className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6 select-none font-sans">
      <div className="max-w-2xl w-full bg-slate-800/80 backdrop-blur-md rounded-2xl p-8 border border-slate-700 shadow-2xl relative overflow-hidden">
        {/* Decorative Background Glows */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-violet-500/10 rounded-full blur-3xl pointer-events-none"></div>
        
        {/* Product Heading */}
        <div className="text-center mb-8 relative">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-600 rounded-xl mb-4 shadow-lg shadow-indigo-600/20">
            <Cpu className="w-8 h-8 text-indigo-100" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-indigo-100 via-violet-200 to-indigo-100 bg-clip-text text-transparent">
            Gestor de Proyectos Offline-First
          </h1>
          <p className="mt-2 text-slate-400 text-sm max-w-md mx-auto">
            Edita, organiza y colabora sobre tus tareas con almacenamiento local y privado. Tus datos permanecen en tu control.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-amber-900/40 border border-amber-700/60 rounded-xl flex items-start gap-3 text-amber-200 text-xs leading-relaxed">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />
            <div className="flex-1">
              <span className="font-semibold block mb-1">Nota importante:</span>
              {errorMsg}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500"></div>
            <p className="text-slate-400 text-sm mt-4 font-mono">Estructurando almacenamiento del proyecto...</p>
          </div>
        ) : showConfig ? (
          /* Creating list parameters */
          <form onSubmit={handleCreateEmpty} className="space-y-5">
            <div>
              <h2 className="text-lg font-bold text-slate-100 mb-1">Inicializar Nuevo Directorio</h2>
              <p className="text-xs text-slate-400">Crearemos config.json y carpetas básicas dentro del directorio activo.</p>
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Nombre del Proyecto</label>
              <input 
                type="text" 
                required
                className="w-full bg-slate-930 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="Ej. Plan de Lanzamiento, Tarea de Grado" 
                value={projName}
                onChange={(e) => setProjName(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Descripción (Opcional)</label>
              <textarea 
                className="w-full bg-slate-930 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors h-20"
                placeholder="Indica el objetivo de este proyecto..." 
                value={projDesc}
                onChange={(e) => setProjDesc(e.target.value)}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button 
                type="button"
                onClick={() => setShowConfig(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-650 text-slate-200 py-2.5 rounded-xl text-xs font-medium transition-colors"
              >
                Volver
              </button>
              <button 
                type="submit"
                className="flex-1 bg-indigo-600 hover:bg-indigo-550 text-indigo-50 py-2.5 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                Crear Proyecto <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-6">
            {/* Action Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Option A: Native File System */}
              <div 
                id="btn-fsa-access"
                onClick={handleSelectFSA}
                className={`group border rounded-2xl p-5 cursor-pointer transition-all flex flex-col text-left h-full ${
                  fsaSupported 
                    ? 'border-slate-700 bg-slate-800/40 hover:border-indigo-500/60 hover:bg-slate-750/30' 
                    : 'border-slate-800/40 opacity-50 bg-slate-800/20 cursor-not-allowed'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-4 transition-colors group-hover:bg-indigo-500/20">
                  <HardDrive className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-1.5">
                  Carpeta del Computador
                  {!fsaSupported && <span className="text-[10px] bg-red-950 text-red-400 font-mono px-2 py-0.5 rounded-full">Incompatible</span>}
                </h3>
                <p className="mt-1.5 text-slate-400 text-xs leading-normal flex-1">
                  Usa la <strong>File System Access API</strong> de Chrome/Edge para guardar archivos JSON y Markdown reales directo a tu disco duro.
                </p>
                <span className="mt-4 text-[11px] text-indigo-400 font-medium group-hover:underline flex items-center gap-1">
                  Dar acceso a carpeta <ArrowRight className="w-3 h-3" />
                </span>
              </div>

              {/* Option B: Simulated Sandbox Drive */}
              <div 
                id="btn-virtual-access"
                onClick={handleSelectVirtual}
                className="group border border-slate-700 bg-slate-800/40 hover:border-violet-500/60 hover:bg-slate-750/30 rounded-2xl p-5 cursor-pointer transition-all flex flex-col text-left h-full"
              >
                <div className="w-10 h-10 rounded-xl bg-violet-400/10 flex items-center justify-center text-violet-400 mb-4 transition-colors group-hover:bg-violet-400/20">
                  <Cpu className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-slate-100 text-sm">
                  Disco Virtual en Navegador
                </h3>
                <p className="mt-1.5 text-slate-400 text-xs leading-normal flex-1">
                  Guarda tus cambios localmente en <strong>IndexedDB</strong>. Ideal para sistemas en iFrames cerrados como este entorno de previsualización.
                </p>
                <span className="mt-4 text-[11px] text-violet-400 font-medium group-hover:underline flex items-center gap-1">
                  Entrar con Demo Precargado <ArrowRight className="w-3 h-3" />
                </span>
              </div>

            </div>

            {/* Extra import Actions / ZIP Backups */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-700/60 items-center justify-between">
              <div className="text-left">
                <span className="text-xs font-semibold text-slate-300 block">¿Tienes un backup en ZIP?</span>
                <span className="text-[11px] text-slate-400 block mt-0.5">Puedes importar un archivo ZIP del proyecto para restaurarlo.</span>
              </div>
              <label 
                id="zip-import-label"
                className="cursor-pointer shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-slate-750 hover:bg-slate-705 border border-slate-650 rounded-xl text-slate-200 text-xs font-medium transition-colors"
              >
                <FileArchive className="w-4 h-4 text-slate-400" />
                Importar ZIP
                <input 
                  type="file" 
                  accept=".zip" 
                  className="hidden" 
                  onChange={handleZipImport}
                />
              </label>
            </div>
          </div>
        )}

        {/* Informative Footer */}
        <div className="mt-8 pt-5 border-t border-slate-750 text-center flex items-center justify-center gap-2 text-xs text-slate-500 font-mono">
          <HelpCircle className="w-4 h-4 text-indigo-500/70" />
          <span>Es 100% privado. Ningún dato viaja a servidores externos.</span>
        </div>
      </div>
    </div>
  );
}
