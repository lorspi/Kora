/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useProjectStore } from '../store';
import { FolderOpen, HardDrive, HelpCircle, AlertTriangle, FileArchive, ArrowRight, Cpu, Github } from 'lucide-react';
import { FsMode, FileSystemAdapter, dbClear, dbSet, normalizePath } from '../lib/fs';
import JSZip from 'jszip';
import ThemeToggle from './ThemeToggle';

export default function LoadFolderScreen() {
  const { loadProjectDirectory, createBlankProject, seedSampleProject, adapter } = useProjectStore();
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
        throw new Error('Tu navegador no es compatible con la API de Acceso a Archivos Locales. Usa Chrome o Edge, o selecciona el "Disco Virtual".');
      }
      const directoryHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      await loadProjectDirectory(directoryHandle, 'FSA_API');
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setErrorMsg('Selección de carpeta cancelada por el usuario.');
      } else {
        setErrorMsg('Error al abrir la carpeta. Nota: Las políticas de iframe de Chrome a veces bloquean el diálogo en previsualizaciones. Si esto falla, te sugerimos abrir en una pestaña nueva o usar "Disco Virtual en Navegador".');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectVirtual = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      await loadProjectDirectory(null, 'VIRTUAL');
    } catch (err: any) {
      setErrorMsg('Error al cargar el entorno virtual persistente: ' + err.message);
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

  const handleZipImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setErrorMsg(null);
    setLoading(true);
    try {
      const zip = await JSZip.loadAsync(file);
      const virtualAdapter = useProjectStore.getState().adapter || new FileSystemAdapter('VIRTUAL', null);
      await dbClear();
      
      let containsConfig = false;
      for (const [relativePath, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const normalized = normalizePath(relativePath);
        if (normalized.endsWith('config.json')) containsConfig = true;
        
        const isBinary = normalized.includes('/attachments/');
        if (isBinary) {
          const blob = await entry.async('blob');
          await dbSet(normalized, { content: blob, isBinary: true, lastModified: Date.now() });
        } else {
          const text = await entry.async('text');
          await dbSet(normalized, { content: text, isBinary: false, lastModified: Date.now() });
        }
      }
      
      if (!containsConfig) throw new Error('Archivo ZIP no es un proyecto compatible. Debe contener config.json en su estructura raíz.');
      await loadProjectDirectory(null, 'VIRTUAL');
    } catch (err: any) {
      setErrorMsg('Error al importar el ZIP: ' + err.message);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  return (
    <div id="loader-screen" className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 select-none font-body relative">
      {/* Theme toggle top-right */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="max-w-2xl w-full bg-card backdrop-blur-md rounded-2xl p-8 border border-border shadow-card-hover relative overflow-hidden">
        {/* Decorative Background Glows */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-bento-blue/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-bento-orange/10 rounded-full blur-3xl pointer-events-none"></div>
        
        {/* Product Heading */}
        <div className="text-center mb-8 relative">
          <div className="inline-flex items-center justify-center mb-4">
            <img src="/logo-light.svg?v=2" alt="Kora" className="h-12 dark:hidden" />
            <img src="/logo-dark.svg?v=2" alt="Kora" className="h-12 hidden dark:block" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground font-heading">
            Gestor de Proyectos Offline-First
          </h1>
          <p className="mt-2 text-muted-foreground text-sm max-w-md mx-auto">
            Edita, organiza y colabora sobre tus tareas con almacenamiento local y privado. Tus datos permanecen en tu control.
          </p>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Option A: Native File System */}
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

              {/* Option B: Simulated Sandbox Drive */}
              <div 
                id="btn-virtual-access"
                onClick={handleSelectVirtual}
                className="group border border-border bg-card hover:border-bento-orange/60 hover:shadow-card-hover rounded-2xl p-5 cursor-pointer transition-all duration-300 flex flex-col text-left h-full"
              >
                <div className="w-10 h-10 rounded-xl bg-bento-orange-light flex items-center justify-center text-bento-orange mb-4 transition-colors">
                  <Cpu className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-foreground text-sm font-heading">
                  Disco Virtual en Navegador
                </h3>
                <p className="mt-1.5 text-muted-foreground text-xs leading-normal flex-1">
                  Todo lo que hagas se almacenará en el <strong>almacenamiento local</strong> de tu navegador. Tus datos no salen de tu dispositivo.
                </p>
                <span className="mt-4 text-[11px] text-bento-orange font-medium group-hover:underline flex items-center gap-1">
                  Crear Disco Virtual <ArrowRight className="w-3 h-3" />
                </span>
              </div>

            </div>

            {/* Extra import Actions / ZIP Backups */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-border items-center justify-between">
              <div className="text-left">
                <span className="text-xs font-semibold text-foreground block">¿Tienes un backup en ZIP?</span>
                <span className="text-[11px] text-muted-foreground block mt-0.5">Puedes importar un archivo ZIP del proyecto para restaurarlo.</span>
              </div>
              <label 
                id="zip-import-label"
                className="cursor-pointer shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-secondary hover:bg-muted border border-border rounded-xl text-foreground text-xs font-medium transition-colors"
              >
                <FileArchive className="w-4 h-4 text-muted-foreground" />
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
    </div>
  );
}
