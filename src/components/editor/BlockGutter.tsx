/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Per-block gutter controls (add button + drag/grip handle) rendered as a React
 * overlay aligned to the top-level block under the mouse. Replaces the legacy
 * block editor's hover controls using only TipTap/ProseMirror public APIs (MIT) —
 * no Pro drag-handle extension.
 *
 * Interactions:
 *  - "+"  : insert an empty paragraph below the hovered block and focus it.
 *  - grip : drag up/down to move the block; click (no drag) opens a context menu
 *           to delete / duplicate / convert the block type.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import {
  Plus,
  DotsSixVertical as GripVertical,
  Trash as Trash2,
  Copy,
  CaretRight as ChevronRight,
  ListNumbers as ListOrdered,
  TextT as Type,
  TextHOne as Heading1,
  TextHTwo as Heading2,
  TextHThree as Heading3,
  ListBullets as List,
  CheckSquare,
  Quotes as Quote,
  Code,
} from '@phosphor-icons/react';

interface HoveredBlock {
  pos: number; // ProseMirror position just before the block node
  top: number; // viewport-relative top of the block
  left: number; // viewport-relative left of the block content column
}

// Convert commands place a text selection INSIDE the block (pos + 1) first, since
// TipTap's set*/toggle* commands operate on the selected text block.
const CONVERT_TYPES: { key: string; label: string; icon: React.ElementType; run: (e: Editor, pos: number) => void }[] = [
  { key: 'paragraph', label: 'Texto', icon: Type, run: (e, pos) => e.chain().focus().setTextSelection(pos + 1).setParagraph().run() },
  { key: 'h1', label: 'Encabezado 1', icon: Heading1, run: (e, pos) => e.chain().focus().setTextSelection(pos + 1).setHeading({ level: 1 }).run() },
  { key: 'h2', label: 'Encabezado 2', icon: Heading2, run: (e, pos) => e.chain().focus().setTextSelection(pos + 1).setHeading({ level: 2 }).run() },
  { key: 'h3', label: 'Encabezado 3', icon: Heading3, run: (e, pos) => e.chain().focus().setTextSelection(pos + 1).setHeading({ level: 3 }).run() },
  { key: 'bullet', label: 'Lista con viñetas', icon: List, run: (e, pos) => e.chain().focus().setTextSelection(pos + 1).toggleBulletList().run() },
  { key: 'numbered', label: 'Lista numerada', icon: ListOrdered, run: (e, pos) => e.chain().focus().setTextSelection(pos + 1).toggleOrderedList().run() },
  { key: 'checklist', label: 'Lista de tareas', icon: CheckSquare, run: (e, pos) => e.chain().focus().setTextSelection(pos + 1).toggleTaskList().run() },
  { key: 'quote', label: 'Cita', icon: Quote, run: (e, pos) => e.chain().focus().setTextSelection(pos + 1).toggleBlockquote().run() },
  { key: 'code', label: 'Código', icon: Code, run: (e, pos) => e.chain().focus().setTextSelection(pos + 1).toggleCodeBlock().run() },
];

