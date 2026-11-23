/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Mentions (@usuario) and document references in short texts: task notes, task
 * descriptions and document comments.
 *
 * On disk they stay plain, readable text:
 *   - A mention is "@" followed by a username of the project (usernames may hold
 *     spaces, so they are matched against the actual users, longest first).
 *   - A document reference is a regular Markdown link to the document's route:
 *     [Título](#/documentos/{docId}). Any Markdown viewer shows it as a link, and in
 *     Kora it opens the document (see lib/router).
 */
import React from 'react';
import type { DocMetadata, SystemUser } from '../types';
import { splitLeadingEmoji } from './emoji';

/** Chip text of a document: its own leading emoji as icon, or a page icon. */
function docChipText(title: string): string {
  const { icon, label } = splitLeadingEmoji(title || 'Documento');
  return `${icon || '📄'} ${label}`;
}

export interface RichTextContext {
  users: SystemUser[];
  docs: DocMetadata[];
  activeUserId?: string | null;
}

/** Route link of a document reference. */
export function docRefMarkdown(doc: Pick<DocMetadata, 'id' | 'title'>): string {
  const title = (doc.title || 'Documento').replace(/[[\]\n]/g, ' ').trim() || 'Documento';
  return `[${title}](#/documentos/${doc.id})`;
}

const DOC_REF_RE = /\[([^\]\n]*)\]\(#\/documentos\/([A-Za-z0-9_-]+)\)/g;

export type RichToken =
  | { kind: 'text'; text: string }
  | { kind: 'doc'; docId: string; label: string; doc?: DocMetadata }
  | { kind: 'mention'; user: SystemUser; text: string };

function isWordChar(ch: string | undefined): boolean {
  return !!ch && /[\p{L}\p{N}_]/u.test(ch);
}

/** Split plain text into text and mention tokens. */
function tokenizeMentions(text: string, users: SystemUser[]): RichToken[] {
  if (!text.includes('@') || users.length === 0) return text ? [{ kind: 'text', text }] : [];
  const byLength = [...users].filter((u) => u.username).sort((a, b) => b.username.length - a.username.length);
  const out: RichToken[] = [];
  let buf = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '@' && !isWordChar(text[i - 1])) {
      const rest = text.slice(i + 1).toLowerCase();
      const user = byLength.find((u) => rest.startsWith(u.username) && !isWordChar(rest[u.username.length]));
      if (user) {
        if (buf) out.push({ kind: 'text', text: buf });
        buf = '';
        out.push({ kind: 'mention', user, text: text.slice(i, i + 1 + user.username.length) });
        i += 1 + user.username.length;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  if (buf) out.push({ kind: 'text', text: buf });
  return out;
}

/** Split a text into plain text, document references and mentions. */
export function tokenizeRichText(text: string, ctx: Pick<RichTextContext, 'users' | 'docs'>): RichToken[] {
  const out: RichToken[] = [];
  let last = 0;
  for (const m of text.matchAll(DOC_REF_RE)) {
    const start = m.index ?? 0;
    if (start > last) out.push(...tokenizeMentions(text.slice(last, start), ctx.users));
    out.push({ kind: 'doc', docId: m[2], label: m[1], doc: ctx.docs.find((d) => d.id === m[2]) });
    last = start + m[0].length;
  }
  if (last < text.length) out.push(...tokenizeMentions(text.slice(last), ctx.users));
  return out;
}

/** Users mentioned in a text. */
export function mentionedUserIds(text: string, users: SystemUser[]): string[] {
  const ids = new Set<string>();
  tokenizeMentions(text, users).forEach((t) => {
    if (t.kind === 'mention') ids.add(t.user.id);
  });
  return [...ids];
}

const docChipClass =
  'kora-doc-ref inline-flex items-center gap-1 align-baseline px-1.5 py-px rounded-md border text-[0.95em] font-semibold no-underline cursor-pointer';

/** Chip for a mention; stronger when it mentions the person reading. */
export function MentionChip({ user, isMe }: { user: SystemUser; isMe: boolean }) {
  return (
    <span
      className={`kora-mention inline-flex items-center px-1 rounded font-semibold ${
        isMe ? 'bg-bento-yellow-light text-bento-orange' : 'bg-bento-blue-light text-bento-blue'
      }`}
      data-tooltip={isMe ? 'Te mencionaron' : `@${user.username}`}
    >
      @{user.name}
    </span>
  );
}

/**
 * Render a note or comment with its mentions and document references. Line breaks
 * are kept (the container should use whitespace-pre-line or pre-wrap).
 */
export function RichText({
  text,
  ctx,
  onOpenDoc,
}: {
  text: string;
  ctx: RichTextContext;
  onOpenDoc?: (docId: string) => void;
}) {
  const tokens = tokenizeRichText(text, ctx);
  return (
    <>
      {tokens.map((t, i) => {
        if (t.kind === 'text') return <React.Fragment key={i}>{t.text}</React.Fragment>;
        if (t.kind === 'mention') return <MentionChip key={i} user={t.user} isMe={t.user.id === ctx.activeUserId} />;
        if (!t.doc) {
          return (
            <span key={i} className={`${docChipClass} border-border bg-secondary text-muted-foreground line-through cursor-default`} data-tooltip="El documento ya no existe">
              {docChipText(t.label)}
            </span>
          );
        }
        return (
          <a
            key={i}
            href={`#/documentos/${t.docId}`}
            onClick={(e) => {
              if (!onOpenDoc) return;
              e.preventDefault();
              e.stopPropagation();
              onOpenDoc(t.docId);
            }}
            className={`${docChipClass} border-bento-blue/30 bg-bento-blue-light text-bento-blue hover:border-bento-blue`}
            data-tooltip="Abrir documento"
          >
            {docChipText(t.doc.title || t.label)}
          </a>
        );
      })}
    </>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * HTML for the references and mentions of a Markdown text rendered as HTML (task
 * descriptions, see lib/markdown). Runs on the raw Markdown before the rest of the
 * conversion; the emitted tags don't contain Markdown syntax.
 */
export function richTextToHtml(markdown: string, ctx: RichTextContext): string {
  return tokenizeRichText(markdown, ctx)
    .map((t) => {
      if (t.kind === 'text') return t.text;
      if (t.kind === 'mention') {
        const me = t.user.id === ctx.activeUserId;
        return `<span class="kora-mention inline-flex items-center px-1 rounded font-semibold ${me ? 'bg-bento-yellow-light text-bento-orange' : 'bg-bento-blue-light text-bento-blue'}">@${escapeHtml(t.user.name)}</span>`;
      }
      if (!t.doc) {
        return `<span class="${docChipClass} border-border bg-secondary text-muted-foreground line-through cursor-default">${escapeHtml(docChipText(t.label))}</span>`;
      }
      return `<a href="#/documentos/${escapeHtml(t.docId)}" data-doc-ref="${escapeHtml(t.docId)}" class="${docChipClass} border-bento-blue/30 bg-bento-blue-light text-bento-blue hover:border-bento-blue">${escapeHtml(docChipText(t.doc.title || t.label))}</a>`;
    })
    .join('');
}

/**
 * Open a document from a task while keeping that task open in the side panel: the
 * document takes the main area and the task stays on the right (see lib/router).
 */
export function openDocKeepingTask(docId: string, taskCode?: string | null) {
  window.location.hash = `#/documentos/${encodeURIComponent(docId)}${taskCode ? `?tarea=${encodeURIComponent(taskCode)}` : ''}`;
}
