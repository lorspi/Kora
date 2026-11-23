/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Right-hand column of a document with its comment threads: each one points to a
 * highlighted fragment of the text (see editor/commentHighlights), and can be
 * replied to, resolved, reopened, edited and deleted. Comments may mention people
 * of the project with "@".
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Check, ArrowCounterClockwise, Trash as Trash2, PencilSimple as Pencil, ChatCircleText,
  CaretDown, Warning, PaperPlaneRight as Send,
} from '@phosphor-icons/react';
import { useProjectStore } from '../store';
import { useUI } from '../lib/ui';
import { RichText, mentionedUserIds } from '../lib/richText';
import MentionTextarea from './MentionTextarea';
import type { DocCommentAnchor, DocCommentThread } from '../types';

interface Props {
  threads: DocCommentThread[];
  /** Position in the document of each highlighted thread (missing = its text is gone). */
  positions: Record<string, number>;
  /** Positions are known (the editor is showing the document). */
  positionsReady: boolean;
  activeId: string | null;
  onActivate: (id: string) => void;
  /** A new comment being written on the selected text. */
  draft: DocCommentAnchor | null;
  onSubmitDraft: (text: string) => Promise<void>;
  onCancelDraft: () => void;
  onClose: () => void;
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'ahora';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(ts).toLocaleDateString();
}

function Quote({ text, detached }: { text: string; detached?: boolean }) {
  return (
    <div className={`text-[11px] leading-snug italic border-l-2 pl-2 line-clamp-2 ${detached ? 'border-border text-muted-foreground line-through' : 'border-bento-yellow text-muted-foreground'}`}>
      {text}
    </div>
  );
}