export function BlockGutter({ editor }: { editor: Editor }) {
  const [hovered, setHovered] = useState<HoveredBlock | null>(null);
  const [menu, setMenu] = useState<{ top: number; left: number; pos: number } | null>(null);
  const [showConvert, setShowConvert] = useState(false);
  const hoveredRef = useRef<HoveredBlock | null>(null);
  hoveredRef.current = hovered;

  // Track the top-level block under the mouse. Listen on the whole document (not
  // just the editor DOM) so the gutter, which sits in the left margin OUTSIDE the
  // editor content, stays reachable — the sensitive band spans from the gutter's
  // left edge to the editor's right edge.
  useEffect(() => {
    // The editor object can exist before its ProseMirror view is mounted;
    // accessing editor.view.dom too early throws. Bail until the view is ready.
    if (editor.isDestroyed || !editor.view?.dom) return;
    const dom = editor.view.dom as HTMLElement;
    const GUTTER_WIDTH = 56; // px reserved to the left of content for the controls

    const onMouseMove = (event: MouseEvent) => {
      if (!editor.isEditable || editor.isDestroyed || !editor.view) return;
      const editorRect = dom.getBoundingClientRect();

      // Sensitive band: from just left of the gutter to the editor's right edge,
      // and vertically within the editor (with a small margin).
      const withinX = event.clientX >= editorRect.left - GUTTER_WIDTH && event.clientX <= editorRect.right;
      const withinY = event.clientY >= editorRect.top - 8 && event.clientY <= editorRect.bottom + 8;
      if (!withinX || !withinY) { setHovered(null); return; }

      // Probe a point inside the content column even when the mouse is over the gutter.
      const probeX = Math.max(editorRect.left + 24, Math.min(event.clientX, editorRect.right - 24));
      const probeY = Math.max(editorRect.top + 4, Math.min(event.clientY, editorRect.bottom - 4));
      const posInfo = editor.view.posAtCoords({ left: probeX, top: probeY });
      if (!posInfo) { setHovered(null); return; }

      // Resolve to the top-level block (depth 1) containing this position.
      const $pos = editor.state.doc.resolve(posInfo.pos);
      const depth = $pos.depth === 0 ? 0 : 1;
      const blockPos = depth === 0 ? posInfo.pos : $pos.before(1);
      const node = editor.state.doc.nodeAt(blockPos);
      if (!node || !node.isBlock) { setHovered(null); return; }

      const dcoords = editor.view.coordsAtPos(blockPos + 1);
      setHovered({ pos: blockPos, top: dcoords.top, left: editorRect.left });
    };

    document.addEventListener('mousemove', onMouseMove);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
    };
  }, [editor]);

  // Close menu on outside click / escape.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-block-menu]')) { setMenu(null); setShowConvert(false); }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(null); setShowConvert(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menu]);

  const addBelow = useCallback((pos: number) => {
    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;
    const insertAt = pos + node.nodeSize;
    editor.chain().focus().insertContentAt(insertAt, { type: 'paragraph' }).setTextSelection(insertAt + 1).run();
  }, [editor]);

  const moveBlock = useCallback((pos: number, dir: 'up' | 'down') => {
    const { doc } = editor.state;
    const node = doc.nodeAt(pos);
    if (!node) return;
    const $pos = doc.resolve(pos);
    const index = $pos.index(0);
    if (dir === 'up' && index === 0) return;
    if (dir === 'down' && index >= doc.childCount - 1) return;

    const tr = editor.state.tr;
    const nodeSize = node.nodeSize;
    if (dir === 'up') {
      const prev = doc.child(index - 1);
      const prevPos = pos - prev.nodeSize;
      tr.delete(pos, pos + nodeSize);
      tr.insert(prevPos, node);
      editor.view.dispatch(tr);
      setHovered((h) => (h ? { ...h, pos: prevPos } : h));
    } else {
      const next = doc.child(index + 1);
      const afterNextPos = pos + nodeSize + next.nodeSize;
      tr.insert(afterNextPos, node);
      tr.delete(pos, pos + nodeSize);
      editor.view.dispatch(tr);
      setHovered((h) => (h ? { ...h, pos: pos + next.nodeSize } : h));
    }
    editor.view.focus();
  }, [editor]);

  const deleteBlock = useCallback((pos: number) => {
    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;
    editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
    setMenu(null); setShowConvert(false); setHovered(null);
  }, [editor]);

  const duplicateBlock = useCallback((pos: number) => {
    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;
    editor.chain().focus().insertContentAt(pos + node.nodeSize, node.toJSON()).run();
    setMenu(null); setShowConvert(false);
  }, [editor]);

  const onGripMouseDown = useCallback((e: React.MouseEvent, pos: number) => {
    e.preventDefault();
    const startY = e.clientY;
    let moved = false;
    let accum = 0;
    let lastY = startY;

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientY - lastY;
      accum += delta;
      lastY = ev.clientY;
      if (Math.abs(ev.clientY - startY) > 6) moved = true;
      if (accum > 30) { moveBlock(pos, 'down'); accum = 0; }
      else if (accum < -30) { moveBlock(pos, 'up'); accum = 0; }
    };
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!moved) {
        // Treat as a click: open the context menu, and select the block.
        try { editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos))); } catch { /* noop */ }
        setMenu({ top: ev.clientY, left: ev.clientX, pos });
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [editor, moveBlock]);

  if (!editor.isEditable) return null;

  return (
    <>
      {hovered && !menu && (
        <div
          data-block-gutter
          className="fixed z-[60] flex items-center gap-0.5"
          style={{ top: hovered.top, left: hovered.left - 52 }}
          onMouseEnter={() => setHovered(hoveredRef.current)}
        >
          <button
            onClick={() => addBelow(hovered.pos)}
            className="p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-pointer transition-colors"
            title="Añadir bloque debajo"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onMouseDown={(e) => onGripMouseDown(e, hovered.pos)}
            className="p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-grab active:cursor-grabbing transition-colors"
            title="Arrastrar para mover · Clic para opciones"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {menu && (
        <div
          data-block-menu
          className="fixed z-[9999] bg-card border border-border rounded-xl shadow-card-hover py-1 min-w-[180px] animate-fade-in"
          style={{ top: menu.top, left: menu.left }}
        >
          <button
            onClick={() => deleteBlock(menu.pos)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" /> Borrar
          </button>
          <button
            onClick={() => duplicateBlock(menu.pos)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" /> Duplicar
          </button>
          <div className="relative">
            <button
              onClick={() => setShowConvert((s) => !s)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span className="flex-1">Convertir en</span>
              <ChevronRight className="w-3 h-3" />
            </button>
            {showConvert && (
              <div className="absolute left-full top-0 ml-1 bg-card border border-border rounded-xl shadow-card-hover py-1 min-w-[180px] max-h-[260px] overflow-y-auto">
                {CONVERT_TYPES.map((c) => {
                  const Icon = c.icon;
                  return (
                    <button
                      key={c.key}
                      onClick={() => { c.run(editor, menu.pos); setMenu(null); setShowConvert(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="flex-1">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
