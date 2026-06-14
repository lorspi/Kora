/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback } from 'react';
import { SystemUser, TaskActivityLog } from '../types';
import {
  Send,
  Paperclip,
  Trash2,
  Check,
  X,
  Pencil,
  MessageSquare,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

type DrawerHeight = 'collapsed' | 'half' | 'full';

interface MobileNotesDrawerProps {
  activityTab: 'notes' | 'activity';
  setActivityTab: (tab: 'notes' | 'activity') => void;
  taskLogs: TaskActivityLog[];
  users: SystemUser[];
  activeUser: SystemUser | null;
  isLockedByOther: boolean;
  editingLogId: string | null;
  setEditingLogId: (id: string | null) => void;
  editingText: string;
  setEditingText: (text: string) => void;
  editComment: (logId: string, text: string) => Promise<void>;
  deleteComment: (logId: string) => Promise<void>;
  confirm: (opts: any) => Promise<boolean>;
  resolvedMedia: Record<string, string>;
  setPreviewMediaUrl: (url: string | null) => void;
  setPreviewMediaType: (type: 'image' | 'video') => void;
  newComment: string;
  setNewComment: (val: string) => void;
  commentFiles: { path: string; name: string; url: string; type: 'image' | 'video' }[];
  removeCommentFile: (path: string) => void;
  cleanupCommentFiles: () => void;
  handleCommentSubmit: (e: React.FormEvent) => void;
  handleCommentPaste: (e: React.ClipboardEvent) => void;
  handleCommentAttachment: (e: React.ChangeEvent<HTMLInputElement>) => void;
  commentTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export default function MobileNotesDrawer({
  activityTab,
  setActivityTab,
  taskLogs,
  users,
  activeUser,
  isLockedByOther,
  editingLogId,
  setEditingLogId,
  editingText,
  setEditingText,
  editComment,
  deleteComment,
  confirm,
  resolvedMedia,
  setPreviewMediaUrl,
  setPreviewMediaType,
  newComment,
  setNewComment,
  commentFiles,
  removeCommentFile,
  cleanupCommentFiles,
  handleCommentSubmit,
  handleCommentPaste,
  handleCommentAttachment,
  commentTextareaRef,
}: MobileNotesDrawerProps) {
  const [drawerHeight, setDrawerHeight] = useState<DrawerHeight>('collapsed');
  const drawerRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number>(0);
  const dragStartHeight = useRef<DrawerHeight>('collapsed');

  const heightClass = {
    collapsed: 'h-[3.5rem]',
    half: 'h-[50vh]',
    full: 'h-[85vh]',
  };

  const cycleHeight = () => {
    if (drawerHeight === 'collapsed') setDrawerHeight('half');
    else if (drawerHeight === 'half') setDrawerHeight('full');
    else setDrawerHeight('collapsed');
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    dragStartHeight.current = drawerHeight;
  }, [drawerHeight]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const deltaY = dragStartY.current - e.changedTouches[0].clientY;
    const threshold = 50;

    if (deltaY > threshold) {
      // Swiped up
      if (dragStartHeight.current === 'collapsed') setDrawerHeight('half');
      else if (dragStartHeight.current === 'half') setDrawerHeight('full');
    } else if (deltaY < -threshold) {
      // Swiped down
      if (dragStartHeight.current === 'full') setDrawerHeight('half');
      else if (dragStartHeight.current === 'half') setDrawerHeight('collapsed');
    }
  }, []);

  const notesCount = taskLogs.filter(l => !!l.comment).length;

  return (
    <div
      ref={drawerRef}
      className={`md:hidden fixed bottom-0 left-0 right-0 z-30 bg-secondary border-t border-border rounded-t-2xl shadow-card-hover transition-all duration-300 ease-in-out flex flex-col ${heightClass[drawerHeight]}`}
    >
      {/* Drag handle */}
      <div
        className="flex items-center justify-center py-2 cursor-grab select-none shrink-0"
        onClick={cycleHeight}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
      </div>

      {/* Header bar - always visible */}
      <div className="flex items-center justify-between px-4 pb-2 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { setActivityTab('notes'); if (drawerHeight === 'collapsed') setDrawerHeight('half'); }}
            className={`text-xs font-semibold transition-colors flex items-center gap-1 ${
              activityTab === 'notes' ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Notas {notesCount > 0 && <span className="text-[9px] bg-secondary border border-border rounded-full px-1.5">{notesCount}</span>}
          </button>
          <button
            type="button"
            onClick={() => { setActivityTab('activity'); if (drawerHeight === 'collapsed') setDrawerHeight('half'); }}
            className={`text-xs font-semibold transition-colors ${
              activityTab === 'activity' ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            Actividad
          </button>
        </div>
        <button
          type="button"
          onClick={cycleHeight}
          className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
        >
          {drawerHeight === 'collapsed' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Content - only visible when not collapsed */}
      {drawerHeight !== 'collapsed' && (
        <div className="flex-1 flex flex-col overflow-hidden px-4 pb-3">
          
          {activityTab === 'notes' && (
            <div className="flex-1 flex flex-col overflow-hidden gap-2">
              {/* Notes list */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {taskLogs.filter(l => !!l.comment).map(log => {
                  const logUser = users.find(u => u.id === log.userId);
                  const isOwnComment = log.userId === activeUser?.id;
                  const canDeleteComment = isOwnComment || activeUser?.isSuperAdmin;
                  const canEditComment = isOwnComment && !isLockedByOther;
                  const isEditing = editingLogId === log.id;
                  return (
                    <div key={log.id} className="text-left text-[11px] leading-relaxed border-b border-border pb-2">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold text-white uppercase shrink-0" style={{ backgroundColor: logUser?.avatarColor || '#64748b' }}>{log.username.charAt(0)}</span>
                        <strong className="text-foreground font-bold text-[10px] truncate max-w-[120px]">{log.username}</strong>
                        <div className="ml-auto flex items-center gap-0.5">
                          {isEditing ? (
                            <>
                              <button onClick={async () => { await editComment(log.id, editingText); setEditingLogId(null); setEditingText(''); }} className="p-0.5 rounded hover:bg-accent text-bento-green transition-colors cursor-pointer" title="Guardar"><Check className="w-3 h-3" /></button>
                              <button onClick={() => { setEditingLogId(null); setEditingText(''); }} className="p-0.5 rounded hover:bg-accent text-muted-foreground transition-colors cursor-pointer" title="Cancelar"><X className="w-3 h-3" /></button>
                            </>
                          ) : (
                            <>
                              {canEditComment && (
                                <button onClick={() => { setEditingLogId(log.id); setEditingText(log.comment?.text || ''); }} className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer" title="Editar"><Pencil className="w-3 h-3" /></button>
                              )}
                              {canDeleteComment && (
                                <button onClick={async () => { const ok = await confirm({ title: 'Eliminar nota', message: '\u00bfEliminar este comentario? Esta acci\u00f3n no se puede deshacer.', confirmLabel: 'Eliminar', variant: 'danger' }); if (ok) deleteComment(log.id); }} className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-colors cursor-pointer" title="Eliminar"><Trash2 className="w-3 h-3" /></button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      {log.comment && (
                        <div className="mt-1.5 p-2 bg-card border border-border rounded-lg text-foreground font-body break-words whitespace-pre-line leading-relaxed shadow-card">
                          {isEditing ? (
                            <textarea className="w-full bg-secondary border border-input rounded-lg p-2 text-xs text-foreground focus:outline-none focus:border-ring resize-none h-16 font-body" value={editingText} onChange={(e) => setEditingText(e.target.value)} autoFocus />
                          ) : (
                            log.comment.text && <span>{log.comment.text}</span>
                          )}
                          {log.comment.attachments && log.comment.attachments.length > 0 && (
                            <div className={`space-y-1.5 ${log.comment.text ? 'mt-2' : ''}`}>
                              {log.comment.attachments.map(attPath => {
                                const localUrl = resolvedMedia[attPath];
                                const isVideoFile = attPath.endsWith('.mp4') || attPath.endsWith('.mov') || attPath.includes('video');
                                return (
                                  <div key={attPath} className="rounded-lg overflow-hidden border border-border bg-secondary p-1 shadow-card">
                                    {localUrl ? (
                                      isVideoFile ? (
                                        <video src={localUrl} controls className="max-w-full rounded h-24 mx-auto" />
                                      ) : (
                                        <img src={localUrl} alt="Attached" className="max-w-full rounded max-h-20 mx-auto cursor-pointer hover:opacity-80 transition-opacity" referrerPolicy="no-referrer" onClick={() => { setPreviewMediaUrl(localUrl); setPreviewMediaType('image'); }} />
                                      )
                                    ) : null}
                                    <span className="text-[8px] font-mono block text-center text-muted-foreground py-0.5 truncate">{attPath.split('/').pop()}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                      <span className="text-[8px] font-mono text-muted-foreground block text-right mt-1">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  );
                })}
                {taskLogs.filter(l => !!l.comment).length === 0 && <span className="text-[10px] text-muted-foreground italic text-center block pt-4">Sin notas a\u00fan.</span>}
              </div>

              {/* Input area - always at bottom */}
              <form onSubmit={handleCommentSubmit} className="shrink-0 pt-2 border-t border-border space-y-2">
                <div className="flex gap-1">
                  <textarea
                    ref={commentTextareaRef}
                    disabled={isLockedByOther}
                    className="flex-1 bg-card border border-input text-foreground placeholder-muted-foreground rounded-lg p-2 text-xs focus:outline-none focus:border-ring min-h-[3rem] max-h-[5rem] resize-none leading-relaxed font-body shadow-card"
                    placeholder="Escribir una nota..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onPaste={handleCommentPaste}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommentSubmit(e); } }}
                    onFocus={() => { if (drawerHeight === 'collapsed') setDrawerHeight('half'); }}
                  />
                  <div className="flex flex-col gap-1 shrink-0">
                    <button type="submit" disabled={isLockedByOther || (!newComment.trim() && commentFiles.length === 0)} className="p-2 bg-primary hover:opacity-90 text-primary-foreground font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center disabled:opacity-40 shadow-card leading-none" title="Enviar nota">
                      <Send className="w-3.5 h-3.5" />
                    </button>
                    <label className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors p-2 bg-card border border-border rounded-lg shadow-card flex items-center justify-center">
                      <Paperclip className="w-3.5 h-3.5" />
                      <input type="file" accept="image/*,video/*" multiple onChange={handleCommentAttachment} className="hidden" />
                    </label>
                  </div>
                </div>
                {commentFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {commentFiles.map(file => (
                      <div key={file.path} className="relative w-12 h-12 bg-background border border-border rounded-xl overflow-hidden shadow-card">
                        {file.type === 'image' ? (
                          <img src={file.url} alt={file.name} className="object-cover w-full h-full" />
                        ) : (
                          <video src={file.url} className="object-cover w-full h-full" muted />
                        )}
                        <button
                          type="button"
                          onClick={() => removeCommentFile(file.path)}
                          className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center text-[8px] hover:bg-black"
                        >
                          \u00d7
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={cleanupCommentFiles} className="text-[9px] text-destructive hover:text-destructive/90 transition-colors self-center">
                      Borrar
                    </button>
                  </div>
                )}
              </form>
            </div>
          )}

          {activityTab === 'activity' && (
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {taskLogs.filter(l => !l.comment).map(log => {
                const logUser = users.find(u => u.id === log.userId);
                const canDeleteActivity = activeUser?.isSuperAdmin;
                return (
                  <div key={log.id} className="text-left text-[11px] leading-relaxed border-b border-border pb-2">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold text-white uppercase shrink-0" style={{ backgroundColor: logUser?.avatarColor || '#64748b' }}>{log.username.charAt(0)}</span>
                      <strong className="text-foreground font-bold text-[10px] truncate max-w-[120px]">{log.username}</strong>
                      <span className="text-[10px]">{log.action}</span>
                      <span className="text-[8px] font-mono text-muted-foreground ml-auto shrink-0">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {canDeleteActivity && (
                        <button onClick={async () => { const ok = await confirm({ title: 'Eliminar actividad', message: '\u00bfEliminar este registro? Esta acci\u00f3n no se puede deshacer.', confirmLabel: 'Eliminar', variant: 'danger' }); if (ok) deleteComment(log.id); }} className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-colors cursor-pointer" title="Eliminar"><Trash2 className="w-3 h-3" /></button>
                      )}
                    </div>
                  </div>
                );
              })}
              {taskLogs.filter(l => !l.comment).length === 0 && <span className="text-[10px] text-muted-foreground italic text-center block pt-4">Sin actividad registrada.</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
