/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Floating card for links in the document editor, like Notion: clicking a link keeps editing
 * (it only places the cursor), and the card that appears under the link (when the cursor is
 * inside it or the mouse rests on it) opens it in a new tab, copies it, edits it or removes it.
 * Ctrl/Cmd + clic opens the link directly.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { getMarkRange } from '@tiptap/core';
import { Globe, Copy, Check, LinkBreak } from '@phosphor-icons/react';

interface LinkTarget {
  href: string;
  from: number;
  to: number;
}

/** Delay before the card shows for a hovered link, and before it hides once the mouse leaves */
const HOVER_DELAY = 350;
const LEAVE_DELAY = 250;
const GAP = 6;

/** URL to open: links written without a scheme ("lorspi.com") are taken as https */
export function linkUrl(href: string): string {
  const url = href.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('#') || url.startsWith('/')) return url;
  return `https://${url}`;
}

export function openLink(href: string) {
  window.open(linkUrl(href), '_blank', 'noopener,noreferrer');
}

/** The whole link around a document position, or null if there is no link there */
function linkAt(editor: Editor, pos: number): LinkTarget | null {
  const type = editor.schema.marks.link;
  if (!type) return null;
  const $pos = editor.state.doc.resolve(pos);
  const range = getMarkRange($pos, type);
  if (!range) return null;
  const mark = editor.state.doc.nodeAt(range.from)?.marks.find((m) => m.type === type);
  const href = mark?.attrs.href as string | undefined;
  return href ? { href, from: range.from, to: range.to } : null;
}

/** The link that holds the cursor (an empty selection inside a link) */
function caretLink(editor: Editor): LinkTarget | null {
  const { selection } = editor.state;
  if (!selection.empty || !editor.isActive('link')) return null;
  return linkAt(editor, selection.from);
}

