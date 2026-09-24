/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Document view. The editing surface is the TipTap-based editor
 * (components/editor/TipTapDocEditor); this component owns everything around it:
 * loading/saving the on-disk Markdown, unsaved-change tracking, collaborative
 * locking, the navigation guard, attachments, the header (title + filename rename)
 * and the raw-Markdown "code mode".
 *
 * The on-disk contract is unchanged: documents are raw Markdown strings. The editor
 * round-trips to the exact same dialect (see lib/tiptapMarkdown), so the read-only
 * MarkdownPreview elsewhere and the unsaved-changes diff keep working.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useUI } from '../lib/ui';
import { useProjectStore } from '../store';
import {
  FloppyDisk as Save,
  Trash as Trash2,
  Check,
  Paperclip,
  CaretDown as ChevronDown,
  Image as ImageIcon,
  FilmStrip as Film,
  FolderOpen,
  DotsThreeVertical as MoreVertical,
  FileCode,
  ShieldWarning as ShieldAlert,
} from '@phosphor-icons/react';
import TipTapDocEditor from './editor/TipTapDocEditor';
import type { TipTapDocEditorHandle } from './editor/TipTapDocEditor';
import { normalizeMarkdown } from '../lib/tiptapMarkdown';

export default function DocView() {
  const {
    docs,
    selectedDocId,
    getDocContent,
    saveDocContent,
    deleteDoc,
    uploadAttachment,
    resolveAttachmentUrl,
    renameDocFile,
    adapter,
    activeUser,
    locks,
    lockDoc,
    unlockDoc,
    setDocHasUnsavedChanges,
    pendingNavigationAction,
    confirmPendingNavigation,
    cancelPendingNavigation,
  } = useProjectStore();
  const { toast, confirm } = useUI();

  const [isLockedByOther, setIsLockedByOther] = useState(false);
  const [lockingUser, setLockingUser] = useState<string | null>(null);
  const heartbeatTimer = useRef<any>(null);
  const locksRef = useRef(locks);
  locksRef.current = locks;

  const docMeta = docs.find((d) => d.id === selectedDocId);

  const [title, setTitle] = useState('');
  const [currentMarkdown, setCurrentMarkdown] = useState('');
  const [initialMarkdown, setInitialMarkdown] = useState('');
  const [originalMarkdown, setOriginalMarkdown] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [loading, setLoading] = useState(false); // save-in-progress (button spinner)
  const [initialLoading, setInitialLoading] = useState(false); // first document load
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});
  const [editingFilename, setEditingFilename] = useState(false);
  const [filenameValue, setFilenameValue] = useState('');

  // Attachment + doc menus and code mode
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<{ name: string; path: string; type: 'image' | 'video' }[]>([]);
  const [mediaThumbs, setMediaThumbs] = useState<Record<string, string>>({});
  const [showDocMenu, setShowDocMenu] = useState(false);
  const [codeMode, setCodeMode] = useState(false);
  const docMenuRef = useRef<HTMLDivElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<TipTapDocEditorHandle>(null);

  // ── Load document ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedDocId) return;
    setInitialLoading(true);
    getDocContent(selectedDocId).then((text) => {
      const normalized = normalizeMarkdown(text);
      setInitialMarkdown(normalized);
      setCurrentMarkdown(normalized);
      setOriginalMarkdown(normalized);
      setTitle(docMeta?.title || 'Sin Título');
      setHasChanges(false);
      setCodeMode(false);
      setInitialLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDocId, docMeta?.id]);

  // ── Locked-by-other status ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedDocId || !activeUser) return;
    const activeLock = locks[selectedDocId];
    const now = Date.now();
    if (activeLock && activeLock.userId !== activeUser.id && activeLock.expiresAt > now) {
      setIsLockedByOther(true);
      setLockingUser(activeLock.username);
    } else {
      setIsLockedByOther(false);
      setLockingUser(null);
    }
  }, [selectedDocId, activeUser?.id, locks]);

  // ── Acquire lock + heartbeat ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedDocId || !activeUser) return;
    const acquireLock = async () => {
      const activeLock = locksRef.current[selectedDocId];
      const now = Date.now();
      if (!activeLock || activeLock.userId === activeUser.id || activeLock.expiresAt <= now) {
        await lockDoc(selectedDocId);
      }
    };
    acquireLock();
    heartbeatTimer.current = setInterval(acquireLock, 14000);
    return () => {
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      unlockDoc(selectedDocId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDocId, activeUser?.id]);

  // ── Track changes and sync to store for navigation interception ───────────────────
  useEffect(() => {
    const changed = currentMarkdown !== originalMarkdown || title !== (docMeta?.title || '');
    setHasChanges(changed);
    setDocHasUnsavedChanges(changed);
  }, [currentMarkdown, title, originalMarkdown, docMeta?.title, setDocHasUnsavedChanges]);

  // ── Save ─────────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!selectedDocId) return false;
    setLoading(true);
    try {
      // In block mode read from the editor; in code mode currentMarkdown is source of truth.
      const markdown = codeMode ? currentMarkdown : (editorRef.current?.getMarkdown() ?? currentMarkdown);
      await saveDocContent(selectedDocId, title, markdown);
      setOriginalMarkdown(markdown);
      setCurrentMarkdown(markdown);
      // Keep the editor's mount baseline in sync so a later remount doesn't
      // revert to pre-save content.
      setInitialMarkdown(markdown);
      setHasChanges(false);
      return true;
    } catch {
      toast('Error al guardar documento', 'error');
      return false;
    } finally {
      setLoading(false);
    }
  }, [selectedDocId, codeMode, currentMarkdown, title, saveDocContent, toast]);

  // ── Navigation guard (unsaved changes) ─────────────────────────────────────────────
  const isHandlingRef = useRef(false);
  useEffect(() => {
    if (!pendingNavigationAction || isHandlingRef.current) return;
    isHandlingRef.current = true;

    const handlePendingNavigation = async () => {
      const result = await confirm({
        title: 'Cambios sin guardar',
        message: 'Tienes cambios sin guardar en este documento. ¿Quieres guardarlos antes de salir?',
        confirmLabel: 'Guardar',
        cancelLabel: 'Cancelar',
        neutralLabel: 'Salir sin guardar',
      });

      if (result === true) {
        const saved = await handleSave();
        if (saved) confirmPendingNavigation();
        else cancelPendingNavigation();
      } else if (result === 'neutral') {
        confirmPendingNavigation();
      } else {
        cancelPendingNavigation();
      }
      isHandlingRef.current = false;
    };

    handlePendingNavigation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNavigationAction]);

  // ── Resolve attachment URLs referenced in the document ────────────────────────────
  useEffect(() => {
    if (!currentMarkdown) return;
    const regex = /(?:attachments\/images\/[a-zA-Z0-9_\-\.]+|attachments\/videos\/[a-zA-Z0-9_\-\.]+)/g;
    const matches = currentMarkdown.match(regex) || [];
    const uniqueMatches = Array.from(new Set(matches));
    uniqueMatches.forEach(async (filePath: string) => {
      if (resolvedUrls[filePath]) return;
      const resolved = await resolveAttachmentUrl('/' + filePath);
      if (resolved) setResolvedUrls((prev) => ({ ...prev, [filePath]: resolved }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMarkdown]);

  // ── Ctrl/Cmd+S to save (undo/redo handled internally by TipTap) ───────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (hasChanges) handleSave();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [hasChanges, handleSave]);

  // ── Attachment handling ───────────────────────────────────────────────────────────
  const insertAttachment = useCallback((relativePath: string, name: string, isVideo: boolean) => {
    if (codeMode) {
      // Append markdown source directly in code mode.
      const snippet = isVideo ? `<video src="${relativePath}" controls></video>` : `![${name}](${relativePath})`;
      setCurrentMarkdown((prev) => (prev ? prev + '\n' + snippet : snippet));
      return;
    }
    if (isVideo) editorRef.current?.insertVideo(relativePath);
    else editorRef.current?.insertImage(relativePath, name);
  }, [codeMode]);

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { path } = await uploadAttachment(file);
      const relativePath = path.startsWith('/') ? path.substring(1) : path;
      insertAttachment(relativePath, file.name, file.type.startsWith('video/'));
    } catch (err: any) {
      toast('No se pudo adjuntar el archivo: ' + err.message, 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleOpenMediaPicker = async () => {
    setShowAttachMenu(false);
    if (!adapter) return;
    try {
      const images = await adapter.listFiles('/attachments/images');
      const videos = await adapter.listFiles('/attachments/videos');
      setMediaFiles([
        ...images.map((name) => ({ name, path: `/attachments/images/${name}`, type: 'image' as const })),
        ...videos.map((name) => ({ name, path: `/attachments/videos/${name}`, type: 'video' as const })),
      ]);
      setShowMediaPicker(true);
    } catch {
      setMediaFiles([]);
      setShowMediaPicker(true);
    }
  };

  const handleInsertFromLibrary = (file: { name: string; path: string; type: 'image' | 'video' }) => {
    const relativePath = file.path.startsWith('/') ? file.path.substring(1) : file.path;
    insertAttachment(relativePath, file.name, file.type === 'video');
    setShowMediaPicker(false);
  };

  // Close attach menu on outside click
  useEffect(() => {
    if (!showAttachMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) setShowAttachMenu(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showAttachMenu]);

  // Close doc menu on outside click
  useEffect(() => {
    if (!showDocMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (docMenuRef.current && !docMenuRef.current.contains(e.target as Node)) setShowDocMenu(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showDocMenu]);

  // Load thumbnails when media picker opens
  useEffect(() => {
    if (!showMediaPicker || !adapter || mediaFiles.length === 0) return;
    let cancelled = false;
    const loadThumbs = async () => {
      const thumbs: Record<string, string> = {};
      for (const file of mediaFiles) {
        if (cancelled) break;
        try {
          const blob = await adapter.readBinaryFile(file.path);
          thumbs[file.path] = URL.createObjectURL(blob);
        } catch { /* skip */ }
      }
      if (!cancelled) setMediaThumbs(thumbs);
    };
    loadThumbs();
    return () => {
      cancelled = true;
      Object.values(mediaThumbs).forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMediaPicker, mediaFiles]);

  // ── Toggle code mode: sync markdown between the two views ──────────────────────────
  const toggleCodeMode = () => {
    if (!codeMode) {
      // Entering code mode: pull latest markdown from the editor.
      const md = editorRef.current?.getMarkdown() ?? currentMarkdown;
      setCurrentMarkdown(md);
      setCodeMode(true);
    } else {
      // Leaving code mode: push edited markdown back into the editor.
      editorRef.current?.setMarkdown(currentMarkdown);
      setInitialMarkdown(currentMarkdown);
      setCodeMode(false);
    }
    setShowDocMenu(false);
  };

  if (!docMeta) return null;

  return (
    <div id="doc-view-container" className="flex-1 flex flex-col h-full bg-background font-body overflow-hidden">
      {isLockedByOther && (
        <div className="bg-bento-yellow-light border-b border-border p-3 flex items-center gap-2.5 text-bento-yellow text-xs shrink-0 select-none">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <div className="flex-1 font-semibold">
            Documento de solo lectura: @{lockingUser} está editando este archivo desde otra terminal ahora mismo.
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-card border-b border-border px-3 sm:px-6 py-3 sm:py-4 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <input
            type="text"
            disabled={isLockedByOther}
            className="w-full bg-transparent border-0 text-base sm:text-lg font-bold text-foreground hover:bg-accent focus:bg-card px-2 py-1 rounded-xl focus:outline-none transition-colors focus:ring-1 focus:ring-ring font-heading disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="text-[10px] text-muted-foreground font-mono px-2 mt-0.5 flex items-center gap-1 truncate">
            <span>Formato: Markdown legible. Archivo:</span>
            {editingFilename ? (
              <form
                className="inline-flex items-center gap-1"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (filenameValue.trim() && selectedDocId) await renameDocFile(selectedDocId, filenameValue);
                  setEditingFilename(false);
                }}
              >
                <span className="text-muted-foreground">/docs/{docMeta.folder ? `${docMeta.folder}/` : ''}</span>
                <input
                  type="text"
                  autoFocus
                  className="bg-card border border-input rounded px-1 py-0 text-[10px] font-mono text-foreground focus:outline-none focus:border-ring w-32"
                  value={filenameValue}
                  onChange={(e) => setFilenameValue(e.target.value)}
                  onBlur={async () => {
                    if (filenameValue.trim() && selectedDocId) await renameDocFile(selectedDocId, filenameValue);
                    setEditingFilename(false);
                  }}
                  onKeyDown={(e) => { if (e.key === 'Escape') setEditingFilename(false); }}
                />
              </form>
            ) : (
              <button
                onClick={() => {
                  if (!isLockedByOther) {
                    setFilenameValue(docMeta.filename);
                    setEditingFilename(true);
                  }
                }}
                className="text-foreground font-semibold truncate hover:underline hover:text-bento-blue transition-colors cursor-pointer"
                title="Clic para renombrar archivo"
              >
                /docs/{docMeta.folder ? `${docMeta.folder}/` : ''}{docMeta.filename}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Attachment button */}
          <div className="relative" ref={attachMenuRef}>
            <button
              onClick={() => !isLockedByOther && setShowAttachMenu(!showAttachMenu)}
              disabled={isLockedByOther}
              className="p-2 bg-card border border-border text-muted-foreground hover:text-foreground rounded-xl hover:bg-accent transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Adjuntar imagen o video"
            >
              <Paperclip className="w-3.5 h-3.5" />
              <ChevronDown className="w-3 h-3" />
            </button>
            {showAttachMenu && (
              <div className="absolute top-full mt-1 left-0 sm:right-0 sm:left-auto bg-card border border-border rounded-xl shadow-card-hover py-1 z-50 min-w-[200px]">
                <label className="flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent cursor-pointer transition-colors">
                  <FolderOpen className="w-3.5 h-3.5 text-muted-foreground" />
                  Desde archivo
                  <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={(e) => { handleAttachmentUpload(e); setShowAttachMenu(false); }} className="hidden" />
                </label>
                <button
                  onClick={handleOpenMediaPicker}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent cursor-pointer transition-colors text-left"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                  Desde biblioteca de medios
                </button>
              </div>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={!hasChanges || loading || isLockedByOther}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all outline-none border cursor-pointer ${
              hasChanges
                ? 'bg-primary hover:opacity-90 text-primary-foreground border-primary shadow-card'
                : 'bg-secondary text-muted-foreground border-border cursor-not-allowed'
            }`}
          >
            {loading ? (
              <div className="w-3.5 h-3.5 border-b-2 border-primary rounded-full animate-spin"></div>
            ) : hasChanges ? (
              <Save className="w-3.5 h-3.5" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Guardar
          </button>

          <div className="relative" ref={docMenuRef}>
            <button
              onClick={() => setShowDocMenu(!showDocMenu)}
              disabled={isLockedByOther}
              className="p-2 bg-card border border-border text-muted-foreground hover:text-foreground rounded-xl hover:bg-accent transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Opciones del documento"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
            {showDocMenu && (
              <div className="absolute top-full right-0 mt-1 bg-card border border-border rounded-xl shadow-card-hover py-1 z-50 min-w-[180px]">
                <button
                  onClick={toggleCodeMode}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer transition-colors text-left"
                >
                  <FileCode className="w-3.5 h-3.5" />
                  {codeMode ? 'Modo bloques' : 'Modo código'}
                </button>
                <button
                  disabled={isLockedByOther}
                  onClick={async () => {
                    setShowDocMenu(false);
                    const ok = await confirm({ title: 'Eliminar documento', message: '¿Eliminar de forma permanente este archivo Markdown? Esta acción no se puede deshacer.', confirmLabel: 'Eliminar', variant: 'danger' });
                    if (ok) deleteDoc(docMeta.id);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-destructive cursor-pointer transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Eliminar documento
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Editor body */}
      {!codeMode ? (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
            {!initialLoading && (
              <TipTapDocEditor
                key={selectedDocId}
                ref={editorRef}
                initialMarkdown={initialMarkdown}
                readOnly={isLockedByOther}
                resolvedUrls={resolvedUrls}
                onChange={setCurrentMarkdown}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex flex-col">
          <textarea
            disabled={isLockedByOther}
            className="flex-1 w-full bg-card text-foreground p-6 text-xs font-mono focus:outline-none resize-none leading-relaxed disabled:opacity-60"
            style={{ tabSize: 2 }}
            value={currentMarkdown}
            onChange={(e) => setCurrentMarkdown(e.target.value)}
            placeholder="# Escribe en Markdown..."
          />
        </div>
      )}

      {/* Media Library Picker Modal */}
      {showMediaPicker && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-foreground/20 backdrop-blur-[2px] animate-fade-in" onClick={() => setShowMediaPicker(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-card-hover w-full max-w-lg mx-4 max-h-[75vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border shrink-0">
              <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-bento-blue" />
                Biblioteca de Medios
              </h2>
              <button onClick={() => setShowMediaPicker(false)} className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer">✕</button>
            </div>
            <p className="px-5 pt-3 text-[10px] text-muted-foreground">Haz clic en un archivo para insertarlo en el documento.</p>
            <div className="flex-1 overflow-y-auto p-4">
              {mediaFiles.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No hay archivos en la biblioteca de medios.</p>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {mediaFiles.map((file) => (
                    <button
                      key={file.path}
                      onClick={() => handleInsertFromLibrary(file)}
                      className="group relative flex flex-col items-center rounded-xl border border-border hover:border-bento-blue/50 bg-secondary hover:bg-accent overflow-hidden transition-all cursor-pointer"
                      title={file.name}
                    >
                      <div className="w-full aspect-square flex items-center justify-center overflow-hidden bg-secondary">
                        {mediaThumbs[file.path] ? (
                          file.type === 'video' ? (
                            <video src={mediaThumbs[file.path]} className="w-full h-full object-cover" muted />
                          ) : (
                            <img src={mediaThumbs[file.path]} alt={file.name} className="w-full h-full object-cover" />
                          )
                        ) : (
                          <div className="text-muted-foreground/30">
                            {file.type === 'video' ? <Film className="w-8 h-8" /> : <ImageIcon className="w-8 h-8" />}
                          </div>
                        )}
                      </div>
                      <div className="w-full px-2 py-1.5">
                        <span className="text-[9px] font-mono text-muted-foreground group-hover:text-foreground truncate block">{file.name}</span>
                      </div>
                      <span className={`absolute top-1.5 right-1.5 text-[7px] font-bold uppercase px-1 py-0.5 rounded ${
                        file.type === 'video' ? 'bg-bento-purple-light text-bento-purple' : 'bg-bento-blue-light text-bento-blue'
                      }`}>
                        {file.type === 'video' ? 'VID' : 'IMG'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
