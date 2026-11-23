/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Custom TipTap nodes for Kora's document editor:
 *   - MermaidNode   : source-preserving mermaid block with live preview + code editor
 *   - SourceTable   : source-preserving GFM table, edited right in the table (tableModel)
 *   - MediaVideo    : <video> block node (image uses @tiptap/extension-image)
 *
 * "Source-preserving" means the node stores the exact original markdown source as
 * an attribute and emits it back verbatim, guaranteeing byte-identical round-trip
 * for these blocks (matching the legacy raw-textarea editing model).
 */
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  CaretDown as ChevronDown, Code, RowsPlusTop, RowsPlusBottom, ColumnsPlusLeft, ColumnsPlusRight,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, TextAlignLeft, TextAlignCenter, TextAlignRight, Trash as TrashIcon,
} from '@phosphor-icons/react';
import { MermaidDiagram } from '../../lib/mermaidShared';
import {
  parseTable, serializeTable, setCell, insertRow, deleteRow, insertColumn, deleteColumn, setAlign,
  moveRow, moveColumn, cellToHtml, cellForEditing, type TableModel,
} from './tableModel';
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
                data-tooltip={isExpanded ? 'Colapsar código' : 'Editar código'}
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

type CellPos = { r: number; c: number };

function ToolButton({ onClick, tip, children, danger = false, active = false }: { onClick: () => void; tip: string; children: React.ReactNode; danger?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      // Keep the focus in the cell being edited.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`p-1 rounded transition-colors cursor-pointer ${
        active ? 'bg-accent text-foreground' : danger ? 'text-muted-foreground hover:text-destructive hover:bg-destructive/10' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
      }`}
      data-tooltip={tip}
      aria-label={tip}
    >
      {children}
    </button>
  );
}

/**
 * Table block: edited right in the table (click a cell to type; Tab/Enter move
 * between cells), with tools to add, remove, move and align rows and columns. The
 * Markdown source stays available behind the code button.
 */
function SourceTableNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const source: string = node.attrs.source ?? '';
  const readOnly = !editor.isEditable;
  const model = useMemo(() => parseTable(source), [source]);
  const [showSource, setShowSource] = useState(() => !parseTable(source));
  const [active, setActive] = useState<CellPos | null>(null);
  // What the person is typing in the active cell (cells are stored trimmed, so a
  // trailing space would otherwise vanish while typing).
  const [draft, setDraft] = useState<string | null>(null);
  const lastWrittenRef = useRef<string | null>(null);
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const lineCount = source.split('\n').length;

  // The source changed from elsewhere (undo, a collaborator, code mode): drop the draft.
  useEffect(() => {
    if (source !== lastWrittenRef.current) setDraft(null);
  }, [source]);

  useEffect(() => {
    if (showSource && codeRef.current) codeRef.current.focus();
  }, [showSource]);

  useEffect(() => {
    if (readOnly) setActive(null);
  }, [readOnly]);

  const write = (next: TableModel) => {
    const text = serializeTable(next);
    lastWrittenRef.current = text;
    updateAttributes({ source: text });
  };

  const activate = (pos: CellPos | null) => {
    setDraft(null);
    setActive(pos);
  };

  if (!model || showSource) {
    return (
      <NodeViewWrapper className="group flex flex-col gap-2 py-2" data-source-table="true">
        <div className="bg-secondary border border-border rounded-lg overflow-hidden" contentEditable={false}>
          <div className="flex items-center justify-between px-3 py-1.5 bg-accent border-b border-border">
            <span className="text-[10px] font-mono font-bold text-muted-foreground">Código fuente de la tabla</span>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono text-muted-foreground">{lineCount} línea{lineCount !== 1 ? 's' : ''}</span>
              {model && (
                <button
                  type="button"
                  onClick={() => setShowSource(false)}
                  className="text-[10px] font-semibold px-2 py-0.5 rounded bg-card border border-border text-foreground hover:bg-accent cursor-pointer"
                >
                  Ver tabla
                </button>
              )}
            </div>
          </div>
          {readOnly ? (
            <pre className="p-3 text-xs font-mono text-foreground whitespace-pre-wrap">{source}</pre>
          ) : (
            <textarea
              ref={codeRef}
              className="w-full bg-transparent p-3 text-xs font-mono text-foreground focus:outline-none resize-none"
              value={source}
              onChange={(e) => updateAttributes({ source: e.target.value })}
              placeholder={'| Col 1 | Col 2 | Col 3 |\n|---|---|---|\n| A | B | C |'}
              rows={Math.max(3, Math.min(14, lineCount))}
              style={{ fontFamily: 'JetBrains Mono, Fira Code, monospace' }}
            />
          )}
          {!model && (
            <p className="px-3 pb-2 text-[10px] text-muted-foreground italic">
              Escribe una tabla Markdown (encabezado, línea separadora y filas) para editarla como tabla.
            </p>
          )}
        </div>
      </NodeViewWrapper>
    );
  }

  const cols = model.headers.length;
  const rowCount = model.rows.length;
  const cellText = (pos: CellPos) => (pos.r < 0 ? model.headers[pos.c] : model.rows[pos.r]?.[pos.c]) ?? '';

  const move = (pos: CellPos, dr: number, dc: number, grow: boolean) => {
    let { r, c } = pos;
    c += dc;
    if (c >= cols) { c = 0; r += 1; }
    if (c < 0) { c = cols - 1; r -= 1; }
    r += dr;
    if (r < -1) return activate({ r: -1, c: Math.max(0, c) });
    if (r >= rowCount) {
      if (!grow) return;
      write(insertRow(model, rowCount));
    }
    activate({ r, c });
  };

  const onCellKey = (e: React.KeyboardEvent<HTMLInputElement>, pos: CellPos) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      move(pos, 0, e.shiftKey ? -1 : 1, !e.shiftKey);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      move(pos, e.shiftKey ? -1 : 1, 0, !e.shiftKey);
    } else if (e.key === 'ArrowDown' && !e.altKey) {
      e.preventDefault();
      move(pos, 1, 0, false);
    } else if (e.key === 'ArrowUp' && !e.altKey) {
      e.preventDefault();
      move(pos, -1, 0, false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      activate(null);
      editor.commands.focus();
    }
  };

  const alignClass = (c: number) =>
    model.aligns[c] === 'center' ? 'text-center' : model.aligns[c] === 'right' ? 'text-right' : 'text-left';

  const renderCell = (pos: CellPos, header: boolean) => {
    const isActive = !readOnly && active?.r === pos.r && active?.c === pos.c;
    const text = cellText(pos);
    const base = header
      ? 'border-b border-r last:border-r-0 border-border bg-secondary p-0 font-bold text-foreground align-top'
      : 'border-b border-r last:border-r-0 border-border p-0 text-foreground align-top';
    const Tag = header ? 'th' : 'td';
    return (
      <Tag key={pos.c} className={`${base} ${isActive ? 'outline outline-2 -outline-offset-2 outline-bento-blue' : ''}`}>
        {isActive ? (
          <input
            autoFocus
            value={draft ?? cellForEditing(text)}
            onChange={(e) => {
              setDraft(e.target.value);
              write(setCell(model, pos.r, pos.c, e.target.value));
            }}
            onKeyDown={(e) => onCellKey(e, pos)}
            onBlur={() => {
              setDraft(null);
              setActive((cur) => (cur && cur.r === pos.r && cur.c === pos.c ? null : cur));
            }}
            className={`w-full min-w-[5rem] bg-card px-3 py-2 text-xs focus:outline-none ${header ? 'font-bold' : ''} ${alignClass(pos.c)}`}
            aria-label={header ? `Encabezado de la columna ${pos.c + 1}` : `Fila ${pos.r + 1}, columna ${pos.c + 1}`}
          />
        ) : (
          <div
            onClick={(e) => {
              if (readOnly) return;
              if ((e.target as HTMLElement).closest('a')) e.preventDefault();
              activate(pos);
            }}
            className={`min-h-[2rem] px-3 py-2 text-xs whitespace-pre-wrap break-words ${alignClass(pos.c)} ${readOnly ? '' : 'cursor-text hover:bg-accent/40'}`}
            dangerouslySetInnerHTML={{ __html: cellToHtml(text) || '&nbsp;' }}
          />
        )}
      </Tag>
    );
  };

  const cur = active;
  const curCol = cur ? cur.c : -1;
  const curRow = cur ? cur.r : -2;

  return (
    <NodeViewWrapper className="group/table flex flex-col gap-1.5 py-2" data-source-table="true">
      {!readOnly && (
        <div
          contentEditable={false}
          className={`flex items-center gap-0.5 flex-wrap text-muted-foreground transition-opacity ${cur ? 'opacity-100' : 'opacity-0 group-hover/table:opacity-100 focus-within:opacity-100'}`}
        >
          {cur && curRow >= 0 ? (
            <>
              <span className="text-[10px] font-semibold px-1">Fila</span>
              <ToolButton tip="Insertar fila arriba" onClick={() => { write(insertRow(model, curRow)); activate({ r: curRow, c: curCol }); }}><RowsPlusTop className="w-3.5 h-3.5" /></ToolButton>
              <ToolButton tip="Insertar fila abajo" onClick={() => { write(insertRow(model, curRow + 1)); activate({ r: curRow + 1, c: curCol }); }}><RowsPlusBottom className="w-3.5 h-3.5" /></ToolButton>
              <ToolButton tip="Subir fila" onClick={() => { write(moveRow(model, curRow, -1)); activate({ r: Math.max(0, curRow - 1), c: curCol }); }}><ArrowUp className="w-3.5 h-3.5" /></ToolButton>
              <ToolButton tip="Bajar fila" onClick={() => { write(moveRow(model, curRow, 1)); activate({ r: Math.min(rowCount - 1, curRow + 1), c: curCol }); }}><ArrowDown className="w-3.5 h-3.5" /></ToolButton>
              <ToolButton tip="Eliminar fila" danger onClick={() => { write(deleteRow(model, curRow)); activate(null); }}><TrashIcon className="w-3.5 h-3.5" /></ToolButton>
              <span className="w-px h-4 bg-border mx-1" />
            </>
          ) : (
            <>
              <ToolButton tip="Agregar fila al final" onClick={() => { write(insertRow(model, rowCount)); activate({ r: rowCount, c: 0 }); }}><RowsPlusBottom className="w-3.5 h-3.5" /></ToolButton>
              <ToolButton tip="Agregar columna al final" onClick={() => { write(insertColumn(model, cols)); activate({ r: -1, c: cols }); }}><ColumnsPlusRight className="w-3.5 h-3.5" /></ToolButton>
              <span className="w-px h-4 bg-border mx-1" />
            </>
          )}
          {cur && (
            <>
              <span className="text-[10px] font-semibold px-1">Columna</span>
              <ToolButton tip="Insertar columna a la izquierda" onClick={() => { write(insertColumn(model, curCol)); activate({ r: curRow, c: curCol }); }}><ColumnsPlusLeft className="w-3.5 h-3.5" /></ToolButton>
              <ToolButton tip="Insertar columna a la derecha" onClick={() => { write(insertColumn(model, curCol + 1)); activate({ r: curRow, c: curCol + 1 }); }}><ColumnsPlusRight className="w-3.5 h-3.5" /></ToolButton>
              <ToolButton tip="Mover columna a la izquierda" onClick={() => { write(moveColumn(model, curCol, -1)); activate({ r: curRow, c: Math.max(0, curCol - 1) }); }}><ArrowLeft className="w-3.5 h-3.5" /></ToolButton>
              <ToolButton tip="Mover columna a la derecha" onClick={() => { write(moveColumn(model, curCol, 1)); activate({ r: curRow, c: Math.min(cols - 1, curCol + 1) }); }}><ArrowRight className="w-3.5 h-3.5" /></ToolButton>
              <ToolButton tip="Alinear a la izquierda" active={model.aligns[curCol] === 'left'} onClick={() => write(setAlign(model, curCol, model.aligns[curCol] === 'left' ? null : 'left'))}><TextAlignLeft className="w-3.5 h-3.5" /></ToolButton>
              <ToolButton tip="Centrar" active={model.aligns[curCol] === 'center'} onClick={() => write(setAlign(model, curCol, model.aligns[curCol] === 'center' ? null : 'center'))}><TextAlignCenter className="w-3.5 h-3.5" /></ToolButton>
              <ToolButton tip="Alinear a la derecha" active={model.aligns[curCol] === 'right'} onClick={() => write(setAlign(model, curCol, model.aligns[curCol] === 'right' ? null : 'right'))}><TextAlignRight className="w-3.5 h-3.5" /></ToolButton>
              {cols > 1 && (
                <ToolButton tip="Eliminar columna" danger onClick={() => { write(deleteColumn(model, curCol)); activate(null); }}><TrashIcon className="w-3.5 h-3.5" /></ToolButton>
              )}
              <span className="w-px h-4 bg-border mx-1" />
            </>
          )}
          <ToolButton tip="Ver el código Markdown" onClick={() => { activate(null); setShowSource(true); }}><Code className="w-3.5 h-3.5" /></ToolButton>
        </div>
      )}
      <div className="overflow-x-auto border border-border rounded-lg bg-card" contentEditable={false}>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>{model.headers.map((_, c) => renderCell({ r: -1, c }, true))}</tr>
          </thead>
          <tbody>
            {model.rows.map((_, r) => (
              <tr key={r} className={r % 2 === 0 ? 'bg-card' : 'bg-secondary/30'}>
                {model.headers.map((__, c) => renderCell({ r, c }, false))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <button
          type="button"
          contentEditable={false}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { write(insertRow(model, rowCount)); activate({ r: rowCount, c: 0 }); }}
          className="self-start text-[11px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded hover:bg-accent cursor-pointer opacity-0 group-hover/table:opacity-100 transition-opacity"
        >
          + Nueva fila
        </button>
      )}
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
