/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Documents view: the folders of /docs and their documents as a grid of cards with a
 * preview, like the projects home of Nori. Folders are shown above the documents (only at
 * the root: a folder holds documents, not other folders), documents are dragged onto a
 * folder (here or in the sidebar) to move them, onto the trash to delete them or among the
 * others to arrange them, and both have context menus.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  FilePlus,
  FolderSimple,
  FolderOpen,
  FolderSimplePlus,
  CaretRight,
  DotsThree,
  Plus,
  DownloadSimple,
  ArrowClockwise,
  File,
  ClockCounterClockwise,
  HandGrabbing,
  SortAscending,
} from '@phosphor-icons/react';
import { useUI } from '../lib/ui';
import { useProjectStore } from '../store';
import { DocMetadata } from '../types';
import { markdownToHtml } from '../lib/markdown';
import { ContextMenu, ContextMenuItem } from './ContextMenu';
import { MenuButton, MenuButtonItem } from './MenuButton';
import { Dropdown } from './Dropdown';

// ─── Dragging documents into folders ──────────────────────────────────────────

/** Drop target while a doc card is dragged: a folder name, the root of /docs or the trash */
export type DocDropTarget = string;
export const DOCS_ROOT = '__root__';
export const DOCS_TRASH = '__trash__';
/** dataTransfer type that marks the drag of a doc card (not a file from the system) */
export const DOC_DRAG_TYPE = 'application/x-kora-doc';

