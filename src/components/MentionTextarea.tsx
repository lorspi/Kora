/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Textarea with suggestions: "@" mentions a user of the project and "[[" links a
 * document (see lib/richText for how both are stored). Used by task notes and
 * descriptions and by document comments. Behaves like a plain <textarea> otherwise
 * (same props, forwarded ref), so it drops into the existing forms.
 */
import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { FileText } from '@phosphor-icons/react';
import type { DocMetadata, SystemUser } from '../types';
import { docRefMarkdown } from '../lib/richText';
import { splitLeadingEmoji } from '../lib/emoji';

type Suggestion =
  | { kind: 'user'; key: string; user: SystemUser }
  | { kind: 'doc'; key: string; doc: DocMetadata };

interface Trigger {
  kind: 'user' | 'doc';
  /** Where the trigger ("@" or "[[") starts in the text. */
  start: number;
  query: string;
}

type Props = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Users that can be mentioned with "@" (omit to disable mentions). */
  users?: SystemUser[];
  /** Documents that can be linked with "[[" (omit to disable references). */
  docs?: DocMetadata[];
  /** Show the "@ / [[" hint under the textarea. */
  showHint?: boolean;
  /** Classes of the wrapper (the textarea keeps `className`). */
  wrapperClassName?: string;
  /** Open the suggestions above the textarea (for boxes at the bottom of a panel). */
  suggestionsAbove?: boolean;
};

const MAX_SUGGESTIONS = 6;

function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function findTrigger(text: string, caret: number, allowUsers: boolean, allowDocs: boolean): Trigger | null {
  const before = text.slice(0, caret);
  if (allowDocs) {
    const m = /\[\[([^\]\n]{0,60})$/.exec(before);
    if (m) return { kind: 'doc', start: caret - m[0].length, query: m[1] };
  }
  if (allowUsers) {
    // "@" at the start or after a space/punctuation, followed by up to 30 chars
    // without line breaks (usernames may contain spaces).
    const m = /(^|[\s(¡¿"'])@([^\n@]{0,30})$/.exec(before);
    if (m) return { kind: 'user', start: caret - m[2].length - 1, query: m[2] };
  }
  return null;
}

const MentionTextarea = forwardRef<HTMLTextAreaElement, Props>(function MentionTextarea(
  { value, onValueChange, users, docs, showHint = false, wrapperClassName = '', suggestionsAbove = false, onKeyDown, onBlur, onSelect, ...rest },
  ref
) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [selected, setSelected] = useState(0);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!trigger) return [];
    const q = normalize(trigger.query.trim());
    if (trigger.kind === 'user') {
      return (users || [])
        .filter((u) => !q || normalize(u.username).startsWith(q) || normalize(u.name).split(/\s+/).some((w) => w.startsWith(q)) || normalize(u.name).startsWith(q))
        .slice(0, MAX_SUGGESTIONS)
        .map((user) => ({ kind: 'user' as const, key: user.id, user }));
    }
    return (docs || [])
      .filter((d) => !q || normalize(d.title).includes(q) || normalize(d.filename).includes(q))
      .sort((a, b) => (b.editedAt ?? b.createdAt) - (a.editedAt ?? a.createdAt))
      .slice(0, MAX_SUGGESTIONS)
      .map((doc) => ({ kind: 'doc' as const, key: doc.id, doc }));
  }, [trigger, users, docs]);

  const open = !!trigger && suggestions.length > 0;

  const refresh = (el: HTMLTextAreaElement) => {
    const t = findTrigger(el.value, el.selectionStart ?? el.value.length, !!users?.length, !!docs?.length);
    setTrigger((prev) => {
      if (!t) return null;
      if (!prev || prev.kind !== t.kind || prev.start !== t.start) setSelected(0);
      return t;
    });
  };

  const apply = (s: Suggestion) => {
    const el = innerRef.current;
    if (!el || !trigger) return;
    const caret = el.selectionStart ?? value.length;
    const insert = s.kind === 'user' ? `@${s.user.username} ` : `${docRefMarkdown(s.doc)} `;
    const next = value.slice(0, trigger.start) + insert + value.slice(caret);
    onValueChange(next);
    setTrigger(null);
    const pos = trigger.start + insert.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        apply(suggestions[Math.min(selected, suggestions.length - 1)]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setTrigger(null);
        return;
      }
    }
    onKeyDown?.(e);
  };

  const hint = [users?.length ? '@ para mencionar' : null, docs?.length ? '[[ para enlazar un documento' : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={`relative ${wrapperClassName}`}>
      <textarea
        {...rest}
        ref={innerRef}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          refresh(e.target);
        }}
        onKeyDown={handleKeyDown}
        onSelect={(e) => {
          refresh(e.currentTarget);
          onSelect?.(e);
        }}
        onBlur={(e) => {
          // Let a click on a suggestion land first.
          setTimeout(() => setTrigger(null), 150);
          onBlur?.(e);
        }}
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {showHint && hint && <span className="block mt-1 text-[9px] text-muted-foreground select-none">{hint}</span>}
      {open && (
        <div
          role="listbox"
          className={`absolute left-0 z-50 w-full max-w-xs bg-card border border-border rounded-xl shadow-card-hover py-1 animate-fade-in ${
            suggestionsAbove ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          <div className="px-3 py-1 text-[9px] uppercase font-bold tracking-wider text-muted-foreground">
            {trigger!.kind === 'user' ? 'Mencionar' : 'Enlazar documento'}
          </div>
          {suggestions.map((s, i) => (
            <button
              key={s.key}
              type="button"
              role="option"
              aria-selected={i === selected}
              onMouseDown={(e) => {
                e.preventDefault();
                apply(s);
              }}
              onMouseEnter={() => setSelected(i)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs cursor-pointer ${
                i === selected ? 'bg-accent text-foreground' : 'text-muted-foreground'
              }`}
            >
              {s.kind === 'user' ? (
                <>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white uppercase shrink-0" style={{ backgroundColor: s.user.avatarColor }}>
                    {s.user.name.charAt(0)}
                  </span>
                  <span className="truncate font-semibold text-foreground">{s.user.name}</span>
                  <span className="truncate text-[10px] font-mono">@{s.user.username}</span>
                </>
              ) : (
                (() => {
                  const { icon, label } = splitLeadingEmoji(s.doc.title || 'Sin título');
                  return (
                    <>
                      {icon ? <span className="w-4 text-center shrink-0">{icon}</span> : <FileText className="w-4 h-4 shrink-0 text-bento-orange" />}
                      <span className="truncate font-semibold text-foreground">{label}</span>
                      {s.doc.folder && <span className="truncate text-[10px]">{s.doc.folder}</span>}
                    </>
                  );
                })()
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export default MentionTextarea;
