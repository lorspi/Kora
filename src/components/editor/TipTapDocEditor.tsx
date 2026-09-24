/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TipTap-based document editor for Kora. Replaces the legacy contentEditable block
 * editor. Edits raw Markdown (the on-disk contract) via the conversion layer in
 * lib/tiptapMarkdown, and exposes an imperative handle so DocView can drive load,
 * save (getMarkdown) and attachment insertion while keeping its existing store
 * wiring (locks, save button, navigation guard, code mode) unchanged.
 */
import {
  forwardRef,
  useImperativeHandle,
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/core';
import {
  TextB as Bold,
  TextItalic as Italic,
  TextUnderline as Underline,
  TextStrikethrough as Strikethrough,
  Code,
  Link as LinkIcon,
  Check,
  TextT as Type,
  TextHOne as Heading1,
  TextHTwo as Heading2,
  TextHThree as Heading3,
  ListBullets as List,
  ListNumbers as ListOrdered,
  CheckSquare,
  Quotes as Quote,
  Minus,
  GitBranch,
  Table,
} from '@phosphor-icons/react';
import { buildExtensions } from './extensions';
import { BlockGutter } from './BlockGutter';
import { EditorAssetsProvider } from './editorStoreBridge';
import { pmDocToMarkdown, markdownToTiptapHtml, normalizeMarkdown } from '../../lib/tiptapMarkdown';

export interface TipTapDocEditorHandle {
  /** Serialize current document to the on-disk Markdown dialect. */
  getMarkdown: () => string;
  /** Replace the whole document from a Markdown string (does not push history baseline). */
  setMarkdown: (md: string) => void;
  /** Insert an image at the current selection (relative attachment path). */
  insertImage: (src: string, alt: string) => void;
  /** Insert a video at the current selection (relative attachment path). */
  insertVideo: (src: string) => void;
  /** Focus the editor. */
  focus: () => void;
}

interface TipTapDocEditorProps {
  /** Initial markdown content (already loaded from disk). */
  initialMarkdown: string;
  /** Whether editing is disabled (e.g. locked by another user). */
  readOnly?: boolean;
  /** Resolved attachment URLs (relative path -> object/remote URL) for media nodes. */
  resolvedUrls: Record<string, string>;
  /** Called with the current Markdown whenever the document changes. */
  onChange: (markdown: string) => void;
}

// ─── Slash command definitions ────────────────────────────────────────────────────

interface SlashItem {
  label: string;
  icon: React.ElementType;
  shortcut: string;
  run: (editor: Editor) => void;
}

const DEFAULT_TABLE = '| Columna 1 | Columna 2 | Columna 3 |\n|----------|----------|----------|\n| Celda 1   | Celda 2   | Celda 3   |\n| Celda 4   | Celda 5   | Celda 6   |';

const SLASH_ITEMS: SlashItem[] = [
  { label: 'Texto', icon: Type, shortcut: '', run: (e) => e.chain().focus().setParagraph().run() },
  { label: 'Encabezado 1', icon: Heading1, shortcut: '#', run: (e) => e.chain().focus().setHeading({ level: 1 }).run() },
  { label: 'Encabezado 2', icon: Heading2, shortcut: '##', run: (e) => e.chain().focus().setHeading({ level: 2 }).run() },
  { label: 'Encabezado 3', icon: Heading3, shortcut: '###', run: (e) => e.chain().focus().setHeading({ level: 3 }).run() },
  { label: 'Lista con viñetas', icon: List, shortcut: '-', run: (e) => e.chain().focus().toggleBulletList().run() },
  { label: 'Lista numerada', icon: ListOrdered, shortcut: '1.', run: (e) => e.chain().focus().toggleOrderedList().run() },
  { label: 'Lista de tareas', icon: CheckSquare, shortcut: '- [ ]', run: (e) => e.chain().focus().toggleTaskList().run() },
  { label: 'Cita', icon: Quote, shortcut: '>', run: (e) => e.chain().focus().toggleBlockquote().run() },
  { label: 'Código', icon: Code, shortcut: '```', run: (e) => e.chain().focus().toggleCodeBlock().run() },
  { label: 'Divisor', icon: Minus, shortcut: '---', run: (e) => e.chain().focus().setHorizontalRule().run() },
  { label: 'Diagrama Mermaid', icon: GitBranch, shortcut: '```mermaid', run: (e) => e.chain().focus().insertContent({ type: 'mermaid', attrs: { code: '' } }).run() },
  { label: 'Tabla', icon: Table, shortcut: '|', run: (e) => e.chain().focus().insertContent({ type: 'sourceTable', attrs: { source: DEFAULT_TABLE } }).run() },
];

// ─── Slash command menu ─────────────────────────────────────────────────────────

function SlashMenu({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(0);
  const slashPosRef = useRef<number | null>(null);

  const filtered = useMemo(() => {
    if (!filter) return SLASH_ITEMS;
    const lower = filter.toLowerCase();
    return SLASH_ITEMS.filter((c) => c.label.toLowerCase().includes(lower) || c.shortcut.includes(lower));
  }, [filter]);

  // Detect "/" typed at start of an empty-ish text position.
  useEffect(() => {
    const handler = () => {
      const { state } = editor;
      const { $from } = state.selection;
      const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\uFFFC');
      const match = /(?:^|\s)\/([\w]*)$/.exec(textBefore);
      if (match) {
        if (slashPosRef.current === null) slashPosRef.current = $from.pos - match[1].length - 1;
        setFilter(match[1]);
        const coords = editor.view.coordsAtPos($from.pos);
        setPos({ top: coords.bottom + 4, left: coords.left });
        setSelected(0);
      } else {
        slashPosRef.current = null;
        setPos(null);
      }
    };
    editor.on('selectionUpdate', handler);
    editor.on('update', handler);
    return () => {
      editor.off('selectionUpdate', handler);
      editor.off('update', handler);
    };
  }, [editor]);

  const applyItem = useCallback((item: SlashItem) => {
    // Remove the typed "/filter" then run the command.
    const { state } = editor;
    const { $from } = state.selection;
    const start = slashPosRef.current ?? $from.pos - filter.length - 1;
    editor.chain().focus().deleteRange({ from: start, to: $from.pos }).run();
    item.run(editor);
    slashPosRef.current = null;
    setPos(null);
    onClose();
  }, [editor, filter, onClose]);

  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((p) => (p + 1) % filtered.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((p) => (p - 1 + filtered.length) % filtered.length); }
      else if (e.key === 'Enter') { e.preventDefault(); if (filtered[selected]) applyItem(filtered[selected]); }
      else if (e.key === 'Escape') { e.preventDefault(); setPos(null); onClose(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [pos, filtered, selected, applyItem, onClose]);

  if (!pos || filtered.length === 0) return null;

  return (
    <div
      className="fixed z-[9999] bg-card border border-border rounded-xl shadow-card-hover py-1.5 min-w-[220px] max-h-[300px] overflow-y-auto animate-fade-in"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="px-3 py-1.5">
        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Bloques básicos</span>
      </div>
      {filtered.map((item, idx) => {
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            onMouseDown={(e) => { e.preventDefault(); applyItem(item); }}
            className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors cursor-pointer ${
              idx === selected ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="text-xs font-medium block flex-1 min-w-0">{item.label}</span>
            {item.shortcut && <span className="text-[10px] font-mono text-muted-foreground shrink-0">{item.shortcut}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─── Bubble (floating format) toolbar ─────────────────────────────────────────────

function FormatBubble({ editor }: { editor: Editor }) {
  const [linkMode, setLinkMode] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const linkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (linkMode && linkInputRef.current) linkInputRef.current.focus();
  }, [linkMode]);

  const applyLink = () => {
    if (linkUrl.trim()) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl.trim() }).run();
    }
    setLinkMode(false);
    setLinkUrl('');
  };

  const btn = (active: boolean) =>
    `p-1.5 rounded-lg transition-colors cursor-pointer ${active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`;

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top' }}
      shouldShow={({ editor: e, from, to }) => from !== to && e.isEditable}
      className="bg-card border border-border rounded-xl shadow-card-hover px-1 py-1 flex items-center gap-0.5 animate-fade-in"
    >
      {!linkMode ? (
        <>
          <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }} className={btn(editor.isActive('bold'))} title="Negrita"><Bold className="w-4 h-4" /></button>
          <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }} className={btn(editor.isActive('italic'))} title="Cursiva"><Italic className="w-4 h-4" /></button>
          <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleUnderline().run(); }} className={btn(editor.isActive('underline'))} title="Subrayado"><Underline className="w-4 h-4" /></button>
          <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleStrike().run(); }} className={btn(editor.isActive('strike'))} title="Tachado"><Strikethrough className="w-4 h-4" /></button>
          <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleCode().run(); }} className={btn(editor.isActive('code'))} title="Código"><Code className="w-4 h-4" /></button>
          <button onMouseDown={(e) => { e.preventDefault(); setLinkUrl(editor.getAttributes('link').href || ''); setLinkMode(true); }} className={btn(editor.isActive('link'))} title="Enlace"><LinkIcon className="w-4 h-4" /></button>
        </>
      ) : (
        <div className="flex items-center gap-1 px-1">
          <input
            ref={linkInputRef}
            type="text"
            className="bg-secondary border border-input rounded-lg px-2 py-1 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-48"
            placeholder="https://..."
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } if (e.key === 'Escape') { setLinkMode(false); setLinkUrl(''); } }}
          />
          <button onMouseDown={(e) => { e.preventDefault(); applyLink(); }} className="p-1.5 rounded-lg text-bento-green hover:bg-accent transition-colors cursor-pointer" title="Aplicar enlace"><Check className="w-4 h-4" /></button>
        </div>
      )}
    </BubbleMenu>
  );
}