function ThreadCard({
  thread,
  active,
  detached,
  onActivate,
}: {
  thread: DocCommentThread;
  active: boolean;
  detached: boolean;
  onActivate: () => void;
}) {
  const { users, docs, activeUser, replyDocComment, editDocComment, deleteDocComment, deleteDocCommentThread, setDocCommentResolved } = useProjectStore();
  const { toast, confirm } = useUI();
  const [reply, setReply] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ctx = { users, docs, activeUserId: activeUser?.id };
  const isSuperAdmin = !!activeUser?.isSuperAdmin;
  const canDeleteThread = thread.createdBy === activeUser?.id || isSuperAdmin;
  const resolved = !!thread.resolved;

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active]);

  const run = async (fn: () => Promise<void>, error: string) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      toast(error, 'error');
    } finally {
      setBusy(false);
    }
  };

  const sendReply = () => {
    if (!reply.trim()) return;
    run(async () => {
      await replyDocComment(thread.id, reply);
      setReply('');
    }, 'No se pudo enviar la respuesta');
  };

  return (
    <div
      ref={ref}
      onClick={onActivate}
      className={`rounded-xl border p-3 space-y-2.5 transition-colors cursor-default ${
        active ? 'border-bento-orange/60 bg-card shadow-card' : 'border-border bg-card/70 hover:bg-card'
      } ${resolved ? 'opacity-75' : ''}`}
      data-thread-id={thread.id}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <Quote text={thread.anchor.quote} detached={detached} />
          {detached && !resolved && (
            <p className="mt-1 text-[10px] text-muted-foreground flex items-center gap-1">
              <Warning className="w-3 h-3" /> El texto comentado ya no está en el documento.
            </p>
          )}
          {resolved && (
            <p className="mt-1 text-[10px] text-bento-green font-semibold">
              Resuelto por {thread.resolved!.userName} · {timeAgo(thread.resolved!.at)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); run(() => setDocCommentResolved(thread.id, !resolved), 'No se pudo actualizar el comentario'); }}
            disabled={busy}
            className={`p-1 rounded-lg hover:bg-accent transition-colors cursor-pointer ${resolved ? 'text-muted-foreground hover:text-foreground' : 'text-bento-green'}`}
            data-tooltip={resolved ? 'Reabrir' : 'Resolver'}
            aria-label={resolved ? 'Reabrir' : 'Resolver'}
          >
            {resolved ? <ArrowCounterClockwise className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" weight="bold" />}
          </button>
          {canDeleteThread && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                const ok = await confirm({ title: 'Eliminar comentario', message: 'Se eliminará el hilo con todas sus respuestas. Esta acción no se puede deshacer.', confirmLabel: 'Eliminar', variant: 'danger' });
                if (ok) run(() => deleteDocCommentThread(thread.id), 'No se pudo eliminar el comentario');
              }}
              disabled={busy}
              className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
              data-tooltip="Eliminar hilo"
              aria-label="Eliminar hilo"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2.5">
        {thread.comments.map((c) => {
          const author = users.find((u) => u.id === c.userId);
          const own = c.userId === activeUser?.id;
          const mentionsMe = !own && !!activeUser && mentionedUserIds(c.text, users).includes(activeUser.id);
          return (
            <div key={c.id} className="group/comment">
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white uppercase shrink-0" style={{ backgroundColor: author?.avatarColor || '#64748b' }}>
                  {(author?.name || c.userName).charAt(0)}
                </span>
                <span className="text-[11px] font-bold text-foreground truncate">{author?.name || c.userName}</span>
                <span className="text-[9px] text-muted-foreground shrink-0">{timeAgo(c.createdAt)}{c.editedAt ? ' · editado' : ''}</span>
                {mentionsMe && <span className="text-[9px] font-bold text-bento-orange bg-bento-yellow-light px-1 rounded shrink-0">Te mencionó</span>}
                {(own || isSuperAdmin) && editingId !== c.id && (
                  <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/comment:opacity-100 focus-within:opacity-100 transition-opacity">
                    {own && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingId(c.id); setEditText(c.text); }}
                        className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer"
                        data-tooltip="Editar"
                        aria-label="Editar"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const last = thread.comments.length === 1;
                        const ok = await confirm({
                          title: 'Eliminar comentario',
                          message: last ? 'Es el único comentario del hilo: se eliminará el hilo completo.' : '¿Eliminar este comentario?',
                          confirmLabel: 'Eliminar',
                          variant: 'danger',
                        });
                        if (ok) run(() => deleteDocComment(thread.id, c.id), 'No se pudo eliminar el comentario');
                      }}
                      className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-destructive cursor-pointer"
                      data-tooltip="Eliminar"
                      aria-label="Eliminar"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
              {editingId === c.id ? (
                <div className="mt-1.5 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                  <MentionTextarea
                    autoFocus
                    value={editText}
                    onValueChange={setEditText}
                    users={users}
                    rows={3}
                    className="w-full bg-secondary border border-input rounded-lg p-2 text-xs text-foreground focus:outline-none focus:border-ring resize-none font-body"
                    onKeyDown={(e) => { if (e.key === 'Escape') setEditingId(null); }}
                  />
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => setEditingId(null)} className="px-2 py-1 text-[11px] rounded-lg hover:bg-accent text-muted-foreground cursor-pointer">Cancelar</button>
                    <button
                      onClick={() => run(async () => { await editDocComment(thread.id, c.id, editText); setEditingId(null); }, 'No se pudo editar el comentario')}
                      disabled={!editText.trim() || busy}
                      className="px-2 py-1 text-[11px] rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-50 cursor-pointer"
                    >
                      Guardar
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-1 pl-6 text-xs text-foreground leading-relaxed whitespace-pre-wrap break-words">
                  <RichText text={c.text} ctx={ctx} />
                </p>
              )}
            </div>
          );
        })}
      </div>

      {!resolved && (
        <div className="flex items-end gap-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
          <MentionTextarea
            value={reply}
            onValueChange={setReply}
            users={users}
            rows={1}
            wrapperClassName="flex-1"
            placeholder="Responder… (@ para mencionar)"
            className="w-full bg-secondary border border-input rounded-lg px-2 py-1.5 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring resize-none font-body"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
          />
          <button
            onClick={sendReply}
            disabled={!reply.trim() || busy}
            className="p-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-40 cursor-pointer shrink-0"
            data-tooltip="Responder"
            aria-label="Responder"
          >
            <Send className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function DocCommentsPanel({
  threads, positions, positionsReady, activeId, onActivate, draft, onSubmitDraft, onCancelDraft, onClose,
}: Props) {
  const { users } = useProjectStore();
  const [draftText, setDraftText] = useState('');
  const [sending, setSending] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    if (!draft) setDraftText('');
  }, [draft]);

  // Open threads in the order of the text; detached ones after them.
  const { open, resolved } = useMemo(() => {
    const byPos = (a: DocCommentThread, b: DocCommentThread) => {
      const pa = positions[a.id];
      const pb = positions[b.id];
      if (pa === undefined && pb === undefined) return a.createdAt - b.createdAt;
      if (pa === undefined) return 1;
      if (pb === undefined) return -1;
      return pa - pb || a.createdAt - b.createdAt;
    };
    return {
      open: threads.filter((t) => !t.resolved).sort(byPos),
      resolved: threads.filter((t) => !!t.resolved).sort((a, b) => (b.resolved!.at - a.resolved!.at)),
    };
  }, [threads, positions]);

  // Show the resolved list if the active thread is in it.
  useEffect(() => {
    if (activeId && resolved.some((t) => t.id === activeId)) setShowResolved(true);
  }, [activeId, resolved]);

  const submit = async () => {
    if (!draftText.trim() || sending) return;
    setSending(true);
    try {
      await onSubmitDraft(draftText);
      setDraftText('');
    } finally {
      setSending(false);
    }
  };

  return (
    <aside
      aria-label="Comentarios"
      className="w-80 max-w-[85vw] shrink-0 h-full flex flex-col bg-secondary/60 border-l border-border absolute right-0 inset-y-0 z-20 shadow-card-hover @4xl:static @4xl:shadow-none"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <h2 className="text-xs font-bold text-foreground font-heading flex items-center gap-1.5">
          <ChatCircleText className="w-4 h-4 text-bento-orange" />
          Comentarios
          <span className="text-[10px] font-mono text-muted-foreground">{open.length}</span>
        </h2>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer" aria-label="Cerrar comentarios" data-tooltip="Cerrar comentarios">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {draft && (
          <div className="rounded-xl border border-bento-orange/60 bg-card p-3 space-y-2 shadow-card">
            <Quote text={draft.quote} />
            <MentionTextarea
              autoFocus
              value={draftText}
              onValueChange={setDraftText}
              users={users}
              rows={3}
              showHint
              placeholder="Escribe un comentario…"
              className="w-full bg-secondary border border-input rounded-lg p-2 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring resize-none font-body"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
                if (e.key === 'Escape') onCancelDraft();
              }}
            />
            <div className="flex justify-end gap-1.5">
              <button onClick={onCancelDraft} className="px-2.5 py-1 text-[11px] rounded-lg hover:bg-accent text-muted-foreground cursor-pointer">Cancelar</button>
              <button
                onClick={submit}
                disabled={!draftText.trim() || sending}
                className="px-2.5 py-1 text-[11px] rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-50 cursor-pointer"
              >
                Comentar
              </button>
            </div>
          </div>
        )}

        {open.map((t) => (
          <ThreadCard
            key={t.id}
            thread={t}
            active={t.id === activeId}
            detached={positionsReady && positions[t.id] === undefined}
            onActivate={() => onActivate(t.id)}
          />
        ))}

        {open.length === 0 && !draft && (
          <div className="text-center py-8 px-4 space-y-1.5">
            <ChatCircleText className="w-8 h-8 mx-auto text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">No hay comentarios abiertos.</p>
            <p className="text-[11px] text-muted-foreground">Selecciona un fragmento del texto y pulsa <strong>Comentar</strong>.</p>
          </div>
        )}

        {resolved.length > 0 && (
          <div className="pt-1">
            <button
              onClick={() => setShowResolved((v) => !v)}
              className="w-full flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground py-1 cursor-pointer"
              aria-expanded={showResolved}
            >
              <CaretDown className={`w-3 h-3 transition-transform ${showResolved ? '' : '-rotate-90'}`} />
              Resueltos ({resolved.length})
            </button>
            {showResolved && (
              <div className="space-y-3 mt-2">
                {resolved.map((t) => (
                  <ThreadCard key={t.id} thread={t} active={t.id === activeId} detached={false} onActivate={() => onActivate(t.id)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
