/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useProjectStore } from '../store';
import { FolderOpen, HardDrive, HelpCircle, AlertTriangle, ArrowRight, Github, Download } from 'lucide-react';
import { FileSystemAdapter } from '../lib/fs';
import ThemeToggle from './ThemeToggle';
import VersionBadge from './VersionBadge';
import { useUpdateCheck } from '../hooks/useVersion';

export default function LoadFolderScreen() {
  const { loadProjectDirectory, createBlankProject, adapter } = useProjectStore();
  const { updateAvailable, remoteVersion, localVersion, performUpdate } = useUpdateCheck();
  const [fsaSupported] = useState<boolean>(() => 'showDirectoryPicker' in window);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [showConfig, setShowConfig] = useState(false);
  const [projName, setProjName] = useState('');
  const [projDesc, setProjDesc] = useState('');

  const handleSelectFSA = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      if (!('showDirectoryPicker' in window)) {
        throw new Error('Tu navegador no es compatible con la API de Acceso a Archivos Locales. Usa Chrome o Edge.');
      }
      const directoryHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      await loadProjectDirectory(directoryHandle, 'FSA_API');
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setErrorMsg('Selección de carpeta cancelada por el usuario.');
      } else {
        setErrorMsg('Error al abrir la carpeta. Nota: Las políticas de iframe de Chrome a veces bloquean el diálogo en previsualizaciones. Si esto falla, te sugerimos abrir en una pestaña nueva.');
      }
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <div id="loader-screen" className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-4 sm:px-6 py-6 pt-14 sm:pt-6 pb-14 sm:pb-6 select-none font-body relative">
      {/* Theme toggle top-right */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="max-w-2xl w-full bg-card backdrop-blur-md rounded-2xl p-5 sm:p-8 border border-border shadow-card-hover relative overflow-hidden">
        {/* Decorative Background Glows */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-bento-blue/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-bento-orange/10 rounded-full blur-3xl pointer-events-none"></div>
        
        {/* Product Heading */}
        <div className="text-center mb-5 sm:mb-8 relative">
          <div className="inline-flex items-center justify-center mb-3 sm:mb-4">
            <img src="/logo-light.svg?v=2" alt="Kora" className="h-10 sm:h-12 dark:hidden" />
            <img src="/logo-dark.svg?v=2" alt="Kora" className="h-10 sm:h-12 hidden dark:block" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-heading">
            Gestor de Proyectos Offline-First
          </h1>
          <p className="mt-2 text-muted-foreground text-xs sm:text-sm max-w-md mx-auto">
            Edita, organiza y colabora sobre tus tareas con almacenamiento local y privado. Tus datos permanecen en tu control.
          </p>
          {updateAvailable && (
            <button
              onClick={performUpdate}
              className="mt-3 inline-flex items-center gap-1.5 bg-bento-blue-light text-bento-blue border border-bento-blue/30 px-3 py-1.5 rounded-xl text-xs font-semibold hover:opacity-80 transition-opacity cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Actualización disponible (v{remoteVersion})
            </button>
          )}
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-bento-orange-light border border-border rounded-xl flex items-start gap-3 text-bento-orange text-xs leading-relaxed">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <div className="flex-1">
              <span className="font-semibold block mb-1">Nota importante:</span>
              {errorMsg}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
            <p className="text-muted-foreground text-sm mt-4 font-mono">Estructurando almacenamiento del proyecto...</p>
          </div>
        ) : showConfig ? (
          <form onSubmit={handleCreateEmpty} className="space-y-5">
            <div>
              <h2 className="text-lg font-bold text-foreground mb-1 font-heading">Inicializar Nuevo Directorio</h2>
              <p className="text-xs text-muted-foreground">Crearemos config.json y carpetas básicas dentro del directorio activo.</p>
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Nombre del Proyecto</label>
              <input 
                type="text" 
                required
                className="w-full bg-secondary border border-input rounded-xl px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring transition-colors"
                placeholder="Ej. Plan de Lanzamiento, Tarea de Grado" 
                value={projName}
                onChange={(e) => setProjName(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Descripción (Opcional)</label>
              <textarea 
                className="w-full bg-secondary border border-input rounded-xl px-4 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring transition-colors h-20"
                placeholder="Indica el objetivo de este proyecto..." 
                value={projDesc}
                onChange={(e) => setProjDesc(e.target.value)}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button 
                type="button"
                onClick={() => setShowConfig(false)}
                className="flex-1 bg-secondary hover:bg-muted text-foreground py-2.5 rounded-xl text-xs font-medium transition-colors"
              >
                Volver
              </button>
              <button 
                type="submit"
                className="flex-1 bg-primary hover:opacity-90 text-primary-foreground py-2.5 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                Crear Proyecto <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-6">
            {/* Action Cards */}
            <div className="grid grid-cols-1 gap-4">
              
              {/* Only option: Native File System */}
              <div 
                id="btn-fsa-access"
                onClick={handleSelectFSA}
                className={`group border rounded-2xl p-5 cursor-pointer transition-all duration-300 flex flex-col text-left h-full ${
                  fsaSupported 
                    ? 'border-border bg-card hover:border-bento-blue/60 hover:shadow-card-hover' 
                    : 'border-border opacity-50 bg-muted cursor-not-allowed'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-bento-blue-light flex items-center justify-center text-bento-blue mb-4 transition-colors">
                  <HardDrive className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-foreground text-sm flex items-center gap-1.5 font-heading">
                  Carpeta del Computador
                  {!fsaSupported && <span className="text-[10px] bg-destructive/10 text-destructive font-mono px-2 py-0.5 rounded-full">Incompatible</span>}
                </h3>
                <p className="mt-1.5 text-muted-foreground text-xs leading-normal flex-1">
                  Usa la <strong>File System Access API</strong> de Chrome/Edge para guardar archivos JSON y Markdown reales directo a tu disco duro.
                </p>
                <span className="mt-4 text-[11px] text-bento-blue font-medium group-hover:underline flex items-center gap-1">
                  Dar acceso a carpeta <ArrowRight className="w-3 h-3" />
                </span>
              </div>

            </div>
          </div>
        )}

        {/* Informative Footer */}
        <div className="mt-8 pt-5 border-t border-border text-center flex items-center justify-center gap-4 text-xs text-muted-foreground font-mono">
          <span className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-bento-blue/70" />
            Es 100% privado. Ningún dato viaja a servidores externos.
          </span>
          <a 
            href="https://github.com/lorspi/Kora" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-foreground transition-colors"
            title="Ver repositorio en GitHub"
          >
            <Github className="w-4 h-4" />
            GitHub
          </a>
        </div>
      </div>
      <VersionBadge />
    </div>
  );
}