export function LinkPopover({ editor }: { editor: Editor }) {
  const [caret, setCaret] = useState<LinkTarget | null>(null);
  const [hover, setHover] = useState<LinkTarget | null>(null);
  // Escape hides the card until the cursor moves to another link
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [editing, setEditing] = useState<LinkTarget | null>(null);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const leaveTimer = useRef<number | undefined>(undefined);

  const shown = editing ?? hover ?? (caret && caret.from !== dismissed ? caret : null);

  // ── Cursor inside a link ───────────────────────────────────────────────────
  useEffect(() => {
    const update = () => {
      const link = caretLink(editor);
      setCaret((prev) =>
        prev && link && prev.from === link.from && prev.to === link.to && prev.href === link.href ? prev : link
      );
      if (!link) setDismissed(null);
    };
    const onBlur = () => setCaret(null);
    update();
    editor.on('selectionUpdate', update);
    editor.on('update', update);
    editor.on('focus', update);
    editor.on('blur', onBlur);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('update', update);
      editor.off('focus', update);
      editor.off('blur', onBlur);
    };
  }, [editor]);

  // ── Mouse over a link, and Ctrl/Cmd + clic to open it ──────────────────────
  const cancelLeave = () => window.clearTimeout(leaveTimer.current);
  const scheduleLeave = useCallback(() => {
    window.clearTimeout(hoverTimer.current);
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setHover(null), LEAVE_DELAY);
  }, []);

  useEffect(() => {
    const dom = editor.view.dom as HTMLElement;
    const anchorOf = (target: EventTarget | null) => {
      const a = (target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      return a && dom.contains(a) ? a : null;
    };

    const onOver = (e: MouseEvent) => {
      const a = anchorOf(e.target);
      if (!a) return;
      cancelLeave();
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = window.setTimeout(() => {
        if (!a.isConnected) return;
        let at: number;
        try {
          at = editor.view.posAtDOM(a, 0);
        } catch {
          return;
        }
        // posAtDOM gives the position just before the first character of the link
        setHover(linkAt(editor, Math.min(at + 1, editor.state.doc.content.size)));
      }, HOVER_DELAY);
    };
    const onOut = (e: MouseEvent) => {
      const a = anchorOf(e.target);
      if (!a || a.contains(e.relatedTarget as Node | null)) return;
      scheduleLeave();
    };
    // Ctrl/Cmd + clic opens the link; a plain clic only places the cursor, to keep editing.
    // In a read-only document a plain clic opens it too.
    const onClick = (e: MouseEvent) => {
      const a = anchorOf(e.target);
      if (!a || e.button !== 0) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey || !editor.isEditable) openLink(a.getAttribute('href') ?? '');
    };
    const onKeyDown = () => {
      window.clearTimeout(hoverTimer.current);
      setHover(null);
    };

    dom.addEventListener('mouseover', onOver);
    dom.addEventListener('mouseout', onOut);
    dom.addEventListener('click', onClick);
    dom.addEventListener('keydown', onKeyDown);
    return () => {
      dom.removeEventListener('mouseover', onOver);
      dom.removeEventListener('mouseout', onOut);
      dom.removeEventListener('click', onClick);
      dom.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(hoverTimer.current);
      window.clearTimeout(leaveTimer.current);
    };
  }, [editor, scheduleLeave]);

  // ── Position: under the link, or above it when there is no room below ──────
  const place = useCallback(() => {
    if (!shown) return;
    const size = editor.state.doc.content.size;
    if (shown.to > size) {
      setPos(null);
      return;
    }
    let start: { left: number; top: number; bottom: number };
    let end: { bottom: number };
    try {
      start = editor.view.coordsAtPos(shown.from, 1);
      end = editor.view.coordsAtPos(shown.to, -1);
    } catch {
      setPos(null);
      return;
    }
    const card = cardRef.current;
    const width = card?.offsetWidth ?? 280;
    const height = card?.offsetHeight ?? 40;
    let top = end.bottom + GAP;
    if (top + height > window.innerHeight - 8 && start.top - height - GAP > 8) top = start.top - height - GAP;
    const left = Math.max(8, Math.min(start.left, window.innerWidth - width - 8));
    setPos({ top, left });
  }, [editor, shown]);

  useLayoutEffect(() => {
    place();
  }, [place, editing]);

  useEffect(() => {
    if (!shown) return;
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [shown, place]);

  useEffect(() => {
    setCopied(false);
  }, [shown?.href]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // Escape hides the card
  useEffect(() => {
    if (!shown || editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setHover(null);
      if (caret) setDismissed(caret.from);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [shown, editing, caret]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const copy = async (href: string) => {
    try {
      await navigator.clipboard.writeText(linkUrl(href));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const startEditing = (link: LinkTarget) => {
    cancelLeave();
    setDraft(link.href);
    setEditing(link);
  };

  const stopEditing = (refocus: boolean) => {
    const link = editing;
    setEditing(null);
    setHover(null);
    if (refocus && link) editor.chain().focus().setTextSelection(link.to).run();
  };

  const applyEdit = () => {
    if (!editing) return;
    const href = draft.trim();
    const chain = editor.chain().focus().setTextSelection({ from: editing.from, to: editing.to });
    if (href) chain.setLink({ href }).run();
    else chain.unsetLink().run();
    editor.commands.setTextSelection(editing.to);
    setEditing(null);
    setHover(null);
  };

  const removeLink = (link: LinkTarget) => {
    editor.chain().focus().setTextSelection({ from: link.from, to: link.to }).unsetLink().setTextSelection(link.to).run();
    setEditing(null);
    setHover(null);
  };

  if (!shown) return null;

  const btn =
    'h-7 px-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer flex items-center gap-1 shrink-0';

  return createPortal(
    <div
      ref={cardRef}
      onMouseEnter={cancelLeave}
      onMouseLeave={() => {
        if (!editing) scheduleLeave();
      }}
      // Keep the editor's selection while clicking the card's buttons
      onMouseDown={(e) => {
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
      }}
      className="fixed z-[9999] bg-card border border-border rounded-xl shadow-card-hover p-1 flex items-center gap-0.5 max-w-[min(420px,calc(100vw-16px))] animate-fade-in"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
    >
      {editing ? (
        <div className="flex items-center gap-1 px-1">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyEdit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                stopEditing(true);
              }
            }}
            onBlur={() => stopEditing(false)}
            placeholder="https://..."
            aria-label="Dirección del enlace"
            className="bg-secondary border border-input rounded-lg px-2 py-1 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-64"
          />
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              applyEdit();
            }}
            className="p-1.5 rounded-lg text-bento-green hover:bg-accent transition-colors cursor-pointer"
            data-tooltip="Aplicar enlace"
          >
            <Check className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={() => openLink(shown.href)}
            className="h-7 pl-2 pr-2.5 rounded-lg flex items-center gap-2 min-w-0 text-xs text-foreground hover:bg-accent transition-colors cursor-pointer"
            data-tooltip="Abrir en una pestaña nueva"
          >
            <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="truncate underline decoration-muted-foreground/40 underline-offset-2">{shown.href}</span>
          </button>
          <div className="w-px h-4 bg-border mx-0.5 shrink-0" />
          <button
            onClick={() => copy(shown.href)}
            className={btn}
            data-tooltip={copied ? 'Copiado' : 'Copiar enlace'}
            aria-label="Copiar enlace"
          >
            {copied ? <Check className="w-4 h-4 text-bento-green" /> : <Copy className="w-4 h-4" />}
          </button>
          {editor.isEditable && (
            <>
              <button onClick={() => startEditing(shown)} className={btn}>
                Editar
              </button>
              <button
                onClick={() => removeLink(shown)}
                className={btn}
                data-tooltip="Quitar enlace"
                aria-label="Quitar enlace"
              >
                <LinkBreak className="w-4 h-4" />
              </button>
            </>
          )}
        </>
      )}
    </div>,
    document.body
  );
}
