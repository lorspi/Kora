/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '../store';
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
  Check
} from 'lucide-react';

export default function DocView() {
  const { 
    docs, 
    selectedDocId, 
    getDocContent, 
    saveDocContent, 
    deleteDoc, 
    uploadAttachment, 
    resolveAttachmentUrl 
  } = useProjectStore();

  const docMeta = docs.find(d => d.id === selectedDocId);
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'edit' | 'preview' | 'split'>('split');
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});

  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      alert('Error al guardar documento');
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
      alert('No se pudo adjuntar el archivo: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  const renderMarkdownPreview = () => {
    if (!content) return <span className="text-muted-foreground italic text-xs">Documento vacío. Escribe algo para comenzar.</span>;

    let html = content;

    html = html.replace(/!\[(.*?)\]\((attachments\/images\/.*?)\)/g, (match, alt, filePath) => {
      const resolved = resolvedUrls[filePath] || '';
      return `<div class="my-4"><img src="${resolved}" alt="${alt}" class="rounded-xl max-h-96 mx-auto border border-border shadow-card" referrerPolicy="no-referrer" /><span class="block text-center text-[10px] text-muted-foreground mt-1 font-mono">${alt}</span></div>`;
    });

    html = html.replace(/<video src="(attachments\/videos\/.*?)"(.*?)><\/video>/g, (match, filePath, attrs) => {
      const resolved = resolvedUrls[filePath] || '';
      return `<video src="${resolved}" class="max-w-full rounded-xl border border-border shadow-card mx-auto my-4" controls ${attrs}></video>`;
    });

    html = html.replace(/^# (.*?)$/gm, '<h1 class="text-2xl font-black text-foreground border-b border-border mt-6 mb-3 pb-2">$1</h1>');
    html = html.replace(/^## (.*?)$/gm, '<h2 class="text-lg font-bold text-foreground mt-5 mb-2">$1</h2>');
    html = html.replace(/^### (.*?)$/gm, '<h3 class="text-sm font-bold text-foreground mt-4 mb-2">$1</h3>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/`(.*?)`/g, '<code class="bg-secondary text-bento-orange font-mono px-1.5 py-0.5 rounded text-[11px]">$1</code>');
    html = html.replace(/^> (.*?)$/gm, '<blockquote class="border-l-4 border-bento-blue bg-bento-blue-light pl-4 py-2 text-foreground rounded-r-lg my-3 font-medium">$1</blockquote>');
    html = html.replace(/^- (.*?)$/gm, '<li class="list-disc ml-5 text-muted-foreground py-0.5">$1</li>');

    const lines = html.split('\n');
    const enrichedLines = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed) return '<div class="h-3"></div>';
      if (trimmed.startsWith('<h') || trimmed.startsWith('<div') || trimmed.startsWith('<li') || trimmed.startsWith('<blockquote') || trimmed.startsWith('<video')) return line;
      return `<p class="py-1 text-muted-foreground leading-relaxed text-xs">${line}</p>`;
    });

    return (
      <div 
        className="prose max-w-full font-body select-text pb-20"
        dangerouslySetInnerHTML={{ __html: enrichedLines.join('\n') }}
      />
    );
  };

  return (
    <div id="doc-view-container" className="flex-1 flex flex-col h-full bg-background font-body overflow-hidden">
      
      {/* Editorial Header Ribbon */}
      <div className="bg-card border-b border-border px-6 py-4 shrink-0 flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <input 
            type="text"
            className="w-full bg-transparent border-0 text-lg font-bold text-foreground hover:bg-accent focus:bg-card px-2 py-1 rounded-xl focus:outline-none transition-colors focus:ring-1 focus:ring-ring font-heading"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="text-[10px] text-muted-foreground font-mono px-2 mt-0.5 flex items-center gap-1">
            <span>Formato: Markdown legible. Archivo:</span>
            <span className="text-foreground font-semibold">/docs/{docMeta.filename}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
            onClick={() => {
              if (confirm('¿Eliminar de forma permanente este archivo Markdown?')) deleteDoc(docMeta.id);
            }}
            className="p-2 bg-card border border-border text-muted-foreground hover:text-destructive rounded-xl hover:bg-destructive/10 transition-colors cursor-pointer"
            title="Eliminar documento (.md)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Editor Main body container */}
      <div className="flex-1 overflow-hidden flex">
        
        {(mode === 'edit' || mode === 'split') && (
          <div className="flex-1 h-full flex flex-col bg-card border-r border-border">
            <div className="bg-secondary border-b border-border px-4 py-2 flex items-center gap-1 text-muted-foreground shrink-0 select-none overflow-x-auto">
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
              <label className="p-1.5 hover:text-foreground hover:bg-accent rounded transition-all cursor-pointer flex items-center justify-center gap-1">
                <Paperclip className="w-3.5 h-3.5" />
                <span className="text-[10px] font-semibold">Adjuntar Imágenes / Videos Locales</span>
                <input type="file" accept="image/*,video/*" onChange={handleAttachmentUpload} className="hidden" />
              </label>
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
    </div>
  );
}