/** Drop zones for doc cards, shared by the documents view and the sidebar */
export function useDocDrop() {
  const { moveDocToFolder, deleteDoc } = useProjectStore();
  const { toast } = useUI();
  const [dropTarget, setDropTarget] = useState<DocDropTarget | null>(null);

  // A drag that ends anywhere clears the highlight
  useEffect(() => {
    const clear = () => setDropTarget(null);
    window.addEventListener('dragend', clear);
    window.addEventListener('drop', clear);
    return () => {
      window.removeEventListener('dragend', clear);
      window.removeEventListener('drop', clear);
    };
  }, []);

  const moveDoc = useCallback(
    async (docId: string, target: DocDropTarget) => {
      const doc = useProjectStore.getState().docs.find((d) => d.id === docId);
      if (!doc) return;
      if (target === DOCS_TRASH) {
        try {
          await deleteDoc(docId);
          toast(`"${doc.title}" se movió a la papelera`, 'success');
        } catch {
          toast('No se pudo borrar el documento', 'error');
        }
        return;
      }
      const folder = target === DOCS_ROOT ? null : target;
      if ((doc.folder ?? null) === folder) return;
      try {
        await moveDocToFolder(docId, folder);
        toast(
          folder ? `"${doc.title}" se movió a "${folder}"` : `"${doc.title}" se movió a la raíz de Documentos`,
          'success'
        );
      } catch {
        toast('No se pudo mover el documento', 'error');
      }
    },
    [moveDocToFolder, deleteDoc, toast]
  );

  /** Props that turn an element into a place where a doc card can be dropped */
  const dropZone = (target: DocDropTarget) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DOC_DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dropTarget !== target) setDropTarget(target);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setDropTarget((prev) => (prev === target ? null : prev));
    },
    onDrop: (e: React.DragEvent) => {
      const id = e.dataTransfer.getData(DOC_DRAG_TYPE);
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      setDropTarget(null);
      moveDoc(id, target);
    },
  });

  // Highlight of a drop zone while a doc is dragged over it
  const dropClass = (target: DocDropTarget) =>
    dropTarget === target
      ? target === DOCS_ROOT
        ? 'bg-bento-orange/10 ring-1 ring-bento-orange/40'
        : target === DOCS_TRASH
          ? 'bg-destructive/10 text-destructive ring-1 ring-destructive/40'
          : 'bg-bento-yellow/10 ring-1 ring-bento-yellow/50'
      : '';

  return { dropZone, dropClass, dropTarget, moveDoc };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelative(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return 'ahora mismo';
  if (mins < 60) return `hace ${mins} min`;
  if (hours < 24) return `hace ${hours} h`;
  if (days < 7) return `hace ${days} d`;
  return new Date(timestamp).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

const docTime = (d: DocMetadata) => d.editedAt ?? d.createdAt;

// ─── Order of the documents ───────────────────────────────────────────────────

/** How the documents view sorts the docs: most recently edited first, by title or as arranged */
type DocSort = 'recent' | 'alphabetical' | 'manual';
const DOC_SORT_KEY = 'kora-doc-sort';

function getDocSort(): DocSort {
  try {
    const stored = localStorage.getItem(DOC_SORT_KEY);
    return stored === 'manual' || stored === 'alphabetical' ? stored : 'recent';
  } catch {
    return 'recent';
  }
}

function setDocSortPreference(sort: DocSort) {
  try {
    localStorage.setItem(DOC_SORT_KEY, sort);
  } catch {}
}

const SORT_OPTIONS: { value: DocSort; label: string; description: string; Icon: React.ElementType }[] = [
  {
    value: 'recent',
    label: 'Última edición',
    description: 'Los documentos editados más recientemente primero',
    Icon: ClockCounterClockwise,
  },
  {
    value: 'alphabetical',
    label: 'Alfabético',
    description: 'Los documentos por título, de la A a la Z',
    Icon: SortAscending,
  },
  {
    value: 'manual',
    label: 'Orden manual',
    description: 'Arrastra los documentos para ordenarlos a tu gusto',
    Icon: HandGrabbing,
  },
];

const titleCollator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

/**
 * Docs in manual order. Those never arranged (new, imported or just moved to the folder) go
 * first, most recently edited first, so they don't get lost at the end of the list.
 */
function sortDocsManually(docs: DocMetadata[]): DocMetadata[] {
  return [...docs].sort((a, b) => {
    if (a.order === undefined || b.order === undefined) {
      if (a.order === undefined && b.order === undefined) return docTime(b) - docTime(a);
      return a.order === undefined ? -1 : 1;
    }
    return a.order - b.order;
  });
}

function sortDocs(docs: DocMetadata[], sort: DocSort): DocMetadata[] {
  if (sort === 'manual') return sortDocsManually(docs);
  if (sort === 'alphabetical') return [...docs].sort((a, b) => titleCollator.compare(a.title, b.title));
  return [...docs].sort((a, b) => docTime(b) - docTime(a));
}

// Where a dragged card would land among the others (manual order)
type ReorderTarget = { id: string; side: 'before' | 'after' };

/** Title of an imported Markdown file: its first heading, or the file name */
function titleFromMarkdown(content: string, filename: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return (heading || filename.replace(/\.(md|markdown|txt)$/i, '').replace(/[-_]+/g, ' ')).slice(0, 120);
}

/** Reads Markdown files dropped or picked from the system */
const isMarkdownFile = (file: globalThis.File) => /\.(md|markdown|txt)$/i.test(file.name);

// Contents already read, so the previews don't read every file again on each render
const previewCache = new Map<string, string>();
const previewKey = (d: DocMetadata) => `${d.id}|${d.folder ?? ''}|${d.filename}|${docTime(d)}`;

/** Markdown of the preview: no media and no raw HTML */
function previewHtml(content: string): string {
  const text = content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<video[\s\S]*?<\/video>/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .split('\n')
    .slice(0, 60)
    .join('\n');
  return markdownToHtml(text);
}

// ─── Documents view ───────────────────────────────────────────────────────────

export default function DocumentsBrowser() {
  const {
    docs,
    users,
    docFolders,
    docsFolder,
    setShowDocs,
    setSelectedDoc,
    createDoc,
    getDocContent,
    saveDocContent,
    deleteDoc,
    scanDocuments,
    createDocFolder,
    renameDocFolder,
    reorderDocs,
  } = useProjectStore();
  const { toast, prompt } = useUI();
  const { dropZone, dropClass, dropTarget, moveDoc } = useDocDrop();

  const currentFolder = docsFolder;
  const openFolder = (folder: string | null) => setShowDocs(true, folder);

  const [sort, setSort] = useState<DocSort>(getDocSort);
  const changeSort = (next: DocSort) => {
    setSort(next);
    setDocSortPreference(next);
  };
  const visibleDocs = useMemo(
    () => sortDocs(docs.filter((d) => (d.folder ?? null) === currentFolder), sort),
    [docs, currentFolder, sort]
  );
  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    docs.forEach((d) => {
      if (d.folder) counts.set(d.folder, (counts.get(d.folder) ?? 0) + 1);
    });
    return counts;
  }, [docs]);

  // ── Creating and importing ──────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreateDoc = async () => {
    const title = (await prompt({
      title: 'Nuevo documento',
      placeholder: 'Título del documento',
      defaultValue: 'Nuevo documento',
      confirmLabel: 'Crear',
    }))?.trim();
    if (!title) return;
    try {
      await createDoc(title, `# ${title}\n\nEscribe contenido en Markdown aquí...\n`, currentFolder ?? undefined);
    } catch {
      toast('Error al crear el documento', 'error');
    }
  };

  const handleCreateFolder = async () => {
    const name = (await prompt({
      title: 'Nueva carpeta',
      placeholder: 'Nombre de la carpeta',
      defaultValue: 'Nueva carpeta',
      confirmLabel: 'Crear',
    }))?.trim();
    if (!name) return;
    try {
      await createDocFolder(name.slice(0, 60));
      toast('Carpeta creada', 'success');
    } catch (err: any) {
      toast(err?.message || 'Error al crear carpeta', 'error');
    }
  };

  const importFiles = async (files: globalThis.File[]) => {
    const markdown = files.filter(isMarkdownFile);
    if (markdown.length === 0) {
      toast('Solo se pueden importar archivos Markdown (.md)', 'error');
      return;
    }
    let imported = 0;
    for (const file of markdown) {
      try {
        const content = await file.text();
        // A single file opens right away, several stay in the grid
        await createDoc(titleFromMarkdown(content, file.name), content, currentFolder ?? undefined, markdown.length === 1);
        imported++;
      } catch {
        toast(`No se pudo importar "${file.name}"`, 'error');
      }
    }
    if (imported > 1) toast(`Se importaron ${imported} documentos`, 'success');
    if (markdown.length < files.length) toast('Se omitieron los archivos que no son Markdown', 'info');
  };

  const handleScan = async () => {
    try {
      const found = await scanDocuments();
      toast(found > 0 ? `Se detectaron ${found} documento(s) nuevo(s)` : 'No se encontraron documentos nuevos', found > 0 ? 'success' : 'info');
    } catch {
      toast('Error al escanear documentos', 'error');
    }
  };

  const createItems: MenuButtonItem[] = [
    {
      label: 'Documento en blanco',
      description: currentFolder ? `Se guarda en la carpeta "${currentFolder}"` : 'Un archivo Markdown nuevo',
      Icon: FilePlus,
      onSelect: handleCreateDoc,
    },
    {
      label: 'Importar Markdown',
      description: 'Uno o varios archivos .md de tu equipo',
      Icon: DownloadSimple,
      onSelect: () => fileInputRef.current?.click(),
    },
    // Folders live at the root of /docs
    ...(!currentFolder
      ? [
          {
            label: 'Carpeta',
            description: 'Para agrupar documentos; arrastra los documentos sobre ella',
            Icon: FolderSimplePlus,
            separatorBefore: true,
            onSelect: handleCreateFolder,
          },
        ]
      : []),
  ];

  // Markdown files dragged from the system onto the window
  const [draggingFile, setDraggingFile] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const handleEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDraggingFile(true);
    };
    const handleLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDraggingFile(false);
    };
    const handleOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const handleDrop = (e: DragEvent) => {
      depth = 0;
      setDraggingFile(false);
      if (!hasFiles(e)) return;
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) importFiles(files);
    };
    const handleEnd = () => {
      depth = 0;
      setDraggingFile(false);
    };
    window.addEventListener('dragenter', handleEnter);
    window.addEventListener('dragleave', handleLeave);
    window.addEventListener('dragover', handleOver);
    window.addEventListener('drop', handleDrop);
    window.addEventListener('dragend', handleEnd);
    return () => {
      window.removeEventListener('dragenter', handleEnter);
      window.removeEventListener('dragleave', handleLeave);
      window.removeEventListener('dragover', handleOver);
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('dragend', handleEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolder]);

  // ── Folders ─────────────────────────────────────────────────────────────────
  const [folderMenu, setFolderMenu] = useState<{ x: number; y: number; folder: string } | null>(null);
  const closeFolderMenu = useCallback(() => setFolderMenu(null), []);
  const { renameFolder, deleteFolder } = useDocFolderActions();

  const buildFolderMenuItems = (folder: string): ContextMenuItem[] => [
    { label: 'Abrir', onSelect: () => openFolder(folder) },
    { label: 'Renombrar…', onSelect: () => renameFolder(folder) },
    'separator',
    { label: 'Eliminar carpeta', danger: true, onSelect: () => deleteFolder(folder) },
  ];

  // ── Document actions ────────────────────────────────────────────────────────
  const [menu, setMenu] = useState<{ x: number; y: number; doc: DocMetadata } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [reorderTarget, setReorderTarget] = useState<ReorderTarget | null>(null);

  /**
   * Puts the dragged doc before or after another one. Arranging docs switches the view to the
   * manual order, starting from the order on screen.
   */
  const reorderDoc = async (id: string, { id: targetId, side }: ReorderTarget) => {
    const current = visibleDocs.map((d) => d.id);
    const ids = current.filter((other) => other !== id);
    let at = ids.indexOf(targetId);
    if (at < 0 || !current.includes(id)) return;
    if (side === 'after') at++;
    ids.splice(at, 0, id);
    if (ids.every((other, i) => other === current[i])) return;
    if (sort !== 'manual') {
      changeSort('manual');
      toast('Orden manual activado: los documentos se quedan donde los dejes', 'success');
    }
    try {
      await reorderDocs(ids);
    } catch {
      toast('No se pudo guardar el orden de los documentos', 'error');
    }
  };

  const docDrag = (doc: DocMetadata) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData(DOC_DRAG_TYPE, doc.id);
      e.dataTransfer.setData('text/plain', doc.title);
      setDraggedId(doc.id);
    },
    onDragEnd: () => {
      setDraggedId(null);
      setReorderTarget(null);
    },
    // Another card dragged over this one: it would land on the side of the cursor (the grid
    // takes the drop, so it also works in the gap between cards)
    onDragOver: (e: React.DragEvent) => {
      if (!draggedId || !e.dataTransfer.types.includes(DOC_DRAG_TYPE)) return;
      if (draggedId === doc.id) {
        if (reorderTarget) setReorderTarget(null);
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const side = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
      if (reorderTarget?.id !== doc.id || reorderTarget.side !== side) setReorderTarget({ id: doc.id, side });
    },
  });

  /** Props of the grid of documents, where a dragged card is dropped among the others */
  const reorderZone = {
    onDragOver: (e: React.DragEvent) => {
      if (!draggedId || !e.dataTransfer.types.includes(DOC_DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setReorderTarget(null);
    },
    onDrop: (e: React.DragEvent) => {
      const id = e.dataTransfer.getData(DOC_DRAG_TYPE);
      if (!id) return;
      e.preventDefault();
      const target = reorderTarget;
      setReorderTarget(null);
      setDraggedId(null);
      if (target && target.id !== id) reorderDoc(id, target);
    },
  };

  const handleRename = async (doc: DocMetadata) => {
    const title = (await prompt({ title: 'Renombrar documento', defaultValue: doc.title, confirmLabel: 'Renombrar' }))?.trim();
    if (!title || title === doc.title) return;
    try {
      await saveDocContent(doc.id, title.slice(0, 120), await getDocContent(doc.id));
      toast(`Documento renombrado a "${title}"`, 'success');
    } catch {
      toast('No se pudo renombrar el documento', 'error');
    }
  };

  const handleDuplicate = async (doc: DocMetadata) => {
    try {
      const copy = await createDoc(`${doc.title} (copia)`, await getDocContent(doc.id), doc.folder, false);
      toast(`Documento duplicado: "${copy.title}"`, 'success');
    } catch {
      toast('No se pudo duplicar el documento', 'error');
    }
  };

  const handleDownload = async (doc: DocMetadata) => {
    try {
      const content = await getDocContent(doc.id);
      const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(`Documento descargado: ${doc.filename}`, 'success');
    } catch {
      toast('No se pudo descargar el documento', 'error');
    }
  };

  const handleTrash = async (doc: DocMetadata) => {
    try {
      await deleteDoc(doc.id);
      toast(`"${doc.title}" se movió a la papelera`, 'success');
    } catch {
      toast('No se pudo borrar el documento', 'error');
    }
  };

  const buildMenuItems = (doc: DocMetadata): ContextMenuItem[] => [
    { label: 'Abrir', onSelect: () => setSelectedDoc(doc.id) },
    { label: 'Descargar Markdown', onSelect: () => handleDownload(doc) },
    'separator',
    { label: 'Renombrar…', onSelect: () => handleRename(doc) },
    { label: 'Duplicar', onSelect: () => handleDuplicate(doc) },
    ...(doc.folder ? [{ label: 'Sacar de la carpeta', onSelect: () => moveDoc(doc.id, DOCS_ROOT) } as ContextMenuItem] : []),
    'separator',
    { label: 'Borrar', danger: true, onSelect: () => handleTrash(doc) },
  ];

  const editorName = (doc: DocMetadata) => users.find((u) => u.id === doc.editedBy)?.name;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-background select-none">
      <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
        {/* Header */}
        <div className="border-b border-border pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {currentFolder ? (
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-black text-foreground font-heading flex items-center gap-2 min-w-0">
                <button
                  onClick={() => openFolder(null)}
                  {...dropZone(DOCS_ROOT)}
                  className={`-mx-1.5 px-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0 ${dropClass(DOCS_ROOT)}`}
                  data-tooltip="Volver a Documentos (suelta aquí un documento para sacarlo de la carpeta)"
                >
                  Documentos
                </button>
                <CaretRight className="w-4 h-4 text-muted-foreground shrink-0" weight="bold" />
                <FolderOpen className="w-6 h-6 text-bento-yellow shrink-0" weight="fill" />
                <FolderTitleInput
                  key={currentFolder}
                  name={currentFolder}
                  onRename={async (name) => {
                    try {
                      const renamed = await renameDocFolder(currentFolder, name);
                      if (renamed) toast(`Carpeta renombrada a "${renamed}"`, 'success');
                    } catch (err: any) {
                      toast(err?.message || 'No se pudo renombrar la carpeta', 'error');
                    }
                  }}
                />
              </h1>
              <p className="text-muted-foreground text-xs mt-1.5 leading-normal max-w-xl">
                Los documentos que crees o importes aquí se guardan en esta carpeta (/docs/{currentFolder}). Arrastra un documento a
                "Documentos" o a otra carpeta para moverlo.
              </p>
            </div>
          ) : (
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-black text-foreground font-heading">Documentos</h1>
              <p className="text-muted-foreground text-xs mt-1.5 leading-normal max-w-xl">
                Tus documentos se guardan como archivos Markdown en la carpeta /docs del proyecto. Haz clic en uno para abrirlo,
                arrástralo entre los demás para ordenarlo, sobre una carpeta para guardarlo en ella o a la Papelera para borrarlo.
              </p>
            </div>
          )}
        </div>

        {/* Create or import */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <MenuButton
              label="Crear"
              Icon={Plus}
              items={createItems}
              primary
              title={currentFolder ? 'Documento en blanco o importar Markdown' : 'Documento en blanco, importar Markdown o carpeta'}
            />
            <button
              onClick={handleScan}
              data-tooltip="Busca en la carpeta /docs archivos .md agregados desde fuera de Kora"
              className="h-8 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap bg-card border-border text-foreground hover:bg-accent"
            >
              <ArrowClockwise className="w-4 h-4 text-bento-blue" />
              Escanear documentos
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {currentFolder
              ? 'También puedes arrastrar archivos .md a cualquier parte de la ventana; se guardarán en esta carpeta.'
              : 'También puedes arrastrar archivos .md a cualquier parte de la ventana para importarlos.'}
          </p>
          <input
            type="file"
            ref={fileInputRef}
            multiple
            accept=".md,.markdown,.txt,text/markdown"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              if (files.length > 0) importFiles(files);
            }}
          />
        </section>

        {/* Folders (only at the root) */}
        {!currentFolder && docFolders.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
              Carpetas <span className="font-mono">({docFolders.length})</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {docFolders.map((folder) => (
                <FolderCard
                  key={folder}
                  folder={folder}
                  count={folderCounts.get(folder) ?? 0}
                  dropProps={dropZone(folder)}
                  isDropTarget={!!draggedId && dropTarget === folder}
                  onOpen={() => openFolder(folder)}
                  onOpenMenu={(x, y) => setFolderMenu({ x, y, folder })}
                />
              ))}
            </div>
          </section>
        )}

        {/* Documents, most recently edited first, by title or in the user's order */}
        <section className="space-y-3 pb-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
              {currentFolder ? 'Documentos en esta carpeta' : 'Mis documentos'} <span className="font-mono">({visibleDocs.length})</span>
            </h2>
            {visibleDocs.length > 1 && (
              <Dropdown
                value={sort}
                options={SORT_OPTIONS.map(({ Icon, ...o }) => ({
                  ...o,
                  icon: <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />,
                }))}
                onChange={changeSort}
                size="sm"
                menuClassName="w-44"
                optionClassName=""
                title="Orden de los documentos"
                ariaLabel="Orden de los documentos"
              />
            )}
          </div>
          {visibleDocs.length === 0 ? (
            <div className="text-center py-16 px-6 border border-dashed border-border rounded-2xl">
              {currentFolder ? (
                <>
                  <FolderOpen className="w-12 h-12 mx-auto mb-3 text-bento-yellow opacity-40" />
                  <p className="text-sm font-semibold text-foreground">Carpeta vacía</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Crea o importa un documento aquí, o arrastra uno desde Documentos hasta esta carpeta en la barra lateral.
                  </p>
                </>
              ) : (
                <>
                  <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                  <p className="text-sm font-semibold text-foreground">
                    {docs.length > 0 ? 'No hay documentos fuera de las carpetas' : 'Aún no tienes documentos'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Crea uno nuevo o importa un archivo Markdown para empezar.</p>
                </>
              )}
            </div>
          ) : (
            <div {...reorderZone} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {visibleDocs.map((doc) => (
                <DocCard
                  key={doc.id}
                  doc={doc}
                  editor={editorName(doc)}
                  loadContent={getDocContent}
                  dragProps={docDrag(doc)}
                  dragging={draggedId === doc.id}
                  dropSide={draggedId && reorderTarget?.id === doc.id ? reorderTarget.side : null}
                  onOpen={() => setSelectedDoc(doc.id)}
                  onOpenMenu={(x, y) => setMenu({ x, y, doc })}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {draggingFile && (
        <div className="fixed inset-0 z-40 p-4 bg-background/70 backdrop-blur-[2px] pointer-events-none animate-fade-in">
          <div className="h-full rounded-2xl border-2 border-dashed border-bento-blue bg-bento-blue-light/60 flex flex-col items-center justify-center gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-bento-blue text-white flex items-center justify-center shadow-card">
              <DownloadSimple className="w-7 h-7" />
            </div>
            <p className="text-base font-bold text-foreground font-heading">Suelta los archivos para importarlos</p>
            <p className="text-xs text-muted-foreground">
              {currentFolder
                ? `Archivos Markdown (.md) · se crearán documentos nuevos en la carpeta "${currentFolder}"`
                : 'Archivos Markdown (.md) · se crearán documentos nuevos'}
            </p>
          </div>
        </div>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={buildMenuItems(menu.doc)} onClose={closeMenu} />}
      {folderMenu && (
        <ContextMenu x={folderMenu.x} y={folderMenu.y} items={buildFolderMenuItems(folderMenu.folder)} onClose={closeFolderMenu} />
      )}
    </div>
  );
}

// ─── Folder actions (documents view and sidebar) ──────────────────────────────

export function useDocFolderActions() {
  const { docs, renameDocFolder, deleteDocFolder } = useProjectStore();
  const { toast, confirm, prompt } = useUI();

  const renameFolder = async (folder: string) => {
    const name = (await prompt({ title: 'Renombrar carpeta', defaultValue: folder, confirmLabel: 'Renombrar' }))?.trim();
    if (!name || name === folder) return;
    try {
      const renamed = await renameDocFolder(folder, name.slice(0, 60));
      if (renamed) toast(`Carpeta renombrada a "${renamed}"`, 'success');
    } catch (err: any) {
      toast(err?.message || 'No se pudo renombrar la carpeta', 'error');
    }
  };

  const deleteFolder = async (folder: string) => {
    const count = docs.filter((d) => d.folder === folder).length;
    const ok = await confirm({
      title: 'Eliminar carpeta',
      message:
        count === 0
          ? `¿Eliminar la carpeta "${folder}"? Está vacía.`
          : count === 1
            ? `¿Eliminar la carpeta "${folder}"? El documento que contiene pasará a la raíz de Documentos; no se borra ningún documento.`
            : `¿Eliminar la carpeta "${folder}"? Los ${count} documentos que contiene pasarán a la raíz de Documentos; no se borra ningún documento.`,
      confirmLabel: 'Eliminar carpeta',
      variant: 'danger',
    });
    if (ok !== true) return;
    try {
      await deleteDocFolder(folder);
      toast(`Carpeta "${folder}" eliminada`, 'success');
    } catch {
      toast('No se pudo eliminar la carpeta', 'error');
    }
  };

  return { renameFolder, deleteFolder };
}

// ─── Document card ────────────────────────────────────────────────────────────

interface DocCardProps {
  doc: DocMetadata;
  editor?: string;
  loadContent: (docId: string) => Promise<string>;
  /** Native drag props, to drop the card on a folder */
  dragProps: React.HTMLAttributes<HTMLDivElement> & { draggable: boolean };
  dragging: boolean;
  /** Side where the dragged card would land, next to this one (manual order) */
  dropSide: 'before' | 'after' | null;
  onOpen: () => void;
  onOpenMenu: (x: number, y: number) => void;
}

function DocCard({ doc, editor, loadContent, dragProps, dragging, dropSide, onOpen, onOpenMenu }: DocCardProps) {
  return (
    <div
      {...dragProps}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onOpenMenu(e.clientX, e.clientY);
      }}
      className={`relative group border border-border bg-card hover:border-bento-orange/50 hover:shadow-card-hover rounded-2xl transition-all duration-300 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        dragging ? 'opacity-50' : ''
      }`}
    >
      {/* Where the dragged card would land: a bar in the gap on that side */}
      {dropSide && (
        <span
          className={`absolute -top-1 -bottom-1 w-1 rounded-full bg-bento-orange pointer-events-none ${
            dropSide === 'before' ? '-left-2.5' : '-right-2.5'
          }`}
        />
      )}
      <DocThumbnail doc={doc} loadContent={loadContent} />
      <div className="p-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground text-sm truncate font-heading">{doc.title}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            Editado {formatRelative(docTime(doc))}
            {editor ? ` · ${editor}` : ''}
          </p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            onOpenMenu(rect.left, rect.bottom + 4);
          }}
          className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0 cursor-pointer"
          data-tooltip="Más opciones"
          aria-label="Más opciones"
        >
          <DotsThree className="w-4 h-4" weight="bold" />
        </button>
      </div>
    </div>
  );
}

/** First lines of the document, drawn as a small page */
function DocThumbnail({ doc, loadContent }: { doc: DocMetadata; loadContent: (docId: string) => Promise<string> }) {
  const key = previewKey(doc);
  const [content, setContent] = useState<string | null>(() => previewCache.get(key) ?? null);

  useEffect(() => {
    const cached = previewCache.get(key);
    if (cached !== undefined) {
      setContent(cached);
      return;
    }
    let cancelled = false;
    loadContent(doc.id)
      .then((text) => {
        previewCache.set(key, text);
        if (!cancelled) setContent(text);
      })
      .catch(() => {
        if (!cancelled) setContent('');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const html = useMemo(() => (content ? previewHtml(content) : ''), [content]);

  return (
    <div className="relative aspect-video border-b border-border bg-secondary rounded-t-2xl overflow-hidden" aria-hidden="true">
      <div className="absolute inset-x-4 top-3 bottom-0 rounded-t-lg bg-card border border-b-0 border-border shadow-card overflow-hidden transition-transform duration-300 group-hover:-translate-y-1">
        {content === null ? (
          <div className="p-3 space-y-2 animate-pulse">
            <div className="h-2.5 w-2/3 rounded bg-muted" />
            <div className="h-1.5 w-full rounded bg-muted" />
            <div className="h-1.5 w-5/6 rounded bg-muted" />
            <div className="h-1.5 w-4/6 rounded bg-muted" />
          </div>
        ) : html ? (
          <div
            className="w-[200%] origin-top-left scale-50 px-6 pt-1 pb-4 pointer-events-none [&_h1]:mt-2"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <FileText className="w-8 h-8 opacity-30" />
            <span className="text-[10px] italic">Documento vacío</span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-card to-transparent pointer-events-none" />
      </div>
    </div>
  );
}

// ─── Folder title ─────────────────────────────────────────────────────────────

// Name of the open folder, renamed in place: Enter or leaving the field saves,
// Escape restores the current name
function FolderTitleInput({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState(name);

  // Keep the field in sync when the folder is renamed elsewhere (sidebar, another user)
  useEffect(() => setDraft(name), [name]);

  const commit = () => {
    const next = draft.trim();
    if (!next) setDraft(name);
    else if (next !== name) onRename(next);
  };

  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setDraft(name);
          // Blur after the reset so the current name is kept
          const input = e.currentTarget;
          requestAnimationFrame(() => input.blur());
        }
      }}
      size={Math.max(4, draft.length + 1)}
      maxLength={60}
      spellCheck={false}
      data-tooltip="Clic para renombrar la carpeta"
      aria-label="Nombre de la carpeta"
      className="min-w-0 max-w-full bg-transparent border-0 text-foreground text-xl sm:text-2xl font-black font-heading hover:bg-accent focus:bg-card -ml-1 px-1.5 py-0.5 rounded-xl focus:outline-none transition-colors focus:ring-1 focus:ring-ring truncate"
    />
  );
}

// ─── Folder card ──────────────────────────────────────────────────────────────

interface FolderCardProps {
  folder: string;
  count: number;
  dropProps: React.HTMLAttributes<HTMLDivElement>;
  isDropTarget: boolean;
  onOpen: () => void;
  onOpenMenu: (x: number, y: number) => void;
}

function FolderCard({ folder, count, dropProps, isDropTarget, onOpen, onOpenMenu }: FolderCardProps) {
  return (
    <div
      {...dropProps}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onOpenMenu(e.clientX, e.clientY);
      }}
      className={`group h-14 pl-3 pr-2 flex items-center gap-3 border rounded-xl transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isDropTarget
          ? 'border-bento-yellow bg-bento-yellow/10 ring-2 ring-bento-yellow/40'
          : 'border-border bg-card hover:border-bento-yellow/60 hover:shadow-card-hover'
      }`}
    >
      {isDropTarget ? (
        <FolderOpen className="w-6 h-6 shrink-0 text-bento-yellow" weight="fill" />
      ) : (
        <FolderSimple className="w-6 h-6 shrink-0 text-bento-yellow" weight="fill" />
      )}
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-foreground text-sm truncate font-heading">{folder}</h3>
        <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
          <File className="w-3 h-3 shrink-0" />
          {count === 0 ? 'Vacía' : count === 1 ? '1 documento' : `${count} documentos`}
        </p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          onOpenMenu(rect.left, rect.bottom + 4);
        }}
        className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0 cursor-pointer"
        data-tooltip="Más opciones"
        aria-label="Más opciones"
      >
        <DotsThree className="w-4 h-4" weight="bold" />
      </button>
    </div>
  );
}
