/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useUI } from '../lib/ui';
import { useProjectStore } from '../store';
import { Task, TaskStatus, TaskList } from '../types';
import { 
  Check, 
  ChevronDown, 
  ChevronRight, 
  Plus, 
  Trash2, 
  Calendar, 
  AlertCircle, 
  Maximize2, 
  FolderLock, 
  Edit,
  ArrowUp,
  ArrowDown,
  CircleDot,
  CheckCircle2,
  Table,
  Kanban,
  List as ListIcon,
  Settings as SettingsIcon,
  User,
  PlusCircle,
  Clock
} from 'lucide-react';

type ActiveViewTab = 'list' | 'kanban' | 'table' | 'settings';

export default function ListViews() {
  const { 
    lists, 
    tasks, 
    selectedListId, 
    users, 
    createTask, 
    updateTask, 
    deleteTask, 
    updateListConfig, 
    deleteList, 
    setSelectedTask,
    locks
  } = useProjectStore();
  const { toast, confirm, prompt: uiPrompt } = useUI();

  const [activeTab, setActiveTab] = useState<ActiveViewTab>('list');
  const [quickTitle, setQuickTitle] = useState('');
  const [quickPriority, setQuickPriority] = useState<Task['priority']>('medium');
  const [collapsedStatuses, setCollapsedStatuses] = useState<Record<string, boolean>>({});
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverStatusId, setDragOverStatusId] = useState<string | null>(null);

  const activeList = lists.find(l => l.id === selectedListId);

  if (!activeList) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-background text-muted-foreground font-body">
        <CircleDot className="w-12 h-12 text-muted-foreground mb-3 animate-pulse-slow" />
        <h2 className="text-sm font-semibold">Selecciona o crea una lista en la barra lateral para comenzar.</h2>
        <p className="text-xs text-muted-foreground mt-1">Todas las tareas se almacenan en tiempo real en formato JSON.</p>
      </div>
    );
  }

  const listTasks = tasks.filter(t => t.listId === activeList.id);

  const handleQuickTaskAdd = async (statusId: string, customTitle?: string) => {
    const titleVal = customTitle || quickTitle;
    if (!titleVal.trim()) return;
    try {
      await createTask(titleVal, activeList.id, statusId, quickPriority);
      if (!customTitle) setQuickTitle('');
    } catch (e) {
      toast('Error al crear tarea', 'error');
    }
  };

  const toggleStatusCollapse = (statusId: string) => {
    setCollapsedStatuses(prev => ({ ...prev, [statusId]: !prev[statusId] }));
  };

  const getPriorityBadgeColor = (p: Task['priority']) => {
    switch (p) {
      case 'low': return 'bg-secondary text-muted-foreground border-border';
      case 'medium': return 'bg-bento-blue-light text-bento-blue border-border';
      case 'high': return 'bg-bento-orange-light text-bento-orange border-bento-orange/30';
      case 'urgent': return 'bg-destructive/20 text-destructive border-destructive/40 animate-pulse';
    }
  };

  const getPriorityLabel = (p: Task['priority']) => {
    switch (p) {
      case 'low': return 'Baja';
      case 'medium': return 'Media';
      case 'high': return 'Alta';
      case 'urgent': return 'Urgente';
    }
  };

  const handleTaskDragStart = (e: React.DragEvent<HTMLDivElement>, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedTaskId(taskId);
  };

  const handleTaskDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverStatusId(null);
  };

  const handleStatusDragOver = (e: React.DragEvent<HTMLDivElement>, statusId: string) => {
    e.preventDefault();
    setDragOverStatusId(statusId);
  };

  const handleStatusDragLeave = (statusId: string) => {
    if (dragOverStatusId === statusId) {
      setDragOverStatusId(null);
    }
  };

  const handleStatusDrop = async (e: React.DragEvent<HTMLDivElement>, statusId: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    if (!taskId) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.statusId === statusId) {
      setDraggedTaskId(null);
      setDragOverStatusId(null);
      return;
    }
    try {
      await updateTask({ ...task, statusId });
    } catch (error) {
      toast('No se pudo mover la tarea', 'error');
    } finally {
      setDraggedTaskId(null);
      setDragOverStatusId(null);
    }
  };

  return (
    <div id="list-views-container" className="flex-1 flex flex-col h-full bg-background font-body overflow-hidden">
      
      {/* Workspace Ribbon Title & View Tabs Selector */}
      <div className="bg-card px-3 sm:px-6 pt-4 sm:pt-5 pb-0 border-b border-border shrink-0">
        <div className="flex flex-col gap-3 sm:gap-4 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: activeList.color }}></div>
            <h1 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2 font-heading truncate">
              {activeList.name}
            </h1>
            <span className="text-xs bg-secondary text-muted-foreground font-mono px-2 py-0.5 rounded-full border border-border shrink-0">
              {listTasks.length} {listTasks.length === 1 ? 'tarea' : 'tareas'}
            </span>
          </div>

          {activeTab !== 'settings' && (
            <div className="flex gap-2 items-center flex-wrap">
              <input
                id="quick-task-input"
                type="text"
                placeholder="Rápido: Nombrar tarea..."
                className="bg-card border border-input rounded-xl px-3 py-1.5 text-xs text-foreground placeholder-muted-foreground w-full sm:w-60 focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleQuickTaskAdd(activeList.statuses[0].id);
                }}
              />
              <select
                className="form-select bg-card border border-input rounded-xl px-3 py-1.5 text-xs text-foreground font-body focus:outline-none"
                value={quickPriority}
                onChange={(e) => setQuickPriority(e.target.value as Task['priority'])}
              >
                <option value="low">Prioridad Baja</option>
                <option value="medium">Prioridad Media</option>
                <option value="high">Prioridad Alta</option>
                <option value="urgent">Prioridad Urgente</option>
              </select>
              <button 
                onClick={() => handleQuickTaskAdd(activeList.statuses[0].id)}
                className="bg-primary hover:opacity-90 text-primary-foreground font-bold px-3 py-1.5 rounded-xl text-xs transition-colors flex items-center gap-1 shrink-0 shadow-card"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar
              </button>
            </div>
          )}
        </div>

        {/* List views select toggles */}
        <div className="flex gap-3 sm:gap-6 text-xs font-semibold text-muted-foreground overflow-x-auto">
          {(['list', 'kanban', 'table', 'settings'] as const).map(tab => {
            const icons = { list: ListIcon, kanban: Kanban, table: Table, settings: SettingsIcon };
            const labels = { list: 'Lista', kanban: 'Kanban', table: 'Tabla', settings: 'Config' };
            const Icon = icons[tab];
            return (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === tab ? 'text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {labels[tab]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Screen Render based on chosen view tab */}
      <div className="flex-1 overflow-auto p-3 sm:p-6">
        {activeTab === 'list' && (
          <div className="space-y-6">
            {activeList.statuses.map(status => {
              const statusTasks = listTasks.filter(t => t.statusId === status.id);
              const isCollapsed = collapsedStatuses[status.id];

              return (
                <div key={status.id} className="bg-card border border-border rounded-xl overflow-hidden shadow-card">
                  <div 
                    onClick={() => toggleStatusCollapse(status.id)}
                    className="flex items-center justify-between px-4 py-2.5 bg-secondary hover:bg-accent border-b border-border cursor-pointer transition-colors select-none"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: status.color }}></span>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                        {status.name}
                        <span className="text-[10px] bg-muted text-muted-foreground font-mono px-2 py-0.5 rounded-full">
                          {statusTasks.length}
                        </span>
                      </h3>
                    </div>
                    {isCollapsed ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>

                  {!isCollapsed && (
                    <div
                      className={`divide-y divide-border bg-card ${dragOverStatusId === status.id ? 'border-2 border-dashed border-primary bg-primary/5' : ''}`}
                      onDragOver={(e) => handleStatusDragOver(e, status.id)}
                      onDragLeave={() => handleStatusDragLeave(status.id)}
                      onDrop={(e) => handleStatusDrop(e, status.id)}
                    >
                      {statusTasks.map(task => {
                        const isLocked = locks[task.id] && Date.now() < locks[task.id].expiresAt;
                        const completeCount = task.subtasks.filter(s => s.isCompleted).length;
                        const totalCount = task.subtasks.length;
                        const pendingBlocked = task.dependencies.length > 0;

                        return (
                          <div 
                            key={task.id}
                            draggable={!locks[task.id] || Date.now() >= locks[task.id].expiresAt}
                            onDragStart={(e) => handleTaskDragStart(e, task.id)}
                            onDragEnd={handleTaskDragEnd}
                            className={`p-3.5 hover:bg-accent/50 flex items-center justify-between gap-4 transition-colors group ${isLocked ? 'cursor-not-allowed' : 'cursor-grab'}`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const alternateSt = activeList.statuses.find(s => s.isCompleted !== status.isCompleted);
                                  if (alternateSt) updateTask({ ...task, statusId: alternateSt.id });
                                }}
                                className={`w-5 h-5 rounded-full border transition-all flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 ${
                                  status.isCompleted 
                                    ? 'bg-bento-green-light border-bento-green text-bento-green' 
                                    : 'border-border hover:border-muted-foreground text-transparent hover:text-muted-foreground'
                                }`}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>

                              <div onClick={() => setSelectedTask(task.id)} className="cursor-pointer min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-mono text-[10px] font-bold text-muted-foreground shrink-0">{task.taskCode}</span>
                                  {pendingBlocked && (
                                    <span className="text-[9px] bg-destructive/20 text-destructive font-mono font-bold px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-0.5 border border-destructive/40">
                                      <AlertCircle className="w-2.5 h-2.5" /> Bloqueada
                                    </span>
                                  )}
                                  {isLocked && (
                                    <span className="text-[9px] bg-bento-yellow-light text-bento-yellow font-mono px-1.5 py-0.5 rounded flex items-center gap-0.5 border border-border">
                                      <FolderLock className="w-2.5 h-2.5" /> En Edición: @{locks[task.id].username}
                                    </span>
                                  )}
                                </div>
                                <h4 className={`text-xs font-semibold text-foreground group-hover:text-bento-blue truncate ${
                                  status.isCompleted ? 'line-through text-muted-foreground group-hover:text-muted-foreground' : ''
                                }`}>
                                  {task.title}
                                </h4>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              {totalCount > 0 && (
                                <span className="text-[10px] bg-secondary text-muted-foreground font-semibold px-2 py-0.5 rounded-full border border-border flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-bento-blue" />
                                  {completeCount}/{totalCount}
                                </span>
                              )}
                              {task.dueDate && (
                                <span className={`text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 font-semibold border ${
                                  new Date(task.dueDate) < new Date() && !status.isCompleted
                                    ? 'bg-destructive/20 text-destructive border-destructive/40'
                                    : 'bg-secondary text-muted-foreground border-border'
                                }`}>
                                  <Calendar className="w-3 h-3" />
                                  {task.dueDate}
                                </span>
                              )}
                              <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${getPriorityBadgeColor(task.priority)}`}>
                                {getPriorityLabel(task.priority)}
                              </span>
                              <div className="flex -space-x-1.5 overflow-hidden">
                                {task.assignees.map(userId => {
                                  const userObj = users.find(u => u.id === userId);
                                  return userObj ? (
                                    <span key={userId} className="w-5 h-5 rounded-full border-2 border-card flex items-center justify-center text-[8px] font-bold text-white uppercase shrink-0" style={{ backgroundColor: userObj.avatarColor }} title={userObj.name}>
                                      {userObj.name.charAt(0)}
                                    </span>
                                  ) : null;
                                })}
                              </div>
                              <button 
                                onClick={() => setSelectedTask(task.id)}
                                className="p-1 text-muted-foreground hover:text-bento-blue hover:bg-accent rounded transition-colors hidden group-hover:block"
                                title="Abrir ficha"
                              >
                                <Maximize2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {statusTasks.length === 0 && (
                        <div className="p-3 text-muted-foreground text-xs italic text-center">No hay tareas en este estado.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'kanban' && (
          <div className="flex gap-4 overflow-x-auto pb-4 items-start h-full" style={{ minHeight: '400px' }}>
            {activeList.statuses.map(status => {
              const statusTasks = listTasks.filter(t => t.statusId === status.id);
              return (
                <div
                  key={status.id}
                  className={`w-72 bg-card border border-border rounded-xl p-3 shrink-0 flex flex-col max-h-[85vh] shadow-card ${dragOverStatusId === status.id ? 'border-primary border-2 bg-primary/5' : ''}`}
                  onDragOver={(e) => handleStatusDragOver(e, status.id)}
                  onDragLeave={() => handleStatusDragLeave(status.id)}
                  onDrop={(e) => handleStatusDrop(e, status.id)}
                >
                  <div className="flex items-center justify-between pb-3 border-b border-border mb-3 shrink-0">
                    <div className="flex items-center gap-2 truncate">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: status.color }}></span>
                      <h4 className="text-xs font-bold text-foreground uppercase tracking-wide truncate">{status.name}</h4>
                      <span className="text-[10px] bg-secondary text-muted-foreground font-mono px-1.5 py-0.5 rounded border border-border">{statusTasks.length}</span>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2 mb-3 pr-1 min-h-[150px]">
                    {statusTasks.map(task => {
                      const isLocked = locks[task.id] && Date.now() < locks[task.id].expiresAt;
                      return (
                        <div 
                          key={task.id}
                          draggable={!isLocked}
                          onDragStart={(e) => handleTaskDragStart(e, task.id)}
                          onDragEnd={handleTaskDragEnd}
                          onClick={() => setSelectedTask(task.id)}
                          className={`bg-card hover:bg-accent/50 p-3 rounded-lg border border-border hover:border-bento-blue/40 transition-all ${isLocked ? 'cursor-not-allowed' : 'cursor-grab'} group shadow-card flex flex-col gap-2.5`}
                        >
                          <div className="flex items-center justify-between gap-2.5">
                            <span className="text-[9px] font-mono text-muted-foreground font-bold">{task.taskCode}</span>
                            <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border ${getPriorityBadgeColor(task.priority)}`}>
                              {getPriorityLabel(task.priority)}
                            </span>
                          </div>
                          <h5 className={`text-xs font-semibold text-foreground group-hover:text-bento-blue leading-snug break-words ${
                            status.isCompleted ? 'line-through text-muted-foreground' : ''
                          }`}>
                            {task.title}
                          </h5>
                          {isLocked && (
                            <span className="text-[8px] text-bento-yellow bg-bento-yellow-light p-1 rounded font-semibold inline-flex items-center gap-1 border border-border">
                              <FolderLock className="w-2.5 h-2.5" /> En edición: @{locks[task.id].username}
                            </span>
                          )}
                          {(task.dueDate || task.assignees.length > 0 || task.subtasks.length > 0) && (
                            <div className="flex items-center justify-between border-t border-border pt-2 shrink-0">
                              {task.subtasks.length > 0 ? (
                                <span className="text-[9px] text-muted-foreground font-mono">
                                  ✓ {task.subtasks.filter(s => s.isCompleted).length}/{task.subtasks.length}
                                </span>
                              ) : <span />}
                              <div className="flex items-center gap-1.5">
                                {task.dueDate && (
                                  <span className="text-[9px] text-muted-foreground font-semibold flex items-center gap-0.5">
                                    <Clock className="w-2.5 h-2.5" /> {task.dueDate.replace(/^\d{4}-/, '')}
                                  </span>
                                )}
                                <div className="flex -space-x-1 overflow-hidden">
                                  {task.assignees.map(userId => {
                                    const u = users.find(x => x.id === userId);
                                    return u ? (
                                      <span key={userId} className="w-4 h-4 rounded-full border border-card flex items-center justify-center text-[7px] font-bold text-white uppercase shrink-0" style={{ backgroundColor: u.avatarColor }}>
                                        {u.name.charAt(0)}
                                      </span>
                                    ) : null;
                                  })}
                                </div>
                              </div>
                            </div>
                          )}
                          <div className="border-t border-border pt-2 shrink-0 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-[8px] text-muted-foreground mr-1.5">Mover a:</span>
                            {activeList.statuses.filter(s => s.id !== status.id).map(s => (
                              <button
                                key={s.id}
                                onClick={(e) => { e.stopPropagation(); updateTask({ ...task, statusId: s.id }); }}
                                className="w-3 h-3 rounded-full hover:scale-110 active:scale-95 transition-transform"
                                style={{ backgroundColor: s.color }}
                                title={`Mover a ${s.name}`}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button 
                    onClick={async () => {
                      const name = await uiPrompt({ title: 'Crear tarea', placeholder: 'Nombre de la tarea' });
                      if (name && name.trim()) handleQuickTaskAdd(status.id, name);
                    }}
                    className="w-full py-1.5 bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground border border-border text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer font-bold leading-none shadow-card"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Crear tarea
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'table' && (
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary text-muted-foreground font-bold">
                    <th className="p-3 font-mono font-bold w-16 text-center">Código</th>
                    <th className="p-3">Título de la Tarea</th>
                    <th className="p-3 w-36">Estado</th>
                    <th className="p-3 w-28">Vencimiento</th>
                    <th className="p-3 w-28">Prioridad</th>
                    <th className="p-3 w-24">Asignados</th>
                    <th className="p-3 w-16 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {listTasks.map(task => {
                    const isLocked = locks[task.id] && Date.now() < locks[task.id].expiresAt;
                    return (
                      <tr key={task.id} className="hover:bg-accent/50 transition-colors">
                        <td className="p-3 font-mono text-[10px] font-bold text-muted-foreground text-center">{task.taskCode}</td>
                        <td className="p-3">
                          <button onClick={() => setSelectedTask(task.id)} className="font-semibold text-foreground hover:text-bento-blue text-left truncate hover:underline block cursor-pointer">
                            {task.title}
                          </button>
                          {isLocked && (
                            <span className="text-[8px] bg-bento-yellow-light text-bento-yellow rounded px-1.5 py-0.5 mt-0.5 inline-block border border-border">
                              🔒 @{locks[task.id].username} editando
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <select className="bg-card border border-input rounded px-2 py-0.5 text-[11px] text-foreground font-body focus:outline-none" value={task.statusId} onChange={(e) => updateTask({ ...task, statusId: e.target.value })}>
                            {activeList.statuses.map(s => (<option key={s.id} value={s.id}>{s.name.replace(/[^\w\s/]/g, '')}</option>))}
                          </select>
                        </td>
                        <td className="p-3">
                          <input type="date" className="bg-card border border-input text-foreground rounded px-2 py-0.5 text-[10px] focus:outline-none" value={task.dueDate || ''} onChange={(e) => updateTask({ ...task, dueDate: e.target.value })} />
                        </td>
                        <td className="p-3">
                          <select className="bg-card border border-input rounded px-1.5 py-0.5 text-[10px] text-foreground focus:outline-none uppercase font-bold tracking-wider" value={task.priority} onChange={(e) => updateTask({ ...task, priority: e.target.value as Task['priority'] })}>
                            <option value="low">Baja</option>
                            <option value="medium">Media</option>
                            <option value="high">Alta</option>
                            <option value="urgent">Urgente</option>
                          </select>
                        </td>
                        <td className="p-3">
                          <div className="flex -space-x-1.5 overflow-hidden">
                            {task.assignees.map(userId => {
                              const u = users.find(x => x.id === userId);
                              return u ? (
                                <span key={userId} className="w-5 h-5 rounded-full border-2 border-card flex items-center justify-center text-[8px] font-bold text-white uppercase shrink-0" style={{ backgroundColor: u.avatarColor }} title={u.name}>
                                  {u.name.charAt(0)}
                                </span>
                              ) : null;
                            })}
                            {task.assignees.length === 0 && <span className="text-[10px] text-muted-foreground italic">Libre</span>}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <button 
                            onClick={async () => { const ok = await confirm({ title: 'Eliminar tarea', message: '¿Eliminar esta tarea de forma permanente? Esta acción no se puede deshacer.', confirmLabel: 'Eliminar', variant: 'danger' }); if (ok) deleteTask(task.id); }}
                            className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors cursor-pointer"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {listTasks.length === 0 && (
                    <tr><td colSpan={7} className="p-6 text-center text-muted-foreground italic text-xs">No hay tareas en esta lista. Usa el campo de arriba para crear una.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <SettingsPanel activeList={activeList} updateListConfig={updateListConfig} deleteList={deleteList} />
        )}
      </div>
    </div>
  );
}

/* ====== Settings Panel Sub-component ====== */

const STATUS_COLORS = ['#d1d5db', '#2563eb', '#eab308', '#10b981', '#ef4444', '#8b5cf6', '#f97316', '#06b6d4', '#ec4899'];

function SettingsPanel({ activeList, updateListConfig, deleteList }: {
  activeList: TaskList;
  updateListConfig: (listId: string, name: string, color: string, statuses: TaskStatus[]) => Promise<void>;
  deleteList: (listId: string) => Promise<void>;
}) {
  const { toast, confirm } = useUI();
  const [listName, setListName] = useState(activeList.name);
  const [listColor, setListColor] = useState(activeList.color);
  const [statuses, setStatuses] = useState<TaskStatus[]>(activeList.statuses);
  const [newStatusName, setNewStatusName] = useState('');
  const [newStatusColor, setNewStatusColor] = useState('#6b7280');
  const [saving, setSaving] = useState(false);

  // Sync local state when active list changes
  useEffect(() => {
    setListName(activeList.name);
    setListColor(activeList.color);
    setStatuses(activeList.statuses);
  }, [activeList.id, activeList.statuses]);

  const hasChanges = listName !== activeList.name || listColor !== activeList.color || JSON.stringify(statuses) !== JSON.stringify(activeList.statuses);

  const handleSave = async () => {
    if (!listName.trim()) return;
    setSaving(true);
    try {
      await updateListConfig(activeList.id, listName, listColor, statuses);
    } catch (e) {
      toast('Error al guardar configuración', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusNameChange = (statusId: string, newName: string) => {
    setStatuses(prev => prev.map(s => s.id === statusId ? { ...s, name: newName } : s));
  };

  const handleStatusColorChange = (statusId: string, newColor: string) => {
    setStatuses(prev => prev.map(s => s.id === statusId ? { ...s, color: newColor } : s));
  };

  const handleStatusCompletedToggle = (statusId: string) => {
    setStatuses(prev => prev.map(s => s.id === statusId ? { ...s, isCompleted: !s.isCompleted } : s));
  };

  const handleRemoveStatus = (statusId: string) => {
    if (statuses.length <= 1) {
      toast('Debe haber al menos un estado en la lista.', 'warning');
      return;
    }
    setStatuses(prev => prev.filter(s => s.id !== statusId));
  };

  const handleAddStatus = () => {
    if (!newStatusName.trim()) return;
    const newStatus: TaskStatus = {
      id: crypto.randomUUID().slice(0, 8),
      name: newStatusName.trim(),
      color: newStatusColor,
      isCompleted: false
    };
    setStatuses(prev => [...prev, newStatus]);
    setNewStatusName('');
    setNewStatusColor('#6b7280');
  };

  return (
    <div className="max-w-xl space-y-6">
      <div className="bg-card border border-border rounded-xl p-5 shadow-card space-y-5">
        <h3 className="text-sm font-bold text-foreground font-heading">Configurar Lista</h3>
        <p className="text-xs text-muted-foreground">Edita el nombre, color de la lista y configura los estados del flujo de trabajo.</p>

        {/* List name and color */}
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Nombre de la Lista</label>
            <input 
              type="text"
              className="w-full bg-card border border-input rounded-lg px-3 py-2 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              placeholder="Nombre de la lista..."
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Color de la Lista</label>
            <div className="flex items-center gap-2">
              <input 
                type="color"
                className="w-8 h-8 rounded-lg border border-border cursor-pointer"
                value={listColor}
                onChange={(e) => setListColor(e.target.value)}
              />
              <span className="text-[10px] font-mono text-muted-foreground">{listColor}</span>
            </div>
          </div>
        </div>

        {/* Statuses editor */}
        <div className="space-y-3 pt-3 border-t border-border">
          <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Estados del Flujo de Trabajo</label>
          
          <div className="space-y-2">
            {statuses.map((st) => (
              <div key={st.id} className="flex items-center gap-2 bg-secondary p-2.5 rounded-lg border border-border">
                {/* Color picker */}
                <input 
                  type="color"
                  className="w-5 h-5 rounded-full border border-border cursor-pointer shrink-0"
                  value={st.color}
                  onChange={(e) => handleStatusColorChange(st.id, e.target.value)}
                  title="Color del estado"
                />
                
                {/* Name input */}
                <input 
                  type="text"
                  className="flex-1 bg-card border border-input rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  value={st.name}
                  onChange={(e) => handleStatusNameChange(st.id, e.target.value)}
                  placeholder="Nombre del estado"
                />
                
                {/* Is Completed toggle */}
                <button
                  type="button"
                  onClick={() => handleStatusCompletedToggle(st.id)}
                  className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider border transition-colors cursor-pointer shrink-0 ${
                    st.isCompleted
                      ? 'bg-bento-green-light text-bento-green border-bento-green/30'
                      : 'bg-secondary text-muted-foreground border-border hover:border-bento-green/50'
                  }`}
                  title={st.isCompleted ? 'Este estado marca la tarea como terminada' : 'Click para marcar como estado de terminación'}
                >
                  {st.isCompleted ? '✓ Terminado' : 'Activo'}
                </button>

                {/* Remove status */}
                <button
                  type="button"
                  onClick={() => handleRemoveStatus(st.id)}
                  className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors cursor-pointer shrink-0"
                  title="Eliminar estado"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Add new status */}
          <div className="flex items-center gap-2 pt-2">
            <input 
              type="color"
              className="w-5 h-5 rounded-full border border-border cursor-pointer shrink-0"
              value={newStatusColor}
              onChange={(e) => setNewStatusColor(e.target.value)}
            />
            <input 
              type="text"
              className="flex-1 bg-card border border-input rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              value={newStatusName}
              onChange={(e) => setNewStatusName(e.target.value)}
              placeholder="Nuevo estado..."
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddStatus(); }}
            />
            <button
              type="button"
              onClick={handleAddStatus}
              disabled={!newStatusName.trim()}
              className="px-3 py-1.5 bg-primary hover:opacity-90 text-primary-foreground rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar
            </button>
          </div>
        </div>

        {/* Save button */}
        <div className="flex gap-3 pt-3 border-t border-border">
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              hasChanges
                ? 'bg-primary hover:opacity-90 text-primary-foreground shadow-card'
                : 'bg-secondary text-muted-foreground cursor-not-allowed'
            }`}
          >
            {saving ? 'Guardando...' : hasChanges ? 'Guardar Cambios' : 'Sin cambios'}
          </button>
        </div>

        {/* Delete list */}
        <button
          onClick={async () => { const ok = await confirm({ title: 'Eliminar lista', message: '¿Eliminar esta lista y todas sus tareas asociadas? Esta acción es irreversible.', confirmLabel: 'Eliminar', variant: 'danger' }); if (ok) deleteList(activeList.id); }}
          className="w-full bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/30 rounded-xl py-2 text-xs font-semibold transition-colors cursor-pointer"
        >
          Eliminar lista completa
        </button>
      </div>
    </div>
  );
}
