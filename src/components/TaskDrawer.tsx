/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { useUI } from '../lib/ui';
import { useProjectStore } from '../store';
import { Task, SystemUser } from '../types';
import { MarkdownPreview } from '../lib/markdown';
import MobileNotesDrawer from './MobileNotesDrawer';
import CustomSelect from './CustomSelect';
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
  ShieldAlert,
  Pencil,
  Check,
  Settings2
} from 'lucide-react';

type TaskDetailTab = 'details' | 'subtasks' | 'dependencies';

export default function TaskDrawer() {
  const { toast, confirm } = useUI();
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
    editComment,
    deleteComment,
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
  const [commentFiles, setCommentFiles] = useState<{ path: string; name: string; url: string; type: 'image' | 'video' }[]>([]);
  const [resolvedMedia, setResolvedMedia] = useState<Record<string, string>>({});
  const [previewMediaUrl, setPreviewMediaUrl] = useState<string | null>(null);
  const [previewMediaType, setPreviewMediaType] = useState<'image' | 'video'>('image');
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [detailTab, setDetailTab] = useState<TaskDetailTab>('details');
  const [activityTab, setActivityTab] = useState<'activity' | 'notes'>('notes');
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null);

  const heartbeatTimer = useRef<any>(null);
  const locksRef = useRef(locks);
  const descTextareaRef = useRef<HTMLTextAreaElement>(null);
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
    setDetailTab('details');
    setIsEditingDesc(false);
  }, [task?.id]);

  useEffect(() => {
    if (!selectedTaskId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (previewMediaUrl) {
        setPreviewMediaUrl(null);
        return;
      }
      setSelectedTask(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTaskId, previewMediaUrl, setSelectedTask]);

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
      cleanupCommentFiles();
    } catch (e) {
      toast('Error al publicar comentario', 'error');
    }
  };

  const cleanupCommentFiles = () => {
    commentFiles.forEach((file) => {
      try {
        URL.revokeObjectURL(file.url);
      } catch {
        // ignore
      }
    });
    setCommentFiles([]);
  };

  const removeCommentFile = (path: string) => {
    setCommentFiles((prev) => {
      const next = prev.filter((file) => file.path !== path);
      const removed = prev.find((file) => file.path === path);
      if (removed) {
        try {
          URL.revokeObjectURL(removed.url);
        } catch {
          // ignore
        }
      }
      return next;
    });
  };

  const addCommentFilesFromFile = async (file: File) => {
    const { path, name } = await uploadAttachment(file);
    const url = URL.createObjectURL(file);
    const type = file.type.startsWith('video/') ? 'video' : 'image';
    setCommentFiles((prev) => [...prev, { path, name, url, type }]);
  };

  const handleCommentAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    try {
      await Promise.all(files.map(addCommentFilesFromFile));
    } catch (err: any) {
      toast('No se pudo subir archivo: ' + err.message, 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleCommentPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardItems = Array.from(e.clipboardData.items || []);
    const imageItems = clipboardItems.filter((item) => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;

    e.preventDefault();

    try {
      const files = imageItems
        .map((item) => item.getAsFile())
        .filter((file): file is File => !!file);
      await Promise.all(files.map(addCommentFilesFromFile));
      commentTextareaRef.current?.focus();
    } catch (err: any) {
      toast('No se pudo pegar la imagen: ' + err.message, 'error');
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
    setIsEditingDesc(false);
  };

  const handleDescPreviewClick = () => {
    if (isLockedByOther) return;
    setIsEditingDesc(true);
    requestAnimationFrame(() => {
      descTextareaRef.current?.focus();
      descTextareaRef.current?.setSelectionRange(desc.length, desc.length);
    });
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
    const cleaned = newTag.trim();
    if (!task.tags.includes(cleaned)) updateTask({ ...task, tags: [...task.tags, cleaned] });
    setNewTag('');
  };

  const handleRemoveTag = (tagName: string) => {
    updateTask({ ...task, tags: task.tags.filter(t => t !== tagName) });
  };

  const closeDrawer = () => setSelectedTask(null);

  return (
    <div
      id="task-drawer-overlay"
      className="fixed inset-0 bg-foreground/20 backdrop-blur-[1px] z-40 flex justify-end font-body cursor-pointer"
      onClick={closeDrawer}
    >
      <div
        id="task-drawer-panel"
        className="w-full max-w-4xl bg-card border-l border-border h-full flex flex-col relative select-none shadow-card-hover animate-fade-in cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        
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
              <span className="text-[9px] bg-destructive/20 text-destructive border border-destructive/40 px-2 py-0.5 rounded-full font-mono flex items-center gap-1">
                ⚠️ BLOQUEADA POR {blockerTask.taskCode}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={async () => { const ok = await confirm({ title: 'Eliminar tarea', message: '¿Eliminar definitivamente este archivo JSON de tarea? Esta acción no se puede deshacer.', confirmLabel: 'Eliminar', variant: 'danger' }); if (ok) deleteTask(task.id); }} disabled={isLockedByOther} className="p-1.5 hover:bg-accent rounded-lg text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30 cursor-pointer" title="Eliminar tarea">
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={closeDrawer} className="p-1.5 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer" title="Cerrar detalles">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Dual Layout Main scroll body */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          
          {/* Column Left */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-16 md:pb-6 space-y-6 border-r border-border bg-card">
            
            {blockerTask && (
              <div className="p-3.5 bg-destructive/20 border border-destructive/40 rounded-xl text-destructive text-xs">
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
              {isEditingDesc && !isLockedByOther ? (
                <textarea
                  ref={descTextareaRef}
                  disabled={isLockedByOther}
                  className="w-full bg-card border border-input rounded-xl p-4 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors h-44 font-body leading-relaxed shadow-card resize-y"
                  placeholder="Ingresa los requerimientos, detalles o adjuntos en formato libre..."
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  onBlur={handleDescBlur}
                />
              ) : (
                <div
                  role="button"
                  tabIndex={isLockedByOther ? -1 : 0}
                  onClick={handleDescPreviewClick}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleDescPreviewClick();
                    }
                  }}
                  className={`w-full bg-card border border-input rounded-xl p-4 min-h-44 shadow-card overflow-y-auto ${
                    isLockedByOther ? 'cursor-default' : 'cursor-text hover:border-ring/60'
                  }`}
                >
                  <MarkdownPreview
                    content={desc}
                    emptyMessage="Ingresa los requerimientos, detalles o adjuntos en formato libre..."
                  />
                </div>
              )}
            </div>

            {/* Task detail tabs */}
            <div className="bg-secondary rounded-xl border border-border overflow-hidden">
              <div className="flex gap-4 px-4 text-xs font-semibold text-muted-foreground border-b border-border">
                {([
                  { id: 'details' as const, label: 'Detalles', icon: Settings2 },
                  { id: 'subtasks' as const, label: 'Subtareas', icon: CheckSquare },
                  { id: 'dependencies' as const, label: 'Dependencias', icon: Link },
                ]).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDetailTab(id)}
                    className={`py-3 flex items-center gap-1.5 cursor-pointer transition-colors border-b-2 -mb-px ${
                      detailTab === id ? 'border-primary text-foreground font-bold' : 'border-transparent hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              <div className="p-4">
                {detailTab === 'details' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Estado de Tarea</span>
                      <CustomSelect
                        disabled={isLockedByOther}
                        className="w-full"
                        value={task.statusId}
                        onChange={(value) => updateTask({ ...task, statusId: value })}
                        options={activeList.statuses.map(s => ({ value: s.id, label: s.name }))}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Prioridad</span>
                      <CustomSelect
                        disabled={isLockedByOther}
                        className="w-full"
                        value={task.priority}
                        onChange={(value) => updateTask({ ...task, priority: value as Task['priority'] })}
                        options={[
                          { value: 'low', label: 'Baja' },
                          { value: 'medium', label: 'Media' },
                          { value: 'high', label: 'Alta' },
                          { value: 'urgent', label: 'Urgente' },
                        ]}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Fecha Límite</span>
                      <input type="date" disabled={isLockedByOther} className="form-date w-full bg-card border border-input text-xs text-foreground py-2 pl-3 rounded-xl focus:outline-none focus:border-ring shadow-card" value={task.dueDate || ''} onChange={(e) => updateTask({ ...task, dueDate: e.target.value })} />
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Equipo Responsable</span>
                      <div className="max-h-28 overflow-y-auto space-y-1.5 bg-card p-2.5 rounded-xl border border-border shadow-card font-medium">
                        {users.map(u => {
                          const isAssigned = task.assignees.includes(u.id);
                          return (
                            <label key={u.id} className="flex items-center gap-2 cursor-pointer select-none group/u py-0.5">
                              <input type="checkbox" disabled={isLockedByOther} checked={isAssigned} onChange={() => handleToggleAssignee(u.id)} className="app-checkbox w-3.5 h-3.5 mr-1" />
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
                        <input type="text" disabled={isLockedByOther} className="bg-card border border-input rounded-lg px-2.5 py-1 text-[11px] text-foreground placeholder-muted-foreground focus:outline-none w-full shadow-card" placeholder="Escribir TAG..." value={newTag} onChange={(e) => setNewTag(e.target.value)} />
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
                )}

                {detailTab === 'subtasks' && (
                  <div className="space-y-3">
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
                            <input type="checkbox" disabled={isLockedByOther} checked={sub.isCompleted} onChange={() => toggleSubtask(task.id, sub.id)} className="app-checkbox w-3.5 h-3.5 mr-1" />
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
                )}

                {detailTab === 'dependencies' && (
                  <div className="space-y-3">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Relaciones de Dependencia (Bloqueos)</span>
                    <p className="text-[10px] text-muted-foreground leading-normal">Marca qué otras tareas deben completarse antes de comenzar esta.</p>
                    <div className="max-h-36 overflow-y-auto space-y-1.5 border border-border rounded-lg p-2.5 bg-card shadow-card font-medium">
                      {tasks.filter(t => t.id !== task.id).map(other => {
                        const isChecked = task.dependencies.includes(other.id);
                        return (
                          <label key={other.id} className="flex items-center justify-between p-1 hover:bg-accent rounded cursor-pointer select-none">
                            <span className="flex items-center gap-2 truncate">
                              <input type="checkbox" disabled={isLockedByOther} checked={isChecked} onChange={() => handleToggleDependency(other.id)} className="app-checkbox w-3.5 h-3.5 mr-1" />
                              <span className="font-mono text-[9px] font-bold text-muted-foreground">{other.taskCode}</span>
                              <span className="text-xs text-foreground truncate max-w-sm">{other.title}</span>
                            </span>
                          </label>
                        );
                      })}
                      {tasks.length <= 1 && <span className="text-[10px] text-muted-foreground block text-center py-2 italic font-mono">No hay otras tareas para enlazar.</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Column Right - Activity & Notes (desktop only) */}
          <div className="hidden md:flex w-96 shrink-0 overflow-hidden p-6 bg-secondary flex-col gap-3">

            {/* Tabs */}
            <div className="flex gap-4 text-xs font-semibold text-muted-foreground border-b border-border shrink-0">
              {([  
                { id: 'notes' as const, label: 'Notas' },
                { id: 'activity' as const, label: 'Actividad' },
              ]).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActivityTab(id)}
                  className={`py-2 transition-colors border-b-2 -mb-px cursor-pointer ${
                    activityTab === id ? 'border-primary text-foreground font-bold' : 'border-transparent hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Notes tab */}
            {activityTab === 'notes' && (
              <div className="flex-1 overflow-hidden flex flex-col gap-3">
                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {taskLogs.filter(l => !!l.comment).map(log => {
                    const logUser = users.find(u => u.id === log.userId);
                    const isOwnComment = log.userId === activeUser?.id;
                    const canDeleteComment = isOwnComment || activeUser?.isSuperAdmin;
                    const canEditComment = isOwnComment && !isLockedByOther;
                    const isEditing = editingLogId === log.id;
                    return (
                      <div key={log.id} className="text-left text-[11px] leading-relaxed border-b border-border pb-2 group/log">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold text-white uppercase shrink-0" style={{ backgroundColor: logUser?.avatarColor || '#64748b' }}>{log.username.charAt(0)}</span>
                          <strong className="text-foreground font-bold text-[10px] truncate max-w-[120px]">{log.username}</strong>
                          {(canEditComment || canDeleteComment) && (
                            <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/log:opacity-100 transition-opacity">
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
                          )}
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
                                          <video src={localUrl} controls className="max-w-full rounded h-28 mx-auto" />
                                        ) : (
                                          <img src={localUrl} alt="Attached" className="max-w-full rounded max-h-24 mx-auto cursor-pointer hover:opacity-80 transition-opacity" referrerPolicy="no-referrer" onClick={() => { setPreviewMediaUrl(localUrl); setPreviewMediaType('image'); }} />
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
                  {taskLogs.filter(l => !!l.comment).length === 0 && <span className="text-[10px] text-muted-foreground italic text-center block pt-4">Sin notas aún.</span>}
                </div>

                <form onSubmit={handleCommentSubmit} className="space-y-2 shrink-0 pt-2 border-t border-border">
                  <div className="flex gap-1">
                    <div className="w-full">
                      <textarea
                        ref={commentTextareaRef}
                        disabled={isLockedByOther}
                        className="w-full bg-card border border-input text-foreground placeholder-muted-foreground rounded-lg p-2.5 text-xs focus:outline-none focus:border-ring min-h-[6rem] resize-none leading-relaxed font-body shadow-card"
                        placeholder="Escribir una nota u opinión..."
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        onPaste={handleCommentPaste}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommentSubmit(e); } }}
                      />
                      {commentFiles.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {commentFiles.map(file => (
                            <div key={file.path} className="relative w-16 h-16 bg-background border border-border rounded-2xl overflow-hidden shadow-card">
                              {file.type === 'image' ? (
                                <img src={file.url} alt={file.name} className="object-cover w-full h-full" />
                              ) : (
                                <video src={file.url} className="object-cover w-full h-full" muted />
                              )}
                              <button
                                type="button"
                                onClick={() => removeCommentFile(file.path)}
                                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center text-[10px] hover:bg-black"
                                title="Eliminar imagen"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button type="submit" disabled={isLockedByOther || (!newComment.trim() && commentFiles.length === 0)} className="p-3 bg-primary hover:opacity-90 text-primary-foreground font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center shrink-0 disabled:opacity-40 shadow-card leading-none" title="Enviar nota">
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-muted-foreground font-semibold truncate max-w-full sm:max-w-[150px]">
                      {commentFiles.length > 0 ? `📎 ${commentFiles.length} archivo(s) listos` : 'Vacío'}
                    </span>
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 p-1 bg-card border border-border rounded-md shadow-card">
                        <Paperclip className="w-3.5 h-3.5" />
                        <span className="text-[10px]">Adjuntar</span>
                        <input type="file" accept="image/*,video/*" multiple onChange={handleCommentAttachment} className="hidden" />
                      </label>
                      {commentFiles.length > 0 && (
                        <button type="button" onClick={cleanupCommentFiles} className="text-[10px] text-destructive hover:text-destructive/90 transition-colors">
                          Borrar todo
                        </button>
                      )}
                    </div>
                  </div>
                </form>
              </div>
            )}

            {/* Activity tab */}
            {activityTab === 'activity' && (
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {taskLogs.filter(l => !l.comment).map(log => {
                  const logUser = users.find(u => u.id === log.userId);
                  const canDeleteActivity = activeUser?.isSuperAdmin;
                  return (
                    <div key={log.id} className="text-left text-[11px] leading-relaxed border-b border-border pb-2 group/activity">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold text-white uppercase shrink-0" style={{ backgroundColor: logUser?.avatarColor || '#64748b' }}>{log.username.charAt(0)}</span>
                        <strong className="text-foreground font-bold text-[10px] truncate max-w-[120px]">{log.username}</strong>
                        <span className="text-[10px]">{log.action}</span>
                        <span className="text-[8px] font-mono text-muted-foreground ml-auto shrink-0">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {canDeleteActivity && (
                          <button onClick={async () => { const ok = await confirm({ title: 'Eliminar actividad', message: '\u00bfEliminar este registro de actividad? Esta acci\u00f3n no se puede deshacer.', confirmLabel: 'Eliminar', variant: 'danger' }); if (ok) deleteComment(log.id); }} className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-colors cursor-pointer opacity-0 group-hover/activity:opacity-100" title="Eliminar actividad"><Trash2 className="w-3 h-3" /></button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {taskLogs.filter(l => !l.comment).length === 0 && <span className="text-[10px] text-muted-foreground italic text-center block pt-4">Sin actividad registrada.</span>}
              </div>
            )}
          </div>
        </div>

        {/* Mobile Bottom Sheet Drawer for Notes & Activity */}
        <MobileNotesDrawer
          activityTab={activityTab}
          setActivityTab={setActivityTab}
          taskLogs={taskLogs}
          users={users}
          activeUser={activeUser}
          isLockedByOther={isLockedByOther}
          editingLogId={editingLogId}
          setEditingLogId={setEditingLogId}
          editingText={editingText}
          setEditingText={setEditingText}
          editComment={editComment}
          deleteComment={deleteComment}
          confirm={confirm}
          resolvedMedia={resolvedMedia}
          setPreviewMediaUrl={setPreviewMediaUrl}
          setPreviewMediaType={setPreviewMediaType}
          newComment={newComment}
          setNewComment={setNewComment}
          commentFiles={commentFiles}
          removeCommentFile={removeCommentFile}
          cleanupCommentFiles={cleanupCommentFiles}
          handleCommentSubmit={handleCommentSubmit}
          handleCommentPaste={handleCommentPaste}
          handleCommentAttachment={handleCommentAttachment}
          commentTextareaRef={commentTextareaRef}
        />

        {/* Image Preview Modal */}
        {previewMediaUrl && (
          <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center p-8" onClick={() => setPreviewMediaUrl(null)}>
            <div className="relative max-w-3xl max-h-[80vh] bg-card border border-border rounded-2xl overflow-hidden shadow-card-hover" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-3 border-b border-border bg-secondary">
                <span className="text-xs font-mono text-muted-foreground">Vista previa</span>
                <button onClick={() => setPreviewMediaUrl(null)} className="p-1 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 flex items-center justify-center bg-secondary/50 max-h-[70vh] overflow-auto">
                {previewMediaType === 'video' ? (
                  <video src={previewMediaUrl} controls className="max-w-full max-h-[60vh] rounded-lg" />
                ) : (
                  <img src={previewMediaUrl} alt="Preview" className="max-w-full max-h-[60vh] rounded-lg object-contain" />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
