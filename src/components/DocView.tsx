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
  FileImage, 
  FileVideo, 
  Bold, 
  Italic, 
  Heading1, 
  Heading2, 
  List, 
  ArrowLeftRight,
  Sparkles,
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
  
  // Doc values
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Views toggle
  const [mode, setMode] = useState<'edit' | 'preview' | 'split'>('split');
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load physical content from disk/virtual IndexedDB
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

  // Track key modifications
  useEffect(() => {
    setHasChanges(content !== originalContent || title !== (docMeta?.title || ''));
  }, [content, title, originalContent, docMeta?.title]);

  // Scan and pre-resolve all local file attachments embedded in Markdown
  // This allows the browser to render offline binary files (images/videos) natively using URL.createObjectURL!
  useEffect(() => {
    if (!content) return;
    const regex = /(?:attachments\/images\/[a-zA-Z0-9_\-\.]+|attachments\/videos\/[a-zA-Z0-9_\-\.]+)/g;
    const matches = content.match(regex) || [];
    
    // Resolve each unique local resource matching the RegExp
    const uniqueMatches = Array.from(new Set(matches));
    
    uniqueMatches.forEach(async (filePath: string) => {
      if (resolvedUrls[filePath]) return; // Already resolved
      const resolved = await resolveAttachmentUrl('/' + filePath);
      if (resolved) {
        setResolvedUrls(prev => ({
          ...prev,
          [filePath]: resolved
        }));
      }
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

  // Helper formatting injectors
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
    
    // Reset focus and cursor position
    setTimeout(() => {
      textarea.focus();
      const nextPos = start + before.length + selected.length;
      textarea.setSelectionRange(nextPos, nextPos + after.length);
    }, 50);
  };

  // Handle uploaded imagery in markdown
  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { path } = await uploadAttachment(file);
      // Remove starting slash for standard relative markdown pathing
      const relativePath = path.startsWith('/') ? path.substring(1) : path;
      
      const isVideo = file.type.startsWith('video/');
      if (isVideo) {
        // Embed controls tag
        injectSyntax(`\n<video src="${relativePath}" controls className="max-w-full rounded-xl border border-slate-700"></video>\n`);
      } else {
        // Embed standard markdown image
        injectSyntax(`\n![${file.name}](${relativePath})\n`);
      }
    } catch (err: any) {
      alert('No se pudo adjuntar el archivo: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  // Render a beautifully polished and resolved custom Markdown-like preview in real-time
  const renderMarkdownPreview = () => {
    if (!content) return <span className="text-slate-500 italic text-xs">Documento vacío. Escribe algo para comenzar.</span>;

    // Split paragraphs
    let html = content;

    // Escapes standard HTML of attachments safely or converts custom Markdown structures to rich elements
    // Replace all relative image triggers: ![alt](attachments/images/foo.png) -> resolved local blob URL
    html = html.replace(/!\[(.*?)\]\((attachments\/images\/.*?)\)/g, (match, alt, filePath) => {
      const resolved = resolvedUrls[filePath] || '';
      return `<div className="my-4"><img src="${resolved}" alt="${alt}" class="rounded-xl max-h-96 mx-auto border border-slate-800 shadow" referrerPolicy="no-referrer" /><span class="block text-center text-[10px] text-slate-500 mt-1 font-mono">${alt}</span></div>`;
    });

    // Replace all video HTML tags with local blob URLs: <video src="attachments/videos/foo.mp4" ...
    html = html.replace(/<video src="(attachments\/videos\/.*?)"(.*?)><\/video>/g, (match, filePath, attrs) => {
      const resolved = resolvedUrls[filePath] || '';
      return `<video src="${resolved}" class="max-w-full rounded-xl border border-slate-850 shadow mx-auto my-4" controls ${attrs}></video>`;
    });

    // Simple robust parsed formatting converters for offline Markdown representation
    // Headers conversion
    html = html.replace(/^# (.*?)$/gm, '<h1 class="text-2xl font-black text-slate-800 border-b border-slate-200 mt-6 mb-3 pb-2">$1</h1>');
    html = html.replace(/^## (.*?)$/gm, '<h2 class="text-lg font-bold text-slate-750 mt-5 mb-2">$1</h2>');
    html = html.replace(/^### (.*?)$/gm, '<h3 class="text-sm font-bold text-slate-700 mt-4 mb-2">$1</h3>');
    
    // Formatting syntax
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/`(.*?)`/g, '<code class="bg-slate-100 text-pink-600 font-mono px-1.5 py-0.5 rounded text-[11px]">$1</code>');
    
    // Block quotes
    html = html.replace(/^> (.*?)$/gm, '<blockquote class="border-l-4 border-indigo-650 bg-slate-50 pl-4 py-2 text-slate-600 rounded-r-lg my-3 font-medium">$1</blockquote>');
    
    // Lists formatting (bullets)
    html = html.replace(/^- (.*?)$/gm, '<li class="list-disc ml-5 text-slate-600 py-0.5">$1</li>');

    // Paragraph returns
    const lines = html.split('\n');
    const enrichedLines = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed) return '<div class="h-3"></div>';
      if (trimmed.startsWith('<h') || trimmed.startsWith('<div') || trimmed.startsWith('<li') || trimmed.startsWith('<blockquote') || trimmed.startsWith('<video')) {
        return line;
      }
      return `<p class="py-1 text-slate-650 leading-relaxed text-xs">${line}</p>`;
    });

    return (
      <div 
        className="prose prose-slate max-w-full font-sans select-text text-slate-650 pb-20"
        dangerouslySetInnerHTML={{ __html: enrichedLines.join('\n') }}
      />
    );
  };

  return (
    <div id="doc-view-container" className="flex-1 flex flex-col h-full bg-slate-100 font-sans overflow-hidden">
      
      {/* Editorial Header Ribbon */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0 flex items-center justify-between gap-4">
        
        {/* Title Editor */}
        <div className="flex-1 min-w-0">
          <input 
            type="text"
            className="w-full bg-transparent border-0 text-lg font-bold text-slate-800 hover:bg-slate-50 focus:bg-white px-2 py-1 rounded-xl focus:outline-none transition-colors border-b border-transparent focus:border-indigo-500"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="text-[10px] text-slate-400 font-mono px-2 mt-0.5 flex items-center gap-1">
            <span>Formato: Markdown legible. Archivo:</span>
            <span className="text-slate-500 font-semibold">/docs/{docMeta.filename}</span>
          </div>
        </div>

        {/* Toolbar controls */}
        <div className="flex items-center gap-2">
          
          {/* Switch tabs layout */}
          <div className="bg-slate-50 p-1 border border-slate-200 rounded-xl flex">
            <button 
              onClick={() => setMode('edit')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1 cursor-pointer transition-colors ${
                mode === 'edit' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
              title="Editor"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Editar
            </button>
            <button 
              onClick={() => setMode('split')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1 cursor-pointer transition-colors ${
                mode === 'split' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
              title="Vista Dividida"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              Dividido
            </button>
            <button 
              onClick={() => setMode('preview')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1 cursor-pointer transition-colors ${
                mode === 'preview' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
              title="Vista Completa"
            >
              <Eye className="w-3.5 h-3.5" />
              Lectura
            </button>
          </div>

          {/* Save button changes */}
          <button
            onClick={handleSave}
            disabled={!hasChanges || loading}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all outline-none border cursor-pointer ${
              hasChanges 
                ? 'bg-indigo-600 hover:bg-indigo-550 text-indigo-50 border-indigo-500 shadow shadow-indigo-600/10' 
                : 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
            }`}
          >
            {loading ? (
              <div className="w-3.5 h-3.5 border-b-2 border-indigo-600 rounded-full animate-spin"></div>
            ) : hasChanges ? (
              <Save className="w-3.5 h-3.5 text-white" />
            ) : (
              <Check className="w-3.5 h-3.5 text-slate-400" />
            )}
            Guardar
          </button>

          {/* Delete doc file altogether */}
          <button
            onClick={() => {
              if (confirm('¿Eliminar de forma permanente este archivo Markdown de tu almacenamiento? Esta acción es irreversible.')) {
                deleteDoc(docMeta.id);
              }
            }}
            className="p-2 bg-white border border-slate-200 text-slate-500 hover:text-red-655 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
            title="Eliminar documento (.md)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

        </div>

      </div>

      {/* Editor Main body container */}
      <div className="flex-1 overflow-hidden flex">
        
        {/* Column A: Syntactic Markdown Editor */}
        {(mode === 'edit' || mode === 'split') && (
          <div className="flex-1 h-full flex flex-col bg-white border-r border-slate-200">
            {/* Syntax formatting toolbar buttons */}
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center gap-1 text-slate-500 shrink-0 select-none overflow-x-auto">
              <button 
                onClick={() => injectSyntax('**', '**')}
                className="p-1.5 hover:text-slate-800 hover:bg-slate-100 rounded transition-all cursor-pointer animate-none"
                title="Negrita (**)"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => injectSyntax('*', '*')}
                className="p-1.5 hover:text-slate-800 hover:bg-slate-100 rounded transition-all cursor-pointer animate-none"
                title="Cursiva (*)"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => injectSyntax('# ')}
                className="p-1.5 hover:text-slate-800 hover:bg-slate-100 rounded transition-all cursor-pointer text-xs font-semibold animate-none"
                title="Encabezado H1"
              >
                <Heading1 className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => injectSyntax('## ')}
                className="p-1.5 hover:text-slate-800 hover:bg-slate-100 rounded transition-all cursor-pointer text-xs font-semibold animate-none"
                title="Encabezado H2"
              >
                <Heading2 className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => injectSyntax('- ')}
                className="p-1.5 hover:text-slate-800 hover:bg-slate-100 rounded transition-all cursor-pointer animate-none"
                title="Lista de viñetas"
              >
                <List className="w-3.5 h-3.5" />
              </button>

              <span className="w-px h-4 bg-slate-200 mx-2"></span>

              <label className="p-1.5 hover:text-slate-800 hover:bg-slate-100 text-slate-550 hover:text-slate-800 rounded transition-all cursor-pointer flex items-center justify-center gap-1 animate-none">
                <Paperclip className="w-3.5 h-3.5 text-slate-450" />
                <span className="text-[10px] font-semibold">Adjuntar Imágenes / Videos Locales</span>
                <input 
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleAttachmentUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Markdown Text Area */}
            <textarea
              ref={textareaRef}
              className="flex-1 w-full bg-white text-slate-700 p-6 text-xs font-mono focus:outline-none resize-none leading-relaxed selection:bg-indigo-150"
              style={{ tabSize: 2 }}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="# Nuevo Documento&#10;&#10;Soporta Markdown, imágenes, listas y videos..."
            />
          </div>
        )}

        {/* Column B: Typographic Resolved Visual Preview */}
        {(mode === 'preview' || mode === 'split') && (
          <div className="flex-1 h-full bg-slate-50 p-8 overflow-y-auto">
            <div className="max-w-2xl mx-auto">
              <h1 className="text-3xl font-black text-slate-800 mb-6 border-b border-slate-200 pb-3">{title}</h1>
              {renderMarkdownPreview()}
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
