/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Custom TipTap nodes for Kora's document editor:
 *   - MermaidNode   : source-preserving mermaid block with live preview + code editor
 *   - SourceTable   : source-preserving GFM table with rendered preview + code editor
 *   - MediaVideo    : <video> block node (image uses @tiptap/extension-image)
 *
 * "Source-preserving" means the node stores the exact original markdown source as
 * an attribute and emits it back verbatim, guaranteeing byte-identical round-trip
 * for these blocks (matching the legacy raw-textarea editing model).
 */
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useState, useRef, useEffect } from 'react';
import { CaretDown as ChevronDown, Code } from '@phosphor-icons/react';
import { MermaidDiagram } from '../../lib/mermaidShared';
import { parseTableSource } from '../../lib/tiptapMarkdown';
import { useEditorAssets } from './editorStoreBridge';

// ─── Mermaid Node ────────────────────────────────────────────────────────────────

function MermaidNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const code: string = node.attrs.code ?? '';
  const [expanded, setExpanded] = useState(!code.trim());
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const readOnly = !editor.isEditable;
  const lineCount = code.split('\n').length;

  useEffect(() => {
    if (expanded && codeRef.current) codeRef.current.focus();
  }, [expanded]);

  const isExpanded = code.trim() ? expanded : true;

  return (
    <NodeViewWrapper className="group flex flex-col gap-2 py-2" data-mermaid="true">
      <div className="flex-1 min-w-0">
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center justify-end mb-2">
            {!readOnly && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title={isExpanded ? 'Colapsar código' : 'Editar código'}
                contentEditable={false}
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <Code className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
          <MermaidDiagram chart={code} />
        </div>
        {!readOnly && (
          <div className={`overflow-hidden transition-all duration-200 ${isExpanded ? 'max-h-[500px] opacity-100 mt-2' : 'max-h-0 opacity-0'}`} contentEditable={false}>
            <div className="bg-secondary border border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 bg-accent border-b border-border">
                <span className="text-[10px] font-mono font-bold text-muted-foreground">Código fuente</span>
                <span className="text-[9px] font-mono text-muted-foreground">{lineCount} línea{lineCount !== 1 ? 's' : ''}</span>
              </div>
              <textarea
                ref={codeRef}
                className="w-full bg-transparent p-3 text-xs font-mono text-foreground focus:outline-none resize-none"
                value={code}
                onChange={(e) => updateAttributes({ code: e.target.value })}
                placeholder={'graph TD\n  A[Inicio] --> B[Fin]'}
                rows={Math.max(3, Math.min(10, lineCount))}
                style={{ fontFamily: 'JetBrains Mono, Fira Code, monospace' }}
              />
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const MermaidNode = Node.create({
  name: 'mermaid',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      code: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-code') ?? '',
        renderHTML: (attrs) => ({ 'data-code': attrs.code }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-mermaid="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-mermaid': 'true' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidNodeView);
  },
});

// ─── Source-preserving Table Node ─────────────────────────────────────────────────

function SourceTableNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const source: string = node.attrs.source ?? '';
  const [expanded, setExpanded] = useState(!source.trim());
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const readOnly = !editor.isEditable;
  const lineCount = source.split('\n').length;
  const parsed = parseTableSource(source);
  const isExpanded = source.trim() ? expanded : true;

  useEffect(() => {
    if (expanded && codeRef.current) codeRef.current.focus();
  }, [expanded]);

  return (
    <NodeViewWrapper className="group flex flex-col gap-2 py-2" data-source-table="true">
      <div className="flex-1 min-w-0">
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center justify-end mb-2">
            {!readOnly && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title={isExpanded ? 'Colapsar código' : 'Editar código'}
                contentEditable={false}
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <Code className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
          {parsed && parsed.headers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse bg-card text-xs">
                <thead>
                  <tr>
                    {parsed.headers.map((h, i) => (
                      <th key={i} className="border-b border-border bg-secondary px-3 py-2 font-bold uppercase tracking-wider text-foreground text-left whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.map((row, ri) => (
                    <tr key={ri} className={ri % 2 === 0 ? 'bg-card' : 'bg-secondary/30'}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-3 py-2 text-muted-foreground border-b border-border whitespace-nowrap">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-6 text-[10px] text-muted-foreground italic">Escribe código de tabla Markdown para visualizarla</div>
          )}
        </div>
        {!readOnly && (
          <div className={`overflow-hidden transition-all duration-200 ${isExpanded ? 'max-h-[500px] opacity-100 mt-2' : 'max-h-0 opacity-0'}`} contentEditable={false}>
            <div className="bg-secondary border border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 bg-accent border-b border-border">
                <span className="text-[10px] font-mono font-bold text-muted-foreground">Código fuente</span>
                <span className="text-[9px] font-mono text-muted-foreground">{lineCount} línea{lineCount !== 1 ? 's' : ''}</span>
              </div>
              <textarea
                ref={codeRef}
                className="w-full bg-transparent p-3 text-xs font-mono text-foreground focus:outline-none resize-none"
                value={source}
                onChange={(e) => updateAttributes({ source: e.target.value })}
                placeholder={'| Col 1 | Col 2 | Col 3 |\n|---|---|---|\n| A | B | C |'}
                rows={Math.max(3, Math.min(10, lineCount))}
                style={{ fontFamily: 'JetBrains Mono, Fira Code, monospace' }}
              />
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const SourceTable = Node.create({
  name: 'sourceTable',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      source: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-source') ?? '',
        renderHTML: (attrs) => ({ 'data-source': attrs.source }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-source-table="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-source-table': 'true' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SourceTableNodeView);
  },
});

// ─── Video Node ────────────────────────────────────────────────────────────────

function MediaVideoNodeView({ node }: NodeViewProps) {
  const src: string = node.attrs.src ?? '';
  const { resolvedUrls } = useEditorAssets();
  const resolved = resolvedUrls[src] || src;
  return (
    <NodeViewWrapper className="my-2" data-media="video">
      <video src={resolved} controls className="max-w-full rounded-xl border border-border shadow-card" />
    </NodeViewWrapper>
  );
}

export const MediaVideo = Node.create({
  name: 'mediaVideo',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      src: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-src') ?? '',
        renderHTML: (attrs) => ({ 'data-src': attrs.src }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-media="video"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-media': 'video' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MediaVideoNodeView);
  },
});

// ─── Image Node (block, URL-resolving) ────────────────────────────────────────────

function MediaImageNodeView({ node }: NodeViewProps) {
  const src: string = node.attrs.src ?? '';
  const alt: string = node.attrs.alt ?? '';
  const { resolvedUrls } = useEditorAssets();
  const resolved = resolvedUrls[src] || src;
  return (
    <NodeViewWrapper className="my-2" data-media="image">
      <img src={resolved} alt={alt} className="rounded-xl max-h-96 max-w-full border border-border shadow-card" referrerPolicy="no-referrer" />
      {alt && <span className="block text-[10px] text-muted-foreground mt-1 font-mono">{alt}</span>}
    </NodeViewWrapper>
  );
}

export const MediaImage = Node.create({
  name: 'mediaImage',
  group: 'block',
  inline: false,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      src: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('src') ?? '',
        renderHTML: (attrs) => ({ src: attrs.src }),
      },
      alt: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('alt') ?? '',
        renderHTML: (attrs) => ({ alt: attrs.alt }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'img[data-media="image"]' }, { tag: 'img[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes, { 'data-media': 'image' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MediaImageNodeView);
  },
});
