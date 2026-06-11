/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { useProjectStore } from '../store';
import { Search, X, CheckSquare, FileText, Tag, Image, CornerDownLeft, CircleDot } from 'lucide-react';

export default function SearchDialog() {
  const { 
    isSearchOpen, 
    setSearchOpen, 
    searchQuery, 
    setSearchQuery, 
    tasks, 
    docs, 
    setSelectedTask, 
    setSelectedDoc 
  } = useProjectStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(!isSearchOpen);
      }
      if (e.key === 'Escape' && isSearchOpen) {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen]);

  useEffect(() => {
    if (isSearchOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isSearchOpen]);

  if (!isSearchOpen) return null;

  const query = searchQuery.trim().toLowerCase();

  const filteredTasks = query.length === 0 ? [] : tasks.filter(t => 
    t.title.toLowerCase().includes(query) ||
    t.description.toLowerCase().includes(query) ||
    t.taskCode.toLowerCase().includes(query) ||
    t.tags.some(tag => tag.toLowerCase().includes(query))
  );

  const filteredDocs = query.length === 0 ? [] : docs.filter(d => 
    d.title.toLowerCase().includes(query)
  );

  const allTags = Array.from(new Set(tasks.flatMap(t => t.tags)));
  const filteredTags = query.length === 0 ? [] : allTags.filter(tag => 
    tag.toLowerCase().includes(query)
  );

  return (
    <div id="search-dialog-backdrop" className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-50 flex items-start justify-center pt-24 px-6 font-body">
      <div 
        ref={containerRef}
        className="w-full max-w-2xl bg-popover border border-border rounded-2xl shadow-card-hover overflow-hidden flex flex-col max-h-[70vh] select-none animate-scale-in"
      >
        
        {/* Search Input block */}
        <div className="p-4 border-b border-border flex items-center gap-3 shrink-0">
          <Search className="w-5 h-5 text-bento-blue shrink-0" />
          <input 
            ref={inputRef}
            type="text"
            className="bg-transparent border-0 text-sm text-foreground placeholder-muted-foreground flex-1 focus:outline-none"
            placeholder="Buscar global: Código, etiquetas, tareas, archivos, documentos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <span className="text-[10px] bg-secondary border border-border text-muted-foreground px-2 py-0.5 rounded font-mono select-none">
            ESC
          </span>
          <button 
            onClick={() => setSearchOpen(false)}
            className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results Areas */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {query.length === 0 ? (
            <div className="text-center py-12">
              <CircleDot className="w-10 h-10 text-muted-foreground mx-auto mb-3 animate-pulse-slow" />
              <h3 className="text-sm font-semibold text-muted-foreground">Comienza a escribir para buscar...</h3>
              <p className="text-xs text-muted-foreground mt-1">Buscaremos de manera instantánea a través del sistema de archivos local.</p>
            </div>
          ) : (
            <div className="space-y-5 text-left">
              
              {filteredTasks.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1">
                    <CheckSquare className="w-3.5 h-3.5 text-bento-blue" />
                    Tareas encontradas ({filteredTasks.length})
                  </span>
                  <div className="space-y-1.5">
                    {filteredTasks.map(t => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setSelectedTask(t.id);
                          setSearchOpen(false);
                        }}
                        className="w-full text-left p-2.5 rounded-xl bg-secondary hover:bg-accent border border-border hover:border-bento-blue/50 transition-all flex items-center justify-between gap-3 group/item"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-mono text-[10px] font-bold text-muted-foreground shrink-0">{t.taskCode}</span>
                          <span className="text-xs font-semibold text-foreground group-hover/item:text-bento-blue truncate">{t.title}</span>
                        </div>
                        <span className="text-[10px] bg-card group-hover/item:bg-primary group-hover/item:text-primary-foreground border border-border text-muted-foreground px-2 py-0.5 rounded transition-colors font-mono font-medium flex items-center gap-1 shrink-0">
                          Abrir <CornerDownLeft className="w-3 h-3" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filteredDocs.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-bento-orange" />
                    Documentos Markdown ({filteredDocs.length})
                  </span>
                  <div className="space-y-1.5">
                    {filteredDocs.map(d => (
                      <button
                        key={d.id}
                        onClick={() => {
                          setSelectedDoc(d.id);
                          setSearchOpen(false);
                        }}
                        className="w-full text-left p-2.5 rounded-xl bg-secondary hover:bg-accent border border-border hover:border-bento-orange/50 transition-all flex items-center justify-between gap-3 group/item"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText className="w-4 h-4 text-bento-orange" />
                          <span className="text-xs font-semibold text-foreground group-hover/item:text-bento-orange truncate">{d.title}</span>
                        </div>
                        <span className="text-[10px] bg-card group-hover/item:bg-primary group-hover/item:text-primary-foreground border border-border text-muted-foreground px-2 py-0.5 rounded transition-colors font-mono font-medium flex items-center gap-1 shrink-0">
                          Ver <CornerDownLeft className="w-3 h-3" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filteredTags.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-bento-green" />
                    Etiquetas coincidentes ({filteredTags.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {filteredTags.map(tag => (
                      <span 
                        key={tag}
                        className="text-[10px] font-bold bg-bento-green-light text-bento-green border border-border px-2.5 py-0.5 rounded-full font-mono cursor-pointer hover:opacity-80 transition-all uppercase"
                        onClick={() => setSearchQuery(tag)}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {filteredTasks.length === 0 && filteredDocs.length === 0 && filteredTags.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-xs italic">
                  No se encontraron coincidencias para &quot;{query}&quot; dentro de config, listas, documentos o tareas.
                </div>
              )}

            </div>
          )}
        </div>

        {/* Tip panel */}
        <div className="p-3 border-t border-border text-center text-[10px] text-muted-foreground font-mono bg-secondary shrink-0 flex items-center justify-center gap-1">
          <span>Protip: Presiona</span>
          <kbd className="bg-card border border-border px-1 py-0.5 rounded text-muted-foreground">Ctrl+K</kbd>
          <span>en cualquier pantalla para abrir este panel.</span>
        </div>

      </div>
    </div>
  );
}
