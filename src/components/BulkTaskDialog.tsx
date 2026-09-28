/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Dialog to create one or many tasks at once: one task per line. Opened when a
 * multi-line text is pasted into the quick-add input, from the "Varias" button,
 * or from a Kanban column's "Crear tarea".
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ListPlus, X } from '@phosphor-icons/react';
import CustomSelect from './CustomSelect';
import type { Task, TaskStatus } from '../types';

/**
 * Split pasted text into task titles: one per non-empty line, dropping the list
 * markers people usually copy along ("- ", "* ", "• ", "1. ", "- [ ] ").
 */
export function parseTaskLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^(?:(?:[-*+•]|\d+[.)])\s+)?(?:\[[ xX]?\]\s+)?/, '')
        .trim()
    )
    .filter(Boolean);
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Prioridad Baja' },
  { value: 'medium', label: 'Prioridad Media' },
  { value: 'high', label: 'Prioridad Alta' },
  { value: 'urgent', label: 'Prioridad Urgente' },
];

interface BulkTaskDialogProps {
  initialText: string;
  statuses: TaskStatus[];
  defaultStatusId: string;
  defaultPriority: Task['priority'];
  onClose: () => void;
  /** Resolves once the tasks are created; the dialog closes afterwards. */
  onCreate: (titles: string[], statusId: string, priority: Task['priority']) => Promise<void>;
}

export default function BulkTaskDialog({
  initialText,
  statuses,
  defaultStatusId,
  defaultPriority,
  onClose,
  onCreate,
}: BulkTaskDialogProps) {
  const [text, setText] = useState(initialText);
  const [statusId, setStatusId] = useState(defaultStatusId);
  const [priority, setPriority] = useState<Task['priority']>(defaultPriority);
  const [creating, setCreating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const titles = useMemo(() => parseTaskLines(text), [text]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const submit = async () => {
    if (titles.length === 0 || creating) return;
    setCreating(true);
    try {
      await onCreate(titles, statusId, priority);
      onClose();
    } finally {
      setCreating(false);
    }
  };

  const countLabel = titles.length === 1 ? '1 tarea' : `${titles.length} tareas`;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-foreground/20 backdrop-blur-[2px] animate-fade-in"
      onClick={() => !creating && onClose()}
    >
      <div
        className="bg-card border border-border rounded-2xl shadow-card-hover w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <ListPlus className="w-4 h-4 text-bento-blue shrink-0" />
            <h2 className="text-sm font-bold text-foreground font-heading">Crear tareas</h2>
          </div>
          <button
            onClick={onClose}
            disabled={creating}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-5">
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
            Escribe o pega una tarea por línea. Las viñetas y numeraciones se quitan automáticamente.
          </p>
          <textarea
            ref={textareaRef}
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={'Diseñar portada\nRevisar textos\nPublicar'}
            className="w-full bg-secondary border border-input rounded-xl px-3 py-2 text-xs text-foreground leading-relaxed focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring resize-y min-h-[120px]"
          />

          <div className="flex flex-col sm:flex-row gap-2 mt-3">
            <CustomSelect
              className="w-full sm:flex-1"
              value={statusId}
              onChange={setStatusId}
              options={statuses.map((s) => ({ value: s.id, label: s.name }))}
            />
            <CustomSelect
              className="w-full sm:flex-1"
              value={priority}
              onChange={(value) => setPriority(value as Task['priority'])}
              options={PRIORITY_OPTIONS}
            />
          </div>

          <div className="flex items-center gap-2 justify-end mt-4">
            <span className="text-[10px] text-muted-foreground mr-auto hidden sm:inline">Ctrl + Enter para crear</span>
            <button
              type="button"
              onClick={onClose}
              disabled={creating}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-secondary hover:bg-accent border border-border text-foreground transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={titles.length === 0 || creating}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-primary hover:opacity-90 text-primary-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Creando…' : titles.length === 0 ? 'Crear' : `Crear ${countLabel}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
