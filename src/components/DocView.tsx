/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { useUI } from '../lib/ui';
import { useProjectStore } from '../store';
import { MarkdownPreview } from '../lib/markdown';
import { 
  Save, 
  Trash2, 
  Eye, 
  Edit3, 
  Bold, 
  Italic, 
  Heading1, 
  Heading2, 
  List, 
  ArrowLeftRight,
  Paperclip,
  Check,
  ChevronDown,
  ImageIcon,
  Film,
  FolderOpen
} from 'lucide-react';

export default function DocView() {
  const { 
    docs, 
    selectedDocId, 
    getDocContent, 
    saveDocContent, 
    deleteDoc, 
    uploadAttachment, 
    resolveAttachmentUrl,
    getDocViewMode,
    setDocViewMode,
    adapter
  } = useProjectStore();
  const { toast, confirm } = useUI();

  const docMeta = docs.find(d => d.id === selectedDocId);
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'edit' | 'preview' | 'split'>('split');
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<{ name: string; path: string; type: 'image' | 'video' }[]>([]);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedDocId) return;
    setLoading(true);
    getDocContent(selectedDocId).then(text => {
      setContent(text);
      setOriginalContent(text);
      setTitle(docMeta?.title || 'Sin Título');
      setHasChanges(false);
      setLoading(false);
    });
  }, [selectedDocId, docMeta?.id]);

  useEffect(() => {
    setHasChanges(content !== originalContent || title !== (docMeta?.title || ''));
  }, [content, title, originalContent, docMeta?.title]);

  useEffect(() => {
    if (!selectedDocId) return;
    const lastMode = getDocViewMode(selectedDocId);
    setMode(lastMode);
  }, [selectedDocId, getDocViewMode]);

  useEffect(() => {
    if (!selectedDocId) return;
    setDocViewMode(selectedDocId, mode);
  }, [selectedDocId, mode, setDocViewMode]);

  useEffect(() => {
    if (!content) return;
    const regex = /(?:attachments\/images\/[a-zA-Z0-9_\-\.]+|attachments\/videos\/[a-zA-Z0-9_\-\.]+)/g;
    const matches = content.match(regex) || [];
    const uniqueMatches = Array.from(new Set(matches));
    uniqueMatches.forEach(async (filePath: string) => {
      if (resolvedUrls[filePath]) return;
      const resolved = await resolveAttachmentUrl('/' + filePath);
      if (resolved) setResolvedUrls(prev => ({ ...prev, [filePath]: resolved }));
    });
  }, [content]);

  if (!docMeta) return null;

  const handleSave = async () => {
    if (!selectedDocId) return;
    setLoading(true);
    try {
      await saveDocContent(selectedDocId, title, content);
      setOriginalContent(content);
      setHasChanges(false);
    } catch (e) {
      toast('Error al guardar documento', 'error');
    } finally {
      setLoading(false);
    }
  };

  const injectSyntax = (before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);
    const replacement = before + (selected || '') + after;
    const newContent = text.substring(0, start) + replacement + text.substring(end);
    setContent(newContent);
    setTimeout(() => {
      textarea.focus();
      const nextPos = start + before.length + selected.length;
      textarea.setSelectionRange(nextPos, nextPos + after.length);
    }, 50);
  };

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { path } = await uploadAttachment(file);
      const relativePath = path.startsWith('/') ? path.substring(1) : path;
      const isVideo = file.type.startsWith('video/');
      if (isVideo) {
        injectSyntax(`\n<video src="${relativePath}" controls className="max-w-full rounded-xl border border-border"></video>\n`);
      } else {
        injectSyntax(`\n![${file.name}](${relativePath})\n`);
      }
    } catch (err: any) {
      toast('No se pudo adjuntar el archivo: ' + err.message, 'error');
    } finally {
      e.target.value = '';
    }
  };

  // Close attach menu on outside click
  useEffect(() => {
    if (!showAttachMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showAttachMenu]);

  const handleOpenMediaPicker = async () => {
    setShowAttachMenu(false);
    if (!adapter) return;
    try {
      const images = await adapter.listFiles('/attachments/images');
      const videos = await adapter.listFiles('/attachments/videos');
      const files = [
        ...images.map(name => ({ name, path: `/attachments/images/${name}`, type: 'image' as const })),
        ...videos.map(name => ({ name, path: `/attachments/videos/${name}`, type: 'video' as const }))
      ];
      setMediaFiles(files);
      setShowMediaPicker(true);
    } catch {
      setMediaFiles([]);
      setShowMediaPicker(true);
    }
  };

  const [mediaThumbs, setMediaThumbs] = useState<Record<string, string>>({});

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
      Object.values(mediaThumbs).forEach(url => URL.revokeObjectURL(url));
    };
  }, [showMediaPicker, mediaFiles]);

  const handleInsertFromLibrary = (file: { name: string; path: string; type: 'image' | 'video' }) => {
    const relativePath = file.path.startsWith('/') ? file.path.substring(1) : file.path;
    if (file.type === 'video') {
      injectSyntax(`\n<video src="${relativePath}" controls className="max-w-full rounded-xl border border-border"></video>\n`);
    } else {
      injectSyntax(`\n![${file.name}](${relativePath})\n`);
    }
    setShowMediaPicker(false);
  };

  const renderMarkdownPreview = () => (
    <MarkdownPreview
      content={content}
      resolvedUrls={resolvedUrls}
      className="pb-20"
      emptyMessage="Documento vacío. Escribe algo para comenzar."
    />
  );

  return (
    <div id="doc-view-container" className="flex-1 flex flex-col h-full bg-background font-body overflow-hidden">
      
      {/* Editorial Header Ribbon */}
      <div className="bg-card border-b border-border px-3 sm:px-6 py-3 sm:py-4 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <input 
            type="text"
            className="w-full bg-transparent border-0 text-base sm:text-lg font-bold text-foreground hover:bg-accent focus:bg-card px-2 py-1 rounded-xl focus:outline-none transition-colors focus:ring-1 focus:ring-ring font-heading"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="text-[10px] text-muted-foreground font-mono px-2 mt-0.5 flex items-center gap-1 truncate">
            <span>Formato: Markdown legible. Archivo:</span>
            <span className="text-foreground font-semibold truncate">/docs/{docMeta.filename}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <div className="bg-secondary p-1 border border-border rounded-xl flex">
            {(['edit', 'split', 'preview'] as const).map(m => {
              const icons = { edit: Edit3, split: ArrowLeftRight, preview: Eye };
              const labels = { edit: 'Editar', split: 'Dividido', preview: 'Lectura' };
              const Icon = icons[m];
              return (
                <button 
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1 cursor-pointer transition-colors ${
                    mode === m ? 'bg-primary text-primary-foreground shadow-card' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {labels[m]}
                </button>
              );
            })}
          </div>

          <button
            onClick={handleSave}
            disabled={!hasChanges || loading}
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

          <button
            onClick={async () => {
              const ok = await confirm({ title: 'Eliminar documento', message: '¿Eliminar de forma permanente este archivo Markdown? Esta acción no se puede deshacer.', confirmLabel: 'Eliminar', variant: 'danger' });
              if (ok) deleteDoc(docMeta.id);
            }}
            className="p-2 bg-card border border-border text-muted-foreground hover:text-destructive rounded-xl hover:bg-destructive/10 transition-colors cursor-pointer"
            title="Eliminar documento (.md)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Editor Main body container */}
      <div className="flex-1 overflow-hidden flex flex-col sm:flex-row">
        
        {(mode === 'edit' || mode === 'split') && (
          <div className="flex-1 h-full flex flex-col bg-card border-r border-border">
            <div className="bg-secondary border-b border-border px-4 py-2 flex items-center gap-1 text-muted-foreground shrink-0 select-none relative z-10">
              <button onClick={() => injectSyntax('**', '**')} className="p-1.5 hover:text-foreground hover:bg-accent rounded transition-all cursor-pointer" title="Negrita (**)">
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => injectSyntax('*', '*')} className="p-1.5 hover:text-foreground hover:bg-accent rounded transition-all cursor-pointer" title="Cursiva (*)">
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => injectSyntax('# ')} className="p-1.5 hover:text-foreground hover:bg-accent rounded transition-all cursor-pointer" title="Encabezado H1">
                <Heading1 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => injectSyntax('## ')} className="p-1.5 hover:text-foreground hover:bg-accent rounded transition-all cursor-pointer" title="Encabezado H2">
                <Heading2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => injectSyntax('- ')} className="p-1.5 hover:text-foreground hover:bg-accent rounded transition-all cursor-pointer" title="Lista de viñetas">
                <List className="w-3.5 h-3.5" />
              </button>
              <span className="w-px h-4 bg-border mx-2"></span>
              <div className="relative" ref={attachMenuRef}>
                <button
                  onClick={() => setShowAttachMenu(!showAttachMenu)}
                  className="p-1.5 hover:text-foreground hover:bg-accent rounded transition-all cursor-pointer flex items-center gap-1"
                  title="Adjuntar imagen o video"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-semibold">Adjuntar</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showAttachMenu && (
                  <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-xl shadow-card-hover py-1 z-50 min-w-[200px]">
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
            </div>

            <textarea
              ref={textareaRef}
              className="flex-1 w-full bg-card text-foreground p-6 text-xs font-mono focus:outline-none resize-none leading-relaxed"
              style={{ tabSize: 2 }}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="# Nuevo Documento&#10;&#10;Soporta Markdown, imágenes, listas y videos..."
            />
          </div>
        )}

        {(mode === 'preview' || mode === 'split') && (
          <div className="flex-1 h-full bg-background p-8 overflow-y-auto">
            <div className="max-w-2xl mx-auto">
              <h1 className="text-3xl font-black text-foreground mb-6 border-b border-border pb-3 font-heading">{title}</h1>
              {renderMarkdownPreview()}
            </div>
          </div>
        )}
      </div>

      {/* Media Library Picker Modal */}
      {showMediaPicker && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-foreground/20 backdrop-blur-[2px] animate-fade-in" onClick={() => setShowMediaPicker(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-card-hover w-full max-w-lg mx-4 max-h-[75vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border shrink-0">
              <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-bento-blue" />
                Biblioteca de Medios
              </h2>
              <button onClick={() => setShowMediaPicker(false)} className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                ✕
              </button>
            </div>
            <p className="px-5 pt-3 text-[10px] text-muted-foreground">Haz clic en un archivo para insertarlo en el documento.</p>
            <div className="flex-1 overflow-y-auto p-4">
              {mediaFiles.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No hay archivos en la biblioteca de medios.</p>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {mediaFiles.map(file => (
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
                      {/* Type badge */}
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
