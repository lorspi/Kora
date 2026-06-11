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

  // Lock status state
  const [isLockedByOther, setIsLockedByOther] = useState(false);
  const [lockingUser, setLockingUser] = useState<string | null>(null);

  // Local inputs
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [newSub, setNewSub] = useState('');
  const [newTag, setNewTag] = useState('');
  const [newComment, setNewComment] = useState('');
  const [commentFiles, setCommentFiles] = useState<{ path: string; name: string }[]>([]);

  // Local media blob url cache
  const [resolvedMedia, setResolvedMedia] = useState<Record<string, string>>({});

  // Heartbeat timer referencer
  const heartbeatTimer = useRef<any>(null);

  // Monitor locks and refresh local state
  useEffect(() => {
    if (!selectedTaskId || !activeUser) return;

    const checkAndAcquireLock = async () => {
      const activeLock = locks[selectedTaskId];
      const now = Date.now();

      if (activeLock && activeLock.userId !== activeUser.id && activeLock.expiresAt > now) {
        setIsLockedByOther(true);
        setLockingUser(activeLock.username);
      } else {
        setIsLockedByOther(false);
        setLockingUser(null);
        // We are able to lock it! Write lock
        await lockTask(selectedTaskId);
      }
    };

    checkAndAcquireLock();

    // Setup periodic locking heatbeat check
    heartbeatTimer.current = setInterval(() => {
      checkAndAcquireLock();
    }, 4500);

    return () => {
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      // Unlock task on exit
      unlockTask(selectedTaskId);
    };

  }, [selectedTaskId, activeUser?.id, locks]);

  // Load Task Properties locally
  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDesc(task.description || '');
  }, [task?.id]);

  // Scan and pre-resolve local comments & activity media
  useEffect(() => {
    if (!task) return;
    const taskLogs = logs.filter(l => l.taskId === task.id);
    
    taskLogs.forEach(log => {
      if (log.comment?.attachments) {
        log.comment.attachments.forEach(async (path) => {
          if (resolvedMedia[path]) return;
          const url = await resolveAttachmentUrl(path);
          if (url) {
            setResolvedMedia(prev => ({ ...prev, [path]: url }));
          }
        });
      }
    });
  }, [task?.id, logs]);

  if (!task || !activeList) return null;

  // Filter logs only belonging to this task
  const taskLogs = logs.filter(l => l.taskId === task.id);

  // Submit comment
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

  // Drag and drop attachment uploading helper
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

  // Helper to know if a dependency task is blocking our execution
  const getDependencyBlockerTask = () => {
    for (const depId of task.dependencies) {
      const depTask = tasks.find(t => t.id === depId);
      if (depTask) {
        // Find if depTask status is NOT completed
        const depList = lists.find(l => l.id === depTask.listId);
        const depStatus = depList?.statuses.find(s => s.id === depTask.statusId);
        if (depStatus && !depStatus.isCompleted) {
          return depTask;
        }
      }
    }
    return null;
  };

  const blockerTask = getDependencyBlockerTask();

  const handleTitleBlur = () => {
    if (title.trim() && title !== task.title) {
      updateTask({ ...task, title: title.trim() });
    }
  };

  const handleDescBlur = () => {
    if (desc !== task.description) {
      updateTask({ ...task, description: desc });
    }
  };

  // Toggle custom assignee user
  const handleToggleAssignee = (userId: string) => {
    const assignees = task.assignees.includes(userId)
      ? task.assignees.filter(id => id !== userId)
      : [...task.assignees, userId];
    updateTask({ ...task, assignees });
  };

  // Toggle dependency task attachment
  const handleToggleDependency = (otherTaskId: string) => {
    const dependencies = task.dependencies.includes(otherTaskId)
      ? task.dependencies.filter(id => id !== otherTaskId)
      : [...task.dependencies, otherTaskId];
    updateTask({ ...task, dependencies });
  };

  // Add tag to list
  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.trim()) return;
    const cleaned = newTag.trim().toUpperCase();
    if (!task.tags.includes(cleaned)) {
      updateTask({ ...task, tags: [...task.tags, cleaned] });
    }
    setNewTag('');
  };

  const handleRemoveTag = (tagName: string) => {
    updateTask({ ...task, tags: task.tags.filter(t => t !== tagName) });
  };

  return (
    <div id="task-drawer-overlay" className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] z-40 flex justify-end font-sans">
      
      {/* Drawer content sliding from the right side */}
      <div 
        id="task-drawer-panel"
        className="w-full max-w-4xl bg-white border-l border-slate-200 h-full flex flex-col relative select-none shadow-2xl"
      >
        
        {/* Banner Alert if Locked by another user physically on drive */}
        {isLockedByOther && (
          <div className="bg-amber-50 border-b border-amber-200 p-3 flex items-center gap-2.5 text-amber-800 text-xs shrink-0 select-none border-amber-100">
            <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0" />
            <div className="flex-1 font-semibold">
              🔒 Tarea de solo lectura: @{lockingUser} está editando este archivo desde otra terminal ahora mismo. Tus modificaciones se encuentran bloqueadas temporalmente para evitar corrupción.
            </div>
          </div>
        )}

        {/* Task Header ribbon */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white shadow-xs">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="text-[10px] bg-slate-50 border border-slate-200 font-bold font-mono text-slate-500 px-2 py-1 rounded truncate">
              {activeList.name} &gt; {task.taskCode}
            </span>
            {blockerTask && (
              <span className="text-[9px] bg-red-50 text-red-655 border border-red-105 px-2 py-0.5 rounded-full font-mono flex items-center gap-1">
                ⚠️ BLOQUEADA POR {blockerTask.taskCode}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (confirm('¿Eliminar definitivamente este archivo JSON de tarea?')) {
                  deleteTask(task.id);
                }
              }}
              disabled={isLockedByOther}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-red-650 transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              title="Eliminar tarea física"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setSelectedTask(null)}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              title="Cerrar detalles"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Dual Layout Main scroll body */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          
          {/* Column Left (Main inputs: Title, desc, subtaks, dependencies) */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 border-r border-slate-200 bg-white">
            
            {/* Blocker details alert */}
            {blockerTask && (
              <div className="p-3.5 bg-red-50 border border-red-100 rounded-xl text-red-700 text-xs">
                ⚠️ <strong>Esta tarea está bloqueada:</strong> No puedes avanzar libremente hasta completar la tarea dependiente <strong className="underline font-mono text-xs text-red-700">{blockerTask.taskCode} ({blockerTask.title})</strong>.
              </div>
            )}

            {/* Title field */}
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-450 tracking-wider">Nombre de la Tarea</span>
              <input 
                type="text"
                disabled={isLockedByOther}
                className="w-full bg-transparent border-0 text-lg font-bold text-slate-800 hover:bg-slate-50 focus:bg-white px-2 py-1 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors border-b border-transparent focus:border-indigo-500"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleBlur}
              />
            </div>

            {/* Description field */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-450 tracking-wider">
                <span>Descripción</span>
                <span className="text-[9px] text-slate-400 font-mono">Soporta texto plano / Markdown</span>
              </div>
              <textarea 
                disabled={isLockedByOther}
                className="w-full bg-white border border-slate-200 rounded-xl p-4 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors h-44 font-sans leading-relaxed shadow-sm"
                placeholder="Ingresa los requerimientos, detalles o adjuntos en formato libre..."
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                onBlur={handleDescBlur}
              />
            </div>

            {/* Subtasks box */}
            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Subtareas internas</span>
                <span className="text-[10px] text-slate-500 font-mono font-semibold">
                  {task.subtasks.filter(s => s.isCompleted).length}/{task.subtasks.length} Completado
                </span>
              </div>

              {/* New subtask trigger form */}
              <div className="flex gap-2">
                <input 
                  type="text"
                  disabled={isLockedByOther}
                  placeholder="+ Agregar subtarea..."
                  className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 text-xs w-full text-slate-700 placeholder-slate-400 shadow-sm"
                  value={newSub}
                  onChange={(e) => setNewSub(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (newSub.trim()) {
                        addSubtask(task.id, newSub);
                        setNewSub('');
                      }
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={isLockedByOther || !newSub.trim()}
                  onClick={() => {
                    addSubtask(task.id, newSub);
                    setNewSub('');
                  }}
                  className="px-3 bg-indigo-600 hover:bg-indigo-550 text-indigo-50 font-bold rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-40 animate-none shadow-sm shadow-indigo-600/10 border border-indigo-500 leading-none"
                >
                  Agregar
                </button>
              </div>

              {/* Subtask listing */}
              <div className="space-y-1.5 mt-2 font-medium">
                {task.subtasks.map(sub => (
                  <div key={sub.id} className="flex items-center justify-between gap-3 p-1.5 rounded bg-white border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm">
                    <label className="flex items-center gap-2 cursor-pointer select-none flex-1">
                      <input 
                        type="checkbox"
                        disabled={isLockedByOther}
                        checked={sub.isCompleted}
                        onChange={() => toggleSubtask(task.id, sub.id)}
                        className="rounded border-slate-300 accent-indigo-600 w-3.5 h-3.5 mr-1 text-xs"
                      />
                      <span className={`text-xs text-slate-700 truncate ${sub.isCompleted ? 'line-through text-slate-400' : ''}`}>
                        {sub.title}
                      </span>
                    </label>
                    <button
                      type="button"
                      disabled={isLockedByOther}
                      onClick={() => deleteSubtask(task.id, sub.id)}
                      className="text-slate-400 hover:text-red-650 p-0.5 rounded transition-colors"
                      title="Quitar subtarea"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {task.subtasks.length === 0 && (
                  <span className="text-[10px] text-slate-400 italic block text-center py-2">Sin subtareas agregadas.</span>
                )}
              </div>
            </div>

            {/* Task dependencies choice list */}
            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block font-sans">Relaciones de Dependencia (Bloqueos)</span>
              <p className="text-[10px] text-slate-450 leading-normal">Marca qué otras tareas deben completarse obligatoriamente antes de poder comenzar esta tarea.</p>
              
              <div className="max-h-36 overflow-y-auto space-y-1.5 border border-slate-200 rounded-lg p-2.5 bg-white shadow-sm font-medium">
                {tasks.filter(t => t.id !== task.id).map(other => {
                  const isChecked = task.dependencies.includes(other.id);
                  return (
                    <label key={other.id} className="flex items-center justify-between p-1 hover:bg-slate-50 rounded cursor-pointer select-none">
                      <span className="flex items-center gap-2 truncate">
                        <input 
                          type="checkbox"
                          disabled={isLockedByOther}
                          checked={isChecked}
                          onChange={() => handleToggleDependency(other.id)}
                          className="rounded border-slate-300 text-indigo-600 accent-indigo-600 text-xs w-3.5 h-3.5 mr-1"
                        />
                        <span className="font-mono text-[9px] font-bold text-slate-400">{other.taskCode}</span>
                        <span className="text-xs text-slate-650 truncate max-w-sm group-hover:text-slate-800">{other.title}</span>
                      </span>
                    </label>
                  );
                })}
                {tasks.length <= 1 && (
                  <span className="text-[10px] text-slate-455 block text-center py-2 italic font-mono">No hay otras tareas en el proyecto para enlazar.</span>
                )}
              </div>
            </div>

          </div>

          {/* Column Right (Meta controls and activity updates log) */}
          <div className="w-full md:w-80 shrink-0 overflow-y-auto p-6 bg-slate-50 flex flex-col gap-6">
            
            {/* Workflow state selector */}
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Estado de Tarea</span>
              <select
                disabled={isLockedByOther}
                className="w-full bg-white border border-slate-200 text-xs text-slate-700 py-2 rounded-xl focus:outline-none focus:border-indigo-500 px-3 cursor-pointer shadow-sm font-semibold"
                value={task.statusId}
                onChange={(e) => updateTask({ ...task, statusId: e.target.value })}
              >
                {activeList.statuses.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Priority Selector */}
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Prioridad</span>
              <select
                disabled={isLockedByOther}
                className="w-full bg-white border border-slate-200 text-xs text-slate-700 py-2 rounded-xl focus:outline-none focus:border-indigo-500 px-3 cursor-pointer font-semibold shadow-sm"
                value={task.priority}
                onChange={(e) => updateTask({ ...task, priority: e.target.value as Task['priority'] })}
              >
                <option value="low">Low (Baja)</option>
                <option value="medium">Medium (Media)</option>
                <option value="high">High (Alta)</option>
                <option value="urgent">Urgent (Urgente!)</option>
              </select>
            </div>

            {/* Due Date selector */}
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Fecha Límite</span>
              <div className="relative">
                <input 
                  type="date"
                  disabled={isLockedByOther}
                  className="w-full bg-white border border-slate-200 text-xs text-slate-700 p-2 rounded-xl focus:outline-none font-semibold focus:border-indigo-505 shadow-sm select-all"
                  value={task.dueDate || ''}
                  onChange={(e) => updateTask({ ...task, dueDate: e.target.value })}
                />
              </div>
            </div>

            {/* Assignees Selector checklist */}
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Equipo Responsable</span>
              <div className="max-h-36 overflow-y-auto space-y-1.5 bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm font-medium">
                {users.map(u => {
                  const isAssigned = task.assignees.includes(u.id);
                  return (
                    <label key={u.id} className="flex items-center gap-2 cursor-pointer select-none group/u py-0.5">
                      <input 
                        type="checkbox"
                        disabled={isLockedByOther}
                        checked={isAssigned}
                        onChange={() => handleToggleAssignee(u.id)}
                        className="rounded border-slate-300 text-indigo-600 accent-indigo-600 text-xs w-3.5 h-3.5 mr-1"
                      />
                      <span className="w-4.5 h-4.5 rounded-full flex items-center justify-center text-[8px] font-bold text-white uppercase shrink-0" style={{ backgroundColor: u.avatarColor }}>
                        {u.name.charAt(0)}
                      </span>
                      <span className="text-xs text-slate-600 group-hover/u:text-slate-800 truncate">{u.name}</span>
                    </label>
                  );
                })}
                {users.length === 0 && (
                  <span className="text-[10px] text-slate-450 block text-center py-2">Registra miembros locales en la carpeta.</span>
                )}
              </div>
            </div>

            {/* Custom tags/etiquetas input pills */}
            <div className="space-y-2.5">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Etiquetas / Tags</span>
              
              {/* Add tag form */}
              <form onSubmit={handleAddTag} className="flex gap-1.5">
                <input 
                  type="text"
                  disabled={isLockedByOther}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] text-slate-700 placeholder-slate-400 focus:outline-none w-full uppercase shadow-sm"
                  placeholder="Escribir TAG..."
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                />
                <button 
                  type="submit" 
                  disabled={isLockedByOther || !newTag.trim()}
                  className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-550 transition-colors cursor-pointer disabled:opacity-40 shrink-0 border border-slate-200"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </form>

              {/* Tags listing */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {task.tags.map(tag => (
                  <span 
                    key={tag}
                    className="inline-flex items-center gap-1 text-[9px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-150 px-2 py-0.5 rounded-md font-mono shadow-sm"
                  >
                    #{tag}
                    <button
                      type="button"
                      disabled={isLockedByOther}
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-red-650 focus:outline-none cursor-pointer disabled:pointer-events-none font-bold"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {task.tags.length === 0 && (
                  <span className="text-[10px] text-slate-400 italic">Sin etiquetas.</span>
                )}
              </div>
            </div>

            {/* Activity Comments Log registry (visual feed) */}
            <div className="border-t border-slate-200 pt-5 space-y-3.5 flex-1 flex flex-col overflow-hidden min-h-[160px]">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Actividad & Notas</span>
              
              {/* Render activity feed */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {taskLogs.map(log => {
                  const logUser = users.find(u => u.id === log.userId);

                  return (
                    <div key={log.id} className="text-left text-[11px] leading-relaxed border-b border-slate-150 pb-2">
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <span 
                          className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold text-white uppercase shrink-0"
                          style={{ backgroundColor: logUser?.avatarColor || '#64748b' }}
                        >
                          {log.username.charAt(0)}
                        </span>
                        <strong className="text-slate-700 font-bold text-[10px] truncate max-w-[120px]">{log.username}</strong>
                        <span className="text-[10px] font-sans text-slate-450">{log.action}</span>
                      </div>
                      
                      {/* Optional comment text inside */}
                      {log.comment && (
                        <div className="mt-1.5 p-2 bg-white border border-slate-150 rounded-lg text-slate-650 font-sans break-words whitespace-pre-line leading-relaxed shadow-sm">
                          {log.comment.text}
                          
                          {/* Attachments rendering inside comment */}
                          {log.comment.attachments && log.comment.attachments.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {log.comment.attachments.map(attPath => {
                                const localUrl = resolvedMedia[attPath] || '';
                                const isVideoFile = attPath.endsWith('.mp4') || attPath.endsWith('.mov') || attPath.includes('video');
                                
                                return (
                                  <div key={attPath} className="rounded-lg overflow-hidden border border-slate-200 bg-slate-50 p-1 shadow-sm">
                                    {isVideoFile ? (
                                      <video src={localUrl} controls className="max-w-full rounded h-28 mx-auto border border-white" />
                                    ) : (
                                      <img src={localUrl} alt="Attached" className="max-w-full rounded max-h-24 mx-auto border border-white" referrerPolicy="no-referrer" />
                                    )}
                                    <span className="text-[8px] font-mono block text-center text-slate-400 py-0.5 truncate bg-white border-t border-slate-100">{attPath.split('/').pop()}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      <span className="text-[8px] font-mono text-slate-400 block text-right mt-1">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })}

                {taskLogs.length === 0 && (
                  <span className="text-[10px] text-slate-400 italic text-center block pt-4">Historial de comentarios vacío.</span>
                )}
              </div>

              {/* Compose and send comments form */}
              <form onSubmit={handleCommentSubmit} className="space-y-2 shrink-0 pt-2 border-t border-slate-200">
                <div className="flex gap-1">
                  <textarea
                    disabled={isLockedByOther}
                    className="w-full bg-white border border-slate-200 text-slate-700 placeholder-slate-400 rounded-lg p-2.5 text-xs focus:outline-none focus:border-indigo-500 h-14 resize-none leading-relaxed font-sans shadow-sm"
                    placeholder="Escribir una nota u opinión..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleCommentSubmit(e);
                      }
                    }}
                  />
                  <button 
                    type="submit"
                    disabled={isLockedByOther || (!newComment.trim() && commentFiles.length === 0)}
                    className="p-3 bg-indigo-600 hover:bg-indigo-550 border border-indigo-500 text-indigo-50 font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center shrink-0 disabled:opacity-40 shadow-sm shadow-indigo-600/10 leading-none"
                    title="Enviar nota"
                  >
                    <Send className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>

                {/* Upload attachment helper */}
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-slate-450 font-semibold truncate max-w-[150px]">
                    {commentFiles.length > 0 ? `📎 ${commentFiles.length} archivo(s) listos` : 'Vacío'}
                  </span>
                  <label className="cursor-pointer text-slate-500 hover:text-slate-800 transition-colors inline-block p-1 bg-white border border-slate-200 rounded-md shadow-sm">
                    <Paperclip className="w-3.5 h-3.5 text-slate-450" />
                    <input 
                      type="file"
                      accept="image/*,video/*"
                      onChange={handleCommentAttachment}
                      className="hidden"
                    />
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