// ─── Main editor component ─────────────────────────────────────────────────────────

const TipTapDocEditor = forwardRef<TipTapDocEditorHandle, TipTapDocEditorProps>(
  ({ initialMarkdown, readOnly = false, resolvedUrls, onChange }, ref) => {
    const [showSlash, setShowSlash] = useState(true);
    const [viewReady, setViewReady] = useState(false);

    const editor = useEditor({
      extensions: buildExtensions(),
      content: markdownToTiptapHtml(normalizeMarkdown(initialMarkdown)),
      editable: !readOnly,
      editorProps: {
        attributes: {
          class: 'focus:outline-none font-body',
        },
      },
      onCreate: () => setViewReady(true),
      onUpdate: ({ editor: e }) => {
        onChange(pmDocToMarkdown(e.getJSON() as any));
      },
    });

    // Reflect readOnly changes.
    useEffect(() => {
      editor?.setEditable(!readOnly);
    }, [editor, readOnly]);

    useImperativeHandle(ref, (): TipTapDocEditorHandle => ({
      getMarkdown: () => (editor ? pmDocToMarkdown(editor.getJSON() as any) : ''),
      setMarkdown: (md: string) => {
        editor?.commands.setContent(markdownToTiptapHtml(normalizeMarkdown(md)));
      },
      insertImage: (src: string, alt: string) => {
        editor?.chain().focus().insertContent({ type: 'mediaImage', attrs: { src, alt } }).run();
      },
      insertVideo: (src: string) => {
        editor?.chain().focus().insertContent({ type: 'mediaVideo', attrs: { src } }).run();
      },
      focus: () => editor?.commands.focus(),
    }), [editor]);

    const assets = useMemo(() => ({ resolvedUrls }), [resolvedUrls]);

    if (!editor) return null;

    return (
      <EditorAssetsProvider value={assets}>
        <EditorContent editor={editor} />
        {viewReady && editor.isEditable && <BlockGutter editor={editor} />}
        {viewReady && editor.isEditable && <FormatBubble editor={editor} />}
        {viewReady && editor.isEditable && showSlash && <SlashMenu editor={editor} onClose={() => setShowSlash(true)} />}
      </EditorAssetsProvider>
    );
  }
);

TipTapDocEditor.displayName = 'TipTapDocEditor';

export default TipTapDocEditor;
