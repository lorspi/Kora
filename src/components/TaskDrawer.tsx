/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '../store';
import { Task, SystemUser } from '../types';
import { 
  X, 
  Trash2, 
  UserPlus, 
  Tags, 
  Paperclip, 
  Calendar, 
  AlertCircle, 
  FolderLock, 
  Play, 
  CheckSquare, 
  MessageSquare, 
  Send,
  Link,
  Plus,
  Compass,
  FileImage,
  Clock,
  Unlock,
  ShieldAlert
} from 'lucide-react';

export default function TaskDrawer() {
  const { 
    tasks, 
    selectedTaskId, 
    setSelectedTask, 
    lists, 
    users, 
    activeUser, 
    updateTask, 
    deleteTask, 
    addSubtask, 
    toggleSubtask, 
    deleteSubtask, 
    addComment, 
    uploadAttachment, 
    resolveAttachmentUrl,
    lockTask,
    unlockTask,
    locks,
    logs
  } = useProjectStore();

  const task = tasks.find(t => t.id === selectedTaskId);
  const activeList = lists.find(l => l?.id === task?.listId);

  const [isLockedByOther, setIsLockedByOther] = useState(false);
  const [lockingUser, setLockingUser] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [newSub, setNewSub] = useState('');
  const [newTag, setNewTag] = useState('');
  const [newComment, setNewComment] = useState('');
  const [commentFiles, setCommentFiles] = useState<{ path: string; name: string }[]>([]);
  const [resolvedMedia, setResolvedMedia] = useState<Record<string, string>>({});

  const heartbeatTimer = useRef<any>(null);
  const locksRef = useRef(locks);
  locksRef.current = locks;

  // Update locked-by-other status reactively when locks change
  useEffect(() => {
    if (!selectedTaskId || !activeUser) return;
    const activeLock = locks[selectedTaskId];
    const now = Date.now();
    if (activeLock && activeLock.userId !== activeUser.id && activeLock.expiresAt > now) {
      setIsLockedByOther(true);
      setLockingUser(activeLock.username);
    } else {
      setIsLockedByOther(false);
      setLockingUser(null);
    }
  }, [selectedTaskId, activeUser?.id, locks]);

  // Acquire lock and set up heartbeat interval (only re-runs when task/user changes)
  useEffect(() => {
    if (!selectedTaskId || !activeUser) return;
    const acquireLock = async () => {
      const activeLock = locksRef.current[selectedTaskId];
      const now = Date.now();
      if (!activeLock || activeLock.userId === activeUser.id || activeLock.expiresAt <= now) {
        await lockTask(selectedTaskId);
      }
    };
    acquireLock();
    heartbeatTimer.current = setInterval(acquireLock, 14000);
    return () => {
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      unlockTask(selectedTaskId);
    };
  }, [selectedTaskId, activeUser?.id]);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDesc(task.description || '');
  }, [task?.id]);

  useEffect(() => {
    if (!task) return;
    const taskLogs = logs.filter(l => l.taskId === task.id);
    taskLogs.forEach(log => {
      if (log.comment?.attachments) {
        log.comment.attachments.forEach(async (path) => {
          if (resolvedMedia[path]) return;
          const url = await resolveAttachmentUrl(path);
          if (url) setResolvedMedia(prev => ({ ...prev, [path]: url }));
        });
      }
    });
  }, [task?.id, logs]);

  if (!task || !activeList) return null;

  const taskLogs = logs.filter(l => l.taskId === task.id);

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() && commentFiles.length === 0) return;
    try {
      const filePaths = commentFiles.map(f => f.path);
      await addComment(task.id, newComment, filePaths);
      setNewComment('');
      setCommentFiles([]);
    } catch (e) {
      alert('Error al publicar comentario');
    }
  };

  const handleCommentAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { path, name } = await uploadAttachment(file);
      setCommentFiles(p => [...p, { path, name }]);
    } catch (err: any) {
      alert('No se pudo subir archivo: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  const getDependencyBlockerTask = () => {
    for (const depId of task.dependencies) {
      const depTask = tasks.find(t => t.id === depId);
      if (depTask) {
        const depList = lists.find(l => l.id === depTask.listId);
        const depStatus = depList?.statuses.find(s => s.id === depTask.statusId);
        if (depStatus && !depStatus.isCompleted) return depTask;
      }
    }
    return null;
  };

  const blockerTask = getDependencyBlockerTask();

  const handleTitleBlur = () => {
    if (title.trim() && title !== task.title) updateTask({ ...task, title: title.trim() });
  };

  const handleDescBlur = () => {
    if (desc !== task.description) updateTask({ ...task, description: desc });
  };

  const handleToggleAssignee = (userId: string) => {
    const assignees = task.assignees.includes(userId) ? task.assignees.filter(id => id !== userId) : [...task.assignees, userId];
    updateTask({ ...task, assignees });
  };

  const handleToggleDependency = (otherTaskId: string) => {
    const dependencies = task.dependencies.includes(otherTaskId) ? task.dependencies.filter(id => id !== otherTaskId) : [...task.dependencies, otherTaskId];
    updateTask({ ...task, dependencies });
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.trim()) return;
    const cleaned = newTag.trim().toUpperCase();
    if (!task.tags.includes(cleaned)) updateTask({ ...task, tags: [...task.tags, cleaned] });
    setNewTag('');
  };

  const handleRemoveTag = (tagName: string) => {
    updateTask({ ...task, tags: task.tags.filter(t => t !== tagName) });
  };

  return (
    <div id="task-drawer-overlay" className="fixed inset-0 bg-foreground/20 backdrop-blur-[1px] z-40 flex justify-end font-body">
      
      <div id="task-drawer-panel" className="w-full max-w-4xl bg-card border-l border-border h-full flex flex-col relative select-none shadow-card-hover animate-fade-in">
        
        {isLockedByOther && (
          <div className="bg-bento-yellow-light border-b border-border p-3 flex items-center gap-2.5 text-bento-yellow text-xs shrink-0 select-none">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <div className="flex-1 font-semibold">
              🔒 Tarea de solo lectura: @{lockingUser} está editando este archivo desde otra terminal ahora mismo.
            </div>
          </div>
        )}

        {/* Task Header ribbon */}
        <div className="p-4 border-b border-border flex items-center justify-between shrink-0 bg-card">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="text-[10px] bg-secondary border border-border font-bold font-mono text-muted-foreground px-2 py-1 rounded truncate">
              {activeList.name} &gt; {task.taskCode}
            </span>
            {blockerTask && (
              <span className="text-[9px] bg-destructive/10 text-destructive border border-destructive/20 px-2 py-0.5 rounded-full font-mono flex items-center gap-1">
                ⚠️ BLOQUEADA POR {blockerTask.taskCode}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => { if (confirm('¿Eliminar definitivamente este archivo JSON de tarea?')) deleteTask(task.id); }} disabled={isLockedByOther} className="p-1.5 hover:bg-accent rounded-lg text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30 cursor-pointer" title="Eliminar tarea">
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={() => setSelectedTask(null)} className="p-1.5 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer" title="Cerrar detalles">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Dual Layout Main scroll body */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          
          {/* Column Left */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 border-r border-border bg-card">
            
            {blockerTask && (
              <div className="p-3.5 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-xs">
                ⚠️ <strong>Esta tarea está bloqueada:</strong> No puedes avanzar libremente hasta completar <strong className="underline font-mono">{blockerTask.taskCode} ({blockerTask.title})</strong>.
              </div>
            )}

            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Nombre de la Tarea</span>
              <input 
                type="text" disabled={isLockedByOther}
                className="w-full bg-transparent border-0 text-lg font-bold text-foreground hover:bg-accent focus:bg-card px-2 py-1 rounded-lg focus:outline-none focus:ring-1 focus:ring-ring transition-colors font-heading"
                value={title} onChange={(e) => setTitle(e.target.value)} onBlur={handleTitleBlur}
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                <span>Descripción</span>
                <span className="text-[9px] font-mono">Soporta texto plano / Markdown</span>
              </div>
              <textarea 
                disabled={isLockedByOther}
                className="w-full bg-card border border-input rounded-xl p-4 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors h-44 font-body leading-relaxed shadow-card"
                placeholder="Ingresa los requerimientos, detalles o adjuntos en formato libre..."
                value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={handleDescBlur}
              />
            </div>

            {/* Configuration fields */}
            <div className="grid grid-cols-2 gap-4 bg-secondary p-4 rounded-xl border border-border">
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Estado de Tarea</span>
                <select disabled={isLockedByOther} className="w-full bg-card border border-input text-xs text-foreground py-2 rounded-xl focus:outline-none focus:border-ring px-3 cursor-pointer shadow-card font-semibold" value={task.statusId} onChange={(e) => updateTask({ ...task, statusId: e.target.value })}>
                  {activeList.statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Prioridad</span>
                <select disabled={isLockedByOther} className="w-full bg-card border border-input text-xs text-foreground py-2 rounded-xl focus:outline-none focus:border-ring px-3 cursor-pointer font-semibold shadow-card" value={task.priority} onChange={(e) => updateTask({ ...task, priority: e.target.value as Task['priority'] })}>
                  <option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option><option value="urgent">Urgente</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Fecha Límite</span>
                <input type="date" disabled={isLockedByOther} className="w-full bg-card border border-input text-xs text-foreground p-2 rounded-xl focus:outline-none focus:border-ring shadow-card" value={task.dueDate || ''} onChange={(e) => updateTask({ ...task, dueDate: e.target.value })} />
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Equipo Responsable</span>
                <div className="max-h-28 overflow-y-auto space-y-1.5 bg-card p-2.5 rounded-xl border border-border shadow-card font-medium">
                  {users.map(u => {
                    const isAssigned = task.assignees.includes(u.id);
                    return (
                      <label key={u.id} className="flex items-center gap-2 cursor-pointer select-none group/u py-0.5">
                        <input type="checkbox" disabled={isLockedByOther} checked={isAssigned} onChange={() => handleToggleAssignee(u.id)} className="rounded border-border accent-bento-blue w-3.5 h-3.5 mr-1" />
                        <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white uppercase shrink-0" style={{ backgroundColor: u.avatarColor }}>{u.name.charAt(0)}</span>
                        <span className="text-xs text-foreground group-hover/u:text-foreground truncate">{u.name}</span>
                      </label>
                    );
                  })}
                  {users.length === 0 && <span className="text-[10px] text-muted-foreground block text-center py-2">Registra miembros locales.</span>}
                </div>
              </div>

              <div className="space-y-2.5 col-span-2">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Etiquetas / Tags</span>
                <form onSubmit={handleAddTag} className="flex gap-1.5">
                  <input type="text" disabled={isLockedByOther} className="bg-card border border-input rounded-lg px-2.5 py-1 text-[11px] text-foreground placeholder-muted-foreground focus:outline-none w-full uppercase shadow-card" placeholder="Escribir TAG..." value={newTag} onChange={(e) => setNewTag(e.target.value)} />
                  <button type="submit" disabled={isLockedByOther || !newTag.trim()} className="p-1.5 bg-secondary hover:bg-accent rounded-lg text-muted-foreground transition-colors cursor-pointer disabled:opacity-40 shrink-0 border border-border">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </form>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {task.tags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 text-[9px] font-bold bg-bento-blue-light text-bento-blue border border-border px-2 py-0.5 rounded-md font-mono shadow-card">
                      #{tag}
                      <button type="button" disabled={isLockedByOther} onClick={() => handleRemoveTag(tag)} className="hover:text-destructive cursor-pointer disabled:pointer-events-none font-bold">×</button>
                    </span>
                  ))}
                  {task.tags.length === 0 && <span className="text-[10px] text-muted-foreground italic">Sin etiquetas.</span>}
                </div>
              </div>
            </div>

            {/* Subtasks box */}
            <div className="space-y-3 bg-secondary p-4 rounded-xl border border-border">
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Subtareas internas</span>
                <span className="text-[10px] text-muted-foreground font-mono font-semibold">
                  {task.subtasks.filter(s => s.isCompleted).length}/{task.subtasks.length} Completado
                </span>
              </div>
              <div className="flex gap-2">
                <input 
                  type="text" disabled={isLockedByOther} placeholder="+ Agregar subtarea..."
                  className="bg-card border border-input rounded-lg px-3 py-1.5 focus:outline-none focus:border-ring text-xs w-full text-foreground placeholder-muted-foreground shadow-card"
                  value={newSub} onChange={(e) => setNewSub(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newSub.trim()) { addSubtask(task.id, newSub); setNewSub(''); } } }}
                />
                <button type="button" disabled={isLockedByOther || !newSub.trim()} onClick={() => { addSubtask(task.id, newSub); setNewSub(''); }}
                  className="px-3 bg-primary hover:opacity-90 text-primary-foreground font-bold rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-40 shadow-card leading-none"
                >Agregar</button>
              </div>
              <div className="space-y-1.5 mt-2 font-medium">
                {task.subtasks.map(sub => (
                  <div key={sub.id} className="flex items-center justify-between gap-3 p-1.5 rounded bg-card border border-border hover:bg-accent transition-colors shadow-card">
                    <label className="flex items-center gap-2 cursor-pointer select-none flex-1">
                      <input type="checkbox" disabled={isLockedByOther} checked={sub.isCompleted} onChange={() => toggleSubtask(task.id, sub.id)} className="rounded border-border accent-bento-blue w-3.5 h-3.5 mr-1" />
                      <span className={`text-xs text-foreground truncate ${sub.isCompleted ? 'line-through text-muted-foreground' : ''}`}>{sub.title}</span>
                    </label>
                    <button type="button" disabled={isLockedByOther} onClick={() => deleteSubtask(task.id, sub.id)} className="text-muted-foreground hover:text-destructive p-0.5 rounded transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {task.subtasks.length === 0 && <span className="text-[10px] text-muted-foreground italic block text-center py-2">Sin subtareas agregadas.</span>}
              </div>
            </div>

            {/* Dependencies */}
            <div className="space-y-3 bg-secondary p-4 rounded-xl border border-border">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Relaciones de Dependencia (Bloqueos)</span>
              <p className="text-[10px] text-muted-foreground leading-normal">Marca qué otras tareas deben completarse antes de comenzar esta.</p>
              <div className="max-h-36 overflow-y-auto space-y-1.5 border border-border rounded-lg p-2.5 bg-card shadow-card font-medium">
                {tasks.filter(t => t.id !== task.id).map(other => {
                  const isChecked = task.dependencies.includes(other.id);
                  return (
                    <label key={other.id} className="flex items-center justify-between p-1 hover:bg-accent rounded cursor-pointer select-none">
                      <span className="flex items-center gap-2 truncate">
                        <input type="checkbox" disabled={isLockedByOther} checked={isChecked} onChange={() => handleToggleDependency(other.id)} className="rounded border-border text-bento-blue accent-bento-blue w-3.5 h-3.5 mr-1" />
                        <span className="font-mono text-[9px] font-bold text-muted-foreground">{other.taskCode}</span>
                        <span className="text-xs text-foreground truncate max-w-sm">{other.title}</span>
                      </span>
                    </label>
                  );
                })}
                {tasks.length <= 1 && <span className="text-[10px] text-muted-foreground block text-center py-2 italic font-mono">No hay otras tareas para enlazar.</span>}
              </div>
            </div>
          </div>

          {/* Column Right - Activity & Notes */}
          <div className="w-full md:w-96 shrink-0 overflow-y-auto p-6 bg-secondary flex flex-col gap-4">
            
            {/* Activity Comments */}
            <div className="space-y-3.5 flex-1 flex flex-col overflow-hidden">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Actividad & Notas</span>
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {taskLogs.map(log => {
                  const logUser = users.find(u => u.id === log.userId);
                  return (
                    <div key={log.id} className="text-left text-[11px] leading-relaxed border-b border-border pb-2">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold text-white uppercase shrink-0" style={{ backgroundColor: logUser?.avatarColor || '#64748b' }}>{log.username.charAt(0)}</span>
                        <strong className="text-foreground font-bold text-[10px] truncate max-w-[120px]">{log.username}</strong>
                        <span className="text-[10px]">{log.action}</span>
                      </div>
                      {log.comment && (
                        <div className="mt-1.5 p-2 bg-card border border-border rounded-lg text-foreground font-body break-words whitespace-pre-line leading-relaxed shadow-card">
                          {log.comment.text}
                          {log.comment.attachments && log.comment.attachments.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {log.comment.attachments.map(attPath => {
                                const localUrl = resolvedMedia[attPath] || '';
                                const isVideoFile = attPath.endsWith('.mp4') || attPath.endsWith('.mov') || attPath.includes('video');
                                return (
                                  <div key={attPath} className="rounded-lg overflow-hidden border border-border bg-secondary p-1 shadow-card">
                                    {isVideoFile ? (
                                      <video src={localUrl} controls className="max-w-full rounded h-28 mx-auto" />
                                    ) : (
                                      <img src={localUrl} alt="Attached" className="max-w-full rounded max-h-24 mx-auto" referrerPolicy="no-referrer" />
                                    )}
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
                {taskLogs.length === 0 && <span className="text-[10px] text-muted-foreground italic text-center block pt-4">Historial vacío.</span>}
              </div>

              <form onSubmit={handleCommentSubmit} className="space-y-2 shrink-0 pt-2 border-t border-border">
                <div className="flex gap-1">
                  <textarea disabled={isLockedByOther} className="w-full bg-card border border-input text-foreground placeholder-muted-foreground rounded-lg p-2.5 text-xs focus:outline-none focus:border-ring h-14 resize-none leading-relaxed font-body shadow-card" placeholder="Escribir una nota u opinión..." value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommentSubmit(e); } }} />
                  <button type="submit" disabled={isLockedByOther || (!newComment.trim() && commentFiles.length === 0)} className="p-3 bg-primary hover:opacity-90 text-primary-foreground font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center shrink-0 disabled:opacity-40 shadow-card leading-none" title="Enviar nota">
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-muted-foreground font-semibold truncate max-w-[150px]">
                    {commentFiles.length > 0 ? `📎 ${commentFiles.length} archivo(s) listos` : 'Vacío'}
                  </span>
                  <label className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors inline-block p-1 bg-card border border-border rounded-md shadow-card">
                    <Paperclip className="w-3.5 h-3.5" />
                    <input type="file" accept="image/*,video/*" onChange={handleCommentAttachment} className="hidden" />
                  </label>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
