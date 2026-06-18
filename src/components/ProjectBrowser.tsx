/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useProjectStore } from '../store';
import { RegisteredProject } from '../types';
import { FsMode, dbClear, dbSet, normalizePath } from '../lib/fs';
import JSZip from 'jszip';
import { 
  FolderOpen, HardDrive, Cpu, AlertTriangle, FileArchive, 
  ArrowRight, Github, Download, LogIn, LogOut, Plus, X,
  HelpCircle
} from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import VersionBadge from './VersionBadge';
import { useUpdateCheck } from '../hooks/useVersion';
import { loadSavedSessions } from '../store/sessions';

export default function ProjectBrowser() {
  const { registeredProjects, registerProject, loadProjectById, isLoading, unregisterProject } = useProjectStore();
  const { updateAvailable, remoteVersion, localVersion, performUpdate } = useUpdateCheck();
  const [fsaSupported] = useState<boolean>(() => 'showDirectoryPicker' in window);

  const [showNewProject, setShowNewProject] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);

  // Load auth statuses
  const [authStatuses, setAuthStatuses] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const sessions = loadSavedSessions();
    const statuses: Record<string, boolean> = {};
    for (const p of registeredProjects) {
      statuses[p.id] = !!sessions[p.id];
    }
    setAuthStatuses(statuses);
  }, [registeredProjects]);

  const handleOpenProject = async (project: RegisteredProject) => {
    setErrorMsg(null);
    setLoadingProjectId(project.id);
    setLoading(true);
    try {
      await loadProjectById(project.id);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al cargar el proyecto.');
      setLoadingProjectId(null);
      setLoading(false);
    }
  };

  const handleSelectFSA = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      if (!('showDirectoryPicker' in window)) {
        throw new Error('Tu navegador no es compatible con la API de Acceso a Archivos Locales. Usa Chrome o Edge, o selecciona el "Disco Virtual".');
      }
      const directoryHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      const { saveDirectoryHandleWithKey } = await import('../lib/fs');
      
      // Register the project first (we'll get the real name later from project.json)
      const projId = registerProject('Cargando...', 'FSA_API');
      
      // Save the handle with project-specific key
      await saveDirectoryHandleWithKey(directoryHandle, `fsa-handle-${projId}`);
      
      // Load the project
      await loadProjectById(projId);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setErrorMsg('Selección de carpeta cancelada por el usuario.');
      } else {
        setErrorMsg(err.message || 'Error al abrir la carpeta.');
      }
      setLoading(false);
    }
  };

  const handleSelectVirtual = async () => {
    setErrorMsg(null);
    
    // Check if virtual project already exists
    const virtualProject = registeredProjects.find(p => p.type === 'VIRTUAL');
    if (virtualProject) {
      setErrorMsg('Ya tienes un proyecto de Disco Virtual. Solo se permite uno para no saturar el almacenamiento del navegador. Puedes abrirlo desde la lista o crear un proyecto de Carpeta del Computador.');
      return;
    }

    setLoading(true);
    try {
      const projId = registerProject('Mi Proyecto Virtual', 'VIRTUAL');
      await loadProjectById(projId);
    } catch (err: any) {
      setErrorMsg('Error al cargar el entorno virtual: ' + err.message);
      setLoading(false);
    }
  };

  const handleZipImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setErrorMsg(null);
    setLoading(true);
    try {
      const virtualProject = registeredProjects.find(p => p.type === 'VIRTUAL');
      if (virtualProject) {
        throw new Error('Ya tienes un proyecto de Disco Virtual. Solo se permite uno.');
      }

      const zip = await JSZip.loadAsync(file);
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
      
      const projId = registerProject('Proyecto Importado', 'VIRTUAL');
      await loadProjectById(projId);
    } catch (err: any) {
      setErrorMsg('Error al importar el ZIP: ' + err.message);
      setLoading(false);
    } finally {
      e.target.value = '';
    }
  };

  // Loading state for project loading
  if (loading && loadingProjectId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-foreground">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="font-mono text-muted-foreground">Cargando proyecto...</p>
        </div>
      </div>
    );
  }

  return (
    <div id="project-browser" className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 select-none font-body relative">
      {/* Theme toggle top-right */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="max-w-3xl w-full bg-card backdrop-blur-md rounded-2xl p-8 border border-border shadow-card-hover relative overflow-hidden">
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

        {showNewProject ? (
          <div className="space-y-5 animate-fade-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground font-heading">Nuevo Proyecto</h2>
              <button
                onClick={() => setShowNewProject(false)}
                className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Option A: Native File System */}
              <div 
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
                onClick={handleSelectVirtual}
                className={`group border rounded-2xl p-5 cursor-pointer transition-all duration-300 flex flex-col text-left h-full ${
                  registeredProjects.some(p => p.type === 'VIRTUAL')
                    ? 'border-border opacity-50 bg-muted cursor-not-allowed'
                    : 'border-border bg-card hover:border-bento-orange/60 hover:shadow-card-hover'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-bento-orange-light flex items-center justify-center text-bento-orange mb-4 transition-colors">
                  <Cpu className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-foreground text-sm font-heading">
                  Disco Virtual en Navegador
                  {registeredProjects.some(p => p.type === 'VIRTUAL') && <span className="text-[10px] bg-destructive/10 text-destructive font-mono px-2 py-0.5 rounded-full ml-1.5">Solo uno</span>}
                </h3>
                <p className="mt-1.5 text-muted-foreground text-xs leading-normal flex-1">
                  Todo lo que hagas se almacenará en el <strong>almacenamiento local</strong> de tu navegador. Tus datos no salen de tu dispositivo.
                </p>
                <span className="mt-4 text-[11px] text-bento-orange font-medium group-hover:underline flex items-center gap-1">
                  Crear Disco Virtual <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </div>

            <div className="flex justify-center pt-2">
              <label 
                className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 bg-secondary hover:bg-muted border border-border rounded-xl text-foreground text-xs font-medium transition-colors"
              >
                <FileArchive className="w-4 h-4 text-muted-foreground" />
                Importar desde ZIP
                <input 
                  type="file" 
                  accept=".zip" 
                  className="hidden" 
                  onChange={handleZipImport}
                />
              </label>
            </div>
          </div>
        ) : registeredProjects.length === 0 ? (
          /* Empty state — no projects yet */
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
                <FolderOpen className="w-8 h-8 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-bold text-foreground font-heading mb-2">¡Bienvenido a Kora!</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Aún no tienes proyectos vinculados. Crea tu primer proyecto para empezar a organizar tus tareas y documentos.
              </p>
            </div>

            <button
              onClick={() => setShowNewProject(true)}
              className="w-full bg-primary hover:opacity-90 text-primary-foreground font-bold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Vincular Nuevo Proyecto
            </button>

            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground font-mono pt-2">
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
        ) : (
          /* Project list */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground font-heading">
                Mis Proyectos
                <span className="text-xs font-normal text-muted-foreground ml-2">({registeredProjects.length})</span>
              </h2>
              <button
                onClick={() => setShowNewProject(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:opacity-90 text-primary-foreground rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Nuevo
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {registeredProjects.map(project => {
                const isAuthenticated = !!authStatuses[project.id];
                return (
                  <div
                    key={project.id}
                    className="group relative border border-border bg-card hover:border-bento-blue/50 hover:shadow-card-hover rounded-2xl p-4 transition-all duration-300 cursor-pointer"
                    onClick={() => handleOpenProject(project)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        project.type === 'VIRTUAL' 
                          ? 'bg-bento-orange-light text-bento-orange'
                          : 'bg-bento-blue-light text-bento-blue'
                      }`}>
                        {project.type === 'VIRTUAL' 
                          ? <Cpu className="w-4 h-4" />
                          : <HardDrive className="w-4 h-4" />
                        }
                      </div>
                      <div className="flex items-center gap-1.5">
                        {/* Auth indicator */}
                        {isAuthenticated ? (
                          <span className="flex items-center gap-1 text-[10px] text-bento-green font-semibold bg-bento-green-light px-2 py-0.5 rounded-full border border-bento-green/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-bento-green"></span>
                            Sesión activa
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-semibold bg-secondary px-2 py-0.5 rounded-full border border-border">
                            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground"></span>
                            Sin sesión
                          </span>
                        )}
                        {/* Unlink button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`¿Desvincular "${project.name}"? Los datos del proyecto no se eliminarán, solo se quitará de la lista.`)) {
                              unregisterProject(project.id);
                            }
                          }}
                          className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                          title="Desvincular proyecto"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <h3 className="font-semibold text-foreground text-sm truncate">{project.name}</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {project.type === 'VIRTUAL' ? 'Disco Virtual' : 'Carpeta Local'}
                      {project.pathHint && <span className="ml-1">· {project.pathHint}</span>}
                    </p>

                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(project.createdAt).toLocaleDateString()}
                      </span>
                      <span className="text-[10px] font-medium text-bento-blue group-hover:underline flex items-center gap-0.5">
                        Abrir <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-center gap-4 pt-4 text-xs text-muted-foreground font-mono border-t border-border">
              <span className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-bento-blue/70" />
                100% privado
              </span>
              <a 
                href="https://github.com/lorspi/Kora" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-foreground transition-colors"
              >
                <Github className="w-4 h-4" />
                GitHub
              </a>
            </div>
          </div>
        )}
      </div>
      <VersionBadge />
    </div>
  );
}
