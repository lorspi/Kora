/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * "Nuevo Proyecto": choose between a folder of the computer and a cloud project
 * (Firebase). Shared by the home screen and the sidebar's project manager.
 */
import React, { useState, lazy, Suspense } from 'react';
import { useProjectStore } from '../store';
import { HardDrive, ArrowRight, X, Cloud } from '@phosphor-icons/react';
import { saveDirectoryHandleWithKey } from '../lib/fs';
const FirebaseLinkDialog = lazy(() => import('./FirebaseLinkDialog'));

interface Props {
  onClose: () => void;
  /** Something went wrong (or the folder picker was cancelled) */
  onError: (message: string, cancelled: boolean) => void;
  /** Called before starting either option, e.g. to clear a previous error */
  onStart?: () => void;
}

export default function NewProjectChooser({ onClose, onError, onStart }: Props) {
  const { registerProject, loadProjectById } = useProjectStore();
  const [fsaSupported] = useState<boolean>(() => 'showDirectoryPicker' in window);
  const [showFirebaseLink, setShowFirebaseLink] = useState(false);

  const handleSelectFSA = async () => {
    onStart?.();
    try {
      if (!('showDirectoryPicker' in window)) {
        throw new Error('Tu navegador no es compatible con la API de Acceso a Archivos Locales. Usa Chrome o Edge.');
      }
      const directoryHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });

      // Register the project first (we'll get the real name later from project.json)
      const projId = registerProject('Cargando...', 'FSA_API');

      // Save the handle with project-specific key
      await saveDirectoryHandleWithKey(directoryHandle, `fsa-handle-${projId}`);

      // Load the project
      await loadProjectById(projId);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        onError('Selección de carpeta cancelada por el usuario.', true);
      } else {
        onError(err.message || 'Error al abrir la carpeta.', false);
      }
    }
  };

  if (showFirebaseLink) {
    return (
      <Suspense fallback={
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      }>
        <FirebaseLinkDialog onClose={() => setShowFirebaseLink(false)} />
      </Suspense>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground font-heading">Nuevo Proyecto</h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          aria-label="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Option: Native File System (local, offline-first) */}
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

        {/* Option: Firebase cloud (realtime team sync) */}
        <div
          onClick={() => { onStart?.(); setShowFirebaseLink(true); }}
          className="group border border-border bg-card hover:border-bento-orange/60 hover:shadow-card-hover rounded-2xl p-5 cursor-pointer transition-all duration-300 flex flex-col text-left h-full"
        >
          <div className="w-10 h-10 rounded-xl bg-bento-orange-light flex items-center justify-center text-bento-orange mb-4 transition-colors">
            <Cloud className="w-5 h-5" />
          </div>
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-1.5 font-heading">
            Proyecto en la nube
            <span className="text-[10px] bg-bento-orange/10 text-bento-orange font-mono px-2 py-0.5 rounded-full">Tiempo real</span>
          </h3>
          <p className="mt-1.5 text-muted-foreground text-xs leading-normal flex-1">
            Conecta tu propio proyecto de <strong>Firebase</strong> para sincronizar al instante con todo el equipo, sin esperar a Drive ni Mega.
          </p>
          <span className="mt-4 text-[11px] text-bento-orange font-medium group-hover:underline flex items-center gap-1">
            Vincular Firebase <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </div>
  );
}
