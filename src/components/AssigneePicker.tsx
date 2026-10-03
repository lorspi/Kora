/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Inline assignee editor for the task list, Kanban and table views: the assignee
 * avatars plus a (+) button (shown on row hover, always on touch screens) that opens
 * a checklist of the team. Each toggle saves immediately.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Check, MagnifyingGlass } from '@phosphor-icons/react';
import { useProjectStore } from '../store';
import { useUI } from '../lib/ui';
import type { Task } from '../types';

const POPOVER_WIDTH = 224;
const POPOVER_MAX_HEIGHT = 280;
const POPOVER_GAP = 4;
/** Show a filter box once the team is big enough to need one. */
const SEARCH_THRESHOLD = 6;

interface AssigneePickerProps {
  task: Task;
  /** 'sm' for Kanban cards, 'md' for list rows and the table. */
  size?: 'sm' | 'md';
  /** e.g. while another user is editing the task. */
  disabled?: boolean;
  /** Text shown when nobody is assigned (the table shows "Libre"). */
  emptyLabel?: string;
}

export default function AssigneePicker({ task, size = 'md', disabled = false, emptyLabel }: AssigneePickerProps) {
  const users = useProjectStore((s) => s.users);
  const updateTask = useProjectStore((s) => s.updateTask);
  const { toast } = useUI();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Local selection so quick successive toggles don't read a not-yet-saved task.
  const [selected, setSelected] = useState<string[]>(task.assignees);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!open) setSelected(task.assignees);
  }, [open, task.assignees]);

  // Position next to the (+) button; open upwards when there's no room below.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8));
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < POPOVER_MAX_HEIGHT + POPOVER_GAP && rect.top > spaceBelow) {
      setPos({ bottom: window.innerHeight - rect.top + POPOVER_GAP, left });
    } else {
      setPos({ top: rect.bottom + POPOVER_GAP, left });
    }
  }, [open]);

  // Close on outside click, Escape, or when the page scrolls/resizes under it.
  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); setQuery(''); };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onScroll = (e: Event) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      close();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const visibleUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? users.filter((u) => u.name.toLowerCase().includes(q)) : users;
  }, [users, query]);

  const toggle = (userId: string) => {
    const next = selected.includes(userId) ? selected.filter((id) => id !== userId) : [...selected, userId];
    setSelected(next);
    // Saves run one after another so the last toggle always wins.
    saveQueue.current = saveQueue.current
      .then(async () => {
        const current = useProjectStore.getState().tasks.find((t) => t.id === task.id);
        if (current) await updateTask({ ...current, assignees: next });
      })
      .catch(() => toast('No se pudo actualizar los responsables', 'error'));
  };

  const shown = open ? selected : task.assignees;
  const avatarClass = size === 'sm'
    ? 'w-4 h-4 border text-[7px]'
    : 'w-5 h-5 border-2 text-[8px]';
  const plusClass = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';

  return (
    // Stop clicks here from opening the task (row/card click handlers).
    <div className="inline-flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
      <div className={`flex ${size === 'sm' ? '-space-x-1' : '-space-x-1.5'}`}>
        {shown.map((userId) => {
          const u = users.find((x) => x.id === userId);
          return u ? (
            <span
              key={userId}
              className={`${avatarClass} rounded-full border-card flex items-center justify-center font-bold text-white uppercase shrink-0`}
              style={{ backgroundColor: u.avatarColor }}
              data-tooltip={u.name}
            >
              {u.name.charAt(0)}
            </span>
          ) : null;
        })}
      </div>
      {shown.length === 0 && emptyLabel && (
        <span className="text-[10px] text-muted-foreground italic">{emptyLabel}</span>
      )}
      {!disabled && (
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          draggable={false}
          aria-label="Asignar responsables"
          aria-expanded={open}
          data-tooltip="Asignar responsables"
          className={`${plusClass} rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground hover:text-foreground hover:border-foreground hover:bg-accent flex items-center justify-center shrink-0 transition-opacity cursor-pointer focus-visible:opacity-100 pointer-coarse:opacity-100 ${
            open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <Plus className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
        </button>
      )}

      {open && pos && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Responsables"
          // Portal events still bubble through React ancestors (row/card clicks).
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: POPOVER_WIDTH, maxHeight: POPOVER_MAX_HEIGHT, zIndex: 9999 }}
          className="bg-card border border-border rounded-xl shadow-card-hover py-1.5 flex flex-col animate-fade-in font-body"
        >
          <div className="px-3 py-1.5 shrink-0">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Responsables</span>
          </div>
          {users.length > SEARCH_THRESHOLD && (
            <div className="px-2 pb-1.5 shrink-0">
              <div className="flex items-center gap-1.5 bg-secondary border border-input rounded-lg px-2">
                <MagnifyingGlass className="w-3 h-3 text-muted-foreground shrink-0" />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar…"
                  className="w-full bg-transparent py-1 text-xs text-foreground placeholder-muted-foreground focus:outline-none"
                />
              </div>
            </div>
          )}
          <div className="overflow-y-auto">
            {visibleUsers.map((u) => {
              const checked = selected.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={checked}
                  onClick={() => toggle(u.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-accent transition-colors cursor-pointer"
                >
                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    checked ? 'bg-primary border-primary text-primary-foreground' : 'border-border'
                  }`}>
                    {checked && <Check className="w-2.5 h-2.5" weight="bold" />}
                  </span>
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white uppercase shrink-0"
                    style={{ backgroundColor: u.avatarColor }}
                  >
                    {u.name.charAt(0)}
                  </span>
                  <span className="text-xs text-foreground truncate">{u.name}</span>
                </button>
              );
            })}
            {visibleUsers.length === 0 && (
              <p className="px-3 py-2 text-[10px] text-muted-foreground text-center">
                {users.length === 0 ? 'No hay miembros en el equipo.' : 'Sin resultados.'}
              </p>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
